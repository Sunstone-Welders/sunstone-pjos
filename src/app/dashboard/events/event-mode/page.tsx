// ============================================================================
// Event Mode POS — src/app/dashboard/events/event-mode/page.tsx
// ============================================================================
// Material-first product selection with auto-detected Quick-Tap / Progressive
// Filter modes. Shared components live in src/components/pos/.
// Includes: Jump ring auto-deduction, QR codes, receipt sending (email+SMS),
// post-sale confirmation, client find/create, inventory movement logging,
// chain product fields, per-product and per-inch pricing.
// ============================================================================

'use client';

import { useEffect, useState, useMemo, Suspense } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useTenant } from '@/hooks/use-tenant';
import { useCartStore } from '@/hooks/use-cart';
import { useSearchParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { PLATFORM_FEE_RATES } from '@/types';
import { generateQRData } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '@/components/ui/Modal';
import { QRCode, FullScreenQR } from '@/components/QRCode';
import CartPanel from '@/components/CartPanel';
import JumpRingPickerModal from '@/components/JumpRingPickerModal';
import CashDrawerPanel from '@/components/CashDrawerPanel';
import { ProductSelector, QueueBadge, CheckoutFlow, PendingPayments, GiftCardModal } from '@/components/pos';
import type { CompletedSaleData, CheckoutStep, GiftCardData } from '@/components/pos';
import type { QueueEntry } from '@/components/MiniQueueStrip';
import type {
  InventoryItem, Event, TaxProfile, ProductType, ChainProductPrice, JumpRingResolution, CartItem,
} from '@/types';

const BackArrow = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
  </svg>
);

// ============================================================================
// Jump Ring Calculation Logic
// ============================================================================

function calculateJumpRingNeeds(
  cartItems: CartItem[],
  jumpRingInventory: InventoryItem[]
): JumpRingResolution[] {
  const resolutions: JumpRingResolution[] = [];

  for (const item of cartItems) {
    if (!item.inventory_item_id) continue;

    const invType = item._inventory_type;
    if (!invType) continue;

    let jumpRingsNeeded = 0;

    if (invType === 'chain') {
      const perUnit = item._jump_rings_required ?? 1;
      jumpRingsNeeded = perUnit * item.quantity;
    } else if (invType === 'charm' || invType === 'connector') {
      jumpRingsNeeded = 1 * item.quantity;
    }

    if (jumpRingsNeeded === 0) continue;

    const itemMaterial = (item._material || '').toLowerCase().trim();
    const matchedJumpRing = itemMaterial
      ? jumpRingInventory.find(
          (jr) =>
            jr.is_active &&
            (jr.material || '').toLowerCase().trim() === itemMaterial
        )
      : null;

    resolutions.push({
      cart_item_id: item.id,
      cart_item_name: item.name,
      jump_rings_needed: jumpRingsNeeded,
      jump_ring_inventory_id: matchedJumpRing?.id || null,
      jump_ring_cost_each: matchedJumpRing ? Number(matchedJumpRing.cost_per_unit) : 0,
      material_name: item._material || 'Unknown',
      resolved: !!matchedJumpRing,
    });
  }

  return resolutions;
}

function getLowStockWarnings(
  resolutions: JumpRingResolution[],
  jumpRingInventory: InventoryItem[]
): string[] {
  const warnings: string[] = [];
  const needsPerJR: Record<string, number> = {};
  for (const r of resolutions) {
    if (!r.jump_ring_inventory_id) continue;
    needsPerJR[r.jump_ring_inventory_id] =
      (needsPerJR[r.jump_ring_inventory_id] || 0) + r.jump_rings_needed;
  }

  for (const [jrId, needed] of Object.entries(needsPerJR)) {
    const jr = jumpRingInventory.find((i) => i.id === jrId);
    if (jr && jr.quantity_on_hand < needed) {
      warnings.push(
        `${jr.name} has ${jr.quantity_on_hand} left (need ${needed} for this sale)`
      );
    }
  }
  return warnings;
}

// ============================================================================
// Main Component (Inner — wrapped by Suspense)
// ============================================================================

