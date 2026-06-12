// ============================================================================
// Send Deposit Link — POST /api/bookings/[id]/send-deposit
// ============================================================================
// Authenticated, tenant-scoped. Creates a fresh payment link for a booking
// deposit and sends it to the customer via SMS. Used by the artist dashboard.
// ============================================================================

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase, createServiceRoleClient } from '@/lib/supabase/server';
import { sendSMS } from '@/lib/twilio';
import { resolvePaymentProvider, createDepositPaymentLink } from '@/lib/deposit-utils';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // ── Auth ────────────────────────────────────────────────────────────────
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

    const svc = await createServiceRoleClient();

    // ── Fetch booking ─────────────────────────────────────────────────────
    const { data: booking, error } = await svc
      .from('bookings')
      .select('*, booking_types(name, deposit_required, deposit_amount)')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .single();

    if (error || !booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    if (booking.deposit_status === 'paid') {
      return NextResponse.json({ error: 'Deposit already paid' }, { status: 400 });
    }

    const depositAmount = booking.deposit_amount || booking.booking_types?.deposit_amount;
    if (!depositAmount || Number(depositAmount) <= 0) {
      return NextResponse.json({ error: 'No deposit amount configured' }, { status: 400 });
    }

    if (!booking.customer_phone) {
      return NextResponse.json({ error: 'No phone number on file for this customer' }, { status: 400 });
    }

    // ── Resolve payment provider ──────────────────────────────────────────
    const { data: tenant } = await svc
      .from('tenants')
      .select('id, name, default_payment_processor, stripe_account_id, square_access_token, square_location_id, dedicated_phone_number')
      .eq('id', tenantId)
      .single();

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    const provider = resolvePaymentProvider(tenant);
    if (!provider) {
      return NextResponse.json(
        { error: 'No payment processor connected. Go to Settings → Payments to connect Stripe or Square.' },
        { status: 400 }
      );
    }

    // ── Create payment link ───────────────────────────────────────────────
    const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://sunstonepj.app';
    const result = await createDepositPaymentLink({
      provider,
      tenant,
      amount: Number(depositAmount),
      metadata: {
        type: 'booking_deposit',
        referenceId: booking.id,
        tenantId,
      },
      successUrl: `${APP_URL}/booking/manage/${booking.cancellation_token}?deposit=success`,
      cancelUrl: `${APP_URL}/booking/manage/${booking.cancellation_token}?deposit=cancelled`,
    });

    // ── Update booking ────────────────────────────────────────────────────
    await svc
      .from('bookings')
      .update({
        deposit_amount: Number(depositAmount),
        deposit_status: 'pending',
        deposit_payment_provider: provider,
        ...(result.sessionId ? { stripe_checkout_session_id: result.sessionId } : {}),
        ...(result.orderId ? { square_order_id: result.orderId } : {}),
      })
      .eq('id', id);

    // ── Send SMS ──────────────────────────────────────────────────────────
    const formattedAmount = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(depositAmount));
    const businessName = tenant.name || 'your artist';
    const typeName = booking.booking_types?.name || 'Appointment';

    sendSMS({
      to: booking.customer_phone,
      body: `Hi ${booking.customer_name || 'there'}! ${businessName} has requested a ${formattedAmount} deposit for your ${typeName}. Pay securely here: ${result.paymentUrl}`,
      tenantId,
      skipConsentCheck: true,
    }).catch((err) => {
      console.error('[Send Deposit] SMS failed:', err);
    });

    return NextResponse.json({
      success: true,
      paymentUrl: result.paymentUrl,
      provider,
    });
  } catch (error: any) {
    console.error('[Send Deposit] Error:', error);
    return NextResponse.json({ error: 'Failed to send deposit link' }, { status: 500 });
  }
}
