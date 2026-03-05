// ============================================================================
// Send Message — src/app/api/clients/send-message/route.ts
// ============================================================================
// POST: Send an SMS or email to a client. Derives tenantId from the caller's
// session and verifies the client belongs to that tenant.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { renderTemplate } from '@/lib/templates';
import { checkRateLimit } from '@/lib/rate-limit';
import { logSmsCost, logEmailCost } from '@/lib/cost-tracker';
import { sendSMS } from '@/lib/twilio';

const RATE_LIMIT = { prefix: 'send-msg', limit: 30, windowSeconds: 60 };

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Rate limit by user
  const rl = checkRateLimit(user.id, RATE_LIMIT);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  // Derive tenant from session — ignore body's tenantId
  const { data: member } = await supabase
    .from('tenant_members')
    .select('tenant_id')
    .eq('user_id', user.id)
    .limit(1)
    .single();

  if (!member) return NextResponse.json({ error: 'No tenant membership' }, { status: 403 });
  const tenantId = member.tenant_id;

  const body = await request.json();
  const { clientId, channel, subject, message } = body;

  const trimmedMessage = message?.trim();
  if (!clientId || !channel || !trimmedMessage) {
    return NextResponse.json({ error: 'clientId, channel, and message are required' }, { status: 400 });
  }

  // Enforce message length limits
  const MAX_SMS_LENGTH = 1600;
  const MAX_EMAIL_LENGTH = 50000;
  const maxLen = channel === 'sms' ? MAX_SMS_LENGTH : MAX_EMAIL_LENGTH;
  if (trimmedMessage.length > maxLen) {
    return NextResponse.json(
      { error: `Message too long. ${channel === 'sms' ? 'SMS' : 'Email'} limit is ${maxLen.toLocaleString()} characters.` },
      { status: 400 }
    );
  }

  // Fetch client AND verify it belongs to this tenant
  const { data: client } = await supabase
    .from('clients')
    .select('first_name, last_name, email, phone')
    .eq('id', clientId)
    .eq('tenant_id', tenantId)
    .single();

  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 });

  // Fetch tenant info for template variables
  const { data: tenant } = await supabase
    .from('tenants')
    .select('name, phone')
    .eq('id', tenantId)
    .single();

  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

  // Resolve template variables
  const variables: Record<string, string> = {
    client_name: `${client.first_name || ''} ${client.last_name || ''}`.trim(),
    client_first_name: client.first_name || '',
    business_name: tenant.name || '',
    business_phone: tenant.phone || '',
  };

  const resolvedMessage = renderTemplate(trimmedMessage, variables);
  const resolvedSubject = subject ? renderTemplate(subject, variables) : '';

  try {
    if (channel === 'sms') {
      if (!client.phone) return NextResponse.json({ error: 'Client has no phone number' }, { status: 400 });
      const sid = await sendSMS({ to: client.phone, body: resolvedMessage, tenantId });
      logSmsCost({ tenantId, operation: 'sms_direct' });

      // Write to conversations table for two-way SMS thread
      supabase.from('conversations').insert({
        tenant_id: tenantId,
        client_id: clientId,
        phone_number: client.phone,
        direction: 'outbound',
        body: resolvedMessage,
        twilio_sid: sid,
        status: 'delivered',
        read: true,
      }).then(null, () => {});

      // Update client's last_message_at
      supabase.from('clients').update({ last_message_at: new Date().toISOString() }).eq('id', clientId).then(null, () => {});
    } else if (channel === 'email') {
      if (!client.email) return NextResponse.json({ error: 'Client has no email address' }, { status: 400 });
      await sendEmail(client.email, resolvedSubject || 'Message from ' + tenant.name, resolvedMessage);
      logEmailCost({ tenantId, operation: 'email_direct' });
    } else {
      return NextResponse.json({ error: 'Invalid channel' }, { status: 400 });
    }

    // Log to message_log (fire-and-forget)
    supabase.from('message_log').insert({
      tenant_id: tenantId,
      client_id: clientId,
      direction: 'outbound',
      channel,
      recipient_email: channel === 'email' ? client.email : null,
      recipient_phone: channel === 'sms' ? client.phone : null,
      subject: channel === 'email' ? (resolvedSubject || 'Message from ' + tenant.name) : null,
      body: resolvedMessage,
      source: 'manual',
      status: 'sent',
    }).then(null, () => {});

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Send message error:', err);
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 });
  }
}

// ── Email via Resend ────────────────────────────────────────────────────────

async function sendEmail(to: string, subject: string, body: string) {
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) {
    console.log(`[Direct Email Skipped] Would send to ${to}: ${subject}`);
    return;
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