function EventModePageInner() {
  const { tenant } = useTenant();
  const params = useSearchParams();
  const router = useRouter();
  const eventId = params.get('eventId');

  const [event, setEvent] = useState<Event | null>(null);
  const [taxProfile, setTaxProfile] = useState<TaxProfile | null>(null);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [productTypes, setProductTypes] = useState<ProductType[]>([]);
  const [chainPrices, setChainPrices] = useState<ChainProductPrice[]>([]);
  const [pricingTiers, setPricingTiers] = useState<{ id: string; name: string }[]>([]);
  const [step, setStep] = useState<CheckoutStep>('items');
  const [receiptEmail, setReceiptEmail] = useState('');
  const [receiptPhone, setReceiptPhone] = useState('');
  const [processing, setProcessing] = useState(false);
  const [todaySales, setTodaySales] = useState({ count: 0, total: 0 });
  const [showQR, setShowQR] = useState(false);
  const [showFullScreenQR, setShowFullScreenQR] = useState(false);
  const [showCart, setShowCart] = useState(false);
  const [showGiftCardModal, setShowGiftCardModal] = useState(false);
  const [giftCardData, setGiftCardData] = useState<GiftCardData | null>(null);
  const [autoReplyOn, setAutoReplyOn] = useState(false);
  const [openDrawerId, setOpenDrawerId] = useState<string | null>(null);
  const [drawerRefresh, setDrawerRefresh] = useState(0);

  // Receipt / confirmation
  const [completedSale, setCompletedSale] = useState<CompletedSaleData | null>(null);
  const [receiptConfig, setReceiptConfig] = useState<{ email: boolean; sms: boolean }>({ email: false, sms: false });
  const [sendingEmail, setSendingEmail] = useState(false);
  const [sendingSMS, setSendingSMS] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [smsSent, setSmsSent] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [smsError, setSmsError] = useState('');

  // Jump ring state (pre-sale: unresolved materials picker)
  const [showJumpRingPicker, setShowJumpRingPicker] = useState(false);
  const [jumpRingResolutions, setJumpRingResolutions] = useState<JumpRingResolution[]>([]);
  const [pendingJumpRingLowStockWarnings, setPendingJumpRingLowStockWarnings] = useState<string[]>([]);
  // Post-sale: jump ring confirmation step
  const [pendingJumpRingResolutions, setPendingJumpRingResolutions] = useState<JumpRingResolution[]>([]);

  // ── Task B: Queue integration state ──
  const [activeQueueEntry, setActiveQueueEntry] = useState<QueueEntry | null>(null);
  const [queueRefresh, setQueueRefresh] = useState(0);

  const cart = useCartStore();
  const supabase = createClient();

  // Pre-filter jump ring inventory for quick access
  const jumpRingInventory = useMemo(
    () => inventory.filter((i) => i.type === 'jump_ring' && i.is_active),
    [inventory]
  );

  // ── Check receipt config ──

  useEffect(() => {
    fetch('/api/receipts/config').then((r) => r.json()).then((cfg) => setReceiptConfig(cfg)).catch(() => {});
  }, []);

  // Init auto-reply from tenant setting
  useEffect(() => {
    if (tenant?.auto_reply_enabled) setAutoReplyOn(true);
  }, [tenant]);

  const toggleAutoReply = async () => {
    const next = !autoReplyOn;
    setAutoReplyOn(next);
    try {
      await supabase.from('tenants').update({ auto_reply_enabled: next }).eq('id', tenant!.id);
    } catch {
      setAutoReplyOn(!next); // revert on failure
    }
  };

  // ── Load event + data ──

  useEffect(() => {
    if (!tenant || !eventId) return;
    const load = async () => {
      const { data: ev } = await supabase
        .from('events').select('*, tax_profiles(*)').eq('id', eventId).single();
      if (ev) {
        setEvent(ev as Event);
        if (ev.tax_profiles) {
          const tp = ev.tax_profiles as unknown as TaxProfile;
          setTaxProfile(tp); cart.setTaxRate(Number(tp.rate));
        }
      }

      const { data: items } = await supabase
        .from('inventory_items').select('*').eq('tenant_id', tenant.id).eq('is_active', true).order('type').order('name');
      let allItems = (items || []) as InventoryItem[];
      // Filter chains by event chain selection (if any)
      if (ev?.selected_chain_ids?.length) {
        const allowed = new Set(ev.selected_chain_ids as string[]);
        allItems = allItems.filter((i) => i.type !== 'chain' || allowed.has(i.id));
      }
      setInventory(allItems);

      // Load product types — filter by event_product_types if any exist
      const { data: pts } = await supabase
        .from('product_types').select('*').eq('tenant_id', tenant.id).eq('is_active', true).order('sort_order');
      const allPts = (pts || []) as ProductType[];

      // Check for event-specific product type filtering
      const { data: eventPts } = await supabase
        .from('event_product_types').select('product_type_id').eq('event_id', eventId);
      if (eventPts && eventPts.length > 0) {
        const allowedIds = new Set(eventPts.map((ep: any) => ep.product_type_id));
        setProductTypes(allPts.filter((pt) => allowedIds.has(pt.id)));
      } else {
        setProductTypes(allPts);
      }

      const { data: prices } = await supabase
        .from('chain_product_prices').select('*').eq('tenant_id', tenant.id).eq('is_active', true);
      setChainPrices((prices || []) as ChainProductPrice[]);

      if (tenant.pricing_mode === 'tier') {
        const { data: tiers } = await supabase
          .from('pricing_tiers').select('id, name').eq('tenant_id', tenant.id).eq('is_active', true).order('sort_order');
        setPricingTiers(tiers || []);
      }

      cart.setPlatformFeeRate(PLATFORM_FEE_RATES[tenant.subscription_tier]);
      cart.setFeeHandling(tenant.fee_handling);

      const today = new Date(); today.setHours(0, 0, 0, 0);
      const { data: sales } = await supabase
        .from('sales').select('total').eq('event_id', eventId).eq('status', 'completed').eq('payment_status', 'completed').gte('created_at', today.toISOString());
      if (sales) setTodaySales({ count: sales.length, total: sales.reduce((s, r) => s + Number(r.total), 0) });
    };
    load();
  }, [tenant, eventId]);

  // ── Derived data ──

  const chains = useMemo(() => inventory.filter((i) => i.type === 'chain'), [inventory]);

  // ── Client find/create ──

  const findOrCreateClient = async (email: string, phone: string): Promise<string | null> => {
    if (!tenant) return null;
    try {
      if (email) {
        const { data } = await supabase.from('clients').select('id').eq('tenant_id', tenant.id).ilike('email', email).limit(1).single();
        if (data) return data.id;
      }
      if (phone) {
        const norm = phone.replace(/[^\d+]/g, '');
        const { data } = await supabase.from('clients').select('id').eq('tenant_id', tenant.id).eq('phone', norm).limit(1).single();
        if (data) return data.id;
      }
      if (email || phone) {
        const { data } = await supabase.from('clients').insert({ tenant_id: tenant.id, email: email || null, phone: phone ? phone.replace(/[^\d+]/g, '') : null }).select('id').single();
        if (data) return data.id;
      }
    } catch { console.warn('[Client linkage] Could not find/create client'); }
    return null;
  };

  // ── Task B: Queue → POS integration ──

  const handleQueueStartSale = async (entry: QueueEntry) => {
    setActiveQueueEntry(entry);

    // Update queue entry status to 'serving'
    await supabase.from('queue_entries').update({ status: 'serving' }).eq('id', entry.id);

    // Pre-fill receipt email/phone from queue entry or client record
    if (!entry.email && entry.client_id) {
      const { data: client } = await supabase
        .from('clients')
        .select('email, phone')
        .eq('id', entry.client_id)
        .single();
      if (client?.email) setReceiptEmail(client.email);
      if (client?.phone) setReceiptPhone(client.phone);
    } else {
      if (entry.email) setReceiptEmail(entry.email);
      if (entry.phone) setReceiptPhone(entry.phone);
    }

    // Link client to cart
    if (entry.client_id) {
      cart.setClientId(entry.client_id);
    }
  };

  const cancelServing = async () => {
    if (!activeQueueEntry) return;
    // Reset queue entry back to waiting
    await supabase
      .from('queue_entries')
      .update({ status: 'waiting' })
      .eq('id', activeQueueEntry.id);

    setActiveQueueEntry(null);
    setReceiptEmail('');
    setReceiptPhone('');
    cart.setClientId(null);
    setQueueRefresh((n) => n + 1);
  };

  // ── Create pending sale (for Stripe payment link flow) ──

  const createPendingSale = async (): Promise<string | null> => {
    if (!tenant || !eventId) return null;
    if (cart.items.length === 0) { toast.error('Cart is empty'); return null; }
    try {
      const { data: { user } } = await supabase.auth.getUser();
      let clientId = cart.client_id;
      if (!clientId && (receiptEmail || receiptPhone)) clientId = await findOrCreateClient(receiptEmail, receiptPhone);

      const saleItems = cart.items.map((item: any) => {
        const resolution = jumpRingResolutions.find((r: JumpRingResolution) => r.cart_item_id === item.id);
        const jumpRingCost = resolution ? resolution.jump_ring_cost_each * resolution.jump_rings_needed : 0;
        const inv = inventory.find((i) => i.id === item.inventory_item_id);
        const chainMaterialCost = inv?.type === 'chain' && item.inches_used
          ? Number(inv.cost_per_unit) * item.inches_used
          : 0;
        return {
          inventory_item_id: item.inventory_item_id || null,
          name: item.name, quantity: item.quantity, unit_price: item.unit_price,
          discount_type: item.discount_type || null, discount_value: item.discount_value || 0,
          line_total: item.line_total, product_type_id: item.product_type_id || null,
          product_type_name: item.product_type_name || null, inches_used: item.inches_used || null,
          chain_material_cost: chainMaterialCost || null,
          jump_ring_cost: jumpRingCost,
        };
      });

      // No inventory deductions for pending sales — webhook deducts on payment completion
      const { data: saleId, error: rpcError } = await supabase.rpc('create_sale_transaction', {
        p_tenant_id: tenant.id, p_event_id: eventId, p_client_id: clientId || null,
        p_subtotal: cart.subtotal, p_discount_amount: cart.discount_amount,
        p_tax_amount: cart.tax_amount, p_tip_amount: cart.tip_amount,
        p_platform_fee_amount: cart.platform_fee_amount, p_total: cart.total,
        p_payment_method: 'stripe_link', p_payment_status: 'pending', p_payment_provider: 'stripe',
        p_platform_fee_rate: PLATFORM_FEE_RATES[tenant.subscription_tier],
        p_fee_handling: tenant.fee_handling || null, p_status: 'completed',
        p_receipt_email: receiptEmail || null, p_receipt_phone: receiptPhone || null,
        p_notes: cart.notes || null, p_completed_by: user?.id || null,
        p_items: saleItems, p_inventory_deductions: [],
        p_queue_entry_id: activeQueueEntry?.id || null,
      });
      if (rpcError) throw rpcError;
      return saleId || null;
    } catch (err: any) {
      toast.error(err?.message || 'Failed to create sale');
      return null;
    }
  };

  // ── Handle Stripe payment completed ──

  const handlePaymentCompleted = async (saleId: string) => {
    if (!tenant) return;
    if (activeQueueEntry) setActiveQueueEntry(null);

    // Redeem gift card if applied
    if (giftCardData) {
      try {
        await fetch(`/api/gift-cards/${giftCardData.giftCardId}/redeem`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ saleId, amount: giftCardData.amountApplied }),
        });
        await supabase.from('sales').update({
          gift_card_id: giftCardData.giftCardId,
          gift_card_amount_applied: giftCardData.amountApplied,
        }).eq('id', saleId);
      } catch (err) {
        console.error('[GiftCard] Redeem failed:', err);
      }
    }

    const saleData: CompletedSaleData = {
      saleId, saleDate: new Date().toISOString(),
      items: cart.items.length > 0 ? cart.items.map((i: any) => ({ name: i.name, quantity: i.quantity, unitPrice: i.unit_price, lineTotal: i.line_total })) : [{ name: 'Payment', quantity: 1, unitPrice: 0, lineTotal: 0 }],
      subtotal: cart.subtotal, taxAmount: cart.tax_amount,
      taxRate: cart.tax_rate, tipAmount: cart.tip_amount,
      total: cart.total, paymentMethod: 'stripe_link',
    };

    setTodaySales((s) => ({ count: s.count + 1, total: s.total + cart.total }));
    setCompletedSale(saleData); cart.reset(); setShowCart(false);
    setEmailSent(false); setSmsSent(false); setEmailError(''); setSmsError('');
    setJumpRingResolutions([]); setQueueRefresh((n) => n + 1);
    setStep('confirmation');
    toast.success('Payment received!');

    const { data: refreshed } = await supabase.from('inventory_items').select('*').eq('tenant_id', tenant.id).eq('is_active', true).order('type').order('name');
    if (refreshed) setInventory(refreshed as InventoryItem[]);
  };

  // ── Sale completion — with jump ring auto-deduction ──

  const handleCompleteSale = () => {
    const resolutions = calculateJumpRingNeeds(cart.items, jumpRingInventory);
    const unresolvedItems = resolutions.filter((r) => !r.resolved);
    const lowStockWarnings = getLowStockWarnings(resolutions, jumpRingInventory);

    for (const warning of lowStockWarnings) {
      toast.warning(`Low jump ring stock: ${warning}`, { duration: 6000 });
    }

    if (unresolvedItems.length > 0) {
      setJumpRingResolutions(resolutions);
      setPendingJumpRingLowStockWarnings(lowStockWarnings);
      setShowJumpRingPicker(true);
    } else {
      setJumpRingResolutions(resolutions);
      completeSale(resolutions);
    }
  };

  const handleJumpRingPickerConfirm = (updatedResolutions: JumpRingResolution[]) => {
    const allResolutions = jumpRingResolutions.map((r) => {
      const updated = updatedResolutions.find((u) => u.cart_item_id === r.cart_item_id);
      return updated || r;
    });
    setShowJumpRingPicker(false);
    setJumpRingResolutions(allResolutions);
    completeSale(allResolutions);
  };

  const completeSale = async (resolutions: JumpRingResolution[]) => {
    // Gift card full coverage: force payment method if state hasn't propagated yet
    const effectivePaymentMethod = (giftCardData && giftCardData.remainingDue <= 0)
      ? 'gift_card'
      : cart.payment_method;
    if (!tenant || !eventId || !effectivePaymentMethod) return;
    if (cart.items.length === 0) { toast.error('Cart is empty'); return; }
    setProcessing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      let clientId = cart.client_id;
      if (!clientId && (receiptEmail || receiptPhone)) clientId = await findOrCreateClient(receiptEmail, receiptPhone);

      const saleData: CompletedSaleData = {
        saleId: '', items: cart.items.map((i: any) => ({ name: i.name, quantity: i.quantity, unitPrice: i.unit_price, lineTotal: i.line_total })),
        subtotal: cart.subtotal, taxAmount: cart.tax_amount, taxRate: cart.tax_rate, tipAmount: cart.tip_amount,
        total: cart.total, paymentMethod: effectivePaymentMethod, saleDate: new Date().toISOString(), clientId,
      };

      // Build sale items with chain_material_cost and jump_ring_cost for RPC
      const saleItems = cart.items.map((item: any) => {
        const resolution = resolutions.find((r: JumpRingResolution) => r.cart_item_id === item.id);
        const jumpRingCost = resolution
          ? resolution.jump_ring_cost_each * resolution.jump_rings_needed
          : 0;
        const inv = inventory.find((i) => i.id === item.inventory_item_id);
        const chainMaterialCost = inv?.type === 'chain' && item.inches_used
          ? Number(inv.cost_per_unit) * item.inches_used
          : 0;
        return {
          inventory_item_id: item.inventory_item_id || null,
          name: item.name,
          quantity: item.quantity,
          unit_price: item.unit_price,
          discount_type: item.discount_type || null,
          discount_value: item.discount_value || 0,
          line_total: item.line_total,
          product_type_id: item.product_type_id || null,
          product_type_name: item.product_type_name || null,
          inches_used: item.inches_used || null,
          chain_material_cost: chainMaterialCost || null,
          jump_ring_cost: jumpRingCost,
        };
      });

      // Build atomic inventory deductions with movement logging
      const deductions: { item_id: string; amount: number; log_movement: boolean; notes: string | null; performed_by: string | null }[] = [];
      for (const item of cart.items as any[]) {
        if (!item.inventory_item_id) continue;
        const inv = inventory.find((i) => i.id === item.inventory_item_id);
        if (!inv) continue;
        let deduct: number; let movementNotes: string;
        if (inv.type === 'chain' && item.inches_used) {
          deduct = item.inches_used * item.quantity;
          movementNotes = `${item.product_type_name || 'Chain'} (${item.inches_used} in)`;
        } else { deduct = item.quantity; movementNotes = ''; }
        deductions.push({
          item_id: item.inventory_item_id,
          amount: deduct,
          log_movement: true,
          notes: movementNotes || null,
          performed_by: user?.id || null,
        });
      }

      // Single transactional RPC — sale + items + inventory + queue all-or-nothing
      const { data: saleId, error: rpcError } = await supabase.rpc('create_sale_transaction', {
        p_tenant_id: tenant.id,
        p_event_id: eventId,
        p_client_id: clientId || null,
        p_subtotal: cart.subtotal,
        p_discount_amount: cart.discount_amount,
        p_tax_amount: cart.tax_amount,
        p_tip_amount: cart.tip_amount,
        p_platform_fee_amount: cart.platform_fee_amount,
        p_total: cart.total,
        p_payment_method: effectivePaymentMethod,
        p_payment_status: 'completed',
        p_payment_provider: null,
        p_platform_fee_rate: PLATFORM_FEE_RATES[tenant.subscription_tier],
        p_fee_handling: tenant.fee_handling || null,
        p_status: 'completed',
        p_receipt_email: receiptEmail || null,
        p_receipt_phone: receiptPhone || null,
        p_notes: cart.notes || null,
        p_completed_by: user?.id || null,
        p_items: saleItems,
        p_inventory_deductions: deductions,
        p_queue_entry_id: activeQueueEntry?.id || null,
      });
      if (rpcError) throw rpcError;
      if (!saleId) throw new Error('Failed to create sale');

      // Redeem gift card if applied
      if (giftCardData) {
        try {
          await fetch(`/api/gift-cards/${giftCardData.giftCardId}/redeem`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ saleId, amount: giftCardData.amountApplied }),
          });
          await supabase.from('sales').update({
            gift_card_id: giftCardData.giftCardId,
            gift_card_amount_applied: giftCardData.amountApplied,
          }).eq('id', saleId);
        } catch (err) {
          console.error('[GiftCard] Redeem failed:', err);
        }
      }

      saleData.saleId = saleId;
      if (activeQueueEntry) setActiveQueueEntry(null);

      // Auto-log cash sale to open cash drawer, then refresh drawer data
      if (effectivePaymentMethod === 'cash' && openDrawerId) {
        Promise.all([
          fetch(`/api/cash-drawers/${openDrawerId}/transaction`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'sale', amount: cart.total - cart.tip_amount, saleId }),
          }),
          ...(cart.tip_amount > 0 ? [
            fetch(`/api/cash-drawers/${openDrawerId}/transaction`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ type: 'tip', amount: cart.tip_amount, saleId }),
            }),
          ] : []),
        ]).then(() => setDrawerRefresh((n) => n + 1)).catch(() => {});
      }

      setTodaySales((s) => ({ count: s.count + 1, total: s.total + cart.total }));
      toast.success(`Sale completed — $${cart.total.toFixed(2)}`);

      // Fire-and-forget auto-tagging
      if (clientId) {
        fetch('/api/clients/auto-tag', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientId, type: 'sale', eventId, eventName: event?.name }),
        }).catch(() => {});
      }

      setCompletedSale(saleData); cart.reset(); setShowCart(false);
      setEmailSent(false); setSmsSent(false); setEmailError(''); setSmsError('');
      setJumpRingResolutions([]);
      setQueueRefresh((n) => n + 1);

      // Post-sale: route to jump ring confirmation or straight to receipt
      if (resolutions.length > 0) {
        setPendingJumpRingResolutions(resolutions);
        setStep('jump_ring');
      } else {
        setStep('confirmation');
      }

      const { data: refreshed } = await supabase.from('inventory_items').select('*').eq('tenant_id', tenant.id).eq('is_active', true).order('type').order('name');
      if (refreshed) setInventory(refreshed as InventoryItem[]);
    } catch (err: any) { toast.error(err?.message || 'Sale failed'); }
    finally { setProcessing(false); }
  };

  // ── Post-sale jump ring deduction (called from JumpRingStep confirm) ──

  const deductJumpRings = async (resolutions: JumpRingResolution[]) => {
    if (!tenant || !completedSale) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      for (const resolution of resolutions) {
        if (!resolution.jump_ring_inventory_id || resolution.jump_rings_needed <= 0) continue;

        // Atomic decrement with movement logging — no race condition
        await supabase.rpc('decrement_inventory', {
          p_item_id: resolution.jump_ring_inventory_id,
          p_amount: resolution.jump_rings_needed,
          p_tenant_id: tenant.id,
          p_movement_type: 'sale',
          p_reference_id: completedSale.saleId,
          p_notes: `Deducted for ${resolution.material_name} sale`,
          p_performed_by: user?.id || null,
        });
      }
      // Refresh inventory
      const { data: refreshed } = await supabase.from('inventory_items').select('*').eq('tenant_id', tenant.id).eq('is_active', true).order('type').order('name');
      if (refreshed) setInventory(refreshed as InventoryItem[]);
    } catch (err: any) {
      toast.error('Failed to deduct jump rings');
    }
  };

  // ── Receipt sending ──

  const sendEmailReceipt = async () => {
    if (!receiptEmail || !completedSale || !tenant) return;
    setSendingEmail(true); setEmailError('');
    try {
      const res = await fetch('/api/receipts/email', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: receiptEmail, tenantName: tenant.name, tenantAccentColor: tenant.brand_color || undefined,
          eventName: event?.name || undefined, saleDate: completedSale.saleDate, items: completedSale.items,
          subtotal: completedSale.subtotal, taxAmount: completedSale.taxAmount, taxRate: completedSale.taxRate,
          tipAmount: completedSale.tipAmount, total: completedSale.total, paymentMethod: completedSale.paymentMethod }) });
      const data = await res.json();
      if (data.sent) { setEmailSent(true); if (completedSale.saleId) await supabase.from('sales').update({ receipt_sent_at: new Date().toISOString() }).eq('id', completedSale.saleId); }
      else setEmailError(data.error || "Couldn't send email.");
    } catch { setEmailError("Couldn't send email."); }
    finally { setSendingEmail(false); }
  };

  const sendSMSReceipt = async () => {
    if (!receiptPhone || !completedSale || !tenant) return;
    setSendingSMS(true); setSmsError('');
    try {
      const res = await fetch('/api/receipts/sms', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: receiptPhone.replace(/[^\d+]/g, ''), tenantName: tenant.name,
          total: completedSale.total, itemCount: completedSale.items.reduce((s, i) => s + i.quantity, 0),
          paymentMethod: completedSale.paymentMethod }) });
      const data = await res.json();
      if (data.sent) { setSmsSent(true); if (completedSale.saleId) await supabase.from('sales').update({ receipt_sent_at: new Date().toISOString() }).eq('id', completedSale.saleId); }
      else setSmsError(data.error || "Couldn't send text.");
    } catch { setSmsError("Couldn't send text."); }
    finally { setSendingSMS(false); }
  };

  const startNewSale = () => {
    setStep('items'); setCompletedSale(null); setReceiptEmail(''); setReceiptPhone('');
    setEmailSent(false); setSmsSent(false); setEmailError(''); setSmsError('');
    setJumpRingResolutions([]); setPendingJumpRingResolutions([]); setActiveQueueEntry(null);
    setGiftCardData(null);
    setQueueRefresh((n) => n + 1);
  };

  // ── Loading ──

  if (!event) {
    return (
      <div className="flex items-center justify-center h-screen bg-[var(--surface-base)]">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-[var(--text-primary)] border-t-transparent mb-4" />
          <p className="text-[var(--text-tertiary)] text-sm mb-4">Loading event...</p>
          <Button variant="secondary" onClick={() => router.push('/dashboard/events')}>Back to Events</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-[var(--surface-base)] flex flex-col">

      {/* ── Header ── */}
      <header className="bg-[var(--surface-base)] border-b border-[var(--border-default)] px-5 py-3.5 flex items-center justify-between shrink-0 z-10">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => router.push('/dashboard/events')}
            className="w-10 h-10 rounded-xl border border-[var(--border-default)] bg-[var(--surface-raised)] flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)] transition-colors">
            <BackArrow />
          </button>
          <div className="min-w-0">
            <div className="font-semibold text-[var(--text-primary)] text-[15px] truncate">{event.name}</div>
            {event.location && <div className="text-[11px] text-[var(--text-tertiary)] truncate">{event.location}</div>}
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {/* Queue Badge */}
          {tenant && eventId && (
            <QueueBadge
              tenantId={tenant.id}
              eventId={eventId}
              mode="event"
              onStartSale={handleQueueStartSale}
              isServingActive={!!activeQueueEntry}
              refreshTrigger={queueRefresh}
            />
          )}

          {/* Cash Drawer */}
          {tenant && eventId && (
            <CashDrawerPanel
              tenantId={tenant.id}
              eventId={eventId}
              mode="event"
              onDrawerChange={setOpenDrawerId}
              refreshTrigger={drawerRefresh}
            />
          )}

          <button onClick={() => setShowGiftCardModal(true)}
            className="w-10 h-10 rounded-xl border border-[var(--border-default)] bg-[var(--surface-raised)] flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)] transition-colors"
            aria-label="Sell gift card"
            title="Sell Gift Card">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 11.25v8.25a1.5 1.5 0 01-1.5 1.5H5.25a1.5 1.5 0 01-1.5-1.5v-8.25M12 4.875A2.625 2.625 0 109.375 7.5H12m0-2.625V7.5m0-2.625A2.625 2.625 0 1114.625 7.5H12m0 0V21m-8.625-9.75h18c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125h-18c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
            </svg>
          </button>
          <button onClick={() => setShowQR(true)}
            className="w-10 h-10 rounded-xl border border-[var(--border-default)] bg-[var(--surface-raised)] flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)] transition-colors"
            aria-label="Show QR code">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h7v7H3V3zm11 0h7v7h-7V3zM3 14h7v7H3v-7zm14 3h.01M17 17h.01M14 14h3v3h-3v-3zm0 4h.01M17 20h.01M20 14h.01M20 17h.01M20 20h.01" />
            </svg>
          </button>
          {/* Auto-reply toggle */}
          {tenant?.dedicated_phone_number && (
            <button
              onClick={toggleAutoReply}
              className={`w-10 h-10 rounded-xl border flex items-center justify-center transition-colors ${
                autoReplyOn
                  ? 'border-[var(--accent-500)] bg-[var(--accent-50)] text-[var(--accent-600)]'
                  : 'border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)]'
              }`}
              aria-label={autoReplyOn ? 'Auto-reply on' : 'Auto-reply off'}
              title={autoReplyOn ? 'Auto-reply ON — clients get an instant response' : 'Auto-reply OFF — tap to enable'}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
              </svg>
            </button>
          )}
          <div className="hidden sm:flex items-center gap-5 text-sm">
            <div className="text-center">
              <div className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-[0.05em] font-semibold">Sales</div>
              <div className="text-lg font-bold text-[var(--text-primary)]">{todaySales.count}</div>
            </div>
            <div className="w-px h-7 bg-[var(--border-default)]" />
            <div className="text-center">
              <div className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-[0.05em] font-semibold">Revenue</div>
              <div className="text-lg font-bold text-[var(--text-primary)] ">${todaySales.total.toFixed(2)}</div>
            </div>
          </div>
        </div>
      </header>

      {/* ── Serving Banner ── */}
      {activeQueueEntry && step === 'items' && (
        <div
          className="flex items-center justify-between px-4 shrink-0"
          style={{
            height: '38px',
            backgroundColor: 'color-mix(in srgb, var(--accent-primary) 10%, transparent)',
            borderBottom: '1px solid var(--border-default)',
          }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: 'var(--accent-primary)' }}
            />
            <span className="text-xs font-semibold text-[var(--text-primary)] truncate">
              Serving: {activeQueueEntry.name}
            </span>
          </div>
          <button
            onClick={cancelServing}
            className="w-6 h-6 rounded flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-subtle)] transition-colors shrink-0"
            aria-label="Cancel serving"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* ── Main ── */}
      <div className="flex-1 flex overflow-hidden relative">

        <div className="flex-1 overflow-y-auto bg-[var(--surface-raised)]">
          <div className="sm:hidden flex items-center justify-between px-4 py-2 bg-[var(--surface-base)] border-b border-[var(--border-subtle)] text-xs">
            <span className="text-[var(--text-tertiary)]"><span className="font-semibold text-[var(--text-primary)]">{todaySales.count}</span> sales</span>
            <span className="text-[var(--text-tertiary)]">Revenue: <span className="font-bold text-[var(--text-primary)] ">${todaySales.total.toFixed(2)}</span></span>
          </div>

          <div className="p-5 pb-28 md:pb-5 max-w-[720px] mx-auto">

            {/* ◆◆◆ ITEMS STEP — Material-first ProductSelector ◆◆◆ */}
            {step === 'items' && (
              <ProductSelector
                chains={chains}
                inventory={inventory}
                productTypes={productTypes}
                chainPrices={chainPrices}
                mode="event"
                tenantPricingMode={tenant?.pricing_mode}
                pricingTiers={pricingTiers}
                onAddToCart={(item) => {
                  // Event Mode enriches with jump ring metadata
                  const enriched = {
                    ...item,
                    _jump_rings_required: item.product_type_id
                      ? (productTypes.find(pt => pt.id === item.product_type_id)?.jump_rings_required ?? 1)
                      : null,
                    _inventory_type: item.inventory_item_id
                      ? (inventory.find(i => i.id === item.inventory_item_id)?.type ?? null)
                      : null,
                    _material: item.inventory_item_id
                      ? (inventory.find(i => i.id === item.inventory_item_id)?.material ?? null)
                      : null,
                  };
                  cart.addItem(enriched);
                  toast.success(`Added ${item.name}`);
                }}
              />
            )}

            {/* ◆◆◆ Pending Payments ◆◆◆ */}
            {step === 'items' && tenant && eventId && (
              <div className="mb-4">
                <PendingPayments
                  tenantId={tenant.id}
                  eventId={eventId}
                  onPaymentCompleted={(saleId) => {
                    setTodaySales((s) => ({ count: s.count + 1, total: s.total }));
                    toast.success('Payment received!');
                  }}
                />
              </div>
            )}

            {/* ◆◆◆ CHECKOUT FLOW (Tip → Payment → Confirmation) ◆◆◆ */}
            <CheckoutFlow
              step={step}
              subtotal={cart.subtotal}
              taxAmount={cart.tax_amount}
              tipAmount={cart.tip_amount}
              total={cart.total}
              platformFeeAmount={cart.platform_fee_amount}
              paymentMethod={cart.payment_method}
              tenantName={tenant?.name || ''}
              itemCount={cart.items.length}
              onSetTip={(amount) => cart.setTip(amount)}
              onSetPaymentMethod={(method) => cart.setPaymentMethod(method)}
              onCompleteSale={handleCompleteSale}
              processing={processing}
              items={cart.items.map((i: any) => ({ name: i.name, quantity: i.quantity, unitPrice: i.unit_price, lineTotal: i.line_total }))}
              activeQueueEntry={activeQueueEntry}
              stripeConnected={!!tenant?.stripe_account_id}
              tenantId={tenant?.id || ''}
              onCreatePendingSale={createPendingSale}
              onPaymentCompleted={handlePaymentCompleted}
              receiptPhone={receiptPhone}
              mode="event"
              onGiftCardApplied={(data) => setGiftCardData(data)}
              onContinueToPayment={() => setStep('payment')}
              jumpRingData={pendingJumpRingResolutions.length > 0 ? {
                saleTotal: completedSale?.total ?? 0,
                paymentMethod: completedSale?.paymentMethod ?? '',
                resolutions: pendingJumpRingResolutions,
              } : null}
              onJumpRingConfirm={(adjusted) => {
                deductJumpRings(adjusted);
                setPendingJumpRingResolutions([]);
                setStep('confirmation');
              }}
              onJumpRingSkip={() => {
                setPendingJumpRingResolutions([]);
                setStep('confirmation');
              }}
              completedSale={completedSale}
              receiptConfig={receiptConfig}
              receiptEmail={receiptEmail}
              onSetReceiptEmail={setReceiptEmail}
              onSendEmail={sendEmailReceipt}
              sendingEmail={sendingEmail}
              emailSent={emailSent}
              emailError={emailError}
              onSetReceiptPhone={setReceiptPhone}
              onSendSMS={sendSMSReceipt}
              sendingSMS={sendingSMS}
              smsSent={smsSent}
              smsError={smsError}
              onNewSale={startNewSale}
            />
          </div>
        </div>

        {/* Desktop Cart Sidebar — hidden during checkout */}
        {step === 'items' && (
          <div className="hidden md:flex w-80 lg:w-[380px] bg-[var(--surface-raised)] border-l border-[var(--border-default)] flex-col shrink-0">
            <CartPanel cart={cart} step={step} setStep={setStep} tenant={tenant} />
          </div>
        )}

        {/* Mobile Cart Sheet — hidden during checkout */}
        {showCart && step === 'items' && (
          <div className="md:hidden fixed inset-0 z-40 flex flex-col">
            <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setShowCart(false)} />
            <div className="relative mt-auto bg-[var(--surface-raised)] rounded-t-2xl max-h-[85vh] flex flex-col shadow-xl">
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--border-subtle)]">
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-tertiary)]">Cart — {cart.items.length} item{cart.items.length !== 1 ? 's' : ''}</span>
                <button onClick={() => setShowCart(false)} className="p-2 rounded-lg hover:bg-[var(--surface-raised)] text-[var(--text-tertiary)] min-h-[44px] min-w-[44px] flex items-center justify-center">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <div className="overflow-y-auto flex-1"><CartPanel cart={cart} step={step} setStep={setStep} tenant={tenant} /></div>
            </div>
          </div>
        )}
      </div>

      {/* Mobile Floating Cart Button — hidden during checkout */}
      {cart.items.length > 0 && !showCart && step === 'items' && (
        <div className="md:hidden fixed bottom-4 left-4 right-4 z-30">
          <button onClick={() => setShowCart(true)} className="w-full flex items-center justify-between px-5 py-4 rounded-2xl shadow-lg transition-all active:scale-[0.98]" style={{ backgroundColor: 'var(--accent-primary)', color: 'white' }}>
            <span className="flex items-center gap-2"><span className="bg-white/20 rounded-full w-7 h-7 flex items-center justify-center text-sm font-bold">{cart.items.length}</span><span className="font-semibold">View Cart</span></span>
            <span className="font-bold  text-lg">${cart.total.toFixed(2)}</span>
          </button>
        </div>
      )}

      {/* QR Modal */}
      {showQR && event && tenant && !showFullScreenQR && (
        <Modal isOpen={true} onClose={() => setShowQR(false)} size="lg">
          <ModalHeader><h2 className="text-xl font-semibold text-[var(--text-primary)]">Event QR Code</h2><p className="text-sm text-[var(--text-tertiary)] mt-1">Customers scan to sign waiver and join queue.</p></ModalHeader>
          <ModalBody className="flex flex-col items-center py-6"><QRCode url={generateQRData(tenant.slug, event.id)} size={280} tenantName={tenant.name} eventName={event.name} showDownload showPrint /></ModalBody>
          <ModalFooter><Button variant="ghost" size="sm" onClick={() => setShowFullScreenQR(true)}>Full Screen</Button><Button variant="secondary" onClick={() => setShowQR(false)}>Close</Button></ModalFooter>
        </Modal>
      )}
      {showFullScreenQR && event && tenant && (<FullScreenQR url={generateQRData(tenant.slug, event.id)} tenantName={tenant.name} eventName={event.name} onClose={() => setShowFullScreenQR(false)} />)}

      {/* Jump Ring Picker Modal */}
      <JumpRingPickerModal
        open={showJumpRingPicker}
        onClose={() => setShowJumpRingPicker(false)}
        onConfirm={handleJumpRingPickerConfirm}
        unresolvedResolutions={jumpRingResolutions.filter((r) => !r.resolved)}
        jumpRingInventory={jumpRingInventory}
        lowStockWarnings={pendingJumpRingLowStockWarnings}
      />

      {/* ── Gift Card Modal ── */}
      {tenant && (
        <GiftCardModal
          isOpen={showGiftCardModal}
          onClose={() => setShowGiftCardModal(false)}
          tenantId={tenant.id}
          tenantName={tenant.name}
          stripeConnected={!!tenant.stripe_account_id}
          onGiftCardSold={() => {
            toast.success('Gift card sold!');
          }}
        />
      )}
    </div>
  );
}

// ============================================================================
// Suspense Wrapper (Task A — Next.js 15 requires this for useSearchParams)
// ============================================================================

export default function EventModePage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-screen bg-[var(--surface-base)]">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-[var(--text-primary)] border-t-transparent" />
      </div>
    }>
      <EventModePageInner />
    </Suspense>
  );
}