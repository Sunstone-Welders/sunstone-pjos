'use client';

import type { InventoryItem, ChainProductPrice } from '@/types';

export interface ChainGridProps {
  chains: InventoryItem[];
  chainPrices: ChainProductPrice[];
  onSelect: (chain: InventoryItem) => void;
  selectedChainId?: string | null;
}

const MATERIAL_COLORS: Record<string, string> = {
  gold: '#D4A017',
  'gold fill': '#D4A017',
  'gold filled': '#D4A017',
  '14k gold fill': '#D4A017',
  '14k gold filled': '#D4A017',
  silver: '#A0A0A0',
  sterling: '#A0A0A0',
  'sterling silver': '#A0A0A0',
  'rose gold': '#E8A0BF',
  'rose gold fill': '#E8A0BF',
  'rose gold filled': '#E8A0BF',
  platinum: '#C0C0C8',
  stainless: '#8898A8',
  'stainless steel': '#8898A8',
};

function getMaterialColor(material: string | null): string {
  if (!material) return 'var(--text-tertiary)';
  const key = material.toLowerCase().trim();
  return MATERIAL_COLORS[key] || 'var(--text-tertiary)';
}

function getDisplayPrice(chain: InventoryItem, chainPrices: ChainProductPrice[]): string {
  if (chain.pricing_mode === 'per_inch') {
    return `$${Number(chain.sell_price).toFixed(2)}/in`;
  }
  // Show the first product type price available
  const firstPrice = chainPrices.find((p) => p.inventory_item_id === chain.id);
  if (firstPrice) return `$${Number(firstPrice.sell_price).toFixed(2)}`;
  return `$${Number(chain.sell_price).toFixed(2)}`;
}

const cardBase = 'bg-[var(--surface-raised)] border border-[var(--border-strong)] text-left cursor-pointer transition-all duration-200 hover:shadow-[0_8px_20px_-4px_rgba(0,0,0,0.15)] hover:-translate-y-px active:scale-[0.97]';
const cardSecondary = `${cardBase} rounded-xl p-5 min-h-[100px] shadow-[var(--shadow-card)]`;

export function ChainGrid({ chains, chainPrices, onSelect, selectedChainId }: ChainGridProps) {
  if (chains.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-[var(--text-tertiary)] text-sm">No chains available.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {chains.map((chain) => {
        const isSelected = selectedChainId === chain.id;
        return (
          <button
            key={chain.id}
            onClick={() => onSelect(chain)}
            className={`${cardSecondary} flex flex-col justify-between ${
              isSelected
                ? 'border-[var(--accent-primary)] ring-2 ring-[var(--accent-primary)] ring-opacity-30'
                : ''
            }`}
          >
            <div>
              <div className="flex items-center gap-2">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: getMaterialColor(chain.material) }}
                />
                <div className="text-[15px] font-semibold text-[var(--text-primary)] leading-tight truncate">
                  {chain.name}
                </div>
              </div>
              <div className="text-[12px] text-[var(--text-tertiary)] mt-1.5 pl-[18px]">
                {chain.quantity_on_hand.toFixed(0)} {chain.unit} in stock
              </div>
              {chain.pricing_mode === 'per_inch' && (
                <span className="inline-block ml-[18px] mt-1 px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-[var(--accent-subtle)] text-[var(--accent-primary)]">
                  per inch
                </span>
              )}
            </div>
            <div className="text-[20px] font-bold text-[var(--text-primary)] mt-3 tracking-tight">
              {getDisplayPrice(chain, chainPrices)}
            </div>
          </button>
        );
      })}
    </div>
  );
}
