// ============================================================================
// Public Available Slots API — GET /api/public/bookings/available-slots
// ============================================================================
// Generates available time slots for a booking type on a given date.
// Public, no auth required. Uses service role to bypass RLS.
//
// Params: tenantId, bookingTypeId, date (YYYY-MM-DD), staffId (optional)
//
// Algorithm:
// 1. Fetch booking type → duration, buffers
// 2. Fetch weekly availability_rules for the day_of_week
// 3. Fetch availability_overrides for the exact date
// 4. Build available time windows (rules + overrides)
// 5. Fetch existing bookings (non-cancelled) → blocked ranges
// 6. Fetch active events overlapping the date → blocked ranges
// 7. Generate candidate slots, reject those with conflicts
// 8. Return available slots + booking type info
// ============================================================================

import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

// ── Helpers ─────────────────────────────────────────────────────────────────

interface TimeWindow {
  start: number; // minutes from midnight
  end: number;
}

/** Parse "HH:MM:SS" or "HH:MM" to minutes from midnight */
function timeToMinutes(t: string): number {
  const parts = t.split(':').map(Number);
  return parts[0] * 60 + (parts[1] || 0);
}

/** Remove overlapping range from a set of windows */
function subtractRange(windows: TimeWindow[], blockStart: number, blockEnd: number): TimeWindow[] {
  const result: TimeWindow[] = [];
  for (const w of windows) {
    if (blockEnd <= w.start || blockStart >= w.end) {
      // No overlap
      result.push(w);
    } else {
      // Overlap — split
      if (w.start < blockStart) {
        result.push({ start: w.start, end: blockStart });
      }
      if (w.end > blockEnd) {
        result.push({ start: blockEnd, end: w.end });
      }
    }
  }
  return result;
}

/** Merge overlapping/adjacent windows */
function mergeWindows(windows: TimeWindow[]): TimeWindow[] {
  if (windows.length === 0) return [];
  const sorted = [...windows].sort((a, b) => a.start - b.start);
  const merged: TimeWindow[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1];
    if (sorted[i].start <= last.end) {
      last.end = Math.max(last.end, sorted[i].end);
    } else {
      merged.push(sorted[i]);
    }
  }
  return merged;
}

