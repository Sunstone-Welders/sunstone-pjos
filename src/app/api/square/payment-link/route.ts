// ============================================================================
// Square Payment Link API — POST /api/square/payment-link
// ============================================================================
// Creates a Square Checkout Payment Link for the artist's connected account.
// Mirrors the Stripe payment-link pattern: QR code / SMS text link checkout.
// No platform fees — payments go directly to the artist.
// ============================================================================

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase, createServiceRoleClient } from '@/lib/supabase/server';

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
    const { saleId } = await request.json();
    if (!saleId) {
      return NextResponse.json({ error: 'Missing required field: saleId' }, { status: 400 });
    }

    // ── Fetch sale from DB ────────────────────────────────────────────
    const db = await createServiceRoleClient();

    const { data: sale, error: saleError } = await db
      .from('sales')
      .select('id, tenant_id, subtotal, tax_amount, tip_amount, total, payment_status, warranty_amount')
      .eq('id', saleId)
      .eq('tenant_id', tenantId)
      .single();

    if (saleError || !sale) {
      return NextResponse.json({ error: 'Sale not found' }, { status: 404 });
    }

    if (sale.payment_status === 'completed') {
      return NextResponse.json({ error: 'Sale is already paid' }, { status: 400 });
    }

    // ── Get tenant's Square credentials ───────────────────────────────
    const { data: tenant } = await db
      .from('tenants')
      .select('square_access_token, square_location_id, name')
      .eq('id', tenantId)
      .single();

    if (!tenant?.square_access_token || !tenant?.square_location_id) {
      return NextResponse.json(
        { error: 'Square not connected. Go to Settings → Payments to connect.' },
        { status: 400 }
      );
    }

    // ── Create Square Payment Link ────────────────────────────────────
    const { Client, Environment } = require('square');
    const squareClient = new Client({
      accessToken: tenant.square_access_token,
      environment: process.env.SQUARE_ENVIRONMENT === 'production'
        ? Environment.Production
        : Environment.Sandbox,
    });

    const totalCents = Math.round(Number(sale.total) * 100);
    const businessName = tenant.name || 'Payment';

    const { result } = await squareClient.checkoutApi.createPaymentLink({
      idempotencyKey: `sq_link_${saleId}_${Date.now()}`,
      quickPay: {
        name: `Payment to ${businessName}`,
        priceMoney: {
          amount: BigInt(totalCents),
          currency: 'USD',
        },
        locationId: tenant.square_location_id,
      },
      paymentNote: `Sale ${saleId.slice(0, 8)}`,
    });

    const paymentLink = result.paymentLink;
    if (!paymentLink?.url || !paymentLink?.orderId) {
      return NextResponse.json({ error: 'Failed to create Square payment link' }, { status: 500 });
    }

    // ── Update sale with Square order reference ───────────────────────
    await db
      .from('sales')
      .update({
        payment_status: 'pending',
        payment_provider: 'square',
        payment_provider_id: paymentLink.orderId,
      })
      .eq('id', saleId)
      .eq('tenant_id', tenantId);

    return NextResponse.json({
      url: paymentLink.url,
      orderId: paymentLink.orderId,
      paymentLinkId: paymentLink.id,
    });
  } catch (error: any) {
    console.error('[Square Payment Link] Error:', error);
    return NextResponse.json(
      { error: 'Failed to create Square payment link. Please try again.' },
      { status: 500 }
    );
  }
}
