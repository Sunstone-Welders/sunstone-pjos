// ============================================================================
// Store Mode POS — src/app/dashboard/pos/page.tsx
// ============================================================================
// Material-first product selection with auto-detected Quick-Tap / Progressive
// Filter modes. Shared components live in src/components/pos/.
// Includes: QR code for waiver check-in, MiniQueueStrip, serving banner,
// queue-to-POS client linking, cancel serving, walk-up sales.
// ============================================================================

'use client';

import { useEffect, useState, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useTenant } from '@/hooks/use-tenant';
import { useCartStore } from '@/hooks/use-cart';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { PLATFORM_FEE_RATES } from '@/types';
import { generateQRData } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '@/components/ui/Modal';
import { QRCode, FullScreenQR } from '@/components/QRCode';
import CartPanel from '@/components/CartPanel';
import { ProductSelector, QueueBadge, CheckoutFlow, PendingPayments, GiftCardModal, SalesPanel } from '@/components/pos';
import type { CompletedSaleData, CheckoutStep, GiftCardData } from '@/components/pos';
import { calculateJumpRingNeeds, getLowStockWarnings } from '@/lib/jump-rings';
import SunnyTutorial from '@/components/SunnyTutorial';
import CashDrawerPanel from '@/components/CashDrawerPanel';
import { createWarrantyRecords } from '@/lib/warranty';
import type {
  InventoryItem,
  InventoryItemVariant,
  TaxProfile,
  ProductType,
  ChainProductPrice,
  JumpRingResolution,
} from '@/types';

// SVG icon for back button (still used in header)
const BackArrow = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
  </svg>
);

