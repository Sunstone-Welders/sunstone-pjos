// src/app/api/admin/suggestions/route.ts
// GET: Returns "Needs Attention" suggestions for admin dashboard
// Priority: trial_expired > trial_expiring > never_logged_in > no_sales > no_stripe

import { NextResponse } from 'next/server';
import { verifyPlatformAdmin, AdminAuthError } from '@/lib/admin/verify-platform-admin';
import { createServiceRoleClient } from '@/lib/supabase/server';

export type AttentionReason =
  | 'trial_expired'
  | 'trial_expiring'
  | 'never_logged_in'
  | 'no_sales'
  | 'no_stripe';

interface AttentionItem {
  tenantId: string;
  tenantName: string;
  reason: AttentionReason;
  reasonLabel: string;
  signupDaysAgo: number;
  urgency: number;
}

export async function GET() {
  try {
    await verifyPlatformAdmin();
    const serviceClient = await createServiceRoleClient();

    const { data: tenants, error } = await serviceClient
      .from('tenants')
      .select('id, name, slug, subscription_status, trial_ends_at, created_at, is_suspended, admin_tier_override, last_owner_login_at, sales_count, stripe_account_id, square_merchant_id');

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch tenants' }, { status: 500 });
    }

    const items: AttentionItem[] = [];
    const now = new Date();

    for (const t of tenants || []) {
      // Exclusions
      if (t.is_suspended) continue;
      if (t.admin_tier_override) continue;
      if (t.slug?.startsWith('demo-')) continue;

      const created = new Date(t.created_at);
      const signupDaysAgo = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));

      // Check conditions in priority order — only the most urgent one is kept
      // 1. Trial expired (highest priority)
      if (t.subscription_status === 'trialing' && t.trial_ends_at) {
        const trialEnd = new Date(t.trial_ends_at);
        if (trialEnd <= now) {
          items.push({
            tenantId: t.id,
            tenantName: t.name,
            reason: 'trial_expired',
            reasonLabel: 'Trial expired',
            signupDaysAgo,
            urgency: 1,
          });
          continue;
        }
      }

      // 2. Trial expiring soon (within 7 days)
      if (t.subscription_status === 'trialing' && t.trial_ends_at) {
        const trialEnd = new Date(t.trial_ends_at);
        const daysLeft = Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        if (daysLeft > 0 && daysLeft <= 7) {
          items.push({
            tenantId: t.id,
            tenantName: t.name,
            reason: 'trial_expiring',
            reasonLabel: `Trial expires in ${daysLeft}d`,
            signupDaysAgo,
            urgency: 2,
          });
          continue;
        }
      }

      // 3. Never logged in (signed up 2+ days ago)
      if (signupDaysAgo >= 2 && !t.last_owner_login_at) {
        items.push({
          tenantId: t.id,
          tenantName: t.name,
          reason: 'never_logged_in',
          reasonLabel: 'Never logged in',
          signupDaysAgo,
          urgency: 3,
        });
        continue;
      }

      // 4. No sales yet (signed up 7+ days ago)
      if (signupDaysAgo >= 7 && (t.sales_count === 0 || t.sales_count === null)) {
        items.push({
          tenantId: t.id,
          tenantName: t.name,
          reason: 'no_sales',
          reasonLabel: 'No sales yet',
          signupDaysAgo,
          urgency: 4,
        });
        continue;
      }

      // 5. No Stripe connected (signed up 7+ days ago)
      if (signupDaysAgo >= 7 && !t.stripe_account_id && !t.square_merchant_id) {
        items.push({
          tenantId: t.id,
          tenantName: t.name,
          reason: 'no_stripe',
          reasonLabel: 'No Stripe connected',
          signupDaysAgo,
          urgency: 5,
        });
        continue;
      }
    }

    // Sort by urgency
    items.sort((a, b) => a.urgency - b.urgency);

    return NextResponse.json({ suggestions: items });
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    console.error('[Admin Suggestions Error]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
