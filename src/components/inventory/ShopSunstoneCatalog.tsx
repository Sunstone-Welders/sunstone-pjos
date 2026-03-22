// ============================================================================
// Shop Sunstone Catalog Browser — src/components/inventory/ShopSunstoneCatalog.tsx
// ============================================================================
// Browsable, collection-organized product catalog reading from
// sunstone_catalog_cache. Collection filter pills, search, product card grid,
// and slide-in detail panel with variant list.
// ============================================================================

'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import type { SunstoneProduct } from '@/lib/shopify';
import { useCartStore } from '@/stores/cart-store';
import { isInventoryProduct, getDisplayType } from '@/lib/catalog-filter';

// ── Main Component ───────────────────────────────────────────────────────

export default function ShopSunstoneCatalog() {
  const supabase = createClient();
  const addItem = useCartStore((s) => s.addItem);
  const openCart = useCartStore((s) => s.openCart);

  const [products, setProducts] = useState<SunstoneProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [selectedCollection, setSelectedCollection] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<SunstoneProduct | null>(null);

  // ── Load catalog (once) ──────────────────────────────────────────────

  useEffect(() => {
    if (loaded) return;
    const loadCatalog = async () => {
      setLoading(true);
      try {
        const { data } = await supabase
          .from('sunstone_catalog_cache')
          .select('products')
          .limit(1)
          .single();

        if (data?.products) {
          const allActive = (data.products as SunstoneProduct[]).filter(
            (p) => p.status === 'ACTIVE'
          );

          const filtered = allActive.filter((p) => isInventoryProduct(p));

          filtered.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
          setProducts(filtered);
        }
      } catch {
        // catalog may not be synced
      } finally {
        setLoading(false);
        setLoaded(true);
      }
    };
    loadCatalog();
  }, [loaded, supabase]);

  // ── Derived: collections ─────────────────────────────────────────────

  const collections = useMemo(() => {
    const types = new Set<string>();
    for (const p of products) {
      const t = getDisplayType(p.productType);
      if (t) types.add(t);
    }
    const sorted = [...types].sort((a, b) => {
      // Chain first, then alphabetical
      if (a.toLowerCase().includes('chain')) return -1;
      if (b.toLowerCase().includes('chain')) return 1;
      return a.localeCompare(b);
    });
    return sorted;
  }, [products]);

  // ── Derived: filtered products ───────────────────────────────────────

  const filteredProducts = useMemo(() => {
    const q = search.toLowerCase().trim();
    return products.filter((p) => {
      // Collection filter
      if (selectedCollection !== 'all') {
        const pType = getDisplayType(p.productType);
        if (pType !== selectedCollection) return false;
      }
      // Search filter
      if (q) {
        const titleMatch = (p.title || '').toLowerCase().includes(q);
        const variantMatch = p.variants.some((v) =>
          (v.title || '').toLowerCase().includes(q)
        );
        if (!titleMatch && !variantMatch) return false;
      }
      return true;
    });
  }, [products, selectedCollection, search]);

  // ── Handle "Add" variant → add to cart

  const handleAddVariant = useCallback((product: SunstoneProduct, variantId: string) => {
    const variant = product.variants.find((v) => v.id === variantId);
    if (!variant) return;
    addItem({
      sunstoneProductId: product.id,
      sunstoneVariantId: variantId,
      productTitle: product.title,
      variantTitle: variant.title || 'Default Title',
      sku: variant.sku || null,
      unitPrice: parseFloat(variant.price),
      quantity: 1,
      productType: product.productType || '',
      imageUrl: product.imageUrl || null,
      inventoryItemId: null,
      inventoryVariantId: null,
    });
    toast.success(`${product.title} added to cart`);
    openCart();
  }, [addItem, openCart]);

  // ── Loading skeleton ─────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-6">
        {/* Skeleton pills */}
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-9 w-20 rounded-full bg-[var(--surface-raised)] animate-pulse" />
          ))}
        </div>
        {/* Skeleton search */}
        <div className="h-12 rounded-xl bg-[var(--surface-raised)] animate-pulse" />
        {/* Skeleton grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="rounded-xl border border-[var(--border-default)] overflow-hidden">
              <div className="aspect-square bg-[var(--surface-raised)] animate-pulse" />
              <div className="p-4 space-y-2">
                <div className="h-4 w-3/4 rounded bg-[var(--surface-raised)] animate-pulse" />
                <div className="h-3 w-1/2 rounded bg-[var(--surface-raised)] animate-pulse" />
                <div className="h-3 w-1/3 rounded bg-[var(--surface-raised)] animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Empty catalog ────────────────────────────────────────────────────

  if (products.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-16 h-16 rounded-full bg-[var(--surface-raised)] flex items-center justify-center mb-4">
          <svg className="w-8 h-8 text-[var(--text-tertiary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.625 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
          </svg>
        </div>
        <p className="text-lg font-semibold text-[var(--text-primary)]">No Sunstone products available</p>
        <p className="text-sm text-[var(--text-tertiary)] mt-1 max-w-sm">
          Products will appear here once the catalog syncs.
        </p>
      </div>
    );
  }

  // ── Main render ──────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Collection filter pills */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide" style={{ WebkitOverflowScrolling: 'touch' }}>
        <button
          onClick={() => setSelectedCollection('all')}
          className={`shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors min-h-[40px] ${
            selectedCollection === 'all'
              ? 'bg-[var(--accent-primary)] text-white'
              : 'bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)]'
          }`}
        >
          All
        </button>
        {collections.map((col) => (
          <button
            key={col}
            onClick={() => setSelectedCollection(col)}
            className={`shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors min-h-[40px] ${
              selectedCollection === col
                ? 'bg-[var(--accent-primary)] text-white'
                : 'bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)]'
            }`}
          >
            {col}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-tertiary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
        </svg>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search products..."
          className="w-full h-12 pl-10 pr-4 rounded-xl border border-[var(--border-default)] bg-[var(--surface-base)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent-primary)] focus:ring-2 focus:ring-[var(--accent-subtle)]"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Empty search/filter state */}
      {filteredProducts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-sm text-[var(--text-tertiary)]">No products match your search.</p>
          <button
            onClick={() => { setSearch(''); setSelectedCollection('all'); }}
            className="mt-2 text-sm font-medium text-[var(--accent-primary)] hover:underline"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <>
          {/* Product count */}
          <p className="text-xs text-[var(--text-tertiary)]">
            {filteredProducts.length} product{filteredProducts.length !== 1 ? 's' : ''}
          </p>

          {/* Product grid */}
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredProducts.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                onViewDetails={() => setSelectedProduct(product)}
              />
            ))}
          </div>
        </>
      )}

      {/* Product detail panel (slide-in) */}
      {selectedProduct && (
        <ProductDetailPanel
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
          onAddVariant={(variantId) => handleAddVariant(selectedProduct, variantId)}
        />
      )}
    </div>
  );
}

