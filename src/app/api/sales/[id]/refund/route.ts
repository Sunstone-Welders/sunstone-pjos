// ============================================================================
// Refund API — src/app/api/sales/[id]/refund/route.ts
// ============================================================================
// POST: Process a refund for a completed sale.
// Supports Stripe (destination charges), Square, and cash/manual refunds.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase, createServiceRoleClient } from '@/lib/supabase/server';
import { hasPermission, type TenantRole } from '@/lib/permissions';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { id: saleId } = await params;
    const body = await request.json();
    const { amount, reason } = body;

    if (!amount || amount <= 0) {
      return NextResponse.json({ error: 'Amount must be greater than 0' }, { status: 400 });
    }
    if (reason && reason.length > 200) {
      return NextResponse.json({ error: 'Reason must be 200 characters or less' }, { status: 400 });
    }

    const serviceClient = await createServiceRoleClient();

    // Get caller's role and tenant
    const { data: callerMember } = await serviceClient
      .from('tenant_members')
      .select('tenant_id, role')
      .eq('user_id', user.id)
      .limit(1)
      .single();

    if (!callerMember) {
      return NextResponse.json({ error: 'No tenant membership' }, { status: 403 });
    }

    if (!hasPermission(callerMember.role as TenantRole, 'sales:refund')) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const tenantId = callerMember.tenant_id;

    // Fetch the sale
    const { data: sale, error: saleError } = await serviceClient
      .from('sales')
      .select('*')
      .eq('id', saleId)
      .eq('tenant_id', tenantId)
      .single();

    if (saleError || !sale) {
      return NextResponse.json({ error: 'Sale not found' }, { status: 404 });
    }

    if (sale.status !== 'completed') {
      return NextResponse.json({ error: 'Can only refund completed sales' }, { status: 400 });
    }

    // ── Idempotency: check for a recent refund on this sale (within 30s) ──
    const { data: recentRefund } = await serviceClient
      .from('refunds')
      .select('id, created_at')
      .eq('sale_id', saleId)
      .gte('created_at', new Date(Date.now() - 30_000).toISOString())
      .limit(1)
      .single();

    if (recentRefund) {
      return NextResponse.json(
        { error: 'A refund was just processed for this sale. Please wait before retrying.' },
        { status: 409 }
      );
    }

    const currentRefundAmount = Number(sale.refund_amount) || 0;
    const saleTotal = Number(sale.total);
    const maxRefundable = saleTotal - currentRefundAmount;

    if (amount > maxRefundable + 0.01) {
      return NextResponse.json({
        error: `Refund amount ($${amount.toFixed(2)}) exceeds remaining refundable amount ($${maxRefundable.toFixed(2)})`,
      }, { status: 400 });
    }

    const refundAmount = Math.min(amount, maxRefundable);
    let stripeRefundId: string | null = null;
    let squareRefundId: string | null = null;

    // Process external refund based on payment provider
    const provider = sale.payment_provider;
    const providerId = sale.payment_provider_id;

    if (provider === 'stripe' && providerId) {
      // Stripe destination charges: refund on the platform's PaymentIntent
      // No stripeAccount header — Stripe auto-reverses the transfer proportionally
      try {
        const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
        const refund = await stripe.refunds.create({
          payment_intent: providerId,
          amount: Math.round(refundAmount * 100), // cents
          reason: 'requested_by_customer',
        });
        stripeRefundId = refund.id;
      } catch (stripeErr: any) {
        console.error('Stripe refund error:', stripeErr);
        return NextResponse.json({
          error: 'Payment provider refund failed. Please try again or contact support.',
        }, { status: 500 });
      }
    } else if (provider === 'square' && providerId) {
      // Square refund
      try {
        const { Client: SquareClient, Environment } = require('square');

        // Get tenant's Square credentials
        const { data: tenant } = await serviceClient
          .from('tenants')
          .select('square_access_token')
          .eq('id', tenantId)
          .single();

        if (!tenant?.square_access_token) {
          return NextResponse.json({ error: 'Square not connected' }, { status: 400 });
        }

        const squareClient = new SquareClient({
          accessToken: tenant.square_access_token,
          environment: process.env.NODE_ENV === 'production' ? Environment.Production : Environment.Sandbox,
        });

        const { result } = await squareClient.refundsApi.refundPayment({
          idempotencyKey: `refund-${saleId}-${Date.now()}`,
          paymentId: providerId,
          amountMoney: {
            amount: BigInt(Math.round(refundAmount * 100)),
            currency: 'USD',
          },
          reason: reason || 'Customer refund',
        });

        squareRefundId = result.refund?.id || null;
      } catch (sqErr: any) {
        console.error('Square refund error:', sqErr);
        return NextResponse.json({
          error: 'Payment provider refund failed. Please try again or contact support.',
        }, { status: 500 });
      }
    }
    // Cash/Venmo/null provider: record-only, no external API call

    // Insert refund record
    const { data: refund, error: refundInsertError } = await serviceClient
      .from('refunds')
      .insert({
        tenant_id: tenantId,
        sale_id: saleId,
        amount: refundAmount,
        reason: reason || null,
        payment_method: sale.payment_method,
        stripe_refund_id: stripeRefundId,
        square_refund_id: squareRefundId,
        created_by: user.id,
      })
      .select()
      .single();

    if (refundInsertError) {
      console.error('Refund insert error:', refundInsertError);
      return NextResponse.json({ error: 'Failed to record refund' }, { status: 500 });
    }

    // Update sale: increment refund_amount, set status
    const newRefundTotal = currentRefundAmount + refundAmount;
    const newRefundStatus = newRefundTotal >= saleTotal - 0.01 ? 'full' : 'partial';

    const { data: updatedSale, error: updateError } = await serviceClient
      .from('sales')
      .update({
        refund_amount: newRefundTotal,
        refund_status: newRefundStatus,
        refunded_at: new Date().toISOString(),
        refunded_by: user.id,
      })
      .eq('id', saleId)
      .select()
      .single();

    if (updateError) {
      console.error('Sale update error:', updateError);
    }

    return NextResponse.json({
      refund,
      sale: updatedSale,
      message: `Refund of $${refundAmount.toFixed(2)} processed successfully`,
    });

  } catch (err: any) {
    console.error('Refund API error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
