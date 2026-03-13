// ============================================================================
// Apply Pricing API — POST /api/onboarding/apply-pricing
// ============================================================================
// Updates sell_price on inventory_items based on the chosen pricing mode.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

type PricingMode = 'by_type' | 'by_metal' | 'by_markup' | 'by_tier' | 'individual';

interface PricingPayload {
  mode: PricingMode;
  // by_type prices
  bracelet_price?: number;
  anklet_price?: number;
  ring_price?: number;
  necklace_price?: number;
  // by_metal prices
  silver_price?: number;
  gold_price?: number;
  // by_markup
  margin?: number;
  // extras
  charms_price?: number;
  connectors_price?: number;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: member } = await supabase
      .from('tenant_members')
      .select('tenant_id')
      .eq('user_id', user.id)
      .not('accepted_at', 'is', null)
      .limit(1)
      .single();

    if (!member) {
      return NextResponse.json({ error: 'No tenant found' }, { status: 404 });
    }

    const tenantId = member.tenant_id;
    const payload: PricingPayload = await request.json();
    const { mode } = payload;

    if (!mode) {
      return NextResponse.json({ error: 'Missing pricing mode' }, { status: 400 });
    }

    // individual mode: no-op — user prices later
    if (mode === 'individual') {
      return NextResponse.json({ updated: 0, mode: 'individual' });
    }

    // tier mode: set pricing_mode on tenant, user creates tiers in Settings
    if (mode === 'by_tier') {
      await supabase
        .from('tenants')
        .update({ pricing_mode: 'tier' })
        .eq('id', tenantId);

      // Store in onboarding_data
      const { data: t } = await supabase.from('tenants').select('onboarding_data').eq('id', tenantId).single();
      const currentData = (t?.onboarding_data as Record<string, any>) || {};
      await supabase.from('tenants').update({
        onboarding_data: { ...currentData, pricing_mode: mode, pricing_set_at: new Date().toISOString() },
      }).eq('id', tenantId);

      return NextResponse.json({ updated: 0, mode: 'by_tier' });
    }

    // Fetch all inventory items for the tenant
    const { data: items, error: fetchError } = await supabase
      .from('inventory_items')
      .select('id, type, material, cost_per_unit')
      .eq('tenant_id', tenantId)
      .eq('is_active', true);

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    if (!items || items.length === 0) {
      return NextResponse.json({ updated: 0, message: 'No items to price' });
    }

    let updated = 0;

    if (mode === 'by_type') {
      // Ensure default product types exist for this tenant
      const DEFAULT_PRODUCT_TYPES = [
        { name: 'Bracelet', default_inches: 7, sort_order: 1 },
        { name: 'Anklet', default_inches: 10, sort_order: 2 },
        { name: 'Necklace', default_inches: 18, sort_order: 3 },
        { name: 'Ring', default_inches: 2.5, sort_order: 4 },
      ];

      const { data: existingTypes } = await supabase
        .from('product_types')
        .select('id, name')
        .eq('tenant_id', tenantId);

      const existingNames = new Set((existingTypes || []).map(t => t.name.toLowerCase()));
      const typesToInsert = DEFAULT_PRODUCT_TYPES.filter(t => !existingNames.has(t.name.toLowerCase()));

      if (typesToInsert.length > 0) {
        await supabase.from('product_types').insert(
          typesToInsert.map(t => ({
            tenant_id: tenantId,
            name: t.name,
            default_inches: t.default_inches,
            sort_order: t.sort_order,
            is_active: true,
            is_default: true,
          }))
        );
      }

      // Re-fetch all product types to get IDs
      const { data: productTypes } = await supabase
        .from('product_types')
        .select('id, name, default_inches')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .order('sort_order');

      if (productTypes && productTypes.length > 0) {
        // Build a name→price map from the payload
        const priceMap: Record<string, number> = {
          bracelet: payload.bracelet_price || 0,
          anklet: payload.anklet_price || 0,
          necklace: payload.necklace_price || 0,
          ring: payload.ring_price || 0,
        };

        // For each chain, create chain_product_prices entries and set pricing_mode
        const chainItems = items.filter(i => i.type === 'chain');
        for (const chain of chainItems) {
          const priceRows = productTypes.map(pt => ({
            inventory_item_id: chain.id,
            product_type_id: pt.id,
            tenant_id: tenantId,
            sell_price: priceMap[pt.name.toLowerCase()] || 0,
            default_inches: pt.default_inches,
            is_active: (priceMap[pt.name.toLowerCase()] || 0) > 0,
          }));

          // Upsert chain_product_prices
          await supabase
            .from('chain_product_prices')
            .upsert(priceRows, { onConflict: 'inventory_item_id,product_type_id' });

          // Ensure chain pricing_mode is per_product and sell_price is 0
          await supabase
            .from('inventory_items')
            .update({ pricing_mode: 'per_product', sell_price: 0 })
            .eq('id', chain.id);

          updated++;
        }
      }
    } else if (mode === 'by_metal') {
      for (const item of items) {
        if (item.type === 'chain') {
          const isGold = item.material?.toLowerCase().includes('gold');
          const price = isGold ? (payload.gold_price || 0) : (payload.silver_price || 0);
          const { error } = await supabase
            .from('inventory_items')
            .update({ sell_price: price })
            .eq('id', item.id);
          if (!error) updated++;
        }
      }
    } else if (mode === 'by_markup') {
      const margin = payload.margin || 0;
      if (margin > 0 && margin < 100) {
        for (const item of items) {
          if (item.type === 'chain' && item.cost_per_unit > 0) {
            const sellPrice = Math.round((item.cost_per_unit / (1 - margin / 100)) * 100) / 100;
            const { error } = await supabase
              .from('inventory_items')
              .update({ sell_price: sellPrice })
              .eq('id', item.id);
            if (!error) updated++;
          }
        }
      }
    }

    // Apply charms and connectors pricing if provided
    if (payload.charms_price != null && payload.charms_price > 0) {
      for (const item of items) {
        if (item.type === 'charm') {
          const { error } = await supabase
            .from('inventory_items')
            .update({ sell_price: payload.charms_price })
            .eq('id', item.id);
          if (!error) updated++;
        }
      }
    }

    if (payload.connectors_price != null && payload.connectors_price > 0) {
      for (const item of items) {
        if (item.type === 'connector') {
          const { error } = await supabase
            .from('inventory_items')
            .update({ sell_price: payload.connectors_price })
            .eq('id', item.id);
          if (!error) updated++;
        }
      }
    }

    // Store pricing mode in onboarding_data
    const { data: tenant } = await supabase
      .from('tenants')
      .select('onboarding_data')
      .eq('id', tenantId)
      .single();

    const currentData = (tenant?.onboarding_data as Record<string, any>) || {};
    await supabase
      .from('tenants')
      .update({
        onboarding_data: {
          ...currentData,
          pricing_mode: mode,
          pricing_set_at: new Date().toISOString(),
        },
      })
      .eq('id', tenantId);

    return NextResponse.json({ updated, mode });
  } catch (error: any) {
    console.error('Apply pricing error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
