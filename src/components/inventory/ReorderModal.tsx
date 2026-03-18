// ============================================================================
// Reorder Modal — src/components/inventory/ReorderModal.tsx
// ============================================================================
// Modal for reordering supplies from Sunstone via Shopify draft orders.
// Shows product info from catalog cache, smart quantity suggestion,
// and creates a draft order with checkout link.
// ============================================================================

'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useTenant } from '@/hooks/use-tenant';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '@/components/ui/Modal';
import type { InventoryItem } from '@/types';
import type { SunstoneProduct } from '@/lib/shopify';

interface ReorderModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: InventoryItem;
  onReorderCreated?: () => void;
}

interface OrderResult {
  orderName: string;
  invoiceUrl: string;
  totalAmount: number;
  lineItems: { title: string; quantity: number; unitPrice: number }[];
}

export default function ReorderModal({ isOpen, onClose, item, onReorderCreated }: ReorderModalProps) {
  const { tenant } = useTenant();
  const supabase = createClient();

  const [product, setProduct] = useState<SunstoneProduct | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedVariantIdx, setSelectedVariantIdx] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [placing, setPlacing] = useState(false);
  const [result, setResult] = useState<OrderResult | null>(null);

  // Load product from catalog cache
  useEffect(() => {
    if (!isOpen || !item.sunstone_product_id) return;

    const loadProduct = async () => {
      setLoading(true);
      setResult(null);
      try {
        const { data: cache } = await supabase
          .from('sunstone_catalog_cache')
          .select('products')
          .limit(1)
          .single();

        if (cache?.products) {
          const products = cache.products as SunstoneProduct[];
          const match = products.find((p) => p.id === item.sunstone_product_id);
          if (match) {
            setProduct(match);
            setSelectedVariantIdx(0);
            // Smart quantity suggestion
            suggestQuantity(match);
          } else {
            setProduct(null);
          }
        }
      } catch {
        setProduct(null);
      } finally {
        setLoading(false);
      }
    };

    loadProduct();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, item.sunstone_product_id]);

  // Smart quantity suggestion based on sales data
  const suggestQuantity = async (p: SunstoneProduct) => {
    if (!tenant) return;
    try {
      // Check last 30 days of sales for this item
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data: movements } = await supabase
        .from('inventory_movements')
        .select('quantity')
        .eq('inventory_item_id', item.id)
        .eq('type', 'sale')
        .gte('created_at', thirtyDaysAgo);

      if (movements && movements.length > 0) {
        const totalSold = movements.reduce((sum, m) => sum + Math.abs(m.quantity), 0);
        const dailyAvg = totalSold / 30;
        const suggested = Math.ceil(dailyAvg * 30); // 30-day reorder
        if (suggested > 0) {
          setQuantity(suggested);
          return;
        }
      }

      // Fallback: check last reorder quantity
      const { data: lastReorder } = await supabase
        .from('reorder_history')
        .select('items')
        .eq('tenant_id', tenant.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (lastReorder?.items) {
        const items = lastReorder.items as any[];
        const prev = items.find((i) => i.inventory_item_id === item.id);
        if (prev?.quantity) {
          setQuantity(prev.quantity);
          return;
        }
      }

      // Final fallback: sensible defaults
      if (item.type === 'chain') {
        setQuantity(100);
      } else if (item.type === 'jump_ring') {
        setQuantity(50);
      } else {
        setQuantity(10);
      }
    } catch {
      setQuantity(item.type === 'chain' ? 100 : 10);
    }
  };

  const selectedVariant = product?.variants?.[selectedVariantIdx];
  const unitPrice = selectedVariant ? parseFloat(selectedVariant.price) : 0;
  const estimatedTotal = unitPrice * quantity;

  const handlePlaceOrder = async () => {
    if (!product || !selectedVariant) return;
    setPlacing(true);

    try {
      const res = await fetch('/api/shopify/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [{
            variantId: selectedVariant.id,
            quantity,
            inventoryItemId: item.id,
            name: `${product.title}${selectedVariant.title !== 'Default Title' ? ` — ${selectedVariant.title}` : ''}`,
            unitPrice,
          }],
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.needsReauth) {
          toast.error('Shopify needs re-authorization. Ask your platform admin to reconnect at /api/shopify/auth.');
        } else {
          toast.error(data.error || 'Failed to create order');
        }
        return;
      }

      setResult({
        orderName: data.orderName,
        invoiceUrl: data.invoiceUrl,
        totalAmount: data.totalAmount,
        lineItems: data.lineItems,
      });

      toast.success(`Order ${data.orderName} created!`);
      onReorderCreated?.();
    } catch {
      toast.error('Failed to create order');
    } finally {
      setPlacing(false);
    }
  };

  const handleClose = () => {
    setResult(null);
    setProduct(null);
    setLoading(true);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} size="md">
      <ModalHeader>
        <h2 className="text-lg font-bold text-[var(--text-primary)] font-display">
          Reorder from Sunstone
        </h2>
        <p className="text-sm text-[var(--text-secondary)] mt-1">{item.name}</p>
      </ModalHeader>

      <ModalBody className="space-y-5">
        {loading ? (
          <div className="py-12 text-center">
            <div className="w-6 h-6 border-2 border-[var(--accent-primary)] border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-sm text-[var(--text-tertiary)] mt-3">Loading product...</p>
          </div>
        ) : !product ? (
          <div className="py-8 text-center space-y-3">
            <p className="text-sm text-[var(--text-secondary)]">
              Product not found in catalog. The catalog may need to be synced.
            </p>
            <p className="text-xs text-[var(--text-tertiary)]">
              Shopify Product ID: {item.sunstone_product_id}
            </p>
          </div>
        ) : result ? (
          /* ── Success state ───────────────────────────────────────── */
          <div className="text-center space-y-4 py-4">
            <div className="w-14 h-14 rounded-full mx-auto flex items-center justify-center bg-green-50">
              <svg className="w-7 h-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
            <div>
              <p className="text-lg font-bold text-[var(--text-primary)]">Order Created!</p>
              <p className="text-sm text-[var(--text-secondary)]">{result.orderName}</p>
            </div>
            {result.lineItems.map((li, i) => (
              <div key={i} className="text-sm text-[var(--text-secondary)]">
                {li.title} x {li.quantity} — ${li.unitPrice.toFixed(2)} each
              </div>
            ))}
            <p className="text-lg font-bold" style={{ color: 'var(--accent-primary)' }}>
              Total: ${result.totalAmount.toFixed(2)}
            </p>
            <a
              href={result.invoiceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-white font-semibold text-base min-h-[48px] transition-colors"
              style={{ backgroundColor: '#7A234A' }}
            >
              Complete Checkout
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
              </svg>
            </a>
            <p className="text-xs text-[var(--text-tertiary)]">
              You&apos;ll complete payment on the Sunstone store
            </p>
          </div>
        ) : (
          /* ── Order form ──────────────────────────────────────────── */
          <>
            {/* Product card */}
            <div className="flex gap-4 items-start">
              {product.imageUrl ? (
                <img
                  src={product.imageUrl}
                  alt={product.title}
                  className="w-20 h-20 rounded-xl object-cover flex-shrink-0 bg-[var(--surface-raised)]"
                />
              ) : (
                <div className="w-20 h-20 rounded-xl bg-[var(--surface-raised)] flex items-center justify-center flex-shrink-0">
                  <svg className="w-8 h-8 text-[var(--text-tertiary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                  </svg>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-[var(--text-primary)] truncate">{product.title}</p>
                <p className="text-sm text-[var(--text-secondary)] mt-0.5">
                  {product.productType || 'Supply'}
                </p>
                {product.description && (
                  <p className="text-xs text-[var(--text-tertiary)] mt-1 line-clamp-2">
                    {product.description.slice(0, 120)}
                  </p>
                )}
              </div>
            </div>

            {/* Current stock */}
            <div className="bg-[var(--surface-raised)] rounded-xl p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-[var(--text-secondary)]">Current stock</span>
                <span className={`text-sm font-semibold ${
                  item.quantity_on_hand <= item.reorder_threshold
                    ? 'text-red-600'
                    : 'text-[var(--text-primary)]'
                }`}>
                  {item.quantity_on_hand} {item.unit}
                </span>
              </div>
              {item.reorder_threshold > 0 && (
                <div className="flex items-center justify-between mt-1">
                  <span className="text-xs text-[var(--text-tertiary)]">Reorder threshold</span>
                  <span className="text-xs text-[var(--text-tertiary)]">{item.reorder_threshold} {item.unit}</span>
                </div>
              )}
            </div>

            {/* Variant selector (if multiple) */}
            {product.variants.length > 1 && (
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">
                  Variant
                </label>
                <select
                  value={selectedVariantIdx}
                  onChange={(e) => setSelectedVariantIdx(Number(e.target.value))}
                  className="w-full rounded-xl border border-[var(--border-default)] bg-[var(--surface-base)] px-4 py-3 text-sm text-[var(--text-primary)] min-h-[48px]"
                >
                  {product.variants.map((v, i) => (
                    <option key={i} value={i}>
                      {v.title} — ${parseFloat(v.price).toFixed(2)}
                      {v.sku ? ` (${v.sku})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Quantity */}
            <div>
              <Input
                label="Quantity"
                type="number"
                min={1}
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                className="text-lg"
              />
              <p className="text-xs text-[var(--text-tertiary)] mt-1">
                ${unitPrice.toFixed(2)} per unit
              </p>
            </div>

            {/* Estimated total */}
            <div className="bg-[var(--surface-raised)] rounded-xl p-4 flex items-center justify-between">
              <span className="text-sm font-medium text-[var(--text-secondary)]">Estimated total</span>
              <span className="text-xl font-bold" style={{ color: 'var(--accent-primary)' }}>
                ${estimatedTotal.toFixed(2)}
              </span>
            </div>

            {/* Store link */}
            <a
              href={product.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] underline underline-offset-2"
            >
              View on Sunstone Store
            </a>
          </>
        )}
      </ModalBody>

      {!loading && product && !result && (
        <ModalFooter>
          <Button variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={handlePlaceOrder}
            loading={placing}
            className="text-white font-semibold"
            style={{ backgroundColor: '#7A234A' }}
          >
            {placing ? 'Placing Order...' : 'Place Order'}
          </Button>
        </ModalFooter>
      )}

      {result && (
        <ModalFooter>
          <Button variant="secondary" onClick={handleClose}>
            Done
          </Button>
        </ModalFooter>
      )}
    </Modal>
  );
}
