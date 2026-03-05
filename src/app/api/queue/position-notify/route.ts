// ============================================================================
// Queue Position Notify — src/app/api/queue/position-notify/route.ts
// ============================================================================
// POST: Send an SMS to a customer with their queue position and wait time.
// Called from the waiver check-in flow (public) and dashboard queue management.
// Derives tenantId from the queue entry itself — never trusts the client.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';
import { logSmsCost } from '@/lib/cost-tracker';
import { sendSMS } from '@/lib/twilio';

const RATE_LIMIT = { prefix: 'pos-notify', limit: 20, windowSeconds: 60 };

export async function POST(request: NextRequest) {
  try {
    // ── Rate limit by IP (public endpoint) ──────────────────────────────
    const ip = getClientIP(request);
    const rl = checkRateLimit(ip, RATE_LIMIT);
    if (!rl.allowed) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const { queueEntryId } = await request.json();

    if (!queueEntryId) {
      return NextResponse.json(
        { error: 'queueEntryId is required' },
        { status: 400 }
      );
    }

    const supabaseAdmin = await createServiceRoleClient();

    // Look up the queue entry — derive tenantId from DB, not from body
    const { data: entry, error: entryErr } = await supabaseAdmin
      .from('queue_entries')
      .select('id, tenant_id, name, phone, sms_consent, event_id, created_at')
      .eq('id', queueEntryId)
      .single();

    if (entryErr || !entry) {
      return NextResponse.json(
        { error: 'Queue entry not found' },
        { status: 404 }
      );
    }

    const tenantId = entry.tenant_id;

    // Skip if no SMS consent or no phone
    if (!entry.sms_consent) {
      return NextResponse.json({ sent: false, reason: 'no_sms_consent' });
    }
    if (!entry.phone) {
      return NextResponse.json({ sent: false, reason: 'no_phone' });
    }

    // Calculate position: count waiting entries ahead of this one
    let positionQuery = supabaseAdmin
      .from('queue_entries')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('status', 'waiting')
      .lt('created_at', entry.created_at);

    if (entry.event_id) {
      positionQuery = positionQuery.eq('event_id', entry.event_id);
    } else {
      positionQuery = positionQuery.is('event_id', null);
    }

    const { count } = await positionQuery;
    const position = (count || 0) + 1;

    // Get tenant's avg_service_minutes
    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('name, avg_service_minutes')
      .eq('id', tenantId)
      .single();

    const avgMinutes = tenant?.avg_service_minutes || 10;
    const estimatedWait = position * avgMinutes;
    const firstName = entry.name.split(' ')[0];

    // Build message
    let message: string;
    if (position === 1) {
      message = `Hi ${firstName}! You're checked in and next up! We'll text you the moment we're ready for you.`;
    } else {
      message = `Hi ${firstName}! You're checked in and #${position} in line. Estimated wait: about ${estimatedWait} minutes. We'll text you when it's your turn!`;
    }

    const sid = await sendSMS({ to: entry.phone, body: message, tenantId });

    if (!sid) {
      return NextResponse.json({ sent: false, reason: 'twilio_not_configured', position, estimatedWait });
    }

    // Log SMS cost (fire-and-forget)
    logSmsCost({ tenantId, operation: 'sms_position_notify' });

    // Log to message_log (fire-and-forget)
    supabaseAdmin.from('message_log').insert({
      tenant_id: tenantId,
      direction: 'outbound',
      channel: 'sms',
      recipient_phone: entry.phone,
      body: message,
      source: 'queue_position',
      status: 'sent',
    }).then(null, () => {});

    return NextResponse.json({
      sent: true,
      sid,
      position,
      estimatedWait,
    });
  } catch (error: any) {
    console.error('Position SMS Error:', error);
    return NextResponse.json({ error: 'Failed to send notification' }, { status: 500 });
  }
}
