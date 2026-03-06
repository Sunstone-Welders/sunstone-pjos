// ============================================================================
// CRM Add-On Checkout — POST /api/stripe/crm-checkout
// ============================================================================
// Creates a Stripe Checkout session for the $69/mo CRM add-on subscription.
// If tenant is in trial, defers first billing to trial end date.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createServerSupabase } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  // ── Pre-flight: check env vars before doing anything ──
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const crmPriceId = process.env.STRIPE_PRICE_CRM;

  if (!stripeKey) {
    console.error('[CRM Checkout] STRIPE_SECRET_KEY is not set');
    return NextResponse.json({ error: 'Payment system not configured. Please contact support.' }, { status: 500 });
  }
  if (!crmPriceId) {
    console.error('[CRM Checkout] STRIPE_PRICE_CRM is not set');
    return NextResponse.json({ error: 'CRM pricing not configured. Please contact support.' }, { status: 500 });
  }

  const stripe = new Stripe(stripeKey, {
    apiVersion: '2025-02-24.acacia' as any,
  });

  try {
    // ── Auth ──
    const supabase = await createServerSupabase();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      console.error('[CRM Checkout] Auth failed:', authError?.message || 'No user');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ── Tenant membership ──
    const { data: member, error: memberError } = await supabase
      .from('tenant_members')
      .select('tenant_id, role')
      .eq('user_id', user.id)
      .not('accepted_at', 'is', null)
      .limit(1)
      .single();

    if (memberError) {
      console.error('[CRM Checkout] Member lookup failed:', memberError.message);
    }

    if (!member || member.role !== 'admin') {
      console.error('[CRM Checkout] Not admin. Member:', member ? `role=${member.role}` : 'not found', 'User:', user.id);
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // ── Tenant data ──
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('id, name, stripe_customer_id, crm_subscription_id, trial_ends_at, subscription_status, stripe_subscription_id')
      .eq('id', member.tenant_id)
      .single();

    if (tenantError) {
      console.error('[CRM Checkout] Tenant lookup failed:', tenantError.message, 'tenant_id:', member.tenant_id);
      return NextResponse.json({ error: 'Failed to load account data' }, { status: 500 });
    }

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    // Already subscribed
    if (tenant.crm_subscription_id) {
      return NextResponse.json({ error: 'CRM is already active' }, { status: 400 });
    }

    // ── CRM requires base subscription (post-trial) ──
    const now = new Date();
    const trialEnd = tenant.trial_ends_at ? new Date(tenant.trial_ends_at) : null;
    const inTrial = tenant.subscription_status === 'trialing' && trialEnd && trialEnd > now;
    const hasBaseSub = tenant.subscription_status === 'active' || tenant.subscription_status === 'past_due';

    if (!inTrial && !hasBaseSub) {
      console.log('[CRM Checkout] Rejected — no base subscription and trial expired. Tenant:', tenant.id);
      return NextResponse.json(
        { error: 'CRM is an add-on that requires a base plan. Please choose a plan first.' },
        { status: 400 }
      );
    }

    // ── Ensure Stripe customer exists ──
    let customerId = tenant.stripe_customer_id;
    if (!customerId) {
      console.log('[CRM Checkout] Creating Stripe customer for tenant:', tenant.id);
      try {
        const customer = await stripe.customers.create({
          email: user.email,
          metadata: { tenant_id: tenant.id },
          name: tenant.name,
        });
        customerId = customer.id;

        await supabase
          .from('tenants')
          .update({ stripe_customer_id: customerId })
          .eq('id', tenant.id);
      } catch (custError: any) {
        console.error('[CRM Checkout] Failed to create Stripe customer:', custError.message, custError.type);
        return NextResponse.json({ error: 'Failed to set up payment account. Please try again.' }, { status: 500 });
      }
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://sunstonepj.app';

    // ── Build subscription data with optional trial deferral ──
    let subscriptionData: Stripe.Checkout.SessionCreateParams['subscription_data'] = {
      metadata: {
        tenant_id: tenant.id,
        type: 'crm_addon',
      },
    };

    if (tenant.trial_ends_at) {
      const trialEnd = new Date(tenant.trial_ends_at);
      const now = new Date();
      // Stripe requires trial_end to be at least 48h in the future
      const minTrialEnd = new Date(now.getTime() + 48 * 60 * 60 * 1000);
      if (trialEnd > minTrialEnd) {
        subscriptionData.trial_end = Math.floor(trialEnd.getTime() / 1000);
        console.log('[CRM Checkout] Deferring billing to trial end:', trialEnd.toISOString());
      } else if (trialEnd > now) {
        // Trial ends within 48h — Stripe won't accept this as trial_end
        // Skip deferral, bill immediately (trial is almost over anyway)
        console.log('[CRM Checkout] Trial ends within 48h, billing immediately');
      }
    }

    // ── Create checkout session ──
    console.log('[CRM Checkout] Creating session. Customer:', customerId, 'Price:', crmPriceId, 'Tenant:', tenant.id);

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: crmPriceId, quantity: 1 }],
      subscription_data: subscriptionData,
      metadata: {
        tenant_id: tenant.id,
        type: 'crm_addon',
      },
      success_url: `${appUrl}/dashboard/settings?tab=subscription&crm=activated`,
      cancel_url: `${appUrl}/dashboard/settings?tab=subscription`,
    });

    if (!session.url) {
      console.error('[CRM Checkout] Session created but no URL returned. Session ID:', session.id);
      return NextResponse.json({ error: 'Checkout session created but no redirect URL. Please try again.' }, { status: 500 });
    }

    console.log('[CRM Checkout] Success. Session:', session.id);
    return NextResponse.json({ url: session.url });
  } catch (error: any) {
    // Stripe errors have a type property
    if (error.type?.startsWith('Stripe')) {
      console.error('[CRM Checkout] Stripe error:', {
        type: error.type,
        code: error.code,
        message: error.message,
        param: error.param,
      });

      // Return user-friendly messages for known Stripe errors
      if (error.code === 'resource_missing') {
        return NextResponse.json({ error: 'CRM price not found in Stripe. Please contact support.' }, { status: 500 });
      }
      if (error.code === 'account_invalid' || error.type === 'StripeAuthenticationError') {
        return NextResponse.json({ error: 'Payment system authentication failed. Please contact support.' }, { status: 500 });
      }

      return NextResponse.json({ error: `Payment error: ${error.message}` }, { status: 500 });
    }

    // Generic errors
    console.error('[CRM Checkout] Unexpected error:', {
      name: error.name,
      message: error.message,
      stack: error.stack?.split('\n').slice(0, 3).join('\n'),
    });
    return NextResponse.json({ error: 'Something went wrong. Please try again or contact support.' }, { status: 500 });
  }
}
