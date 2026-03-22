// ============================================================================
// Admin Catalog Management — src/app/admin/catalog/page.tsx
// ============================================================================
// Platform admin page for controlling which Shopify products are visible
// in the artist-facing Shop Sunstone catalog. Shows ALL products (including
// types excluded by the inventory filter) with visibility toggles.
// ============================================================================

'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { isInventoryProduct, getDisplayType } from '@/lib/catalog-filter';

interface CatalogProduct {
  id: string;
  title: string;
  productType: string;
  imageUrl: string | null;
  variantCount: number;
  minPrice: number;
  passesTypeFilter: boolean; // true if isInventoryProduct passes
}

interface VisibilityOverride {
  shopify_product_id: string;
  is_visible: boolean;
  hidden_reason: string | null;
}

type VisibilityFilter = 'all' | 'visible' | 'hidden';

const REASON_PRESETS = ['Discontinued', 'Seasonal', 'Out of stock', 'Not for resale'];

export default function AdminCatalogPage() {
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [overrides, setOverrides] = useState<Map<string, VisibilityOverride>>(new Map());
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);

  // Filters
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [visibilityFilter, setVisibilityFilter] = useState<VisibilityFilter>('all');

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkReason, setBulkReason] = useState('');
  const [bulkActing, setBulkActing] = useState(false);

  // Inline reason editing
  const [editingReasonId, setEditingReasonId] = useState<string | null>(null);
  const [editingReasonText, setEditingReasonText] = useState('');

  // Toggling state
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());

  // ── Load data ──────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // Auth check
      const checkRes = await fetch('/api/admin/check');
      const checkData = await checkRes.json();
      if (!checkData.isAdmin || checkData.role === 'viewer') {
        setAccessDenied(true);
        setLoading(false);
        return;
      }

      // Load catalog + visibility in parallel
      const [catRes, visRes] = await Promise.all([
        fetch('/api/admin/catalog-visibility/catalog'),
        fetch('/api/admin/catalog-visibility'),
      ]);

      const catData = await catRes.json();
      const visData = await visRes.json();

      // Build overrides map
      const overrideMap = new Map<string, VisibilityOverride>();
      for (const o of (visData.overrides || [])) {
        overrideMap.set(o.shopify_product_id, o);
      }
      setOverrides(overrideMap);

      // Map products
      if (catData.products) {
        const mapped: CatalogProduct[] = catData.products.map((p: any) => {
          const prices = (p.variants || [])
            .map((v: any) => parseFloat(v.price))
            .filter((pr: number) => pr > 0);
          return {
            id: p.id,
            title: p.title || '',
            productType: p.productType || '',
            imageUrl: p.imageUrl || null,
            variantCount: (p.variants || []).filter((v: any) => v.title !== 'Default Title').length,
            minPrice: prices.length > 0 ? Math.min(...prices) : 0,
            passesTypeFilter: isInventoryProduct(p),
          };
        });
        mapped.sort((a, b) => a.title.localeCompare(b.title));
        setProducts(mapped);
      }
    } catch {
      // failed to load
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Derived: product types for filter ──────────────────────────────────

  const productTypes = useMemo(() => {
    const types = new Set<string>();
    for (const p of products) {
      const display = p.productType ? getDisplayType(p.productType) : 'No Type';
      types.add(display);
    }
    return ['all', ...[...types].sort()];
  }, [products]);

  // ── Derived: filtered products ─────────────────────────────────────────

  const filteredProducts = useMemo(() => {
    const q = search.toLowerCase().trim();
    return products.filter((p) => {
      // Search
      if (q && !p.title.toLowerCase().includes(q) && !p.productType.toLowerCase().includes(q)) {
        return false;
      }
      // Type filter
      if (typeFilter !== 'all') {
        const display = p.productType ? getDisplayType(p.productType) : 'No Type';
        if (display !== typeFilter) return false;
      }
      // Visibility filter
      const override = overrides.get(p.id);
      const isVisible = override ? override.is_visible : true;
      if (visibilityFilter === 'visible' && !isVisible) return false;
      if (visibilityFilter === 'hidden' && isVisible) return false;
      return true;
    });
  }, [products, search, typeFilter, visibilityFilter, overrides]);

  // ── Stats ──────────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    let hidden = 0;
    for (const [, o] of overrides) {
      if (!o.is_visible) hidden++;
    }
    return { total: products.length, hidden };
  }, [products, overrides]);

  // ── Toggle single product visibility ───────────────────────────────────

  const toggleVisibility = async (productId: string, makeVisible: boolean, reason?: string) => {
    setTogglingIds((prev) => new Set([...prev, productId]));
    try {
      const res = await fetch('/api/admin/catalog-visibility', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shopify_product_id: productId,
          is_visible: makeVisible,
          hidden_reason: makeVisible ? null : (reason || null),
        }),
      });
      if (res.ok) {
        setOverrides((prev) => {
          const next = new Map(prev);
          if (makeVisible) {
            next.set(productId, {
              shopify_product_id: productId,
              is_visible: true,
              hidden_reason: null,
            });
          } else {
            next.set(productId, {
              shopify_product_id: productId,
              is_visible: false,
              hidden_reason: reason || null,
            });
          }
          return next;
        });
      }
    } catch {
      // failed
    } finally {
      setTogglingIds((prev) => {
        const next = new Set(prev);
        next.delete(productId);
        return next;
      });
    }
  };

  // ── Update reason for already-hidden product ───────────────────────────

  const updateReason = async (productId: string, reason: string) => {
    try {
      await fetch('/api/admin/catalog-visibility', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shopify_product_id: productId,
          is_visible: false,
          hidden_reason: reason || null,
        }),
      });
      setOverrides((prev) => {
        const next = new Map(prev);
        const existing = next.get(productId);
        if (existing) {
          next.set(productId, { ...existing, hidden_reason: reason || null });
        }
        return next;
      });
    } catch {
      // failed
    }
    setEditingReasonId(null);
  };

  // ── Bulk actions ───────────────────────────────────────────────────────

  const handleBulkAction = async (makeVisible: boolean) => {
    if (selectedIds.size === 0) return;
    setBulkActing(true);
    try {
      const res = await fetch('/api/admin/catalog-visibility/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_ids: [...selectedIds],
          is_visible: makeVisible,
          hidden_reason: makeVisible ? null : (bulkReason || null),
        }),
      });
      if (res.ok) {
        setOverrides((prev) => {
          const next = new Map(prev);
          for (const id of selectedIds) {
            next.set(id, {
              shopify_product_id: id,
              is_visible: makeVisible,
              hidden_reason: makeVisible ? null : (bulkReason || null),
            });
          }
          return next;
        });
        setSelectedIds(new Set());
        setBulkReason('');
      }
    } catch {
      // failed
    } finally {
      setBulkActing(false);
    }
  };

  // ── Select helpers ─────────────────────────────────────────────────────

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    const ids = filteredProducts.map((p) => p.id);
    setSelectedIds(new Set(ids));
  };

  const selectNone = () => setSelectedIds(new Set());

  // ── Render ─────────────────────────────────────────────────────────────

  if (accessDenied) {
    return (
      <div className="p-8 text-center">
        <p className="text-lg font-semibold text-[var(--text-primary)]">Access Denied</p>
        <p className="text-sm text-[var(--text-tertiary)] mt-1">
          You don&apos;t have permission to manage the catalog.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-4 p-6">
        <div className="h-8 w-64 rounded bg-[var(--surface-raised)] animate-pulse" />
        <div className="h-12 rounded-xl bg-[var(--surface-raised)] animate-pulse" />
        <div className="space-y-2">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div key={i} className="h-14 rounded-lg bg-[var(--surface-raised)] animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Catalog Management</h1>
        <p className="text-sm text-[var(--text-tertiary)] mt-1">
          {stats.total} products{stats.hidden > 0 ? ` \u00B7 ${stats.hidden} hidden` : ''}
        </p>
      </div>

      {/* Filters row */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-tertiary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products..."
            className="w-full h-10 pl-9 pr-3 rounded-lg border border-[var(--border-default)] bg-[var(--surface-base)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent-primary)] focus:ring-2 focus:ring-[var(--accent-subtle)]"
          />
        </div>

        {/* Type filter */}
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="h-10 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--surface-base)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
        >
          {productTypes.map((t) => (
            <option key={t} value={t}>{t === 'all' ? 'All Types' : t}</option>
          ))}
        </select>

        {/* Visibility filter */}
        <select
          value={visibilityFilter}
          onChange={(e) => setVisibilityFilter(e.target.value as VisibilityFilter)}
          className="h-10 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--surface-base)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
        >
          <option value="all">All</option>
          <option value="visible">Visible</option>
          <option value="hidden">Hidden</option>
        </select>
      </div>

      {/* Bulk actions bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[var(--surface-raised)] border border-[var(--border-default)]">
          <span className="text-sm font-medium text-[var(--text-primary)]">
            {selectedIds.size} selected
          </span>
          <button
            onClick={selectNone}
            className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
          >
            Clear
          </button>
          <div className="flex-1" />
          <input
            type="text"
            value={bulkReason}
            onChange={(e) => setBulkReason(e.target.value)}
            placeholder="Reason (optional)..."
            className="h-8 px-2 w-40 rounded border border-[var(--border-default)] bg-[var(--surface-base)] text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent-primary)]"
          />
          <button
            onClick={() => handleBulkAction(false)}
            disabled={bulkActing}
            className="px-3 py-1.5 rounded-lg bg-red-50 text-red-700 text-xs font-semibold hover:bg-red-100 transition-colors disabled:opacity-50"
          >
            Hide Selected
          </button>
          <button
            onClick={() => handleBulkAction(true)}
            disabled={bulkActing}
            className="px-3 py-1.5 rounded-lg bg-green-50 text-green-700 text-xs font-semibold hover:bg-green-100 transition-colors disabled:opacity-50"
          >
            Show Selected
          </button>
        </div>
      )}

      {/* Product count + select all */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-[var(--text-tertiary)]">
          {filteredProducts.length} product{filteredProducts.length !== 1 ? 's' : ''}
          {search || typeFilter !== 'all' || visibilityFilter !== 'all' ? ' (filtered)' : ''}
        </p>
        <button
          onClick={selectedIds.size === filteredProducts.length ? selectNone : selectAll}
          className="text-xs text-[var(--accent-primary)] hover:underline"
        >
          {selectedIds.size === filteredProducts.length && filteredProducts.length > 0 ? 'Deselect all' : 'Select all'}
        </button>
      </div>

      {/* Product list */}
      <div className="rounded-xl border border-[var(--border-default)] overflow-hidden bg-[var(--surface-base)]">
        {/* Table header */}
        <div className="hidden sm:grid grid-cols-[40px_1fr_120px_80px_100px_40px] gap-3 px-4 py-2.5 bg-[var(--surface-raised)] border-b border-[var(--border-subtle)] text-[10px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider items-center">
          <div></div>
          <div>Product</div>
          <div>Type</div>
          <div className="text-right">Price</div>
          <div className="text-center">Status</div>
          <div></div>
        </div>

        {/* Rows */}
        <div className="divide-y divide-[var(--border-subtle)]">
          {filteredProducts.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-[var(--text-tertiary)]">
              No products match your filters.
            </div>
          ) : (
            filteredProducts.map((product) => {
              const override = overrides.get(product.id);
              const isVisible = override ? override.is_visible : true;
              const reason = override?.hidden_reason;
              const isToggling = togglingIds.has(product.id);
              const isSelected = selectedIds.has(product.id);
              const excludedByType = !product.passesTypeFilter;
              const isEditingReason = editingReasonId === product.id;

              return (
                <div
                  key={product.id}
                  className={`px-4 py-3 sm:grid sm:grid-cols-[40px_1fr_120px_80px_100px_40px] sm:gap-3 sm:items-center hover:bg-[var(--surface-raised)]/50 transition-colors ${
                    !isVisible ? 'opacity-60' : ''
                  }`}
                >
                  {/* Checkbox */}
                  <div className="hidden sm:flex items-center justify-center">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(product.id)}
                      className="rounded accent-[var(--accent-primary)]"
                    />
                  </div>

                  {/* Product name + details */}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                        {product.title}
                      </p>
                      {product.variantCount > 1 && (
                        <span className="shrink-0 text-[10px] text-[var(--text-tertiary)]">
                          {product.variantCount}v
                        </span>
                      )}
                    </div>
                    {/* Reason display / edit */}
                    {!isVisible && (
                      <div className="mt-0.5">
                        {isEditingReason ? (
                          <div className="flex items-center gap-1.5 mt-1">
                            <input
                              type="text"
                              value={editingReasonText}
                              onChange={(e) => setEditingReasonText(e.target.value)}
                              placeholder="Reason..."
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') updateReason(product.id, editingReasonText);
                                if (e.key === 'Escape') setEditingReasonId(null);
                              }}
                              className="h-6 px-1.5 w-36 rounded border border-[var(--border-default)] bg-[var(--surface-base)] text-[11px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent-primary)]"
                            />
                            <div className="flex gap-0.5">
                              {REASON_PRESETS.map((preset) => (
                                <button
                                  key={preset}
                                  onClick={() => { setEditingReasonText(preset); updateReason(product.id, preset); }}
                                  className="px-1.5 py-0.5 rounded text-[10px] bg-[var(--surface-raised)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
                                >
                                  {preset}
                                </button>
                              ))}
                            </div>
                            <button
                              onClick={() => updateReason(product.id, editingReasonText)}
                              className="text-[10px] text-[var(--accent-primary)] font-medium"
                            >
                              Save
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => { setEditingReasonId(product.id); setEditingReasonText(reason || ''); }}
                            className="text-[11px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] italic"
                          >
                            {reason ? `Reason: ${reason}` : 'Add reason...'}
                          </button>
                        )}
                      </div>
                    )}
                    {/* Excluded by type note */}
                    {excludedByType && isVisible && (
                      <p className="text-[10px] text-amber-600 mt-0.5">
                        Excluded by type filter — hidden from artists regardless
                      </p>
                    )}
                  </div>

                  {/* Type */}
                  <div className="hidden sm:block">
                    <span className="text-xs text-[var(--text-secondary)]">
                      {product.productType ? getDisplayType(product.productType) : 'No Type'}
                    </span>
                  </div>

                  {/* Price */}
                  <div className="hidden sm:block text-right">
                    <span className="text-xs text-[var(--text-secondary)]">
                      {product.minPrice > 0 ? `$${product.minPrice.toFixed(2)}` : ''}
                    </span>
                  </div>

                  {/* Status */}
                  <div className="hidden sm:flex items-center justify-center">
                    {isVisible ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-50 text-green-700 text-[10px] font-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                        Visible
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-50 text-red-600 text-[10px] font-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                        Hidden
                      </span>
                    )}
                  </div>

                  {/* Toggle button */}
                  <div className="hidden sm:flex items-center justify-center">
                    <button
                      onClick={() => toggleVisibility(product.id, !isVisible)}
                      disabled={isToggling}
                      title={isVisible ? 'Hide from catalog' : 'Show in catalog'}
                      className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors disabled:opacity-50 ${
                        isVisible
                          ? 'text-[var(--text-tertiary)] hover:text-red-600 hover:bg-red-50'
                          : 'text-[var(--text-tertiary)] hover:text-green-600 hover:bg-green-50'
                      }`}
                    >
                      {isVisible ? (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                        </svg>
                      )}
                    </button>
                  </div>

                  {/* Mobile: type + status + toggle */}
                  <div className="flex items-center justify-between sm:hidden mt-1.5 gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[var(--text-tertiary)]">
                        {product.productType ? getDisplayType(product.productType) : 'No Type'}
                      </span>
                      {isVisible ? (
                        <span className="text-[10px] text-green-700 font-medium">Visible</span>
                      ) : (
                        <span className="text-[10px] text-red-600 font-medium">Hidden</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(product.id)}
                        className="rounded accent-[var(--accent-primary)]"
                      />
                      <button
                        onClick={() => toggleVisibility(product.id, !isVisible)}
                        disabled={isToggling}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-medium min-h-[36px] transition-colors"
                        style={{
                          backgroundColor: isVisible ? 'rgba(239, 68, 68, 0.1)' : 'rgba(34, 197, 94, 0.1)',
                          color: isVisible ? 'rgb(185, 28, 28)' : 'rgb(21, 128, 61)',
                        }}
                      >
                        {isVisible ? 'Hide' : 'Show'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
