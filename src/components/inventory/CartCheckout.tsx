// ============================================================================
// Cart Checkout — src/components/inventory/CartCheckout.tsx
// ============================================================================
// Multi-step checkout flow for the reorder cart. Creates a single SF
// Opportunity + Quote with multiple QuoteLineItems. Steps: review →
// shipping → payment → processing → confirmation.
// ============================================================================

'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useTenant } from '@/hooks/use-tenant';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '@/components/ui/Modal';
import { useCartStore, type CartItem } from '@/stores/cart-store';
import {
  detectCartCategory,
  getShippingOptions,
  type ShippingRatesConfig,
  type ShippingOption,
} from '@/lib/shipping-rules';

// ── Types ────────────────────────────────────────────────────────────────

type CheckoutStep = 'review' | 'shipping' | 'payment' | 'processing' | 'confirmation';

type AccountStatus = 'loading' | 'resolved' | 'needs_confirm' | 'needs_create' | 'creating' | 'error';

interface SfMatch {
  accountId: string;
  accountName: string;
  city: string;
  state: string;
  phone: string;
  confidence: string;
}

interface ShippingAddress {
  street: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

interface PaymentMethod {
  id: string;
  brand: string;
  last4: string;
  expirationMonth: number;
  expirationYear: number;
}

// ── Main Component ───────────────────────────────────────────────────────

export default function CartCheckout() {
  const { tenant } = useTenant();
  const supabase = createClient();
  const { items, checkoutOpen, closeCheckout, clearCart, updateQuantity, removeItem } = useCartStore();

  const [step, setStep] = useState<CheckoutStep>('review');

  // Shipping
  const [shippingAddress, setShippingAddress] = useState<ShippingAddress>({
    street: '', city: '', state: '', postalCode: '', country: 'US',
  });
  const [shippingMethod, setShippingMethod] = useState('USPS Priority Mail');
  const [shippingRates, setShippingRates] = useState<ShippingRatesConfig | null>(null);
  const [taxRates, setTaxRates] = useState<Record<string, number> | null>(null);
  const [defaultTaxRate, setDefaultTaxRate] = useState(0.07);
  const [shippingOptions, setShippingOptions] = useState<ShippingOption[]>([]);
  const [estimatedShipping, setEstimatedShipping] = useState(0);
  const [estimatedTax, setEstimatedTax] = useState(0);

  // Account
  const [accountStatus, setAccountStatus] = useState<AccountStatus>('loading');
  const [sfAccountId, setSfAccountId] = useState<string | null>(null);
  const [sfContactId, setSfContactId] = useState<string | null>(null);
  const [sfMatches, setSfMatches] = useState<SfMatch[]>([]);
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [newAccount, setNewAccount] = useState({
    businessName: '', firstName: '', lastName: '', email: '', phone: '',
    street: '', city: '', state: '', postalCode: '',
  });

  // Payment
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [showNewCardForm, setShowNewCardForm] = useState(false);
  const [newCard, setNewCard] = useState({
    nameOnCard: '', cardNumber: '', expirationMonth: '', expirationYear: '', cvv: '',
  });
  const [addingCard, setAddingCard] = useState(false);

  // Order
  const [reorderId, setReorderId] = useState<string | null>(null);
  const [creatingReorder, setCreatingReorder] = useState(false);
  const [processingMsg, setProcessingMsg] = useState('');
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [chargedCard, setChargedCard] = useState<string | null>(null);
  const [sfQuoteNumber, setSfQuoteNumber] = useState<string | null>(null);
  const [finalTotal, setFinalTotal] = useState(0);

  // Computed
  const subtotal = items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
  const estimatedTotal = subtotal + estimatedTax + estimatedShipping;
  const accountReady = accountStatus === 'resolved' && !!sfAccountId;

  // ── Load account on open ──────────────────────────────────────────────

  useEffect(() => {
    if (!checkoutOpen) return;
    setStep('review');
    setPaymentError(null);
    setChargedCard(null);
    setReorderId(null);
    setSfQuoteNumber(null);

    const loadAccount = async () => {
      setAccountStatus('loading');
      try {
        const res = await fetch('/api/salesforce/match-account');
        if (!res.ok) { setAccountStatus('error'); return; }
        const data = await res.json();

        if (data.resolved) {
          setSfAccountId(data.accountId);
          setSfContactId(data.contactId || null);
          setAccountStatus('resolved');
          if (data.shippingAddress) {
            const sa = data.shippingAddress;
            setShippingAddress({
              street: sa.street?.trim() || '',
              city: sa.city?.trim() || '',
              state: sa.state?.trim() || '',
              postalCode: sa.postalCode?.trim() || '',
              country: sa.country?.trim() || 'US',
            });
          }
          if (data.paymentMethods?.length > 0) {
            setPaymentMethods(data.paymentMethods);
            setSelectedCardId(data.paymentMethods[0].id);
          }
        } else if (data.confidence === 'business_name' || data.confidence === 'person_name' || data.confidence === 'exact_email') {
          setSfMatches(data.matches || []);
          if (data.matches?.length === 1) setSelectedMatchId(data.matches[0].accountId);
          setAccountStatus('needs_confirm');
        } else {
          setAccountStatus('needs_create');
          const pf = data.prefill || {};
          setNewAccount({
            businessName: pf.businessName || tenant?.name || '',
            firstName: pf.firstName || '', lastName: pf.lastName || '',
            email: pf.email || '', phone: pf.phone || tenant?.phone || '',
            street: '', city: '', state: '', postalCode: '',
          });
        }
      } catch { setAccountStatus('error'); }
    };
    loadAccount();

    // Load shipping config
    const loadConfig = async () => {
      try {
        const res = await fetch('/api/reorders/shipping-config');
        if (res.ok) {
          const data = await res.json();
          setShippingRates(data.shippingRates || null);
          setTaxRates(data.taxRates || null);
          setDefaultTaxRate(data.defaultTaxRate || 0.07);
        }
      } catch { /* use defaults */ }
    };
    loadConfig();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkoutOpen]);

  // ── Recompute shipping when address/rates change ──────────────────────

  useEffect(() => {
    if (items.length === 0) return;
    const itemNames = items.map((i) => `${i.productTitle} ${i.variantTitle}`);
    const category = detectCartCategory(itemNames);
    const state = shippingAddress.state.trim().toUpperCase();
    const options = getShippingOptions(category, state, shippingRates, itemNames);
    setShippingOptions(options);

    // Auto-select first non-disabled option if current selection is invalid or disabled
    const validOptions = options.filter((o) => !o.disabled);
    const validValues = validOptions.map((o) => o.value);
    if (!validValues.includes(shippingMethod)) {
      const def = validOptions[0];
      if (def) { setShippingMethod(def.value); setEstimatedShipping(def.estimatedCost); }
    } else {
      const sel = options.find((o) => o.value === shippingMethod);
      setEstimatedShipping(sel?.estimatedCost ?? 0);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, shippingAddress.state, shippingRates, shippingMethod]);

  // ── Recompute tax ─────────────────────────────────────────────────────

  useEffect(() => {
    if (!taxRates) return;
    const state = shippingAddress.state.trim().toUpperCase();
    const rate = taxRates[state] ?? defaultTaxRate;
    setEstimatedTax(Math.round(subtotal * rate * 100) / 100);
  }, [subtotal, shippingAddress.state, taxRates, defaultTaxRate]);

  // ── Account confirmation ──────────────────────────────────────────────

  const handleConfirmMatch = async (accountId: string) => {
    setAccountStatus('loading');
    try {
      const res = await fetch('/api/salesforce/match-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'confirm', accountId }),
      });
      const data = await res.json();
      if (data.success) {
        setSfAccountId(data.accountId);
        setSfContactId(data.contactId || null);
        setAccountStatus('resolved');
        if (data.shippingAddress) {
          const sa = data.shippingAddress;
          setShippingAddress({
            street: sa.street?.trim() || '',
            city: sa.city?.trim() || '',
            state: sa.state?.trim() || '',
            postalCode: sa.postalCode?.trim() || '',
            country: sa.country?.trim() || 'US',
          });
        }
        if (data.paymentMethods?.length > 0) {
          setPaymentMethods(data.paymentMethods);
          setSelectedCardId(data.paymentMethods[0].id);
        }
        toast.success('Account linked!');
      } else {
        setAccountStatus('needs_confirm');
        toast.error('Failed to link account');
      }
    } catch {
      setAccountStatus('needs_confirm');
    }
  };

  // ── Create new account ────────────────────────────────────────────────

  const handleCreateAccount = async () => {
    if (!newAccount.businessName.trim()) { toast.error('Please enter your business name.'); return; }
    if (!newAccount.street || !newAccount.city || !newAccount.state || !newAccount.postalCode) {
      toast.error('Please fill in your shipping address.'); return;
    }
    setAccountStatus('creating');
    try {
      const res = await fetch('/api/salesforce/match-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          accountName: newAccount.businessName.trim(),
          firstName: newAccount.firstName.trim(),
          lastName: newAccount.lastName.trim(),
          email: newAccount.email.trim(),
          phone: newAccount.phone.trim(),
          shippingStreet: newAccount.street.trim(),
          shippingCity: newAccount.city.trim(),
          shippingState: newAccount.state.trim(),
          shippingPostalCode: newAccount.postalCode.trim(),
          shippingCountry: 'US',
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSfAccountId(data.accountId);
        setSfContactId(data.contactId || null);
        setAccountStatus('resolved');
        setShippingAddress({
          street: newAccount.street.trim(), city: newAccount.city.trim(),
          state: newAccount.state.trim(), postalCode: newAccount.postalCode.trim(), country: 'US',
        });
        toast.success('Account created!');
      } else {
        setAccountStatus('needs_create');
        toast.error(data.error || 'Failed to create account');
      }
    } catch {
      setAccountStatus('needs_create');
      toast.error('Failed to create account');
    }
  };

  // ── Proceed to shipping step ──────────────────────────────────────────

  const handleReviewNext = () => {
    if (items.length === 0) return;
    setStep('shipping');
  };

  // ── Proceed to payment step → create reorder_history record ───────────

  const handleShippingNext = async () => {
    if (!shippingAddress.street || !shippingAddress.city || !shippingAddress.state || !shippingAddress.postalCode) {
      toast.error('Please fill in your shipping address.'); return;
    }
    if (!accountReady) { toast.error('Please link or create your Sunstone account first.'); return; }

    setCreatingReorder(true);
    try {
      const reorderItems = items.map((ci) => {
        const variantLabel = ci.variantTitle !== 'Default Title' ? ` — ${ci.variantTitle}` : '';
        return {
          inventory_item_id: ci.inventoryItemId || null,
          inventory_variant_id: ci.inventoryVariantId || null,
          variant_id: ci.sunstoneVariantId,
          name: `${ci.productTitle}${variantLabel}`,
          quantity: ci.quantity,
          unit_price: ci.unitPrice,
        };
      });

      const { data: reorder, error } = await supabase
        .from('reorder_history')
        .insert({
          tenant_id: tenant!.id,
          status: 'pending_payment',
          items: reorderItems,
          total_amount: subtotal,
          tax_amount: 0,
          shipping_amount: estimatedShipping,
          shipping_method: shippingMethod,
          notes: `Shipping to: ${shippingAddress.street}, ${shippingAddress.city}, ${shippingAddress.state} ${shippingAddress.postalCode}`,
          ordered_by: null,
        })
        .select('id')
        .single();

      if (error || !reorder) { toast.error('Failed to create order record'); return; }
      setReorderId(reorder.id);
      setStep('payment');
    } catch { toast.error('Failed to prepare order'); } finally { setCreatingReorder(false); }
  };

  // ── Pay with selected card ────────────────────────────────────────────

  const handlePay = useCallback(async (cardId: string, cardLabel: string) => {
    if (!reorderId) return;
    setStep('processing');
    setProcessingMsg('Creating your order...');
    setPaymentError(null);

    try {
      // Step 1: SF Opp + Quote + QuoteLineItems
      const sfRes = await fetch('/api/salesforce/create-reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reorderId,
          contactId: sfContactId,
          shippingMethod,
          estimatedTax,
          estimatedShipping,
        }),
      });
      const sfData = await sfRes.json();

      if (!sfData.success) {
        setPaymentError(sfData.error || sfData.sfError || 'Failed to create Salesforce order.');
        setStep('payment');
        return;
      }

      const sfGrand = sfData.grandTotal || 0;
      const chargeAmount = Math.max(sfGrand, estimatedTotal);
      setFinalTotal(chargeAmount);
      setSfQuoteNumber(sfData.quoteNumber || null);

      // Step 2: Charge card
      setProcessingMsg('Charging your card...');
      const chargeRes = await fetch('/api/reorders/charge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reorderHistoryId: reorderId, cardId, amount: chargeAmount }),
      });
      const chargeData = await chargeRes.json();

