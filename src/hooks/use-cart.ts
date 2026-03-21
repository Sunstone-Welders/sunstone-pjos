// ============================================================================
// Cart Store — src/hooks/use-cart.ts
// ============================================================================
// Updated: CartItem now carries _jump_rings_required, _inventory_type, and
// _material for jump ring auto-deduction at checkout.
// ============================================================================

import { create } from 'zustand';
import type { CartItem, CartState, PaymentMethod, FeeHandling } from '@/types';

export interface CartStore extends CartState {
  // Actions
  addItem: (item: Omit<CartItem, 'id' | 'line_total' | 'warranty_amount'> & { warranty_amount?: number }) => void;
  removeItem: (id: string) => void;
  updateItemQuantity: (id: string, quantity: number) => void;
  updateItemDiscount: (id: string, type: 'flat' | 'percentage' | null, value: number) => void;
  setCartDiscount: (type: 'flat' | 'percentage' | null, value: number) => void;
  setItemWarranty: (id: string, amount: number) => void;
  removeItemWarranty: (id: string) => void;
  setCartWarranty: (amount: number) => void;
  removeCartWarranty: () => void;
  setWarrantyTaxable: (taxable: boolean) => void;
  setTip: (amount: number) => void;
  setTaxRate: (rate: number) => void;
  setPaymentMethod: (method: PaymentMethod) => void;
  setClientId: (id: string | null) => void;
  setNotes: (notes: string) => void;
  setPlatformFeeRate: (rate: number) => void;
  setFeeHandling: (handling: FeeHandling) => void;
  reset: () => void;
  // Internal
  _platformFeeRate: number;
  _feeHandling: FeeHandling;
  _cartDiscountType: 'flat' | 'percentage' | null;
  _cartDiscountValue: number;
  _cartWarrantyAmount: number;
  _warrantyTaxable: boolean;
  recalculate: () => void;
}

const initialState: CartState = {
  items: [],
  subtotal: 0,
  discount_amount: 0,
  warranty_amount: 0,
  tax_rate: 0,
  tax_amount: 0,
  tip_amount: 0,
  platform_fee_amount: 0,
  total: 0,
  payment_method: null,
  client_id: null,
  notes: '',
};

function calcLineTotal(item: Omit<CartItem, 'id' | 'line_total' | 'warranty_amount'> & { warranty_amount?: number }): number {
  const gross = item.quantity * item.unit_price;
  if (!item.discount_type || !item.discount_value) return gross;
  if (item.discount_type === 'flat') return Math.max(0, gross - item.discount_value);
  if (item.discount_type === 'percentage') return gross * (1 - item.discount_value / 100);
  return gross;
}

function generateId() {
  return Math.random().toString(36).substring(2, 10);
}

