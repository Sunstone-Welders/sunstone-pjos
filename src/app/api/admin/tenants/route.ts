// src/app/api/admin/tenants/route.ts
// GET: List all tenants with aggregated stats
// All queries use service role client (bypasses RLS)

import { NextRequest, NextResponse } from 'next/server';
import { verifyPlatformAdmin, AdminAuthError } from '@/lib/admin/verify-platform-admin';
import { createServiceRoleClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    await verifyPlatformAdmin();
    const serviceClient = await createServiceRoleClient();

    // Fetch all tenants
    const { data: tenants, error: tenantsError } = await serviceClient
      .from('tenants')
      .select(`
        id, name, slug, owner_id, subscription_tier, subscription_status, trial_ends_at,
        square_merchant_id, stripe_account_id, stripe_onboarding_complete,
        stripe_subscription_id,
        onboarding_completed, is_suspended, suspended_at, suspended_reason,
        crm_enabled, brand_color, logo_url, created_at, updated_at,
        last_owner_login_at, admin_tier_override
      `)
      .order('created_at', { ascending: false });

    if (tenantsError) {
      console.error('Error fetching tenants:', tenantsError);
      return NextResponse.json({ error: 'Failed to fetch tenants' }, { status: 500 });
    }

    // Get owner emails via auth admin API
    const ownerIds = [...new Set((tenants || []).map(t => t.owner_id))];
    const ownerEmails: Record<string, string> = {};

    if (ownerIds.length > 0) {
      const { data: { users } } = await serviceClient.auth.admin.listUsers({
        perPage: 1000,
      });
      for (const u of users || []) {
        ownerEmails[u.id] = u.email || '';
      }
    }

    // Get aggregated counts per tenant
    const tenantIds = (tenants || []).map(t => t.id);

    // Sales counts and last sale date per tenant
    const { data: salesAgg } = await serviceClient
      .from('sales')
      .select('tenant_id, created_at')
      .in('tenant_id', tenantIds)
      .eq('status', 'completed');

    const salesByTenant: Record<string, { count: number; lastSale: string | null }> = {};
    for (const s of salesAgg || []) {
      if (!salesByTenant[s.tenant_id]) {
        salesByTenant[s.tenant_id] = { count: 0, lastSale: null };
      }
      salesByTenant[s.tenant_id].count++;
      if (!salesByTenant[s.tenant_id].lastSale || s.created_at > salesByTenant[s.tenant_id].lastSale!) {
        salesByTenant[s.tenant_id].lastSale = s.created_at;
      }
    }

    // Enrich tenants with stats
    const enrichedTenants = (tenants || []).map(t => ({
      ...t,
      owner_email: ownerEmails[t.owner_id] || 'Unknown',
      payment_processor: t.stripe_account_id
        ? 'Stripe'
        : t.square_merchant_id
          ? 'Square'
          : 'None',
      sales_count: salesByTenant[t.id]?.count || 0,
      last_active: salesByTenant[t.id]?.lastSale || null,
      last_owner_login_at: t.last_owner_login_at || null,
    }));

    return NextResponse.json({ tenants: enrichedTenants });
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('Admin tenants error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}