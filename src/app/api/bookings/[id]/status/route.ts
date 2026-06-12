// ============================================================================
// Update Booking Status — PATCH /api/bookings/[id]/status
// ============================================================================
// Authenticated, tenant-scoped. Supports: completed, no_show, cancelled.
// No SMS sent for these status changes.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase, createServiceRoleClient } from '@/lib/supabase/server';

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  confirmed: ['completed', 'no_show', 'cancelled'],
  pending: ['cancelled'],
};

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { status: newStatus } = body;

  if (!newStatus || !['completed', 'no_show', 'cancelled'].includes(newStatus)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  // ── Auth ────────────────────────────────────────────────────────────────────
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

  // ── Fetch + validate transition ─────────────────────────────────────────────
  const svc = await createServiceRoleClient();
  const { data: booking, error } = await svc
    .from('bookings')
    .select('id, status')
    .eq('id', id)
    .eq('tenant_id', member.tenant_id)
    .single();

  if (error || !booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
  }

  const allowed = ALLOWED_TRANSITIONS[booking.status];
  if (!allowed || !allowed.includes(newStatus)) {
    return NextResponse.json(
      { error: `Cannot transition from ${booking.status} to ${newStatus}` },
      { status: 400 }
    );
  }

  // ── Update ──────────────────────────────────────────────────────────────────
  const { error: updateError } = await svc
    .from('bookings')
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (updateError) {
    return NextResponse.json({ error: 'Failed to update booking' }, { status: 500 });
  }

  return NextResponse.json({ success: true, status: newStatus });
}
