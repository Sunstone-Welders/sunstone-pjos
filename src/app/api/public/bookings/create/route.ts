// ============================================================================
// Public Booking Creation API — POST /api/public/bookings/create
// ============================================================================
// Creates a new booking. Public, no auth required.
// Uses service role to bypass RLS (same pattern as party-requests/waiver).
// Re-checks slot availability before insert to prevent double-booking.
// ============================================================================

import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';
import { normalizePhone, sendSMS } from '@/lib/twilio';
import { resolvePaymentProvider, createDepositPaymentLink } from '@/lib/deposit-utils';

export async function POST(request: Request) {
  // Rate limit: 10 per hour per IP
  const ip = getClientIP(request);
  const rl = checkRateLimit(ip, { prefix: 'booking-create', limit: 10, windowSeconds: 3600 });
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
  }

  const body = await request.json();
  const {
    tenantId,
    bookingTypeId,
    startTime,
    customerName,
    customerPhone,
    customerEmail,
    notes,
    staffId,
  } = body;

  // ── Validate required fields ──────────────────────────────────────────────
  if (!tenantId || !bookingTypeId || !startTime || !customerName || !customerPhone) {
    return NextResponse.json(
      { error: 'Missing required fields: tenantId, bookingTypeId, startTime, customerName, customerPhone' },
      { status: 400 }
    );
  }

  const supabase = await createServiceRoleClient();

  // ── Fetch booking type ────────────────────────────────────────────────────
  const { data: bookingType, error: btError } = await supabase
    .from('booking_types')
    .select('id, tenant_id, name, duration_minutes, buffer_before_minutes, buffer_after_minutes, booking_mode, price, deposit_amount, deposit_required, is_active, staff_id')
    .eq('id', bookingTypeId)
    .eq('tenant_id', tenantId)
    .single();

  if (btError || !bookingType) {
    return NextResponse.json({ error: 'Booking type not found' }, { status: 404 });
  }

  if (!bookingType.is_active) {
    return NextResponse.json({ error: 'This booking type is no longer available' }, { status: 400 });
  }

  // ── Calculate end_time ────────────────────────────────────────────────────
  const start = new Date(startTime);
  if (isNaN(start.getTime())) {
    return NextResponse.json({ error: 'Invalid startTime' }, { status: 400 });
  }

  // Reject bookings in the past
  if (start.getTime() < Date.now() - 5 * 60 * 1000) {
    return NextResponse.json({ error: 'Cannot book a time in the past' }, { status: 400 });
  }

  const endTime = new Date(start.getTime() + bookingType.duration_minutes * 60 * 1000);
  const effectiveStaffId = staffId || bookingType.staff_id || null;

  // ── Re-check availability (double-booking prevention) ─────────────────────
  // Check for conflicting bookings in the same time window (including buffers)
  const bufferBefore = bookingType.buffer_before_minutes;
  const bufferAfter = bookingType.buffer_after_minutes;

  const footprintStart = new Date(start.getTime() - bufferBefore * 60 * 1000);
  const footprintEnd = new Date(endTime.getTime() + bufferAfter * 60 * 1000);

  let conflictQuery = supabase
    .from('bookings')
    .select('id, start_time, end_time, booking_type_id')
    .eq('tenant_id', tenantId)
    .not('status', 'eq', 'cancelled')
    .lt('start_time', footprintEnd.toISOString())
    .gt('end_time', footprintStart.toISOString());

  if (effectiveStaffId) {
    conflictQuery = conflictQuery.eq('staff_id', effectiveStaffId);
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
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .lte('start_time', endTime.toISOString())
    .or(`end_time.is.null,end_time.gte.${start.toISOString()}`);

  if (eventConflicts && eventConflicts.length > 0) {
    return NextResponse.json(
      { error: 'This time slot conflicts with a scheduled event. Please choose another time.' },
      { status: 409 }
    );
  }

  // ── Determine status ──────────────────────────────────────────────────────
  const status = bookingType.booking_mode === 'auto' ? 'confirmed' : 'pending';

  // ── Client resolution ─────────────────────────────────────────────────────
  const normalizedPhone = normalizePhone(customerPhone);
  let clientId: string | null = null;

  const { data: existingClient } = await supabase
    .from('clients')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('phone', normalizedPhone)
    .limit(1)
    .single();

  if (existingClient) {
    clientId = existingClient.id;
  } else {
    // Create a new client record
    const { data: newClient } = await supabase
      .from('clients')
      .insert({
        tenant_id: tenantId,
        name: customerName.trim(),
        phone: normalizedPhone,
        email: customerEmail?.trim() || null,
        source: 'booking',
      })
      .select('id')
      .single();

    if (newClient) {
      clientId = newClient.id;
    }
  }

  // ── Insert booking ────────────────────────────────────────────────────────
  const { data: booking, error: insertError } = await supabase
    .from('bookings')
    .insert({
      tenant_id: tenantId,
      booking_type_id: bookingTypeId,
      staff_id: effectiveStaffId,
      client_id: clientId,
      start_time: start.toISOString(),
      end_time: endTime.toISOString(),
      status,
      customer_name: customerName.trim(),
      customer_phone: normalizedPhone,
      customer_email: customerEmail?.trim() || null,
      notes: notes?.trim() || null,
      deposit_amount: bookingType.deposit_required ? bookingType.deposit_amount : null,
      deposit_status: bookingType.deposit_required ? 'pending' : 'none',
    })
    .select('*')
    .single();

  if (insertError) {
    console.error('Booking insert failed:', insertError);
    return NextResponse.json({ error: 'Failed to create booking' }, { status: 500 });
  }

  // ── Deposit payment link (auto-confirm + deposit_required only) ───────────
  let paymentUrl: string | null = null;
  let requiresPayment = false;

  if (
    bookingType.deposit_required &&
    bookingType.deposit_amount &&
    bookingType.booking_mode === 'auto'
  ) {
    try {
      // Fetch tenant payment credentials
      const { data: tenantPayment } = await supabase
        .from('tenants')
        .select('default_payment_processor, stripe_account_id, square_access_token, square_location_id, name')
        .eq('id', tenantId)
        .single();

      if (tenantPayment) {
        const provider = resolvePaymentProvider(tenantPayment);
        if (provider) {
          const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://sunstonepj.app';
          const result = await createDepositPaymentLink({
            provider,
            tenant: { id: tenantId, ...tenantPayment },
            amount: Number(bookingType.deposit_amount),
            metadata: {
              type: 'booking_deposit',
              referenceId: booking.id,
              tenantId,
            },
            successUrl: `${APP_URL}/booking/manage/${booking.cancellation_token}?deposit=success`,
            cancelUrl: `${APP_URL}/booking/manage/${booking.cancellation_token}?deposit=cancelled`,
          });

          paymentUrl = result.paymentUrl;
          requiresPayment = true;

          // Update booking with deposit payment info
          await supabase
            .from('bookings')
            .update({
              deposit_status: 'pending',
              deposit_payment_provider: provider,
              ...(result.sessionId ? { stripe_checkout_session_id: result.sessionId } : {}),
              ...(result.orderId ? { square_order_id: result.orderId } : {}),
            })
            .eq('id', booking.id);
        }
        // If no provider connected: booking proceeds without automated deposit.
        // Artist can send a deposit link manually later.
      }
    } catch (depositErr: any) {
      // Deposit link failure must not block the booking creation
      console.error('[Booking Create] Deposit payment link failed:', depositErr);
    }
  }

  // ── Post-creation notifications (fire-and-forget) ─────────────────────────
  // SMS failures must never block the booking response.
  try {
    const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://sunstonepj.app';

    // Fetch tenant info for notifications
    const { data: tenant } = await supabase
      .from('tenants')
      .select('name, phone, city, state')
      .eq('id', tenantId)
      .single();

    const businessName = tenant?.name || 'your artist';
    const bookingDate = start.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      timeZone: 'UTC',
    });
    const bookingTime = start.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: 'UTC',
    });
    const duration = bookingType.duration_minutes;
    const locationParts = [tenant?.city, tenant?.state].filter(Boolean);
    const locationLine = locationParts.length > 0 ? `\n${locationParts.join(', ')}` : '';

    const cancelLink = `${APP_URL}/booking/manage/${booking.cancellation_token}`;
    const calendarLink = `${APP_URL}/api/public/bookings/${booking.id}/calendar?token=${booking.cancellation_token}`;

    // ── A) Customer confirmation SMS ──────────────────────────────────────
    let customerMsg = '';
    if (status === 'confirmed') {
      customerMsg =
        `Your appointment is confirmed!\n` +
        `${bookingType.name} with ${businessName}\n` +
        `${bookingDate} at ${bookingTime}\n` +
        `${duration} min${locationLine}\n` +
        (paymentUrl
          ? `\nPay your $${Number(bookingType.deposit_amount).toFixed(2)} deposit: ${paymentUrl}\n`
          : '') +
        `\nAdd to calendar: ${calendarLink}` +
        `\nTo cancel or reschedule: ${cancelLink}`;
    } else {
      customerMsg =
        `Your booking request has been received!\n` +
        `${bookingType.name} with ${businessName}\n` +
        `${bookingDate} at ${bookingTime}\n` +
        `${duration} min\n` +
        `${businessName} will confirm your appointment shortly.\n` +
        `Questions? Reply to this message.`;
    }

    sendSMS({
      to: normalizedPhone,
      body: customerMsg,
      tenantId,
      skipConsentCheck: true,
    }).catch((err) => {
      console.error('[Booking SMS] Customer confirmation failed:', err);
    });

    // ── B) Artist notification SMS ────────────────────────────────────────
    if (tenant?.phone) {
      const statusWord = status === 'confirmed' ? 'confirmed' : 'received';
      const actionLine = status === 'pending'
        ? '\nAction needed: approve or decline in your dashboard.'
        : '';

      const artistMsg =
        `New booking ${statusWord}!\n` +
        `${customerName.trim()} booked ${bookingType.name}\n` +
        `${bookingDate} at ${bookingTime}\n` +
        `${normalizedPhone}${actionLine}`;

      sendSMS({
        to: tenant.phone,
        body: artistMsg,
        tenantId,
        skipConsentCheck: true,
      }).catch((err) => {
        console.error('[Booking SMS] Artist notification failed:', err);
      });
    }
  } catch (notifErr) {
    // Notification errors must never block the booking response
    console.error('[Booking SMS] Notification setup failed:', notifErr);
  }

  return NextResponse.json({
    booking,
    status,
    requiresPayment,
    paymentUrl,
  });
}
