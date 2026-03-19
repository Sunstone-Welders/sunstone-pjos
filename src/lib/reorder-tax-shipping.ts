// ============================================================================
// Reorder Tax & Shipping Helpers — src/lib/reorder-tax-shipping.ts
// ============================================================================
// Estimates tax and shipping for supply reorders using platform_settings
// fallback config. These are estimates — Avalara (via SF Quote sync) will
// provide the final tax amount after the order is created.
// ============================================================================

import { createServiceRoleClient } from '@/lib/supabase/server';

interface ShippingTier {
  maxAmount: number | null;
  rate: number;
}

interface ShippingConfig {
  tiers: ShippingTier[];
}

interface TaxConfig {
  rates: Record<string, number>;
  default: number;
}

// Request-scoped cache
let shippingConfigCache: ShippingConfig | null = null;
let taxConfigCache: TaxConfig | null = null;

const DEFAULT_SHIPPING: ShippingConfig = {
  tiers: [
    { maxAmount: 50, rate: 7.99 },
    { maxAmount: 150, rate: 9.99 },
    { maxAmount: 500, rate: 12.99 },
    { maxAmount: null, rate: 0 },
  ],
};

const DEFAULT_TAX: TaxConfig = {
  rates: {
    UT: 0.0685, CA: 0.0725, TX: 0.0625, FL: 0.06, NY: 0.08,
    WA: 0.065, CO: 0.029, AZ: 0.056, GA: 0.04, NC: 0.0475,
    OH: 0.0575, IL: 0.0625, PA: 0.06, MI: 0.06, NJ: 0.06625,
    VA: 0.053, TN: 0.07, IN: 0.07, MO: 0.04225, SC: 0.06,
  },
  default: 0.07,
};

async function loadConfig<T>(key: string, fallback: T): Promise<T> {
  try {
    const serviceClient = await createServiceRoleClient();
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

/**
 * Estimate shipping cost based on order subtotal.
 */
export async function estimateShipping(subtotal: number): Promise<number> {
  if (!shippingConfigCache) {
    shippingConfigCache = await loadConfig<ShippingConfig>('reorder_shipping_rates', DEFAULT_SHIPPING);
  }

  const tiers = shippingConfigCache.tiers;
  for (const tier of tiers) {
    if (tier.maxAmount === null || subtotal <= tier.maxAmount) {
      return tier.rate;
    }
  }
  return 0;
}

/**
 * Estimate tax based on subtotal and shipping state.
 */
export async function estimateTax(subtotal: number, state: string): Promise<number> {
  if (!taxConfigCache) {
    taxConfigCache = await loadConfig<TaxConfig>('reorder_state_tax_rates', DEFAULT_TAX);
  }

  const stateUpper = state.toUpperCase().trim();
  const rate = taxConfigCache.rates[stateUpper] ?? taxConfigCache.default;
  return Math.round(subtotal * rate * 100) / 100;
}

/**
 * Reset caches (call at the start of each request if needed).
 */
export function resetTaxShippingCache() {
  shippingConfigCache = null;
  taxConfigCache = null;
}