export default function StoreModePage() {
  const { tenant } = useTenant();
  const router = useRouter();

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
  const [showCart, setShowCart] = useState(false);
  const [showSalesPanel, setShowSalesPanel] = useState(false);

  // QR code state
  const [showQR, setShowQR] = useState(false);
  const [showFullScreenQR, setShowFullScreenQR] = useState(false);

  // Gift card state
  const [showGiftCardModal, setShowGiftCardModal] = useState(false);
  const [giftCardData, setGiftCardData] = useState<GiftCardData | null>(null);

  // Queue/check-in state
  const [activeQueueEntry, setActiveQueueEntry] = useState<any | null>(null);
  const [queueRefresh, setQueueRefresh] = useState(0);

  // Cash drawer state
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

  // Variant state
  const [itemVariants, setItemVariants] = useState<Record<string, InventoryItemVariant[]>>({});

  const cart = useCartStore();
  const supabase = createClient();

  // ── Load variants for has_variants items ───────────────────────────────
  const loadVariants = async (items: InventoryItem[]) => {
    const ids = items.filter((i) => i.has_variants && i.type !== 'chain').map((i) => i.id);
    if (!ids.length) { setItemVariants({}); return; }
    const { data } = await supabase
      .from('inventory_item_variants').select('*')
      .in('inventory_item_id', ids).eq('is_active', true)
      .order('sort_order').order('name');
    const map: Record<string, InventoryItemVariant[]> = {};
    for (const v of (data || []) as InventoryItemVariant[]) {
      if (!map[v.inventory_item_id]) map[v.inventory_item_id] = [];
      map[v.inventory_item_id].push(v);
    }
    setItemVariants(map);
  };

  // ── Load data ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!tenant) return;
    const load = async () => {
      const { data: taxProfiles } = await supabase
        .from('tax_profiles').select('*').eq('tenant_id', tenant.id).eq('is_default', true).limit(1);
      if (taxProfiles?.[0]) {
        setTaxProfile(taxProfiles[0] as TaxProfile);
        cart.setTaxRate(Number(taxProfiles[0].rate));
      } else {
        const { data: anyTax } = await supabase
          .from('tax_profiles').select('*').eq('tenant_id', tenant.id).limit(1);
        if (anyTax?.[0]) { setTaxProfile(anyTax[0] as TaxProfile); cart.setTaxRate(Number(anyTax[0].rate)); }
      }

      const { data: items } = await supabase
        .from('inventory_items').select('*').eq('tenant_id', tenant.id).eq('is_active', true).order('type').order('name');
      const allItems = (items || []) as InventoryItem[];
      setInventory(allItems);
      loadVariants(allItems);

      const { data: pts } = await supabase
        .from('product_types').select('*').eq('tenant_id', tenant.id).eq('is_active', true).order('sort_order');
      setProductTypes((pts || []) as ProductType[]);

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
      cart.setWarrantyTaxable((tenant as any).warranty_taxable !== false);

      const today = new Date(); today.setHours(0, 0, 0, 0);
      const { data: sales } = await supabase
        .from('sales').select('total').eq('tenant_id', tenant.id).is('event_id', null).eq('status', 'completed').eq('payment_status', 'completed').gte('created_at', today.toISOString());
      if (sales) setTodaySales({ count: sales.length, total: sales.reduce((s, r) => s + Number(r.total), 0) });
    };
    load();
  }, [tenant]);

  // ── Check receipt config ────────────────────────────────────────────────

  useEffect(() => {
    fetch('/api/receipts/config')
      .then((r) => r.json())
      .then((cfg) => setReceiptConfig(cfg))
      .catch(() => {});
  }, []);

  // ── Derived data ───────────────────────────────────────────────────────

  const chains = useMemo(() => inventory.filter((i) => i.type === 'chain'), [inventory]);
  const jumpRingInventory = useMemo(() => inventory.filter((i) => i.type === 'jump_ring' && i.is_active), [inventory]);

  // ── Queue: Start Sale from check-in strip ──────────────────────────────

  const handleQueueStartSale = async (entry: any) => {
    setActiveQueueEntry(entry);

    // Update queue entry status to 'serving'
    await supabase
      .from('queue_entries')
      .update({ status: 'serving' })
      .eq('id', entry.id);

    // Pre-fill receipt fields
    if (entry.email) {
      setReceiptEmail(entry.email);
    } else if (entry.client_id) {
      const { data: client } = await supabase.from('clients').select('email, phone').eq('id', entry.client_id).single();
      if (client?.email) setReceiptEmail(client.email);
      if (client?.phone && !entry.phone) setReceiptPhone(client.phone);
    }
    if (entry.phone) {
      setReceiptPhone(entry.phone);
    }

    // Link client to cart
    if (entry.client_id) {
      cart.setClientId(entry.client_id);
    }
  };

  // ── Queue: Cancel Serving ──────────────────────────────────────────────

  const cancelServing = async () => {
    if (!activeQueueEntry) return;

    await supabase
      .from('queue_entries')
      .update({ status: 'waiting' })
      .eq('id', activeQueueEntry.id);

    setActiveQueueEntry(null);
    setReceiptEmail('');
    setReceiptPhone('');
    cart.setClientId(null);
  };

  // ── Receipt sending ───────────────────────────────────────────────────

  const sendEmailReceipt = async () => {
    if (!receiptEmail || !completedSale || !tenant) return;
    setSendingEmail(true); setEmailError('');
    try {
      const res = await fetch('/api/receipts/email', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: receiptEmail, tenantName: tenant.name, tenantId: tenant.id, clientId: cart.client_id || undefined,
          tenantAccentColor: tenant.brand_color || undefined,
          tagline: tenant.receipt_tagline || undefined, footer: tenant.receipt_footer || undefined,
          saleDate: completedSale.saleDate, items: completedSale.items,
          subtotal: completedSale.subtotal, taxAmount: completedSale.taxAmount, taxRate: completedSale.taxRate,
          tipAmount: completedSale.tipAmount, warrantyAmount: completedSale.warrantyAmount || undefined,
          total: completedSale.total, paymentMethod: completedSale.paymentMethod }) });
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
          tenantId: tenant.id, clientId: cart.client_id || undefined,
          total: completedSale.total, itemCount: completedSale.items.reduce((s: number, i: any) => s + i.quantity, 0),
          warrantyAmount: completedSale.warrantyAmount || undefined,
          paymentMethod: completedSale.paymentMethod, footer: tenant.receipt_footer || undefined }) });
      const data = await res.json();
      if (data.sent) { setSmsSent(true); if (completedSale.saleId) await supabase.from('sales').update({ receipt_sent_at: new Date().toISOString() }).eq('id', completedSale.saleId); }
      else setSmsError(data.error || "Couldn't send text.");
    } catch { setSmsError("Couldn't send text."); }
    finally { setSendingSMS(false); }
  };

  // ── Create pending sale (for Stripe payment link flow) ──────────────

  const createPendingSale = async (): Promise<string | null> => {
    if (!tenant) return null;
    if (cart.items.length === 0) { toast.error('Cart is empty'); return null; }
    try {
      const { data: { user } } = await supabase.auth.getUser();

      const saleItems = cart.items.map((item) => {
        const inv = inventory.find((i) => i.id === item.inventory_item_id);
        const chainMaterialCost = inv?.type === 'chain' && item.inches_used
          ? Number(inv.cost_per_unit) * item.inches_used
          : 0;
        return {
          inventory_item_id: item.inventory_item_id || null,
          inventory_variant_id: item.inventory_variant_id || null,
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
          jump_ring_cost: null,
        };
      });

      // No inventory deductions for pending sales — webhook deducts on payment completion
      const { data: saleId, error: rpcError } = await supabase.rpc('create_sale_transaction', {
        p_tenant_id: tenant.id,
        p_event_id: null,
        p_client_id: cart.client_id || null,
        p_subtotal: cart.subtotal,
        p_discount_amount: cart.discount_amount,
        p_tax_amount: cart.tax_amount,
        p_tip_amount: cart.tip_amount,
        p_platform_fee_amount: cart.platform_fee_amount,
        p_total: cart.total,
        p_payment_method: 'stripe_link',
        p_payment_status: 'pending',
        p_payment_provider: 'stripe',
        p_platform_fee_rate: PLATFORM_FEE_RATES[tenant.subscription_tier],
        p_fee_handling: tenant.fee_handling || null,
        p_status: 'completed',
        p_receipt_email: receiptEmail || null,
        p_receipt_phone: receiptPhone || null,
        p_notes: cart.notes || 'Store sale',
        p_completed_by: user?.id || null,
        p_items: saleItems,
        p_inventory_deductions: [],
        p_queue_entry_id: activeQueueEntry?.id || null,
      });
      if (rpcError) throw rpcError;

      // Create warranty records if applicable
      if (saleId && cart.warranty_amount > 0) {
        await createWarrantyRecords({
          supabase,
          saleId,
          tenantId: tenant.id,
          clientId: cart.client_id || null,
          cartItems: cart.items,
          cartWarrantyAmount: cart._cartWarrantyAmount || 0,
          coverageTerms: (tenant as any).warranty_coverage_terms || null,
          durationDays: (tenant as any).warranty_duration_days ?? null,
        });
      }

      return saleId || null;
    } catch (err: any) {
      toast.error(err?.message || 'Failed to create sale');
      return null;
    }
  };

  // ── Handle Stripe payment completed (from polling/realtime) ──────────

  const handlePaymentCompleted = async (saleId: string) => {
    if (!tenant) return;
    if (activeQueueEntry) setActiveQueueEntry(null);

    // Ensure sale is marked completed (fallback if webhook is delayed)
    await supabase.from('sales').update({
      payment_status: 'completed',
    }).eq('id', saleId).eq('payment_status', 'pending');

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
      saleId,
      saleDate: new Date().toISOString(),
      items: cart.items.length > 0 ? cart.items.map((item: any) => ({
        name: item.name, quantity: item.quantity, unitPrice: item.unit_price, lineTotal: item.line_total,
        warrantyAmount: item.warranty_amount || 0,
      })) : [{ name: 'Payment', quantity: 1, unitPrice: 0, lineTotal: 0 }],
      subtotal: cart.subtotal,
      taxAmount: cart.tax_amount,
      taxRate: taxProfile ? Number(taxProfile.rate) : 0,
      tipAmount: cart.tip_amount,
      warrantyAmount: cart.warranty_amount || 0,
      total: cart.total,
      paymentMethod: 'stripe_link',
    };

    setTodaySales((p) => ({ count: p.count + 1, total: p.total + cart.total }));
    setCompletedSale(saleData);
    cart.reset(); setStep('confirmation'); setShowCart(false);
    setEmailSent(false); setSmsSent(false); setEmailError(''); setSmsError('');
    setQueueRefresh((n) => n + 1);
    toast.success('Payment received!');

    const { data: refreshed } = await supabase.from('inventory_items').select('*').eq('tenant_id', tenant.id).eq('is_active', true).order('type').order('name');
    if (refreshed) { setInventory(refreshed as InventoryItem[]); loadVariants(refreshed as InventoryItem[]); }
  };

  // ── Sale completion (external payments: cash, venmo, card_external) ──

  const completeSale = async () => {
    // Gift card full coverage: force payment method if state hasn't propagated yet
    const effectivePaymentMethod = (giftCardData && giftCardData.remainingDue <= 0)
      ? 'gift_card'
      : cart.payment_method;
    if (!tenant || !effectivePaymentMethod) return;
    if (cart.items.length === 0) { toast.error('Cart is empty'); return; }
    setProcessing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      // Calculate jump ring needs for COGS
      const jumpRingResolutions = calculateJumpRingNeeds(cart.items, jumpRingInventory);

      const saleItems = cart.items.map((item) => {
        const inv = inventory.find((i) => i.id === item.inventory_item_id);
        const chainMaterialCost = inv?.type === 'chain' && item.inches_used
          ? Number(inv.cost_per_unit) * item.inches_used
          : 0;
        const resolution = jumpRingResolutions.find((r: JumpRingResolution) => r.cart_item_id === item.id);
        const jumpRingCost = resolution
          ? resolution.jump_ring_cost_each * resolution.jump_rings_needed
          : 0;
        return {
          inventory_item_id: item.inventory_item_id || null,
          inventory_variant_id: item.inventory_variant_id || null,
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
          jump_ring_cost: jumpRingCost || null,
        };
      });

      const deductions: { item_id: string; amount: number; log_movement: boolean; variant_id?: string | null }[] = [];
      for (const item of cart.items) {
        if (!item.inventory_item_id) continue;
        const inv = inventory.find((i) => i.id === item.inventory_item_id);
        if (!inv) continue;
        const deduct = inv.type === 'chain' && item.inches_used ? item.inches_used : item.quantity;
        deductions.push({ item_id: item.inventory_item_id, amount: deduct, log_movement: false, variant_id: item.inventory_variant_id || null });
      }

      const { data: saleId, error: rpcError } = await supabase.rpc('create_sale_transaction', {
        p_tenant_id: tenant.id,
        p_event_id: null,
        p_client_id: cart.client_id || null,
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
        p_notes: cart.notes || 'Store sale',
        p_completed_by: user?.id || null,
        p_items: saleItems,
        p_inventory_deductions: deductions,
        p_queue_entry_id: activeQueueEntry?.id || null,
      });
      if (rpcError) throw rpcError;
      if (!saleId) throw new Error('Failed to create sale');

      // Create warranty records if applicable
      if (cart.warranty_amount > 0) {
        await createWarrantyRecords({
          supabase,
          saleId,
          tenantId: tenant.id,
          clientId: cart.client_id || null,
          cartItems: cart.items,
          cartWarrantyAmount: cart._cartWarrantyAmount || 0,
          coverageTerms: (tenant as any).warranty_coverage_terms || null,
          durationDays: (tenant as any).warranty_duration_days ?? null,
        });
      }

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

      if (activeQueueEntry) setActiveQueueEntry(null);

      const saleData: CompletedSaleData = {
        saleId,
        saleDate: new Date().toISOString(),
        items: cart.items.map((item: any) => ({
          name: item.name, quantity: item.quantity, unitPrice: item.unit_price, lineTotal: item.line_total,
          warrantyAmount: item.warranty_amount || 0,
        })),
        subtotal: cart.subtotal,
        taxAmount: cart.tax_amount,
        taxRate: taxProfile ? Number(taxProfile.rate) : 0,
        tipAmount: cart.tip_amount,
        warrantyAmount: cart.warranty_amount || 0,
        total: cart.total,
        paymentMethod: effectivePaymentMethod || 'Unknown',
      };

      setTodaySales((p) => ({ count: p.count + 1, total: p.total + cart.total }));
      setCompletedSale(saleData);

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

      cart.reset(); setStep('confirmation'); setShowCart(false);
      setEmailSent(false); setSmsSent(false); setEmailError(''); setSmsError('');
      setQueueRefresh((n) => n + 1);
      toast.success('Sale completed');

      // Fire-and-forget auto-send receipts
      if (tenant.auto_email_receipt && receiptEmail) {
        fetch('/api/receipts/email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: receiptEmail, tenantName: tenant.name, tenantId: tenant.id,
            clientId: cart.client_id || undefined, tenantAccentColor: tenant.brand_color || undefined,
            tagline: tenant.receipt_tagline || undefined, footer: tenant.receipt_footer || undefined,
            saleDate: saleData.saleDate, items: saleData.items,
            subtotal: saleData.subtotal, taxAmount: saleData.taxAmount, taxRate: saleData.taxRate,
            tipAmount: saleData.tipAmount, warrantyAmount: saleData.warrantyAmount || undefined,
            total: saleData.total, paymentMethod: saleData.paymentMethod,
          }),
        }).then(async (r) => {
          if (r.ok) {
            setEmailSent(true);
            if (saleId) await supabase.from('sales').update({ receipt_sent_at: new Date().toISOString() }).eq('id', saleId);
          }
        }).catch(() => {});
      }

      if (tenant.auto_sms_receipt && receiptPhone) {
        fetch('/api/receipts/sms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: receiptPhone.replace(/[^\d+]/g, ''), tenantName: tenant.name,
            tenantId: tenant.id, clientId: cart.client_id || undefined,
            total: saleData.total, itemCount: saleData.items.reduce((s: number, i: any) => s + i.quantity, 0),
            paymentMethod: saleData.paymentMethod, footer: tenant.receipt_footer || undefined,
          }),
        }).then(async (r) => {
          if (r.ok) {
            setSmsSent(true);
            if (saleId) await supabase.from('sales').update({ receipt_sent_at: new Date().toISOString() }).eq('id', saleId);
          }
        }).catch(() => {});
      }

      if (cart.client_id) {
        fetch('/api/clients/auto-tag', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientId: cart.client_id, type: 'sale' }),
        }).catch(() => {});
      }

      // Deduct jump rings post-sale (store mode)
      for (const resolution of jumpRingResolutions) {
        if (!resolution.jump_ring_inventory_id || resolution.jump_rings_needed <= 0) continue;
        try {
          await supabase.rpc('decrement_inventory', {
            p_item_id: resolution.jump_ring_inventory_id,
            p_amount: resolution.jump_rings_needed,
            p_tenant_id: tenant.id,
            p_movement_type: 'sale',
            p_reference_id: saleId,
            p_notes: `Deducted for ${resolution.material_name} sale`,
            p_performed_by: user?.id || null,
          });
        } catch { /* non-critical */ }
      }

      const { data: refreshed } = await supabase.from('inventory_items').select('*').eq('tenant_id', tenant.id).eq('is_active', true).order('type').order('name');
      if (refreshed) { setInventory(refreshed as InventoryItem[]); loadVariants(refreshed as InventoryItem[]); }
    } catch (err: any) { toast.error(err?.message || 'Sale failed'); }
    finally { setProcessing(false); }
  };

  // ── Loading ────────────────────────────────────────────────────────────

  if (!tenant) {
    return (
      <div className="flex items-center justify-center h-screen bg-[var(--surface-base)]">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-[var(--text-primary)] border-t-transparent mb-4" />
          <p className="text-[var(--text-tertiary)] text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  // ── QR data ────────────────────────────────────────────────────────────

  const qrUrl = generateQRData(tenant.slug);

  return (
    <div className="fixed inset-0 bg-[var(--surface-base)] flex flex-col">

      {/* ── Header ── */}
      <header className="bg-[var(--surface-base)] border-b border-[var(--border-default)] px-5 py-3.5 flex items-center justify-between shrink-0 z-10 min-h-[56px]" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 14px)' }}>
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => router.push('/dashboard')}
            className="w-10 h-10 rounded-xl border border-[var(--border-default)] bg-[var(--surface-raised)] flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)] transition-colors">
            <BackArrow />
          </button>
          <div className="min-w-0">
            <div className="font-semibold text-[var(--text-primary)] text-[15px]">{tenant.name}</div>
            <div className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-[0.05em] font-medium">Store Mode</div>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {/* Queue Badge */}
          <QueueBadge
            tenantId={tenant.id}
            mode="store"
            onStartSale={handleQueueStartSale}
            isServingActive={!!activeQueueEntry}
            refreshTrigger={queueRefresh}
          />

          {/* Cash Drawer */}
          <CashDrawerPanel
            tenantId={tenant.id}
            mode="store"
            onDrawerChange={setOpenDrawerId}
            refreshTrigger={drawerRefresh}
          />

          {/* Sell Gift Card button */}
          <button
            onClick={() => setShowGiftCardModal(true)}
            className="p-2 rounded-lg hover:bg-[var(--surface-raised)] text-[var(--text-tertiary)] min-h-[44px] min-w-[44px] flex items-center justify-center"
            title="Sell Gift Card"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 11.25v8.25a1.5 1.5 0 01-1.5 1.5H5.25a1.5 1.5 0 01-1.5-1.5v-8.25M12 4.875A2.625 2.625 0 109.375 7.5H12m0-2.625V7.5m0-2.625A2.625 2.625 0 1114.625 7.5H12m0 0V21m-8.625-9.75h18c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125h-18c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
            </svg>
          </button>

          {/* QR Code button */}
          <button
            onClick={() => setShowQR(true)}
            className="p-2 rounded-lg hover:bg-[var(--surface-raised)] text-[var(--text-tertiary)] min-h-[44px] min-w-[44px] flex items-center justify-center"
            title="Show QR Code"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 6.75h.75v.75h-.75v-.75zM6.75 16.5h.75v.75h-.75v-.75zM16.5 6.75h.75v.75h-.75v-.75zM13.5 13.5h.75v.75h-.75v-.75zM13.5 19.5h.75v.75h-.75v-.75zM19.5 13.5h.75v.75h-.75v-.75zM19.5 19.5h.75v.75h-.75v-.75zM16.5 16.5h.75v.75h-.75v-.75z" />
            </svg>
          </button>

          {/* Desktop stats */}
          <button
            onClick={() => setShowSalesPanel(true)}
            className="hidden sm:flex items-center gap-5 text-sm px-3 py-1.5 rounded-lg hover:bg-[var(--surface-subtle)] transition-colors cursor-pointer"
            title="View today's sales"
          >
            <div className="text-center">
              <div className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-[0.05em] font-semibold">Sales</div>
              <div className="text-lg font-bold text-[var(--text-primary)]">{todaySales.count}</div>
            </div>
            <div className="w-px h-7 bg-[var(--border-default)]" />
            <div className="text-center">
              <div className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-[0.05em] font-semibold">Revenue</div>
              <div className="text-lg font-bold text-[var(--text-primary)]">${todaySales.total.toFixed(2)}</div>
            </div>
          </button>
        </div>
      </header>

      {/* ── Serving Banner ── */}
      {activeQueueEntry && step === 'items' && (
        <div
          className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--border-default)]"
          style={{ backgroundColor: 'color-mix(in srgb, var(--accent-primary) 10%, white)' }}
        >
          <div className="flex items-center gap-2">
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
              style={{ backgroundColor: 'var(--accent-primary)' }}
            >
              {activeQueueEntry.name?.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)}
            </div>
            <span className="text-sm font-medium text-[var(--text-primary)]">
              Serving: {activeQueueEntry.name}
            </span>
          </div>
          <button
            onClick={cancelServing}
            className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-[var(--surface-subtle)] text-[var(--text-tertiary)]"
            title="Cancel serving"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* ── Main ── */}
      <div className="flex-1 flex overflow-hidden relative">

        <div className="flex-1 overflow-y-auto bg-[var(--surface-raised)]">
          {/* Mobile stats */}
          <button
            onClick={() => setShowSalesPanel(true)}
            className="sm:hidden flex items-center justify-between w-full px-4 py-2 bg-[var(--surface-base)] border-b border-[var(--border-subtle)] text-xs hover:bg-[var(--surface-subtle)] transition-colors cursor-pointer min-h-[44px]"
          >
            <span className="text-[var(--text-tertiary)]"><span className="font-semibold text-[var(--text-primary)]">{todaySales.count}</span> sales today</span>
            <span className="text-[var(--text-tertiary)]">Revenue: <span className="font-bold text-[var(--text-primary)]">${todaySales.total.toFixed(2)}</span></span>
          </button>

          <div className="p-5 pb-28 md:pb-5 max-w-[720px] mx-auto">

            {/* ═══ ITEMS STEP — Material-first ProductSelector ═══ */}
            {step === 'items' && (
              <ProductSelector
                chains={chains}
                inventory={inventory}
                productTypes={productTypes}
                chainPrices={chainPrices}
                mode="store"
                tenantPricingMode={tenant.pricing_mode}
                pricingTiers={pricingTiers}
                itemVariants={itemVariants}
                onAddToCart={(item) => {
                  cart.addItem(item);
                  toast.success(`Added ${item.name}`);
                }}
              />
            )}

            {/* ═══ Pending Payments ═══ */}
            {step === 'items' && tenant && (
              <div className="mb-4">
                <PendingPayments
                  tenantId={tenant.id}
                  onPaymentCompleted={(saleId) => {
                    setTodaySales((p) => ({ count: p.count + 1, total: p.total }));
                    toast.success('Payment received!');
                  }}
                />
              </div>
            )}

            {/* ═══ CHECKOUT FLOW (Tip → Payment → Confirmation) ═══ */}
            <CheckoutFlow
              step={step}
              subtotal={cart.subtotal}
              taxAmount={cart.tax_amount}
              tipAmount={cart.tip_amount}
              total={cart.total}
              platformFeeAmount={cart.platform_fee_amount}
              paymentMethod={cart.payment_method}
              tenantName={tenant.name}
              itemCount={cart.items.length}
              onSetTip={(amount) => cart.setTip(amount)}
              onSetPaymentMethod={(method) => cart.setPaymentMethod(method)}
              onCompleteSale={completeSale}
              processing={processing}
              items={cart.items.map((i: any) => ({ name: i.name, quantity: i.quantity, unitPrice: i.unit_price, lineTotal: i.line_total }))}
              activeQueueEntry={activeQueueEntry}
              stripeConnected={!!tenant.stripe_account_id}
              tenantId={tenant.id}
              onCreatePendingSale={createPendingSale}
              onPaymentCompleted={handlePaymentCompleted}
              receiptPhone={receiptPhone}
              mode="store"
              onGiftCardApplied={(data) => setGiftCardData(data)}
              onContinueToPayment={() => setStep('payment')}
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
              onNewSale={() => {
                setStep('items'); setCompletedSale(null);
                setReceiptEmail(''); setReceiptPhone('');
                setEmailSent(false); setSmsSent(false);
                setEmailError(''); setSmsError('');
                setGiftCardData(null);
                setQueueRefresh((n) => n + 1);
              }}
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
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-tertiary)]">
                  Cart — {cart.items.length} item{cart.items.length !== 1 ? 's' : ''}
                </span>
                <button onClick={() => setShowCart(false)} className="p-2 rounded-lg hover:bg-[var(--surface-raised)] text-[var(--text-tertiary)] min-h-[44px] min-w-[44px] flex items-center justify-center">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <div className="overflow-y-auto flex-1">
                <CartPanel cart={cart} step={step} setStep={setStep} tenant={tenant} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Mobile Floating Cart Button — hidden during checkout */}
      {cart.items.length > 0 && !showCart && step === 'items' && (
        <div className="md:hidden fixed bottom-4 left-4 right-4 z-30">
          <button onClick={() => setShowCart(true)}
            className="w-full flex items-center justify-between px-5 py-4 rounded-2xl shadow-lg transition-all active:scale-[0.98]"
            style={{ backgroundColor: 'var(--accent-primary)', color: 'white' }}>
            <span className="flex items-center gap-2">
              <span className="bg-white/20 rounded-full w-7 h-7 flex items-center justify-center text-sm font-bold">{cart.items.length}</span>
              <span className="font-semibold">View Cart</span>
            </span>
            <span className="font-bold  text-lg">${cart.total.toFixed(2)}</span>
          </button>
        </div>
      )}

      {/* ── QR Code Modal ── */}
      {showQR && tenant && !showFullScreenQR && (
        <Modal isOpen={true} onClose={() => setShowQR(false)} size="lg">
          <ModalHeader>
            <h2 className="text-xl font-semibold text-[var(--text-primary)]">Waiver Check-In</h2>
            <p className="text-sm text-[var(--text-tertiary)] mt-1">
              Customers scan this to sign the waiver and check in.
            </p>
          </ModalHeader>
          <ModalBody className="flex flex-col items-center py-4">
            <QRCode
              url={qrUrl}
              size={280}
              tenantName={tenant.name}
              showDownload
              showPrint
            />
            <p className="text-xs text-[var(--text-tertiary)] mt-4 text-center  break-all">
              {typeof window !== 'undefined' ? `${window.location.origin}/waiver?tenant=${tenant.slug}` : ''}
            </p>
          </ModalBody>
          <ModalFooter>
            <div className="flex gap-2 w-full">
              <Button variant="secondary" className="flex-1" onClick={() => setShowFullScreenQR(true)}>
                Full Screen
              </Button>
              <Button variant="primary" className="flex-1" onClick={() => setShowQR(false)}>
                Done
              </Button>
            </div>
          </ModalFooter>
        </Modal>
      )}

      {/* ── Full Screen QR ── */}
      {showFullScreenQR && tenant && (
        <FullScreenQR
          url={qrUrl}
          tenantName={tenant.name}
          eventName="Scan to sign waiver & check in"
          onClose={() => setShowFullScreenQR(false)}
        />
      )}

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

      {/* ── Sales Panel ── */}
      {tenant && (
        <SalesPanel
          isOpen={showSalesPanel}
          onClose={() => setShowSalesPanel(false)}
          tenantId={tenant.id}
          eventId={null}
          mode="store"
        />
      )}

      <SunnyTutorial
        pageKey="pos"
        tips={[
          { title: 'Tap to add items', body: 'Select a chain, then pick the product type (bracelet, anklet, etc.). Sunstone calculates the price automatically.' },
          { title: 'Jump rings are auto-deducted', body: 'When you complete a sale, jump rings are deducted from inventory based on each product type\'s requirements.' },
        ]}
      />
    </div>
  );
}