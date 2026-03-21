'use client';

import type { InventoryItem, InventoryItemVariant } from '@/types';
import { Modal, ModalHeader, ModalBody } from '@/components/ui/Modal';

export interface VariantPickerProps {
  isOpen: boolean;
  onClose: () => void;
  item: InventoryItem;
  variants: InventoryItemVariant[];
  onSelect: (item: InventoryItem, variant: InventoryItemVariant) => void;
}

export function VariantPicker({ isOpen, onClose, item, variants, onSelect }: VariantPickerProps) {
  const activeVariants = variants.filter((v) => v.is_active);
  const allOutOfStock = activeVariants.every((v) => v.quantity_on_hand <= 0);

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="sm">
      <ModalHeader>
        <h2 className="text-lg font-bold text-[var(--text-primary)]">{item.name}</h2>
        <p className="text-sm text-[var(--text-tertiary)] mt-0.5">Select a variant</p>
      </ModalHeader>
      <ModalBody>
        {allOutOfStock ? (
          <div className="text-center py-8">
            <p className="text-[var(--text-tertiary)] text-sm">All variants out of stock</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {activeVariants.map((variant) => {
              const outOfStock = variant.quantity_on_hand <= 0;
              const lowStock = !outOfStock && variant.quantity_on_hand <= variant.reorder_threshold;

              return (
                <button
                  key={variant.id}
                  disabled={outOfStock}
                  onClick={() => {
                    onSelect(item, variant);
                    onClose();
                  }}
                  className={`w-full flex items-center justify-between rounded-xl px-4 min-h-[48px] py-3 border transition-all ${
                    outOfStock
                      ? 'opacity-40 cursor-not-allowed bg-[var(--surface-subtle)] border-[var(--border-default)]'
                      : 'bg-[var(--surface-raised)] border-[var(--border-strong)] hover:shadow-[0_4px_12px_-2px_rgba(0,0,0,0.1)] hover:-translate-y-px active:scale-[0.98]'
                  }`}
                >
                  <div className="text-left">
                    <div className="text-[15px] font-semibold text-[var(--text-primary)]">{variant.name}</div>
                    <div className={`text-[12px] mt-0.5 ${
                      outOfStock
                        ? 'text-[var(--text-tertiary)]'
                        : lowStock
                          ? 'text-amber-600 font-medium'
                          : 'text-[var(--text-tertiary)]'
                    }`}>
                      {outOfStock ? 'Out of stock' : `${variant.quantity_on_hand} left`}
                    </div>
                  </div>
                  <div className="text-[20px] font-bold text-[var(--text-primary)] tracking-tight">
                    ${Number(variant.sell_price).toFixed(2)}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </ModalBody>
    </Modal>
  );
}
