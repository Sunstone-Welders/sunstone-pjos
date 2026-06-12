// ============================================================================
// Deposit Utilities — shared provider resolution + payment link creation
// ============================================================================
// Used by booking deposits, party deposits, and the send-deposit route.
// Supports Stripe (connected accounts) and Square payment links.
// ============================================================================

import Stripe from 'stripe';
import { createServiceRoleClient } from '@/lib/supabase/server';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-02-24.acacia' as any,
});

// ── Types ─────────────────────────────────────────────────────────────────────

export type PaymentProvider = 'stripe' | 'square';

export interface TenantPaymentInfo {
  default_payment_processor: string | null;
  stripe_account_id: string | null;
  square_access_token: string | null;
  square_location_id: string | null;
}

export interface DepositPaymentLinkParams {
  provider: PaymentProvider;
  tenant: {
    id: string;
    stripe_account_id: string | null;
    square_access_token: string | null;
    square_location_id: string | null;
    name: string | null;
  };
  amount: number; // dollars
  metadata: {
    type: 'booking_deposit' | 'party_deposit';
    referenceId: string; // booking ID or party_request ID
    tenantId: string;
  };
  successUrl: string;
  cancelUrl: string;
}

export interface DepositPaymentLinkResult {
  paymentUrl: string;
  sessionId?: string;  // Stripe only
  orderId?: string;    // Square only
}

// ── Provider Resolution ───────────────────────────────────────────────────────

export function resolvePaymentProvider(
  tenant: TenantPaymentInfo
): PaymentProvider | null {
  const preferred = tenant.default_payment_processor;

  // Try preferred first
  if (preferred === 'stripe' && tenant.stripe_account_id) return 'stripe';
  if (preferred === 'square' && tenant.square_access_token && tenant.square_location_id) return 'square';

  // Fallback: try the other one
  if (preferred === 'stripe' && tenant.square_access_token && tenant.square_location_id) return 'square';
  if (preferred === 'square' && tenant.stripe_account_id) return 'stripe';

  // No preference set — try whatever is connected
  if (tenant.stripe_account_id) return 'stripe';
  if (tenant.square_access_token && tenant.square_location_id) return 'square';

  return null;
}

// ── Payment Link Creation ─────────────────────────────────────────────────────

export async function createDepositPaymentLink(
  params: DepositPaymentLinkParams
): Promise<DepositPaymentLinkResult> {
  if (params.provider === 'stripe') {
    return createStripeDepositLink(params);
  } else {
    return createSquareDepositLink(params);
  }
}

// ── Stripe ────────────────────────────────────────────────────────────────────

async function createStripeDepositLink(
  params: DepositPaymentLinkParams
): Promise<DepositPaymentLinkResult> {
  const { tenant, amount, metadata, successUrl, cancelUrl } = params;

  if (!tenant.stripe_account_id) {
    throw new Error('Stripe not connected');
  }

  const amountCents = Math.round(Number(amount) * 100);
  const businessName = tenant.name || 'Deposit';

  const label = metadata.type === 'booking_deposit'
    ? `Booking Deposit — ${businessName}`
    : `Party Deposit — ${businessName}`;

  const session = await stripe.checkout.sessions.create(
    {
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: { name: label },
          unit_amount: amountCents,
        },
        quantity: 1,
      }],
      // No application_fee_amount — deposits are the artist's money
      success_url: successUrl,
      cancel_url: cancelUrl,
      expires_at: Math.floor(Date.now() / 1000) + (24 * 60 * 60), // 24 hours
      metadata: {
        type: metadata.type,
        ...(metadata.type === 'booking_deposit'
          ? { booking_id: metadata.referenceId }
          : { party_request_id: metadata.referenceId }),
        tenant_id: metadata.tenantId,
      },
    } as Stripe.Checkout.SessionCreateParams,
    { stripeAccount: tenant.stripe_account_id }
  );

  // Store session→tenant mapping for /pay redirect lookup
  const db = await createServiceRoleClient();
  const { error: sessionInsertError } = await db
    .from('checkout_sessions')
    .insert({
      session_id: session.id,
      tenant_id: tenant.id,
      stripe_account_id: tenant.stripe_account_id,
      amount_cents: amountCents,
    });
  if (sessionInsertError) {
    console.error('[Deposit Utils] checkout_sessions insert failed:', sessionInsertError);
  }

  // Return SMS-safe redirect URL
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://sunstonepj.app';
  return {
    paymentUrl: `${baseUrl}/pay/${session.id}`,
    sessionId: session.id,
  };
}

// ── Square ────────────────────────────────────────────────────────────────────

async function createSquareDepositLink(
  params: DepositPaymentLinkParams
): Promise<DepositPaymentLinkResult> {
  const { tenant, amount, metadata } = params;

  if (!tenant.square_access_token || !tenant.square_location_id) {
    throw new Error('Square not connected');
  }

  const { Client, Environment } = require('square');
  const squareClient = new Client({
    accessToken: tenant.square_access_token,
    environment: process.env.SQUARE_ENVIRONMENT === 'production'
      ? Environment.Production
      : Environment.Sandbox,
  });

  const amountCents = Math.round(Number(amount) * 100);
  const businessName = tenant.name || 'Deposit';

  const label = metadata.type === 'booking_deposit'
    ? `Booking Deposit — ${businessName}`
    : `Party Deposit — ${businessName}`;

  const { result } = await squareClient.checkoutApi.createPaymentLink({
    idempotencyKey: `sq_deposit_${metadata.referenceId}_${Date.now()}`,
    quickPay: {
      name: label,
      priceMoney: {
        amount: BigInt(amountCents),
        currency: 'USD',
      },
      locationId: tenant.square_location_id,
    },
    paymentNote: `${metadata.type === 'booking_deposit' ? 'Booking' : 'Party'} deposit ${metadata.referenceId.slice(0, 8)}`,
  });

  const paymentLink = result.paymentLink;
  if (!paymentLink?.url || !paymentLink?.orderId) {
    throw new Error('Failed to create Square payment link');
  }

  return {
    paymentUrl: paymentLink.url,
    orderId: paymentLink.orderId,
  };
}
