// ============================================================================
// Send Payment Link SMS — POST /api/stripe/send-payment-sms
// ============================================================================
// Sends a Stripe Checkout URL to a customer's phone via Twilio.
// SECURITY: Auth required. Tenant derived from session.
// ============================================================================

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { sendSMS } from '@/lib/twilio';

export async function POST(request: NextRequest) {
  try {
    // ── Auth check ──────────────────────────────────────────────────────
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: member } = await supabase
      .from('tenant_members')
      .select('tenant_id')
      .eq('user_id', user.id)
      .limit(1)
      .single();
    if (!member) return NextResponse.json({ error: 'No tenant membership' }, { status: 403 });

    const tenantId = member.tenant_id;

    const { phone, url, sessionId, tenantName, total } = await request.json();

    if (!phone || (!url && !sessionId)) {
      return NextResponse.json({ error: 'Missing phone or payment URL' }, { status: 400 });
    }

    // Build a clean redirect URL that won't be truncated by iOS Messages.
    // Stripe Checkout URLs contain # fragments which iOS truncates in SMS.
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://sunstonepj.app';
    const paymentUrl = sessionId ? `${baseUrl}/pay/${sessionId}` : url;

    const formattedTotal = total ? `$${Number(total).toFixed(2)}` : '';
    const body = `${tenantName || 'Your artist'} sent you a payment link${formattedTotal ? ` for ${formattedTotal}` : ''}. Tap to pay securely:\n${paymentUrl}`;

    const sid = await sendSMS({ to: phone, body, tenantId });

    if (!sid) {
      return NextResponse.json({ error: 'SMS not configured' }, { status: 500 });
    }

    return NextResponse.json({ sent: true });
  } catch (error: any) {
    console.error('[Payment SMS] Error:', error);
    return NextResponse.json({ error: 'Failed to send SMS' }, { status: 500 });
  }
}
