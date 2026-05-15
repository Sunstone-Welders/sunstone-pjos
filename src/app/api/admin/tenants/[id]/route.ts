// src/app/api/admin/tenants/[id]/route.ts
// GET: Single tenant with full details
// PATCH: Update tenant (plan tier, suspension)

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { verifyPlatformAdmin, AdminAuthError } from '@/lib/admin/verify-platform-admin';
import { createServiceRoleClient } from '@/lib/supabase/server';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-02-24.acacia' as any,
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await verifyPlatformAdmin();
    const { id } = await params;
    const serviceClient = await createServiceRoleClient();

    // Full tenant record — explicit column list to avoid leaking future sensitive fields
    const { data: tenant, error } = await serviceClient
      .from('tenants')
      .select(`
        id, name, slug, owner_id, subscription_tier, subscription_status, trial_ends_at,
        stripe_account_id, stripe_customer_id, stripe_subscription_id,
        is_suspended, suspended_at, suspended_reason,
        crm_enabled, created_at, updated_at, phone, email, website,
        dedicated_phone_number, dedicated_phone_sid, platform_fee_percent,
        admin_tier_override, last_owner_login_at,
        referred_by_ambassador_id, referral_code_used,
        onboarding_welcome_sent_at, onboarding_inventory_nudge_sent_at,
        onboarding_first_sale_nudge_sent_at, onboarding_week1_active_sent_at,
        onboarding_week1_inactive_sent_at, onboarding_stripe_nudge_sent_at,
        onboarding_week2_active_sent_at, onboarding_week2_inactive_sent_at,
        trial_email_7day_sent_at, trial_email_1day_sent_at,
        trial_email_expired_sent_at, trial_reactivated_at
      `)
      .eq('id', id)
      .single();

    if (error || !tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    // Get owner info
    const { data: { user: owner } } = await serviceClient.auth.admin.getUserById(tenant.owner_id);

    // Get counts
    const [events, inventory, clients, sales, members] = await Promise.all([
      serviceClient.from('events').select('id', { count: 'exact', head: true }).eq('tenant_id', id),
      serviceClient.from('inventory_items').select('id', { count: 'exact', head: true }).eq('tenant_id', id),
      serviceClient.from('clients').select('id', { count: 'exact', head: true }).eq('tenant_id', id),
      serviceClient.from('sales').select('id, total, created_at').eq('tenant_id', id).eq('status', 'completed').order('created_at', { ascending: false }).limit(10),
      serviceClient.from('tenant_members').select('user_id, role, display_name, invited_email, accepted_at').eq('tenant_id', id),
    ]);

    // Look up ambassador attribution if referred
    let referredByAmbassador: { name: string; referral_code: string } | null = null;
    let referralDate: string | null = null;
    if (tenant.referred_by_ambassador_id) {
      const { data: amb } = await serviceClient
        .from('ambassadors')
        .select('name, referral_code')
        .eq('id', tenant.referred_by_ambassador_id)
        .single();
      if (amb) referredByAmbassador = amb;

      const { data: ref } = await serviceClient
        .from('referrals')
        .select('created_at')
        .eq('referred_tenant_id', id)
        .order('created_at', { ascending: true })
        .limit(1)
        .single();
      if (ref) referralDate = ref.created_at;
    }

    // Calculate total revenue
    const totalRevenue = (sales.data || []).reduce((sum, s) => sum + Number(s.total), 0);

    // Resolve member emails
    const membersList = (members.data || []).map((m: any) => ({
      ...m,
      is_owner: m.user_id === tenant.owner_id,
      email: m.invited_email || null,
    }));

    return NextResponse.json({
      tenant,
      owner: owner ? { id: owner.id, email: owner.email, phone: owner.phone || null, created_at: owner.created_at } : null,
      counts: {
        events: events.count || 0,
        inventory_items: inventory.count || 0,
        clients: clients.count || 0,
        members: (members.data || []).length,
        totalRevenue,
        salesCount: (sales.data || []).length,
      },
      members: membersList,
      recent_sales: sales.data || [],
      referredBy: referredByAmbassador ? {
        ambassadorName: referredByAmbassador.name,
        referralCode: tenant.referral_code_used || referredByAmbassador.referral_code,
        referralDate,
      } : null,
    });
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('Admin tenant detail error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await verifyPlatformAdmin();
    const { id } = await params;
    const body = await request.json();
    const serviceClient = await createServiceRoleClient();

    // Build update object — only allow specific fields
    const update: Record<string, any> = {};

    if (body.subscription_tier !== undefined) {
      const validTiers = ['starter', 'pro', 'business'];
      if (!validTiers.includes(body.subscription_tier)) {
        return NextResponse.json({ error: 'Invalid subscription tier' }, { status: 400 });
      }
      update.subscription_tier = body.subscription_tier;
    }

    if (body.is_suspended !== undefined) {
      update.is_suspended = Boolean(body.is_suspended);
      if (body.is_suspended) {
        update.suspended_at = new Date().toISOString();
        update.suspended_reason = body.suspended_reason || null;
      } else {
        update.suspended_at = null;
        update.suspended_reason = null;
      }
    }

    if (body.crm_enabled !== undefined) {
      update.crm_enabled = Boolean(body.crm_enabled);
    }

    if (body.trial_ends_at !== undefined) {
      // Allow setting to a valid ISO date string or null
      if (body.trial_ends_at !== null) {
        const parsed = new Date(body.trial_ends_at);
        if (isNaN(parsed.getTime())) {
          return NextResponse.json({ error: 'Invalid trial_ends_at date' }, { status: 400 });
        }
        update.trial_ends_at = parsed.toISOString();

        // Reactivation: if setting a future trial date on a canceled/expired tenant,
        // also set subscription_status to 'trialing' (unless admin_tier_override is active)
        if (parsed > new Date() && !body.admin_tier_override) {
          const { data: current } = await serviceClient
            .from('tenants')
            .select('subscription_status, admin_tier_override')
            .eq('id', id)
            .single();

          if (current && !current.admin_tier_override &&
              (current.subscription_status === 'canceled' || current.subscription_status === 'expired')) {
            update.subscription_status = 'trialing';
          }
        }
      } else {
        update.trial_ends_at = null;
      }
    }

    if (body.admin_tier_override !== undefined) {
      update.admin_tier_override = Boolean(body.admin_tier_override);
      // When enabling override, ensure tenant is active with no trial expiry
      if (update.admin_tier_override) {
        update.subscription_status = 'active';
        update.trial_ends_at = null;

        // Cancel active Stripe subscriptions so the tenant stops being billed
        const { data: existing } = await serviceClient
          .from('tenants')
          .select('stripe_subscription_id, crm_subscription_id')
          .eq('id', id)
          .single();

        if (existing?.stripe_subscription_id) {
          try {
            await stripe.subscriptions.cancel(existing.stripe_subscription_id);
            console.log(`Admin override: cancelled Stripe subscription ${existing.stripe_subscription_id} for tenant ${id}`);
          } catch (stripeErr: any) {
            console.error(`Admin override: failed to cancel Stripe subscription ${existing.stripe_subscription_id} for tenant ${id}:`, stripeErr.message);
          }
          update.stripe_subscription_id = null;
        }

        if (existing?.crm_subscription_id) {
          try {
            await stripe.subscriptions.cancel(existing.crm_subscription_id);
            console.log(`Admin override: cancelled CRM subscription ${existing.crm_subscription_id} for tenant ${id}`);
          } catch (stripeErr: any) {
            console.error(`Admin override: failed to cancel CRM subscription ${existing.crm_subscription_id} for tenant ${id}:`, stripeErr.message);
          }
          update.crm_subscription_id = null;
        }
      }
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    update.updated_at = new Date().toISOString();

    const { data: tenant, error } = await serviceClient
      .from('tenants')
      .update(update)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating tenant:', error);
      return NextResponse.json({ error: 'Failed to update tenant' }, { status: 500 });
    }

    return NextResponse.json({ tenant });
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('Admin tenant update error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}