// ============================================================================
// Reorder Modal — src/components/inventory/ReorderModal.tsx
// ============================================================================
// Multi-step modal for reordering supplies from Sunstone:
// 1. Cart Review (product, variant, quantity, shipping, totals)
// 2. Payment (Stripe PaymentElement — in-app card entry)
// 3. Processing (Stripe → SF Opp + Quote)
// 4. Confirmation (order summary, SF reference)
// ============================================================================

'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useTenant } from '@/hooks/use-tenant';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '@/components/ui/Modal';
import StripeReorderProvider from '@/components/providers/StripeReorderProvider';
import { PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import type { InventoryItem } from '@/types';
import type { SunstoneProduct } from '@/lib/shopify';

// ── Types ─────────────────────────────────────────────────────────────────

interface ReorderModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: InventoryItem;
  onReorderCreated?: () => void;
}

type CheckoutStep = 'review' | 'payment' | 'processing' | 'confirmation';

interface ShippingAddress {
  street: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

interface SfResult {
  opportunityId: string;
  quoteId: string;
  opportunityName: string;
  tax: number;
  shipping: number;
  grandTotal: number;
}

// ── Main Component ────────────────────────────────────────────────────────

export default function ReorderModal({ isOpen, onClose, item, onReorderCreated }: ReorderModalProps) {
  const { tenant } = useTenant();
  const supabase = createClient();

  // Product
  const [product, setProduct] = useState<SunstoneProduct | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedVariantIdx, setSelectedVariantIdx] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [needsResync, setNeedsResync] = useState(false);
  const [resyncing, setResyncing] = useState(false);

  // Checkout flow
  const [step, setStep] = useState<CheckoutStep>('review');
  const [shippingAddress, setShippingAddress] = useState<ShippingAddress>({
    street: '', city: '', state: '', postalCode: '', country: 'US',
  });
  const [loadingAddress, setLoadingAddress] = useState(false);

  // Payment
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [reorderId, setReorderId] = useState<string | null>(null);
  const [creatingIntent, setCreatingIntent] = useState(false);
  const [totals, setTotals] = useState({ subtotal: 0, tax: 0, shipping: 0, total: 0 });

  // SF result
  const [sfResult, setSfResult] = useState<SfResult | null>(null);
  const [processingMsg, setProcessingMsg] = useState('');

  // ── Load product from catalog cache ──────────────────────────────────

