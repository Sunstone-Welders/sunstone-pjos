// ============================================================================
// Inventory Page â€" src/app/dashboard/inventory/page.tsx
// ============================================================================
// REDESIGNED: Form UX overhaul for pricing clarity
// - Sectioned form (Basic Info â†’ Stock & Cost â†’ Pricing)
// - Two-path pricing mode for chains (prominent card toggle)
// - Per Product: product type prices are THE main thing
// - Per Inch: large price input + auto-preview table
// - Validation: prevents "saved without prices" confusion
// - First-time prompt: suggests setting up product types first
// - Supplier dropdown (from suppliers table)
// ============================================================================

'use client';

import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useTenant } from '@/hooks/use-tenant';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import ChainPricingConfig, { type PriceConfigRow } from '@/components/inventory/ChainPricingConfig';
import SupplierDropdown from '@/components/inventory/SupplierDropdown';
import MaterialDropdown from '@/components/inventory/MaterialDropdown';
import type { InventoryItem, InventoryItemVariant, InventoryType, InventoryUnit, PricingMode, Material, TenantPricingMode, ReorderHistory, Supplier } from '@/types';
import { Skeleton } from '@/components/ui';
import SunnyTutorial from '@/components/SunnyTutorial';
import ReorderModal from '@/components/inventory/ReorderModal';
import ShopSunstoneCatalog from '@/components/inventory/ShopSunstoneCatalog';
import CartDrawer from '@/components/inventory/CartDrawer';
import CartCheckout from '@/components/inventory/CartCheckout';
import { useCartStore } from '@/stores/cart-store';
import { isInventoryProduct } from '@/lib/catalog-filter';

// â"€â"€â"€ Constants â"€â"€â"€
const ITEM_TYPES: { value: InventoryType; label: string }[] = [
  { value: 'chain', label: 'Chain' },
  { value: 'jump_ring', label: 'Jump Ring' },
  { value: 'charm', label: 'Charm' },
  { value: 'connector', label: 'Connector' },
  { value: 'clasp', label: 'Clasp' },
  { value: 'other', label: 'Other' },
];

const UNITS: { value: InventoryUnit; label: string }[] = [
  { value: 'in', label: 'Inches' },
  { value: 'ft', label: 'Feet' },
  { value: 'each', label: 'Each' },
  { value: 'pack', label: 'Pack' },
];

// ============================================================================
// Main Page Component
// ============================================================================