// ── Main Handler ────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tenantId = searchParams.get('tenantId');
  const bookingTypeId = searchParams.get('bookingTypeId');
  const dateStr = searchParams.get('date'); // YYYY-MM-DD
  const staffId = searchParams.get('staffId') || null;

  if (!tenantId || !bookingTypeId || !dateStr) {
    return NextResponse.json(
      { error: 'Missing required params: tenantId, bookingTypeId, date' },
      { status: 400 }
    );
  }

  // Validate date format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return NextResponse.json({ error: 'Invalid date format. Use YYYY-MM-DD' }, { status: 400 });
  }

  const supabase = await createServiceRoleClient();

  // ── 1. Fetch booking type ─────────────────────────────────────────────────
  const { data: bookingType, error: btError } = await supabase
    .from('booking_types')
    .select('id, tenant_id, name, description, duration_minutes, buffer_before_minutes, buffer_after_minutes, booking_mode, price, deposit_amount, deposit_required, is_active, staff_id')
    .eq('id', bookingTypeId)
    .eq('tenant_id', tenantId)
    .single();

  if (btError || !bookingType) {
    return NextResponse.json({ error: 'Booking type not found' }, { status: 404 });
  }

  if (!bookingType.is_active) {
    return NextResponse.json({ error: 'Booking type is not active' }, { status: 400 });
  }

  const duration = bookingType.duration_minutes;
  const bufferBefore = bookingType.buffer_before_minutes;
  const bufferAfter = bookingType.buffer_after_minutes;

  // Resolve which staff_id to use for availability
  const effectiveStaffId = staffId || bookingType.staff_id || null;

  // ── 2. Fetch weekly availability rules ────────────────────────────────────
  const requestedDate = new Date(dateStr + 'T00:00:00');
  const dayOfWeek = requestedDate.getUTCDay(); // 0=Sun .. 6=Sat

  let rulesQuery = supabase
    .from('availability_rules')
    .select('start_time, end_time')
    .eq('tenant_id', tenantId)
    .eq('day_of_week', dayOfWeek)
    .eq('is_active', true);

  if (effectiveStaffId) {
    rulesQuery = rulesQuery.eq('staff_id', effectiveStaffId);
  } else {
    rulesQuery = rulesQuery.is('staff_id', null);
  }

  const { data: rules } = await rulesQuery;

  // ── 3. Fetch availability overrides ───────────────────────────────────────
  let overridesQuery = supabase
    .from('availability_overrides')
    .select('start_time, end_time, type')
    .eq('tenant_id', tenantId)
    .eq('date', dateStr);

  if (effectiveStaffId) {
    overridesQuery = overridesQuery.eq('staff_id', effectiveStaffId);
  } else {
    overridesQuery = overridesQuery.is('staff_id', null);
  }

  const { data: overrides } = await overridesQuery;

  // ── 4. Build available time windows ───────────────────────────────────────
  let windows: TimeWindow[] = (rules || []).map((r) => ({
    start: timeToMinutes(r.start_time),
    end: timeToMinutes(r.end_time),
  }));

  // Apply overrides
  for (const ov of overrides || []) {
    if (ov.type === 'block') {
      if (!ov.start_time && !ov.end_time) {
        // Full day block
        windows = [];
      } else {
        const blockStart = ov.start_time ? timeToMinutes(ov.start_time) : 0;
        const blockEnd = ov.end_time ? timeToMinutes(ov.end_time) : 1440;
        windows = subtractRange(windows, blockStart, blockEnd);
      }
    } else if (ov.type === 'available' && ov.start_time && ov.end_time) {
      windows.push({
        start: timeToMinutes(ov.start_time),
        end: timeToMinutes(ov.end_time),
      });
    }
  }

  windows = mergeWindows(windows);

  if (windows.length === 0) {
    return NextResponse.json({
      slots: [],
      bookingType: {
        id: bookingType.id,
        name: bookingType.name,
        description: bookingType.description,
        duration_minutes: duration,
        price: bookingType.price,
        deposit_amount: bookingType.deposit_amount,
        deposit_required: bookingType.deposit_required,
        booking_mode: bookingType.booking_mode,
      },
    });
  }

  // ── 5. Fetch existing bookings for conflict check ─────────────────────────
  // Get all non-cancelled bookings on this date (with their booking type buffers)
  const dayStart = `${dateStr}T00:00:00Z`;
  const dayEnd = `${dateStr}T23:59:59Z`;

  let bookingsQuery = supabase
    .from('bookings')
    .select('start_time, end_time, booking_type_id')
    .eq('tenant_id', tenantId)
    .not('status', 'eq', 'cancelled')
    .gte('start_time', dayStart)
    .lte('start_time', dayEnd);

  if (effectiveStaffId) {
    bookingsQuery = bookingsQuery.eq('staff_id', effectiveStaffId);
  }

  const { data: existingBookings } = await bookingsQuery;

  // Fetch buffer info for each unique booking type referenced
  const bookingTypeIds = [...new Set((existingBookings || []).map((b) => b.booking_type_id))];
  let bookingTypeBuffers: Record<string, { before: number; after: number }> = {};

  if (bookingTypeIds.length > 0) {
    const { data: btBuffers } = await supabase
      .from('booking_types')
      .select('id, buffer_before_minutes, buffer_after_minutes')
      .in('id', bookingTypeIds);

    for (const bt of btBuffers || []) {
      bookingTypeBuffers[bt.id] = {
        before: bt.buffer_before_minutes,
        after: bt.buffer_after_minutes,
      };
    }
  }

  // Build blocked ranges from existing bookings (including their buffers)
  interface BlockedRange {
    start: number; // minutes from midnight
    end: number;
  }

  const blockedRanges: BlockedRange[] = [];

  for (const booking of existingBookings || []) {
    const bStart = new Date(booking.start_time);
    const bEnd = new Date(booking.end_time);
    const bDate = bStart.toISOString().split('T')[0];

    // Only consider bookings on this date
    if (bDate !== dateStr) continue;

    const startMin = bStart.getUTCHours() * 60 + bStart.getUTCMinutes();
    const endMin = bEnd.getUTCHours() * 60 + bEnd.getUTCMinutes();

    const buffers = bookingTypeBuffers[booking.booking_type_id] || { before: 0, after: 0 };
    blockedRanges.push({
      start: startMin - buffers.before,
      end: endMin + buffers.after,
    });
  }

  // ── 6. Fetch active events overlapping this date ──────────────────────────
  const { data: events } = await supabase
    .from('events')
    .select('start_time, end_time')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .lte('start_time', dayEnd)
    .or(`end_time.is.null,end_time.gte.${dayStart}`);

  for (const evt of events || []) {
    const evtStart = new Date(evt.start_time);
    const evtEnd = evt.end_time ? new Date(evt.end_time) : new Date(dayEnd);
    const evtDate = evtStart.toISOString().split('T')[0];

    // Compute overlap with the requested date
    let startMin = 0;
    let endMin = 1440;

    if (evtDate === dateStr) {
      startMin = evtStart.getUTCHours() * 60 + evtStart.getUTCMinutes();
    }

    const evtEndDate = evtEnd.toISOString().split('T')[0];
    if (evtEndDate === dateStr) {
      endMin = evtEnd.getUTCHours() * 60 + evtEnd.getUTCMinutes();
    }

    blockedRanges.push({ start: startMin, end: endMin });
  }

  // ── 7. Generate candidate slots and filter ────────────────────────────────
  const now = new Date();
  const isToday = dateStr === now.toISOString().split('T')[0];
  const nowMinutes = isToday ? now.getUTCHours() * 60 + now.getUTCMinutes() : 0;
  const MIN_LEAD_MINUTES = 30; // Can't book less than 30 min from now

  interface Slot {
    start_time: string;
    end_time: string;
  }

  const slots: Slot[] = [];

  for (const window of windows) {
    let candidateStart = window.start;

    while (candidateStart + duration <= window.end) {
      const candidateEnd = candidateStart + duration;

      // Full footprint including buffers
      const footprintStart = candidateStart - bufferBefore;
      const footprintEnd = candidateEnd + bufferAfter;

      // Check: past time filter (today only)
      if (isToday && candidateStart < nowMinutes + MIN_LEAD_MINUTES) {
        candidateStart += duration;
        continue;
      }

      // Check: conflict with blocked ranges
      let hasConflict = false;
      for (const blocked of blockedRanges) {
        if (footprintStart < blocked.end && footprintEnd > blocked.start) {
          hasConflict = true;
          break;
        }
      }

      if (!hasConflict) {
        // Convert minutes back to ISO timestamps
        const startHour = Math.floor(candidateStart / 60);
        const startMinute = candidateStart % 60;
        const endHour = Math.floor(candidateEnd / 60);
        const endMinute = candidateEnd % 60;

        const startISO = `${dateStr}T${String(startHour).padStart(2, '0')}:${String(startMinute).padStart(2, '0')}:00Z`;
        const endISO = `${dateStr}T${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}:00Z`;

        slots.push({ start_time: startISO, end_time: endISO });
      }

      candidateStart += duration;
    }
  }

  // ── 8. Return ─────────────────────────────────────────────────────────────
  return NextResponse.json({
    slots,
    bookingType: {
      id: bookingType.id,
      name: bookingType.name,
      description: bookingType.description,
      duration_minutes: duration,
      price: bookingType.price,
      deposit_amount: bookingType.deposit_amount,
      deposit_required: bookingType.deposit_required,
      booking_mode: bookingType.booking_mode,
    },
  });
}
