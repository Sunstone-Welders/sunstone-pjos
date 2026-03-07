// ============================================================================
// Inventory Page â€” src/app/dashboard/inventory/page.tsx
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

import { useEffect, useState, useMemo, useCallback } from 'react';
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
import type { InventoryItem, InventoryType, InventoryUnit, PricingMode, Material } from '@/types';
import { Skeleton } from '@/components/ui';
import SunnyTutorial from '@/components/SunnyTutorial';
import ProductTypesSection from '@/components/settings/ProductTypesSection';
import { Modal, ModalHeader, ModalBody } from '@/components/ui/Modal';

// â”€â”€â”€ Constants â”€â”€â”€
const ITEM_TYPES: { value: InventoryType; label: string }[] = [
  { value: 'chain', label: 'Chain' },
  { value: 'jump_ring', label: 'Jump Ring' },
  { value: 'charm', label: 'Charm' },
  { value: 'connector', label: 'Connector' },
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
  const supabase = createClient();

  // â”€â”€â”€ State â”€â”€â”€
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<InventoryType | 'all'>('all');
  const [showInactive, setShowInactive] = useState(false);

  // Modal state
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);

  // Product type defaults modal
  const [showProductTypeDefaults, setShowProductTypeDefaults] = useState(false);

  // First-time product types prompt
  const [showProductTypesPrompt, setShowProductTypesPrompt] = useState(false);
  const [hasProductTypes, setHasProductTypes] = useState<boolean | null>(null);

  // â”€â”€â”€ Load Inventory â”€â”€â”€
  const loadItems = useCallback(async () => {
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
  }, [tenant, showInactive, supabase]);

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

  // â”€â”€â”€ Filter items â”€â”€â”€
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

  // â”€â”€â”€ Handle Add Button â”€â”€â”€
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
      // Has sale history — soft delete only
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
      // No sale history — allow hard delete
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

  // â”€â”€â”€ Price display helper â”€â”€â”€
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
      {/* â”€â”€â”€ Header â”€â”€â”€ */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Inventory</h1>
          <p className="text-sm text-[var(--text-tertiary)] mt-1">
            {items.length} item{items.length !== 1 ? 's' : ''} total
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowProductTypeDefaults(true)}
            className="p-2.5 rounded-lg border border-[var(--border-default)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-raised)] transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            title="Product Type Defaults"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
          <Button variant="primary" size="sm" onClick={handleAddClick}>
            + Add Item
          </Button>
        </div>
      </div>

      {/* â”€â”€â”€ Search & Filters â”€â”€â”€ */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, material, or SKUâ€¦"
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

      {/* â”€â”€â”€ Inventory List â”€â”€â”€ */}
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
            {filteredItems.map((item) => (
              <div
                key={item.id}
                className={`px-4 py-3 sm:grid sm:grid-cols-[1fr_100px_100px_100px_80px] sm:gap-4 sm:items-center cursor-pointer hover:bg-[var(--surface-raised)] transition-colors ${
                  !item.is_active ? 'opacity-50' : ''
                }`}
                onClick={() => {
                  setEditingItem(item);
                  setShowForm(true);
                }}
              >
                {/* Item info */}
                <div className="mb-2 sm:mb-0">
                  <div className="flex items-center gap-2">
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
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    {item.material && (
                      <span className="text-xs text-[var(--text-tertiary)]">
                        {item.material}
                      </span>
                    )}
                    {item.sku && (
                      <span className="text-xs text-[var(--text-tertiary)]">
                        Â· SKU: {item.sku}
                      </span>
                    )}
                  </div>
                </div>

                {/* Cost */}
                <div className="hidden sm:block text-right">
                  <span className="text-sm  text-[var(--text-secondary)]">
                    ${Number(item.cost_per_unit).toFixed(2)}
                  </span>
                </div>

                {/* Price */}
                <div className="hidden sm:block text-right">
                  <span className="text-sm  text-[var(--text-primary)]">
                    {formatPrice(item)}
                  </span>
                </div>

                {/* Stock */}
                <div className="hidden sm:block text-right">
                  <span
                    className={`text-sm  ${
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

                {/* Actions */}
                <div className="hidden sm:flex items-center gap-1 justify-end">
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

                {/* Mobile price/stock row */}
                <div className="flex items-center justify-between sm:hidden mt-1">
                  <span className="text-sm  text-[var(--text-primary)]">
                    {formatPrice(item)}
                  </span>
                  <span
                    className={`text-sm  ${
                      item.quantity_on_hand <= item.reorder_threshold
                        ? 'text-[var(--error-600)]'
                        : 'text-[var(--text-secondary)]'
                    }`}
                  >
                    {item.quantity_on_hand} {item.unit}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* â”€â”€â”€ Product Types Prompt Modal â”€â”€â”€ */}
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
                If you&apos;re adding chain, you&apos;ll want to set up your product types first â€” like Bracelet, Anklet, and Necklace. This lets you set different prices for each.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  setShowProductTypesPrompt(false);
                  // Navigate to settings
                  window.location.href = '/dashboard/settings';
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
                Skip for now â€” I&apos;ll add non-chain items
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* â”€â”€â”€ Add/Edit Form Modal â”€â”€â”€ */}
      {showForm && (
        <InventoryItemForm
          tenant={tenant}
          editingItem={editingItem}
          onClose={() => {
            setShowForm(false);
            setEditingItem(null);
          }}
          onSaved={() => {
            setShowForm(false);
            setEditingItem(null);
            loadItems();
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

      {/* ── Product Type Defaults Modal ── */}
      <Modal isOpen={showProductTypeDefaults} onClose={() => setShowProductTypeDefaults(false)} size="lg">
        <ModalHeader>
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">Product Type Defaults</h2>
          <p className="text-sm text-[var(--text-tertiary)] mt-1">
            Set default inches and jump rings for each product type.
          </p>
        </ModalHeader>
        <ModalBody>
          <ProductTypesSection tenantId={tenant.id} />
        </ModalBody>
      </Modal>

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
  tenant: { id: string };
  editingItem: InventoryItem | null;
  onClose: () => void;
  onSaved: () => void;
  onDelete?: (item: InventoryItem) => void | Promise<void>;
}

function InventoryItemForm({ tenant, editingItem, onClose, onSaved, onDelete }: InventoryItemFormProps) {
  const supabase = createClient();
  const isEditing = !!editingItem;

  // â”€â”€â”€ Form State â”€â”€â”€
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

  // Chain-specific state
  const [pricingMode, setPricingMode] = useState<PricingMode>(
    (editingItem as any)?.pricing_mode || 'per_product'
  );
  const [chainPriceRows, setChainPriceRows] = useState<PriceConfigRow[]>([]);

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

  // â”€â”€â”€ Validation â”€â”€â”€
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
          // Don't block save â€” they may want to save a draft
        } else if (rowsWithNoPrice.length > 0) {
          toast.warning(
            `${rowsWithNoPrice.length} enabled product type(s) have no price set. They won't appear in the POS.`,
            { duration: 5000 }
          );
          // Don't block save â€” warn but allow
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

  // â”€â”€â”€ Save â”€â”€â”€
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
        cost_per_unit: parseFloat(costPerUnit) || 0,
        sell_price: type === 'chain' && pricingMode === 'per_product' ? 0 : sellPrice,
        quantity_on_hand: quantity,
        reorder_threshold: reorderThreshold,
        notes: notes.trim() || null,
        pricing_mode: type === 'chain' ? pricingMode : 'per_product',
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

  // â”€â”€â”€ Cost label â”€â”€â”€
  const costLabel = type === 'chain' ? 'Your Cost per Inch' : 'Cost per Unit';
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
            />

            {/* SKU */}
            <Input
              label="SKU (optional)"
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              placeholder="e.g. CH-ASPEN-14K"
            />
          </div>

          {/* â”€â”€â”€ Section Divider â”€â”€â”€ */}
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
              <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">
                {costLabel}
              </label>
              {type === 'chain' && (
                <p className="text-xs text-[var(--text-tertiary)] mb-1.5">What you paid per inch for this chain</p>
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

          {/* â”€â”€â”€ Section Divider â”€â”€â”€ */}
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

          {/* â”€â”€â”€ Notes â”€â”€â”€ */}
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