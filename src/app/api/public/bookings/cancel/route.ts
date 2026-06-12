// ============================================================================
// Public Booking Cancel API — POST /api/public/bookings/cancel
// ============================================================================
// Cancels a booking by cancellation_token. Public, no auth required.
// Sends SMS to both customer and artist.
// ============================================================================

import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { sendSMS } from '@/lib/twilio';

export async function POST(request: Request) {
  const body = await request.json();
  const { token } = body;

  if (!token) {
    return NextResponse.json({ error: 'Missing token' }, { status: 400 });
  }

  const supabase = await createServiceRoleClient();

  // Look up booking by cancellation token
  const { data: booking, error } = await supabase
    .from('bookings')
    .select(`
      id,
      tenant_id,
      booking_type_id,
      start_time,
      end_time,
      status,
      customer_name,
      customer_phone
    `)
    .eq('cancellation_token', token)
    .single();

  if (error || !booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
  }

  if (booking.status === 'cancelled') {
    return NextResponse.json({ error: 'Booking is already cancelled' }, { status: 400 });
  }

  if (booking.status === 'completed' || booking.status === 'no_show') {
    return NextResponse.json({ error: 'This booking can no longer be cancelled' }, { status: 400 });
  }

  // Update status to cancelled
  const { error: updateError } = await supabase
    .from('bookings')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', booking.id);

  if (updateError) {
    console.error('Booking cancel failed:', updateError);
    return NextResponse.json({ error: 'Failed to cancel booking' }, { status: 500 });
  }

  // ── Send notifications (fire-and-forget) ──────────────────────────────────
  try {
    const { data: bookingType } = await supabase
      .from('booking_types')
      .select('name')
      .eq('id', booking.booking_type_id)
      .single();

    const { data: tenant } = await supabase
      .from('tenants')
      .select('name, phone')
      .eq('id', booking.tenant_id)
      .single();

    const typeName = bookingType?.name || 'appointment';
    const businessName = tenant?.name || 'your artist';
    const bookingDate = new Date(booking.start_time).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      timeZone: 'UTC',
    });
    const bookingTime = new Date(booking.start_time).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: 'UTC',
    });

    // A) Customer SMS
    if (booking.customer_phone) {
      const customerMsg =
        `Your booking for ${typeName} on ${bookingDate} at ${bookingTime} ` +
        `with ${businessName} has been cancelled.`;

      sendSMS({
        to: booking.customer_phone,
        body: customerMsg,
        tenantId: booking.tenant_id,
        skipConsentCheck: true,
      }).catch((err) => {
        console.error('[Cancel SMS] Customer notification failed:', err);
      });
    }

    // B) Artist SMS
    if (tenant?.phone) {
      const artistMsg =
        `Booking cancelled: ${booking.customer_name} cancelled their ` +
        `${typeName} on ${bookingDate} at ${bookingTime}.`;

      sendSMS({
        to: tenant.phone,
        body: artistMsg,
        tenantId: booking.tenant_id,
        skipConsentCheck: true,
      }).catch((err) => {
        console.error('[Cancel SMS] Artist notification failed:', err);
      });
    }
  } catch (notifErr) {
    console.error('[Cancel SMS] Notification setup failed:', notifErr);
  }

  return NextResponse.json({ success: true });
}
