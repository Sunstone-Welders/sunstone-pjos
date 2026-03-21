'use client';

import { useState, useMemo } from 'react';
import type { InventoryItem, InventoryItemVariant, InventoryType } from '@/types';

export interface AddOnsSectionProps {
  inventory: InventoryItem[];
  onAddItem: (item: InventoryItem) => void;
  onAddCustom: (name: string, price: number) => void;
  itemVariants?: Record<string, InventoryItemVariant[]>;
}

const TYPE_LABELS: Record<string, string> = {
  connector: 'Connectors',
  charm: 'Charms',
  clasp: 'Clasps',
  jump_ring: 'Jump Rings',
  other: 'Other',
};

const TYPE_ORDER: InventoryType[] = ['connector', 'charm', 'clasp', 'jump_ring', 'other'];

const cardBase = 'bg-[var(--surface-raised)] border border-[var(--border-strong)] text-left cursor-pointer transition-all duration-200 hover:shadow-[0_8px_20px_-4px_rgba(0,0,0,0.15)] hover:-translate-y-px active:scale-[0.97]';
const cardSecondary = `${cardBase} rounded-xl p-5 min-h-[100px] shadow-[var(--shadow-card)]`;

export function AddOnsSection({ inventory, onAddItem, onAddCustom, itemVariants }: AddOnsSectionProps) {
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customPrice, setCustomPrice] = useState('');

  // Non-chain items only, in stock (or has in-stock variants)
  const nonChainItems = useMemo(
    () => inventory.filter((i) => i.type !== 'chain' && (
      i.quantity_on_hand > 0 ||
      (i.has_variants && itemVariants?.[i.id]?.some((v) => v.is_active && v.quantity_on_hand > 0))
    )),
    [inventory, itemVariants]
  );

  // Available types
  const availableTypes = useMemo(() => {
    const types = new Set(nonChainItems.map((i) => i.type));
    return TYPE_ORDER.filter((t) => types.has(t));
  }, [nonChainItems]);

  // Filtered items
  const filteredItems = useMemo(
    () => typeFilter ? nonChainItems.filter((i) => i.type === typeFilter) : nonChainItems,
    [nonChainItems, typeFilter]
  );

  const handleAddCustom = () => {
    if (!customName || !customPrice) return;
    onAddCustom(customName, Number(customPrice));
    setCustomName('');
    setCustomPrice('');
    setShowCustomForm(false);
  };

  const activeTab = 'bg-[var(--accent-primary)] text-white border-transparent shadow-sm';
  const inactiveTab = 'bg-[var(--surface-raised)] border border-[var(--border-strong)] text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)]';

  return (
    <div>
      {/* Type filter tabs */}
      <div className="flex gap-2 overflow-x-auto pb-3 scrollbar-hide -mx-1 px-1" style={{ WebkitOverflowScrolling: 'touch' }}>
        <button
          onClick={() => { setTypeFilter(null); setShowCustomForm(false); }}
          className={`shrink-0 rounded-xl px-4 py-2.5 text-[13px] font-semibold transition-all min-h-[44px] ${
            typeFilter === null && !showCustomForm ? activeTab : inactiveTab
          }`}
        >
          All
        </button>
        {availableTypes.map((type) => (
          <button
            key={type}
            onClick={() => { setTypeFilter(type); setShowCustomForm(false); }}
            className={`shrink-0 rounded-xl px-4 py-2.5 text-[13px] font-semibold transition-all min-h-[44px] ${
              typeFilter === type ? activeTab : inactiveTab
            }`}
          >
            {TYPE_LABELS[type] || type}
          </button>
        ))}
        <button
          onClick={() => { setShowCustomForm(true); setTypeFilter(null); }}
          className={`shrink-0 rounded-xl px-4 py-2.5 text-[13px] font-semibold transition-all min-h-[44px] ${
            showCustomForm ? activeTab : inactiveTab
          }`}
        >
          Custom
        </button>
      </div>

      {/* Custom item form */}
      {showCustomForm ? (
        <div className="max-w-sm mx-auto space-y-5 pt-4">
          <h3 className="text-[18px] font-bold text-[var(--text-primary)] text-center">Custom Item</h3>
          <input
            className="w-full h-14 px-4 rounded-xl border border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--border-strong)] focus:ring-[3px] focus:ring-[rgba(0,0,0,0.04)] text-lg transition-all"
            placeholder="Item name"
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            autoFocus
          />
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg text-[var(--text-tertiary)]">$</span>
            <input
              className="w-full h-14 pl-9 pr-4 rounded-xl border border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] text-lg focus:outline-none focus:border-[var(--border-strong)] focus:ring-[3px] focus:ring-[rgba(0,0,0,0.04)] transition-all"
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              value={customPrice}
              onChange={(e) => setCustomPrice(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddCustom(); }}
            />
          </div>
          <button
            onClick={handleAddCustom}
            disabled={!customName || !customPrice}
            className="w-full h-14 rounded-xl font-semibold text-base transition-all active:scale-[0.97] shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ backgroundColor: 'var(--accent-primary)', color: 'white' }}
          >
            Add to Cart
          </button>
        </div>
      ) : (
        <>
          {filteredItems.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-[var(--text-tertiary)] text-sm">No add-on items available.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {filteredItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => onAddItem(item)}
                  className={`${cardSecondary} flex flex-col justify-between`}
                >
                  <div>
                    <div className="text-[15px] font-semibold text-[var(--text-primary)]">{item.name}</div>
                    <div className="text-[12px] text-[var(--text-tertiary)] mt-1">
                      {item.material && `${item.material} · `}{item.quantity_on_hand} left
                    </div>
                    {item.has_variants && (
                      <div className="text-[11px] text-[var(--accent-primary)] font-medium mt-0.5">Multiple options</div>
                    )}
                  </div>
                  <div className="text-[20px] font-bold text-[var(--text-primary)] mt-3 tracking-tight">
                    ${Number(item.sell_price).toFixed(2)}
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
