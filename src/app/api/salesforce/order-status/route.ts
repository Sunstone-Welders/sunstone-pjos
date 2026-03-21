// ============================================================================
// SF Order Status — src/app/api/salesforce/order-status/route.ts
// ============================================================================
// GET: Check Salesforce Order status and tracking for a reorder.
// Caches tracking/status back to reorder_history.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase, createServiceRoleClient } from '@/lib/supabase/server';
import { sfQuery } from '@/lib/salesforce';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { data: member } = await supabase
      .from('tenant_members')
      .select('tenant_id')
      .eq('user_id', user.id)
      .limit(1)
      .single();

    if (!member) {
      return NextResponse.json({ error: 'No tenant membership' }, { status: 403 });
    }

    const reorderId = request.nextUrl.searchParams.get('reorderId');
    if (!reorderId) {
      return NextResponse.json({ error: 'Missing reorderId' }, { status: 400 });
    }

    const serviceClient = await createServiceRoleClient();

    const { data: reorder } = await serviceClient
      .from('reorder_history')
      .select('sf_opportunity_id, sf_order_id, tracking_number, shipping_status')
      .eq('id', reorderId)
      .eq('tenant_id', member.tenant_id)
      .single();

    if (!reorder) {
      return NextResponse.json({ error: 'Reorder not found' }, { status: 404 });
    }

    if (!reorder.sf_opportunity_id) {
      return NextResponse.json({
        status: 'processing',
        label: 'Processing',
        description: 'Your order is being processed.',
      });
    }

    // Verify the Opportunity still exists in SF (admin may have deleted it)
    let oppExists = true;
    try {
      const opps = await sfQuery<any>(
        `SELECT Id FROM Opportunity WHERE Id = '${reorder.sf_opportunity_id}' LIMIT 1`
      );
      oppExists = opps.length > 0;
    } catch (sfErr: any) {
      // SF connection error — don't falsely mark as cancelled
      console.warn('[SF Order Status] Could not verify Opportunity — returning cached status:', sfErr.message);
      return NextResponse.json({
        status: reorder.shipping_status || 'processing',
        label: reorder.shipping_status === 'shipped' ? 'Shipped' : 'Processing',
        description: 'Unable to reach Salesforce. Showing last known status.',
      });
    }

    if (!oppExists) {
      // Opportunity was deleted in SF — mark as cancelled
      await serviceClient
        .from('reorder_history')
        .update({ status: 'cancelled', shipping_status: 'cancelled' })
        .eq('id', reorderId);

      return NextResponse.json({
        status: 'cancelled',
        label: 'Cancelled',
        description: 'This order was cancelled by the Sunstone team.',
      });
    }

    // Query SF for Order tied to this Opportunity (SF creates it async after Closed Won)
    const orders = await sfQuery<any>(
      `SELECT Id, OrderNumber, Status, Shipped__c, Ship_Date__c, Tracking_number__c, Shipping_Method__c, Approved_For_Shippment__c FROM Order WHERE OpportunityId = '${reorder.sf_opportunity_id}' ORDER BY CreatedDate DESC LIMIT 1`
    );

    if (orders.length === 0) {
      // Order hasn't been created by SF yet — may take a few seconds after Closed Won
      return NextResponse.json({
        status: 'processing',
        label: 'Processing',
        description: 'Your order is being prepared by the Sunstone team.',
      });
    }

    const order = orders[0];
    let status = 'processing';
    let label = 'Processing';
    let description = 'Your order is being processed.';
    let trackingNumber: string | null = order.Tracking_number__c || null;
    let shippingCarrier: string | null = order.Shipping_Method__c || null;

    if (order.Shipped__c === true) {
      status = 'shipped';
      label = 'Shipped';
      description = trackingNumber
        ? `Your order has shipped! Tracking: ${trackingNumber}`
        : 'Your order has shipped!';
    } else if (order.Approved_For_Shippment__c === true) {
      status = 'approved';
      label = 'Approved — Shipping Soon';
      description = 'Your order has been approved and will ship shortly.';
    } else if (order.Id) {
      status = 'preparing';
      label = 'Preparing to Ship';
      description = 'Your order is being prepared for shipment.';
    }

    // Cache status back to reorder_history
    const updates: Record<string, any> = {
      shipping_status: status,
    };
    if (order.Id && !reorder.sf_order_id) updates.sf_order_id = order.Id;
    if (trackingNumber && trackingNumber !== reorder.tracking_number) updates.tracking_number = trackingNumber;
    if (shippingCarrier) updates.shipping_carrier = shippingCarrier;
    if (status === 'shipped' && reorder.shipping_status !== 'shipped') updates.status = 'shipped';

    await serviceClient
      .from('reorder_history')
      .update(updates)
      .eq('id', reorderId);

    return NextResponse.json({
      status,
      label,
      description,
      trackingNumber,
      shippingCarrier,
      orderNumber: order.OrderNumber,
      shipDate: order.Ship_Date__c,
    });
  } catch (err: any) {
    console.error('[SF Order Status] Error:', err);
    return NextResponse.json({ error: 'Failed to fetch order status' }, { status: 500 });
  }
}
