// ============================================================================
// Gift Card Checkout — POST /api/gift-cards/checkout
// ============================================================================
// Creates a sale record + Stripe Checkout Session for a gift card purchase.
// The gift card itself is NOT created here — it's created by the client after
// payment is confirmed, ensuring cards are only activated after payment.
//
// No platform fee — payments go directly to the artist.
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

    // ── Parse request ───────────────────────────────────────────────────
    const { amount } = await request.json();
    if (!amount || amount <= 0) {
      return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
    }

    const db = await createServiceRoleClient();

    // ── Get tenant's Stripe account + subscription tier ─────────────────
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

    const amountNum = Number(amount);
    const amountCents = Math.round(amountNum * 100);

    // ── Create sale record ──────────────────────────────────────────────
    const { data: sale, error: saleError } = await db
      .from('sales')
      .insert({
        tenant_id: tenantId,
        payment_method: 'stripe_link',
        payment_status: 'pending',
        subtotal: amountNum,
        tax_amount: 0,
        tip_amount: 0,
        total: amountNum,
      })
      .select('id')
      .single();

    if (saleError || !sale) {
      console.error('[GiftCard Checkout] Sale insert failed:', saleError);
      return NextResponse.json({ error: 'Failed to create sale' }, { status: 500 });
    }

    // ── Create sale item ────────────────────────────────────────────────
    const { error: itemError } = await db.from('sale_items').insert({
      sale_id: sale.id,
      tenant_id: tenantId,
      name: 'Gift Card',
      unit_price: amountNum,
      quantity: 1,
      line_total: amountNum,
    });
    if (itemError) {
      console.error('[GiftCard Checkout] Sale item insert failed:', itemError);
    }

    // ── Platform fee removed from all tiers (May 2026) ──────────────────
    const platformFeeCents = 0;

    // ── Create Stripe Checkout Session ──────────────────────────────────
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://sunstonepj.app';

    const sessionParams: Record<string, unknown> = {
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: { name: `Gift Card — $${amountNum.toFixed(2)}` },
          unit_amount: amountCents,
        },
        quantity: 1,
      }],
      payment_intent_data: {
        application_fee_amount: platformFeeCents,
        metadata: {
          sale_id: sale.id,
          tenant_id: tenantId,
          type: 'gift_card',
        },
      },
      success_url: `${baseUrl}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/payment-success`,
      expires_at: Math.floor(Date.now() / 1000) + (30 * 60),
      metadata: {
        sale_id: sale.id,
        tenant_id: tenantId,
        type: 'gift_card',
      },
    };

    const session = await stripe.checkout.sessions.create(
      sessionParams as Stripe.Checkout.SessionCreateParams,
      { stripeAccount: tenant.stripe_account_id }
    );

    // ── Store session→tenant mapping for polling lookup ─────────────────
    const { error: csError } = await db.from('checkout_sessions').insert({
      session_id: session.id,
      tenant_id: tenantId,
      stripe_account_id: tenant.stripe_account_id,
      amount_cents: amountCents,
    });
    if (csError) {
      console.error('[GiftCard Checkout] checkout_sessions insert failed:', csError);
    }

    // ── Update sale with session ID ─────────────────────────────────────
    await db
      .from('sales')
      .update({ stripe_checkout_session_id: session.id })
      .eq('id', sale.id);

    return NextResponse.json({
      url: session.url,
      sessionId: session.id,
      saleId: sale.id,
    });
  } catch (error: any) {
    console.error('[GiftCard Checkout] Error:', error);
    const message = error?.type?.startsWith('Stripe')
      ? error.message
      : 'Failed to create payment link';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
