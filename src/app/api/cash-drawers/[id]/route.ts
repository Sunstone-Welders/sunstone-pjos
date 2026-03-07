// ============================================================================
// Cash Drawer Detail — GET + PATCH (close)
// src/app/api/cash-drawers/[id]/route.ts
// ============================================================================

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase, createServiceRoleClient } from '@/lib/supabase/server';

// ── GET: Drawer detail with transactions ────────────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
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

  const { data: drawer, error } = await db
    .from('cash_drawers')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', member.tenant_id)
    .single();

  if (error || !drawer) {
    if (error) console.error('[CashDrawer GET detail] error:', error.message);
    return NextResponse.json({ error: 'Cash drawer not found' }, { status: 404 });
  }

  // Fetch transactions
  const { data: transactions } = await db
    .from('cash_drawer_transactions')
    .select('*')
    .eq('session_id', id)
    .order('created_at', { ascending: true });

  return NextResponse.json({ ...drawer, transactions: transactions || [] });
}

// ── PATCH: Close the drawer ─────────────────────────────────────────────────

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
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

  const { data: drawer } = await db
    .from('cash_drawers')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', member.tenant_id)
    .single();

  if (!drawer) return NextResponse.json({ error: 'Cash drawer not found' }, { status: 404 });
  if (drawer.status === 'closed') {
    return NextResponse.json({ error: 'Drawer is already closed' }, { status: 400 });
  }

  const { closingBalance, notes } = await request.json();

  if (closingBalance == null || closingBalance < 0) {
    return NextResponse.json({ error: 'Closing balance (counted cash) is required' }, { status: 400 });
  }

  // Fetch all transactions to compute expected balance
  const { data: transactions } = await db
    .from('cash_drawer_transactions')
    .select('type, amount')
    .eq('session_id', id);

  const txns = transactions || [];
  let cashIn = Number(drawer.opening_amount);
  for (const txn of txns) {
    const amt = Number(txn.amount);
    if (txn.type === 'sale' || txn.type === 'tip' || txn.type === 'pay_in') {
      cashIn += amt;
    } else if (txn.type === 'pay_out') {
      cashIn -= amt;
    }
    // 'adjustment' amounts are signed — positive = in, negative = out
    if (txn.type === 'adjustment') {
      cashIn += amt;
    }
  }

  const expectedBalance = Math.round(cashIn * 100) / 100;
  const overShort = Math.round((closingBalance - expectedBalance) * 100) / 100;

  const { data: closed, error } = await db
    .from('cash_drawers')
    .update({
      status: 'closed',
      closed_at: new Date().toISOString(),
      closed_by: user.id,
      actual_amount: closingBalance,
      expected_amount: expectedBalance,
      variance: overShort,
      notes: notes || null,
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('[CashDrawer PATCH close] error:', error.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
  return NextResponse.json(closed);
}
