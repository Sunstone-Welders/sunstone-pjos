import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase, createServiceRoleClient } from '@/lib/supabase/server';
import { getPlatformFeeRate, getSubscriptionTier } from '@/lib/subscription';

// POST /api/payments — Process a card payment via Square or Stripe
// Requires authentication. Amounts are calculated server-side from the sale record.
export async function POST(request: NextRequest) {
  try {
    // ── Auth check ──────────────────────────────────────────────────────
    const supabase = await createServerSupabase();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json();
    const {
      sale_id,
      provider,       // 'square' | 'stripe'
      source_id,       // card nonce (Square) or payment method id (Stripe)
      idempotency_key,
    } = body;

    // ── Input validation ────────────────────────────────────────────────
    if (!sale_id || typeof sale_id !== 'string') {
      return NextResponse.json({ error: 'sale_id is required' }, { status: 400 });
    }
    if (!provider || !['square', 'stripe'].includes(provider)) {
      return NextResponse.json({ error: 'Invalid payment provider' }, { status: 400 });
    }
    if (!source_id || typeof source_id !== 'string') {
      return NextResponse.json({ error: 'source_id is required' }, { status: 400 });
    }

    const serviceClient = await createServiceRoleClient();

    // ── Verify tenant membership ────────────────────────────────────────
    const { data: member } = await serviceClient
      .from('tenant_members')
      .select('tenant_id')
      .eq('user_id', user.id)
      .limit(1)
      .single();

    if (!member) {
      return NextResponse.json({ error: 'No tenant membership' }, { status: 403 });
    }

    const tenantId = member.tenant_id;

    // ── Look up the sale (must belong to user's tenant) ─────────────────
    const { data: sale, error: saleError } = await serviceClient
      .from('sales')
      .select('id, total, tip_amount, payment_provider_id, status')
      .eq('id', sale_id)
      .eq('tenant_id', tenantId)
      .single();

    if (saleError || !sale) {
      return NextResponse.json({ error: 'Sale not found' }, { status: 404 });
    }

    if (sale.payment_provider_id) {
      return NextResponse.json({ error: 'Payment already processed for this sale' }, { status: 409 });
    }

    // ── Calculate amounts server-side ───────────────────────────────────
    const totalCents = Math.round(Number(sale.total) * 100);
    const tipCents = Math.round(Number(sale.tip_amount || 0) * 100);

    if (totalCents <= 0) {
      return NextResponse.json({ error: 'Invalid sale total' }, { status: 400 });
    }

    // Get tenant details for payment credentials and fee calculation
    const { data: tenant } = await serviceClient
      .from('tenants')
      .select('square_access_token, square_location_id, stripe_account_id, subscription_tier, subscription_status, trial_ends_at, subscription_period_end')
      .eq('id', tenantId)
      .single();

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    // Calculate platform fee server-side from subscription tier
    const effectiveTier = getSubscriptionTier(tenant as any);
    const feeRate = getPlatformFeeRate(effectiveTier);
    const platformFeeCents = Math.round(totalCents * feeRate);

    // ── Process payment ─────────────────────────────────────────────────
    let paymentId: string | undefined;
    let paymentStatus: string | undefined;

    if (provider === 'square') {
      if (!tenant.square_access_token || !tenant.square_location_id) {
        return NextResponse.json({ error: 'Square not connected' }, { status: 400 });
      }

      try {
        const { Client, Environment } = require('square');
        const squareClient = new Client({
          accessToken: tenant.square_access_token,
          environment: process.env.SQUARE_ENVIRONMENT === 'production'
            ? Environment.Production
            : Environment.Sandbox,
        });

        const response = await squareClient.paymentsApi.createPayment({
          sourceId: source_id,
          idempotencyKey: idempotency_key || crypto.randomUUID(),
          amountMoney: { amount: BigInt(totalCents), currency: 'USD' },
          tipMoney: tipCents ? { amount: BigInt(tipCents), currency: 'USD' } : undefined,
          locationId: tenant.square_location_id,
          appFeeMoney: platformFeeCents
            ? { amount: BigInt(platformFeeCents), currency: 'USD' }
            : undefined,
        });

        paymentId = response.result.payment?.id;
        paymentStatus = response.result.payment?.status;
      } catch (err: any) {
        console.error('Square payment error:', err);
        return NextResponse.json({ error: 'Payment processing failed' }, { status: 502 });
      }
    }

    if (provider === 'stripe') {
      if (!tenant.stripe_account_id) {
        return NextResponse.json({ error: 'Stripe not connected' }, { status: 400 });
      }

      try {
        const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

        const paymentIntent = await stripe.paymentIntents.create({
          amount: totalCents,
          currency: 'usd',
          payment_method: source_id,
          confirm: true,
          transfer_data: {
            destination: tenant.stripe_account_id,
          },
          application_fee_amount: platformFeeCents || 0,
        });

        paymentId = paymentIntent.id;
        paymentStatus = paymentIntent.status;
      } catch (err: any) {
        console.error('Stripe payment error:', err);
        return NextResponse.json({ error: 'Payment processing failed' }, { status: 502 });
      }
    }

    // ── Update sale with payment provider ID ────────────────────────────
    if (paymentId) {
      await serviceClient
        .from('sales')
        .update({ payment_provider_id: paymentId })
        .eq('id', sale_id);
    }

    return NextResponse.json({
      success: true,
      provider,
      payment_id: paymentId,
      status: paymentStatus,
    });
  } catch (error: any) {
    console.error('Payment Error:', error);
    return NextResponse.json({ error: 'Payment processing failed' }, { status: 500 });
  }
}
