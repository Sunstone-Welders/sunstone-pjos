// ============================================================================
// CRM Add-On Checkout — POST /api/stripe/crm-checkout
// ============================================================================
// Creates a Stripe Checkout session for the $69/mo CRM add-on subscription.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createServerSupabase } from '@/lib/supabase/server';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-02-24.acacia' as any,
});

const CRM_PRICE_ID = process.env.STRIPE_PRICE_CRM!;

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: member } = await supabase
      .from('tenant_members')
      .select('tenant_id, role')
      .eq('user_id', user.id)
      .not('accepted_at', 'is', null)
      .limit(1)
      .single();

    if (!member || member.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { data: tenant } = await supabase
      .from('tenants')
      .select('id, name, stripe_customer_id, crm_subscription_id')
      .eq('id', member.tenant_id)
      .single();

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    // Already subscribed
    if (tenant.crm_subscription_id) {
      return NextResponse.json({ error: 'CRM is already active' }, { status: 400 });
    }

    // Ensure Stripe customer exists
    let customerId = tenant.stripe_customer_id;
    if (!customerId) {
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
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://sunstonepj.app';

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: CRM_PRICE_ID, quantity: 1 }],
      metadata: {
        tenant_id: tenant.id,
        type: 'crm_addon',
      },
      success_url: `${appUrl}/dashboard/settings?tab=subscription&crm=activated`,
      cancel_url: `${appUrl}/dashboard/settings?tab=subscription`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error: any) {
    console.error('[CRM Checkout] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
