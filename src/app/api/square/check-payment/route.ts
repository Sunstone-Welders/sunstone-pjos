// ============================================================================
// Square Check Payment — GET /api/square/check-payment
// ============================================================================
// Polls a Square Order's status to detect payment completion.
// Used by the POS polling mechanism (mirrors Stripe session-status pattern).
// ============================================================================

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const orderId = request.nextUrl.searchParams.get('orderId');
    const saleId = request.nextUrl.searchParams.get('saleId');

    if (!orderId || !saleId) {
      return NextResponse.json({ error: 'Missing orderId or saleId' }, { status: 400 });
    }

    const db = await createServiceRoleClient();

    // Look up the sale to get tenant info
    const { data: sale } = await db
      .from('sales')
      .select('tenant_id')
      .eq('id', saleId)
      .single();

    if (!sale) {
      return NextResponse.json({ error: 'Sale not found' }, { status: 404 });
    }

    // Get tenant's Square credentials
    const { data: tenant } = await db
      .from('tenants')
      .select('square_access_token')
      .eq('id', sale.tenant_id)
      .single();

    if (!tenant?.square_access_token) {
      return NextResponse.json({ error: 'Square not connected' }, { status: 400 });
    }

    // Check order status via Square API
    const { Client, Environment } = require('square');
    const squareClient = new Client({
      accessToken: tenant.square_access_token,
      environment: process.env.SQUARE_ENVIRONMENT === 'production'
        ? Environment.Production
        : Environment.Sandbox,
    });

    const { result } = await squareClient.ordersApi.retrieveOrder(orderId);
    const order = result.order;

    if (!order) {
      return NextResponse.json({ status: 'unknown' });
    }

    // Square order states: OPEN, COMPLETED, CANCELED
    const isPaid = order.state === 'COMPLETED';

    if (isPaid) {
      // Update sale status
      await db
        .from('sales')
        .update({
          payment_status: 'completed',
          payment_provider_id: order.tenders?.[0]?.id || orderId,
        })
        .eq('id', saleId)
        .eq('payment_status', 'pending');
    }

    return NextResponse.json({
      status: isPaid ? 'paid' : 'pending',
      orderState: order.state,
    });
  } catch (error: any) {
    console.error('[Square Check Payment] Error:', error);
    return NextResponse.json(
      { error: 'Failed to check payment status' },
      { status: 500 }
    );
  }
}
