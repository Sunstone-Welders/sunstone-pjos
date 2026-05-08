'use client';

import { useState, useMemo, useCallback, useRef } from 'react';
import type { InventoryItem, InventoryItemVariant, ProductType, ChainProductPrice, CartItem, PricingTier, PricingTierCustomPrice } from '@/types';
import { MaterialTabs } from './MaterialTabs';
import { ChainGrid } from './ChainGrid';
import { ProductTypeRow } from './ProductTypeRow';
import { InchAdjuster } from './InchAdjuster';
import { AddOnsSection } from './AddOnsSection';
import { VariantPicker } from './VariantPicker';

/** Map of product type name (lowercase) → pricing_tiers column key */
const BUILTIN_TIER_COLUMNS: Record<string, keyof PricingTier> = {
  bracelet: 'bracelet_price',
  anklet: 'anklet_price',
  ring: 'ring_price',
  necklace: 'necklace_price_per_inch',
  'hand chain': 'hand_chain_price',
};

export interface ProductSelectorProps {
  chains: InventoryItem[];
  inventory: InventoryItem[];
  productTypes: ProductType[];
  chainPrices: ChainProductPrice[];
  onAddToCart: (item: Omit<CartItem, 'id' | 'line_total' | 'warranty_amount'> & { warranty_amount?: number }) => void;
  mode: 'store' | 'event';
  tenantPricingMode?: string;
  pricingTiers?: { id: string; name: string }[];
  /** Full pricing tier data for tier-based price resolution */
  fullPricingTiers?: PricingTier[];
  /** Custom tier prices for non-built-in product types */
  customTierPrices?: PricingTierCustomPrice[];
  itemVariants?: Record<string, InventoryItemVariant[]>;
}

