// ============================================================================
// PaymentScreen — Redesigned for Stripe Payment Links
// src/components/pos/checkout/PaymentScreen.tsx
// ============================================================================
// Two clear paths:
//   1. "Charge Customer" — Stripe Checkout via QR code or text link
//   2. "Record External Payment" — cash, venmo, external card reader
// Plus: "Apply Gift Card" — partial or full gift card redemption
// ============================================================================

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import QRCodeLib from 'qrcode';
import type { PaymentMethod } from '@/types';
import { createClient } from '@/lib/supabase/client';
import { GiftCardRedeemModal } from '@/components/pos/GiftCardRedeemModal';
import { formatGiftCardCode } from '@/lib/gift-cards';

// ── Types ──

export interface GiftCardData {
  giftCardId: string;
  amountApplied: number;
  remainingDue: number;
  code: string;
}

interface PaymentScreenProps {
  selectedMethod: PaymentMethod | null;
  onSelectMethod: (method: PaymentMethod) => void;
  onCompleteSale: () => void;
  processing: boolean;
  total: number;
  items: Array<{ name: string; quantity: number; unitPrice: number; lineTotal: number }>;
  subtotal: number;
  taxAmount: number;
  tipAmount: number;
  platformFeeAmount: number;
  activeQueueEntry?: { name: string } | null;
  // Stripe payment link
  stripeConnected: boolean;
  tenantId: string;
  saleId: string | null;
  onCreatePendingSale: () => Promise<string | null>;
  onPaymentCompleted: (saleId: string) => void;
  receiptPhone?: string;
  tenantName?: string;
  mode?: 'event' | 'store';
  // Gift card callback — tells parent to store gift card data for post-sale redemption
  onGiftCardApplied?: (data: GiftCardData | null) => void;
}

type PaymentPath = null | 'charge' | 'external';
type ChargeMethod = null | 'qr' | 'text';

// ── SVG Icons ──

const QRIcon = () => (
  <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 6.75h.75v.75h-.75v-.75zM6.75 16.5h.75v.75h-.75v-.75zM16.5 6.75h.75v.75h-.75v-.75zM13.5 13.5h.75v.75h-.75v-.75zM13.5 19.5h.75v.75h-.75v-.75zM19.5 13.5h.75v.75h-.75v-.75zM19.5 19.5h.75v.75h-.75v-.75zM16.5 16.5h.75v.75h-.75v-.75z" />
  </svg>
);

const TextIcon = () => (
  <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
  </svg>
);

const CashIcon = () => (
  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
  </svg>
);

const VenmoIcon = () => (
  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" />
  </svg>
);

const CardIcon = () => (
  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
  </svg>
);

