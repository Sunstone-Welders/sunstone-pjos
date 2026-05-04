// src/app/api/admin/suggestions/route.ts
// GET: Returns "Needs Attention" suggestions for admin dashboard
// Priority: past_due > trial_expiring > inactive > new_signups

import { NextResponse } from 'next/server';
import { verifyPlatformAdmin, AdminAuthError } from '@/lib/admin/verify-platform-admin';
import { createServiceRoleClient } from '@/lib/supabase/server';

interface Suggestion {
  type: 'past_due' | 'trial_expiring' | 'inactive' | 'new_signup';
  tenantId: string;
  tenantName: string;
  message: string;
  urgency: number; // lower = more urgent
}

export async function GET() {
  try {
    await verifyPlatformAdmin();
    const serviceClient = await createServiceRoleClient();

    const { data: tenants, error } = await serviceClient
      .from('tenants')
      .select('id, name, subscription_tier, subscription_status, trial_ends_at, updated_at, created_at, is_suspended, admin_tier_override');

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch tenants' }, { status: 500 });
    }

    const suggestions: Suggestion[] = [];
    const now = new Date();

    for (const t of tenants || []) {
      if (t.is_suspended) continue;
      // Skip tenants with admin tier override — they're intentionally managed
      if (t.admin_tier_override) continue;

      // Past due subscriptions
      if (t.subscription_status === 'past_due') {
        suggestions.push({
          type: 'past_due',
          tenantId: t.id,
          tenantName: t.name,
          message: `${t.name} — subscription past due`,
          urgency: 1,
        });
      }

      // Trial expiring in next 7 days
      if (t.subscription_status === 'trialing' && t.trial_ends_at) {
        const trialEnd = new Date(t.trial_ends_at);
        const daysLeft = Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        if (daysLeft > 0 && daysLeft <= 7) {
          suggestions.push({
            type: 'trial_expiring',
            tenantId: t.id,
            tenantName: t.name,
            message: `${t.name} — trial expires in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`,
            urgency: 2,
          });
        }
      }

      // Inactive tenants (no update in 14+ days, on paid plan)
      if (
        (t.subscription_tier === 'pro' || t.subscription_tier === 'business') &&
        t.subscription_status === 'active' &&
        t.updated_at
      ) {
        const lastActive = new Date(t.updated_at);
        const daysSince = Math.floor((now.getTime() - lastActive.getTime()) / (1000 * 60 * 60 * 24));
        if (daysSince >= 14) {
          const tierLabel = t.subscription_tier.charAt(0).toUpperCase() + t.subscription_tier.slice(1);
          suggestions.push({
            type: 'inactive',
            tenantId: t.id,
            tenantName: t.name,
            message: `${t.name} — no activity in ${daysSince} days (${tierLabel})`,
            urgency: 3,
          });
        }
      }

      // New signups (last 7 days)
      const created = new Date(t.created_at);
      const hoursAge = (now.getTime() - created.getTime()) / (1000 * 60 * 60);
      if (hoursAge <= 168) {
        const daysAgo = Math.floor(hoursAge / 24);
        const label = daysAgo === 0 ? 'signed up today' : daysAgo === 1 ? 'signed up yesterday' : `signed up ${daysAgo} days ago`;
        suggestions.push({
          type: 'new_signup',
          tenantId: t.id,
          tenantName: t.name,
          message: `${t.name} — ${label}`,
          urgency: 4,
        });
      }
    }

    // Sort by urgency then limit to 8
    suggestions.sort((a, b) => a.urgency - b.urgency);
    const topSuggestions = suggestions.slice(0, 8);

    return NextResponse.json({ suggestions: topSuggestions });
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    console.error('[Admin Suggestions Error]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
