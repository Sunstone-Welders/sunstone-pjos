// ============================================================================
// Load Kit API — POST /api/onboarding/load-kit
// ============================================================================
// Auto-populates inventory with Sunstone starter kit items.
// Prevents duplicates: if inventory already exists, returns existing count.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

type KitType = 'momentum' | 'dream' | 'legacy';

interface ChainDef {
  name: string;
  material: string;
}

interface KitDefinition {
  chains: ChainDef[];
  chainLength: number;
  jumpRings: { name: string; material: string; quantity: number }[];
  connectors: { name: string; material: string }[];
}

// ============================================================================
// Actual Sunstone starter kit chain names and materials
// ============================================================================

const MOMENTUM_CHAINS: ChainDef[] = [
  { name: 'Chloe', material: '14/20 Yellow Gold-Filled' },
  { name: 'Olivia', material: '14/20 Yellow Gold-Filled' },
  { name: 'Marlee', material: '14/20 White Gold-Filled' },
  { name: 'Lavina', material: 'Sterling Silver' },
  { name: 'Ella', material: 'Sterling Silver' },
  { name: 'Paisley', material: 'Sterling Silver' },
  { name: 'Maria', material: '14/20 Yellow Gold-Filled' },
];

const DREAM_CHAINS: ChainDef[] = [
  ...MOMENTUM_CHAINS,
  { name: 'Alessia', material: 'Sterling Silver' },
  { name: 'Benedetta', material: 'Sterling Silver' },
];

const LEGACY_CHAINS: ChainDef[] = [
  ...DREAM_CHAINS,
  { name: 'Charlie', material: '14/20 Yellow Gold-Filled' },
  { name: 'Lucy', material: '14/20 White Gold-Filled' },
  { name: 'Grace', material: '14/20 Yellow Gold-Filled' },
  { name: 'Bryce', material: 'Sterling Silver' },
  { name: 'Hannah', material: '14/20 Yellow Gold-Filled' },
  { name: 'Ruby', material: 'Sterling Silver' },
];

const BS_CONNECTORS: { name: string; material: string }[] = [
  { name: 'Birthstone Connectors \u2014 Sterling Silver', material: 'Sterling Silver' },
  { name: 'Birthstone Connectors \u2014 14/20 Yellow Gold-Filled', material: '14/20 Yellow Gold-Filled' },
];

const KIT_DATA: Record<KitType, KitDefinition> = {
  momentum: {
    chains: MOMENTUM_CHAINS,
    chainLength: 36,
    jumpRings: [
      { name: 'Jump Rings \u2014 Sterling Silver', material: 'Sterling Silver', quantity: 25 },
      { name: 'Jump Rings \u2014 Gold-Filled', material: '14/20 Yellow Gold-Filled', quantity: 25 },
    ],
    connectors: [],
  },
  dream: {
    chains: DREAM_CHAINS,
    chainLength: 36,
    jumpRings: [
      { name: 'Jump Rings \u2014 Sterling Silver', material: 'Sterling Silver', quantity: 50 },
      { name: 'Jump Rings \u2014 Gold-Filled', material: '14/20 Yellow Gold-Filled', quantity: 50 },
    ],
    connectors: BS_CONNECTORS,
  },
  legacy: {
    chains: LEGACY_CHAINS,
    chainLength: 36,
    jumpRings: [
      { name: 'Jump Rings \u2014 Sterling Silver', material: 'Sterling Silver', quantity: 100 },
      { name: 'Jump Rings \u2014 Gold-Filled', material: '14/20 Yellow Gold-Filled', quantity: 100 },
    ],
    connectors: BS_CONNECTORS,
  },
};

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get tenant
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

    // Prevent duplicates: check if inventory items already exist
    const { count: existingCount } = await supabase
      .from('inventory_items')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId);

    if (existingCount && existingCount > 0) {
      return NextResponse.json({
        itemsCreated: 0,
        existing: existingCount,
        message: 'Inventory already populated',
      });
    }

    const { kit } = await request.json();
    if (!kit || !KIT_DATA[kit as KitType]) {
      return NextResponse.json({ error: 'Invalid kit type' }, { status: 400 });
    }

    const kitDef = KIT_DATA[kit as KitType];
    const items: any[] = [];

    // Insert chains
    for (const chain of kitDef.chains) {
      items.push({
        tenant_id: tenantId,
        name: chain.name,
        type: 'chain',
        material: chain.material,
        unit: 'in',
        quantity_on_hand: kitDef.chainLength,
        supplier: 'Sunstone',
        pricing_mode: 'per_product',
        cost_per_unit: 0,
        sell_price: 0,
        reorder_threshold: 12,
        is_active: true,
      });
    }

    // Insert jump rings
    for (const jr of kitDef.jumpRings) {
      items.push({
        tenant_id: tenantId,
        name: jr.name,
        type: 'jump_ring',
        material: jr.material,
        unit: 'each',
        quantity_on_hand: jr.quantity,
        supplier: 'Sunstone',
        pricing_mode: 'per_product',
        cost_per_unit: 0,
        sell_price: 0,
        reorder_threshold: 10,
        is_active: true,
      });
    }

    // Insert BS connectors (Dream/Legacy only)
    for (const conn of kitDef.connectors) {
      items.push({
        tenant_id: tenantId,
        name: conn.name,
        type: 'connector',
        material: conn.material,
        unit: 'each',
        quantity_on_hand: 1,
        supplier: 'Sunstone',
        pricing_mode: 'per_product',
        cost_per_unit: 0,
        sell_price: 0,
        reorder_threshold: 0,
        is_active: true,
      });
    }

    const { error: insertError } = await supabase
      .from('inventory_items')
      .insert(items);

    if (insertError) {
      console.error('Kit load insert error:', insertError);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    // Update onboarding_data with kit info (read-modify-write)
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
          kit,
          kit_loaded_at: new Date().toISOString(),
        },
      })
      .eq('id', tenantId);

    return NextResponse.json({
      itemsCreated: items.length,
      chains: kitDef.chains.length,
      jumpRings: kitDef.jumpRings.reduce((sum, jr) => sum + jr.quantity, 0),
    });
  } catch (error: any) {
    console.error('Load kit error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