  useEffect(() => {
    if (!isOpen || !item.sunstone_product_id) return;

    const loadProduct = async () => {
      setLoading(true);
      setStep('review');
      setClientSecret(null);
      setSfResult(null);
      setNeedsResync(false);
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
            const hasVariantIds = match.variants.some((v) => !!v.id);
            if (!hasVariantIds && match.variants.length > 0) {
              setNeedsResync(true);
              setProduct(null);
            } else {
              setProduct(match);
              setSelectedVariantIdx(0);
              suggestQuantity(match);
            }
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

  // ── Load SF shipping address ─────────────────────────────────────────

  useEffect(() => {
    if (!isOpen) return;
    const loadAddress = async () => {
      setLoadingAddress(true);
      try {
        const res = await fetch('/api/salesforce/match-account');
        if (res.ok) {
          const data = await res.json();
          if (data.matched && data.shippingAddress) {
            setShippingAddress(data.shippingAddress);
          }
        }
      } catch { /* non-critical */ }
      setLoadingAddress(false);
    };
    loadAddress();
  }, [isOpen]);

  // ── Smart quantity suggestion ────────────────────────────────────────

  const suggestQuantity = async (p: SunstoneProduct) => {
    if (!tenant) return;
    try {
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
      setQuantity(1);
    } catch {
      setQuantity(1);
    }
  };

  // ── Helpers ──────────────────────────────────────────────────────────

  const selectedVariant = product?.variants?.[selectedVariantIdx];
  const unitPrice = selectedVariant ? parseFloat(selectedVariant.price) : 0;
  const estimatedSubtotal = unitPrice * quantity;

  const handleResync = async () => {
    setResyncing(true);
    try {
      const res = await fetch('/api/shopify/sync?force=true');
      if (res.ok) {
        toast.success('Catalog synced — reloading product...');
        setNeedsResync(false);
        setLoading(true);
        const { data: cache } = await supabase
          .from('sunstone_catalog_cache')
          .select('products')
          .limit(1)
          .single();
        if (cache?.products) {
          const products = cache.products as SunstoneProduct[];
          const match = products.find((p) => p.id === item.sunstone_product_id);
          if (match && match.variants.some((v) => !!v.id)) {
            setProduct(match);
            setSelectedVariantIdx(0);
            suggestQuantity(match);
          } else {
            setProduct(null);
            toast.error('Product still missing variant data after sync.');
          }
        }
        setLoading(false);
      } else {
        const data = await res.json();
        toast.error(data.error || 'Catalog sync failed');
      }
    } catch {
      toast.error('Catalog sync failed');
    } finally {
      setResyncing(false);
    }
  };

  // ── Step 1 → 2: Create PaymentIntent ─────────────────────────────────

  const handleContinueToPayment = async () => {
    if (!product || !selectedVariant) return;

    if (!shippingAddress.street || !shippingAddress.city || !shippingAddress.state || !shippingAddress.postalCode) {
      toast.error('Please fill in your shipping address.');
      return;
    }

    setCreatingIntent(true);
    try {
      const variantLabel = selectedVariant.title !== 'Default Title' ? ` — ${selectedVariant.title}` : '';

      const res = await fetch('/api/reorders/create-payment-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [{
            inventoryItemId: item.id,
            variantId: selectedVariant.id || selectedVariant.sku || '',
            name: `${product.title}${variantLabel}`,
            quantity,
            unitPrice,
          }],
          shippingAddress,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Failed to create payment');
        return;
      }

      setClientSecret(data.clientSecret);
      setPaymentIntentId(data.paymentIntentId);
      setReorderId(data.reorderId);
      setTotals({
        subtotal: data.subtotal,
        tax: data.tax,
        shipping: data.shipping,
        total: data.total,
      });
      setStep('payment');
    } catch {
      toast.error('Failed to create payment');
    } finally {
      setCreatingIntent(false);
    }
  };

  // ── Step 3: After payment succeeds → create SF records ───────────────

  const handlePaymentSuccess = useCallback(async () => {
    if (!reorderId || !paymentIntentId) return;

    setStep('processing');
    setProcessingMsg('Processing payment...');

    // Small delay for UX
    await new Promise((r) => setTimeout(r, 800));
    setProcessingMsg('Creating your order in Salesforce...');

    try {
      const res = await fetch('/api/salesforce/create-reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reorderId, stripePaymentIntentId: paymentIntentId }),
      });

      const data = await res.json();

      if (data.success) {
        setProcessingMsg('Order confirmed!');
        setSfResult({
          opportunityId: data.opportunityId || '',
          quoteId: data.quoteId || '',
          opportunityName: data.opportunityName || '',
          tax: data.tax || 0,
          shipping: data.shipping || 0,
          grandTotal: data.grandTotal || totals.total,
        });
        await new Promise((r) => setTimeout(r, 600));
        setStep('confirmation');
        onReorderCreated?.();
        toast.success('Order confirmed!');
      } else if (data.warning) {
        // Payment succeeded but SF had issues — still show confirmation
        setProcessingMsg('Payment received!');
        setSfResult(null);
        await new Promise((r) => setTimeout(r, 600));
        setStep('confirmation');
        onReorderCreated?.();
        toast.success('Payment received — order being processed.');
      } else {
        toast.error(data.error || 'Failed to create Salesforce order');
        // Still move to confirmation since payment went through
        setStep('confirmation');
        onReorderCreated?.();
      }
    } catch {
      toast.error('Order creation had an issue — payment was successful, order will be reconciled.');
      setStep('confirmation');
      onReorderCreated?.();
    }
  }, [reorderId, paymentIntentId, totals.total, onReorderCreated]);

  // ── Close / reset ────────────────────────────────────────────────────

  const handleClose = () => {
    setStep('review');
    setProduct(null);
    setNeedsResync(false);
    setLoading(true);
    setClientSecret(null);
    setPaymentIntentId(null);
    setReorderId(null);
    setSfResult(null);
    setProcessingMsg('');
    onClose();
  };

  // ── Render ───────────────────────────────────────────────────────────

