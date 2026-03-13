// ============================================================================
// Party Request Detail API — GET, PATCH /api/party-requests/[id]
// ============================================================================

import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// ── GET: Fetch single party request with RSVPs ─────────────────────────────

export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('party_requests')
    .select('*, party_rsvps(*)')
    .eq('id', id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({ partyRequest: data });
}

// ── PATCH: Update status, notes, event_id ──────────────────────────────────

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const updates: Record<string, any> = {};

  if (body.status !== undefined) updates.status = body.status;
  if (body.notes !== undefined) updates.notes = body.notes;
  if (body.event_id !== undefined) updates.event_id = body.event_id;
  if (body.deposit_amount !== undefined) updates.deposit_amount = body.deposit_amount;
  if (body.deposit_status !== undefined) updates.deposit_status = body.deposit_status;
  if (body.minimum_guarantee !== undefined) updates.minimum_guarantee = body.minimum_guarantee;
  if (body.host_reward_amount !== undefined) updates.host_reward_amount = body.host_reward_amount;
  if (body.host_reward_redeemed !== undefined) {
    updates.host_reward_redeemed = body.host_reward_redeemed;
    if (body.host_reward_redeemed) updates.host_reward_redeemed_at = new Date().toISOString();
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('party_requests')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Party request update failed:', error);
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
  }

  return NextResponse.json({ partyRequest: data });
}
