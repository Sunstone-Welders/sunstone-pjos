// ============================================================================
// Stripe Terminal PaymentIntent — POST /api/stripe/terminal-payment-intent
// ============================================================================
// Creates a card-present PaymentIntent on the artist's connected account for
// Tap to Pay collection. Returns the clientSecret for the Terminal SDK to
// collect payment against.
//
// SECURITY: Auth required. Sale ownership is validated server-side.
// Amount is fetched from DB — never trusted from the client.
// ============================================================================

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createServerSupabase, createServiceRoleClient } from '@/lib/supabase/server';

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

    // ── Parse request ─────────────────────────────────────────────────
    const { saleId, metadata } = await request.json();
    if (!saleId) {
      return NextResponse.json({ error: 'Missing required field: saleId' }, { status: 400 });
    }

    // ── Fetch sale from DB (server-side truth for amount) ─────────────
    const db = await createServiceRoleClient();

    const { data: sale, error: saleError } = await db
      .from('sales')
      .select('id, tenant_id, total, payment_status')
      .eq('id', saleId)
      .eq('tenant_id', tenantId)
      .single();

    if (saleError || !sale) {
      return NextResponse.json({ error: 'Sale not found' }, { status: 404 });
    }

    if (sale.payment_status === 'completed') {
      return NextResponse.json({ error: 'Sale is already paid' }, { status: 400 });
    }

    // ── Get tenant's Stripe connected account ───────────────────────────
    const { data: tenant } = await db
      .from('tenants')
      .select('stripe_account_id')
      .eq('id', tenantId)
      .single();

    if (!tenant?.stripe_account_id) {
      return NextResponse.json(
        { error: 'Stripe not connected. Go to Settings → Payments to connect.' },
        { status: 400 }
      );
    }

    // ── Create card-present PaymentIntent on connected account ──────────
    const amountCents = Math.round(Number(sale.total) * 100);

    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount: amountCents,
        currency: 'usd',
        payment_method_types: ['card_present'],
        capture_method: 'automatic',
        application_fee_amount: 0,
        metadata: {
          sale_id: saleId,
          tenant_id: tenantId,
          ...(metadata || {}),
        },
      },
      {
        stripeAccount: tenant.stripe_account_id,
        idempotencyKey: `tt_${saleId}_${Date.now()}`,
      }
    );

    // ── Update sale with PaymentIntent reference ────────────────────────
    await db
      .from('sales')
      .update({
        stripe_payment_intent_id: paymentIntent.id,
        payment_status: 'pending',
        payment_provider: 'stripe',
      })
      .eq('id', saleId)
      .eq('tenant_id', tenantId);

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    });
  } catch (error: any) {
    console.error('[Terminal PaymentIntent] Error:', error);
    const message = error?.type?.startsWith('Stripe')
      ? error.message
      : 'Failed to create payment intent. Please try again.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