// ── Product Card ─────────────────────────────────────────────────────────

function ProductCard({
  product,
  onViewDetails,
}: {
  product: SunstoneProduct;
  onViewDetails: () => void;
}) {
  const variants = product.variants || [];
  const prices = variants.map((v) => parseFloat(v.price)).filter((p) => p > 0);
  const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
  const maxPrice = prices.length > 0 ? Math.max(...prices) : 0;
  const allSamePrice = minPrice === maxPrice;
  const variantCount = variants.filter((v) => v.title !== 'Default Title').length;

  // Derive a subtitle from the product type or first variant material
  const subtitle = getDisplayType(product.productType) || '';

  return (
    <div
      className="rounded-xl border border-[var(--border-default)] bg-[var(--surface-base)] overflow-hidden hover:border-[var(--border-strong)] transition-colors cursor-pointer group"
      onClick={onViewDetails}
    >
      {/* Image */}
      <div className="aspect-square relative bg-[var(--surface-raised)] overflow-hidden">
        {product.imageUrl ? (
          <Image
            src={product.imageUrl}
            alt={product.imageAlt || product.title}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-3xl font-semibold text-[var(--text-tertiary)] opacity-30">
              {product.title.charAt(0).toUpperCase()}
            </span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-3 sm:p-4">
        <h3 className="text-sm font-semibold text-[var(--text-primary)] truncate">
          {product.title}
        </h3>
        {subtitle && (
          <p className="text-xs text-[var(--text-tertiary)] mt-0.5 truncate">{subtitle}</p>
        )}
        <div className="mt-2 flex items-baseline gap-1">
          <span className="text-sm font-semibold text-[var(--text-primary)]">
            {minPrice > 0
              ? allSamePrice
                ? `$${minPrice.toFixed(2)}`
                : `From $${minPrice.toFixed(2)}`
              : ''}
          </span>
        </div>
        {variantCount > 1 && (
          <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
            {variantCount} variants
          </p>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onViewDetails(); }}
          className="mt-3 w-full py-2 rounded-lg border border-[var(--border-default)] text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-raised)] transition-colors min-h-[40px]"
        >
          View Details
        </button>
      </div>
    </div>
  );
}

// ── Product Detail Panel (slide-in from right) ──────────────────────────

function ProductDetailPanel({
  product,
  onClose,
  onAddVariant,
}: {
  product: SunstoneProduct;
  onClose: () => void;
  onAddVariant: (variantId: string) => void;
}) {
  const isChain = (product.productType || '').toLowerCase().includes('chain');
  const variants = product.variants || [];

  // Group chain variants by material
  const variantGroups = useMemo(() => {
    if (!isChain || variants.length <= 1) return null;

    const groups = new Map<string, typeof variants>();
    for (const v of variants) {
      if (!v.title || v.title === 'Default Title') continue;
      const material = v.title.split(' / ')[0].trim();
      if (!groups.has(material)) groups.set(material, []);
      groups.get(material)!.push(v);
    }
    return groups.size > 1 ? groups : null;
  }, [isChain, variants]);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-[440px] bg-[var(--surface-base)] shadow-xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-default)]">
          <h2 className="text-lg font-semibold text-[var(--text-primary)] truncate pr-4">
            {product.title}
          </h2>
          <button
            onClick={onClose}
            className="shrink-0 p-2 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-raised)] transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">
          {/* Image */}
          {product.imageUrl ? (
            <div className="relative aspect-square bg-[var(--surface-raised)]">
              <Image
                src={product.imageUrl}
                alt={product.imageAlt || product.title}
                fill
                sizes="440px"
                className="object-cover"
                priority
              />
            </div>
          ) : (
            <div className="aspect-[3/2] bg-[var(--surface-raised)] flex items-center justify-center">
              <span className="text-5xl font-semibold text-[var(--text-tertiary)] opacity-20">
                {product.title.charAt(0).toUpperCase()}
              </span>
            </div>
          )}

          <div className="px-5 py-4 space-y-4">
            {/* Type badge */}
            {product.productType && (
              <span className="inline-block px-2.5 py-1 rounded-full bg-[var(--surface-raised)] text-xs font-medium text-[var(--text-secondary)]">
                {getDisplayType(product.productType)}
              </span>
            )}

            {/* Description */}
            {product.description && (
              <p className="text-sm text-[var(--text-secondary)] leading-relaxed whitespace-pre-line">
                {product.description}
              </p>
            )}

            {/* Variants */}
            <div>
              <h3 className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mb-2">
                {variantGroups ? 'Options' : variants.length > 1 ? 'Variants' : 'Pricing'}
              </h3>

              {variantGroups ? (
                // Chain: grouped by material
                <div className="space-y-4">
                  {[...variantGroups.entries()].map(([material, group]) => (
                    <div key={material}>
                      <p className="text-xs font-medium text-[var(--text-secondary)] mb-1.5">{material}</p>
                      <div className="space-y-1">
                        {group.map((v) => {
                          const lengthPart = v.title.split(' / ').slice(1).join(' / ') || v.title;
                          return (
                            <VariantRow
                              key={v.id}
                              label={lengthPart}
                              price={v.price}
                              compareAtPrice={v.compareAtPrice}
                              sku={v.sku}
                              onAdd={() => onAddVariant(v.id)}
                            />
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                // Non-chain or single-material: flat list
                <div className="space-y-1">
                  {variants.map((v) => (
                    <VariantRow
                      key={v.id}
                      label={v.title === 'Default Title' ? product.title : v.title}
                      price={v.price}
                      compareAtPrice={v.compareAtPrice}
                      sku={v.sku}
                      onAdd={() => onAddVariant(v.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Variant Row ──────────────────────────────────────────────────────────

function VariantRow({
  label,
  price,
  compareAtPrice,
  sku,
  onAdd,
}: {
  label: string;
  price: string;
  compareAtPrice: string | null;
  sku: string | null;
  onAdd: () => void;
}) {
  const parsedPrice = parseFloat(price);
  const parsedCompare = compareAtPrice ? parseFloat(compareAtPrice) : null;
  const onSale = parsedCompare && parsedCompare > parsedPrice;

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-[var(--surface-raised)] min-h-[48px]">
      <div className="flex-1 min-w-0">
        <p className="text-sm text-[var(--text-primary)] truncate">{label}</p>
        {sku && (
          <p className="text-[10px] text-[var(--text-tertiary)] truncate">SKU: {sku}</p>
        )}
      </div>
      <div className="shrink-0 text-right mr-2">
        <span className="text-sm font-semibold text-[var(--text-primary)]">
          ${parsedPrice.toFixed(2)}
        </span>
        {onSale && (
          <span className="ml-1.5 text-xs text-[var(--text-tertiary)] line-through">
            ${parsedCompare!.toFixed(2)}
          </span>
        )}
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onAdd(); }}
        className="shrink-0 px-3 py-1.5 rounded-lg bg-[var(--accent-primary)] text-white text-xs font-semibold hover:opacity-90 transition-opacity min-h-[36px]"
      >
        Add
      </button>
    </div>
  );
}

