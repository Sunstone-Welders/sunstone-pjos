// ============================================================================
// Send Payment Link SMS — POST /api/stripe/send-payment-sms
// ============================================================================
// Sends a Stripe Checkout URL to a customer's phone via Twilio.
// ============================================================================

export const runtime = 'nodejs';

import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { phone, url, tenantName, total } = await request.json();

    if (!phone || !url) {
      return NextResponse.json({ error: 'Missing phone or url' }, { status: 400 });
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_PHONE_NUMBER;

    if (!accountSid || !authToken || !from) {
      return NextResponse.json({ error: 'SMS not configured' }, { status: 500 });
    }

    const formattedTotal = total ? `$${Number(total).toFixed(2)}` : '';
    const body = `${tenantName || 'Your artist'} sent you a payment link${formattedTotal ? ` for ${formattedTotal}` : ''}. Tap to pay securely:\n${url}`;

    // Normalize phone number
    let normalized = phone.replace(/[^\d+]/g, '');
    if (!normalized.startsWith('+')) {
      normalized = '+1' + normalized;
    }

    const twilio = await import('twilio');
    const client = twilio.default(accountSid, authToken);

    await client.messages.create({
      to: normalized,
      from,
      body,
    });

    return NextResponse.json({ sent: true });
  } catch (error: any) {
    console.error('[Payment SMS] Error:', error);
    return NextResponse.json({ error: error.message || 'Failed to send SMS' }, { status: 500 });
  }
}
