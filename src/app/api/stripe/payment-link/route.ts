// ============================================================================
// Stripe Payment Link API — POST /api/stripe/payment-link
// ============================================================================
// Creates a Stripe Checkout Session on the artist's connected account.
// Platform fee is collected via application_fee_amount and shown to the
// customer as a "Processing fee" line item.
// ============================================================================

export const runtime = 'nodejs';

import Stripe from 'stripe';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { PLATFORM_FEE_RATES } from '@/types';
import { NextResponse } from 'next/server';
import type { SubscriptionTier } from '@/types';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-02-24.acacia' as any,
});

export async function POST(request: Request) {
  try {
    const {
      saleId,
      tenantId,
      lineItems,
      tipAmount,
      taxAmount,
      customerEmail,
      customerPhone,
      mode,
    } = await request.json();

    if (!saleId || !tenantId || !lineItems?.length) {
      return NextResponse.json(
        { error: 'Missing required fields: saleId, tenantId, lineItems' },
        { status: 400 }
      );
    }

    const supabase = await createServiceRoleClient();

    // Get tenant's Stripe account and subscription tier
    const { data: tenant } = await supabase
      .from('tenants')
      .select('stripe_account_id, subscription_tier, name')
      .eq('id', tenantId)
      .single();

    if (!tenant?.stripe_account_id) {
      return NextResponse.json(
        { error: 'Stripe not connected. Go to Settings → Payments to connect.' },
        { status: 400 }
      );
    }

    // Calculate platform fee based on tier
    const feeRate = PLATFORM_FEE_RATES[(tenant.subscription_tier as SubscriptionTier)] || 0.03;

    // Build line items for Stripe Checkout
    const stripeLineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];

    let subtotalCents = 0;
    for (const item of lineItems) {
      const unitCents = Math.round(item.unit_price * 100);
      subtotalCents += unitCents * item.quantity;
      stripeLineItems.push({
        price_data: {
          currency: 'usd',
          product_data: { name: item.name },
          unit_amount: unitCents,
        },
        quantity: item.quantity,
      });
    }

    // Add tax as a line item if applicable
    if (taxAmount && taxAmount > 0) {
      stripeLineItems.push({
        price_data: {
          currency: 'usd',
          product_data: { name: 'Tax' },
          unit_amount: Math.round(taxAmount * 100),
        },
        quantity: 1,
      });
    }

    // Add tip as a line item if applicable
    if (tipAmount && tipAmount > 0) {
      stripeLineItems.push({
        price_data: {
          currency: 'usd',
          product_data: { name: 'Tip' },
          unit_amount: Math.round(tipAmount * 100),
        },
        quantity: 1,
      });
    }

    // Calculate platform fee on the subtotal (not on tax/tip)
    const platformFeeCents = Math.round(subtotalCents * feeRate);

    // Add platform fee as a visible line item the customer pays
    // Only add if fee rate > 0 (Business tier = 0%)
    if (platformFeeCents > 0) {
      stripeLineItems.push({
        price_data: {
          currency: 'usd',
          product_data: { name: 'Processing fee' },
          unit_amount: platformFeeCents,
        },
        quantity: 1,
      });
    }

    // Determine success/cancel URLs based on POS mode
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://sunstonepj.app';
    const returnPath = mode === 'store'
      ? '/dashboard/pos'
      : '/dashboard/events/event-mode';

    // Create Checkout Session on the connected account
    const session = await stripe.checkout.sessions.create(
      {
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: stripeLineItems,
        payment_intent_data: {
          application_fee_amount: platformFeeCents,
          metadata: {
            sale_id: saleId,
            tenant_id: tenantId,
          },
        },
        success_url: `${baseUrl}${returnPath}?payment_success=${saleId}`,
        cancel_url: `${baseUrl}${returnPath}?payment_cancelled=${saleId}`,
        expires_after: 1800, // 30 minutes
        metadata: {
          sale_id: saleId,
          tenant_id: tenantId,
        },
        ...(customerEmail && { customer_email: customerEmail }),
      },
      {
        stripeAccount: tenant.stripe_account_id,
      }
    );

    // Update sale with checkout session ID and pending status
    await supabase
      .from('sales')
      .update({
        stripe_checkout_session_id: session.id,
        payment_status: 'pending',
      })
      .eq('id', saleId);

    return NextResponse.json({
      url: session.url,
      sessionId: session.id,
    });
  } catch (error: any) {
    console.error('[Payment Link] Error creating checkout session:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create payment link' },
      { status: 500 }
    );
  }
}
