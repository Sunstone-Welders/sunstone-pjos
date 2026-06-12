// ============================================================================
// Public Deposit Link Creation — POST /api/public/bookings/create-deposit-link
// ============================================================================
// Creates a fresh payment link for a booking deposit. Authenticated by
// cancellation_token (same as manage/cancel/reschedule).
// Used by ManageBookingPage when customer wants to pay a pending deposit.
// ============================================================================

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { resolvePaymentProvider, createDepositPaymentLink } from '@/lib/deposit-utils';

export async function POST(request: NextRequest) {
  try {
    const { bookingId, token } = await request.json();

    if (!bookingId || !token) {
      return NextResponse.json({ error: 'Missing bookingId or token' }, { status: 400 });
    }

    const db = await createServiceRoleClient();

    // Fetch booking — authenticate by cancellation_token
    const { data: booking, error } = await db
      .from('bookings')
      .select('id, tenant_id, deposit_amount, deposit_status, cancellation_token, booking_type_id')
      .eq('id', bookingId)
      .eq('cancellation_token', token)
      .single();

    if (error || !booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    if (booking.deposit_status === 'paid') {
      return NextResponse.json({ error: 'Deposit already paid' }, { status: 400 });
    }

    if (!booking.deposit_amount || Number(booking.deposit_amount) <= 0) {
      return NextResponse.json({ error: 'No deposit required' }, { status: 400 });
    }

    // Fetch tenant payment credentials
    const { data: tenant } = await db
      .from('tenants')
      .select('id, name, default_payment_processor, stripe_account_id, square_access_token, square_location_id')
      .eq('id', booking.tenant_id)
      .single();

    if (!tenant) {
      return NextResponse.json({ error: 'Business not found' }, { status: 404 });
    }

    const provider = resolvePaymentProvider(tenant);
    if (!provider) {
      return NextResponse.json(
        { error: 'No payment method available. Please contact the business directly.' },
        { status: 400 }
      );
    }

    const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://sunstonepj.app';
    const result = await createDepositPaymentLink({
      provider,
      tenant,
      amount: Number(booking.deposit_amount),
      metadata: {
        type: 'booking_deposit',
        referenceId: booking.id,
        tenantId: booking.tenant_id,
      },
      successUrl: `${APP_URL}/booking/manage/${booking.cancellation_token}?deposit=success`,
      cancelUrl: `${APP_URL}/booking/manage/${booking.cancellation_token}?deposit=cancelled`,
    });

    // Update booking with new payment info
    await db
      .from('bookings')
      .update({
        deposit_status: 'pending',
        deposit_payment_provider: provider,
        ...(result.sessionId ? { stripe_checkout_session_id: result.sessionId } : {}),
        ...(result.orderId ? { square_order_id: result.orderId } : {}),
      })
      .eq('id', booking.id);

    return NextResponse.json({ paymentUrl: result.paymentUrl });
  } catch (error: any) {
    console.error('[Create Deposit Link] Error:', error);
    return NextResponse.json({ error: 'Failed to create deposit link' }, { status: 500 });
  }
}
