// ============================================================================
// Approve Booking — POST /api/bookings/[id]/approve
// ============================================================================
// Authenticated, tenant-scoped. Sets status to 'confirmed' and sends SMS.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase, createServiceRoleClient } from '@/lib/supabase/server';
import { sendSMS } from '@/lib/twilio';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

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
  const tenantId = member.tenant_id;

  // ── Fetch booking ───────────────────────────────────────────────────────────
  const svc = await createServiceRoleClient();
  const { data: booking, error } = await svc
    .from('bookings')
    .select('*, booking_types(name, duration_minutes)')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .single();

  if (error || !booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
  }
  if (booking.status !== 'pending') {
    return NextResponse.json({ error: `Cannot approve a ${booking.status} booking` }, { status: 400 });
  }

  // ── Update status ───────────────────────────────────────────────────────────
  const { error: updateError } = await svc
    .from('bookings')
    .update({ status: 'confirmed', updated_at: new Date().toISOString() })
    .eq('id', id);

  if (updateError) {
    return NextResponse.json({ error: 'Failed to update booking' }, { status: 500 });
  }

  // ── Send confirmation SMS (fire-and-forget) ─────────────────────────────────
  if (booking.customer_phone) {
    try {
      const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://sunstonepj.app';
      const { data: tenant } = await svc
        .from('tenants')
        .select('name')
        .eq('id', tenantId)
        .single();

      const businessName = tenant?.name || 'your artist';
      const start = new Date(booking.start_time);
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
      const typeName = booking.booking_types?.name || 'Appointment';
      const calendarLink = `${APP_URL}/api/public/bookings/${booking.id}/calendar?token=${booking.cancellation_token}`;
      const manageLink = `${APP_URL}/booking/manage/${booking.cancellation_token}`;

      const msg =
        `Great news! Your booking has been approved!\n` +
        `${typeName} with ${businessName}\n` +
        `${bookingDate} at ${bookingTime}\n` +
        `\nAdd to calendar: ${calendarLink}` +
        `\nTo cancel or reschedule: ${manageLink}`;

      sendSMS({
        to: booking.customer_phone,
        body: msg,
        tenantId,
        skipConsentCheck: true,
      }).catch((err) => {
        console.error('[Booking Approve SMS] Failed:', err);
      });
    } catch (err) {
      console.error('[Booking Approve SMS] Setup failed:', err);
    }
  }

  return NextResponse.json({ success: true, status: 'confirmed' });
}
