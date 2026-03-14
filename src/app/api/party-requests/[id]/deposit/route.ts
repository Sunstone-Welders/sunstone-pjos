// ============================================================================
// Party Deposit API — POST /api/party-requests/[id]/deposit
// ============================================================================
// Creates a Stripe Checkout Session for the deposit amount on the artist's
// connected account. No platform fee on deposits — it's the artist's money.
// Optionally sends the payment link to the host via SMS.
// ============================================================================

export const runtime = 'nodejs';

import Stripe from 'stripe';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase, createServiceRoleClient } from '@/lib/supabase/server';
import { sendSMS, normalizePhone } from '@/lib/twilio';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-02-24.acacia' as any,
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id: partyRequestId } = await context.params;

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
    const db = await createServiceRoleClient();

    // ── Parse request ───────────────────────────────────────────────────
    const { depositAmount, sendSmsToHost } = await request.json();

    if (!depositAmount || depositAmount <= 0) {
      return NextResponse.json({ error: 'Invalid deposit amount' }, { status: 400 });
    }

    // ── Fetch party request ─────────────────────────────────────────────
    const { data: party, error: partyError } = await db
      .from('party_requests')
      .select('id, tenant_id, host_name, host_phone, host_email, deposit_status')
      .eq('id', partyRequestId)
      .eq('tenant_id', tenantId)
      .single();

    if (partyError || !party) {
      return NextResponse.json({ error: 'Party request not found' }, { status: 404 });
    }

    if (party.deposit_status === 'paid') {
      return NextResponse.json({ error: 'Deposit already paid' }, { status: 400 });
    }

    // ── Get tenant's Stripe account ─────────────────────────────────────
    const { data: tenant } = await db
      .from('tenants')
      .select('stripe_account_id, name, slug, dedicated_phone_number')
      .eq('id', tenantId)
      .single();

    if (!tenant?.stripe_account_id) {
      return NextResponse.json(
        { error: 'Stripe not connected. Go to Settings → Payments to connect.' },
        { status: 400 }
      );
    }

    // ── Create Stripe Checkout Session ──────────────────────────────────
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://sunstonepj.app';
    const amountCents = Math.round(Number(depositAmount) * 100);

    const sessionParams: Record<string, unknown> = {
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: `Party Deposit — ${party.host_name}`,
          },
          unit_amount: amountCents,
        },
        quantity: 1,
      }],
      // No application_fee_amount — deposits are the artist's money
      success_url: `${baseUrl}/studio/${tenant.slug}?deposit=success`,
      cancel_url: `${baseUrl}/studio/${tenant.slug}?deposit=cancelled`,
      expires_at: Math.floor(Date.now() / 1000) + (24 * 60 * 60), // 24 hours from now
      metadata: {
        type: 'party_deposit',
        party_request_id: partyRequestId,
        tenant_id: tenantId,
      },
    };

    const session = await stripe.checkout.sessions.create(
      sessionParams as Stripe.Checkout.SessionCreateParams,
      { stripeAccount: tenant.stripe_account_id }
    );

    // ── Update party request with pending deposit ───────────────────────
    await db
      .from('party_requests')
      .update({
        deposit_amount: depositAmount,
        deposit_status: 'pending',
        stripe_checkout_session_id: session.id,
      })
      .eq('id', partyRequestId);

    // ── Optionally send deposit link to host via SMS ────────────────────
    if (sendSmsToHost && party.host_phone && tenant.dedicated_phone_number) {
      const formattedAmount = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(depositAmount);
      // Use clean redirect URL — Stripe URLs contain # fragments which iOS truncates
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://sunstonepj.app';
      const cleanUrl = `${baseUrl}/pay/${session.id}`;
      sendSMS({
        to: normalizePhone(party.host_phone),
        body: `Hi ${party.host_name}! ${tenant.name} has requested a ${formattedAmount} deposit to confirm your party. Pay securely here: ${cleanUrl}`,
        tenantId,
      }).catch(() => {}); // fire-and-forget
    }

    return NextResponse.json({
      url: session.url,
      sessionId: session.id,
    });
  } catch (error: any) {
    console.error('[Party Deposit] Error creating checkout session:', error);
    return NextResponse.json(
      { error: 'Failed to create deposit link' },
      { status: 500 }
    );
  }
}
