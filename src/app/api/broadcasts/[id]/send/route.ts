import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { resolveAudience } from '@/lib/broadcasts';
import { renderTemplate } from '@/lib/templates';
import { checkRateLimit } from '@/lib/rate-limit';
import { logSmsCost, logEmailCost } from '@/lib/cost-tracker';
import { sendSMS as twilioSendSMS } from '@/lib/twilio';

const RATE_LIMIT = { prefix: 'broadcast-send', limit: 5, windowSeconds: 60 };

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Rate limit by user
  const rl = checkRateLimit(user.id, RATE_LIMIT);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  // Load broadcast
  const { data: broadcast } = await supabase
    .from('broadcasts')
    .select('*')
    .eq('id', id)
    .single();

  if (!broadcast) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (broadcast.status !== 'draft') {
    return NextResponse.json({ error: 'Broadcast has already been sent' }, { status: 400 });
  }

  // Mark as sending
  await supabase.from('broadcasts').update({ status: 'sending' }).eq('id', id);

  // Resolve message body/subject
  let messageBody = broadcast.custom_body || '';
  let messageSubject = broadcast.custom_subject || '';

  if (broadcast.template_id) {
    const { data: template } = await supabase
      .from('message_templates')
      .select('body, subject')
      .eq('id', broadcast.template_id)
      .single();
    if (template) {
      messageBody = template.body;
      messageSubject = template.subject || '';
    }
  }

  if (!messageBody || messageBody.trim().length === 0) {
    await supabase.from('broadcasts').update({ status: 'draft' }).eq('id', id);
    return NextResponse.json({ error: 'Message content cannot be empty.' }, { status: 400 });
  }

  // Load tenant
  const { data: tenant } = await supabase
    .from('tenants')
    .select('name, phone')
    .eq('id', broadcast.tenant_id)
    .single();

  // Resolve audience
  const audience = await resolveAudience(supabase, broadcast.tenant_id, broadcast.target_type, broadcast.target_id);

  if (audience.length === 0) {
    await supabase.from('broadcasts').update({ status: 'draft' }).eq('id', id);
    return NextResponse.json(
      { error: 'No recipients match this broadcast criteria. Check your segment filters.' },
      { status: 400 }
    );
  }

  // For SMS, check consent from most recent waiver
  const smsConsentMap: Record<string, boolean> = {};
  if (broadcast.channel === 'sms') {
    const clientIds = audience.map((c) => c.id);
    if (clientIds.length > 0) {
      const { data: waivers } = await supabase
        .from('waivers')
        .select('client_id, sms_consent')
        .in('client_id', clientIds)
        .order('created_at', { ascending: false });

      for (const w of waivers || []) {
        if (smsConsentMap[w.client_id] === undefined) {
          smsConsentMap[w.client_id] = w.sms_consent === true;
        }
      }
    }
  }

  let sentCount = 0;
  let failedCount = 0;
  let skippedCount = 0;

  for (const client of audience) {
    const name = [client.first_name, client.last_name].filter(Boolean).join(' ') || 'Client';
    const contactField = broadcast.channel === 'sms' ? client.phone : client.email;
    const hasContact = !!contactField;
    const hasConsent = broadcast.channel === 'sms' ? (smsConsentMap[client.id] ?? false) : true;

    // Skip if missing contact info or consent
    if (!hasContact || !hasConsent) {
      skippedCount++;
      await supabase.from('broadcast_messages').insert({
        broadcast_id: id,
        client_id: client.id,
        channel: broadcast.channel,
        recipient: contactField || 'none',
        rendered_subject: null,
        rendered_body: '',
        status: 'skipped',
        error_message: !hasContact ? 'Missing contact info' : 'No SMS consent',
      });
      continue;
    }

    // Render template with per-recipient variables
    const vars: Record<string, string> = {
      client_name: name,
      client_first_name: (client.first_name || 'Client'),
      business_name: tenant?.name || 'Business',
      business_phone: tenant?.phone || '',
    };

    const renderedBody = renderTemplate(messageBody, vars);
    const renderedSubject = messageSubject ? renderTemplate(messageSubject, vars) : null;

    try {
      if (broadcast.channel === 'sms') {
        const sid = await twilioSendSMS({ to: contactField!, body: renderedBody, tenantId: broadcast.tenant_id });
        // Write to conversations for two-way thread
        supabase.from('conversations').insert({
          tenant_id: broadcast.tenant_id,
          client_id: client.id,
          phone_number: contactField!,
          direction: 'outbound',
          body: renderedBody,
          twilio_sid: sid,
          status: 'delivered',
          read: true,
        }).then(null, () => {});
      } else {
        await sendEmail(contactField!, renderedSubject || 'Message from ' + (tenant?.name || 'Business'), renderedBody);
      }

      sentCount++;
      await supabase.from('broadcast_messages').insert({
        broadcast_id: id,
        client_id: client.id,
        channel: broadcast.channel,
        recipient: contactField!,
        rendered_subject: renderedSubject,
        rendered_body: renderedBody,
        status: 'sent',
        sent_at: new Date().toISOString(),
      });
    } catch (err: any) {
      failedCount++;
      await supabase.from('broadcast_messages').insert({
        broadcast_id: id,
        client_id: client.id,
        channel: broadcast.channel,
        recipient: contactField!,
        rendered_subject: renderedSubject,
        rendered_body: renderedBody,
        status: 'failed',
        error_message: err?.message || 'Send failed',
      });
    }

    // Small delay between messages to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  // Log broadcast cost (fire-and-forget, aggregate)
  if (sentCount > 0) {
    if (broadcast.channel === 'sms') {
      logSmsCost({ tenantId: broadcast.tenant_id, operation: 'sms_broadcast', segments: sentCount, metadata: { broadcast_id: id } });
    } else {
      logEmailCost({ tenantId: broadcast.tenant_id, operation: 'email_broadcast', count: sentCount, metadata: { broadcast_id: id } });
    }
  }

  // Update broadcast totals
  await supabase.from('broadcasts').update({
    status: failedCount === audience.length ? 'failed' : 'completed',
    total_recipients: audience.length,
    sent_count: sentCount,
    failed_count: failedCount,
    skipped_count: skippedCount,
    sent_at: new Date().toISOString(),
  }).eq('id', id);

  return NextResponse.json({
    status: 'completed',
    total: audience.length,
    sent: sentCount,
    failed: failedCount,
    skipped: skippedCount,
  });
}

// ── Email via Resend ────────────────────────────────────────────────────────

async function sendEmail(to: string, subject: string, body: string) {
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) {
    console.log(`[Broadcast Email Skipped] Would send to ${to}: ${subject}`);
    return; // Gracefully skip if not configured
  }

  const { Resend } = await import('resend');
  const resend = new Resend(process.env.RESEND_API_KEY);

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #374151;">
  ${body.split('\n').map((line) => `<p style="margin: 0 0 12px;">${line}</p>`).join('')}
</body></html>`;

  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL,
    to,
    subject,
    html,
  });

  if (error) throw new Error(error.message || 'Resend error');
}
