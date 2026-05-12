// src/app/api/admin/revenue/route.ts
// GET: Aggregated revenue stats — subscription MRR, sales volume, breakdowns

import { NextRequest, NextResponse } from 'next/server';
import { verifyPlatformAdmin, AdminAuthError } from '@/lib/admin/verify-platform-admin';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { isDemoTenant } from '@/lib/demo/personas';

// Subscription pricing for MRR calculation
const TIER_PRICES: Record<string, number> = {
  starter: 99,
  pro: 169,
  business: 279,
};

export async function GET(request: NextRequest) {
  try {
    await verifyPlatformAdmin();
    const serviceClient = await createServiceRoleClient();

    // Get all completed + paid sales
    const { data: sales, error: salesError } = await serviceClient
      .from('sales')
      .select('id, tenant_id, total, subtotal, created_at')
      .eq('status', 'completed')
      .eq('payment_status', 'completed')
      .order('created_at', { ascending: true });

    if (salesError) {
      console.error('Revenue query error:', salesError);
      return NextResponse.json({ error: 'Failed to fetch revenue data' }, { status: 500 });
    }

    // Get tenants for name, plan tier, and subscription status
    const { data: tenants } = await serviceClient
      .from('tenants')
      .select('id, name, subscription_tier, subscription_status, crm_enabled, admin_tier_override, stripe_subscription_id');

    const tenantMap: Record<string, { name: string; tier: string; status: string; crm_enabled: boolean }> = {};
    let mrr = 0;
    const subscribersByTier: Record<string, number> = { starter: 0, pro: 0, business: 0 };

    for (const t of tenants || []) {
      const tier = t.subscription_tier || 'starter';
      tenantMap[t.id] = { name: t.name, tier, status: t.subscription_status, crm_enabled: t.crm_enabled };

      // Count ONLY actually-paying Stripe subscribers for MRR:
      // - Must be active (not trialing — trials don't generate revenue)
      // - Must have a real Stripe subscription
      // - Must NOT be admin-overridden (those are free promotional)
      // - Must NOT be a demo account
      const isPaying =
        t.subscription_status === 'active' &&
        t.stripe_subscription_id &&
        !t.admin_tier_override &&
        !isDemoTenant(t.id);

      if (isPaying) {
        subscribersByTier[tier] = (subscribersByTier[tier] || 0) + 1;
        mrr += TIER_PRICES[tier] || 0;
        // Add CRM add-on revenue for non-Business tenants
        if (t.crm_enabled && tier !== 'business') {
          mrr += 69;
        }
      }
    }

    const activeTenantCount = Object.values(subscribersByTier).reduce((a, b) => a + b, 0);
    const revenuePerTenant = activeTenantCount > 0 ? Math.round((mrr / activeTenantCount) * 100) / 100 : 0;

    // ── Totals ──
    let totalSalesVolume = 0;
    let totalSalesCount = (sales || []).length;

    // ── By tenant ──
    const byTenant: Record<string, { name: string; tier: string; sales_volume: number; count: number }> = {};

    // ── By plan tier ──
    const byTier: Record<string, { sales_volume: number; count: number; subscribers: number }> = {
      starter: { sales_volume: 0, count: 0, subscribers: subscribersByTier.starter },
      pro: { sales_volume: 0, count: 0, subscribers: subscribersByTier.pro },
      business: { sales_volume: 0, count: 0, subscribers: subscribersByTier.business },
    };

    // ── By date (daily aggregation) ──
    const byDate: Record<string, { sales_volume: number; count: number; byTier: Record<string, { sales_volume: number; count: number }> }> = {};

    for (const sale of sales || []) {
      const total = Number(sale.total) || 0;
      const date = sale.created_at?.substring(0, 10) || 'unknown';

      totalSalesVolume += total;

      // By tenant
      if (!byTenant[sale.tenant_id]) {
        const info = tenantMap[sale.tenant_id] || { name: 'Unknown', tier: 'starter' };
        byTenant[sale.tenant_id] = { name: info.name, tier: info.tier, sales_volume: 0, count: 0 };
      }
      byTenant[sale.tenant_id].sales_volume += total;
      byTenant[sale.tenant_id].count++;

      // By tier
      const tier = tenantMap[sale.tenant_id]?.tier || 'starter';
      if (byTier[tier]) {
        byTier[tier].sales_volume += total;
        byTier[tier].count++;
      }

      // By date (with per-tier breakdown)
      if (!byDate[date]) {
        byDate[date] = {
          sales_volume: 0, count: 0,
          byTier: {
            starter: { sales_volume: 0, count: 0 },
            pro: { sales_volume: 0, count: 0 },
            business: { sales_volume: 0, count: 0 },
          },
        };
      }
      byDate[date].sales_volume += total;
      byDate[date].count++;
      if (byDate[date].byTier[tier]) {
        byDate[date].byTier[tier].sales_volume += total;
        byDate[date].byTier[tier].count++;
      }
    }

    // Sort by-tenant by sales volume descending
    const topTenants = Object.entries(byTenant)
      .map(([id, data]) => ({ tenant_id: id, ...data }))
      .sort((a, b) => b.sales_volume - a.sales_volume);

    // Convert by-date to sorted array
    const dailyRevenue = Object.entries(byDate)
      .map(([date, data]) => ({ date, ...data }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return NextResponse.json({
      totals: {
        sales_volume: Math.round(totalSalesVolume * 100) / 100,
        sales_count: totalSalesCount,
        mrr,
        revenue_per_tenant: revenuePerTenant,
      },
      subscribers: subscribersByTier,
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
