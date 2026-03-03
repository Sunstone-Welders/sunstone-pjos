'use client';

import { useState } from 'react';
import type { InventoryItem, ProductType } from '@/types';

export interface InchAdjusterProps {
  chain: InventoryItem;
  productType: ProductType;
  onAdd: (inches: number, price: number) => void;
  onCancel: () => void;
}

const PRESETS = [-0.5, -0.25, +0.25, +0.5];

export function InchAdjuster({ chain, productType, onAdd, onCancel }: InchAdjusterProps) {
  const [inches, setInches] = useState(String(productType.default_inches || ''));

  const numInches = Number(inches) || 0;
  const pricePerInch = Number(chain.sell_price);
  const calculatedPrice = Math.round(numInches * pricePerInch * 100) / 100;

  const adjustBy = (delta: number) => {
    const next = Math.max(0.25, numInches + delta);
    setInches(String(next));
  };

  const handleAdd = () => {
    if (numInches <= 0) return;
    onAdd(numInches, calculatedPrice);
  };

  return (
    <div className="py-4">
      <div className="max-w-sm mx-auto space-y-6">
        {/* Header */}
        <div className="text-center">
          <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-tertiary)] mb-1">
            {chain.name} / {productType.name}
          </div>
          <div className="text-sm text-[var(--text-tertiary)]">
            ${pricePerInch.toFixed(2)}/in
          </div>
        </div>

        {/* Quick presets */}
        <div className="flex justify-center gap-2">
          {PRESETS.map((delta) => (
            <button
              key={delta}
              onClick={() => adjustBy(delta)}
              className="w-14 h-10 rounded-lg bg-[var(--surface-raised)] border border-[var(--border-strong)] text-[13px] font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)] transition-all active:scale-[0.95] min-h-[44px]"
            >
              {delta > 0 ? '+' : ''}{delta}
            </button>
          ))}
        </div>

        {/* Large inch input */}
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-tertiary)] mb-2.5 text-center">
            Measured Inches
          </label>
          <input
            type="number"
            step="0.25"
            min="0.25"
            value={inches}
            onChange={(e) => setInches(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
            className="w-full h-20 px-4 rounded-2xl border border-[var(--border-strong)] bg-[var(--surface-raised)] text-[var(--text-primary)] text-center text-[40px] font-semibold focus:outline-none focus:border-[var(--accent-primary)] focus:ring-[3px] focus:ring-[rgba(0,0,0,0.08)] transition-all tracking-tight"
            autoFocus
          />
        </div>

        {/* Calculated price */}
        {numInches > 0 && (
          <div className="text-center">
            <div className="text-[11px] uppercase tracking-[0.06em] text-[var(--text-tertiary)] font-semibold mb-2">
              Calculated Price
            </div>
            <div className="text-[15px] text-[var(--text-secondary)] font-medium mb-1">
              {numInches} &times; ${pricePerInch.toFixed(2)}/in = ${calculatedPrice.toFixed(2)}
            </div>
            <div className="text-[48px] font-bold text-[var(--text-primary)] tracking-tighter leading-none">
              ${calculatedPrice.toFixed(2)}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 h-14 rounded-xl font-semibold text-base border border-[var(--border-strong)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)] transition-all active:scale-[0.97]"
          >
            Cancel
          </button>
          <button
            onClick={handleAdd}
            disabled={numInches <= 0}
            className="flex-1 h-14 rounded-xl font-semibold text-base transition-all active:scale-[0.97] shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ backgroundColor: 'var(--accent-primary)', color: 'white' }}
          >
            Add to Cart
          </button>
        </div>
      </div>
    </div>
  );
}
