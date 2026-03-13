// ============================================================================
// ChainPricingConfig — src/components/inventory/ChainPricingConfig.tsx
// ============================================================================
// REDESIGNED: Pricing clarity overhaul
// - Two-path mode selection (big visual cards, not a buried toggle)
// - Per Inch: prominent price input + auto-preview table
// - Per Product: product type rows are THE main thing, not an afterthought
// - Inline validation with clear guidance
// ============================================================================

'use client';

import { useEffect, useState, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { PricingMode, ProductType, PricingTier, TenantPricingMode } from '@/types';

// Row data passed back to parent form
export interface PriceConfigRow {
  product_type_id: string;
  product_type_name: string;
  default_inches: number;
  sell_price: number;
  is_active: boolean;
}

interface ChainPricingConfigProps {
  tenantId: string;
  inventoryItemId: string | null; // null for new items
  pricingMode: PricingMode;
  onPricingModeChange: (mode: PricingMode) => void;
  perInchRate: number;
  onPerInchRateChange: (rate: number) => void;
  onPricesChange: (rows: PriceConfigRow[]) => void;
  chainName?: string; // For preview display
  validationTriggered?: boolean; // True when user attempted save
  // Tier pricing
  tenantPricingMode?: TenantPricingMode;
  pricingTierId?: string | null;
  onPricingTierChange?: (tierId: string | null) => void;
}

export default function ChainPricingConfig({
  tenantId,
  inventoryItemId,
  pricingMode,
  onPricingModeChange,
  perInchRate,
  onPerInchRateChange,
  onPricesChange,
  chainName = 'This chain',
  validationTriggered = false,
  tenantPricingMode,
  pricingTierId,
  onPricingTierChange,
}: ChainPricingConfigProps) {
  const supabase = createClient();

  const [productTypes, setProductTypes] = useState<ProductType[]>([]);
  const [loading, setLoading] = useState(true);
  const [priceRows, setPriceRows] = useState<PriceConfigRow[]>([]);
  const [existingPricesLoaded, setExistingPricesLoaded] = useState(false);
  const [tiers, setTiers] = useState<PricingTier[]>([]);

  // Load pricing tiers when tenant uses tier mode
  useEffect(() => {
    if (tenantPricingMode !== 'tier') return;
    const loadTiers = async () => {
      const { data } = await supabase
        .from('pricing_tiers')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .order('sort_order');
      setTiers(data || []);
    };
    loadTiers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, tenantPricingMode]);

  // Load product types from Supabase
  useEffect(() => {
    const loadProductTypes = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('product_types')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      if (!error && data) {
        setProductTypes(data);
        // Initialize price rows if we haven't loaded existing prices yet
        if (!existingPricesLoaded) {
          const initialRows: PriceConfigRow[] = data.map((pt) => ({
            product_type_id: pt.id,
            product_type_name: pt.name,
            default_inches: pt.default_inches,
            sell_price: 0,
            is_active: true, // Default all to active for new items
          }));
          setPriceRows(initialRows);
          onPricesChange(initialRows);
        }
      }
      setLoading(false);
    };

    loadProductTypes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  // Load existing prices when editing
  useEffect(() => {
    if (!inventoryItemId || productTypes.length === 0) return;

    const loadExistingPrices = async () => {
      const { data, error } = await supabase
        .from('chain_product_prices')
        .select('*, product_type:product_types(*)')
        .eq('inventory_item_id', inventoryItemId)
        .eq('tenant_id', tenantId);

      if (!error && data) {
        const rows: PriceConfigRow[] = productTypes.map((pt) => {
          const existing = data.find((d: any) => d.product_type_id === pt.id);
          return {
            product_type_id: pt.id,
            product_type_name: pt.name,
            default_inches: existing?.default_inches ?? pt.default_inches,
            sell_price: existing ? Number(existing.sell_price) : 0,
            is_active: existing ? existing.is_active : false,
          };
        });
        setPriceRows(rows);
        onPricesChange(rows);
        setExistingPricesLoaded(true);
      }
    };

    loadExistingPrices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inventoryItemId, productTypes]);

  // Update a single row
  const updateRow = (productTypeId: string, updates: Partial<PriceConfigRow>) => {
    const newRows = priceRows.map((row) =>
      row.product_type_id === productTypeId ? { ...row, ...updates } : row
    );
    setPriceRows(newRows);
    onPricesChange(newRows);
  };

  // Validation helpers
  const activeRowsWithNoPrice = useMemo(
    () => priceRows.filter((r) => r.is_active && r.sell_price <= 0),
    [priceRows]
  );
  const hasActiveRows = priceRows.some((r) => r.is_active);
  const showProductValidation = validationTriggered && pricingMode === 'per_product';
  const showInchValidation = validationTriggered && pricingMode === 'per_inch' && perInchRate <= 0;

  if (loading) {
    return (
      <div className="py-8 text-center text-sm text-[var(--text-tertiary)]">
        Loading pricing options…
      </div>
    );
  }

  if (productTypes.length === 0) {
    return (
      <div className="rounded-xl border border-warning-200 bg-warning-50 p-4">
        <p className="text-sm font-medium text-warning-600">Set up Product Types first</p>
        <p className="text-sm text-warning-600 mt-1">
          Go to Settings → Product Types to add bracelet, anklet, necklace, etc. before setting up chain pricing.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ─── Mode Toggle: Two-Path Cards ─── */}
      <div>
        <label className="block text-sm font-medium text-[var(--text-primary)] mb-3">
          How do you price this chain?
        </label>
        <div className="grid grid-cols-2 gap-3">
          {/* Per Product Card */}
          <button
            type="button"
            onClick={() => onPricingModeChange('per_product')}
            className={`relative text-left rounded-xl border-2 p-4 transition-all duration-200 ${
              pricingMode === 'per_product'
                ? 'border-[var(--accent-primary)] bg-[var(--accent-50)] shadow-sm'
                : 'border-[var(--border-default)] bg-[var(--surface-base)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-raised)]'
            }`}
          >
            {/* Radio indicator */}
            <div className="flex items-start gap-3">
              <div
                className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                  pricingMode === 'per_product'
                    ? 'border-[var(--accent-primary)]'
                    : 'border-[var(--border-strong)]'
                }`}
              >
                {pricingMode === 'per_product' && (
                  <div className="w-2.5 h-2.5 rounded-full bg-[var(--accent-primary)]" />
                )}
              </div>
              <div className="min-w-0">
                {/* Tag icon */}
                <div className="flex items-center gap-2 mb-1">
                  <svg className="w-4 h-4 text-[var(--text-secondary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                  </svg>
                  <span className="text-sm font-semibold text-[var(--text-primary)]">Per Product</span>
                </div>
                <p className="text-xs text-[var(--text-tertiary)] leading-relaxed">
                  Fixed price for each product type — bracelet, anklet, etc.
                </p>
              </div>
            </div>
          </button>

          {/* Per Inch Card */}
          <button
            type="button"
            onClick={() => onPricingModeChange('per_inch')}
            className={`relative text-left rounded-xl border-2 p-4 transition-all duration-200 ${
              pricingMode === 'per_inch'
                ? 'border-[var(--accent-primary)] bg-[var(--accent-50)] shadow-sm'
                : 'border-[var(--border-default)] bg-[var(--surface-base)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-raised)]'
            }`}
          >
            <div className="flex items-start gap-3">
              <div
                className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                  pricingMode === 'per_inch'
                    ? 'border-[var(--accent-primary)]'
                    : 'border-[var(--border-strong)]'
                }`}
              >
                {pricingMode === 'per_inch' && (
                  <div className="w-2.5 h-2.5 rounded-full bg-[var(--accent-primary)]" />
                )}
              </div>
              <div className="min-w-0">
                {/* Ruler icon */}
                <div className="flex items-center gap-2 mb-1">
                  <svg className="w-4 h-4 text-[var(--text-secondary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12c0-1.232-.046-2.453-.138-3.662a4.006 4.006 0 00-3.7-3.7 48.678 48.678 0 00-7.324 0 4.006 4.006 0 00-3.7 3.7c-.017.22-.032.441-.046.662M19.5 12l3-3m-3 3l-3-3m-12 3c0 1.232.046 2.453.138 3.662a4.006 4.006 0 003.7 3.7 48.656 48.656 0 007.324 0 4.006 4.006 0 003.7-3.7c.017-.22.032-.441.046-.662M4.5 12l3 3m-3-3l-3 3" />
                  </svg>
                  <span className="text-sm font-semibold text-[var(--text-primary)]">Per Inch</span>
                </div>
                <p className="text-xs text-[var(--text-tertiary)] leading-relaxed">
                  Price calculated from measured chain — great for gold &amp; platinum.
                </p>
              </div>
            </div>
          </button>
        </div>
      </div>

      {/* ─── Tier Assignment (when tenant uses tier pricing) ─── */}
      {tenantPricingMode === 'tier' && pricingMode === 'per_product' && tiers.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">
            Pricing Tier
          </label>
          <p className="text-xs text-[var(--text-tertiary)] mb-2">
            Select a tier to auto-fill product prices. You can still override individual prices.
          </p>
          <select
            value={pricingTierId || ''}
            onChange={(e) => {
              const tierId = e.target.value || null;
              onPricingTierChange?.(tierId);
              // Auto-fill prices from the selected tier
              if (tierId) {
                const tier = tiers.find(t => t.id === tierId);
                if (tier) {
                  const tierPriceMap: Record<string, number | null> = {
                    bracelet: tier.bracelet_price,
                    anklet: tier.anklet_price,
                    ring: tier.ring_price,
                    necklace: tier.necklace_price_per_inch,
                    'hand chain': tier.hand_chain_price,
                  };
                  const newRows = priceRows.map(row => {
                    const rowNameLower = row.product_type_name.toLowerCase();
                    for (const [key, price] of Object.entries(tierPriceMap)) {
                      if (price != null && rowNameLower.includes(key)) {
                        return { ...row, sell_price: Number(price), is_active: true };
                      }
                    }
                    return row;
                  });
                  setPriceRows(newRows);
                  onPricesChange(newRows);
                }
              }
            }}
            className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--surface-base)] px-3 py-2.5 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)] focus:ring-2 focus:ring-[var(--accent-subtle)] min-h-[44px]"
          >
            <option value="">None (custom prices)</option>
            {tiers.map(tier => (
              <option key={tier.id} value={tier.id}>{tier.name}</option>
            ))}
          </select>
          {pricingTierId && tiers.find(t => t.id === pricingTierId) && (
            <p className="mt-1.5 text-xs text-[var(--accent-600)]">
              Prices auto-filled from &ldquo;{tiers.find(t => t.id === pricingTierId)?.name}&rdquo; tier
            </p>
          )}
        </div>
      )}

      {/* ─── Per Inch Mode ─── */}
      {pricingMode === 'per_inch' && (
        <div className="space-y-4">
          {/* Large price input */}
          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">
              Sell Price per Inch
            </label>
            <p className="text-xs text-[var(--text-tertiary)] mb-2">What you charge customers per inch</p>
            <div className="relative max-w-xs">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg font-medium text-[var(--text-tertiary)]">
                $
              </span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={perInchRate || ''}
                onChange={(e) => onPerInchRateChange(parseFloat(e.target.value) || 0)}
                placeholder="0.00"
                className={`w-full rounded-xl border bg-[var(--surface-base)] pl-9 pr-14 py-4 text-2xl  font-semibold text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 transition-colors ${
                  showInchValidation
                    ? 'border-[var(--error-500)] focus:border-[var(--error-600)] focus:ring-[var(--error-50)]'
                    : 'border-[var(--border-default)] focus:border-[var(--accent-primary)] focus:ring-[var(--accent-subtle)]'
                }`}
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-medium text-[var(--text-tertiary)]">
                / inch
              </span>
            </div>
            {showInchValidation && (
              <p className="mt-2 text-sm text-[var(--error-600)]">
                Set a per-inch price so this chain appears in the POS.
              </p>
            )}
          </div>

          {/* Auto-calculated preview table */}
          {perInchRate > 0 && (
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] overflow-hidden">
              <div className="px-4 py-3 border-b border-[var(--border-subtle)]">
                <p className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider">
                  Price Preview
                </p>
              </div>
              <div className="divide-y divide-[var(--border-subtle)]">
                {productTypes.map((pt) => {
                  const calculatedPrice = perInchRate * (pt.default_inches ?? 0);
                  return (
                    <div key={pt.id} className="px-4 py-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-[var(--text-primary)]">{pt.name}</span>
                        <span className="text-xs text-[var(--text-tertiary)]">
                          ({pt.default_inches}&quot;)
                        </span>
                      </div>
                      <span className="text-sm  font-semibold text-[var(--text-primary)]">
                        ${calculatedPrice.toFixed(2)}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="px-4 py-3 bg-[var(--surface-subtle)] border-t border-[var(--border-subtle)]">
                <p className="text-xs text-[var(--text-tertiary)]">
                  At checkout, the artist measures the chain and the price is calculated automatically.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── Per Product Mode ─── */}
      {pricingMode === 'per_product' && (
        <div className="space-y-3">
          <div>
            <p className="text-sm text-[var(--text-secondary)]">
              Set a price for each product type you sell this chain as. Only priced items will appear in the POS.
            </p>
          </div>

          {/* Validation banner */}
          {showProductValidation && activeRowsWithNoPrice.length > 0 && (
            <div className="rounded-lg border border-[var(--error-200)] bg-[var(--error-50)] px-4 py-3">
              <p className="text-sm text-[var(--error-600)]">
                Set prices for enabled product types before saving. Items without prices won&apos;t appear in the POS.
              </p>
            </div>
          )}

          {showProductValidation && !hasActiveRows && (
            <div className="rounded-lg border border-warning-200 bg-warning-50 px-4 py-3">
              <p className="text-sm text-warning-600">
                Enable at least one product type so this chain can be sold.
              </p>
            </div>
          )}

          {/* Product type rows */}
          <div className="rounded-xl border border-[var(--border-default)] overflow-hidden divide-y divide-[var(--border-subtle)]">
            {priceRows.map((row) => {
              const hasValidationError =
                showProductValidation && row.is_active && row.sell_price <= 0;

              return (
                <div
                  key={row.product_type_id}
                  className={`px-4 py-3 transition-colors ${
                    row.is_active
                      ? 'bg-[var(--surface-base)]'
                      : 'bg-[var(--surface-subtle)] opacity-60'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {/* Checkbox */}
                    <label className="relative flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={row.is_active}
                        onChange={(e) =>
                          updateRow(row.product_type_id, { is_active: e.target.checked })
                        }
                        className="sr-only peer"
                      />
                      <div className="w-5 h-5 rounded border-2 border-[var(--border-strong)] bg-[var(--surface-base)] peer-checked:bg-[var(--accent-primary)] peer-checked:border-[var(--accent-primary)] flex items-center justify-center transition-colors">
                        <svg
                          className="w-3 h-3 text-white opacity-0 peer-checked:opacity-100"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={3}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      {/* Invisible but accessible checkbox visual hack — the SVG above handles it */}
                    </label>

                    {/* Product info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-sm font-medium ${
                            row.is_active
                              ? 'text-[var(--text-primary)]'
                              : 'text-[var(--text-tertiary)]'
                          }`}
                        >
                          {row.product_type_name}
                        </span>
                        <span className="text-xs text-[var(--text-tertiary)]">
                          {row.default_inches}&quot;
                        </span>
                      </div>
                    </div>

                    {/* Price input */}
                    <div className="relative w-28 shrink-0">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--text-tertiary)]">
                        $
                      </span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={row.sell_price || ''}
                        onChange={(e) =>
                          updateRow(row.product_type_id, {
                            sell_price: parseFloat(e.target.value) || 0,
                          })
                        }
                        disabled={!row.is_active}
                        placeholder="0.00"
                        className={`w-full rounded-lg border bg-[var(--surface-base)] pl-7 pr-3 py-2 text-sm  text-right text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 transition-colors disabled:bg-[var(--surface-subtle)] disabled:text-[var(--text-tertiary)] disabled:cursor-not-allowed min-h-[40px] ${
                          hasValidationError
                            ? 'border-[var(--error-500)] focus:border-[var(--error-600)] focus:ring-[var(--error-50)]'
                            : 'border-[var(--border-default)] focus:border-[var(--accent-primary)] focus:ring-[var(--accent-subtle)]'
                        }`}
                      />
                    </div>
                  </div>
                  {hasValidationError && (
                    <p className="mt-1 ml-8 text-xs text-[var(--error-600)]">Price required</p>
                  )}
                </div>
              );
            })}
          </div>

          {/* Preview: how names appear in POS */}
          {priceRows.some((r) => r.is_active && r.sell_price > 0) && (
            <div className="rounded-lg bg-[var(--surface-raised)] border border-[var(--border-subtle)] px-4 py-3">
              <p className="text-xs font-medium text-[var(--text-tertiary)] mb-2 uppercase tracking-wider">
                How it appears in the POS
              </p>
              <div className="space-y-1">
                {priceRows
                  .filter((r) => r.is_active && r.sell_price > 0)
                  .map((r) => (
                    <div key={r.product_type_id} className="flex items-center justify-between">
                      <span className="text-sm text-[var(--text-primary)]">
                        {chainName} {r.product_type_name}
                      </span>
                      <span className="text-sm  text-[var(--text-secondary)]">
                        ${r.sell_price.toFixed(2)}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}