export function ProductSelector({
  chains,
  inventory,
  productTypes,
  chainPrices,
  onAddToCart,
  mode,
  tenantPricingMode,
  pricingTiers = [],
  fullPricingTiers = [],
  customTierPrices = [],
  itemVariants,
}: ProductSelectorProps) {
  // ── View toggle: chains vs add-ons ──
  const [view, setView] = useState<'chains' | 'addons'>('chains');

  // ── Chain selection state ──
  const [selectedMaterial, setSelectedMaterial] = useState<string | null>(null);
  const [selectedTier, setSelectedTier] = useState<string | null>(null);
  const [selectedChain, setSelectedChain] = useState<InventoryItem | null>(null);
  const productTypeRef = useRef<HTMLDivElement>(null);
  const [inchAdjuster, setInchAdjuster] = useState<{
    chain: InventoryItem;
    productType: ProductType;
  } | null>(null);

  // ── Variant picker state ──
  const [variantPickerItem, setVariantPickerItem] = useState<InventoryItem | null>(null);

  // ── Auto-mode detection ──
  const activeChains = useMemo(
    () => chains.filter((c) => c.quantity_on_hand > 0),
    [chains]
  );
  const isQuickTap = activeChains.length <= 12;

  // ── Materials from active chains ──
  const materials = useMemo(() => {
    const mats = new Set<string>();
    activeChains.forEach((c) => {
      if (c.material) mats.add(c.material);
      else mats.add('Unspecified');
    });
    return Array.from(mats).sort();
  }, [activeChains]);

  // ── Filtered chains based on selected tier and material ──
  const filteredChains = useMemo(() => {
    let result = activeChains;
    if (selectedTier !== null) {
      result = result.filter((c) => c.pricing_tier_id === selectedTier);
    }
    if (selectedMaterial !== null) {
      result = result.filter((c) => (c.material || 'Unspecified') === selectedMaterial);
    }
    return result;
  }, [activeChains, selectedMaterial, selectedTier]);

  // ── Reset selection ──
  const resetSelection = useCallback(() => {
    setSelectedChain(null);
    setInchAdjuster(null);
  }, []);

  // ── Handle chain tap ──
  const handleChainSelect = useCallback((chain: InventoryItem) => {
    if (selectedChain?.id === chain.id) {
      // Deselect
      resetSelection();
    } else {
      setSelectedChain(chain);
      setInchAdjuster(null);
      // Auto-scroll to product type selector after it renders
      setTimeout(() => {
        productTypeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  }, [selectedChain, resetSelection]);

  // ── Handle flat-rate product type selection → add to cart immediately ──
  const handleFlatRateSelect = useCallback(
    (chain: InventoryItem, pt: ProductType, price: number, inches: number) => {
      onAddToCart({
        inventory_item_id: chain.id,
        name: `${chain.name} ${pt.name}`,
        quantity: 1,
        unit_price: price,
        discount_type: null,
        discount_value: 0,
        product_type_id: pt.id,
        product_type_name: pt.name,
        inches_used: inches,
        pricing_mode: 'per_product',
        _jump_rings_required: pt.jump_rings_required ?? 1,
      });
      resetSelection();
    },
    [onAddToCart, resetSelection]
  );

  // ── Handle per-inch product type selection → open inch adjuster ──
  const handlePerInchSelect = useCallback(
    (chain: InventoryItem, pt: ProductType) => {
      setInchAdjuster({ chain, productType: pt });
    },
    []
  );

  // ── Handle inch adjuster "Add to Cart" ──
  const handleInchAdd = useCallback(
    (inches: number, price: number) => {
      if (!inchAdjuster) return;
      const { chain, productType: pt } = inchAdjuster;
      onAddToCart({
        inventory_item_id: chain.id,
        name: `${chain.name} — ${pt.name} (${inches}in)`,
        quantity: 1,
        unit_price: price,
        discount_type: null,
        discount_value: 0,
        product_type_id: pt.id,
        product_type_name: pt.name,
        inches_used: inches,
        pricing_mode: 'per_inch',
        _jump_rings_required: pt.jump_rings_required ?? 1,
      });
      resetSelection();
    },
    [inchAdjuster, onAddToCart, resetSelection]
  );

  // ── Handle variant selection ──
  const handleVariantSelect = useCallback(
    (item: InventoryItem, variant: InventoryItemVariant) => {
      onAddToCart({
        inventory_item_id: item.id,
        inventory_variant_id: variant.id,
        name: `${item.name} — ${variant.name}`,
        _variant_name: variant.name,
        quantity: 1,
        unit_price: Number(variant.sell_price),
        discount_type: null,
        discount_value: 0,
        product_type_id: null,
        product_type_name: null,
        inches_used: null,
        pricing_mode: null,
      });
    },
    [onAddToCart]
  );

  // ── Handle add-on item ──
  const handleAddOnItem = useCallback(
    (item: InventoryItem) => {
      // Variant item → open picker (or auto-select if only 1 in-stock variant)
      if (item.has_variants && itemVariants) {
        const variants = (itemVariants[item.id] || []).filter((v) => v.is_active);
        const inStock = variants.filter((v) => v.quantity_on_hand > 0);
        if (inStock.length === 1) {
          handleVariantSelect(item, inStock[0]);
          return;
        }
        if (variants.length > 0) {
          setVariantPickerItem(item);
          return;
        }
      }
      // Non-variant item or no variants loaded
      onAddToCart({
        inventory_item_id: item.id,
        name: item.name,
        quantity: 1,
        unit_price: Number(item.sell_price),
        discount_type: null,
        discount_value: 0,
        product_type_id: null,
        product_type_name: null,
        inches_used: null,
        pricing_mode: null,
      });
    },
    [onAddToCart, itemVariants, handleVariantSelect]
  );

  // ── Handle custom item ──
  const handleAddCustom = useCallback(
    (name: string, price: number) => {
      onAddToCart({
        inventory_item_id: null,
        name,
        quantity: 1,
        unit_price: price,
        discount_type: null,
        discount_value: 0,
        product_type_id: null,
        product_type_name: null,
        inches_used: null,
        pricing_mode: null,
      });
    },
    [onAddToCart]
  );

  // ── Build tier price map for selected chain ──
  const selectedChainTierPriceMap = useMemo(() => {
    if (!selectedChain?.pricing_tier_id || tenantPricingMode !== 'tier') return undefined;
    const tier = fullPricingTiers.find((t) => t.id === selectedChain.pricing_tier_id);
    if (!tier) return undefined;

    const map: Record<string, number> = {};
    // Built-in product type prices from tier columns
    for (const pt of productTypes) {
      const col = BUILTIN_TIER_COLUMNS[pt.name.toLowerCase()];
      if (col && tier[col] != null) {
        map[pt.id] = Number(tier[col]);
      }
    }
    // Custom product type prices from pricing_tier_custom_prices
    for (const cp of customTierPrices) {
      if (cp.pricing_tier_id === tier.id) {
        map[cp.product_type_id] = Number(cp.price);
      }
    }
    return Object.keys(map).length > 0 ? map : undefined;
  }, [selectedChain, tenantPricingMode, fullPricingTiers, customTierPrices, productTypes]);

  // ── Toggle styling ──
  const toggleActive = 'bg-[var(--text-primary)] text-[var(--surface-base)]';
  const toggleInactive = 'bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]';

  return (
    <div>
      {/* ── Chains / Add-ons toggle ── */}
      <div className="flex gap-1 mb-4 bg-[var(--surface-subtle)] border border-[var(--border-strong)] rounded-xl p-1">
        <button
          onClick={() => { setView('chains'); resetSelection(); }}
          className={`flex-1 rounded-lg py-2.5 text-[13px] font-semibold transition-all min-h-[44px] ${
            view === 'chains' ? toggleActive : toggleInactive
          }`}
        >
          Chains
        </button>
        <button
          onClick={() => { setView('addons'); resetSelection(); }}
          className={`flex-1 rounded-lg py-2.5 text-[13px] font-semibold transition-all min-h-[44px] ${
            view === 'addons' ? toggleActive : toggleInactive
          }`}
        >
          Add-ons
        </button>
      </div>

      {/* ── Add-ons view ── */}
      {view === 'addons' && (
        <AddOnsSection
          inventory={inventory}
          onAddItem={handleAddOnItem}
          onAddCustom={handleAddCustom}
          itemVariants={itemVariants}
        />
      )}

      {/* ── Chains view ── */}
      {view === 'chains' && (
        <div>
          {/* Mode indicator */}
          {isQuickTap && (
            <div className="text-[11px] text-[var(--text-tertiary)] font-medium mb-3">
              Quick mode &middot; {activeChains.length} chain{activeChains.length !== 1 ? 's' : ''}
            </div>
          )}

          {/* Tier filter — show when pricing_mode is 'tier' and tiers exist */}
          {tenantPricingMode === 'tier' && pricingTiers.length > 0 && (
            <div className="mb-3">
              <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-tertiary)] mb-2">Tier</div>
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide -mx-1 px-1" style={{ WebkitOverflowScrolling: 'touch' }}>
                <button
                  onClick={() => { setSelectedTier(null); resetSelection(); }}
                  className={`shrink-0 rounded-xl px-4 py-2.5 text-[13px] font-semibold transition-all min-h-[44px] ${
                    selectedTier === null
                      ? 'bg-[var(--accent-primary)] text-white border-transparent shadow-sm'
                      : 'bg-[var(--surface-raised)] border border-[var(--border-strong)] text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)]'
                  }`}
                >
                  All Tiers
                </button>
                {pricingTiers.map((tier) => (
                  <button
                    key={tier.id}
                    onClick={() => { setSelectedTier(tier.id); resetSelection(); }}
                    className={`shrink-0 rounded-xl px-4 py-2.5 text-[13px] font-semibold transition-all min-h-[44px] ${
                      selectedTier === tier.id
                        ? 'bg-[var(--accent-primary)] text-white border-transparent shadow-sm'
                        : 'bg-[var(--surface-raised)] border border-[var(--border-strong)] text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)]'
                    }`}
                  >
                    {tier.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Material tabs — show in Progressive Filter mode, or in Quick-Tap if >1 material */}
          {(!isQuickTap || materials.length > 1) && (
            <div className="mb-4">
              <MaterialTabs
                materials={materials}
                selected={selectedMaterial}
                onSelect={(mat) => {
                  setSelectedMaterial(mat);
                  resetSelection();
                }}
                showAll={!isQuickTap}
              />
            </div>
          )}

          {/* Inch adjuster (replaces grid when active) */}
          {inchAdjuster ? (
            <InchAdjuster
              chain={inchAdjuster.chain}
              productType={inchAdjuster.productType}
              onAdd={handleInchAdd}
              onCancel={resetSelection}
            />
          ) : (
            <>
              {/* Chain grid */}
              <ChainGrid
                chains={filteredChains}
                chainPrices={chainPrices}
                onSelect={handleChainSelect}
                selectedChainId={selectedChain?.id}
              />

              {/* Product type row — appears after chain tap */}
              {selectedChain && (
                <div ref={productTypeRef}>
                  <ProductTypeRow
                    chain={selectedChain}
                    productTypes={productTypes}
                    chainPrices={chainPrices}
                    tierPriceMap={selectedChainTierPriceMap}
                    onSelectFlatRate={handleFlatRateSelect}
                    onSelectPerInch={handlePerInchSelect}
                  />
                </div>
              )}
            </>
          )}
        </div>
      )}
      {/* ── Variant Picker Modal ── */}
      {variantPickerItem && itemVariants && (
        <VariantPicker
          isOpen={!!variantPickerItem}
          onClose={() => setVariantPickerItem(null)}
          item={variantPickerItem}
          variants={itemVariants[variantPickerItem.id] || []}
          onSelect={handleVariantSelect}
        />
      )}
    </div>
  );
}