const CheckCircle = () => (
  <svg className="w-16 h-16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

// ── Component ──

export function PaymentScreen({
  selectedMethod,
  onSelectMethod,
  onCompleteSale,
  processing,
  total,
  items,
  subtotal,
  taxAmount,
  tipAmount,
  platformFeeAmount,
  activeQueueEntry,
  stripeConnected,
  tenantId,
  saleId: existingSaleId,
  onCreatePendingSale,
  onPaymentCompleted,
  receiptPhone: initialPhone,
  tenantName,
  mode,
  onGiftCardApplied,
}: PaymentScreenProps) {
  const [path, setPath] = useState<PaymentPath>(null);
  const [showGiftCardRedeem, setShowGiftCardRedeem] = useState(false);
  const [appliedGiftCard, setAppliedGiftCard] = useState<GiftCardData | null>(null);
  const [chargeMethod, setChargeMethod] = useState<ChargeMethod>(null);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [pendingSaleId, setPendingSaleId] = useState<string | null>(existingSaleId);
  const [creating, setCreating] = useState(false);
  const [paymentComplete, setPaymentComplete] = useState(false);
  const [smsPhone, setSmsPhone] = useState(initialPhone || '');
  const [sendingSms, setSendingSms] = useState(false);
  const [smsSent, setSmsSent] = useState(false);
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const supabase = createClient();

  // Clean up polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // ── Create pending sale + Stripe session ──

  const startStripePayment = useCallback(async (method: 'qr' | 'text') => {
    setCreating(true);
    setChargeMethod(method);

    try {
      // Create the sale record if not already created
      let saleId = pendingSaleId;
      if (!saleId) {
        saleId = await onCreatePendingSale();
        if (!saleId) throw new Error('Failed to create sale');
        setPendingSaleId(saleId);
      }

      // Create Stripe Checkout session — amounts are verified server-side from DB
      const res = await fetch('/api/stripe/payment-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          saleId,
          mode: mode || 'event',
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create payment link');

      setCheckoutUrl(data.url);

      // Generate QR code
      if (data.url) {
        const qr = await QRCodeLib.toDataURL(data.url, {
          width: 320,
          margin: 2,
          color: { dark: '#000000', light: '#ffffff' },
        });
        setQrDataUrl(qr);
      }

      // Start polling for payment completion
      startPolling(saleId);
    } catch (err: any) {
      console.error('[PaymentScreen] Error:', err);
      setChargeMethod(null);
    } finally {
      setCreating(false);
    }
  }, [pendingSaleId, mode]);

  // ── Poll for payment status ──

  const startPolling = useCallback((saleId: string) => {
    if (pollRef.current) clearInterval(pollRef.current);

    pollRef.current = setInterval(async () => {
      const { data } = await supabase
        .from('sales')
        .select('payment_status')
        .eq('id', saleId)
        .single();

      if (data?.payment_status === 'completed') {
        if (pollRef.current) clearInterval(pollRef.current);
        setPaymentComplete(true);
        setTimeout(() => {
          onPaymentCompleted(saleId);
        }, 2000);
      }
    }, 3000);
  }, [supabase, onPaymentCompleted]);

  // ── Send SMS with payment link ──

  const sendPaymentSms = async () => {
    if (!checkoutUrl || !smsPhone.trim()) return;
    setSendingSms(true);
    try {
      const res = await fetch('/api/stripe/send-payment-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: smsPhone.trim(),
          url: checkoutUrl,
          tenantName,
          total,
        }),
      });
      const data = await res.json();
      if (data.sent) {
        setSmsSent(true);
      } else {
        console.error('SMS failed:', data.error);
      }
    } catch (err) {
      console.error('SMS error:', err);
    } finally {
      setSendingSms(false);
    }
  };

  // ── Cancel pending payment ──

  const cancelPending = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    setChargeMethod(null);
    setCheckoutUrl(null);
    setQrDataUrl(null);
    setSmsSent(false);
  };

  // ── Gift card applied ──

  const effectiveTotal = appliedGiftCard ? appliedGiftCard.remainingDue : total;

  const handleGiftCardApplied = (result: GiftCardData) => {
    setAppliedGiftCard(result);
    onGiftCardApplied?.(result);

    if (result.remainingDue <= 0) {
      // Full coverage — complete sale with 'gift_card' payment method
      onSelectMethod('gift_card' as PaymentMethod);
      // Delay to ensure state propagates before completeSale reads it
      // The parent completeSale() also checks giftCardData as a fallback
      setTimeout(() => onCompleteSale(), 150);
    }
  };

  const removeGiftCard = () => {
    setAppliedGiftCard(null);
    onGiftCardApplied?.(null);
  };

  // ============================================================
  // QR CODE WAITING SCREEN
  // ============================================================

  if (chargeMethod === 'qr' && checkoutUrl) {
    if (paymentComplete) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen px-4">
          <div className="text-[var(--accent-primary)] animate-[scale-in_0.3s_ease-out]">
            <CheckCircle />
          </div>
          <h2 className="text-2xl font-bold text-[var(--text-primary)] mt-4">Payment Received!</h2>
          <p className="text-[var(--text-tertiary)] mt-1">${total.toFixed(2)} collected via card</p>
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-4 py-8">
        <h2 className="text-xl font-bold text-[var(--text-primary)] mb-2">Scan to Pay</h2>
        <p className="text-3xl font-bold text-[var(--text-primary)] mb-1">
          ${total.toFixed(2)}
        </p>
        {taxAmount > 0 && (
          <p className="text-xs text-[var(--text-tertiary)] mb-6">
            Includes ${taxAmount.toFixed(2)} tax
          </p>
        )}

        {/* QR Code */}
        <div className="bg-white p-4 rounded-2xl shadow-lg mb-6">
          {qrDataUrl ? (
            <img src={qrDataUrl} alt="Payment QR Code" className="w-64 h-64" />
          ) : (
            <div className="w-64 h-64 flex items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--text-primary)] border-t-transparent" />
            </div>
          )}
        </div>

        {/* Waiting indicator */}
        <div className="flex items-center gap-2 text-[var(--text-tertiary)] mb-8">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--accent-primary)] border-t-transparent" />
          <span className="text-sm">Waiting for payment...</span>
        </div>

        {/* Action buttons */}
        <div className="flex gap-3">
          <button
            onClick={() => {
              setChargeMethod('text');
            }}
            className="px-4 py-2.5 rounded-xl text-sm font-medium border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)] transition-colors min-h-[44px]"
          >
            Text Link Instead
          </button>
          <button
            onClick={cancelPending}
            className="px-4 py-2.5 rounded-xl text-sm font-medium text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors min-h-[44px]"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // ============================================================
  // TEXT LINK WAITING SCREEN
  // ============================================================

  if (chargeMethod === 'text' && checkoutUrl) {
    if (paymentComplete) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen px-4">
          <div className="text-[var(--accent-primary)] animate-[scale-in_0.3s_ease-out]">
            <CheckCircle />
          </div>
          <h2 className="text-2xl font-bold text-[var(--text-primary)] mt-4">Payment Received!</h2>
          <p className="text-[var(--text-tertiary)] mt-1">${total.toFixed(2)} collected via card</p>
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-4 py-8">
        <h2 className="text-xl font-bold text-[var(--text-primary)] mb-6">
          Text Payment Link
        </h2>

        <div className="w-full max-w-sm space-y-4">
          <div>
            <label className="block text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wide mb-1.5">
              Customer Phone
            </label>
            <input
              type="tel"
              value={smsPhone}
              onChange={(e) => setSmsPhone(e.target.value)}
              placeholder="(555) 123-4567"
              className="w-full h-12 px-4 rounded-xl border border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--text-primary)] text-base focus:outline-none focus:border-[var(--accent-primary)] focus:ring-2 focus:ring-[var(--accent-primary)]/20"
            />
          </div>

          {!smsSent ? (
            <button
              onClick={sendPaymentSms}
              disabled={sendingSms || !smsPhone.trim()}
              className="w-full h-12 rounded-xl font-semibold text-base transition-all disabled:opacity-50 min-h-[48px]"
              style={{ backgroundColor: 'var(--accent-primary)', color: 'white' }}
            >
              {sendingSms ? 'Sending...' : `Send Payment Link — $${total.toFixed(2)}`}
            </button>
          ) : (
            <div className="text-center space-y-3">
              <div className="bg-[var(--surface-subtle)] rounded-xl p-4">
                <p className="text-sm font-medium text-[var(--text-primary)]">
                  Link sent to {smsPhone}
                </p>
                <div className="flex items-center justify-center gap-2 mt-2 text-[var(--text-tertiary)]">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--accent-primary)] border-t-transparent" />
                  <span className="text-sm">Waiting for payment...</span>
                </div>
              </div>
              <button
                onClick={() => { setSmsSent(false); sendPaymentSms(); }}
                className="text-sm text-[var(--accent-primary)] hover:underline min-h-[44px]"
              >
                Resend Link
              </button>
            </div>
          )}

          <div className="flex justify-center gap-3 pt-2">
            <button
              onClick={() => setChargeMethod('qr')}
              className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] min-h-[44px]"
            >
              Show QR Instead
            </button>
            <button
              onClick={cancelPending}
              className="text-sm text-[var(--text-tertiary)] hover:text-[var(--text-primary)] min-h-[44px]"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================
  // MAIN PAYMENT SELECTION SCREEN
  // ============================================================

  return (
    <div className="flex items-start justify-center min-h-screen px-4 py-8">
      <div className="w-full max-w-3xl">
        <h2 className="text-[24px] font-bold text-[var(--text-primary)] tracking-tight leading-tight text-center font-[var(--font-heading)] mb-6">
          Complete Payment
        </h2>

        {/* Responsive split layout */}
        <div className="flex flex-col md:flex-row gap-6">
          {/* Left column — Order Summary */}
          <div className="md:w-1/2 space-y-4">
            <div className="bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-2xl p-5 space-y-3 shadow-[var(--shadow-card)]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-tertiary)]">
                Order Summary
              </p>

              {/* Line items */}
              <div className="space-y-2">
                {items.map((item, i) => (
                  <div key={i} className="flex justify-between text-sm">
                    <span className="text-[var(--text-primary)] font-medium">
                      {item.name}
                      {item.quantity > 1 ? ` x${item.quantity}` : ''}
                    </span>
                    <span className="text-[var(--text-secondary)]">
                      ${item.lineTotal.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>

              {/* Totals */}
              <div className="border-t border-[var(--border-subtle)] pt-2 space-y-1">
                <div className="flex justify-between text-sm text-[var(--text-tertiary)]">
                  <span>Subtotal</span>
                  <span>${subtotal.toFixed(2)}</span>
                </div>
                {taxAmount > 0 && (
                  <div className="flex justify-between text-sm text-[var(--text-tertiary)]">
                    <span>Tax</span>
                    <span>${taxAmount.toFixed(2)}</span>
                  </div>
                )}
                {tipAmount > 0 && (
                  <div className="flex justify-between text-sm text-[var(--text-tertiary)]">
                    <span>Tip</span>
                    <span>${tipAmount.toFixed(2)}</span>
                  </div>
                )}
              </div>

              {/* Gift card applied */}
              {appliedGiftCard && (
                <div className="border-t border-[var(--border-subtle)] pt-2 space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-[var(--accent-primary)] font-medium flex items-center gap-1">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 11.25v8.25a1.5 1.5 0 01-1.5 1.5H5.25a1.5 1.5 0 01-1.5-1.5v-8.25M12 4.875A2.625 2.625 0 109.375 7.5H12m0-2.625V7.5m0-2.625A2.625 2.625 0 1114.625 7.5H12m0 0V21m-8.625-9.75h18c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125h-18c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                      </svg>
                      Gift Card ({formatGiftCardCode(appliedGiftCard.code)})
                    </span>
                    <span className="text-[var(--accent-primary)] font-medium">
                      -${appliedGiftCard.amountApplied.toFixed(2)}
                    </span>
                  </div>
                </div>
              )}

              {/* Grand total */}
              <div className="border-t-2 border-[var(--text-primary)] pt-3 flex items-baseline justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-tertiary)]">
                  {appliedGiftCard ? 'Remaining Due' : 'Total'}
                </span>
                <span className="text-[24px] font-bold text-[var(--text-primary)] tracking-tight leading-none">
                  ${effectiveTotal.toFixed(2)}
                </span>
              </div>
            </div>

            {/* Queue customer badge */}
            {activeQueueEntry && (
              <div className="bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-xl p-3 flex items-center gap-3">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                  style={{ backgroundColor: 'var(--accent-primary)' }}
                >
                  {activeQueueEntry.name
                    .split(' ')
                    .map((w) => w[0])
                    .join('')
                    .toUpperCase()
                    .slice(0, 2)}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                    {activeQueueEntry.name}
                  </p>
                  <p className="text-xs text-[var(--text-tertiary)]">
                    Receipt info ready
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Right column — Payment Paths */}
          <div className="md:w-1/2 space-y-4">

            {/* ── Stripe not connected banner ── */}
            {!stripeConnected && (
              <div className="bg-[var(--surface-subtle)] border border-[var(--border-default)] rounded-xl p-4 mb-2">
                <p className="text-sm text-[var(--text-secondary)]">
                  Connect Stripe in Settings to accept card payments directly through Sunstone Studio. Customers pay via QR code or text link with automatic tracking.
                </p>
              </div>
            )}

            {/* ── PATH 1: Charge Customer ── */}
            {stripeConnected && (
              <>
                {path !== 'external' && (
                  <div className="space-y-3">
                    {path !== 'charge' && (
                      <button
                        onClick={() => setPath('charge')}
                        className="w-full rounded-2xl p-5 text-left transition-all min-h-[80px]"
                        style={{ backgroundColor: 'var(--accent-primary)', color: 'white' }}
                      >
                        <div className="text-lg font-bold">Charge Customer</div>
                        <p className="text-sm opacity-80 mt-0.5">QR code or text link — card payment</p>
                      </button>
                    )}

                    {path === 'charge' && (
                      <>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-tertiary)]">
                          How should the customer pay?
                        </p>
                        <div className="grid grid-cols-2 gap-3">
                          <button
                            onClick={() => startStripePayment('qr')}
                            disabled={creating}
                            className="py-6 rounded-2xl text-center transition-all min-h-[100px] flex flex-col items-center justify-center gap-2 bg-[var(--surface-raised)] border border-[var(--border-default)] text-[var(--text-primary)] hover:border-[var(--accent-primary)] hover:shadow-sm disabled:opacity-50"
                          >
                            <QRIcon />
                            <div className="font-bold text-base">Show QR Code</div>
                            <p className="text-xs text-[var(--text-tertiary)] px-2">Customer scans & pays on their phone</p>
                          </button>
                          <button
                            onClick={() => startStripePayment('text')}
                            disabled={creating}
                            className="py-6 rounded-2xl text-center transition-all min-h-[100px] flex flex-col items-center justify-center gap-2 bg-[var(--surface-raised)] border border-[var(--border-default)] text-[var(--text-primary)] hover:border-[var(--accent-primary)] hover:shadow-sm disabled:opacity-50"
                          >
                            <TextIcon />
                            <div className="font-bold text-base">Text Link</div>
                            <p className="text-xs text-[var(--text-tertiary)] px-2">Send payment link via SMS</p>
                          </button>
                        </div>
                        {creating && (
                          <div className="flex items-center justify-center gap-2 text-[var(--text-tertiary)] py-2">
                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--accent-primary)] border-t-transparent" />
                            <span className="text-sm">Creating payment link...</span>
                          </div>
                        )}
                        <button
                          onClick={() => setPath(null)}
                          className="text-sm text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors min-h-[44px]"
                        >
                          Back
                        </button>
                      </>
                    )}
                  </div>
                )}
              </>
            )}

            {/* ── Gift Card ── */}
            {path === null && !appliedGiftCard && (
              <button
                onClick={() => setShowGiftCardRedeem(true)}
                className="w-full rounded-xl p-3 text-left transition-all border border-dashed border-[var(--border-default)] hover:border-[var(--border-strong)] min-h-[48px] flex items-center gap-3"
              >
                <svg className="w-5 h-5 text-[var(--text-tertiary)] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 11.25v8.25a1.5 1.5 0 01-1.5 1.5H5.25a1.5 1.5 0 01-1.5-1.5v-8.25M12 4.875A2.625 2.625 0 109.375 7.5H12m0-2.625V7.5m0-2.625A2.625 2.625 0 1114.625 7.5H12m0 0V21m-8.625-9.75h18c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125h-18c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                </svg>
                <div>
                  <div className="text-sm font-medium text-[var(--text-primary)]">Apply Gift Card</div>
                  <p className="text-xs text-[var(--text-tertiary)]">Redeem a gift card code</p>
                </div>
              </button>
            )}

            {/* ── Gift Card Applied Banner ── */}
            {appliedGiftCard && appliedGiftCard.remainingDue > 0 && path === null && (
              <div className="rounded-xl p-3 border border-[var(--accent-primary)] bg-[color-mix(in_srgb,var(--accent-primary)_8%,white)] flex items-center justify-between min-h-[48px]">
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-[var(--accent-primary)] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div>
                    <p className="text-sm font-medium text-[var(--text-primary)]">
                      Gift card applied: -${appliedGiftCard.amountApplied.toFixed(2)}
                    </p>
                    <p className="text-xs text-[var(--text-tertiary)]">
                      Collect ${appliedGiftCard.remainingDue.toFixed(2)} remaining
                    </p>
                  </div>
                </div>
                <button
                  onClick={removeGiftCard}
                  className="text-xs text-[var(--text-tertiary)] hover:text-red-600 px-2 py-1 rounded min-h-[32px]"
                >
                  Remove
                </button>
              </div>
            )}

            {/* ── PATH 2: Record External Payment ── */}
            {path !== 'charge' && (
              <div className="space-y-3">
                {path !== 'external' && (
                  <button
                    onClick={() => setPath('external')}
                    className="w-full rounded-2xl p-4 text-left transition-all border border-[var(--border-default)] bg-[var(--surface-raised)] hover:border-[var(--border-strong)] min-h-[64px]"
                  >
                    <div className="text-base font-semibold text-[var(--text-primary)]">Record External Payment</div>
                    <p className="text-xs text-[var(--text-tertiary)] mt-0.5">Already collected via cash, Venmo, or another device</p>
                  </button>
                )}

                {path === 'external' && (
                  <>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-tertiary)]">
                      How was the customer charged?
                    </p>
                    <div className="grid grid-cols-3 gap-3">
                      {([
                        { value: 'cash' as PaymentMethod, label: 'Cash', Icon: CashIcon },
                        { value: 'venmo' as PaymentMethod, label: 'Venmo / Zelle', Icon: VenmoIcon },
                        { value: 'card_external' as PaymentMethod, label: 'External Card', Icon: CardIcon },
                      ]).map(({ value, label, Icon }) => (
                        <button
                          key={value}
                          onClick={() => onSelectMethod(value)}
                          className={`py-5 rounded-2xl text-center transition-all min-h-[80px] flex flex-col items-center justify-center gap-2 ${
                            selectedMethod === value
                              ? 'bg-[var(--text-primary)] text-[var(--surface-base)] shadow-md'
                              : 'bg-[var(--surface-raised)] border border-[var(--border-default)] text-[var(--text-primary)] hover:border-[var(--border-strong)] hover:shadow-sm'
                          }`}
                        >
                          <Icon />
                          <div className="text-sm font-bold">{label}</div>
                        </button>
                      ))}
                    </div>

                    {/* Note for external card */}
                    {selectedMethod === 'card_external' && (
                      <p className="text-xs text-[var(--text-tertiary)] bg-[var(--surface-subtle)] rounded-lg p-3">
                        This records the sale for your books — it does NOT charge the customer. Make sure you&apos;ve already processed the payment on your separate device.
                      </p>
                    )}

                    {/* Complete Sale CTA */}
                    {selectedMethod && (
                      <button
                        onClick={onCompleteSale}
                        disabled={processing}
                        className="w-full h-14 rounded-xl font-semibold text-base transition-all active:scale-[0.97] shadow-sm disabled:opacity-60 min-h-[48px]"
                        style={{ backgroundColor: 'var(--accent-primary)', color: 'white' }}
                      >
                        {processing ? 'Processing...' : `Record Sale — $${effectiveTotal.toFixed(2)}`}
                      </button>
                    )}

                    <button
                      onClick={() => { setPath(null); onSelectMethod(null as any); }}
                      className="text-sm text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors min-h-[44px]"
                    >
                      Back
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Gift Card Redeem Modal */}
        <GiftCardRedeemModal
          isOpen={showGiftCardRedeem}
          onClose={() => setShowGiftCardRedeem(false)}
          orderTotal={total}
          onApply={(result) => {
            setShowGiftCardRedeem(false);
            handleGiftCardApplied(result);
          }}
        />
      </div>
    </div>
  );
}