export const useCartStore = create<CartStore>((set, get) => ({
  ...initialState,
  _platformFeeRate: 0,
  _feeHandling: 'absorb',
  _cartDiscountType: null,
  _cartDiscountValue: 0,
  _cartWarrantyAmount: 0,
  _warrantyTaxable: true,

  addItem: (item) => {
    const lineTotal = calcLineTotal(item);
    const newItem: CartItem = {
      ...item,
      id: generateId(),
      line_total: lineTotal,
      warranty_amount: item.warranty_amount ?? 0,
      // Variant fields
      inventory_variant_id: item.inventory_variant_id ?? null,
      _variant_name: item._variant_name ?? null,
      // Ensure jump ring metadata defaults
      _jump_rings_required: item._jump_rings_required ?? null,
      _inventory_type: item._inventory_type ?? null,
      _material: item._material ?? null,
    };
    set((s) => ({ items: [...s.items, newItem] }));
    get().recalculate();
  },

  removeItem: (id) => {
    set((s) => ({ items: s.items.filter((i) => i.id !== id) }));
    get().recalculate();
  },

  updateItemQuantity: (id, quantity) => {
    set((s) => ({
      items: s.items.map((i) => {
        if (i.id !== id) return i;
        const updated = { ...i, quantity };
        return { ...updated, line_total: calcLineTotal(updated) };
      }),
    }));
    get().recalculate();
  },

  updateItemDiscount: (id, type, value) => {
    set((s) => ({
      items: s.items.map((i) => {
        if (i.id !== id) return i;
        const updated = { ...i, discount_type: type, discount_value: value };
        return { ...updated, line_total: calcLineTotal(updated) };
      }),
    }));
    get().recalculate();
  },

  setCartDiscount: (type, value) => {
    set({ _cartDiscountType: type, _cartDiscountValue: value } as any);
    get().recalculate();
  },

  setItemWarranty: (id, amount) => {
    set((s) => ({
      items: s.items.map((i) => (i.id === id ? { ...i, warranty_amount: amount } : i)),
    }));
    get().recalculate();
  },

  removeItemWarranty: (id) => {
    set((s) => ({
      items: s.items.map((i) => (i.id === id ? { ...i, warranty_amount: 0 } : i)),
    }));
    get().recalculate();
  },

  setCartWarranty: (amount) => {
    set({ _cartWarrantyAmount: amount } as any);
    get().recalculate();
  },

  removeCartWarranty: () => {
    set({ _cartWarrantyAmount: 0 } as any);
    get().recalculate();
  },

  setWarrantyTaxable: (taxable) => {
    set({ _warrantyTaxable: taxable } as any);
    get().recalculate();
  },

  setTip: (amount) => {
    set({ tip_amount: amount });
    get().recalculate();
  },

  setTaxRate: (rate) => {
    set({ tax_rate: rate });
    get().recalculate();
  },

  setPaymentMethod: (method) => set({ payment_method: method }),
  setClientId: (id) => set({ client_id: id }),
  setNotes: (notes) => set({ notes }),

  setPlatformFeeRate: (rate) => {
    set({ _platformFeeRate: rate } as any);
    get().recalculate();
  },

  setFeeHandling: (handling) => {
    set({ _feeHandling: handling } as any);
    get().recalculate();
  },

  recalculate: () => {
    const state = get();
    const itemSubtotal = state.items.reduce((sum, i) => sum + i.line_total, 0);

    // Cart-level discount
    let discount_amount = 0;
    if (state._cartDiscountType === 'flat' && state._cartDiscountValue > 0) {
      discount_amount = Math.min(state._cartDiscountValue, itemSubtotal);
    } else if (state._cartDiscountType === 'percentage' && state._cartDiscountValue > 0) {
      discount_amount = Math.round(itemSubtotal * (state._cartDiscountValue / 100) * 100) / 100;
    }

    // Also include per-item discounts that reduce line_total below gross
    // (already factored into line_total, so itemSubtotal is already net of item discounts)
    // Cart-level discount is additional on top of that
    const subtotal = Math.max(0, itemSubtotal - discount_amount);

    // Warranty totals: per-item + cart-level (per-invoice)
    const itemWarrantyTotal = state.items.reduce((sum, i) => sum + (i.warranty_amount || 0), 0);
    const totalWarranty = itemWarrantyTotal + (state._cartWarrantyAmount || 0);

    // Tax calculation — include warranty in taxable base if warranty_taxable
    let taxable = subtotal;
    if (state._warrantyTaxable && totalWarranty > 0) {
      taxable += totalWarranty;
    }
    const tax_amount = Math.round(taxable * state.tax_rate * 100) / 100;

    const preTotal = subtotal + totalWarranty + tax_amount + state.tip_amount;

    let platform_fee_amount = 0;
    if (state._platformFeeRate > 0) {
      platform_fee_amount = Math.round(preTotal * state._platformFeeRate * 100) / 100;
    }

    // Fee is always absorbed — deducted from artist's Stripe payout, never shown to customer
    const total = preTotal;

    set({ subtotal: itemSubtotal, discount_amount, warranty_amount: totalWarranty, tax_amount, platform_fee_amount, total });
  },

  reset: () => set({
    ...initialState,
    _cartDiscountType: null,
    _cartDiscountValue: 0,
    _cartWarrantyAmount: 0,
  } as any),
}));