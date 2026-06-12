// ============================================================================
// Public Booking Lookup API — GET /api/public/bookings/manage
// ============================================================================
// Returns booking details by cancellation_token. Public, no auth required.
// Used by the /booking/manage/[token] page.
// ============================================================================

import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');

  if (!token) {
    return NextResponse.json({ error: 'Missing token' }, { status: 400 });
  }

  // Validate UUID format
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 400 });
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
      customer_phone,
      customer_email,
      notes,
      cancellation_token,
      created_at
    `)
    .eq('cancellation_token', token)
    .single();

  if (error || !booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
  }

  // Completed bookings cannot be managed
  if (booking.status === 'completed' || booking.status === 'no_show') {
    return NextResponse.json({ error: 'This booking can no longer be modified' }, { status: 404 });
  }

  // Fetch booking type info
  const { data: bookingType } = await supabase
    .from('booking_types')
    .select('id, name, duration_minutes, description, price')
    .eq('id', booking.booking_type_id)
    .single();

  // Fetch tenant info
  const { data: tenant } = await supabase
    .from('tenants')
    .select('id, name, slug, logo_url, theme_id, city, state')
    .eq('id', booking.tenant_id)
    .single();

  if (!tenant) {
    return NextResponse.json({ error: 'Business not found' }, { status: 404 });
  }

  return NextResponse.json({
    booking: {
      id: booking.id,
      tenantId: booking.tenant_id,
      bookingTypeId: booking.booking_type_id,
      startTime: booking.start_time,
      endTime: booking.end_time,
      status: booking.status,
      customerName: booking.customer_name,
      isCancelled: booking.status === 'cancelled',
    },
    bookingType: bookingType
      ? {
          id: bookingType.id,
          name: bookingType.name,
          durationMinutes: bookingType.duration_minutes,
          description: bookingType.description,
          price: bookingType.price,
        }
      : null,
    tenant: {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      logoUrl: tenant.logo_url,
      themeId: tenant.theme_id,
      location: [tenant.city, tenant.state].filter(Boolean).join(', ') || null,
    },
  });
}
