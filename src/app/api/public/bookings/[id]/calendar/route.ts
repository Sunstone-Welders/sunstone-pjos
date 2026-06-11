// ============================================================================
// Public Booking Calendar Download — GET /api/public/bookings/[id]/calendar
// ============================================================================
// Serves a .ics file for a booking. Public but secured by cancellation_token
// query parameter to prevent enumeration.
// ============================================================================

import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateICS } from '@/lib/ics';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');

  if (!id || !token) {
    return NextResponse.json({ error: 'Missing booking ID or token' }, { status: 400 });
  }

  const supabase = await createServiceRoleClient();

  // Fetch booking + booking type + tenant in one go
  const { data: booking, error } = await supabase
    .from('bookings')
    .select(`
      id, start_time, end_time, customer_name, cancellation_token, notes,
      booking_types!inner ( name, duration_minutes ),
      tenants!inner ( name, city, state )
    `)
    .eq('id', id)
    .single();

  if (error || !booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
  }

  // Validate cancellation token
  if (booking.cancellation_token !== token) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 403 });
  }

  // Build location string
  const tenant = booking.tenants as unknown as { name: string; city: string | null; state: string | null };
  const bookingType = booking.booking_types as unknown as { name: string; duration_minutes: number };
  const locationParts = [tenant.city, tenant.state].filter(Boolean);
  const location = locationParts.join(', ');

  const startTime = new Date(booking.start_time);
  const endTime = new Date(booking.end_time);

  const icsContent = generateICS({
    summary: `${bookingType.name} — ${tenant.name}`,
    description: `${bookingType.duration_minutes} min appointment with ${tenant.name}`,
    location,
    startTime,
    endTime,
    organizerName: tenant.name,
    uid: booking.id,
  });

  return new Response(icsContent, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'attachment; filename="booking.ics"',
      'Cache-Control': 'no-cache',
    },
  });
}