  return (
    <Modal isOpen={isOpen} onClose={handleClose} size="md">
      <ModalHeader>
        <h2 className="text-lg font-bold text-[var(--text-primary)] font-display">
          {step === 'review' && 'Reorder from Sunstone'}
          {step === 'payment' && 'Payment'}
          {step === 'processing' && 'Processing...'}
          {step === 'confirmation' && 'Order Confirmed'}
        </h2>
        {step === 'review' && (
          <p className="text-sm text-[var(--text-secondary)] mt-1">{item.name}</p>
        )}
      </ModalHeader>

      <ModalBody className="space-y-5">
        {/* ── Loading state ─────────────────────────────────────────── */}
        {loading && step === 'review' ? (
          <div className="py-12 text-center">
            <div className="w-6 h-6 border-2 border-[var(--accent-primary)] border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-sm text-[var(--text-tertiary)] mt-3">Loading product...</p>
          </div>

        ) : !product && step === 'review' ? (
          /* ── No product / needs resync ────────────────────────────── */
          <div className="py-8 text-center space-y-3">
            <p className="text-sm text-[var(--text-secondary)]">
              {needsResync
                ? 'The Shopify catalog needs to be re-synced to include product variant data.'
                : 'Product not found in catalog. The catalog may need to be synced.'}
            </p>
            <Button variant="secondary" size="sm" onClick={handleResync} loading={resyncing}>
              {resyncing ? 'Syncing...' : 'Re-sync Catalog'}
            </Button>
            <p className="text-xs text-[var(--text-tertiary)]">
              Shopify Product ID: {item.sunstone_product_id}
            </p>
          </div>

        ) : step === 'review' && product ? (
          /* ── Step 1: Cart Review ──────────────────────────────────── */
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
                <p className="text-sm text-[var(--text-secondary)] mt-0.5">{product.productType || 'Supply'}</p>
                {product.description && (
                  <p className="text-xs text-[var(--text-tertiary)] mt-1 line-clamp-2">{product.description.slice(0, 120)}</p>
                )}
              </div>
            </div>

            {/* Current stock */}
            <div className="bg-[var(--surface-raised)] rounded-xl p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-[var(--text-secondary)]">Current stock</span>
                <span className={`text-sm font-semibold ${
                  item.quantity_on_hand <= item.reorder_threshold ? 'text-red-600' : 'text-[var(--text-primary)]'
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

            {/* Variant selector */}
            {product.variants.length > 1 && (
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">Variant</label>
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
              <p className="text-xs text-[var(--text-tertiary)] mt-1">${unitPrice.toFixed(2)} per unit</p>
            </div>

            {/* Shipping address */}
            <div className="space-y-3">
              <label className="block text-sm font-medium text-[var(--text-secondary)]">
                Shipping Address
                {loadingAddress && <span className="text-xs text-[var(--text-tertiary)] ml-2">Loading...</span>}
              </label>
              <Input
                placeholder="Street address"
                value={shippingAddress.street}
                onChange={(e) => setShippingAddress((a) => ({ ...a, street: e.target.value }))}
              />
              <div className="grid grid-cols-2 gap-3">
                <Input
                  placeholder="City"
                  value={shippingAddress.city}
                  onChange={(e) => setShippingAddress((a) => ({ ...a, city: e.target.value }))}
                />
                <Input
                  placeholder="State"
                  value={shippingAddress.state}
                  onChange={(e) => setShippingAddress((a) => ({ ...a, state: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input
                  placeholder="ZIP code"
                  value={shippingAddress.postalCode}
                  onChange={(e) => setShippingAddress((a) => ({ ...a, postalCode: e.target.value }))}
                />
                <Input
                  placeholder="Country"
                  value={shippingAddress.country}
                  onChange={(e) => setShippingAddress((a) => ({ ...a, country: e.target.value }))}
                />
              </div>
            </div>

            {/* Totals */}
            <div className="bg-[var(--surface-raised)] rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-[var(--text-secondary)]">Subtotal</span>
                <span className="text-sm font-medium text-[var(--text-primary)]">${estimatedSubtotal.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between text-xs text-[var(--text-tertiary)]">
                <span>Tax + shipping calculated at checkout</span>
              </div>
            </div>

            {/* Store link */}
            {product.url && (
              <a
                href={product.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] underline underline-offset-2"
              >
                View on Sunstone Store
              </a>
            )}
          </>

        ) : step === 'payment' && clientSecret ? (
          /* ── Step 2: Payment ──────────────────────────────────────── */
          <StripeReorderProvider clientSecret={clientSecret}>
            <PaymentStep
              total={totals.total}
              subtotal={totals.subtotal}
              tax={totals.tax}
              shipping={totals.shipping}
              onSuccess={handlePaymentSuccess}
              onBack={() => setStep('review')}
            />
          </StripeReorderProvider>

        ) : step === 'processing' ? (
          /* ── Step 3: Processing ───────────────────────────────────── */
          <div className="py-12 text-center">
            <div className="w-8 h-8 border-2 border-[var(--accent-primary)] border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-sm text-[var(--text-secondary)] mt-4">{processingMsg}</p>
          </div>

        ) : step === 'confirmation' ? (
          /* ── Step 4: Confirmation ─────────────────────────────────── */
          <div className="text-center space-y-4 py-4">
            <div className="w-14 h-14 rounded-full mx-auto flex items-center justify-center bg-green-50">
              <svg className="w-7 h-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
            <div>
              <p className="text-lg font-bold text-[var(--text-primary)]">Order Confirmed!</p>
              {sfResult?.opportunityName && (
                <p className="text-sm text-[var(--text-secondary)]">{sfResult.opportunityName}</p>
              )}
            </div>

            {product && selectedVariant && (
              <div className="text-sm text-[var(--text-secondary)]">
                {product.title}
                {selectedVariant.title !== 'Default Title' ? ` — ${selectedVariant.title}` : ''}
                {' x '}{quantity} — ${unitPrice.toFixed(2)} each
              </div>
            )}

            <div className="bg-[var(--surface-raised)] rounded-xl p-4 space-y-2 text-sm text-left">
              <div className="flex justify-between">
                <span className="text-[var(--text-secondary)]">Subtotal</span>
                <span className="text-[var(--text-primary)]">${(sfResult?.grandTotal ? (sfResult.grandTotal - sfResult.tax - sfResult.shipping) : totals.subtotal).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-secondary)]">Tax</span>
                <span className="text-[var(--text-primary)]">${(sfResult?.tax ?? totals.tax).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-secondary)]">Shipping</span>
                <span className="text-[var(--text-primary)]">${(sfResult?.shipping ?? totals.shipping).toFixed(2)}</span>
              </div>
              <div className="flex justify-between border-t border-[var(--border-subtle)] pt-2">
                <span className="font-semibold text-[var(--text-primary)]">Total charged</span>
                <span className="font-bold" style={{ color: 'var(--accent-primary)' }}>
                  ${(sfResult?.grandTotal ?? totals.total).toFixed(2)}
                </span>
              </div>
            </div>

            {shippingAddress.street && (
              <div className="text-xs text-[var(--text-tertiary)]">
                Shipping to: {shippingAddress.street}, {shippingAddress.city}, {shippingAddress.state} {shippingAddress.postalCode}
              </div>
            )}

            <div className="space-y-1">
              <p className="text-sm text-[var(--text-secondary)]">
                We&apos;ll notify you when your order ships.
              </p>
              <p className="text-xs text-[var(--text-tertiary)]">
                Estimated shipping: 1-2 business days
              </p>
            </div>
          </div>
        ) : null}
      </ModalBody>

      {/* ── Footer ──────────────────────────────────────────────────── */}
      {step === 'review' && !loading && product && (
        <ModalFooter>
          <Button variant="secondary" onClick={handleClose}>Cancel</Button>
          <Button
            onClick={handleContinueToPayment}
            loading={creatingIntent}
            className="text-white font-semibold"
            style={{ backgroundColor: '#7A234A' }}
          >
            {creatingIntent ? 'Preparing...' : 'Continue to Payment'}
          </Button>
        </ModalFooter>
      )}

      {step === 'confirmation' && (
        <ModalFooter>
          <Button variant="secondary" onClick={handleClose}>Done</Button>
        </ModalFooter>
      )}
    </Modal>
  );
}

// ============================================================================
// Payment Step (inner component — needs Stripe context from Elements)
// ============================================================================

interface PaymentStepProps {
  total: number;
  subtotal: number;
  tax: number;
  shipping: number;
  onSuccess: () => void;
  onBack: () => void;
}

function PaymentStep({ total, subtotal, tax, shipping, onSuccess, onBack }: PaymentStepProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setPaying(true);
    setError(null);

    const result = await stripe.confirmPayment({
      elements,
      redirect: 'if_required',
    });

    if (result.error) {
      setError(result.error.message || 'Payment failed');
      setPaying(false);
    } else if (result.paymentIntent?.status === 'succeeded') {
      onSuccess();
    } else {
      setError('Payment was not completed. Please try again.');
      setPaying(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Order summary */}
      <div className="bg-[var(--surface-raised)] rounded-xl p-4 space-y-1.5 text-sm">
        <div className="flex justify-between">
          <span className="text-[var(--text-secondary)]">Subtotal</span>
          <span className="text-[var(--text-primary)]">${subtotal.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--text-secondary)]">Est. tax</span>
          <span className="text-[var(--text-primary)]">${tax.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--text-secondary)]">Shipping</span>
          <span className="text-[var(--text-primary)]">${shipping.toFixed(2)}</span>
        </div>
        <div className="flex justify-between border-t border-[var(--border-subtle)] pt-1.5">
          <span className="font-semibold text-[var(--text-primary)]">Total</span>
          <span className="font-bold" style={{ color: 'var(--accent-primary)' }}>${total.toFixed(2)}</span>
        </div>
      </div>

      {/* Stripe PaymentElement */}
      <PaymentElement />

      {error && (
        <p className="text-sm text-red-600 text-center">{error}</p>
      )}

      <div className="flex gap-3">
        <Button type="button" variant="secondary" onClick={onBack} className="flex-1" disabled={paying}>
          Back
        </Button>
        <Button
          type="submit"
          disabled={!stripe || !elements || paying}
          loading={paying}
          className="flex-1 text-white font-semibold"
          style={{ backgroundColor: '#7A234A' }}
        >
          {paying ? 'Processing...' : `Pay $${total.toFixed(2)}`}
        </Button>
      </div>
    </form>
  );
}
