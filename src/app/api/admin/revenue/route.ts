// src/app/api/admin/revenue/route.ts
// GET: Aggregated revenue stats — platform fees, GMV, breakdowns

import { NextRequest, NextResponse } from 'next/server';
import { verifyPlatformAdmin, AdminAuthError } from '@/lib/admin/verify-platform-admin';
import { createServiceRoleClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    await verifyPlatformAdmin();
    const serviceClient = await createServiceRoleClient();

    // Get all completed sales
    const { data: sales, error: salesError } = await serviceClient
      .from('sales')
      .select('id, tenant_id, total, platform_fee_amount, subtotal, created_at')
      .eq('status', 'completed')
      .order('created_at', { ascending: true });

    if (salesError) {
      console.error('Revenue query error:', salesError);
      return NextResponse.json({ error: 'Failed to fetch revenue data' }, { status: 500 });
    }

    // Get tenants for name and plan tier lookups
    const { data: tenants } = await serviceClient
      .from('tenants')
      .select('id, name, subscription_tier');

    const tenantMap: Record<string, { name: string; tier: string }> = {};
    for (const t of tenants || []) {
      tenantMap[t.id] = { name: t.name, tier: t.subscription_tier };
    }

    // ── Totals ──
    let totalGMV = 0;
    let totalPlatformFees = 0;
    let totalSalesCount = (sales || []).length;

    // ── By tenant ──
    const byTenant: Record<string, { name: string; tier: string; gmv: number; fees: number; count: number }> = {};

    // ── By plan tier ──
    const byTier: Record<string, { gmv: number; fees: number; count: number }> = {
      starter: { gmv: 0, fees: 0, count: 0 },
      pro: { gmv: 0, fees: 0, count: 0 },
      business: { gmv: 0, fees: 0, count: 0 },
    };

    // ── By date (daily aggregation) ──
    const byDate: Record<string, { gmv: number; fees: number; count: number }> = {};

    for (const sale of sales || []) {
      const total = Number(sale.total) || 0;
      const fee = Number(sale.platform_fee_amount) || 0;
      const date = sale.created_at?.substring(0, 10) || 'unknown'; // YYYY-MM-DD

      totalGMV += total;
      totalPlatformFees += fee;

      // By tenant
      if (!byTenant[sale.tenant_id]) {
        const info = tenantMap[sale.tenant_id] || { name: 'Unknown', tier: 'starter' };
        byTenant[sale.tenant_id] = { name: info.name, tier: info.tier, gmv: 0, fees: 0, count: 0 };
      }
      byTenant[sale.tenant_id].gmv += total;
      byTenant[sale.tenant_id].fees += fee;
      byTenant[sale.tenant_id].count++;

      // By tier
      const tier = tenantMap[sale.tenant_id]?.tier || 'starter';
      if (byTier[tier]) {
        byTier[tier].gmv += total;
        byTier[tier].fees += fee;
        byTier[tier].count++;
      }

      // By date
      if (!byDate[date]) {
        byDate[date] = { gmv: 0, fees: 0, count: 0 };
      }
      byDate[date].gmv += total;
      byDate[date].fees += fee;
      byDate[date].count++;
    }

    // Sort by-tenant by fees descending
    const topTenants = Object.entries(byTenant)
      .map(([id, data]) => ({ tenant_id: id, ...data }))
      .sort((a, b) => b.fees - a.fees);

    // Convert by-date to sorted array
    const dailyRevenue = Object.entries(byDate)
      .map(([date, data]) => ({ date, ...data }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return NextResponse.json({
      totals: {
        gmv: Math.round(totalGMV * 100) / 100,
        platform_fees: Math.round(totalPlatformFees * 100) / 100,
        sales_count: totalSalesCount,
      },
      by_tier: byTier,
      by_tenant: topTenants,
      daily: dailyRevenue,
    });
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('Admin revenue error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}