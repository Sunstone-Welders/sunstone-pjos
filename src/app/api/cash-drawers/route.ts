// ============================================================================
// Cash Drawers — POST (open) + GET (list)
// src/app/api/cash-drawers/route.ts
// ============================================================================

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase, createServiceRoleClient } from '@/lib/supabase/server';

// ── POST: Open a new cash drawer ────────────────────────────────────────────

export async function POST(request: NextRequest) {
  // Auth check via user session
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

  const { openingBalance, eventId } = await request.json();

  if (openingBalance == null || openingBalance < 0) {
    return NextResponse.json({ error: 'Opening balance is required and must be >= 0' }, { status: 400 });
  }

  // Use service role to bypass RLS — auth already verified above
  const db = await createServiceRoleClient();

  // Check for existing open drawer for this tenant (+ event if provided)
  const existingQuery = db
    .from('cash_drawers')
    .select('id')
    .eq('tenant_id', member.tenant_id)
    .eq('status', 'open');

  if (eventId) {
    existingQuery.eq('event_id', eventId);
  } else {
    existingQuery.is('event_id', null);
  }

  const { data: existing, error: existingError } = await existingQuery.limit(1);

  if (existingError) {
    console.error('[CashDrawer POST] existing check error:', existingError.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  if (existing && existing.length > 0) {
    return NextResponse.json(
      { error: 'A cash drawer is already open. Close it before opening a new one.' },
      { status: 409 },
    );
  }

  const insertPayload = {
    tenant_id: member.tenant_id,
    event_id: eventId || null,
    opening_amount: openingBalance,
    opened_by: user.id,
  };

  const { data: drawer, error } = await db
    .from('cash_drawers')
    .insert(insertPayload)
    .select()
    .single();

  if (error) {
    console.error('[CashDrawer POST] insert error:', error.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
  return NextResponse.json(drawer, { status: 201 });
}

// ── GET: List cash drawers ──────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  // Auth check via user session
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

  // Use service role to bypass RLS — auth already verified above
  const db = await createServiceRoleClient();

  const url = new URL(request.url);
  const status = url.searchParams.get('status');
  const eventId = url.searchParams.get('event_id');

  let query = db
    .from('cash_drawers')
    .select('*')
    .eq('tenant_id', member.tenant_id)
    .order('opened_at', { ascending: false })
    .limit(50);

  if (status) query = query.eq('status', status);
  if (eventId) query = query.eq('event_id', eventId);

  const { data: drawers, error } = await query;
  if (error) {
    console.error('[CashDrawer GET] list error:', error.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
  return NextResponse.json(drawers || []);
}
