// ============================================================================
// Stripe Customer Portal Route — src/app/api/stripe/portal/route.ts
// ============================================================================
// POST: Creates a Stripe Billing Portal session so the tenant can manage
// their subscription (upgrade, downgrade, cancel, update payment method).
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createServerSupabase } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-02-24.acacia' as any,
});

export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate user
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Get tenant for the current user
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
      .select('id, stripe_customer_id')
      .eq('id', member.tenant_id)
      .single();

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    // 3. Require existing Stripe Customer
    if (!tenant.stripe_customer_id) {
      return NextResponse.json(
        { error: 'No Stripe customer found. Please subscribe first.' },
        { status: 400 }
      );
    }

    // 4. Create Billing Portal session
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://sunstonepj.app';

    const session = await stripe.billingPortal.sessions.create({
      customer: tenant.stripe_customer_id,
      return_url: `${appUrl}/dashboard/settings?tab=subscription`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error: any) {
    console.error('Stripe portal error:', error);
    return NextResponse.json(
      { error: 'Failed to create portal session' },
      { status: 500 }
    );
  }
}