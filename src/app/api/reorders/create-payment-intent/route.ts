// ============================================================================
// Reorder Payment Intent — src/app/api/reorders/create-payment-intent/route.ts
// ============================================================================
// POST: Create a Stripe PaymentIntent on SUNSTONE's account (no Connect)
// for a supply reorder. Creates a pending reorder_history record.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createServerSupabase, createServiceRoleClient } from '@/lib/supabase/server';
import { estimateShipping, estimateTax, resetTaxShippingCache } from '@/lib/reorder-tax-shipping';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-02-24.acacia' as any,
});

interface PaymentItem {
  inventoryItemId: string | null;
  variantId: string;
  name: string;
  quantity: number;
  unitPrice: number;
}

interface PaymentBody {
  items: PaymentItem[];
  shippingAddress: {
    street: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { data: member } = await supabase
      .from('tenant_members')
      .select('tenant_id')
      .eq('user_id', user.id)
      .limit(1)
      .single();

    if (!member) {
      return NextResponse.json({ error: 'No tenant membership' }, { status: 403 });
    }

    const body: PaymentBody = await request.json();
    const { items, shippingAddress } = body;

    if (!items?.length) {
      return NextResponse.json({ error: 'No items provided' }, { status: 400 });
    }

    if (!shippingAddress?.state) {
      return NextResponse.json({ error: 'Shipping address with state is required' }, { status: 400 });
    }

    // Calculate totals
    const subtotal = items.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);
    resetTaxShippingCache();
    const shipping = await estimateShipping(subtotal);
    const tax = await estimateTax(subtotal, shippingAddress.state);
    const total = Math.round((subtotal + shipping + tax) * 100) / 100;

    const serviceClient = await createServiceRoleClient();

    // Get or create Stripe Customer for this tenant
    const { data: tenant } = await serviceClient
      .from('tenants')
      .select('stripe_reorder_customer_id, name')
      .eq('id', member.tenant_id)
      .single();

    let customerId = tenant?.stripe_reorder_customer_id;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email || undefined,
        name: tenant?.name || undefined,
        metadata: {
          tenant_id: member.tenant_id,
          source: 'sunstone_studio_reorder',
        },
      });
      customerId = customer.id;

      await serviceClient
        .from('tenants')
        .update({ stripe_reorder_customer_id: customerId })
        .eq('id', member.tenant_id);
    }

    // Create reorder_history record first (pending_payment)
    const { data: reorder, error: reorderError } = await serviceClient
      .from('reorder_history')
      .insert({
        tenant_id: member.tenant_id,
        status: 'pending_payment',
        items: items.map((item) => ({
          inventory_item_id: item.inventoryItemId,
          variant_id: item.variantId,
          name: item.name,
          quantity: item.quantity,
          unit_price: item.unitPrice,
        })),
        total_amount: total,
        tax_amount: tax,
        shipping_amount: shipping,
        notes: `Shipping to: ${shippingAddress.street}, ${shippingAddress.city}, ${shippingAddress.state} ${shippingAddress.postalCode}`,
        ordered_by: user.id,
      })
      .select('id')
      .single();

    if (reorderError) {
      console.error('[PaymentIntent] Failed to create reorder record:', reorderError.message);
      return NextResponse.json({ error: 'Failed to create reorder record' }, { status: 500 });
    }

    // Create PaymentIntent on SUNSTONE's Stripe (no connected account, no application_fee)
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(total * 100),
      currency: 'usd',
      customer: customerId,
      setup_future_usage: 'off_session',
      automatic_payment_methods: { enabled: true },
      metadata: {
        source: 'sunstone_studio_reorder',
        tenant_id: member.tenant_id,
        reorder_id: reorder.id,
      },
    });

    // Save the payment intent ID on the reorder
    await serviceClient
      .from('reorder_history')
      .update({ stripe_payment_intent_id: paymentIntent.id })
      .eq('id', reorder.id);

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      reorderId: reorder.id,
      subtotal,
      tax,
      shipping,
      total,
    });
  } catch (err: any) {
    console.error('[PaymentIntent] Error:', err);
    return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 });
  }
}