      if (!chargeData.success) {
        setPaymentError(`Payment failed: ${chargeData.error || 'Unknown error'}. Your order has been submitted — contact Sunstone at 385-999-5240 to complete payment.`);
        setChargedCard(null);
        setStep('confirmation');
        return;
      }

      // Step 3: Finalize — Closed Won
      setProcessingMsg('Finalizing order...');
      const finalizeRes = await fetch('/api/salesforce/create-reorder', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reorderId }),
      });
      const finalizeData = await finalizeRes.json();

      if (!finalizeData.success) {
        setPaymentError('Payment was processed successfully, but the order could not be finalized. Please contact Sunstone at 385-999-5240.');
        setChargedCard(cardLabel);
        setStep('confirmation');
        return;
      }

      setProcessingMsg('Order confirmed!');
      setChargedCard(cardLabel);

      // Fire-and-forget receipt
      fetch('/api/reorders/send-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reorderHistoryId: reorderId, cardLabel }),
      }).catch(() => {});

      await new Promise((r) => setTimeout(r, 600));
      setStep('confirmation');
      toast.success('Order confirmed!');
    } catch (err: any) {
      setPaymentError(err.message || 'An unexpected error occurred.');
      setStep('payment');
    }
  }, [reorderId, sfContactId, shippingMethod, estimatedTax, estimatedShipping, estimatedTotal]);

  // ── Add card and pay ──────────────────────────────────────────────────

  const handleAddCardAndPay = async () => {
    if (!sfAccountId || !reorderId) return;
    const { nameOnCard, cardNumber, expirationMonth, expirationYear, cvv } = newCard;
    const cleanNumber = cardNumber.replace(/\s/g, '');
    if (!nameOnCard || cleanNumber.length < 13 || !expirationMonth || !expirationYear || cvv.length < 3) {
      toast.error('Please fill in all card fields.'); return;
    }
    setAddingCard(true);
    setPaymentError(null);
    try {
      const addRes = await fetch('/api/salesforce/add-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: sfAccountId, nameOnCard, cardNumber: cleanNumber,
          expirationMonth: parseInt(expirationMonth), expirationYear: parseInt(expirationYear), cvv,
        }),
      });
      const addData = await addRes.json();
      if (!addRes.ok || !addData.success || !addData.cardId) {
        setPaymentError(addData.error || 'Failed to save card.');
        setAddingCard(false);
        return;
      }
      const last4 = cleanNumber.slice(-4);
      const label = `${addData.brand || 'Card'} ending in ${addData.last4 || last4}`;
      setAddingCard(false);
      await handlePay(addData.cardId, label);
    } catch (err: any) {
      setPaymentError(err.message || 'Failed to process payment.');
      setAddingCard(false);
    }
  };

  const formatCardNumber = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 16);
    return digits.replace(/(\d{4})(?=\d)/g, '$1 ');
  };

  // ── Close ─────────────────────────────────────────────────────────────

  const handleClose = () => {
    if (step === 'confirmation' && !paymentError) {
      clearCart();
    }
    closeCheckout();
    setStep('review');
    setReorderId(null);
    setPaymentError(null);
    setChargedCard(null);
    setSfQuoteNumber(null);
    setShowNewCardForm(false);
    setNewCard({ nameOnCard: '', cardNumber: '', expirationMonth: '', expirationYear: '', cvv: '' });
  };

  const currentYear = new Date().getFullYear();

  if (!checkoutOpen) return null;

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <Modal isOpen onClose={handleClose} size="md">
      <ModalHeader>
        <h2 className="text-lg font-bold text-[var(--text-primary)] font-display">
          {step === 'review' && 'Review Order'}
          {step === 'shipping' && 'Shipping'}
          {step === 'payment' && 'Payment'}
          {step === 'processing' && 'Processing...'}
          {step === 'confirmation' && (paymentError ? 'Action Required' : 'Order Confirmed')}
        </h2>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          {items.length} item{items.length !== 1 ? 's' : ''}
          {step !== 'processing' && step !== 'confirmation' && ` — $${subtotal.toFixed(2)}`}
        </p>
      </ModalHeader>

      <ModalBody className="space-y-4">
        {/* ── STEP 1: REVIEW ────────────────────────────────────── */}
        {step === 'review' && (
          <>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {items.map((item) => (
                <div key={item.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-[var(--surface-raised)]">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[var(--text-primary)] truncate">{item.productTitle}</p>
                    <p className="text-xs text-[var(--text-tertiary)] truncate">
                      {item.variantTitle !== 'Default Title' ? item.variantTitle : item.productType}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => updateQuantity(item.id, item.quantity - 1)} disabled={item.quantity <= 1}
                      className="w-7 h-7 rounded border border-[var(--border-default)] flex items-center justify-center text-xs disabled:opacity-30">−</button>
                    <span className="text-sm font-semibold w-5 text-center">{item.quantity}</span>
                    <button onClick={() => updateQuantity(item.id, item.quantity + 1)}
                      className="w-7 h-7 rounded border border-[var(--border-default)] flex items-center justify-center text-xs">+</button>
                  </div>
                  <span className="text-sm font-semibold text-[var(--text-primary)] w-16 text-right">
                    ${(item.unitPrice * item.quantity).toFixed(2)}
                  </span>
                  <button onClick={() => removeItem(item.id)} className="text-[var(--text-tertiary)] hover:text-red-600 p-1">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
            <div className="flex justify-between pt-2 border-t border-[var(--border-subtle)]">
              <span className="text-sm text-[var(--text-secondary)]">Subtotal</span>
              <span className="text-sm font-bold">${subtotal.toFixed(2)}</span>
            </div>
          </>
        )}

        {/* ── STEP 2: SHIPPING ──────────────────────────────────── */}
        {step === 'shipping' && (
          <>
            {/* Account resolution */}
            {accountStatus === 'loading' && (
              <div className="bg-[var(--surface-raised)] rounded-xl p-4 flex items-center gap-3">
                <div className="w-4 h-4 border-2 border-[var(--accent-primary)] border-t-transparent rounded-full animate-spin" />
                <span className="text-sm text-[var(--text-secondary)]">Looking up your Sunstone account...</span>
              </div>
            )}
            {accountStatus === 'resolved' && (
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
                <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-sm text-green-800">Sunstone account linked</span>
              </div>
            )}
            {accountStatus === 'error' && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
                Couldn&apos;t connect to Sunstone. Please try again or call 385-999-5240.
              </div>
            )}
            {accountStatus === 'needs_confirm' && (
              <div className="space-y-3">
                <p className="text-sm font-medium">We found a possible Sunstone account match:</p>
                {sfMatches.map((m) => (
                  <div key={m.accountId} className="border border-[var(--border-default)] rounded-xl p-4 space-y-3">
                    <div>
                      <p className="font-semibold">{m.accountName}</p>
                      <p className="text-sm text-[var(--text-secondary)]">{[m.city, m.state].filter(Boolean).join(', ')}</p>
                    </div>
                    <div className="flex gap-3">
                      <Button size="sm" onClick={() => handleConfirmMatch(m.accountId)} className="text-white font-semibold" style={{ backgroundColor: '#7A234A' }}>
                        Yes, this is me
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setAccountStatus('needs_create')}>Not me</Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {(accountStatus === 'needs_create' || accountStatus === 'creating') && (
              <div className="space-y-3">
                <p className="text-sm font-medium">Create your Sunstone account:</p>
                <div className="grid grid-cols-2 gap-3">
                  <Input label="Business Name" value={newAccount.businessName} onChange={(e) => setNewAccount((p) => ({ ...p, businessName: e.target.value }))} className="col-span-2" />
                  <Input label="First Name" value={newAccount.firstName} onChange={(e) => setNewAccount((p) => ({ ...p, firstName: e.target.value }))} />
                  <Input label="Last Name" value={newAccount.lastName} onChange={(e) => setNewAccount((p) => ({ ...p, lastName: e.target.value }))} />
                  <Input label="Email" type="email" value={newAccount.email} onChange={(e) => setNewAccount((p) => ({ ...p, email: e.target.value }))} className="col-span-2" />
                  <Input label="Phone" value={newAccount.phone} onChange={(e) => setNewAccount((p) => ({ ...p, phone: e.target.value }))} className="col-span-2" />
                  <Input label="Street" value={newAccount.street} onChange={(e) => setNewAccount((p) => ({ ...p, street: e.target.value }))} className="col-span-2" />
                  <Input label="City" value={newAccount.city} onChange={(e) => setNewAccount((p) => ({ ...p, city: e.target.value }))} />
                  <Input label="State" value={newAccount.state} onChange={(e) => setNewAccount((p) => ({ ...p, state: e.target.value }))} />
                  <Input label="Zip Code" value={newAccount.postalCode} onChange={(e) => setNewAccount((p) => ({ ...p, postalCode: e.target.value }))} />
                </div>
                <Button size="sm" onClick={handleCreateAccount} loading={accountStatus === 'creating'} className="text-white font-semibold" style={{ backgroundColor: '#7A234A' }}>
                  Create Account
                </Button>
              </div>
            )}

            {/* Shipping address (pre-filled from SF) */}
            {accountReady && (
              <>
                <div className="space-y-3">
                  <h3 className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">Shipping Address</h3>
                  <Input label="Street" value={shippingAddress.street} onChange={(e) => setShippingAddress((p) => ({ ...p, street: e.target.value }))} />
                  <div className="grid grid-cols-3 gap-3">
                    <Input label="City" value={shippingAddress.city} onChange={(e) => setShippingAddress((p) => ({ ...p, city: e.target.value }))} />
                    <Input label="State" value={shippingAddress.state} onChange={(e) => setShippingAddress((p) => ({ ...p, state: e.target.value }))} />
                    <Input label="Zip" value={shippingAddress.postalCode} onChange={(e) => setShippingAddress((p) => ({ ...p, postalCode: e.target.value }))} />
                  </div>
                </div>

                <div className="space-y-2">
                  <h3 className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">Shipping Method</h3>
                  {!shippingAddress.state.trim() && (
                    <p className="text-xs text-amber-600">Enter your state above for accurate shipping rates</p>
                  )}
                  {shippingOptions.map((opt) => (
                    <label key={opt.value} className={`flex items-start gap-3 px-3 py-2.5 rounded-lg border min-h-[44px] ${
                      opt.disabled ? 'opacity-50 cursor-not-allowed border-[var(--border-default)]'
                        : shippingMethod === opt.value ? 'border-[var(--accent-primary)] bg-[var(--accent-subtle)] cursor-pointer'
                        : 'border-[var(--border-default)] cursor-pointer'
                    }`}>
                      <input type="radio" name="shipping" checked={shippingMethod === opt.value}
                        disabled={opt.disabled}
                        onChange={() => { if (!opt.disabled) { setShippingMethod(opt.value); setEstimatedShipping(opt.estimatedCost); } }}
                        className="accent-[var(--accent-primary)] mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium">{opt.label}</span>
                        {(opt.subtitle || opt.transitDays) && (
                          <p className="text-xs text-[var(--text-tertiary)]">
                            {[opt.subtitle, opt.transitDays].filter(Boolean).join(' \u00B7 ')}
                          </p>
                        )}
                        {opt.disabledReason && <p className="text-xs text-amber-600 mt-0.5">{opt.disabledReason}</p>}
                        {opt.note && !opt.disabled && <p className="text-xs text-amber-600 mt-0.5">{opt.note}</p>}
                        {opt.surcharges?.map((sc) => (
                          <p key={sc.name} className="text-xs text-[var(--text-tertiary)] mt-0.5">+${sc.amount.toFixed(2)} {sc.name}</p>
                        ))}
                      </div>
                      <span className="text-sm font-semibold shrink-0">
                        {!shippingAddress.state.trim() && opt.estimatedCost !== 0 ? '...' : opt.estimatedCost === 0 ? 'Free' : `$${opt.estimatedCost.toFixed(2)}`}
                      </span>
                    </label>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {/* ── STEP 3: PAYMENT ───────────────────────────────────── */}
        {step === 'payment' && (
          <>
            {paymentError && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-800">{paymentError}</div>
            )}

            {/* Order summary */}
            <div className="bg-[var(--surface-raised)] rounded-xl p-4 space-y-1.5 text-sm">
              <div className="flex justify-between"><span>Subtotal ({items.length} items)</span><span>${subtotal.toFixed(2)}</span></div>
              <div className="flex justify-between"><span>Shipping</span><span>${estimatedShipping.toFixed(2)}</span></div>
              <div className="flex justify-between"><span>Est. Tax</span><span>${estimatedTax.toFixed(2)}</span></div>
              <div className="flex justify-between font-bold pt-1.5 border-t border-[var(--border-subtle)]">
                <span>Estimated Total</span><span>${estimatedTotal.toFixed(2)}</span>
              </div>
            </div>

            {/* Saved cards */}
            {paymentMethods.length > 0 && !showNewCardForm && (
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">Payment Method</h3>
                {paymentMethods.map((pm) => (
                  <label key={pm.id} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer min-h-[44px] ${
                    selectedCardId === pm.id ? 'border-[var(--accent-primary)] bg-[var(--accent-subtle)]' : 'border-[var(--border-default)]'
                  }`}>
                    <input type="radio" name="card" checked={selectedCardId === pm.id}
                      onChange={() => setSelectedCardId(pm.id)} className="accent-[var(--accent-primary)]" />
                    <span className="text-sm flex-1">{pm.brand} ending in {pm.last4}</span>
                    <span className="text-xs text-[var(--text-tertiary)]">{pm.expirationMonth}/{pm.expirationYear}</span>
                  </label>
                ))}
                <button onClick={() => setShowNewCardForm(true)} className="text-sm font-medium text-[var(--accent-primary)] hover:underline">
                  + Use a different card
                </button>
              </div>
            )}

            {/* New card form */}
            {(paymentMethods.length === 0 || showNewCardForm) && (
              <div className="space-y-3">
                <h3 className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">Card Details</h3>
                <Input label="Name on Card" value={newCard.nameOnCard} onChange={(e) => setNewCard((p) => ({ ...p, nameOnCard: e.target.value }))} />
                <Input label="Card Number" value={newCard.cardNumber}
                  onChange={(e) => setNewCard((p) => ({ ...p, cardNumber: formatCardNumber(e.target.value) }))}
                  placeholder="0000 0000 0000 0000" inputMode="numeric" />
                <div className="grid grid-cols-3 gap-3">
                  <select value={newCard.expirationMonth} onChange={(e) => setNewCard((p) => ({ ...p, expirationMonth: e.target.value }))}
                    className="rounded-xl border border-[var(--border-default)] bg-[var(--surface-base)] px-3 py-3 text-sm min-h-[48px]">
                    <option value="">Month</option>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                      <option key={m} value={m}>{String(m).padStart(2, '0')}</option>
                    ))}
                  </select>
                  <select value={newCard.expirationYear} onChange={(e) => setNewCard((p) => ({ ...p, expirationYear: e.target.value }))}
                    className="rounded-xl border border-[var(--border-default)] bg-[var(--surface-base)] px-3 py-3 text-sm min-h-[48px]">
                    <option value="">Year</option>
                    {Array.from({ length: 10 }, (_, i) => currentYear + i).map((y) => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                  <Input label="" value={newCard.cvv} onChange={(e) => setNewCard((p) => ({ ...p, cvv: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
                    placeholder="CVV" inputMode="numeric" />
                </div>
                {showNewCardForm && paymentMethods.length > 0 && (
                  <button onClick={() => setShowNewCardForm(false)} className="text-sm text-[var(--text-tertiary)] hover:underline">
                    Use a saved card instead
                  </button>
                )}
              </div>
            )}
          </>
        )}

        {/* ── STEP 4: PROCESSING ────────────────────────────────── */}
        {step === 'processing' && (
          <div className="py-12 text-center">
            <div className="w-10 h-10 border-3 border-[var(--accent-primary)] border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-sm text-[var(--text-secondary)] mt-4">{processingMsg}</p>
          </div>
        )}

        {/* ── STEP 5: CONFIRMATION ──────────────────────────────── */}
        {step === 'confirmation' && (
          <div className="text-center py-4">
            {paymentError ? (
              <>
                <div className="w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
                  <svg className="w-7 h-7 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                  </svg>
                </div>
                <p className="text-sm text-[var(--text-secondary)] whitespace-pre-line">{paymentError}</p>
              </>
            ) : (
              <>
                <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                  <svg className="w-7 h-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <p className="text-lg font-bold text-[var(--text-primary)]">Order Confirmed!</p>
                {sfQuoteNumber && <p className="text-sm text-[var(--text-tertiary)] mt-1">Quote: {sfQuoteNumber}</p>}
                <div className="mt-4 text-left bg-[var(--surface-raised)] rounded-xl p-4 space-y-1 text-sm">
                  {items.map((item) => (
                    <div key={item.id} className="flex justify-between">
                      <span className="truncate mr-2">{item.productTitle} x{item.quantity}</span>
                      <span className="font-semibold shrink-0">${(item.unitPrice * item.quantity).toFixed(2)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between font-bold pt-1.5 border-t border-[var(--border-subtle)]">
                    <span>Total charged</span><span>${finalTotal.toFixed(2)}</span>
                  </div>
                </div>
                {chargedCard && <p className="text-xs text-[var(--text-tertiary)] mt-2">Charged to {chargedCard}</p>}
              </>
            )}
          </div>
        )}
      </ModalBody>

      <ModalFooter>
        <div className="flex gap-2 justify-end">
          {step === 'review' && (
            <>
              <Button variant="secondary" onClick={handleClose}>Cancel</Button>
              <Button onClick={handleReviewNext} className="text-white font-semibold" style={{ backgroundColor: '#7A234A' }}>
                Continue to Shipping
              </Button>
            </>
          )}
          {step === 'shipping' && (
            <>
              <Button variant="secondary" onClick={() => setStep('review')}>Back</Button>
              <Button onClick={handleShippingNext} loading={creatingReorder} disabled={!accountReady}
                className="text-white font-semibold" style={{ backgroundColor: '#7A234A' }}>
                Continue to Payment
              </Button>
            </>
          )}
          {step === 'payment' && (
            <>
              <Button variant="secondary" onClick={() => setStep('shipping')}>Back</Button>
              {showNewCardForm || paymentMethods.length === 0 ? (
                <Button onClick={handleAddCardAndPay} loading={addingCard}
                  className="text-white font-semibold" style={{ backgroundColor: '#7A234A' }}>
                  Pay ${estimatedTotal.toFixed(2)}
                </Button>
              ) : (
                <Button onClick={() => {
                  if (!selectedCardId) { toast.error('Select a payment method'); return; }
                  const pm = paymentMethods.find((m) => m.id === selectedCardId);
                  handlePay(selectedCardId, pm ? `${pm.brand} ending in ${pm.last4}` : 'Card');
                }}
                  className="text-white font-semibold" style={{ backgroundColor: '#7A234A' }}>
                  Pay ${estimatedTotal.toFixed(2)}
                </Button>
              )}
            </>
          )}
          {step === 'confirmation' && (
            <Button variant="secondary" onClick={handleClose}>
              {paymentError ? 'Close' : 'Done'}
            </Button>
          )}
        </div>
      </ModalFooter>
    </Modal>
  );
}
