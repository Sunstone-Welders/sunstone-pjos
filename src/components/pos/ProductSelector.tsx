'use client';

import { useState, useMemo, useCallback, useRef } from 'react';
import type { InventoryItem, ProductType, ChainProductPrice, CartItem } from '@/types';
import { MaterialTabs } from './MaterialTabs';
import { ChainGrid } from './ChainGrid';
import { ProductTypeRow } from './ProductTypeRow';
import { InchAdjuster } from './InchAdjuster';
import { AddOnsSection } from './AddOnsSection';

export interface ProductSelectorProps {
  chains: InventoryItem[];
  inventory: InventoryItem[];
  productTypes: ProductType[];
  chainPrices: ChainProductPrice[];
  onAddToCart: (item: Omit<CartItem, 'id' | 'line_total'>) => void;
  mode: 'store' | 'event';
}

export function ProductSelector({
  chains,
  inventory,
  productTypes,
  chainPrices,
  onAddToCart,
  mode,
}: ProductSelectorProps) {
  // ── View toggle: chains vs add-ons ──
  const [view, setView] = useState<'chains' | 'addons'>('chains');

  // ── Chain selection state ──
  const [selectedMaterial, setSelectedMaterial] = useState<string | null>(null);
  const [selectedChain, setSelectedChain] = useState<InventoryItem | null>(null);
  const productTypeRef = useRef<HTMLDivElement>(null);
  const [inchAdjuster, setInchAdjuster] = useState<{
    chain: InventoryItem;
    productType: ProductType;
  } | null>(null);

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

  // ── Filtered chains based on selected material ──
  const filteredChains = useMemo(() => {
    if (selectedMaterial === null) return activeChains;
    return activeChains.filter(
      (c) => (c.material || 'Unspecified') === selectedMaterial
    );
  }, [activeChains, selectedMaterial]);

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

  // ── Handle add-on item ──
  const handleAddOnItem = useCallback(
    (item: InventoryItem) => {
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
    [onAddToCart]
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
                    onSelectFlatRate={handleFlatRateSelect}
                    onSelectPerInch={handlePerInchSelect}
                  />
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
