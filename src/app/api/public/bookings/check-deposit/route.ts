// ============================================================================
// Public Booking Deposit Check — GET /api/public/bookings/check-deposit
// ============================================================================
// Polls deposit payment status for Square-based deposits (Square has no webhook
// push like Stripe). Authenticated by cancellation_token.
// Also works for Stripe deposits to provide a universal status endpoint.
// ============================================================================

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const bookingId = request.nextUrl.searchParams.get('bookingId');
    const token = request.nextUrl.searchParams.get('token');

    if (!bookingId || !token) {
      return NextResponse.json({ error: 'Missing bookingId or token' }, { status: 400 });
    }

    const db = await createServiceRoleClient();

    // Fetch booking — authenticate by cancellation_token
    const { data: booking, error } = await db
      .from('bookings')
      .select('id, tenant_id, deposit_status, deposit_payment_provider, square_order_id, deposit_paid_at')
      .eq('id', bookingId)
      .eq('cancellation_token', token)
      .single();

    if (error || !booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    // If already paid, return immediately
    if (booking.deposit_status === 'paid') {
      return NextResponse.json({ depositStatus: 'paid', depositPaidAt: booking.deposit_paid_at });
    }

    // If Square deposit is pending, poll the order status
    if (
      booking.deposit_payment_provider === 'square' &&
      booking.square_order_id &&
      booking.deposit_status === 'pending'
    ) {
      const { data: tenant } = await db
        .from('tenants')
        .select('square_access_token')
        .eq('id', booking.tenant_id)
        .single();

      if (tenant?.square_access_token) {
        const { Client, Environment } = require('square');
        const squareClient = new Client({
          accessToken: tenant.square_access_token,
          environment: process.env.SQUARE_ENVIRONMENT === 'production'
            ? Environment.Production
            : Environment.Sandbox,
        });

        try {
          const { result } = await squareClient.ordersApi.retrieveOrder(booking.square_order_id);
          if (result.order?.state === 'COMPLETED') {
            // Update booking deposit status
            await db
              .from('bookings')
              .update({
                deposit_status: 'paid',
                deposit_paid_at: new Date().toISOString(),
              })
              .eq('id', bookingId);

            return NextResponse.json({ depositStatus: 'paid', depositPaidAt: new Date().toISOString() });
          }
        } catch (sqErr: any) {
          console.error('[Check Deposit] Square order lookup failed:', sqErr);
        }
      }
    }

    return NextResponse.json({ depositStatus: booking.deposit_status });
  } catch (error: any) {
    console.error('[Check Deposit] Error:', error);
    return NextResponse.json({ error: 'Failed to check deposit status' }, { status: 500 });
  }
}
