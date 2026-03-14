// ============================================================================
// Stripe Payment Link API — POST /api/stripe/payment-link
// ============================================================================
// Creates a Stripe Checkout Session on the artist's connected account.
// Platform fee is silently deducted from the artist's payout via
// application_fee_amount — the customer never sees a processing fee.
//
// SECURITY: Auth required. Line items + amounts are fetched from the DB —
// the client only supplies saleId and mode. Prices are never trusted from
// the request body.
// ============================================================================

export const runtime = 'nodejs';

import Stripe from 'stripe';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase, createServiceRoleClient } from '@/lib/supabase/server';
import { PLATFORM_FEE_RATES } from '@/types';
import type { SubscriptionTier } from '@/types';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-02-24.acacia' as any,
});

export async function POST(request: NextRequest) {
  try {
    // ── Auth check ──────────────────────────────────────────────────────
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: member } = await supabase
      .from('tenant_members')
      .select('tenant_id')
      .eq('user_id', user.id)
      .limit(1)
      .single();
    if (!member) return NextResponse.json({ error: 'No tenant membership' }, { status: 403 });

    const tenantId = member.tenant_id;

    // ── Parse request — only saleId and mode come from client ───────────
    const { saleId, mode } = await request.json();

    if (!saleId) {
      return NextResponse.json({ error: 'Missing required field: saleId' }, { status: 400 });
    }

    // ── Fetch sale + items from DB (server-side truth) ──────────────────
    const db = await createServiceRoleClient();

    const { data: sale, error: saleError } = await db
      .from('sales')
      .select('id, tenant_id, subtotal, tax_amount, tip_amount, total, payment_status')
      .eq('id', saleId)
      .eq('tenant_id', tenantId)
      .single();

    if (saleError || !sale) {
      return NextResponse.json({ error: 'Sale not found' }, { status: 404 });
    }

    if (sale.payment_status === 'completed') {
      return NextResponse.json({ error: 'Sale is already paid' }, { status: 400 });
    }

    const { data: saleItems, error: itemsError } = await db
      .from('sale_items')
      .select('name, unit_price, quantity, line_total')
      .eq('sale_id', saleId);

    if (itemsError || !saleItems || saleItems.length === 0) {
      return NextResponse.json({ error: 'No items found for this sale' }, { status: 400 });
    }

    // ── Get tenant's Stripe account and subscription tier ───────────────
    const { data: tenant } = await db
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

    // ── Build line items from DB data ───────────────────────────────────
    const stripeLineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];

    let subtotalCents = 0;
    for (const item of saleItems) {
      const unitCents = Math.round(Number(item.unit_price) * 100);
      const qty = Math.round(Number(item.quantity));
      subtotalCents += unitCents * qty;
      stripeLineItems.push({
        price_data: {
          currency: 'usd',
          product_data: { name: item.name },
          unit_amount: unitCents,
        },
        quantity: qty,
      });
    }

    // Add tax as a line item if applicable
    const taxAmount = Number(sale.tax_amount) || 0;
    if (taxAmount > 0) {
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
    const tipAmount = Number(sale.tip_amount) || 0;
    if (tipAmount > 0) {
      stripeLineItems.push({
        price_data: {
          currency: 'usd',
          product_data: { name: 'Tip' },
          unit_amount: Math.round(tipAmount * 100),
        },
        quantity: 1,
      });
    }

    // ── Calculate platform fee on the subtotal (not on tax/tip) ─────────
    const feeRate = PLATFORM_FEE_RATES[(tenant.subscription_tier as SubscriptionTier)] || 0.03;
    const platformFeeCents = Math.round(subtotalCents * feeRate);

    // ── Determine success/cancel URLs based on POS mode ─────────────────
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://sunstonepj.app';
    const returnPath = mode === 'store'
      ? '/dashboard/pos'
      : '/dashboard/events/event-mode';

    // ── Create Checkout Session on the connected account ────────────────
    const sessionParams: Record<string, unknown> = {
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
    };

    const session = await stripe.checkout.sessions.create(
      sessionParams as Stripe.Checkout.SessionCreateParams,
      { stripeAccount: tenant.stripe_account_id }
    );

    // ── Update sale with checkout session ID and pending status ──────────
    await db
      .from('sales')
      .update({
        stripe_checkout_session_id: session.id,
        payment_status: 'pending',
      })
      .eq('id', saleId)
      .eq('tenant_id', tenantId);

    return NextResponse.json({
      url: session.url,
      sessionId: session.id,
    });
  } catch (error: any) {
    console.error('[Payment Link] Error creating checkout session:', error);
    const message = error?.type?.startsWith('Stripe')
      ? error.message
      : 'Failed to create payment link. Please try again.';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
