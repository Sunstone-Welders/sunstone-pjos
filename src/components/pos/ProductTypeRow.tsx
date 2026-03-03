'use client';

import type { InventoryItem, ProductType, ChainProductPrice } from '@/types';

export interface ProductTypeRowProps {
  chain: InventoryItem;
  productTypes: ProductType[];
  chainPrices: ChainProductPrice[];
  onSelectFlatRate: (chain: InventoryItem, productType: ProductType, price: number, inches: number) => void;
  onSelectPerInch: (chain: InventoryItem, productType: ProductType) => void;
}

export function ProductTypeRow({
  chain,
  productTypes,
  chainPrices,
  onSelectFlatRate,
  onSelectPerInch,
}: ProductTypeRowProps) {
  // Per-inch chains: show ALL product types (price is per-inch regardless of type)
  // Per-product chains: only show types that have a price configured
  const isPerInch = chain.pricing_mode === 'per_inch';
  const availableTypes = isPerInch
    ? productTypes
    : productTypes.filter((pt) =>
        chainPrices.some((p) => p.inventory_item_id === chain.id && p.product_type_id === pt.id)
      );

  if (availableTypes.length === 0) {
    return (
      <div className="py-3 text-center text-sm text-[var(--text-tertiary)]">
        No product types configured for this chain.
      </div>
    );
  }

  return (
    <div className="py-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-tertiary)] mb-2 pl-0.5">
        Select Product Type
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide -mx-1 px-1" style={{ WebkitOverflowScrolling: 'touch' }}>
        {availableTypes.map((pt) => {
          const priceRow = chainPrices.find(
            (p) => p.inventory_item_id === chain.id && p.product_type_id === pt.id
          );
          const isPerInch = chain.pricing_mode === 'per_inch';
          const price = isPerInch
            ? Number(chain.sell_price)
            : priceRow
              ? Number(priceRow.sell_price)
              : Number(chain.sell_price);
          const inches = priceRow?.default_inches
            ? Number(priceRow.default_inches)
            : Number(pt.default_inches);

          return (
            <button
              key={pt.id}
              onClick={() => {
                if (isPerInch) {
                  onSelectPerInch(chain, pt);
                } else {
                  onSelectFlatRate(chain, pt, price, inches);
                }
              }}
              className="shrink-0 rounded-xl px-4 py-3 bg-[var(--surface-raised)] border border-[var(--border-strong)] shadow-[var(--shadow-card)] hover:bg-[var(--surface-subtle)] hover:shadow-[0_2px_8px_-2px_rgba(0,0,0,0.12)] transition-all active:scale-[0.97] min-h-[44px] text-left"
            >
              <div className="text-[13px] font-semibold text-[var(--text-primary)] whitespace-nowrap">
                {pt.name}
              </div>
              <div className="text-[15px] font-bold text-[var(--text-primary)] mt-0.5 tracking-tight whitespace-nowrap">
                {isPerInch ? `$${price.toFixed(2)}/in` : `$${price.toFixed(2)}`}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