export default function InventoryPage() {
  const { tenant, role } = useTenant();
  const router = useRouter();
  const supabase = createClient();

  // â"€â"€â"€ State â"€â"€â"€
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<InventoryType | 'all'>('all');
  const [showInactive, setShowInactive] = useState(false);

  // Modal state
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);

  // First-time product types prompt
  const [showProductTypesPrompt, setShowProductTypesPrompt] = useState(false);
  const [hasProductTypes, setHasProductTypes] = useState<boolean | null>(null);

  // Tab layout
  const [activeTab, setActiveTab] = useState<'inventory' | 'catalog' | 'history'>('inventory');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  // Variant expansion
  const [expandedItemIds, setExpandedItemIds] = useState<Set<string>>(new Set());
  const [itemVariants, setItemVariants] = useState<Record<string, InventoryItemVariant[]>>({});

  // Reorder
  const [reorderItem, setReorderItem] = useState<InventoryItem | null>(null);
  const [reorderHistory, setReorderHistory] = useState<ReorderHistory[]>([]);
  const [receivingId, setReceivingId] = useState<string | null>(null);
  const [autoLinking, setAutoLinking] = useState(false);
  // Pending reorder map: inventory_item_id → { quantity, status, trackingNumber, reorderId, shippingStatus }
  const [pendingReorders, setPendingReorders] = useState<Record<string, { quantity: number; status: string; trackingNumber: string | null; reorderId: string; shippingStatus: string | null; itemName: string }>>({});
  // Receive modal
  const [receiveModalReorder, setReceiveModalReorder] = useState<ReorderHistory | null>(null);
  const [receiveQtyOverrides, setReceiveQtyOverrides] = useState<Record<string, number>>({});

  // Live order status from SF (reorderId -> { label, status, trackingNumber, shippingCarrier })
  const [liveStatuses, setLiveStatuses] = useState<Record<string, { label: string; status: string; trackingNumber: string | null; shippingCarrier: string | null }>>({});

  // Scroll position preservation across modal open/close
  const savedScrollRef = useRef<number>(0);

  // Cart store
  const cartItems = useCartStore((s) => s.items);
  const cartCount = cartItems.reduce((sum, i) => sum + i.quantity, 0);
  const addToCart = useCartStore((s) => s.addItem);
  const openCart = useCartStore((s) => s.openCart);

  // â"€â"€â"€ Load Inventory â"€â"€â"€
  // Helper: find the scrollable main container (dashboard layout's <main>)
  const getScrollContainer = useCallback(() => {
    return document.querySelector('main.overflow-y-auto') as HTMLElement | null;
  }, []);

  const loadItems = useCallback(async (restoreScroll = false) => {
    if (!tenant) return;
    setLoading(true);

    let query = supabase
      .from('inventory_items')
      .select('*')
      .eq('tenant_id', tenant.id)
      .order('name');

    if (!showInactive) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query;
    if (error) {
      toast.error('Failed to load inventory');
      console.error(error);
    } else {
      setItems(data || []);

      // Fetch variants for items with has_variants
      const variantItemIds = (data || []).filter((i: any) => i.has_variants).map((i: any) => i.id);
      if (variantItemIds.length > 0) {
        const { data: vData } = await supabase
          .from('inventory_item_variants')
          .select('*')
          .in('inventory_item_id', variantItemIds)
          .order('sort_order')
          .order('name');
        if (vData) {
          const variantMap: Record<string, InventoryItemVariant[]> = {};
          for (const v of vData as InventoryItemVariant[]) {
            if (!variantMap[v.inventory_item_id]) variantMap[v.inventory_item_id] = [];
            variantMap[v.inventory_item_id].push(v);
          }
          setItemVariants(variantMap);
        }
      }
    }
    setLoading(false);

    // Restore scroll position after the DOM re-renders with new data
    if (restoreScroll && savedScrollRef.current > 0) {
      requestAnimationFrame(() => {
        const container = getScrollContainer();
        if (container) {
          container.scrollTop = savedScrollRef.current;
        }
        savedScrollRef.current = 0;
      });
    }
  }, [tenant, showInactive, supabase, getScrollContainer]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  // Check if product types exist (for first-time prompt)
  useEffect(() => {
    if (!tenant) return;
    const checkProductTypes = async () => {
      const { count } = await supabase
        .from('product_types')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenant.id)
        .eq('is_active', true);
      setHasProductTypes((count ?? 0) > 0);
    };
    checkProductTypes();
  }, [tenant, supabase]);

  // Load reorder history + build pending reorder map
  const loadReorderHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/reorders');
      if (res.ok) {
        const data = await res.json();
        const reorders: ReorderHistory[] = data.reorders || [];
        setReorderHistory(reorders);

        // Build pending reorders map (inventory_item_id → order info)
        const pending: typeof pendingReorders = {};
        for (const r of reorders) {
          if (['completed', 'cancelled', 'pending_payment'].includes(r.status)) continue;
          const orderItems = (r.items as any[]) || [];
          for (const item of orderItems) {
            if (!item.inventory_item_id) continue;
            // If multiple pending reorders for same item, show the most recent (first in list)
            if (!pending[item.inventory_item_id]) {
              pending[item.inventory_item_id] = {
                quantity: item.quantity,
                status: r.status,
                trackingNumber: r.tracking_number || null,
                reorderId: r.id,
                shippingStatus: r.shipping_status || null,
                itemName: item.name,
              };
            }
          }
        }
        setPendingReorders(pending);
      }
    } catch { /* non-critical */ }
  }, []);

  // Load pending reorders on mount (always, not just when panel is open)
  useEffect(() => {
    loadReorderHistory();
  }, [loadReorderHistory]);

  useEffect(() => {
    if (activeTab === 'history') loadReorderHistory();
  }, [activeTab, loadReorderHistory]);

  // Poll SF order status for active orders while history tab is active
  useEffect(() => {
    if (activeTab !== 'history') return;

    const fetchStatuses = async () => {
      const activeOrders = reorderHistory.filter(
        (r) => !['completed', 'cancelled', 'pending_payment'].includes(r.status)
      );
      if (activeOrders.length === 0) return;

      const results: typeof liveStatuses = {};
      await Promise.all(
        activeOrders.map(async (r) => {
          try {
            const res = await fetch(`/api/salesforce/order-status?reorderId=${r.id}`);
            if (res.ok) {
              const data = await res.json();
              results[r.id] = {
                label: data.label || 'Processing',
                status: data.status || 'processing',
                trackingNumber: data.trackingNumber || null,
                shippingCarrier: data.shippingCarrier || null,
              };
            }
          } catch { /* non-critical */ }
        })
      );
      setLiveStatuses((prev) => ({ ...prev, ...results }));

      // If any order was cancelled, refresh the full list so r.status is updated
      const hasCancelled = Object.values(results).some((s) => s.status === 'cancelled');
      if (hasCancelled) loadReorderHistory();
    };

    fetchStatuses();
    const interval = setInterval(fetchStatuses, 30_000);
    return () => clearInterval(interval);
  }, [activeTab, reorderHistory, loadReorderHistory]);

  const handleMarkReceived = async (reorderId: string, overrides?: Record<string, number>) => {
    setReceivingId(reorderId);
    try {
      const res = await fetch(`/api/reorders/${reorderId}/receive`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantityOverrides: overrides || {} }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message || 'Marked as received');
        setReceiveModalReorder(null);
        setReceiveQtyOverrides({});
        loadReorderHistory();
        loadItems();
      } else {
        toast.error(data.error || 'Failed to mark as received');
      }
    } catch {
      toast.error('Failed to mark as received');
    } finally {
      setReceivingId(null);
    }
  };

  const openReceiveModal = (reorder: ReorderHistory) => {
    const overrides: Record<string, number> = {};
    const orderItems = (reorder.items as any[]) || [];
    for (const item of orderItems) {
      if (item.inventory_item_id) {
        overrides[item.inventory_item_id] = item.quantity;
      }
    }
    setReceiveQtyOverrides(overrides);
    setReceiveModalReorder(reorder);
  };

  // â"€â"€â"€ Filter items â"€â"€â"€
  const handleAutoLink = async () => {
    setAutoLinking(true);
    try {
      const res = await fetch('/api/shopify/auto-link', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        if (data.linked > 0) {
          toast.success(`Linked ${data.linked} item${data.linked > 1 ? 's' : ''} to Sunstone catalog`);
          loadItems();
        } else if (data.skipped > 0) {
          toast.info('No confident matches found. Link items manually in the edit form.');
        } else {
          toast.info('All Sunstone items are already linked.');
        }
      } else {
        toast.error(data.error || 'Auto-link failed');
      }
    } catch {
      toast.error('Auto-link failed');
    } finally {
      setAutoLinking(false);
    }
  };

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchesSearch =
        !search ||
        item.name.toLowerCase().includes(search.toLowerCase()) ||
        item.material?.toLowerCase().includes(search.toLowerCase()) ||
        item.sku?.toLowerCase().includes(search.toLowerCase());
      const matchesType = filterType === 'all' || item.type === filterType;
      return matchesSearch && matchesType;
    });
  }, [items, search, filterType]);

  // Count items eligible for Sunstone linking but not yet linked
  const unlinkedCount = useMemo(() => {
    return items.filter(
      (i) => !i.sunstone_product_id && i.supplier?.toLowerCase().includes('sunstone')
    ).length;
  }, [items]);

  // Catalog map for showing linked product/variant info on rows
  const [catalogMap, setCatalogMap] = useState<Map<string, any>>(new Map());
  useEffect(() => {
    const loadCatalogMap = async () => {
      try {
        const { data } = await supabase
          .from('sunstone_catalog_cache')
          .select('products')
          .limit(1)
          .single();
        if (data?.products) {
          const map = new Map<string, any>();
          for (const p of data.products as any[]) {
            map.set(p.id, p);
          }
          setCatalogMap(map);
        }
      } catch { /* catalog may not exist */ }
    };
    loadCatalogMap();
  }, [supabase]);

  // Close overflow menu when clicking outside
  useEffect(() => {
    if (!openMenuId) return;
    const handler = () => setOpenMenuId(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [openMenuId]);

  // ─── Toggle variant row expansion ───
  const toggleExpand = (itemId: string) => {
    setExpandedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  // â"€â"€â"€ Handle Add Button â"€â"€â"€
  const handleAddClick = () => {
    // If no product types exist and they might want to add chain, prompt first
    if (hasProductTypes === false) {
      setShowProductTypesPrompt(true);
      return;
    }
    setEditingItem(null);
    setShowForm(true);
  };

  // Handle Delete / Toggle Active
  const handleToggleActive = async (item: InventoryItem) => {
    if (!tenant) return;
    const newActive = !item.is_active;
    const { error } = await supabase
      .from('inventory_items')
      .update({ is_active: newActive })
      .eq('id', item.id)
      .eq('tenant_id', tenant.id);

    if (error) {
      toast.error('Failed to update item');
    } else {
      toast.success(newActive ? 'Item activated' : 'Item deactivated');
      loadItems();
    }
  };

  const handleDelete = async (item: InventoryItem): Promise<boolean> => {
    if (!tenant) return false;

    // Check if item has been used in any sales
    const { count } = await supabase
      .from('sale_items')
      .select('*', { count: 'exact', head: true })
      .eq('inventory_item_id', item.id);

    if ((count ?? 0) > 0) {
      // Has sale history -- soft delete only
      if (!confirm(
        `"${item.name}" has been used in ${count} sale(s) and can\'t be permanently deleted.\n\nDeactivate it instead? It will be hidden from the POS but kept for reports.`
      )) return false;

      const { error } = await supabase
        .from('inventory_items')
        .update({ is_active: false })
        .eq('id', item.id)
        .eq('tenant_id', tenant.id);

      if (error) {
        toast.error('Failed to deactivate item');
        return false;
      } else {
        toast.success('Item deactivated (kept for sale history)');
        loadItems();
        return true;
      }
    } else {
      // No sale history -- allow hard delete
      if (!confirm(
        `Permanently delete "${item.name}"?\n\nThis cannot be undone.`
      )) return false;

      // Also delete related chain_product_prices
      await supabase
        .from('chain_product_prices')
        .delete()
        .eq('inventory_item_id', item.id);

      const { error } = await supabase
        .from('inventory_items')
        .delete()
        .eq('id', item.id)
        .eq('tenant_id', tenant.id);

      if (error) {
        toast.error('Failed to delete item');
        return false;
      } else {
        toast.success('Item permanently deleted');
        loadItems();
        return true;
      }
    }
 
    return false;
  };

  if (!tenant) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-[var(--text-tertiary)]">Loadingâ€¦</p>
      </div>
    );
  }

  // ─── Add inventory item to cart ───
  const handleAddToCart = (item: InventoryItem) => {
    if (!item.sunstone_product_id || !item.sunstone_variant_id) {
      // Fallback to ReorderModal for unlinked items
      setReorderItem(item);
      return;
    }
    const product = catalogMap.get(item.sunstone_product_id);
    if (!product) {
      setReorderItem(item);
      return;
    }
    const variant = (product.variants || []).find((v: any) => v.id === item.sunstone_variant_id);
    if (!variant) {
      setReorderItem(item);
      return;
    }
    addToCart({
      sunstoneProductId: product.id,
      sunstoneVariantId: variant.id,
      productTitle: product.title,
      variantTitle: variant.title || 'Default Title',
      sku: variant.sku || null,
      unitPrice: parseFloat(variant.price),
      quantity: 1,
      productType: product.productType || '',
      imageUrl: product.imageUrl || null,
      inventoryItemId: item.id || null,
    });
    toast.success(`${product.title} added to cart`);
    openCart();
  };

  // â"€â"€â"€ Price display helper â"€â"€â"€
  const formatPrice = (item: InventoryItem) => {
    const pricingMode = (item as any).pricing_mode as PricingMode | undefined;
    if (item.type === 'chain' && pricingMode === 'per_inch') {
      return `$${Number(item.sell_price).toFixed(2)}/in`;
    }
    if (item.type === 'chain' && pricingMode === 'per_product') {
      return 'Per product';
    }
    return `$${Number(item.sell_price).toFixed(2)}`;
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-0">
      {/* --- Header --- */}
      <div className="flex items-center justify-between mb-1">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Inventory</h1>
          <p className="text-sm text-[var(--text-tertiary)] mt-0.5">
            {items.length} item{items.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Cart icon with badge */}
          <button
            onClick={openCart}
            className="relative p-2.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-raised)] transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
            title="Cart"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
            </svg>
            {cartCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-[#7A234A] text-white text-[10px] font-bold flex items-center justify-center px-1">
                {cartCount > 99 ? '99+' : cartCount}
              </span>
            )}
          </button>
          <Button
            size="sm"
            onClick={handleAddClick}
            className="text-[#FAF7F0] font-semibold min-h-[44px]"
            style={{ backgroundColor: '#7A234A' }}
          >
            + Add Item
          </Button>
        </div>
      </div>

      {/* --- Tab Bar --- */}
      <div className="border-b border-[var(--border-default)] flex gap-0 -mx-4 sm:-mx-6 px-4 sm:px-6 mt-4 mb-6">
        {([
          { key: 'inventory' as const, label: 'My inventory' },
          { key: 'catalog' as const, label: 'Shop Sunstone' },
          { key: 'history' as const, label: 'Order history' },
        ]).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-3 text-sm font-medium transition-colors relative min-h-[44px] ${
              activeTab === tab.key
                ? 'text-[var(--accent-primary)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            {tab.label}
            {activeTab === tab.key && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--accent-primary)]" />
            )}
          </button>
        ))}
      </div>

      {/* ============ MY INVENTORY TAB ============ */}
      {activeTab === 'inventory' && (
      <div className="space-y-4">
        {/* Search, Filters, Settings gear */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, material, or SKU..."
              className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--surface-base)] px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent-primary)] focus:ring-2 focus:ring-[var(--accent-subtle)] min-h-[44px]"
            />
          </div>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as InventoryType | 'all')}
            className="rounded-lg border border-[var(--border-default)] bg-[var(--surface-base)] px-3 py-2.5 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)] min-h-[44px]"
          >
            <option value="all">All Types</option>
            {ITEM_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)] cursor-pointer whitespace-nowrap px-2">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="rounded"
            />
            Inactive
          </label>
          <button
            onClick={() => router.push('/dashboard/settings?section=pricing')}
            className="p-2.5 rounded-lg border border-[var(--border-default)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-raised)] transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center flex-shrink-0"
            title="Pricing Settings"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>

        {/* Smart banner: unlinked Sunstone items */}
        {unlinkedCount > 0 && (
          <div className="flex items-center justify-between rounded-lg bg-amber-50 border border-amber-200 px-4 py-2.5">
            <span className="text-sm text-amber-800">
              {unlinkedCount} item{unlinkedCount !== 1 ? 's' : ''} not linked to Sunstone products
            </span>
            <button
              onClick={handleAutoLink}
              disabled={autoLinking}
              className="text-sm font-medium text-[var(--accent-primary)] hover:underline disabled:opacity-50 min-h-[44px] px-2"
            >
              {autoLinking ? 'Linking...' : 'Link now'}
            </button>
          </div>
        )}

      {/* â"€â"€â"€ Inventory List â"€â"€â"€ */}
      {loading ? (
        <div className="rounded-xl border border-[var(--border-default)] overflow-hidden bg-[var(--surface-base)]">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3 border-b border-[var(--border-default)] last:border-b-0">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-20 ml-auto" />
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
      ) : filteredItems.length === 0 ? (
        <Card padding="lg">
          <div className="text-center py-8">
            <p className="text-[var(--text-tertiary)]">
              {search || filterType !== 'all'
                ? 'No items match your search'
                : 'No inventory items yet'}
            </p>
            {!search && filterType === 'all' && (
              <Button
                variant="primary"
                size="sm"
                className="mt-4"
                onClick={handleAddClick}
              >
                Add your first item
              </Button>
            )}
          </div>
        </Card>
      ) : (
        <div className="rounded-xl border border-[var(--border-default)] overflow-hidden bg-[var(--surface-base)]">
          {/* Table Header */}
          <div className="hidden sm:grid grid-cols-[1fr_100px_100px_100px_80px] gap-4 px-4 py-3 bg-[var(--surface-raised)] border-b border-[var(--border-subtle)] text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider">
            <div>Item</div>
            <div className="text-right">Cost</div>
            <div className="text-right">Price</div>
            <div className="text-right">Stock</div>
            <div></div>
          </div>

          {/* Table Rows */}
          <div className="divide-y divide-[var(--border-subtle)]">
            {filteredItems.map((item) => {
              const pending = pendingReorders[item.id];
              const isShippedOrDelivered = pending && (pending.shippingStatus === 'shipped' || pending.status === 'shipped');
              const pendingStatusLabel = !pending ? null
                : pending.shippingStatus === 'shipped' || pending.status === 'shipped' ? 'Shipped'
                : pending.shippingStatus === 'approved' ? 'Shipping Soon'
                : pending.shippingStatus === 'preparing' ? 'Preparing to Ship'
                : 'Processing';

              const isExpanded = expandedItemIds.has(item.id);
              const variants = item.has_variants ? (itemVariants[item.id] || []) : [];
              const hasLowVariant = variants.some((v) => v.is_active && v.quantity_on_hand <= v.reorder_threshold);

              return (
              <React.Fragment key={item.id}>
              <div
                className={`px-4 py-3 sm:grid sm:grid-cols-[1fr_100px_100px_100px_80px] sm:gap-4 sm:items-center cursor-pointer hover:bg-[var(--surface-raised)] transition-colors ${
                  !item.is_active ? 'opacity-50' : ''
                }`}
                onClick={() => {
                  const container = getScrollContainer();
                  if (container) savedScrollRef.current = container.scrollTop;
                  setEditingItem(item);
                  setShowForm(true);
                }}
              >
                {/* Item info */}
                <div className="mb-2 sm:mb-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Expand/collapse for variant items */}
                    {item.has_variants && variants.length > 0 && (
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleExpand(item.id); }}
                        className="p-0.5 rounded text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-transform"
                        title={isExpanded ? 'Collapse' : 'Expand variants'}
                      >
                        <svg className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                        </svg>
                      </button>
                    )}
                    <span className="text-sm font-medium text-[var(--text-primary)]">
                      {item.name}
                    </span>
                    <Badge
                      variant="secondary"
                      className="text-[10px] uppercase"
                    >
                      {item.type.replace('_', ' ')}
                    </Badge>
                    {!item.is_active && (
                      <Badge variant="secondary" className="text-[10px]">
                        Inactive
                      </Badge>
                    )}
                    {/* Pending reorder indicator */}
                    {pending && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveTab('history');
                        }}
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-blue-50 text-blue-700 text-[10px] font-medium hover:bg-blue-100 transition-colors"
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                        </svg>
                        {pending.quantity} ordered · {pendingStatusLabel}
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    {item.material && (
                      <span className="text-xs text-[var(--text-tertiary)]">
                        {item.material}
                      </span>
                    )}
                    {item.sku && (
                      <span className="text-xs text-[var(--text-tertiary)]">
                        · SKU: {item.sku}
                      </span>
                    )}
                    {/* Tracking link */}
                    {pending?.trackingNumber && (
                      <a
                        href={`https://www.google.com/search?q=${encodeURIComponent(pending.trackingNumber)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-xs text-[var(--accent-primary)] hover:underline"
                      >
                        Track: {pending.trackingNumber}
                      </a>
                    )}
                    {/* Linked product/variant display */}
                    {item.sunstone_product_id && catalogMap.size > 0 && (() => {
                      const cp = catalogMap.get(item.sunstone_product_id);
                      if (!cp) return null;
                      let variantLabel = '';
                      if (item.sunstone_variant_id) {
                        const v = (cp.variants || []).find((v: any) => v.id === item.sunstone_variant_id);
                        if (v && v.title !== 'Default Title') {
                          // For chain variants, show just the material (first part before " / ")
                          const parts = v.title.split(' / ');
                          variantLabel = parts[0];
                        }
                      }
                      return (
                        <span className="text-xs text-[var(--text-tertiary)]">
                          · Linked: {cp.title}{variantLabel ? ` — ${variantLabel}` : ''}
                        </span>
                      );
                    })()}
                  </div>
                </div>

                {/* Cost */}
                <div className="hidden sm:block text-right">
                  <span className="text-sm text-[var(--text-secondary)]">
                    ${Number(item.cost_per_unit).toFixed(2)}
                  </span>
                </div>

                {/* Price */}
                <div className="hidden sm:block text-right">
                  <span className="text-sm text-[var(--text-primary)]">
                    {formatPrice(item)}
                  </span>
                </div>

                {/* Stock */}
                <div className="hidden sm:block text-right">
                  <span
                    className={`text-sm ${
                      (item.has_variants ? hasLowVariant : item.quantity_on_hand <= item.reorder_threshold)
                        ? 'text-[var(--error-600)] font-semibold'
                        : 'text-[var(--text-primary)]'
                    }`}
                  >
                    {item.quantity_on_hand}
                    {item.has_variants && variants.length > 0 && (
                      <span className="text-[var(--text-tertiary)] text-xs ml-0.5">total</span>
                    )}
                    <span className="text-[var(--text-tertiary)] text-xs ml-0.5">
                      {item.unit === 'in' ? 'in' : item.unit === 'ft' ? 'ft' : ''}
                    </span>
                  </span>
                </div>

                {/* Overflow menu (desktop + mobile) */}
                <div className="hidden sm:flex items-center gap-1 justify-end">
                  {isShippedOrDelivered && (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={(e: React.MouseEvent) => {
                        e.stopPropagation();
                        const r = reorderHistory.find((rh) => rh.id === pending.reorderId);
                        if (r) openReceiveModal(r);
                      }}
                      disabled={receivingId === pending?.reorderId}
                      className="text-xs"
                    >
                      {receivingId === pending?.reorderId ? 'Restocking...' : 'Mark Received'}
                    </Button>
                  )}
                  <div className="relative">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenMenuId(openMenuId === item.id ? null : item.id);
                      }}
                      className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] p-1.5 rounded-lg hover:bg-[var(--surface-subtle)] transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center"
                    >
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                      </svg>
                    </button>
                    {openMenuId === item.id && (
                      <div className="absolute right-0 top-full mt-1 w-48 rounded-lg border border-[var(--border-default)] bg-[var(--surface-overlay)] shadow-lg z-20 py-1">
                        {item.sunstone_product_id && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setOpenMenuId(null); handleAddToCart(item); }}
                            className="w-full text-left px-3 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--surface-raised)] min-h-[40px]"
                          >
                            Add to Cart
                          </button>
                        )}
                        {!item.sunstone_product_id && item.supplier?.toLowerCase().includes('sunstone') && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setOpenMenuId(null); setEditingItem(item); setShowForm(true); }}
                            className="w-full text-left px-3 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--surface-raised)] min-h-[40px]"
                          >
                            Link to Sunstone product
                          </button>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); setOpenMenuId(null); const c = getScrollContainer(); if (c) savedScrollRef.current = c.scrollTop; setEditingItem(item); setShowForm(true); }}
                          className="w-full text-left px-3 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--surface-raised)] min-h-[40px]"
                        >
                          Edit
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setOpenMenuId(null); handleToggleActive(item); }}
                          className="w-full text-left px-3 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--surface-raised)] min-h-[40px]"
                        >
                          {item.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setOpenMenuId(null); handleDelete(item); }}
                          className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 min-h-[40px]"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Mobile: price, stock, overflow */}
                <div className="flex items-center justify-between sm:hidden mt-1 gap-2">
                  <span className="text-sm text-[var(--text-primary)]">
                    {formatPrice(item)}
                  </span>
                  <span
                    className={`text-sm ${
                      (item.has_variants ? hasLowVariant : item.quantity_on_hand <= item.reorder_threshold)
                        ? 'text-[var(--error-600)]'
                        : 'text-[var(--text-secondary)]'
                    }`}
                  >
                    {item.quantity_on_hand} {item.has_variants && variants.length > 0 ? 'total' : item.unit}
                  </span>
                  <div className="flex items-center gap-1 ml-auto">
                    {isShippedOrDelivered && (
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={(e: React.MouseEvent) => {
                          e.stopPropagation();
                          const r = reorderHistory.find((rh) => rh.id === pending.reorderId);
                          if (r) openReceiveModal(r);
                        }}
                        disabled={receivingId === pending?.reorderId}
                        className="text-xs min-h-[44px] px-3"
                      >
                        {receivingId === pending?.reorderId ? 'Restocking...' : 'Received'}
                      </Button>
                    )}
                    <div className="relative">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenMenuId(openMenuId === item.id ? null : item.id);
                        }}
                        className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] p-2.5 rounded-lg hover:bg-[var(--surface-subtle)] transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                      >
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                        </svg>
                      </button>
                      {openMenuId === item.id && (
                        <div className="absolute right-0 top-full mt-1 w-48 rounded-lg border border-[var(--border-default)] bg-[var(--surface-overlay)] shadow-lg z-20 py-1">
                          {item.sunstone_product_id && (
                            <button
                              onClick={(e) => { e.stopPropagation(); setOpenMenuId(null); handleAddToCart(item); }}
                              className="w-full text-left px-3 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--surface-raised)] min-h-[40px]"
                            >
                              Add to Cart
                            </button>
                          )}
                          <button
                            onClick={(e) => { e.stopPropagation(); setOpenMenuId(null); const c = getScrollContainer(); if (c) savedScrollRef.current = c.scrollTop; setEditingItem(item); setShowForm(true); }}
                            className="w-full text-left px-3 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--surface-raised)] min-h-[40px]"
                          >
                            Edit
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setOpenMenuId(null); handleToggleActive(item); }}
                            className="w-full text-left px-3 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--surface-raised)] min-h-[40px]"
                          >
                            {item.is_active ? 'Deactivate' : 'Activate'}
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setOpenMenuId(null); handleDelete(item); }}
                            className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 min-h-[40px]"
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Expanded variant child rows */}
              {isExpanded && variants.length > 0 && variants.map((v) => (
                <div
                  key={v.id}
                  className="px-4 py-2 sm:grid sm:grid-cols-[1fr_100px_100px_100px_80px] sm:gap-4 sm:items-center bg-[var(--surface-raised)]/50"
                >
                  <div className="mb-1 sm:mb-0 pl-7">
                    <span className="text-sm text-[var(--text-secondary)]">
                      {v.name}
                    </span>
                    {v.sku && (
                      <span className="text-xs text-[var(--text-tertiary)] ml-2">
                        SKU: {v.sku}
                      </span>
                    )}
                    {!v.is_active && (
                      <span className="text-[10px] text-[var(--text-tertiary)] ml-1">(inactive)</span>
                    )}
                  </div>
                  <div className="hidden sm:block text-right">
                    <span className="text-sm text-[var(--text-tertiary)]">
                      ${Number(v.cost_per_unit).toFixed(2)}
                    </span>
                  </div>
                  <div className="hidden sm:block text-right">
                    <span className="text-sm text-[var(--text-secondary)]">
                      ${Number(v.sell_price).toFixed(2)}
                    </span>
                  </div>
                  <div className="hidden sm:block text-right">
                    <span className={`text-sm ${
                      v.is_active && v.quantity_on_hand <= v.reorder_threshold
                        ? 'text-[var(--error-600)] font-semibold'
                        : 'text-[var(--text-secondary)]'
                    }`}>
                      {v.quantity_on_hand}
                    </span>
                  </div>
                  <div className="hidden sm:block text-right">
                    {v.is_active && v.quantity_on_hand <= v.reorder_threshold && (
                      <span className="text-[10px] text-[var(--error-600)] font-medium">Low</span>
                    )}
                  </div>
                </div>
              ))}
              </React.Fragment>
              );
            })}
          </div>
        </div>
      )}
      </div>
      )}

      {/* ============ SHOP SUNSTONE TAB ============ */}
      {activeTab === 'catalog' && (
        <ShopSunstoneCatalog />
      )}

      {/* ============ ORDER HISTORY TAB ============ */}
      {activeTab === 'history' && (
        <div>
          {reorderHistory.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-16 h-16 rounded-full bg-[var(--surface-raised)] flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-[var(--text-tertiary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                </svg>
              </div>
              <p className="text-lg font-semibold text-[var(--text-primary)]">No orders yet</p>
              <p className="text-sm text-[var(--text-tertiary)] mt-1">
                Use the reorder option on any Sunstone-linked item to place your first order.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[var(--border-subtle)] rounded-xl border border-[var(--border-default)] bg-[var(--surface-base)] overflow-hidden">
              {reorderHistory.map((r) => {
                const live = liveStatuses[r.id];
                const effectiveStatus = r.status === 'completed' ? 'completed'
                  : r.status === 'cancelled' ? 'cancelled'
                  : r.status === 'pending_payment' ? 'pending_payment'
                  : live?.status || r.shipping_status || r.status;
                const statusLabel = effectiveStatus === 'completed' ? 'Received'
                  : effectiveStatus === 'cancelled' ? 'Cancelled'
                  : effectiveStatus === 'shipped' ? 'Shipped'
                  : effectiveStatus === 'approved' ? 'Ready to Ship'
                  : effectiveStatus === 'preparing' ? 'Preparing to Ship'
                  : effectiveStatus === 'pending_payment' ? 'Awaiting Payment'
                  : 'Processing';
                const statusVariant = effectiveStatus === 'completed' ? 'success'
                  : effectiveStatus === 'cancelled' ? 'secondary'
                  : effectiveStatus === 'shipped' || effectiveStatus === 'approved' ? 'default'
                  : effectiveStatus === 'pending_payment' ? 'warning'
                  : 'warning';
                const trackingNum = live?.trackingNumber || r.tracking_number;
                const carrier = live?.shippingCarrier || r.shipping_carrier || '';
                const isShipped = effectiveStatus === 'shipped';
                const trackingUrl = trackingNum
                  ? carrier.toLowerCase().includes('ups')
                    ? `https://www.ups.com/track?tracknum=${encodeURIComponent(trackingNum)}`
                    : carrier.toLowerCase().includes('usps')
                      ? `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(trackingNum)}`
                      : carrier.toLowerCase().includes('fedex')
                        ? `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(trackingNum)}`
                        : `https://parcelsapp.com/en/tracking/${encodeURIComponent(trackingNum)}`
                  : null;
                return (
                  <div key={r.id} className="px-4 py-4 flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-[var(--text-primary)]">
                          {r.sf_quote_number ? `Quote #${r.sf_quote_number}` : r.shopify_order_name || (r.sf_opportunity_id ? 'SF Order' : 'Order')}
                        </span>
                        <Badge variant={statusVariant as any} className="text-[10px]">
                          {statusLabel}
                        </Badge>
                      </div>
                      <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
                        {new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        {' \u2014 '}
                        {(r.items as any[]).map((i: any) => `${i.name} x${i.quantity}`).join(', ')}
                      </p>
                      {trackingNum && trackingUrl && (
                        <p className="text-xs mt-0.5">
                          <a
                            href={trackingUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[var(--accent-primary)] hover:underline"
                          >
                            Tracking: {trackingNum}
                          </a>
                        </p>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-semibold text-[var(--text-primary)]">
                        ${Number(r.total_amount).toFixed(2)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {isShipped && r.status !== 'completed' && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => openReceiveModal(r)}
                          disabled={receivingId === r.id}
                          className="min-h-[44px]"
                        >
                          {receivingId === r.id ? 'Restocking...' : 'Mark Received'}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* --- Product Types Prompt Modal --- */}
      {showProductTypesPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            onClick={() => setShowProductTypesPrompt(false)}
          />
          <div className="relative bg-[var(--surface-overlay)] rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-[var(--accent-50)] flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-[var(--accent-primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-[var(--text-primary)]">
                Quick tip before you start
              </h3>
              <p className="text-sm text-[var(--text-secondary)] mt-2">
                If you&apos;re adding chain, you&apos;ll want to set up your product types first â€" like Bracelet, Anklet, and Necklace. This lets you set different prices for each.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  setShowProductTypesPrompt(false);
                  router.push('/dashboard/settings?section=pricing');
                }}
              >
                Set Up Product Types
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowProductTypesPrompt(false);
                  setEditingItem(null);
                  setShowForm(true);
                }}
              >
                Skip for now â€" I&apos;ll add non-chain items
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* â"€â"€â"€ Add/Edit Form Modal â"€â"€â"€ */}
      {showForm && (
        <InventoryItemForm
          tenant={tenant}
          editingItem={editingItem}
          onClose={() => {
            setShowForm(false);
            setEditingItem(null);
            // Restore scroll position on cancel/close (no refetch needed)
            requestAnimationFrame(() => {
              const container = getScrollContainer();
              if (container && savedScrollRef.current > 0) {
                container.scrollTop = savedScrollRef.current;
                savedScrollRef.current = 0;
              }
            });
          }}
          onSaved={() => {
            setShowForm(false);
            setEditingItem(null);
            loadItems(true);
          }}
          onDelete={async (item) => {
            const deleted = await handleDelete(item);
            if (deleted) {
              setShowForm(false);
              setEditingItem(null);
            }
          }}
        />
      )}

      {/* Reorder Modal (fallback for items without variant linking) */}
      {reorderItem && (
        <ReorderModal
          isOpen={!!reorderItem}
          onClose={() => setReorderItem(null)}
          item={reorderItem}
          onReorderCreated={() => {
            loadReorderHistory();
          }}
        />
      )}

      {/* Cart Drawer + Checkout */}
      <CartDrawer onSwitchToShop={() => setActiveTab('catalog')} />
      <CartCheckout />

      {/* Receive Confirmation Modal (quantity adjustment) */}
      {receiveModalReorder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            onClick={() => { setReceiveModalReorder(null); setReceiveQtyOverrides({}); }}
          />
          <div className="relative bg-[var(--surface-overlay)] rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-lg font-semibold text-[var(--text-primary)]">
              Confirm Received Quantities
            </h3>
            <p className="text-sm text-[var(--text-secondary)]">
              Adjust quantities if your shipment was short or had extras.
            </p>
            <div className="space-y-3">
              {((receiveModalReorder.items as any[]) || []).map((item: any, idx: number) => (
                <div key={idx} className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[var(--text-primary)] truncate">{item.name}</p>
                    <p className="text-xs text-[var(--text-tertiary)]">Ordered: {item.quantity}</p>
                  </div>
                  <div className="w-24">
                    <input
                      type="number"
                      min={0}
                      value={item.inventory_item_id ? (receiveQtyOverrides[item.inventory_item_id] ?? item.quantity) : item.quantity}
                      onChange={(e) => {
                        if (!item.inventory_item_id) return;
                        setReceiveQtyOverrides((prev) => ({
                          ...prev,
                          [item.inventory_item_id]: Math.max(0, parseInt(e.target.value) || 0),
                        }));
                      }}
                      disabled={!item.inventory_item_id}
                      className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--surface-base)] px-3 py-2 text-sm text-center text-[var(--text-primary)] min-h-[44px]"
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-3 pt-2">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => { setReceiveModalReorder(null); setReceiveQtyOverrides({}); }}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                className="flex-1"
                loading={receivingId === receiveModalReorder.id}
                onClick={() => handleMarkReceived(receiveModalReorder.id, receiveQtyOverrides)}
              >
                {receivingId === receiveModalReorder.id ? 'Restocking...' : 'Confirm & Restock'}
              </Button>
            </div>
          </div>
        </div>
      )}

      <SunnyTutorial
        pageKey="inventory"
        tips={[
          { title: 'Track every chain', body: 'Add each chain style with its length in inches. Sunstone auto-deducts when you make a sale.' },
          { title: 'Set sell prices', body: 'Pricing can be per-product (flat rate) or per-inch. Choose what works for your business.' },
          { title: 'Reorder alerts', body: 'Set a reorder threshold on each item. When stock drops below it, you\'ll see an alert on your dashboard.' },
        ]}
      />
    </div>
  );
}

// ============================================================================
// Inventory Item Form (Modal)
// ============================================================================

interface InventoryItemFormProps {
  tenant: { id: string; pricing_mode?: string };
  editingItem: InventoryItem | null;
  onClose: () => void;
  onSaved: () => void;
  onDelete?: (item: InventoryItem) => void | Promise<void>;
}

function InventoryItemForm({ tenant, editingItem, onClose, onSaved, onDelete }: InventoryItemFormProps) {
  const supabase = createClient();
  const isEditing = !!editingItem;

  // â"€â"€â"€ Form State â"€â"€â"€
  const [name, setName] = useState(editingItem?.name || '');
  const [type, setType] = useState<InventoryType>(editingItem?.type || 'chain');
  const [materialId, setMaterialId] = useState<string | null>(
    (editingItem as any)?.material_id || null
  );
  const [materialsList, setMaterialsList] = useState<Material[]>([]);
  const [supplierId, setSupplierId] = useState<string | null>(
    (editingItem as any)?.supplier_id || null
  );
  const [supplierText, setSupplierText] = useState(editingItem?.supplier || '');
  const [sku, setSku] = useState(editingItem?.sku || '');
  const [unit, setUnit] = useState<InventoryUnit>(editingItem?.unit || 'in');
  const [costPerUnit, setCostPerUnit] = useState(
    editingItem && Number(editingItem.cost_per_unit) > 0 ? String(Number(editingItem.cost_per_unit)) : ''
  );
  const [sellPrice, setSellPrice] = useState(
    editingItem ? Number(editingItem.sell_price) : 0
  );
  const [quantity, setQuantity] = useState(
    editingItem ? Number(editingItem.quantity_on_hand) : 0
  );
  const [reorderThreshold, setReorderThreshold] = useState(
    editingItem ? Number(editingItem.reorder_threshold) : 0
  );
  const [notes, setNotes] = useState(editingItem?.notes || '');

  // Cost entry unit toggle (UI-only, not persisted)
  const [costEntryUnit, setCostEntryUnit] = useState<'inch' | 'foot'>('inch');

  // Chain-specific state
  const [pricingMode, setPricingMode] = useState<PricingMode>(
    (editingItem as any)?.pricing_mode || 'per_product'
  );
  const [chainPriceRows, setChainPriceRows] = useState<PriceConfigRow[]>([]);
  const [pricingTierId, setPricingTierId] = useState<string | null>(
    (editingItem as any)?.pricing_tier_id || null
  );

  // Sunstone product linking
  const [sunstoneProductId, setSunstoneProductId] = useState<string | null>(
    editingItem?.sunstone_product_id || null
  );
  const [sunstoneVariantId, setSunstoneVariantId] = useState<string | null>(
    editingItem?.sunstone_variant_id || null
  );
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [isSunstoneSupplier, setIsSunstoneSupplier] = useState(false);
  const [catalogProducts, setCatalogProducts] = useState<any[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogDropdownOpen, setCatalogDropdownOpen] = useState(false);
  const catalogDropdownRef = useRef<HTMLDivElement>(null);

  // Variant system
  const [hasVariants, setHasVariants] = useState(editingItem?.has_variants || false);
  const [variants, setVariants] = useState<InventoryItemVariant[]>([]);
  const [variantsLoaded, setVariantsLoaded] = useState(false);
  const [deletedVariantIds, setDeletedVariantIds] = useState<string[]>([]);

  // Validation
  const [validationTriggered, setValidationTriggered] = useState(false);
  const [saving, setSaving] = useState(false);

  // Load variants for existing items with has_variants
  useEffect(() => {
    if (!editingItem?.has_variants || !editingItem?.id || variantsLoaded) return;
    const loadVariants = async () => {
      const { data } = await supabase
        .from('inventory_item_variants')
        .select('*')
        .eq('inventory_item_id', editingItem.id)
        .order('sort_order')
        .order('name');
      if (data) setVariants(data as InventoryItemVariant[]);
      setVariantsLoaded(true);
    };
    loadVariants();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingItem?.id, editingItem?.has_variants]);

  // Auto-sum variant quantities → parent quantity when has_variants
  useEffect(() => {
    if (hasVariants && variants.length > 0) {
      const total = variants.reduce((sum, v) => sum + Number(v.quantity_on_hand), 0);
      setQuantity(total);
    }
  }, [hasVariants, variants]);

  // Load materials for name resolution on save
  useEffect(() => {
    const loadMaterials = async () => {
      try {
        const { data } = await supabase
          .from('materials')
          .select('*')
          .eq('tenant_id', tenant.id)
          .eq('is_active', true)
          .order('sort_order')
          .order('name');
        if (data) setMaterialsList(data as Material[]);
      } catch {
        // materials table may not exist yet
      }
    };
    loadMaterials();
  }, [tenant.id, supabase]);

  // Auto-set unit to inches when type is chain
  const handleTypeChange = (newType: InventoryType) => {
    setType(newType);
    if (newType === 'chain') {
      setUnit('in');
    } else if (unit === 'in') {
      setUnit('each');
    }
  };

  // Detect if initial supplier is Sunstone (for editing existing items)
  useEffect(() => {
    if (!supplierId) {
      setIsSunstoneSupplier(false);
      return;
    }
    const check = async () => {
      const { data } = await supabase
        .from('suppliers')
        .select('is_sunstone')
        .eq('id', supplierId)
        .single();
      setIsSunstoneSupplier(data?.is_sunstone || false);
    };
    check();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only on mount -- subsequent changes handled by onSelect

  // ── Variant linking helpers ─────────────────────────────────────────
  const parseVariantMaterial = (variantTitle: string): string => {
    const parts = variantTitle.split(' / ');
    return parts[0].trim();
  };

  const groupVariantsByMaterial = (variants: any[]): Map<string, any[]> => {
    const map = new Map<string, any[]>();
    for (const v of variants) {
      if (!v.title || v.title === 'Default Title') continue;
      const material = parseVariantMaterial(v.title);
      if (!map.has(material)) map.set(material, []);
      map.get(material)!.push(v);
    }
    return map;
  };

  const isChainProduct = (product: any): boolean => {
    return (product?.productType || '').toLowerCase().includes('chain');
  };

  // Initialize selectedProduct from editingItem on mount
  useEffect(() => {
    if (sunstoneProductId && catalogProducts.length > 0 && !selectedProduct) {
      const found = catalogProducts.find((p: any) => p.id === sunstoneProductId);
      if (found) setSelectedProduct(found);
    }
  }, [sunstoneProductId, catalogProducts, selectedProduct]);


  // Load Sunstone catalog when supplier is Sunstone
  useEffect(() => {
    if (!isSunstoneSupplier) {
      setCatalogProducts([]);
      return;
    }
    const loadCatalog = async () => {
      setCatalogLoading(true);
      try {
        const { data } = await supabase
          .from('sunstone_catalog_cache')
          .select('products')
          .limit(1)
          .single();
        if (data?.products) {
          const allActive = (data.products as any[]).filter((p: any) => p.status === 'ACTIVE');

          // Filter to inventory-relevant products (shared logic)
          const filtered = allActive.filter((p: any) => isInventoryProduct(p));

          // Sort by productType then title
          filtered.sort((a: any, b: any) => {
            const typeA = (a.productType || 'Other').toLowerCase();
            const typeB = (b.productType || 'Other').toLowerCase();
            if (typeA !== typeB) return typeA.localeCompare(typeB);
            return (a.title || '').localeCompare(b.title || '');
          });

          setCatalogProducts(filtered);

          // Auto-link: if no sunstone_product_id set, try to match by name
          if (!sunstoneProductId && name.trim()) {
            const lower = name.trim().toLowerCase();
            const baseName = lower.split(/\s*[\u2014\u2013-]\s*/)[0].trim();
            const matches = filtered.filter((p: any) => {
              const t = (p.title || '').toLowerCase();
              return t === baseName || t.startsWith(baseName + ' ') || t.includes(baseName);
            });
            if (matches.length === 1) {
              setSunstoneProductId(matches[0].id);
            }
          }
        }
      } catch {
        // catalog may not be synced yet
      } finally {
        setCatalogLoading(false);
      }
    };
    loadCatalog();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSunstoneSupplier]);

  // Grouped + search-filtered catalog for the dropdown (product-level, not variant-level)
  const groupedCatalog = useMemo(() => {
    const q = catalogSearch.toLowerCase().trim();
    const groups: Record<string, any[]> = {};
    for (const p of catalogProducts) {
      if (q && !(p.title || '').toLowerCase().includes(q)) continue;
      const type = p.productType || 'Other';
      if (!groups[type]) groups[type] = [];
      groups[type].push(p);
    }
    const sorted = Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
    return sorted;
  }, [catalogProducts, catalogSearch]);

  // Get display label for currently selected product
  const selectedProductLabel = useMemo(() => {
    if (!sunstoneProductId) return '';
    const p = catalogProducts.find((cp: any) => cp.id === sunstoneProductId);
    if (!p) return '';
    return p.title;
  }, [sunstoneProductId, catalogProducts]);

  // Handle product selection from dropdown — trigger variant step if needed
  const handleProductSelect = (product: any) => {
    setSunstoneProductId(product.id);
    setSelectedProduct(product);
    setCatalogDropdownOpen(false);
    setCatalogSearch('');

    const variants = (product.variants || []) as any[];
    if (variants.length <= 1) {
      // Single variant — auto-set
      setSunstoneVariantId(variants[0]?.id || null);
      return;
    }

    if (isChainProduct(product)) {
      const materialGroups = groupVariantsByMaterial(variants);
      if (materialGroups.size <= 1) {
        // Only one material — auto-set to "By the Inch" variant or first
        const group = [...materialGroups.values()][0] || variants;
        const byInch = group.find((v: any) => /by the inch/i.test(v.title));
        setSunstoneVariantId((byInch || group[0])?.id || null);
        return;
      }
      // Multiple material groups — try auto-match by item material
      const itemMaterial = (materialId ? materialsList.find((m) => m.id === materialId)?.name : null) || '';
      if (itemMaterial) {
        for (const [mat, group] of materialGroups) {
          if (mat.toLowerCase().includes(itemMaterial.toLowerCase()) || itemMaterial.toLowerCase().includes(mat.toLowerCase())) {
            const byInch = group.find((v: any) => /by the inch/i.test(v.title));
            setSunstoneVariantId((byInch || group[0])?.id || null);
            return;
          }
        }
      }
      // No auto-match — user must pick
      setSunstoneVariantId(null);
    } else {
      // Non-chain with multiple variants — try auto-match by material
      const itemMaterial = (materialId ? materialsList.find((m) => m.id === materialId)?.name : null) || '';
      if (itemMaterial) {
        const match = variants.find((v: any) =>
          (v.title || '').toLowerCase().includes(itemMaterial.toLowerCase())
        );
        if (match) {
          setSunstoneVariantId(match.id);
          return;
        }
      }
      // No auto-match — user must pick
      setSunstoneVariantId(null);
    }
  };

  // Close catalog dropdown on outside click
  useEffect(() => {
    if (!catalogDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (catalogDropdownRef.current && !catalogDropdownRef.current.contains(e.target as Node)) {
        setCatalogDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [catalogDropdownOpen]);

  // â"€â"€â"€ Validation â"€â"€â"€
  const validate = (): boolean => {
    if (!name.trim()) {
      toast.error('Name is required');
      return false;
    }

    if (type === 'chain') {
      if (pricingMode === 'per_inch' && sellPrice <= 0) {
        toast.error('Set a per-inch price so this chain appears in the POS');
        return false;
      }

      if (pricingMode === 'per_product') {
        const activeRows = chainPriceRows.filter((r) => r.is_active);
        const rowsWithNoPrice = activeRows.filter((r) => r.sell_price <= 0);

        if (activeRows.length === 0) {
          toast.warning(
            'No product types are enabled. This chain won\'t appear in the POS until you enable at least one.',
            { duration: 5000 }
          );
          // Don't block save â€" they may want to save a draft
        } else if (rowsWithNoPrice.length > 0) {
          toast.warning(
            `${rowsWithNoPrice.length} enabled product type(s) have no price set. They won't appear in the POS.`,
            { duration: 5000 }
          );
          // Don't block save â€" warn but allow
        }
      }
    } else {
      // Non-chain: block save if no sell price (unless item has variants — each variant has its own price)
      if (sellPrice <= 0 && !hasVariants) {
        toast.error('A sell price is required for non-chain items.');
        return false;
      }
    }

    // Validate variants
    if (hasVariants && variants.length > 0) {
      const emptyNames = variants.filter((v) => !v.name.trim());
      if (emptyNames.length > 0) {
        toast.error('All variants must have a name.');
        return false;
      }
    }

    return true;
  };

  // ─── Variant helpers ───
  const addVariant = () => {
    const newVariant: InventoryItemVariant = {
      id: `new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      tenant_id: tenant.id,
      inventory_item_id: editingItem?.id || '',
      name: '',
      sku: null,
      cost_per_unit: parseFloat(costPerUnit) || 0,
      sell_price: sellPrice || 0,
      quantity_on_hand: 0,
      reorder_threshold: 0,
      sort_order: variants.length,
      is_active: true,
      sunstone_variant_id: null,
      created_at: '',
      updated_at: '',
    };
    setVariants((prev) => [...prev, newVariant]);
  };

  const addMonthVariants = () => {
    const months = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];
    const existingNames = new Set(variants.map((v) => v.name.toLowerCase()));
    const newVariants: InventoryItemVariant[] = months
      .filter((m) => !existingNames.has(m.toLowerCase()))
      .map((m, i) => ({
        id: `new-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}`,
        tenant_id: tenant.id,
        inventory_item_id: editingItem?.id || '',
        name: m,
        sku: null,
        cost_per_unit: parseFloat(costPerUnit) || 0,
        sell_price: sellPrice || 0,
        quantity_on_hand: 0,
        reorder_threshold: 0,
        sort_order: variants.length + i,
        is_active: true,
        sunstone_variant_id: null,
        created_at: '',
        updated_at: '',
      }));
    if (newVariants.length === 0) {
      toast('All months already exist');
      return;
    }
    setVariants((prev) => [...prev, ...newVariants]);
    toast.success(`Added ${newVariants.length} month variant${newVariants.length !== 1 ? 's' : ''}`);
  };

  const updateVariant = (id: string, field: keyof InventoryItemVariant, value: any) => {
    setVariants((prev) => prev.map((v) => v.id === id ? { ...v, [field]: value } : v));
  };

  const removeVariant = (id: string) => {
    if (!id.startsWith('new-')) {
      setDeletedVariantIds((prev) => [...prev, id]);
    }
    setVariants((prev) => prev.filter((v) => v.id !== id));
  };

  const moveVariant = (idx: number, direction: -1 | 1) => {
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= variants.length) return;
    setVariants((prev) => {
      const arr = [...prev];
      [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
      return arr.map((v, i) => ({ ...v, sort_order: i }));
    });
  };

  const handleToggleHasVariants = (enabled: boolean) => {
    if (!enabled && variants.length > 0) {
      if (!window.confirm('This will remove all variants. Stock from variants will be combined into the parent item.')) return;
      const totalStock = variants.reduce((sum, v) => sum + Number(v.quantity_on_hand), 0);
      setQuantity(totalStock);
      // Mark existing DB variants for deletion
      for (const v of variants) {
        if (!v.id.startsWith('new-')) {
          setDeletedVariantIds((prev) => [...prev, v.id]);
        }
      }
      setVariants([]);
    }
    setHasVariants(enabled);
  };

  // â"€â"€â"€ Save â"€â"€â"€
  const handleSave = async () => {
    setValidationTriggered(true);

    if (!validate()) return;

    setSaving(true);

    try {
      // Resolve material name from materialId for backward compat
      const selectedMaterial = materialId
        ? materialsList.find((m) => m.id === materialId)
        : null;

      const itemData: Record<string, any> = {
        tenant_id: tenant.id,
        name: name.trim(),
        type,
        material: selectedMaterial?.name || null,
        material_id: materialId,
        supplier: supplierText.trim() || null,
        supplier_id: supplierId,
        sku: sku.trim() || null,
        unit: type === 'chain' ? 'in' : unit,
        cost_per_unit: type === 'chain' && costEntryUnit === 'foot'
          ? Math.round(((parseFloat(costPerUnit) || 0) / 12) * 10000) / 10000
          : parseFloat(costPerUnit) || 0,
        sell_price: type === 'chain' && pricingMode === 'per_product' ? 0 : sellPrice,
        quantity_on_hand: quantity,
        reorder_threshold: reorderThreshold,
        notes: notes.trim() || null,
        pricing_mode: type === 'chain' ? pricingMode : 'per_product',
        pricing_tier_id: type === 'chain' ? pricingTierId : null,
        sunstone_product_id: isSunstoneSupplier ? sunstoneProductId : null,
        sunstone_variant_id: isSunstoneSupplier ? sunstoneVariantId : null,
        has_variants: type !== 'chain' ? hasVariants : false,
      };

      let savedItemId: string;

      if (isEditing && editingItem) {
        // Update
        const { error } = await supabase
          .from('inventory_items')
          .update(itemData)
          .eq('id', editingItem.id)
          .eq('tenant_id', tenant.id);

        if (error) throw error;
        savedItemId = editingItem.id;
      } else {
        // Insert
        itemData.is_active = true;
        const { data, error } = await supabase
          .from('inventory_items')
          .insert(itemData)
          .select('id')
          .single();

        if (error) throw error;
        savedItemId = data.id;
      }

      // Save chain product prices (per_product mode)
      if (type === 'chain' && pricingMode === 'per_product') {
        const activePrices = chainPriceRows.filter((r) => r.is_active && r.sell_price > 0);
        if (activePrices.length > 0) {
          const res = await fetch('/api/chain-product-prices', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              inventory_item_id: savedItemId,
              tenant_id: tenant.id,
              prices: activePrices.map((r) => ({
                product_type_id: r.product_type_id,
                sell_price: r.sell_price,
                default_inches: r.default_inches,
                is_active: r.is_active,
              })),
            }),
          });

          if (!res.ok) {
            console.error('Failed to save chain prices');
            toast.warning('Item saved, but chain pricing may not have saved fully.');
          }
        }
      }

      // Save variants (if applicable)
      if (hasVariants && type !== 'chain') {
        // Delete removed variants
        if (deletedVariantIds.length > 0) {
          await supabase
            .from('inventory_item_variants')
            .delete()
            .in('id', deletedVariantIds);
        }

        // Upsert variants
        for (const v of variants) {
          const variantData = {
            tenant_id: tenant.id,
            inventory_item_id: savedItemId,
            name: v.name.trim(),
            sku: v.sku?.trim() || null,
            cost_per_unit: Number(v.cost_per_unit) || 0,
            sell_price: Number(v.sell_price) || 0,
            quantity_on_hand: Number(v.quantity_on_hand) || 0,
            reorder_threshold: Number(v.reorder_threshold) || 0,
            sort_order: v.sort_order,
            is_active: v.is_active,
            sunstone_variant_id: v.sunstone_variant_id || null,
          };

          if (v.id.startsWith('new-')) {
            // Insert new variant
            await supabase
              .from('inventory_item_variants')
              .insert(variantData);
          } else {
            // Update existing variant
            await supabase
              .from('inventory_item_variants')
              .update({ ...variantData, updated_at: new Date().toISOString() })
              .eq('id', v.id);
          }
        }
      } else if (!hasVariants && deletedVariantIds.length > 0) {
        // Clean up variants when toggled off
        await supabase
          .from('inventory_item_variants')
          .delete()
          .in('id', deletedVariantIds);
      }

      toast.success(isEditing ? 'Item updated' : 'Item added');
      onSaved();
    } catch (err: any) {
      console.error('Save error:', err);
      if (err?.code === '23505') {
        toast.error('An item with this name and material already exists. Use a different name or material.');
      } else {
        toast.error(err.message || 'Failed to save item');
      }
    } finally {
      setSaving(false);
    }
  };

  // â"€â"€â"€ Cost label â"€â"€â"€
  const costLabel = type === 'chain'
    ? (costEntryUnit === 'foot' ? 'Your Cost per Foot' : 'Your Cost per Inch')
    : 'Cost per Unit';
  const quantityLabel = type === 'chain' ? 'Quantity on Hand (inches)' : 'Quantity on Hand';

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-lg mx-4 my-8 bg-[var(--surface-overlay)] rounded-2xl shadow-xl">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-[var(--surface-overlay)] rounded-t-2xl border-b border-[var(--border-subtle)] px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">
            {isEditing ? 'Edit Item' : 'Add Inventory Item'}
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-subtle)] transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form Body */}
        <div className="px-6 py-5 space-y-6 max-h-[calc(100vh-200px)] overflow-y-auto">

          {/* â•â•â• SECTION 1: Basic Info â•â•â• */}
          <div className="space-y-4">
            <h3 className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">
              Basic Info
            </h3>

            {/* Name */}
            <Input
              label="Item Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Aspen Gold Filled"
              error={validationTriggered && !name.trim() ? 'Name is required' : undefined}
            />

            {/* Type & Material row */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
                  Type
                </label>
                <select
                  value={type}
                  onChange={(e) => handleTypeChange(e.target.value as InventoryType)}
                  className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--surface-base)] px-4 py-3 text-[var(--text-primary)] text-base focus:outline-none focus:border-[var(--accent-primary)] focus:ring-2 focus:ring-[var(--accent-subtle)] min-h-[48px]"
                >
                  {ITEM_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              <MaterialDropdown
                  tenantId={tenant.id}
                  value={materialId}
                  initialName={editingItem?.material}
                  onChange={(id) => {
                    setMaterialId(id);
                    // Also update materialsList when a new one is created
                  }}
                  onMaterialCreated={(mat) => {
                    setMaterialsList((prev) => [...prev, mat]);
                  }}
                />
            </div>

            {/* Supplier */}
            <SupplierDropdown
              tenantId={tenant.id}
              value={supplierId}
              initialName={editingItem?.supplier}
              onChange={(id) => setSupplierId(id)}
              onSelect={(supplier) => {
                setSupplierText(supplier?.name || '');
                setIsSunstoneSupplier(supplier?.is_sunstone || false);
                if (!supplier?.is_sunstone) {
                  setSunstoneProductId(null);
                  setSunstoneVariantId(null);
                  setSelectedProduct(null);
                  setCatalogProducts([]);
                }
              }}
            />

            {/* Sunstone Product Link — searchable grouped dropdown */}
            {isSunstoneSupplier && (
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-[var(--text-primary)]">
                  Sunstone Product
                </label>
                <div ref={catalogDropdownRef} className="relative">
                  {/* Trigger button */}
                  <button
                    type="button"
                    onClick={() => { if (!catalogLoading) { setCatalogDropdownOpen(!catalogDropdownOpen); setCatalogSearch(''); } }}
                    disabled={catalogLoading}
                    className="w-full min-h-[48px] px-3 py-2 rounded-xl border border-[var(--border-default)] bg-[var(--surface-base)] text-sm text-left flex items-center justify-between gap-2 focus:outline-none focus:border-[var(--accent-primary)] focus:ring-2 focus:ring-[var(--accent-subtle)] disabled:opacity-50"
                  >
                    <span className={sunstoneProductId ? 'text-[var(--text-primary)]' : 'text-[var(--text-tertiary)]'}>
                      {catalogLoading
                        ? 'Loading catalog...'
                        : catalogProducts.length === 0
                          ? 'No catalog synced'
                          : selectedProductLabel || 'Select product...'}
                    </span>
                    {sunstoneProductId ? (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setSunstoneProductId(null); setSunstoneVariantId(null); setSelectedProduct(null); }}
                        className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    ) : (
                      <svg className="w-4 h-4 shrink-0 text-[var(--text-tertiary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    )}
                  </button>

                  {/* Dropdown panel */}
                  {catalogDropdownOpen && (
                    <div className="absolute z-50 left-0 right-0 mt-1 bg-[var(--surface-overlay)] border border-[var(--border-default)] rounded-xl shadow-lg max-h-72 flex flex-col">
                      {/* Search input */}
                      <div className="p-2 border-b border-[var(--border-subtle)]">
                        <input
                          type="text"
                          value={catalogSearch}
                          onChange={(e) => setCatalogSearch(e.target.value)}
                          placeholder="Search products..."
                          autoFocus
                          className="w-full h-9 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--surface-base)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent-primary)] focus:ring-2 focus:ring-[var(--accent-subtle)]"
                        />
                      </div>

                      {/* Grouped product list */}
                      <div className="overflow-y-auto flex-1">
                        {groupedCatalog.length === 0 ? (
                          <div className="px-3 py-4 text-sm text-[var(--text-tertiary)] text-center">
                            {catalogSearch ? 'No matching products' : 'No inventory products found'}
                          </div>
                        ) : (
                          groupedCatalog.map(([type, products]) => (
                            <div key={type}>
                              <div className="px-3 py-1.5 text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider bg-[var(--surface-subtle)] sticky top-0">
                                {type}
                              </div>
                              {products.map((p: any) => {
                                const isSelected = sunstoneProductId === p.id;
                                const lowestPrice = (p.variants || []).reduce((min: number, v: any) => {
                                  const vp = parseFloat(v.price);
                                  return vp > 0 && vp < min ? vp : min;
                                }, Infinity);
                                const priceLabel = lowestPrice < Infinity ? `from $${lowestPrice.toFixed(2)}` : '';
                                return (
                                  <button
                                    key={p.id}
                                    type="button"
                                    onClick={() => handleProductSelect(p)}
                                    className={`w-full text-left px-3 py-2 min-h-[44px] text-sm flex items-center justify-between gap-2 transition-colors ${
                                      isSelected
                                        ? 'bg-[var(--accent-subtle)] text-[var(--accent-primary)]'
                                        : 'text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]'
                                    }`}
                                  >
                                    <span className="truncate">{p.title}</span>
                                    <span className="shrink-0 text-xs text-[var(--text-tertiary)]">{priceLabel}</span>
                                  </button>
                                );
                              })}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Variant picker — shown after product is selected with multiple options */}
                {sunstoneProductId && selectedProduct && (() => {
                  const variants = (selectedProduct.variants || []) as any[];
                  if (variants.length <= 1) return null;

                  if (isChainProduct(selectedProduct)) {
                    const materialGroups = groupVariantsByMaterial(variants);
                    if (materialGroups.size <= 1) return null;

                    return (
                      <div className="mt-2 space-y-1.5">
                        <label className="block text-xs font-medium text-[var(--text-secondary)]">Sunstone variant</label>
                        <p className="text-[11px] text-[var(--text-tertiary)] -mt-0.5">Select which Sunstone variant to link for reordering</p>
                        <div className="space-y-1">
                          {[...materialGroups.entries()].map(([material, group]) => {
                            const lowestPrice = group.reduce((min: number, v: any) => {
                              const vp = parseFloat(v.price);
                              return vp > 0 && vp < min ? vp : min;
                            }, Infinity);
                            const byInch = group.find((v: any) => /by the inch/i.test(v.title));
                            const groupVariantId = (byInch || group[0])?.id;
                            const isSelected = sunstoneVariantId === groupVariantId;
                            return (
                              <label
                                key={material}
                                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors min-h-[44px] ${
                                  isSelected
                                    ? 'border-[var(--accent-primary)] bg-[var(--accent-subtle)]'
                                    : 'border-[var(--border-default)] hover:bg-[var(--surface-subtle)]'
                                }`}
                              >
                                <input
                                  type="radio"
                                  name="variant-material"
                                  checked={isSelected}
                                  onChange={() => setSunstoneVariantId(groupVariantId)}
                                  className="accent-[var(--accent-primary)]"
                                />
                                <span className="text-sm text-[var(--text-primary)] flex-1">{material}</span>
                                {lowestPrice < Infinity && (
                                  <span className="text-xs text-[var(--text-tertiary)]">from ${lowestPrice.toFixed(2)}</span>
                                )}
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  }

                  // Non-chain: show each variant
                  return (
                    <div className="mt-2 space-y-1.5">
                      <label className="block text-xs font-medium text-[var(--text-secondary)]">Variant</label>
                      <div className="space-y-1">
                        {variants.filter((v: any) => v.title !== 'Default Title').map((v: any) => {
                          const isSelected = sunstoneVariantId === v.id;
                          return (
                            <label
                              key={v.id}
                              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors min-h-[44px] ${
                                isSelected
                                  ? 'border-[var(--accent-primary)] bg-[var(--accent-subtle)]'
                                  : 'border-[var(--border-default)] hover:bg-[var(--surface-subtle)]'
                              }`}
                            >
                              <input
                                type="radio"
                                name="variant-option"
                                checked={isSelected}
                                onChange={() => setSunstoneVariantId(v.id)}
                                className="accent-[var(--accent-primary)]"
                              />
                              <span className="text-sm text-[var(--text-primary)] flex-1">{v.title}</span>
                              {v.price && (
                                <span className="text-xs text-[var(--text-tertiary)]">${parseFloat(v.price).toFixed(2)}</span>
                              )}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                <p className="text-xs text-[var(--text-tertiary)]">
                  Link to Sunstone catalog for one-touch reordering
                </p>
              </div>
            )}

            {/* SKU */}
            <Input
              label="SKU (optional)"
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              placeholder="e.g. CH-ASPEN-14K"
            />
          </div>

          {/* â"€â"€â"€ Section Divider â"€â"€â"€ */}
          <div className="border-t border-[var(--border-subtle)]" />

          {/* â•â•â• SECTION 2: Stock & Cost â•â•â• */}
          <div className="space-y-4">
            <h3 className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">
              Stock &amp; Cost
            </h3>

            <div className="grid grid-cols-2 gap-3">
              {/* Quantity */}
              <div>
                <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
                  {quantityLabel}
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step={type === 'chain' ? '0.5' : '1'}
                    min="0"
                    value={quantity || ''}
                    onChange={(e) => setQuantity(parseFloat(e.target.value) || 0)}
                    placeholder="0"
                    readOnly={hasVariants && variants.length > 0}
                    className={`w-full rounded-lg border border-[var(--border-default)] bg-[var(--surface-base)] px-4 py-3 text-[var(--text-primary)] text-base placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent-primary)] focus:ring-2 focus:ring-[var(--accent-subtle)] min-h-[48px] pr-12 ${hasVariants && variants.length > 0 ? 'opacity-60 cursor-not-allowed' : ''}`}
                  />
                  {type === 'chain' && (
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-[var(--text-tertiary)]">
                      in
                    </span>
                  )}
                  {hasVariants && variants.length > 0 && (
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] text-[var(--text-tertiary)]">
                      auto
                    </span>
                  )}
                </div>
              </div>

              {/* Reorder Threshold */}
              <div>
                <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
                  Reorder At
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step={type === 'chain' ? '0.5' : '1'}
                    min="0"
                    value={reorderThreshold || ''}
                    onChange={(e) => setReorderThreshold(parseFloat(e.target.value) || 0)}
                    placeholder="0"
                    className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--surface-base)] px-4 py-3 text-[var(--text-primary)] text-base  placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent-primary)] focus:ring-2 focus:ring-[var(--accent-subtle)] min-h-[48px] pr-12"
                  />
                  {type === 'chain' && (
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-[var(--text-tertiary)]">
                      in
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Cost */}
            <div>
              <div className="flex items-center gap-3 mb-1">
                <label className="text-sm font-medium text-[var(--text-primary)]">
                  {costLabel}
                </label>
                {type === 'chain' && (
                  <div className="inline-flex rounded-lg border border-[var(--border-default)] overflow-hidden">
                    <button
                      type="button"
                      onClick={() => {
                        if (costEntryUnit === 'foot') {
                          // Convert displayed per-foot value to per-inch
                          const val = parseFloat(costPerUnit);
                          if (val > 0) {
                            setCostPerUnit(String(Math.round((val / 12) * 10000) / 10000));
                          }
                          setCostEntryUnit('inch');
                        }
                      }}
                      className={`px-2.5 py-1 text-xs font-medium transition-colors ${
                        costEntryUnit === 'inch'
                          ? 'bg-[var(--accent-primary)] text-white'
                          : 'bg-[var(--surface-base)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
                      }`}
                    >
                      per inch
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (costEntryUnit === 'inch') {
                          // Convert displayed per-inch value to per-foot
                          const val = parseFloat(costPerUnit);
                          if (val > 0) {
                            setCostPerUnit(String(Math.round(val * 12 * 10000) / 10000));
                          }
                          setCostEntryUnit('foot');
                        }
                      }}
                      className={`px-2.5 py-1 text-xs font-medium transition-colors ${
                        costEntryUnit === 'foot'
                          ? 'bg-[var(--accent-primary)] text-white'
                          : 'bg-[var(--surface-base)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
                      }`}
                    >
                      per foot
                    </button>
                  </div>
                )}
              </div>
              {type === 'chain' && (
                <p className="text-xs text-[var(--text-tertiary)] mb-1.5">
                  {costEntryUnit === 'foot'
                    ? 'Enter the per-foot price from your supplier'
                    : 'What you paid per inch for this chain'}
                </p>
              )}
              <div className="relative max-w-[200px]">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-[var(--text-tertiary)]">
                  $
                </span>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={costPerUnit}
                  onChange={(e) => setCostPerUnit(e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--surface-base)] pl-8 pr-4 py-3 text-[var(--text-primary)] text-base  placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent-primary)] focus:ring-2 focus:ring-[var(--accent-subtle)] min-h-[48px]"
                />
              </div>
              {type === 'chain' && costEntryUnit === 'foot' && costPerUnit && parseFloat(costPerUnit) > 0 && (
                <p className="text-xs text-[var(--text-tertiary)] mt-1.5">
                  = ${(Math.round((parseFloat(costPerUnit) / 12) * 10000) / 10000).toFixed(4)}/inch
                </p>
              )}
            </div>

            {/* Unit (non-chain only) */}
            {type !== 'chain' && (
              <div>
                <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
                  Unit
                </label>
                <select
                  value={unit}
                  onChange={(e) => setUnit(e.target.value as InventoryUnit)}
                  className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--surface-base)] px-4 py-3 text-[var(--text-primary)] text-base focus:outline-none focus:border-[var(--accent-primary)] focus:ring-2 focus:ring-[var(--accent-subtle)] min-h-[48px] max-w-[200px]"
                >
                  {UNITS.filter((u) => u.value !== 'in').map((u) => (
                    <option key={u.value} value={u.value}>
                      {u.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* â"€â"€â"€ Section Divider â"€â"€â"€ */}
          <div className="border-t border-[var(--border-subtle)]" />

          {/* â•â•â• SECTION 3: Pricing â•â•â• */}
          <div className="space-y-4">
            <h3 className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">
              Pricing
            </h3>

            {/* Chain pricing: full redesigned component */}
            {type === 'chain' ? (
              <ChainPricingConfig
                tenantId={tenant.id}
                inventoryItemId={editingItem?.id || null}
                pricingMode={pricingMode}
                onPricingModeChange={setPricingMode}
                perInchRate={sellPrice}
                onPerInchRateChange={setSellPrice}
                onPricesChange={setChainPriceRows}
                chainName={name.trim() || 'This chain'}
                validationTriggered={validationTriggered}
                tenantPricingMode={(tenant as any).pricing_mode || 'per_product'}
                pricingTierId={pricingTierId}
                onPricingTierChange={setPricingTierId}
              />
            ) : (
              /* Non-chain: simple sell price */
              <div>
                <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
                  Sell Price
                </label>
                <div className="relative max-w-[200px]">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-[var(--text-tertiary)]">
                    $
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={sellPrice || ''}
                    onChange={(e) => setSellPrice(parseFloat(e.target.value) || 0)}
                    placeholder="0.00"
                    className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--surface-base)] pl-8 pr-4 py-3 text-[var(--text-primary)] text-base  placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent-primary)] focus:ring-2 focus:ring-[var(--accent-subtle)] min-h-[48px]"
                  />
                </div>
              </div>
            )}
          </div>

          {/* ═══ SECTION 4: Variants (non-chain only) ═══ */}
          {type !== 'chain' && (
            <>
              <div className="border-t border-[var(--border-subtle)]" />
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">
                    Variants
                  </h3>
                </div>

                {/* Toggle */}
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hasVariants}
                    onChange={(e) => handleToggleHasVariants(e.target.checked)}
                    className="rounded accent-[var(--accent-primary)]"
                  />
                  <span className="text-sm text-[var(--text-primary)]">
                    This item has variants
                  </span>
                  <span className="text-xs text-[var(--text-tertiary)]">
                    (e.g., different colors, months, sizes)
                  </span>
                </label>

                {/* Variant editor */}
                {hasVariants && (
                  <div className="space-y-3">
                    {variants.length > 0 && (
                      <div className="rounded-xl border border-[var(--border-default)] overflow-hidden">
                        {/* Header */}
                        <div className="grid grid-cols-[1fr_70px_70px_60px_60px_56px] gap-2 px-3 py-2 bg-[var(--surface-raised)] text-[10px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider">
                          <div>Name</div>
                          <div className="text-right">Cost</div>
                          <div className="text-right">Price</div>
                          <div className="text-right">Stock</div>
                          <div className="text-right">Alert</div>
                          <div></div>
                        </div>

                        {/* Rows */}
                        <div className="divide-y divide-[var(--border-subtle)]">
                          {variants.map((v, idx) => (
                            <div key={v.id} className="grid grid-cols-[1fr_70px_70px_60px_60px_56px] gap-2 px-3 py-2 items-center">
                              <input
                                type="text"
                                value={v.name}
                                onChange={(e) => updateVariant(v.id, 'name', e.target.value)}
                                placeholder="Name"
                                className="w-full rounded border border-[var(--border-default)] bg-[var(--surface-base)] px-2 py-1.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent-primary)] min-h-[36px]"
                              />
                              <div className="relative">
                                <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[10px] text-[var(--text-tertiary)]">$</span>
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={v.cost_per_unit || ''}
                                  onChange={(e) => updateVariant(v.id, 'cost_per_unit', parseFloat(e.target.value) || 0)}
                                  className="w-full rounded border border-[var(--border-default)] bg-[var(--surface-base)] pl-5 pr-1 py-1.5 text-sm text-right text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)] min-h-[36px]"
                                />
                              </div>
                              <div className="relative">
                                <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[10px] text-[var(--text-tertiary)]">$</span>
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={v.sell_price || ''}
                                  onChange={(e) => updateVariant(v.id, 'sell_price', parseFloat(e.target.value) || 0)}
                                  className="w-full rounded border border-[var(--border-default)] bg-[var(--surface-base)] pl-5 pr-1 py-1.5 text-sm text-right text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)] min-h-[36px]"
                                />
                              </div>
                              <input
                                type="number"
                                step="1"
                                min="0"
                                value={v.quantity_on_hand || ''}
                                onChange={(e) => updateVariant(v.id, 'quantity_on_hand', parseFloat(e.target.value) || 0)}
                                className="w-full rounded border border-[var(--border-default)] bg-[var(--surface-base)] px-1 py-1.5 text-sm text-right text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)] min-h-[36px]"
                              />
                              <input
                                type="number"
                                step="1"
                                min="0"
                                value={v.reorder_threshold || ''}
                                onChange={(e) => updateVariant(v.id, 'reorder_threshold', parseFloat(e.target.value) || 0)}
                                className="w-full rounded border border-[var(--border-default)] bg-[var(--surface-base)] px-1 py-1.5 text-sm text-right text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)] min-h-[36px]"
                              />
                              <div className="flex items-center gap-0.5 justify-end">
                                <button
                                  type="button"
                                  onClick={() => moveVariant(idx, -1)}
                                  disabled={idx === 0}
                                  className="p-1 rounded text-[var(--text-tertiary)] hover:text-[var(--text-primary)] disabled:opacity-20"
                                  title="Move up"
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
                                  </svg>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => removeVariant(v.id)}
                                  className="p-1 rounded text-[var(--text-tertiary)] hover:text-red-600"
                                  title="Remove variant"
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Action buttons */}
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={addVariant}
                        className="text-sm font-medium text-[var(--accent-primary)] hover:underline min-h-[36px]"
                      >
                        + Add Variant
                      </button>
                      <button
                        type="button"
                        onClick={addMonthVariants}
                        className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] min-h-[36px]"
                      >
                        Add months (Jan–Dec)
                      </button>
                    </div>

                    {hasVariants && variants.length > 0 && (
                      <p className="text-xs text-[var(--text-tertiary)]">
                        Total stock: {variants.reduce((sum, v) => sum + Number(v.quantity_on_hand), 0)} (auto-calculated from variants)
                      </p>
                    )}
                  </div>
                )}
              </div>
            </>
          )}

          {/* â"€â"€â"€ Notes â"€â"€â"€ */}
          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
              Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Internal notes about this itemâ€¦"
              className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--surface-base)] px-4 py-3 text-[var(--text-primary)] text-sm placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent-primary)] focus:ring-2 focus:ring-[var(--accent-subtle)] resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-[var(--surface-overlay)] rounded-b-2xl border-t border-[var(--border-subtle)] px-6 py-4 flex items-center gap-3">
          {isEditing && editingItem && onDelete && (
            <button
              type="button"
              onClick={() => onDelete(editingItem)}
              disabled={saving}
              className="text-sm text-red-500 hover:text-red-600 font-medium transition-colors disabled:opacity-40"
            >
              Delete
            </button>
          )}
          <div className="flex-1" />
          <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={handleSave} loading={saving}>
            {isEditing ? 'Save Changes' : 'Add Item'}
          </Button>
        </div>
      </div>
    </div>
  );
}