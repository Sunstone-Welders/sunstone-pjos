// ============================================================================
// Send Payment Link SMS — POST /api/stripe/send-payment-sms
// ============================================================================
// Sends a Stripe Checkout URL to a customer's phone via Twilio.
// ============================================================================

export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { sendSMS } from '@/lib/twilio';

export async function POST(request: Request) {
  try {
    const { phone, url, tenantName, total, tenantId } = await request.json();

    if (!phone || !url) {
      return NextResponse.json({ error: 'Missing phone or url' }, { status: 400 });
    }

    const formattedTotal = total ? `$${Number(total).toFixed(2)}` : '';
    const body = `${tenantName || 'Your artist'} sent you a payment link${formattedTotal ? ` for ${formattedTotal}` : ''}. Tap to pay securely:\n${url}`;

    const sid = await sendSMS({ to: phone, body, tenantId: tenantId || undefined });

    if (!sid) {
      return NextResponse.json({ error: 'SMS not configured' }, { status: 500 });
    }

    return NextResponse.json({ sent: true });
  } catch (error: any) {
    console.error('[Payment SMS] Error:', error);
    return NextResponse.json({ error: error.message || 'Failed to send SMS' }, { status: 500 });
  }
}
