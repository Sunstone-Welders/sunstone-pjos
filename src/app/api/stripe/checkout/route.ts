// ============================================================================
// Stripe Checkout Route — src/app/api/stripe/checkout/route.ts
// ============================================================================
// POST: Creates a Stripe Checkout Session for base subscription billing.
// Authenticates the user, creates/retrieves Stripe Customer, and redirects
// to Stripe's hosted checkout page.
// If tenant is in trial, defers first billing to trial end date.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createServerSupabase, createServiceRoleClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  // ── Pre-flight: check env vars ──
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    console.error('[Checkout] STRIPE_SECRET_KEY is not set');
    return NextResponse.json({ error: 'Payment system not configured. Please contact support.' }, { status: 500 });
  }

  const PRICE_IDS: Record<string, string | undefined> = {
    starter: process.env.STRIPE_PRICE_STARTER,
    pro: process.env.STRIPE_PRICE_PRO,
    business: process.env.STRIPE_PRICE_BUSINESS,
  };

  const stripe = new Stripe(stripeKey, {
    apiVersion: '2025-02-24.acacia' as any,
  });

  try {
    // ── Auth ──
    const supabase = await createServerSupabase();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ── Validate tier ──
    const { tier } = await request.json();
    if (!tier || !['starter', 'pro', 'business'].includes(tier)) {
      return NextResponse.json({ error: 'Invalid tier.' }, { status: 400 });
    }

    const priceId = PRICE_IDS[tier];
    if (!priceId) {
      console.error(`[Checkout] STRIPE_PRICE_${tier.toUpperCase()} is not set`);
      return NextResponse.json({ error: 'Plan pricing not configured. Please contact support.' }, { status: 500 });
    }

    // ── Tenant membership ──
    const { data: member } = await supabase
      .from('tenant_members')
      .select('tenant_id, role')
      .eq('user_id', user.id)
      .not('accepted_at', 'is', null)
      .limit(1)
      .single();

    if (!member) {
      return NextResponse.json({ error: 'No account found' }, { status: 404 });
    }

    // ── Tenant data ──
    const serviceRole = await createServiceRoleClient();
    const { data: tenant } = await serviceRole
      .from('tenants')
      .select('id, name, stripe_customer_id, subscription_status, trial_ends_at, stripe_subscription_id')
      .eq('id', member.tenant_id)
      .single();

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    // Already has an active subscription
    if (tenant.stripe_subscription_id && tenant.subscription_status === 'active') {
      return NextResponse.json({ error: 'You already have an active subscription. Use Manage Subscription to change plans.' }, { status: 400 });
    }

    // ── Ensure Stripe customer exists ──
    let customerId = tenant.stripe_customer_id;
    if (!customerId) {
      try {
        const customer = await stripe.customers.create({
          email: user.email,
          metadata: { tenant_id: tenant.id, tenant_name: tenant.name },
        });
        customerId = customer.id;
        await serviceRole
          .from('tenants')
          .update({ stripe_customer_id: customerId })
          .eq('id', tenant.id);
      } catch (custError: any) {
        console.error('[Checkout] Failed to create Stripe customer:', custError.message);
        return NextResponse.json({ error: 'Failed to set up payment account.' }, { status: 500 });
      }
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://sunstonepj.app';

    // ── Build subscription data with optional trial deferral ──
    let subscriptionData: Stripe.Checkout.SessionCreateParams['subscription_data'] = {
      metadata: {
        tenant_id: tenant.id,
        tier,
      },
    };

    // Defer billing to trial end if still in trial
    if (tenant.trial_ends_at && tenant.subscription_status === 'trialing') {
      const trialEnd = new Date(tenant.trial_ends_at);
      const now = new Date();
      // Stripe requires trial_end to be at least 48h in the future
      const minTrialEnd = new Date(now.getTime() + 48 * 60 * 60 * 1000);
      if (trialEnd > minTrialEnd) {
        subscriptionData.trial_end = Math.floor(trialEnd.getTime() / 1000);
        console.log('[Checkout] Deferring billing to trial end:', trialEnd.toISOString());
      } else if (trialEnd > now) {
        // Trial ends within 48h — Stripe won't accept this as trial_end
        console.log('[Checkout] Trial ends within 48h, billing immediately');
      }
    }

    // ── Create checkout session ──
    console.log('[Checkout] Creating session. Customer:', customerId, 'Price:', priceId, 'Tier:', tier, 'Tenant:', tenant.id);

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: subscriptionData,
      metadata: {
        tenant_id: tenant.id,
        tier,
      },
      success_url: `${appUrl}/dashboard/settings?tab=subscription&checkout=success`,
      cancel_url: `${appUrl}/dashboard/settings?tab=subscription&checkout=canceled`,
    });

    if (!session.url) {
      console.error('[Checkout] Session created but no URL returned. Session ID:', session.id);
      return NextResponse.json({ error: 'Checkout session created but no redirect URL.' }, { status: 500 });
    }

    console.log('[Checkout] Success. Session:', session.id);
    return NextResponse.json({ url: session.url });
  } catch (error: any) {
    if (error.type?.startsWith('Stripe')) {
      console.error('[Checkout] Stripe error:', { type: error.type, code: error.code, message: error.message });
      if (error.code === 'resource_missing') {
        return NextResponse.json({ error: 'Plan price not found in Stripe. Please contact support.' }, { status: 500 });
      }
      return NextResponse.json({ error: `Payment error: ${error.message}` }, { status: 500 });
    }
    console.error('[Checkout] Unexpected error:', error.message);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
