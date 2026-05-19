// ============================================================================
// Custom Storefront Domain API — /api/storefront/domain
// ============================================================================
// Manage custom domain for artist storefronts. Business tier only.
// GET — current domain status
// POST — set/update custom domain
// PUT — verify DNS / refresh status
// DELETE — remove custom domain
// ============================================================================

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase, createServiceRoleClient } from '@/lib/supabase/server';
import { getSubscriptionTier, canAccessFeature } from '@/lib/subscription';
import {
  addDomainToProject,
  removeDomainFromProject,
  getDomainStatus,
  verifyDomainDNS,
  isValidDomain,
  normalizeDomain,
  isSubdomain,
} from '@/lib/vercel-domains';

// ── Helpers ──────────────────────────────────────────────────────────────────

async function getAuthenticatedTenant(supabase: any, userId: string) {
  const { data: member } = await supabase
    .from('tenant_members')
    .select('tenant_id, role')
    .eq('user_id', userId)
    .limit(1)
    .single();
  if (!member) return null;

  const db = await createServiceRoleClient();
  const { data: tenant } = await db
    .from('tenants')
    .select(
      'id, slug, subscription_tier, subscription_status, subscription_period_end, trial_ends_at, admin_tier_override, custom_domain, custom_domain_status, custom_domain_error, custom_domain_verified_at'
    )
    .eq('id', member.tenant_id)
    .single();

  return tenant ? { ...tenant, role: member.role } : null;
}

function dnsInstructions(domain: string, verification?: { type: string; domain: string; value: string }[]) {
  const instructions: string[] = [];

  if (isSubdomain(domain)) {
    instructions.push(`Add a CNAME record for "${domain}" pointing to "cname.vercel-dns.com".`);
  } else {
    instructions.push(`Add an A record for "${domain}" pointing to "76.76.21.21".`);
  }

  if (verification?.length) {
    for (const v of verification) {
      instructions.push(`Add a TXT record for "${v.domain}" with value "${v.value}".`);
    }
  }

  instructions.push('DNS changes can take up to 48 hours to propagate.');

  return instructions;
}

// ── GET — Get current domain status ──────────────────────────────────────────

