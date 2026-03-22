// ============================================================================
// Sunstone Reorder Cart Store — src/stores/cart-store.ts
// ============================================================================
// Zustand store for the multi-item reorder cart. In-memory only (no
// localStorage persistence). Items accumulate from the Shop Sunstone
// catalog, inventory "Reorder" action, or future Sunny conversational
// ordering. One checkout creates one SF Opportunity + Quote with
// multiple QuoteLineItems.
// ============================================================================

import { create } from 'zustand';

export interface CartItem {
  id: string;                       // unique cart line ID
  sunstoneProductId: string;        // Shopify product ID
  sunstoneVariantId: string;        // Shopify variant ID
  productTitle: string;             // e.g., "Bryce Chain"
  variantTitle: string;             // e.g., "Sterling Silver / 5 Feet"
  sku: string | null;               // Shopify SKU
  unitPrice: number;                // variant price
  quantity: number;                 // how many to order
  productType: string;              // "Chain", "Connector", etc.
  imageUrl: string | null;          // product image
  inventoryItemId: string | null;   // linked inventory_item.id (null if from catalog)
  inventoryVariantId: string | null; // linked inventory_item_variant.id (null if no variant)
}

interface CartStore {
  items: CartItem[];
  isOpen: boolean;
  checkoutOpen: boolean;

  addItem: (item: Omit<CartItem, 'id'>) => void;
  removeItem: (id: string) => void;
  updateQuantity: (id: string, quantity: number) => void;
  clearCart: () => void;
  openCart: () => void;
  closeCart: () => void;
  toggleCart: () => void;
  openCheckout: () => void;
  closeCheckout: () => void;

  // Computed helpers (not reactive — call inside components)
  itemCount: () => number;
  subtotal: () => number;
}

export const useCartStore = create<CartStore>((set, get) => ({
  items: [],
  isOpen: false,
  checkoutOpen: false,

  addItem: (newItem) => {
    set((state) => {
      // If same variant is already in cart, increment quantity
      const existing = state.items.find(
        (i) => i.sunstoneVariantId === newItem.sunstoneVariantId
      );
      if (existing) {
        return {
          items: state.items.map((i) =>
            i.id === existing.id
              ? { ...i, quantity: i.quantity + newItem.quantity }
              : i
          ),
        };
      }
      // New item
      const id = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      return { items: [...state.items, { ...newItem, id }] };
    });
  },

  removeItem: (id) => {
    set((state) => ({
      items: state.items.filter((i) => i.id !== id),
    }));
  },

  updateQuantity: (id, quantity) => {
    if (quantity < 1) return;
    set((state) => ({
      items: state.items.map((i) =>
        i.id === id ? { ...i, quantity } : i
      ),
    }));
  },

  clearCart: () => set({ items: [] }),

  openCart: () => set({ isOpen: true }),
  closeCart: () => set({ isOpen: false }),
  toggleCart: () => set((s) => ({ isOpen: !s.isOpen })),
  openCheckout: () => set({ isOpen: false, checkoutOpen: true }),
  closeCheckout: () => set({ checkoutOpen: false }),

  itemCount: () => get().items.reduce((sum, i) => sum + i.quantity, 0),
  subtotal: () =>
    Math.round(
      get().items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0) * 100
    ) / 100,
}));
