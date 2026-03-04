// ============================================================================
// Apply Pricing API — POST /api/onboarding/apply-pricing
// ============================================================================
// Updates sell_price on inventory_items based on the chosen pricing mode.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

type PricingMode = 'by_type' | 'by_metal' | 'by_markup' | 'individual';

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
      // Set a flat price per product — applies to chains
      const defaultPrice = payload.bracelet_price || 0;
      for (const item of items) {
        if (item.type === 'chain') {
          const { error } = await supabase
            .from('inventory_items')
            .update({ sell_price: defaultPrice })
            .eq('id', item.id);
          if (!error) updated++;
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