export async function GET() {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const tenant = await getAuthenticatedTenant(supabase, user.id);
    if (!tenant) return NextResponse.json({ error: 'No tenant membership' }, { status: 403 });

    const tier = getSubscriptionTier(tenant);
    if (!canAccessFeature(tier, 'custom_storefront_domain')) {
      return NextResponse.json({ error: 'Custom domains require the Business plan' }, { status: 403 });
    }

    // If there's an active domain, fetch live status from Vercel
    let liveStatus = null;
    if (tenant.custom_domain && tenant.custom_domain_status !== 'none') {
      const status = await getDomainStatus(tenant.custom_domain);
      liveStatus = status;
    }

    return NextResponse.json({
      custom_domain: tenant.custom_domain,
      status: tenant.custom_domain_status,
      error: tenant.custom_domain_error,
      verified_at: tenant.custom_domain_verified_at,
      dns_instructions: tenant.custom_domain && tenant.custom_domain_status === 'pending_dns'
        ? dnsInstructions(tenant.custom_domain)
        : null,
      live_status: liveStatus,
    });
  } catch (err: any) {
    console.error('[storefront/domain] GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ── POST — Set/update custom domain ─────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const tenant = await getAuthenticatedTenant(supabase, user.id);
    if (!tenant) return NextResponse.json({ error: 'No tenant membership' }, { status: 403 });
    if (tenant.role !== 'owner' && tenant.role !== 'admin') {
      return NextResponse.json({ error: 'Only owners and admins can manage custom domains' }, { status: 403 });
    }

    const tier = getSubscriptionTier(tenant);
    if (!canAccessFeature(tier, 'custom_storefront_domain')) {
      return NextResponse.json({ error: 'Custom domains require the Business plan' }, { status: 403 });
    }

    const { domain: rawDomain } = await request.json();
    if (!rawDomain || typeof rawDomain !== 'string') {
      return NextResponse.json({ error: 'Missing required field: domain' }, { status: 400 });
    }

    const domain = normalizeDomain(rawDomain);
    if (!isValidDomain(domain)) {
      return NextResponse.json({ error: 'Invalid domain format. Enter a domain like "sparkjewelry.com" or "shop.mybusiness.com".' }, { status: 400 });
    }

    const db = await createServiceRoleClient();

    // Check if domain is already claimed by another tenant
    const { data: existing } = await db
      .from('tenants')
      .select('id')
      .eq('custom_domain', domain)
      .neq('id', tenant.id)
      .limit(1)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ error: 'This domain is already connected to another Sunstone account.' }, { status: 409 });
    }

    // If tenant already has a different domain, remove the old one from Vercel first
    if (tenant.custom_domain && tenant.custom_domain !== domain) {
      await removeDomainFromProject(tenant.custom_domain);
    }

    // Add domain to Vercel project
    const result = await addDomainToProject(domain);
    if (!result.success) {
      return NextResponse.json({ error: result.error || 'Failed to register domain with hosting provider' }, { status: 400 });
    }

    // Save to DB
    await db
      .from('tenants')
      .update({
        custom_domain: domain,
        custom_domain_status: result.verified ? 'provisioning' : 'pending_dns',
        custom_domain_error: null,
        custom_domain_verified_at: result.verified ? new Date().toISOString() : null,
      })
      .eq('id', tenant.id);

    const instructions = result.verified ? null : dnsInstructions(domain, result.verification);

    return NextResponse.json({
      custom_domain: domain,
      status: result.verified ? 'provisioning' : 'pending_dns',
      verified: result.verified,
      dns_instructions: instructions,
    });
  } catch (err: any) {
    console.error('[storefront/domain] POST error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ── PUT — Verify DNS / refresh status ────────────────────────────────────────

export async function PUT() {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const tenant = await getAuthenticatedTenant(supabase, user.id);
    if (!tenant) return NextResponse.json({ error: 'No tenant membership' }, { status: 403 });
    if (tenant.role !== 'owner' && tenant.role !== 'admin') {
      return NextResponse.json({ error: 'Only owners and admins can manage custom domains' }, { status: 403 });
    }

    const tier = getSubscriptionTier(tenant);
    if (!canAccessFeature(tier, 'custom_storefront_domain')) {
      return NextResponse.json({ error: 'Custom domains require the Business plan' }, { status: 403 });
    }

    if (!tenant.custom_domain) {
      return NextResponse.json({ error: 'No custom domain configured' }, { status: 400 });
    }

    // Trigger verification with Vercel
    const verifyResult = await verifyDomainDNS(tenant.custom_domain);
    const statusResult = await getDomainStatus(tenant.custom_domain);

    const db = await createServiceRoleClient();

    let newStatus: string;
    let errorMsg: string | null = null;

    if (verifyResult.verified && statusResult.configured) {
      // Fully verified + configured = active
      newStatus = 'active';
    } else if (verifyResult.verified && !statusResult.configured) {
      // DNS verified but SSL/config still provisioning
      newStatus = 'provisioning';
    } else {
      // DNS not yet verified
      newStatus = 'pending_dns';
      if (statusResult.error) errorMsg = statusResult.error;
    }

    await db
      .from('tenants')
      .update({
        custom_domain_status: newStatus,
        custom_domain_error: errorMsg,
        custom_domain_verified_at: newStatus === 'active' && !tenant.custom_domain_verified_at
          ? new Date().toISOString()
          : tenant.custom_domain_verified_at,
      })
      .eq('id', tenant.id);

    return NextResponse.json({
      custom_domain: tenant.custom_domain,
      status: newStatus,
      verified: verifyResult.verified,
      configured: statusResult.configured,
      error: errorMsg,
      dns_instructions: newStatus === 'pending_dns'
        ? dnsInstructions(tenant.custom_domain)
        : null,
      message: newStatus === 'pending_dns'
        ? 'DNS records not detected yet. Changes can take up to 48 hours to propagate.'
        : newStatus === 'provisioning'
        ? 'DNS verified! SSL certificate is being provisioned. This usually takes a few minutes.'
        : 'Your custom domain is live!',
    });
  } catch (err: any) {
    console.error('[storefront/domain] PUT error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ── DELETE — Remove custom domain ────────────────────────────────────────────

export async function DELETE() {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const tenant = await getAuthenticatedTenant(supabase, user.id);
    if (!tenant) return NextResponse.json({ error: 'No tenant membership' }, { status: 403 });
    if (tenant.role !== 'owner' && tenant.role !== 'admin') {
      return NextResponse.json({ error: 'Only owners and admins can manage custom domains' }, { status: 403 });
    }

    const tier = getSubscriptionTier(tenant);
    if (!canAccessFeature(tier, 'custom_storefront_domain')) {
      return NextResponse.json({ error: 'Custom domains require the Business plan' }, { status: 403 });
    }

    if (!tenant.custom_domain) {
      return NextResponse.json({ error: 'No custom domain configured' }, { status: 400 });
    }

    // Remove from Vercel
    await removeDomainFromProject(tenant.custom_domain);

    // Clear from DB
    const db = await createServiceRoleClient();
    await db
      .from('tenants')
      .update({
        custom_domain: null,
        custom_domain_status: 'none',
        custom_domain_error: null,
        custom_domain_verified_at: null,
      })
      .eq('id', tenant.id);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[storefront/domain] DELETE error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
