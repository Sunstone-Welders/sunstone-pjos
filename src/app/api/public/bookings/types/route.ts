// ============================================================================
// Public Booking Types API — GET /api/public/bookings/types?tenantId=X
// ============================================================================
// Returns active booking types for a tenant. Public, no auth required.
// ============================================================================

import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tenantId = searchParams.get('tenantId');

  if (!tenantId) {
    return NextResponse.json({ error: 'Missing tenantId' }, { status: 400 });
  }

  const supabase = await createServiceRoleClient();

  // Fetch active booking types for this tenant
  const { data: bookingTypes, error } = await supabase
    .from('booking_types')
    .select('id, name, description, duration_minutes, price, deposit_amount, deposit_required, booking_mode, color')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .order('created_at');

  if (error) {
    console.error('Booking types fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch booking types' }, { status: 500 });
  }

  return NextResponse.json({ bookingTypes: bookingTypes || [] });
}
