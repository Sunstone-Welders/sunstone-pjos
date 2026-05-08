// ============================================================================
// Venmo Send Link — POST /api/venmo/send-link
// ============================================================================
// Sends a Venmo deep link to a customer via SMS using Twilio.
// The link opens the artist's Venmo profile — the customer then sends payment.
// Artist manually confirms payment receipt in the POS.
// ============================================================================

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { sendSMS, normalizePhone } from '@/lib/twilio';

export async function POST(request: NextRequest) {
  try {
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

    const { phone, venmoUsername, amount, businessName } = await request.json();

    if (!phone || !venmoUsername || !amount) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Build Venmo HTTPS URL (works on mobile — opens Venmo app if installed)
    const cleanUsername = venmoUsername.replace(/^@/, '');
    const note = encodeURIComponent(`Payment to ${businessName || 'merchant'}`);
    const venmoUrl = `https://venmo.com/u/${cleanUsername}?txn=pay&amount=${Number(amount).toFixed(2)}&note=${note}`;

    // Compose SMS message
    const formattedAmount = `$${Number(amount).toFixed(2)}`;
    const smsBody = `Pay ${formattedAmount} to ${businessName || 'your artist'} via Venmo: ${venmoUrl}`;

    const normalizedPhone = normalizePhone(phone);
    const sid = await sendSMS({
      to: normalizedPhone,
      body: smsBody,
      tenantId: member.tenant_id,
      skipConsentCheck: true,
    });

    return NextResponse.json({ sent: !!sid, sid });
  } catch (error: any) {
    console.error('[Venmo Send Link] Error:', error);
    return NextResponse.json(
      { error: 'Failed to send Venmo link' },
      { status: 500 }
    );
  }
}
