// ============================================================================
// Party Deposit API — POST /api/party-requests/[id]/deposit
// ============================================================================
// Creates a payment link (Stripe or Square) for the deposit amount on the
// artist's connected account. No platform fee on deposits — it's the artist's
// money. Optionally sends the payment link to the host via SMS.
// ============================================================================

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase, createServiceRoleClient } from '@/lib/supabase/server';
import { sendSMS, normalizePhone } from '@/lib/twilio';
import { resolvePaymentProvider, createDepositPaymentLink } from '@/lib/deposit-utils';

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

    // ── Get tenant payment credentials ──────────────────────────────────
    const { data: tenant } = await db
      .from('tenants')
      .select('id, name, slug, dedicated_phone_number, default_payment_processor, stripe_account_id, square_access_token, square_location_id')
      .eq('id', tenantId)
      .single();

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    // ── Resolve payment provider ────────────────────────────────────────
    const provider = resolvePaymentProvider(tenant);
    if (!provider) {
      return NextResponse.json(
        { error: 'No payment processor connected. Go to Settings → Payments to connect Stripe or Square.' },
        { status: 400 }
      );
    }

    // ── Create payment link ─────────────────────────────────────────────
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://sunstonepj.app';
    const result = await createDepositPaymentLink({
      provider,
      tenant,
      amount: Number(depositAmount),
      metadata: {
        type: 'party_deposit',
        referenceId: partyRequestId,
        tenantId,
      },
      successUrl: `${baseUrl}/studio/${tenant.slug}?deposit=success`,
      cancelUrl: `${baseUrl}/studio/${tenant.slug}?deposit=cancelled`,
    });

    // ── Update party request with pending deposit ───────────────────────
    await db
      .from('party_requests')
      .update({
        deposit_amount: depositAmount,
        deposit_status: 'pending',
        deposit_payment_provider: provider,
        ...(result.sessionId ? { stripe_checkout_session_id: result.sessionId } : {}),
        ...(result.orderId ? { square_order_id: result.orderId } : {}),
      })
      .eq('id', partyRequestId);

    // ── Optionally send deposit link to host via SMS ────────────────────
    if (sendSmsToHost && party.host_phone && tenant.dedicated_phone_number) {
      const formattedAmount = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(depositAmount);
      sendSMS({
        to: normalizePhone(party.host_phone),
        body: `Hi ${party.host_name}! ${tenant.name} has requested a ${formattedAmount} deposit to confirm your party. Pay securely here: ${result.paymentUrl}`,
        tenantId,
      }).catch(() => {}); // fire-and-forget
    }

    return NextResponse.json({
      url: result.paymentUrl,
      sessionId: result.sessionId || null,
      orderId: result.orderId || null,
      provider,
    });
  } catch (error: any) {
    console.error('[Party Deposit] Error creating deposit link:', error);
    return NextResponse.json(
      { error: 'Failed to create deposit link' },
      { status: 500 }
    );
  }
}
