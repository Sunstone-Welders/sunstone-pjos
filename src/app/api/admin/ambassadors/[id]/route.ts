// ============================================================================
// Admin Ambassador Detail API — PATCH /api/admin/ambassadors/[id]
// ============================================================================
// Update individual ambassador fields (commission rate, duration, status, notes).
// Platform admin only.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { verifyPlatformAdmin, AdminAuthError } from '@/lib/admin/verify-platform-admin';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await verifyPlatformAdmin();
    const { id } = await params;
    const body = await request.json();
    const supabase = await createServiceRoleClient();

    const update: Record<string, any> = {};

    // Commission rate: accept 1-50 (percentage), store as decimal
    if (body.commission_rate !== undefined) {
      const rate = Number(body.commission_rate);
      if (isNaN(rate) || rate < 0.01 || rate > 0.50) {
        return NextResponse.json({ error: 'Commission rate must be between 1% and 50%' }, { status: 400 });
      }
      update.commission_rate = rate;
    }

    // Commission duration: 1-24 months
    if (body.commission_duration_months !== undefined) {
      const months = Number(body.commission_duration_months);
      if (isNaN(months) || months < 1 || months > 24 || !Number.isInteger(months)) {
        return NextResponse.json({ error: 'Commission duration must be 1-24 months' }, { status: 400 });
      }
      update.commission_duration_months = months;
    }

    // Status
    if (body.status !== undefined) {
      const validStatuses = ['pending', 'active', 'suspended', 'terminated'];
      if (!validStatuses.includes(body.status)) {
        return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
      }
      update.status = body.status;
    }

    // Notes (free text)
    if (body.notes !== undefined) {
      update.notes = body.notes || null;
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    update.updated_at = new Date().toISOString();

    const { data: ambassador, error } = await supabase
      .from('ambassadors')
      .update(update)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      console.error('[Admin Ambassador PATCH] Error:', error);
      return NextResponse.json({ error: 'Failed to update ambassador' }, { status: 500 });
    }

    return NextResponse.json({ ambassador });
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[Admin Ambassador PATCH] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
