// ============================================================================
// Shopify Draft Order Creation — src/app/api/shopify/create-order/route.ts
// ============================================================================
// POST: Creates a Shopify Draft Order for supply reordering.
// Auth: Requires logged-in tenant user.
// Returns invoiceUrl for checkout on Shopify.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase, createServiceRoleClient } from '@/lib/supabase/server';
import { shopifyAdminQuery } from '@/lib/shopify';

interface CreateOrderItem {
  variantId: string;
  quantity: number;
  inventoryItemId?: string;
  name?: string;
  unitPrice?: number;
}

interface CreateOrderBody {
  items: CreateOrderItem[];
  note?: string;
}

const DRAFT_ORDER_CREATE = `
  mutation draftOrderCreate($input: DraftOrderInput!) {
    draftOrderCreate(input: $input) {
      draftOrder {
        id
        invoiceUrl
        name
        totalPriceSet {
          shopMoney {
            amount
            currencyCode
          }
        }
        lineItems(first: 20) {
          edges {
            node {
              title
              quantity
              originalUnitPriceSet {
                shopMoney {
                  amount
                }
              }
            }
          }
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export async function POST(request: NextRequest) {
  try {
    // ── Auth check ──────────────────────────────────────────────────────
    const supabase = await createServerSupabase();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Derive tenant from user's membership
    const { data: member } = await supabase
      .from('tenant_members')
      .select('tenant_id')
      .eq('user_id', user.id)
      .limit(1)
      .single();

    if (!member) {
      return NextResponse.json({ error: 'No tenant membership' }, { status: 403 });
    }

    const tenantId = member.tenant_id;

    // Get tenant name for the order note
    const svc = await createServiceRoleClient();
    const { data: tenant } = await svc
      .from('tenants')
      .select('name')
      .eq('id', tenantId)
      .single();

    const tenantName = tenant?.name || 'Unknown Business';

    // ── Parse body ──────────────────────────────────────────────────────
    const body: CreateOrderBody = await request.json();

    if (!body.items || body.items.length === 0) {
      return NextResponse.json(
        { error: 'At least one item is required' },
        { status: 400 }
      );
    }

    // Validate items
    for (const item of body.items) {
      if (!item.variantId || !item.quantity || item.quantity < 1) {
        return NextResponse.json(
          { error: 'Each item needs variantId and quantity >= 1' },
          { status: 400 }
        );
      }
    }

    // ── Create Shopify Draft Order ──────────────────────────────────────
    const lineItems = body.items.map((item) => ({
      variantId: item.variantId,
      quantity: item.quantity,
    }));

    const note = body.note || `Reorder from Sunstone Studio — ${tenantName}`;

    const input = {
      lineItems,
      note,
      tags: ['sunstone-studio-reorder'],
    };

    console.log('[Shopify Create Order] Creating draft order:', JSON.stringify(input, null, 2));

    let data;
    try {
      data = await shopifyAdminQuery(DRAFT_ORDER_CREATE, { input });
    } catch (err: any) {
      console.error('[Shopify Create Order] GraphQL error:', err.message);
      // Check for scope errors
      if (err.message?.includes('access') || err.message?.includes('scope') || err.message?.includes('permission')) {
        return NextResponse.json(
          {
            error: 'Shopify write access not yet authorized. A platform admin needs to re-authorize the Shopify connection at /api/shopify/auth to grant order creation permissions.',
            needsReauth: true,
          },
          { status: 403 }
        );
      }
      throw err;
    }

    const result = data.draftOrderCreate;

    if (result.userErrors?.length > 0) {
      console.error('[Shopify Create Order] User errors:', result.userErrors);
      return NextResponse.json(
        { error: result.userErrors.map((e: any) => e.message).join('; ') },
        { status: 422 }
      );
    }

    const draftOrder = result.draftOrder;
    if (!draftOrder) {
      return NextResponse.json(
        { error: 'Draft order creation returned no result' },
        { status: 500 }
      );
    }

    const totalAmount = parseFloat(draftOrder.totalPriceSet?.shopMoney?.amount || '0');

    // ── Log to reorder_history ──────────────────────────────────────────
    const reorderItems = body.items.map((item) => ({
      inventory_item_id: item.inventoryItemId || null,
      variant_id: item.variantId,
      name: item.name || 'Unknown',
      quantity: item.quantity,
      unit_price: item.unitPrice || 0,
    }));

    const { data: reorder, error: reorderErr } = await supabase
      .from('reorder_history')
      .insert({
        tenant_id: tenantId,
        shopify_draft_order_id: draftOrder.id,
        shopify_order_name: draftOrder.name,
        invoice_url: draftOrder.invoiceUrl,
        status: 'draft',
        items: reorderItems,
        total_amount: totalAmount,
        notes: note,
        ordered_by: user.id,
      })
      .select('id')
      .single();

    if (reorderErr) {
      console.error('[Shopify Create Order] Failed to log reorder:', reorderErr.message);
      // Don't fail the request — the draft order was created successfully
    }

    console.log('[Shopify Create Order] Draft order created:', draftOrder.name, '→', draftOrder.invoiceUrl);

    return NextResponse.json({
      success: true,
      draftOrderId: draftOrder.id,
      orderName: draftOrder.name,
      invoiceUrl: draftOrder.invoiceUrl,
      totalAmount,
      reorderId: reorder?.id || null,
      lineItems: (draftOrder.lineItems?.edges || []).map((e: any) => ({
        title: e.node.title,
        quantity: e.node.quantity,
        unitPrice: parseFloat(e.node.originalUnitPriceSet?.shopMoney?.amount || '0'),
      })),
    });
  } catch (err: any) {
    console.error('[Shopify Create Order] Error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to create order' },
      { status: 500 }
    );
  }
}
