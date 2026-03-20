// ============================================================================
// Shipping Config — src/app/api/reorders/shipping-config/route.ts
// ============================================================================
// GET: Returns shipping rates + tax rates from platform_settings.
// Used by ReorderModal for instant client-side estimates.
// ============================================================================

import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceRoleClient } from '@/lib/supabase/server';
import { DEFAULT_RATES, type ShippingRatesConfig } from '@/lib/shipping-rules';

const DEFAULT_TAX_RATES: Record<string, number> = {
  UT: 0.0685, CA: 0.0725, TX: 0.0625, FL: 0.06, NY: 0.08,
  WA: 0.065, CO: 0.029, AZ: 0.056, GA: 0.04, NC: 0.0475,
  OH: 0.0575, IL: 0.0625, PA: 0.06, MI: 0.06, NJ: 0.06625,
  VA: 0.053, TN: 0.07, IN: 0.07, MO: 0.04225, SC: 0.06,
};
const DEFAULT_TAX_RATE = 0.07;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadSetting<T>(serviceClient: any, key: string, fallback: T): Promise<T> {
  try {
    const { data } = await serviceClient
      .from('platform_settings')
      .select('value')
      .eq('key', key)
      .is('tenant_id', null)
      .single();

    if (data?.value) {
      return (typeof data.value === 'string' ? JSON.parse(data.value) : data.value) as T;
    }
  } catch {
    // Fall back to defaults
  }
  return fallback;
}

export async function GET() {
  try {
    // Auth check
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

    const serviceClient = await createServiceRoleClient();

    const [shippingRates, taxConfig] = await Promise.all([
      loadSetting<ShippingRatesConfig>(serviceClient, 'shipping_rates', DEFAULT_RATES),
      loadSetting<{ rates: Record<string, number>; default: number }>(serviceClient, 'reorder_state_tax_rates', {
        rates: DEFAULT_TAX_RATES,
        default: DEFAULT_TAX_RATE,
      }),
    ]);

    return NextResponse.json({
      shippingRates,
      taxRates: taxConfig.rates,
      defaultTaxRate: taxConfig.default,
    });
  } catch {
    return NextResponse.json({ error: 'Failed to load shipping config' }, { status: 500 });
  }
}
