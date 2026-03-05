import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';
import { logSmsCost } from '@/lib/cost-tracker';
import { sendSMS } from '@/lib/twilio';

const RATE_LIMIT = { prefix: 'queue-notify', limit: 10, windowSeconds: 60 };

export async function POST(request: NextRequest) {
  try {
    // Rate limit by IP (public endpoint)
    const ip = getClientIP(request);
    const rl = checkRateLimit(ip, RATE_LIMIT);
    if (!rl.allowed) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const body = await request.json();
    const { phone, name, tenantName, tenantId, smsConsent } = body;

    if (!phone) {
      return NextResponse.json({ error: 'Phone number required' }, { status: 400 });
    }

    // Check SMS consent — if explicitly false, skip sending
    if (smsConsent === false) {
      console.log(`[SMS Skipped] ${name} did not consent to SMS`);
      return NextResponse.json({ sent: false, reason: 'no_sms_consent' });
    }

    const smsBody = `Hi ${name}! You're next at the ${tenantName || 'Sunstone'} booth. Please head over now!`;
    const sid = await sendSMS({ to: phone, body: smsBody, tenantId: tenantId || undefined });

    if (!sid) {
      return NextResponse.json({ sent: false, reason: 'Twilio not configured' });
    }

    // Log SMS cost (fire-and-forget)
    if (tenantId) {
      logSmsCost({ tenantId, operation: 'sms_queue_notify' });
    }

    // Log to message_log (fire-and-forget)
    if (tenantId) {
      import('@/lib/supabase/server').then(({ createServiceRoleClient }) =>
        createServiceRoleClient().then(svc =>
          svc.from('message_log').insert({
            tenant_id: tenantId,
            direction: 'outbound',
            channel: 'sms',
            recipient_phone: phone,
            body: smsBody,
            source: 'queue_notify',
            status: 'sent',
          })
        )
      ).catch(() => {});
    }

    return NextResponse.json({ sent: true, sid });
  } catch (error: any) {
    console.error('SMS Error:', error);
    return NextResponse.json({ error: 'Failed to send notification' }, { status: 500 });
  }
}
