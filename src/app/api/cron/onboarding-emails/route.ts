// ============================================================================
// Onboarding Drip Emails Cron — GET /api/cron/onboarding-emails
// ============================================================================
// Vercel cron: runs daily at 4pm UTC (9am MST / 10am MDT).
// Sends behavior-triggered onboarding emails for days 0–15 of trial.
// One email per tenant per cron run. Staggered 1hr after trial-emails cron.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import {
  sendOnboardingEmail,
  type OnboardingEmailParams,
  type OnboardingEmailType,
} from '@/lib/emails/onboarding-emails';

const CRON_SECRET = process.env.CRON_SECRET;

// Demo tenant IDs to exclude
const DEMO_TENANT_IDS = [
  process.env.NEXT_PUBLIC_DEMO_NEWBIE_TENANT_ID,
  process.env.NEXT_PUBLIC_DEMO_MID_TENANT_ID,
  process.env.NEXT_PUBLIC_DEMO_PRO_TENANT_ID,
].filter(Boolean) as string[];

// Column name mapping for each email type
const SENT_COLUMNS: Record<OnboardingEmailType, string> = {
  welcome: 'onboarding_welcome_sent_at',
  inventory_nudge: 'onboarding_inventory_nudge_sent_at',
  first_sale_nudge: 'onboarding_first_sale_nudge_sent_at',
  week1_active: 'onboarding_week1_active_sent_at',
  week1_inactive: 'onboarding_week1_inactive_sent_at',
  stripe_nudge: 'onboarding_stripe_nudge_sent_at',
  week2_active: 'onboarding_week2_active_sent_at',
  week2_inactive: 'onboarding_week2_inactive_sent_at',
};

