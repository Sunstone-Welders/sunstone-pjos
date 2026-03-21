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

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
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
import type { InventoryItem, InventoryType, InventoryUnit, PricingMode, Material, TenantPricingMode, ReorderHistory, Supplier } from '@/types';
import { Skeleton } from '@/components/ui';
import SunnyTutorial from '@/components/SunnyTutorial';
import ReorderModal from '@/components/inventory/ReorderModal';

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

  // Reorder
  const [reorderItem, setReorderItem] = useState<InventoryItem | null>(null);
  const [reorderHistory, setReorderHistory] = useState<ReorderHistory[]>([]);
  const [showReorderHistory, setShowReorderHistory] = useState(false);
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
  const reorderHistoryRef = useRef<HTMLDivElement>(null);

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
    if (showReorderHistory) loadReorderHistory();
  }, [showReorderHistory, loadReorderHistory]);

  // Scroll the reorder history panel into view when opened
  useEffect(() => {
    if (showReorderHistory && reorderHistoryRef.current) {
      requestAnimationFrame(() => {
        reorderHistoryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  }, [showReorderHistory]);

  // Poll SF order status for active orders while panel is open
  useEffect(() => {
    if (!showReorderHistory) return;

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
  }, [showReorderHistory, reorderHistory, loadReorderHistory]);

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
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* â"€â"€â"€ Header â"€â"€â"€ */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Inventory</h1>
          <p className="text-sm text-[var(--text-tertiary)] mt-1">
            {items.length} item{items.length !== 1 ? 's' : ''} total
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push('/dashboard/settings?section=pricing')}
            className="p-2.5 rounded-lg border border-[var(--border-default)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-raised)] transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            title="Pricing Settings"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleAutoLink}
            disabled={autoLinking}
          >
            {autoLinking ? 'Linking...' : 'Link Sunstone Products'}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowReorderHistory(!showReorderHistory)}
          >
            Reorder History
          </Button>
          <Button variant="primary" size="sm" onClick={handleAddClick}>
            + Add Item
          </Button>
        </div>
      </div>

      {/* Reorder History Panel -- positioned at top so it's always visible */}
      {showReorderHistory && (
        <div ref={reorderHistoryRef}>
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Reorder History</CardTitle>
                <button
                  onClick={() => setShowReorderHistory(false)}
                  className="p-1.5 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] rounded-lg hover:bg-[var(--surface-subtle)]"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </CardHeader>
            <CardContent>
              {reorderHistory.length === 0 ? (
                <p className="text-sm text-[var(--text-tertiary)] text-center py-6">
                  No reorders yet. Use the cart icon on any Sunstone-linked item to place your first reorder.
                </p>
              ) : (
                <div className="divide-y divide-[var(--border-subtle)]">
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
                      <div key={r.id} className="py-3 flex items-center gap-4">
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
            </CardContent>
          </Card>
        </div>
      )}

      {/* â"€â"€â"€ Search & Filters â"€â"€â"€ */}
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
          Show inactive
        </label>
      </div>

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

              return (
              <div
                key={item.id}
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
                          setShowReorderHistory(true);
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
                      item.quantity_on_hand <= item.reorder_threshold
                        ? 'text-[var(--error-600)] font-semibold'
                        : 'text-[var(--text-primary)]'
                    }`}
                  >
                    {item.quantity_on_hand}
                    <span className="text-[var(--text-tertiary)] text-xs ml-0.5">
                      {item.unit === 'in' ? 'in' : item.unit === 'ft' ? 'ft' : ''}
                    </span>
                  </span>
                </div>

                {/* Desktop actions */}
                <div className="hidden sm:flex items-center gap-1 justify-end">
                  {/* Mark Received -- prominent when shipped */}
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
                  {item.sunstone_product_id && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setReorderItem(item);
                      }}
                      className="text-[var(--text-tertiary)] hover:text-[var(--accent-primary)] p-1.5 rounded-lg hover:bg-[var(--accent-50)] transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center"
                      title="Reorder from Sunstone"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
                      </svg>
                    </button>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleActive(item);
                    }}
                    className="text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] p-1.5 rounded-lg hover:bg-[var(--surface-subtle)] transition-colors"
                    title={item.is_active ? 'Deactivate' : 'Activate'}
                  >
                    {item.is_active ? (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    )}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(item);
                    }}
                    className="text-[var(--text-tertiary)] hover:text-error-500 p-1.5 rounded-lg hover:bg-error-50 transition-colors"
                    title="Delete"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                    </svg>
                  </button>
                </div>

                {/* Mobile: price, stock, and actions row */}
                <div className="flex items-center justify-between sm:hidden mt-1 gap-2">
                  <span className="text-sm text-[var(--text-primary)]">
                    {formatPrice(item)}
                  </span>
                  <span
                    className={`text-sm ${
                      item.quantity_on_hand <= item.reorder_threshold
                        ? 'text-[var(--error-600)]'
                        : 'text-[var(--text-secondary)]'
                    }`}
                  >
                    {item.quantity_on_hand} {item.unit}
                  </span>
                  <div className="flex items-center gap-1 ml-auto">
                    {/* Mark Received -- prominent on mobile when shipped */}
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
                    {/* Reorder cart icon -- always visible on mobile */}
                    {item.sunstone_product_id && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setReorderItem(item);
                        }}
                        className="text-[var(--text-tertiary)] hover:text-[var(--accent-primary)] p-2.5 rounded-lg hover:bg-[var(--accent-50)] transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                        title="Reorder from Sunstone"
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              </div>
              );
            })}
          </div>
        </div>
      )}

      {/* â"€â"€â"€ Product Types Prompt Modal â"€â"€â"€ */}
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

      {/* Reorder Modal */}
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
  const [isSunstoneSupplier, setIsSunstoneSupplier] = useState(false);
  const [catalogProducts, setCatalogProducts] = useState<any[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);

  // Validation
  const [validationTriggered, setValidationTriggered] = useState(false);
  const [saving, setSaving] = useState(false);

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
          const active = (data.products as any[]).filter((p: any) => p.status === 'ACTIVE');
          setCatalogProducts(active);

          // Auto-link: if no sunstone_product_id set, try to match by name
          if (!sunstoneProductId && name.trim()) {
            const lower = name.trim().toLowerCase();
            const baseName = lower.split(/\s*[\u2014\u2013-]\s*/)[0].trim();
            const matches = active.filter((p: any) => {
              const title = (p.title || '').toLowerCase();
              return title === baseName || title.startsWith(baseName + ' ') || title.includes(baseName);
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
      // Non-chain: block save if no sell price
      if (sellPrice <= 0) {
        toast.error('A sell price is required for non-chain items.');
        return false;
      }
    }

    return true;
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
                  setCatalogProducts([]);
                }
              }}
            />

            {/* Sunstone Product Link */}
            {isSunstoneSupplier && (
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-[var(--text-primary)]">
                  Sunstone Product
                </label>
                <select
                  value={sunstoneProductId || ''}
                  onChange={(e) => setSunstoneProductId(e.target.value || null)}
                  className="w-full h-10 px-3 rounded-xl border border-[var(--border-default)] bg-[var(--surface-base)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)] focus:ring-2 focus:ring-[var(--accent-subtle)]"
                  disabled={catalogLoading}
                >
                  <option value="">
                    {catalogLoading ? 'Loading catalog...' : catalogProducts.length === 0 ? 'No catalog synced' : 'Select product...'}
                  </option>
                  {catalogProducts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </select>
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
                    className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--surface-base)] px-4 py-3 text-[var(--text-primary)] text-base  placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent-primary)] focus:ring-2 focus:ring-[var(--accent-subtle)] min-h-[48px] pr-12"
                  />
                  {type === 'chain' && (
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-[var(--text-tertiary)]">
                      in
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