// ============================================================================
// Stripe Checkout Route — src/app/api/stripe/checkout/route.ts
// ============================================================================
// POST: Creates a Stripe Checkout Session for subscription billing.
// Authenticates the user, creates/retrieves Stripe Customer, and redirects
// to Stripe's hosted checkout page.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createServerSupabase } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-02-24.acacia' as any,
});

const PRICE_IDS: Record<string, string | undefined> = {
  starter: process.env.STRIPE_PRICE_STARTER,
  pro: process.env.STRIPE_PRICE_PRO,
  business: process.env.STRIPE_PRICE_BUSINESS,
};

export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate user
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Get request body
    const { tier } = await request.json();
    if (!tier || !['starter', 'pro', 'business'].includes(tier)) {
      return NextResponse.json({ error: 'Invalid tier. Must be "starter", "pro", or "business".' }, { status: 400 });
    }

    const priceId = PRICE_IDS[tier];
    if (!priceId) {
      return NextResponse.json(
        { error: `STRIPE_PRICE_${tier.toUpperCase()} environment variable not configured.` },
        { status: 500 }
      );
    }

    // 3. Get tenant for the current user
    const { data: member } = await supabase
      .from('tenant_members')
      .select('tenant_id')
      .eq('user_id', user.id)
      .single();

    if (!member) {
      return NextResponse.json({ error: 'No tenant found' }, { status: 404 });
    }

    const serviceRole = await createServiceRoleClient();
    const { data: tenant } = await serviceRole
      .from('tenants')
      .select('id, name, stripe_customer_id, subscription_status, trial_ends_at')
      .eq('id', member.tenant_id)
      .single();

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    // 4. Create or retrieve Stripe Customer
    let customerId = tenant.stripe_customer_id;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: {
          tenant_id: tenant.id,
          tenant_name: tenant.name,
        },
      });
      customerId = customer.id;

      // Save customer ID to tenant
      await serviceRole
        .from('tenants')
        .update({ stripe_customer_id: customerId })
        .eq('id', tenant.id);
    }

    // 5. Create Checkout Session
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://sunstonepj.app';

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      customer: customerId,
      mode: 'subscription',
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${appUrl}/dashboard/settings?tab=subscription&checkout=success`,
      cancel_url: `${appUrl}/dashboard/settings?tab=subscription&checkout=canceled`,
      metadata: {
        tenant_id: tenant.id,
        tier,
      },
      subscription_data: {
        metadata: {
          tenant_id: tenant.id,
          tier,
        },
      },
    };

    // If tenant is currently trialing, do NOT add another trial in Stripe
    // (they already had their 60-day platform trial)
    // If they're NOT trialing, also no trial — they go straight to paid
    // The only trial is the platform-level 60-day trial, not a Stripe trial

    const session = await stripe.checkout.sessions.create(sessionParams);

    return NextResponse.json({ url: session.url });
  } catch (error: any) {
    console.error('Stripe checkout error:', error);
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}