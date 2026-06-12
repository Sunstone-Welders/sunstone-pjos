// ============================================================================
// Public Booking Reschedule API — POST /api/public/bookings/reschedule
// ============================================================================
// Reschedules a booking to a new time slot. Public, no auth required.
// Re-checks availability (same conflict logic as create route).
// Sends SMS to both customer and artist.
// ============================================================================

import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { sendSMS } from '@/lib/twilio';

export async function POST(request: Request) {
  const body = await request.json();
  const { token, newStartTime } = body;

  if (!token || !newStartTime) {
    return NextResponse.json(
      { error: 'Missing required fields: token, newStartTime' },
      { status: 400 }
    );
  }

  const newStart = new Date(newStartTime);
  if (isNaN(newStart.getTime())) {
    return NextResponse.json({ error: 'Invalid newStartTime' }, { status: 400 });
  }

  // Reject times in the past
  if (newStart.getTime() < Date.now() - 5 * 60 * 1000) {
    return NextResponse.json({ error: 'Cannot reschedule to a time in the past' }, { status: 400 });
  }

  const supabase = await createServiceRoleClient();

  // ── Look up booking ─────────────────────────────────────────────────────────
  const { data: booking, error } = await supabase
    .from('bookings')
    .select(`
      id,
      tenant_id,
      booking_type_id,
      staff_id,
      start_time,
      end_time,
      status,
      customer_name,
      customer_phone,
      cancellation_token
    `)
    .eq('cancellation_token', token)
    .single();

  if (error || !booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
  }

  if (booking.status === 'cancelled') {
    return NextResponse.json({ error: 'Cannot reschedule a cancelled booking' }, { status: 400 });
  }

  if (booking.status === 'completed' || booking.status === 'no_show') {
    return NextResponse.json({ error: 'This booking can no longer be modified' }, { status: 400 });
  }

  // ── Fetch booking type ────────────────────────────────────────────────────
  const { data: bookingType } = await supabase
    .from('booking_types')
    .select('id, name, duration_minutes, buffer_before_minutes, buffer_after_minutes')
    .eq('id', booking.booking_type_id)
    .single();

  if (!bookingType) {
    return NextResponse.json({ error: 'Booking type not found' }, { status: 404 });
  }

  // Calculate new end time
  const newEnd = new Date(newStart.getTime() + bookingType.duration_minutes * 60 * 1000);

  // ── Re-check availability (conflict check) ────────────────────────────────
  const bufferBefore = bookingType.buffer_before_minutes;
  const bufferAfter = bookingType.buffer_after_minutes;

  const footprintStart = new Date(newStart.getTime() - bufferBefore * 60 * 1000);
  const footprintEnd = new Date(newEnd.getTime() + bufferAfter * 60 * 1000);

  // Check for conflicting bookings (exclude this booking and cancelled ones)
  let conflictQuery = supabase
    .from('bookings')
    .select('id, start_time, end_time, booking_type_id')
    .eq('tenant_id', booking.tenant_id)
    .not('status', 'eq', 'cancelled')
    .neq('id', booking.id) // Exclude current booking from conflict check
    .lt('start_time', footprintEnd.toISOString())
    .gt('end_time', footprintStart.toISOString());

  if (booking.staff_id) {
    conflictQuery = conflictQuery.eq('staff_id', booking.staff_id);
  }

  const { data: conflicts } = await conflictQuery;

  if (conflicts && conflicts.length > 0) {
    // Double-check with buffer math for each conflict
    const { data: conflictTypes } = await supabase
      .from('booking_types')
      .select('id, buffer_before_minutes, buffer_after_minutes')
      .in('id', conflicts.map((c) => c.booking_type_id));

    const bufferMap: Record<string, { before: number; after: number }> = {};
    for (const ct of conflictTypes || []) {
      bufferMap[ct.id] = { before: ct.buffer_before_minutes, after: ct.buffer_after_minutes };
    }

    for (const conflict of conflicts) {
      const cBuf = bufferMap[conflict.booking_type_id] || { before: 0, after: 0 };
      const cStart = new Date(conflict.start_time).getTime() - cBuf.before * 60 * 1000;
      const cEnd = new Date(conflict.end_time).getTime() + cBuf.after * 60 * 1000;

      if (footprintStart.getTime() < cEnd && footprintEnd.getTime() > cStart) {
        return NextResponse.json(
          { error: 'This time slot is no longer available. Please choose another time.' },
          { status: 409 }
        );
      }
    }
  }

  // Also check event conflicts
  const { data: eventConflicts } = await supabase
    .from('events')
    .select('id')
    .eq('tenant_id', booking.tenant_id)
    .eq('is_active', true)
    .lte('start_time', newEnd.toISOString())
    .or(`end_time.is.null,end_time.gte.${newStart.toISOString()}`);

  if (eventConflicts && eventConflicts.length > 0) {
    return NextResponse.json(
      { error: 'This time slot conflicts with a scheduled event. Please choose another time.' },
      { status: 409 }
    );
  }

  // ── Update booking ──────────────────────────────────────────────────────────
  const { data: updated, error: updateError } = await supabase
    .from('bookings')
    .update({
      start_time: newStart.toISOString(),
      end_time: newEnd.toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', booking.id)
    .select('*')
    .single();

  if (updateError) {
    console.error('Booking reschedule failed:', updateError);
    return NextResponse.json({ error: 'Failed to reschedule booking' }, { status: 500 });
  }

  // ── Send notifications (fire-and-forget) ──────────────────────────────────
  try {
    const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://sunstonepj.app';

    const { data: tenant } = await supabase
      .from('tenants')
      .select('name, phone')
      .eq('id', booking.tenant_id)
      .single();

    const businessName = tenant?.name || 'your artist';
    const newDate = newStart.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      timeZone: 'UTC',
    });
    const newTime = newStart.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: 'UTC',
    });
    const manageLink = `${APP_URL}/booking/manage/${booking.cancellation_token}`;

    // A) Customer SMS
    if (booking.customer_phone) {
      const customerMsg =
        `Your booking has been rescheduled!\n` +
        `${bookingType.name} with ${businessName}\n` +
        `New time: ${newDate} at ${newTime}\n` +
        `To cancel or reschedule: ${manageLink}`;

      sendSMS({
        to: booking.customer_phone,
        body: customerMsg,
        tenantId: booking.tenant_id,
        skipConsentCheck: true,
      }).catch((err) => {
        console.error('[Reschedule SMS] Customer notification failed:', err);
      });
    }

    // B) Artist SMS
    if (tenant?.phone) {
      const artistMsg =
        `Booking rescheduled: ${booking.customer_name} moved their ` +
        `${bookingType.name} to ${newDate} at ${newTime}.`;

      sendSMS({
        to: tenant.phone,
        body: artistMsg,
        tenantId: booking.tenant_id,
        skipConsentCheck: true,
      }).catch((err) => {
        console.error('[Reschedule SMS] Artist notification failed:', err);
      });
    }
  } catch (notifErr) {
    console.error('[Reschedule SMS] Notification setup failed:', notifErr);
  }

  return NextResponse.json({ booking: updated });
}