export async function GET(request: NextRequest) {
  // Verify cron secret (Vercel sends Authorization header)
  const authHeader = request.headers.get('authorization');
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  console.log('[Onboarding Emails] Starting daily onboarding email check...');

  const results = {
    tenants_checked: 0,
    welcome_sent: 0,
    inventory_nudge_sent: 0,
    first_sale_nudge_sent: 0,
    week1_active_sent: 0,
    week1_inactive_sent: 0,
    stripe_nudge_sent: 0,
    week2_active_sent: 0,
    week2_inactive_sent: 0,
    errors: [] as string[],
  };

  try {
    const supabase = await createServiceRoleClient();

    // Query tenants in their first 16 days of trial
    let query = supabase
      .from('tenants')
      .select(`
        id, name, created_at, trial_ends_at,
        stripe_subscription_id, subscription_status,
        stripe_account_id, admin_tier_override,
        last_owner_login_at,
        onboarding_welcome_sent_at,
        onboarding_inventory_nudge_sent_at,
        onboarding_first_sale_nudge_sent_at,
        onboarding_week1_active_sent_at,
        onboarding_week1_inactive_sent_at,
        onboarding_stripe_nudge_sent_at,
        onboarding_week2_active_sent_at,
        onboarding_week2_inactive_sent_at
      `)
      .not('trial_ends_at', 'is', null)
      .gte('created_at', new Date(Date.now() - 16 * 24 * 60 * 60 * 1000).toISOString());

    // Exclude demo tenants
    if (DEMO_TENANT_IDS.length > 0) {
      query = query.not('id', 'in', `(${DEMO_TENANT_IDS.join(',')})`);
    }

    const { data: tenants, error: tenantError } = await query;

    if (tenantError) {
      console.error('[Onboarding Emails] Tenant query error:', tenantError);
      return NextResponse.json({ error: 'Tenant query failed' }, { status: 500 });
    }

    if (!tenants || tenants.length === 0) {
      console.log('[Onboarding Emails] No tenants in onboarding window.');
      return NextResponse.json({ success: true, ...results });
    }

    const now = new Date();

    for (const tenant of tenants) {
      try {
        // Skip tenants that already have an active subscription (converted — no more onboarding)
        // Also skip tenants with admin tier override (manually managed)
        if (
          tenant.subscription_status === 'active' ||
          tenant.subscription_status === 'past_due' ||
          tenant.stripe_subscription_id ||
          tenant.admin_tier_override === true
        ) {
          continue;
        }

        results.tenants_checked++;

        const createdAt = new Date(tenant.created_at);
        const daysSinceSignup = Math.floor((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24));

        // ── Determine which email to send (only ONE per run) ──

        let emailType: OnboardingEmailType | null = null;

        // Welcome (day 0-1)
        if (daysSinceSignup <= 1 && !tenant.onboarding_welcome_sent_at) {
          emailType = 'welcome';
        }
        // Inventory nudge (day 2-3): only if 0 inventory items
        else if (daysSinceSignup >= 2 && daysSinceSignup <= 3 && !tenant.onboarding_inventory_nudge_sent_at) {
          const { count } = await supabase
            .from('inventory_items')
            .select('id', { count: 'exact', head: true })
            .eq('tenant_id', tenant.id)
            .eq('is_active', true);
          if ((count ?? 0) === 0) {
            emailType = 'inventory_nudge';
          }
        }
        // First sale nudge (day 4-5): only if 0 completed sales AND has inventory
        else if (daysSinceSignup >= 4 && daysSinceSignup <= 5 && !tenant.onboarding_first_sale_nudge_sent_at) {
          const [{ count: saleCount }, { count: invCount }] = await Promise.all([
            supabase
              .from('sales')
              .select('id', { count: 'exact', head: true })
              .eq('tenant_id', tenant.id)
              .eq('status', 'completed'),
            supabase
              .from('inventory_items')
              .select('id', { count: 'exact', head: true })
              .eq('tenant_id', tenant.id)
              .eq('is_active', true),
          ]);
          if ((saleCount ?? 0) === 0 && (invCount ?? 0) > 0) {
            emailType = 'first_sale_nudge';
          }
        }
        // Week 1 active (day 6-8): logged in within 4 days AND has activity
        else if (daysSinceSignup >= 6 && daysSinceSignup <= 8 && !tenant.onboarding_week1_active_sent_at && !tenant.onboarding_week1_inactive_sent_at) {
          const lastLogin = tenant.last_owner_login_at ? new Date(tenant.last_owner_login_at) : null;
          const loginRecent = lastLogin && (now.getTime() - lastLogin.getTime()) < 4 * 24 * 60 * 60 * 1000;

          if (loginRecent) {
            const [{ count: invCount }, { count: saleCount }] = await Promise.all([
              supabase
                .from('inventory_items')
                .select('id', { count: 'exact', head: true })
                .eq('tenant_id', tenant.id)
                .eq('is_active', true),
              supabase
                .from('sales')
                .select('id', { count: 'exact', head: true })
                .eq('tenant_id', tenant.id)
                .eq('status', 'completed'),
            ]);
            if ((invCount ?? 0) > 0 || (saleCount ?? 0) > 0) {
              emailType = 'week1_active';
            }
          }
        }
        // Week 1 inactive (day 6-8): no login in 4+ days
        else if (daysSinceSignup >= 6 && daysSinceSignup <= 8 && !tenant.onboarding_week1_inactive_sent_at && !tenant.onboarding_week1_active_sent_at) {
          const lastLogin = tenant.last_owner_login_at ? new Date(tenant.last_owner_login_at) : null;
          const loginStale = !lastLogin || (now.getTime() - lastLogin.getTime()) >= 4 * 24 * 60 * 60 * 1000;

          if (loginStale) {
            emailType = 'week1_inactive';
          }
        }
        // Stripe nudge (day 9-11): no stripe connected AND has sales
        else if (daysSinceSignup >= 9 && daysSinceSignup <= 11 && !tenant.onboarding_stripe_nudge_sent_at) {
          if (!tenant.stripe_account_id) {
            const { count: saleCount } = await supabase
              .from('sales')
              .select('id', { count: 'exact', head: true })
              .eq('tenant_id', tenant.id)
              .eq('status', 'completed');
            if ((saleCount ?? 0) > 0) {
              emailType = 'stripe_nudge';
            }
          }
        }
        // Week 2 active (day 13-15): logged in within 7 days
        else if (daysSinceSignup >= 13 && daysSinceSignup <= 15 && !tenant.onboarding_week2_active_sent_at && !tenant.onboarding_week2_inactive_sent_at) {
          const lastLogin = tenant.last_owner_login_at ? new Date(tenant.last_owner_login_at) : null;
          const loginRecent = lastLogin && (now.getTime() - lastLogin.getTime()) < 7 * 24 * 60 * 60 * 1000;

          if (loginRecent) {
            emailType = 'week2_active';
          }
        }
        // Week 2 inactive (day 13-15): no login in 7+ days
        else if (daysSinceSignup >= 13 && daysSinceSignup <= 15 && !tenant.onboarding_week2_inactive_sent_at && !tenant.onboarding_week2_active_sent_at) {
          const lastLogin = tenant.last_owner_login_at ? new Date(tenant.last_owner_login_at) : null;
          const loginStale = !lastLogin || (now.getTime() - lastLogin.getTime()) >= 7 * 24 * 60 * 60 * 1000;

          if (loginStale) {
            emailType = 'week2_inactive';
          }
        }

        if (!emailType) continue;

        // ── Look up owner email from auth.users via tenant_members ──

        const { data: memberData } = await supabase
          .from('tenant_members')
          .select('user_id')
          .eq('tenant_id', tenant.id)
          .eq('role', 'owner')
          .limit(1)
          .single();

        // Fallback: if no 'owner' role, try 'admin' (signup creates admin role)
        let userId = memberData?.user_id;
        if (!userId) {
          const { data: adminData } = await supabase
            .from('tenant_members')
            .select('user_id')
            .eq('tenant_id', tenant.id)
            .eq('role', 'admin')
            .limit(1)
            .single();
          userId = adminData?.user_id;
        }

        if (!userId) {
          results.errors.push(`${tenant.id}: No owner/admin found`);
          continue;
        }

        const { data: userData, error: userError } = await supabase.auth.admin.getUserById(userId);

        if (userError || !userData?.user?.email) {
          results.errors.push(`${tenant.id}: Could not fetch owner email`);
          continue;
        }

        const ownerEmail = userData.user.email;
        const ownerFirstName = (userData.user.user_metadata?.first_name as string) || null;

        const emailParams: OnboardingEmailParams = {
          businessName: tenant.name || 'your studio',
          ownerEmail,
          ownerFirstName,
          tenantCreatedAt: createdAt,
        };

        // ── Send the email ──

        await sendOnboardingEmail(emailParams, emailType);

        // ── Mark as sent ──

        await supabase
          .from('tenants')
          .update({ [SENT_COLUMNS[emailType]]: new Date().toISOString() })
          .eq('id', tenant.id);

        // Increment counter
        const counterKey = `${emailType}_sent` as keyof typeof results;
        (results[counterKey] as number)++;

        console.log(`[Onboarding Emails] Sent ${emailType} email to ${ownerEmail} (tenant: ${tenant.id})`);
      } catch (err: any) {
        results.errors.push(`${tenant.id}: ${err.message}`);
        console.error(`[Onboarding Emails] Error for tenant ${tenant.id}:`, err);
      }
    }

    const total = results.welcome_sent + results.inventory_nudge_sent +
      results.first_sale_nudge_sent + results.week1_active_sent +
      results.week1_inactive_sent + results.stripe_nudge_sent +
      results.week2_active_sent + results.week2_inactive_sent;

    console.log(`[Onboarding Emails] Complete: ${results.tenants_checked} checked, ${total} sent, ${results.errors.length} errors`);

    return NextResponse.json({ success: true, ...results });
  } catch (error: any) {
    console.error('[Onboarding Emails] Fatal error:', error);
    return NextResponse.json({ error: 'Onboarding email processing failed' }, { status: 500 });
  }
}
