// ============================================================================
// GiftCardModal — Sell Gift Card from POS
// src/components/pos/GiftCardModal.tsx
// ============================================================================
// Two payment paths:
//   1. "Charge Customer" — Stripe Checkout via QR code or text link
//   2. "Record External Payment" — cash, venmo, external card reader
//
// Gift card is only created/activated AFTER payment is confirmed.
// ============================================================================

'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import QRCodeLib from 'qrcode';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '@/components/ui/Modal';
import { GIFT_CARD_PRESETS, formatGiftCardCode } from '@/lib/gift-cards';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import type { GiftCardDeliveryMethod } from '@/types';

interface GiftCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string;
  tenantName: string;
  stripeConnected: boolean;
  onGiftCardSold?: (giftCard: any) => void;
}

type ModalStep = 'form' | 'charge_method' | 'stripe_waiting' | 'processing' | 'success';
type ChargeMethod = null | 'qr' | 'text';

interface FormSnapshot {
  amount: number;
  recipientName: string;
  recipientPhone: string | null;
  recipientEmail: string | null;
  purchaserName: string | null;
  personalMessage: string | null;
  deliveryMethod: GiftCardDeliveryMethod;
}

export function GiftCardModal({
  isOpen,
  onClose,
  tenantId,
  tenantName,
  stripeConnected,
  onGiftCardSold,
}: GiftCardModalProps) {
  // ── Form state ──
  const [step, setStep] = useState<ModalStep>('form');
  const [amount, setAmount] = useState<number>(50);
  const [customAmount, setCustomAmount] = useState('');
  const [useCustom, setUseCustom] = useState(false);
  const [recipientName, setRecipientName] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [purchaserName, setPurchaserName] = useState('');
  const [personalMessage, setPersonalMessage] = useState('');
  const [deliveryMethod, setDeliveryMethod] = useState<GiftCardDeliveryMethod>('sms');
  const [processing, setProcessing] = useState(false);
  const [createdCard, setCreatedCard] = useState<any>(null);
  const [error, setError] = useState('');

  // ── Stripe payment state ──
  const [chargeMethod, setChargeMethod] = useState<ChargeMethod>(null);
  const [creating, setCreating] = useState(false);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [checkoutSessionId, setCheckoutSessionId] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [stripeSaleId, setStripeSaleId] = useState<string | null>(null);
  const [smsPhone, setSmsPhone] = useState('');
  const [sendingSms, setSendingSms] = useState(false);
  const [smsSent, setSmsSent] = useState(false);
  const [paymentComplete, setPaymentComplete] = useState(false);
  const [paymentTimedOut, setPaymentTimedOut] = useState(false);

  // ── Refs ──
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const pollCountRef = useRef(0);
  const formDataRef = useRef<FormSnapshot | null>(null);
  const giftCardCreatedRef = useRef(false);
  const supabase = createClient();

  const effectiveAmount = useCustom ? Number(customAmount) || 0 : amount;

  // Clean up polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // Create gift card after Stripe payment confirmed
  useEffect(() => {
    if (!paymentComplete || !stripeSaleId || giftCardCreatedRef.current) return;
    giftCardCreatedRef.current = true;
    const fd = formDataRef.current;
    if (!fd) return;

    setStep('processing');

    fetch('/api/gift-cards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        amount: fd.amount,
        recipientName: fd.recipientName,
        recipientPhone: fd.recipientPhone,
        recipientEmail: fd.recipientEmail,
        purchaserName: fd.purchaserName,
        personalMessage: fd.personalMessage,
        deliveryMethod: fd.deliveryMethod,
        paymentMethod: 'stripe_link',
        saleId: stripeSaleId,
      }),
    })
      .then(res => res.json())
      .then(data => {
        if (data.error) throw new Error(data.error);
        setCreatedCard(data);
        setStep('success');
        onGiftCardSold?.(data);
      })
      .catch(err => {
        toast.error(err.message || 'Failed to create gift card');
        setStep('form');
      });
  }, [paymentComplete, stripeSaleId, onGiftCardSold]);

  const resetForm = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    setStep('form');
    setAmount(50);
    setCustomAmount('');
    setUseCustom(false);
    setRecipientName('');
    setRecipientPhone('');
    setRecipientEmail('');
    setPurchaserName('');
    setPersonalMessage('');
    setDeliveryMethod('sms');
    setProcessing(false);
    setCreatedCard(null);
    setError('');
    setChargeMethod(null);
    setCreating(false);
    setCheckoutUrl(null);
    setCheckoutSessionId(null);
    setQrDataUrl(null);
    setStripeSaleId(null);
    setSmsPhone('');
    setSendingSms(false);
    setSmsSent(false);
    setPaymentComplete(false);
    setPaymentTimedOut(false);
    formDataRef.current = null;
    giftCardCreatedRef.current = false;
    pollCountRef.current = 0;
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const validateForm = (): boolean => {
    if (effectiveAmount <= 0) { setError('Please enter a valid amount'); return false; }
    if (!recipientName.trim()) { setError('Recipient name is required'); return false; }
    if (deliveryMethod === 'sms' && !recipientPhone.trim()) { setError('Phone number is required for text delivery'); return false; }
    if (deliveryMethod === 'email' && !recipientEmail.trim()) { setError('Email is required for email delivery'); return false; }
    setError('');
    return true;
  };

  // ── External payment (existing flow) ──

  const createGiftCard = async (paymentMethod: string) => {
    if (!validateForm()) return;
    setProcessing(true);
    setStep('processing');

    try {
      const res = await fetch('/api/gift-cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: effectiveAmount,
          recipientName: recipientName.trim(),
          recipientPhone: recipientPhone.trim() || null,
          recipientEmail: recipientEmail.trim() || null,
          purchaserName: purchaserName.trim() || null,
          personalMessage: personalMessage.trim() || null,
          deliveryMethod,
          paymentMethod,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create gift card');

      setCreatedCard(data);
      setStep('success');
      onGiftCardSold?.(data);
    } catch (err: any) {
      setError(err.message);
      setStep('form');
    } finally {
      setProcessing(false);
    }
  };

  // ── Stripe payment flow ──

  const handleChargeCustomer = () => {
    if (!validateForm()) return;
    setStep('charge_method');
  };

  const startStripePayment = async (method: 'qr' | 'text') => {
    setCreating(true);
    setChargeMethod(method);

    // Snapshot form data for post-payment gift card creation
    formDataRef.current = {
      amount: effectiveAmount,
      recipientName: recipientName.trim(),
      recipientPhone: recipientPhone.trim() || null,
      recipientEmail: recipientEmail.trim() || null,
      purchaserName: purchaserName.trim() || null,
      personalMessage: personalMessage.trim() || null,
      deliveryMethod,
    };
    giftCardCreatedRef.current = false;

    try {
      const res = await fetch('/api/gift-cards/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ amount: effectiveAmount }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Payment setup failed');
      }

      const data = await res.json();
      setCheckoutUrl(data.url);
      setCheckoutSessionId(data.sessionId || null);
      setStripeSaleId(data.saleId);
      setSmsPhone(recipientPhone);

      // Generate QR code
      if (data.url) {
        const qr = await QRCodeLib.toDataURL(data.url, {
          width: 280,
          margin: 2,
          color: { dark: '#000000', light: '#ffffff' },
        });
        setQrDataUrl(qr);
      }

      startPolling(data.saleId, data.sessionId || null);
      setStep('stripe_waiting');
    } catch (err: any) {
      toast.error(err.message || 'Payment setup failed');
      setChargeMethod(null);
      setStep('charge_method');
    } finally {
      setCreating(false);
    }
  };

  const startPolling = useCallback((saleId: string, sessionId: string | null) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollCountRef.current = 0;
    setPaymentTimedOut(false);

    pollRef.current = setInterval(async () => {
      pollCountRef.current += 1;

      if (pollCountRef.current > 200) {
        if (pollRef.current) clearInterval(pollRef.current);
        setPaymentTimedOut(true);
        return;
      }

      // Check DB (webhook updates this)
      const { data } = await supabase
        .from('sales')
        .select('payment_status')
        .eq('id', saleId)
        .single();

      if (data?.payment_status === 'completed') {
        if (pollRef.current) clearInterval(pollRef.current);
        setPaymentComplete(true);
        return;
      }

      // Check Stripe every 3rd poll
      if (sessionId && pollCountRef.current % 3 === 0) {
        try {
          const res = await fetch(`/api/stripe/session-status?sessionId=${sessionId}`);
          if (res.ok) {
            const status = await res.json();
            if (status.status === 'paid') {
              if (pollRef.current) clearInterval(pollRef.current);
              // Belt-and-suspenders: update sale status in case webhook is delayed
              await supabase.from('sales').update({
                payment_status: 'completed',
              }).eq('id', saleId).eq('payment_status', 'pending');
              setPaymentComplete(true);
              return;
            }
          }
        } catch {
          // Non-critical — continue polling DB
        }
      }
    }, 3000);
  }, [supabase]);

  const sendPaymentSms = async () => {
    if (!checkoutUrl || !smsPhone.trim()) return;
    setSendingSms(true);
    try {
      const res = await fetch('/api/stripe/send-payment-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          phone: smsPhone.trim(),
          url: checkoutUrl,
          sessionId: checkoutSessionId,
          tenantName,
          total: effectiveAmount,
        }),
      });
      const data = await res.json();
      if (data.sent) {
        setSmsSent(true);
      } else {
        toast.error(data.error || 'Failed to send payment link');
      }
    } catch {
      toast.error('Network error. Please check your connection.');
    } finally {
      setSendingSms(false);
    }
  };

  const cancelStripePayment = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    setChargeMethod(null);
    setCheckoutUrl(null);
    setCheckoutSessionId(null);
    setQrDataUrl(null);
    setSmsSent(false);
    setPaymentTimedOut(false);
    setPaymentComplete(false);
    setStripeSaleId(null);
    giftCardCreatedRef.current = false;
    setStep('form');
  };

  const retryPolling = () => {
    if (stripeSaleId) {
      setPaymentTimedOut(false);
      startPolling(stripeSaleId, checkoutSessionId);
    }
  };

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={handleClose} size="lg">
      <ModalHeader>
        <h2 className="text-xl font-semibold text-[var(--text-primary)]">
          {step === 'success' ? 'Gift Card Created!' :
           step === 'stripe_waiting' ? (chargeMethod === 'qr' ? 'Scan to Pay' : 'Text Payment Link') :
           step === 'charge_method' ? 'How Should They Pay?' :
           'Sell Gift Card'}
        </h2>
      </ModalHeader>

      <ModalBody>
        {/* ── Success screen ── */}
        {step === 'success' && createdCard && (
          <div className="text-center py-4">
            <div className="text-[var(--accent-primary)] mb-4">
              <svg className="w-16 h-16 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-2xl font-bold text-[var(--text-primary)] mb-1">
              ${Number(createdCard.amount).toFixed(2)}
            </p>
            <p className="text-sm text-[var(--text-tertiary)] mb-4">
              Gift card for {createdCard.recipient_name}
            </p>
            <div className="bg-[var(--surface-subtle)] rounded-2xl p-5 mb-4 inline-block">
              <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-tertiary)] mb-1">
                Code
              </p>
              <p className="text-3xl font-bold text-[var(--text-primary)] tracking-widest">
                {createdCard.formatted_code || formatGiftCardCode(createdCard.code)}
              </p>
            </div>
            {createdCard.delivery_method === 'sms' && (
              <p className="text-sm text-[var(--text-secondary)]">
                Sent via text to {createdCard.recipient_phone}
              </p>
            )}
            {createdCard.delivery_method === 'email' && (
              <p className="text-sm text-[var(--text-secondary)]">
                Sent via email to {createdCard.recipient_email}
              </p>
            )}
            {createdCard.delivery_method === 'print' && (
              <p className="text-sm text-[var(--text-secondary)]">
                Write down or print this code for the customer
              </p>
            )}
          </div>
        )}

        {/* ── Processing screen ── */}
        {step === 'processing' && (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--accent-primary)] border-t-transparent mb-4" />
            <p className="text-sm text-[var(--text-tertiary)]">Creating gift card...</p>
          </div>
        )}

        {/* ── Charge method selection ── */}
        {step === 'charge_method' && (
          <div className="py-4 space-y-4">
            <p className="text-center text-2xl font-bold text-[var(--text-primary)]">
              ${effectiveAmount.toFixed(2)}
            </p>
            <p className="text-center text-sm text-[var(--text-tertiary)] mb-2">
              Gift card for {recipientName}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => startStripePayment('qr')}
                disabled={creating}
                className="py-6 rounded-2xl text-center transition-all min-h-[100px] flex flex-col items-center justify-center gap-2 bg-[var(--surface-raised)] border border-[var(--border-default)] text-[var(--text-primary)] hover:border-[var(--accent-primary)] hover:shadow-sm disabled:opacity-50"
              >
                <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 6.75h.75v.75h-.75v-.75zM6.75 16.5h.75v.75h-.75v-.75zM16.5 6.75h.75v.75h-.75v-.75zM13.5 13.5h.75v.75h-.75v-.75zM13.5 19.5h.75v.75h-.75v-.75zM19.5 13.5h.75v.75h-.75v-.75zM19.5 19.5h.75v.75h-.75v-.75zM16.5 16.5h.75v.75h-.75v-.75z" />
                </svg>
                <div className="font-bold text-base">Show QR Code</div>
                <p className="text-xs text-[var(--text-tertiary)] px-2">Customer scans & pays</p>
              </button>
              <button
                onClick={() => startStripePayment('text')}
                disabled={creating}
                className="py-6 rounded-2xl text-center transition-all min-h-[100px] flex flex-col items-center justify-center gap-2 bg-[var(--surface-raised)] border border-[var(--border-default)] text-[var(--text-primary)] hover:border-[var(--accent-primary)] hover:shadow-sm disabled:opacity-50"
              >
                <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
                </svg>
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
          </div>
        )}

        {/* ── Stripe waiting — QR ── */}
        {step === 'stripe_waiting' && chargeMethod === 'qr' && (
          <div className="flex flex-col items-center py-4">
            <p className="text-2xl font-bold text-[var(--text-primary)] mb-1">
              ${effectiveAmount.toFixed(2)}
            </p>
            <p className="text-sm text-[var(--text-tertiary)] mb-6">
              Gift card for {recipientName}
            </p>
            <div className="bg-white p-4 rounded-2xl shadow-lg mb-6">
              {qrDataUrl ? (
                <img src={qrDataUrl} alt="Payment QR Code" className="w-56 h-56" />
              ) : (
                <div className="w-56 h-56 flex items-center justify-center">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--text-primary)] border-t-transparent" />
                </div>
              )}
            </div>
            {paymentTimedOut ? (
              <div className="flex flex-col items-center gap-3">
                <p className="text-sm text-[var(--text-secondary)]">Payment timed out</p>
                <button
                  onClick={retryPolling}
                  className="px-4 py-2.5 rounded-xl text-sm font-medium border border-[var(--accent-primary)] text-[var(--accent-primary)] hover:bg-[var(--accent-50)] transition-colors min-h-[44px]"
                >
                  Check Again
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-[var(--text-tertiary)]">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--accent-primary)] border-t-transparent" />
                <span className="text-sm">Waiting for payment...</span>
              </div>
            )}
          </div>
        )}

        {/* ── Stripe waiting — Text ── */}
        {step === 'stripe_waiting' && chargeMethod === 'text' && (
          <div className="py-4 space-y-4">
            <p className="text-center text-2xl font-bold text-[var(--text-primary)]">
              ${effectiveAmount.toFixed(2)}
            </p>
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
                {sendingSms ? 'Sending...' : `Send Payment Link — $${effectiveAmount.toFixed(2)}`}
              </button>
            ) : (
              <div className="text-center space-y-3">
                <div className="bg-[var(--surface-subtle)] rounded-xl p-4">
                  <p className="text-sm font-medium text-[var(--text-primary)]">
                    Link sent to {smsPhone}
                  </p>
                  {paymentTimedOut ? (
                    <div className="flex flex-col items-center gap-2 mt-2">
                      <p className="text-sm text-[var(--text-secondary)]">Payment timed out</p>
                      <button
                        onClick={retryPolling}
                        className="text-sm text-[var(--accent-primary)] hover:underline min-h-[44px]"
                      >
                        Check Again
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center gap-2 mt-2 text-[var(--text-tertiary)]">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--accent-primary)] border-t-transparent" />
                      <span className="text-sm">Waiting for payment...</span>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => { setSmsSent(false); sendPaymentSms(); }}
                  className="text-sm text-[var(--accent-primary)] hover:underline min-h-[44px]"
                >
                  Resend Link
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Form ── */}
        {step === 'form' && (
          <div className="space-y-5">
            {error && (
              <div className="bg-red-50 text-red-700 text-sm rounded-xl p-3">
                {error}
              </div>
            )}

            {/* Amount selection */}
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-tertiary)] mb-2">
                Amount
              </label>
              <div className="flex flex-wrap gap-2 mb-2">
                {GIFT_CARD_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    onClick={() => { setAmount(preset); setUseCustom(false); }}
                    className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-all min-h-[44px] ${
                      !useCustom && amount === preset
                        ? 'bg-[var(--text-primary)] text-[var(--surface-base)]'
                        : 'bg-[var(--surface-subtle)] text-[var(--text-primary)] hover:bg-[var(--surface-raised)]'
                    }`}
                  >
                    ${preset}
                  </button>
                ))}
                <button
                  onClick={() => setUseCustom(true)}
                  className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-all min-h-[44px] ${
                    useCustom
                      ? 'bg-[var(--text-primary)] text-[var(--surface-base)]'
                      : 'bg-[var(--surface-subtle)] text-[var(--text-primary)] hover:bg-[var(--surface-raised)]'
                  }`}
                >
                  Custom
                </button>
              </div>
              {useCustom && (
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] font-medium">$</span>
                  <input
                    type="number"
                    value={customAmount}
                    onChange={(e) => setCustomAmount(e.target.value)}
                    placeholder="0.00"
                    min="1"
                    step="0.01"
                    className="w-full h-12 pl-8 pr-4 rounded-xl border border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--text-primary)] text-base focus:outline-none focus:border-[var(--accent-primary)] focus:ring-2 focus:ring-[var(--accent-primary)]/20"
                    autoFocus
                  />
                </div>
              )}
            </div>

            {/* Recipient info */}
            <div className="space-y-3">
              <label className="block text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-tertiary)]">
                Recipient
              </label>
              <input
                type="text"
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                placeholder="Recipient name *"
                className="w-full h-12 px-4 rounded-xl border border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--text-primary)] text-base focus:outline-none focus:border-[var(--accent-primary)] focus:ring-2 focus:ring-[var(--accent-primary)]/20"
              />
              <input
                type="tel"
                value={recipientPhone}
                onChange={(e) => setRecipientPhone(e.target.value)}
                placeholder="Phone (for text delivery)"
                className="w-full h-12 px-4 rounded-xl border border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--text-primary)] text-base focus:outline-none focus:border-[var(--accent-primary)] focus:ring-2 focus:ring-[var(--accent-primary)]/20"
              />
              <input
                type="email"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                placeholder="Email (for email delivery)"
                className="w-full h-12 px-4 rounded-xl border border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--text-primary)] text-base focus:outline-none focus:border-[var(--accent-primary)] focus:ring-2 focus:ring-[var(--accent-primary)]/20"
              />
            </div>

            {/* Purchaser name */}
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-tertiary)] mb-2">
                From (optional)
              </label>
              <input
                type="text"
                value={purchaserName}
                onChange={(e) => setPurchaserName(e.target.value)}
                placeholder="Purchaser name"
                className="w-full h-12 px-4 rounded-xl border border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--text-primary)] text-base focus:outline-none focus:border-[var(--accent-primary)] focus:ring-2 focus:ring-[var(--accent-primary)]/20"
              />
            </div>

            {/* Personal message */}
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-tertiary)] mb-2">
                Personal Message (optional)
              </label>
              <textarea
                value={personalMessage}
                onChange={(e) => setPersonalMessage(e.target.value)}
                placeholder="Add a personal message..."
                rows={2}
                maxLength={200}
                className="w-full px-4 py-3 rounded-xl border border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--text-primary)] text-base resize-none focus:outline-none focus:border-[var(--accent-primary)] focus:ring-2 focus:ring-[var(--accent-primary)]/20"
              />
            </div>

            {/* Delivery method */}
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-tertiary)] mb-2">
                Delivery
              </label>
              <div className="flex gap-2">
                {([
                  { value: 'sms' as GiftCardDeliveryMethod, label: 'Text' },
                  { value: 'email' as GiftCardDeliveryMethod, label: 'Email' },
                  { value: 'print' as GiftCardDeliveryMethod, label: 'Print / Tell' },
                  { value: 'none' as GiftCardDeliveryMethod, label: 'None' },
                ]).map(({ value, label }) => (
                  <button
                    key={value}
                    onClick={() => setDeliveryMethod(value)}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all min-h-[44px] ${
                      deliveryMethod === value
                        ? 'bg-[var(--text-primary)] text-[var(--surface-base)]'
                        : 'bg-[var(--surface-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </ModalBody>

      <ModalFooter>
        {step === 'success' ? (
          <button
            onClick={handleClose}
            className="w-full h-12 rounded-xl font-semibold text-base transition-all min-h-[48px]"
            style={{ backgroundColor: 'var(--accent-primary)', color: 'white' }}
          >
            Done
          </button>
        ) : step === 'form' ? (
          <div className="w-full space-y-3">
            {stripeConnected && (
              <button
                onClick={handleChargeCustomer}
                disabled={processing || effectiveAmount <= 0}
                className="w-full h-12 rounded-xl font-semibold text-base transition-all min-h-[48px]"
                style={{ backgroundColor: 'var(--accent-primary)', color: 'white' }}
              >
                Charge Customer — ${effectiveAmount > 0 ? effectiveAmount.toFixed(2) : '0.00'}
              </button>
            )}
            <button
              onClick={() => createGiftCard('external')}
              disabled={processing || effectiveAmount <= 0}
              className="w-full h-12 rounded-xl font-semibold text-base transition-all border border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--text-primary)] hover:border-[var(--border-strong)] disabled:opacity-50 min-h-[48px]"
            >
              Record External Payment — ${effectiveAmount > 0 ? effectiveAmount.toFixed(2) : '0.00'}
            </button>
          </div>
        ) : step === 'charge_method' ? (
          <button
            onClick={() => setStep('form')}
            className="w-full text-sm text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors min-h-[44px]"
          >
            Back
          </button>
        ) : step === 'stripe_waiting' ? (
          <div className="w-full flex justify-center gap-3">
            <button
              onClick={() => setChargeMethod(chargeMethod === 'qr' ? 'text' : 'qr')}
              className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] min-h-[44px]"
            >
              {chargeMethod === 'qr' ? 'Text Link Instead' : 'Show QR Instead'}
            </button>
            <button
              onClick={cancelStripePayment}
              className="text-sm text-[var(--text-tertiary)] hover:text-[var(--text-primary)] min-h-[44px]"
            >
              Cancel
            </button>
          </div>
        ) : null}
      </ModalFooter>
    </Modal>
  );
}
