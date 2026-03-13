// ============================================================================
// Party Revenue API — GET, POST /api/party-requests/[id]/revenue
// ============================================================================
// GET: Fetch sales linked to this party with breakdown
// POST: Link a sale to this party (tags sale with party_request_id)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase, createServiceRoleClient } from '@/lib/supabase/server';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// ── GET: Fetch party revenue breakdown ──────────────────────────────────────

export async function GET(request: NextRequest, context: RouteContext) {
  const { id: partyRequestId } = await context.params;
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = await createServiceRoleClient();

  // Verify access
  const { data: member } = await supabase
    .from('tenant_members')
    .select('tenant_id')
    .eq('user_id', user.id)
    .limit(1)
    .single();
  if (!member) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // Fetch linked sales
  const { data: sales } = await db
    .from('sales')
    .select('id, subtotal, tax_amount, tip_amount, total, payment_method, payment_status, created_at, client_id, party_rsvp_id')
    .eq('party_request_id', partyRequestId)
    .eq('tenant_id', member.tenant_id)
    .eq('status', 'completed')
    .neq('payment_status', 'expired')
    .order('created_at', { ascending: true });

  // Fetch sale items for top products
  const saleIds = (sales || []).map(s => s.id);
  let topProducts: { name: string; quantity: number; revenue: number }[] = [];

  if (saleIds.length > 0) {
    const { data: items } = await db
      .from('sale_items')
      .select('name, quantity, line_total')
      .in('sale_id', saleIds);

    if (items) {
      const productMap = new Map<string, { quantity: number; revenue: number }>();
      for (const item of items) {
        const existing = productMap.get(item.name) || { quantity: 0, revenue: 0 };
        existing.quantity += Number(item.quantity);
        existing.revenue += Number(item.line_total);
        productMap.set(item.name, existing);
      }
      topProducts = Array.from(productMap.entries())
        .map(([name, data]) => ({ name, ...data }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10);
    }
  }

  const completedSales = (sales || []).filter(s => s.payment_status === 'completed');
  const totalRevenue = completedSales.reduce((sum, s) => sum + Number(s.subtotal), 0);
  const totalWithTax = completedSales.reduce((sum, s) => sum + Number(s.total), 0);
  const totalTips = completedSales.reduce((sum, s) => sum + Number(s.tip_amount), 0);

  // Per-guest revenue (via party_rsvp_id linkage)
  const guestRevenue = new Map<string, number>();
  for (const s of completedSales) {
    if (s.party_rsvp_id) {
      guestRevenue.set(s.party_rsvp_id, (guestRevenue.get(s.party_rsvp_id) || 0) + Number(s.subtotal));
    }
  }

  return NextResponse.json({
    sales: sales || [],
    summary: {
      total_sales: completedSales.length,
      total_revenue: totalRevenue,
      total_with_tax: totalWithTax,
      total_tips: totalTips,
      avg_per_sale: completedSales.length > 0 ? totalRevenue / completedSales.length : 0,
    },
    topProducts,
    guestRevenue: Object.fromEntries(guestRevenue),
  });
}

// ── POST: Link a sale to this party ─────────────────────────────────────────

export async function POST(request: NextRequest, context: RouteContext) {
  const { id: partyRequestId } = await context.params;
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: member } = await supabase
    .from('tenant_members')
    .select('tenant_id')
    .eq('user_id', user.id)
    .limit(1)
    .single();
  if (!member) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { saleId, rsvpId } = await request.json();
  if (!saleId) return NextResponse.json({ error: 'Missing saleId' }, { status: 400 });

  const db = await createServiceRoleClient();

  // Link sale to party
  const updateData: Record<string, any> = { party_request_id: partyRequestId };
  if (rsvpId) updateData.party_rsvp_id = rsvpId;

  const { error } = await db
    .from('sales')
    .update(updateData)
    .eq('id', saleId)
    .eq('tenant_id', member.tenant_id);

  if (error) {
    console.error('Failed to link sale to party:', error);
    return NextResponse.json({ error: 'Failed to link sale' }, { status: 500 });
  }

  // Recalculate party revenue totals
  const { data: partySales } = await db
    .from('sales')
    .select('subtotal')
    .eq('party_request_id', partyRequestId)
    .eq('tenant_id', member.tenant_id)
    .eq('status', 'completed')
    .eq('payment_status', 'completed');

  const totalRevenue = (partySales || []).reduce((sum, s) => sum + Number(s.subtotal), 0);
  const totalSales = (partySales || []).length;

  await db
    .from('party_requests')
    .update({ total_revenue: totalRevenue, total_sales: totalSales })
    .eq('id', partyRequestId);

  return NextResponse.json({ success: true, total_revenue: totalRevenue, total_sales: totalSales });
}
