// ============================================================================
// Chain Product Prices API — src/app/api/chain-product-prices/route.ts
// ============================================================================
// POST: Bulk upsert chain product prices for a specific inventory item.
// Accepts an array of price configs and syncs them to the DB.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

interface PriceConfig {
  product_type_id: string;
  sell_price: number;
  default_inches: number | null;
  is_active: boolean;
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { inventory_item_id, tenant_id, prices } = body as {
    inventory_item_id: string;
    tenant_id: string;
    prices: PriceConfig[];
  };

  if (!inventory_item_id || !tenant_id || !Array.isArray(prices)) {
    return NextResponse.json(
      { error: 'inventory_item_id, tenant_id, and prices array required' },
      { status: 400 }
    );
  }

  // Upsert each price config
  const results = [];
  for (const price of prices) {
    const { data, error } = await supabase
      .from('chain_product_prices')
      .upsert(
        {
          inventory_item_id,
          product_type_id: price.product_type_id,
          tenant_id,
          sell_price: price.sell_price,
          default_inches: price.default_inches,
          is_active: price.is_active,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'inventory_item_id,product_type_id' }
      )
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: 'Failed to save chain prices' }, { status: 500 });
    }
    results.push(data);
  }

  return NextResponse.json(results);
}

// GET: Fetch chain product prices for a specific inventory item
export async function GET(request: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const inventoryItemId = request.nextUrl.searchParams.get('inventoryItemId');
  if (!inventoryItemId) {
    return NextResponse.json({ error: 'inventoryItemId required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('chain_product_prices')
    .select('*, product_types(*)')
    .eq('inventory_item_id', inventoryItemId);

  if (error) return NextResponse.json({ error: 'Failed to save chain prices' }, { status: 500 });
  return NextResponse.json(data);
}
