// ============================================================================
// TapToPayFlow — Payment collection flow screens
// ============================================================================
// Shows: Ready to Tap → Processing → Result (success/declined/timeout/error)
// Full-screen overlay rendered on top of PaymentScreen.
// ============================================================================

'use client';

import { useState, useEffect, useCallback } from 'react';
import { collectPayment, initializeTapToPay, type TapToPayResult } from '@/lib/tap-to-pay';

// ── Contactless icon (SF Symbol wave.3.right.circle equivalent) ──
const ContactlessWaveIcon = ({ className = 'w-20 h-20' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 80 80" fill="none">
    <circle cx="40" cy="40" r="38" stroke="currentColor" strokeWidth="2" opacity="0.15" />
    <path d="M32 40c0-4.4 3.6-8 8-8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    <path d="M32 40c0-8.8 7.2-16 16-16" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    <path d="M32 40c0-13.3 10.7-24 24-24" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    <circle cx="32" cy="40" r="3" fill="currentColor" />
  </svg>
);

type FlowStep = 'ready' | 'processing' | 'result';

interface TapToPayFlowProps {
  amountCents: number;
  amountDisplay: string;      // e.g. "$75.00"
  onComplete: (result: TapToPayResult) => void;
  onCancel: () => void;
  onRetry: () => void;
  onUseAnotherMethod: () => void;
}

export default function TapToPayFlow({
  amountCents,
  amountDisplay,
  onComplete,
  onCancel,
  onRetry,
  onUseAnotherMethod,
}: TapToPayFlowProps) {
  const [step, setStep] = useState<FlowStep>('ready');
  const [result, setResult] = useState<TapToPayResult | null>(null);

  const startCollection = useCallback(async () => {
    setStep('processing');
    try {
      // Defensive init — idempotent. The POS screen warms the SDK at mount
      // but we re-authorize here so a cold-start (process killed in background)
      // or a missed warm-up still produces a working payment.
      await initializeTapToPay('square');
      const res = await collectPayment(amountCents, 'usd');
      setResult(res);
      setStep('result');
      onComplete(res);
    } catch (err: any) {
      setResult({
        status: 'error',
        errorMessage: err?.message ?? 'An unexpected error occurred.',
      });
      setStep('result');
    }
  }, [amountCents, onComplete]);

  // Auto-start collection when mounted (simulate tap detected)
  useEffect(() => {
    // In production, the "ready" screen waits for the native SDK to detect a card.
    // For the UX shell, we show the ready screen for 2 seconds then move to processing.
    const timer = setTimeout(() => {
      startCollection();
    }, 2000);
    return () => clearTimeout(timer);
  }, [startCollection]);

  const handleRetry = () => {
    setResult(null);
    setStep('ready');
    onRetry();
    // Restart collection
    setTimeout(() => startCollection(), 1500);
  };

  return (
    <div className="fixed inset-0 z-[60] bg-[var(--surface-base)] flex flex-col items-center justify-center px-8">

      {/* ── Ready to Tap ── */}
      {step === 'ready' && (
        <div className="w-full max-w-sm text-center space-y-8">
          {/* Pulsing contactless icon */}
          <div className="flex justify-center">
            <div className="relative">
              <div className="absolute inset-0 animate-ping opacity-20 rounded-full"
                style={{ backgroundColor: 'var(--accent-primary)' }}
              />
              <div className="relative text-[var(--accent-primary)]">
                <ContactlessWaveIcon className="w-28 h-28" />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-[var(--text-primary)] font-[family-name:var(--font-display)]">
              Ready to Tap
            </h2>
            <p className="text-base text-[var(--text-secondary)]">
              Hold customer&apos;s card or phone near the top of your device
            </p>
            <p className="text-2xl font-bold text-[var(--text-primary)] mt-4">{amountDisplay}</p>
          </div>

          <button
            onClick={onCancel}
            className="w-full h-12 rounded-xl font-medium text-base border border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)] transition-colors min-h-[48px]"
          >
            Cancel
          </button>
        </div>
      )}

      {/* ── Processing ── */}
      {step === 'processing' && (
        <div className="w-full max-w-sm text-center space-y-6">
          <div className="flex justify-center">
            <div className="w-16 h-16 animate-spin rounded-full border-4 border-[var(--border-default)] border-t-[var(--accent-primary)]" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-[var(--text-primary)] font-[family-name:var(--font-display)]">
              Processing payment...
            </h2>
            <p className="text-lg font-semibold text-[var(--text-secondary)]">{amountDisplay}</p>
          </div>
        </div>
      )}

      {/* ── Result ── */}
      {step === 'result' && result && (
        <div className="w-full max-w-sm text-center space-y-6">
          {/* Success */}
          {result.status === 'success' && (
            <>
              <div className="flex justify-center">
                <div className="w-20 h-20 rounded-full bg-green-50 flex items-center justify-center">
                  <svg className="w-10 h-10 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
              <div className="space-y-1">
                <h2 className="text-2xl font-bold text-green-700 font-[family-name:var(--font-display)]">
                  Payment Approved
                </h2>
                {result.cardBrand && result.last4 && (
                  <p className="text-sm text-[var(--text-secondary)]">
                    {result.cardBrand} •••• {result.last4}
                  </p>
                )}
                <p className="text-2xl font-bold text-[var(--text-primary)] mt-2">{amountDisplay}</p>
              </div>
              <button
                onClick={onUseAnotherMethod}
                className="w-full h-14 rounded-xl font-semibold text-base text-white transition-all active:scale-[0.97] min-h-[48px]"
                style={{ backgroundColor: 'var(--accent-primary)' }}
              >
                Done
              </button>
            </>
          )}

          {/* Declined */}
          {result.status === 'declined' && (
            <>
              <div className="flex justify-center">
                <div className="w-20 h-20 rounded-full bg-red-50 flex items-center justify-center">
                  <svg className="w-10 h-10 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </div>
              </div>
              <div className="space-y-1">
                <h2 className="text-2xl font-bold text-red-700 font-[family-name:var(--font-display)]">
                  Payment Declined
                </h2>
                <p className="text-sm text-[var(--text-secondary)]">
                  The card was declined. Try another card or payment method.
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleRetry}
                  className="flex-1 h-14 rounded-xl font-semibold text-base text-white transition-all active:scale-[0.97] min-h-[48px]"
                  style={{ backgroundColor: 'var(--accent-primary)' }}
                >
                  Try Again
                </button>
                <button
                  onClick={onUseAnotherMethod}
                  className="flex-1 h-14 rounded-xl font-semibold text-base border border-[var(--border-default)] text-[var(--text-primary)] hover:bg-[var(--surface-subtle)] transition-colors min-h-[48px]"
                >
                  Use Another Method
                </button>
              </div>
            </>
          )}

          {/* Timed out */}
          {result.status === 'timed_out' && (
            <>
              <div className="flex justify-center">
                <div className="w-20 h-20 rounded-full bg-yellow-50 flex items-center justify-center">
                  <svg className="w-10 h-10 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                  </svg>
                </div>
              </div>
              <div className="space-y-1">
                <h2 className="text-2xl font-bold text-yellow-700 font-[family-name:var(--font-display)]">
                  No Card Detected
                </h2>
                <p className="text-sm text-[var(--text-secondary)]">
                  The payment timed out. Make sure the card is held near the top of your device.
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleRetry}
                  className="flex-1 h-14 rounded-xl font-semibold text-base text-white transition-all active:scale-[0.97] min-h-[48px]"
                  style={{ backgroundColor: 'var(--accent-primary)' }}
                >
                  Try Again
                </button>
                <button
                  onClick={onUseAnotherMethod}
                  className="flex-1 h-14 rounded-xl font-semibold text-base border border-[var(--border-default)] text-[var(--text-primary)] hover:bg-[var(--surface-subtle)] transition-colors min-h-[48px]"
                >
                  Use Another Method
                </button>
              </div>
            </>
          )}

          {/* Error */}
          {result.status === 'error' && (
            <>
              <div className="flex justify-center">
                <div className="w-20 h-20 rounded-full bg-red-50 flex items-center justify-center">
                  <svg className="w-10 h-10 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                  </svg>
                </div>
              </div>
              <div className="space-y-1">
                <h2 className="text-2xl font-bold text-red-700 font-[family-name:var(--font-display)]">
                  Something Went Wrong
                </h2>
                <p className="text-sm text-[var(--text-secondary)]">
                  {result.errorMessage || 'An unexpected error occurred. Please try again.'}
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleRetry}
                  className="flex-1 h-14 rounded-xl font-semibold text-base text-white transition-all active:scale-[0.97] min-h-[48px]"
                  style={{ backgroundColor: 'var(--accent-primary)' }}
                >
                  Try Again
                </button>
                <button
                  onClick={onUseAnotherMethod}
                  className="flex-1 h-14 rounded-xl font-semibold text-base border border-[var(--border-default)] text-[var(--text-primary)] hover:bg-[var(--surface-subtle)] transition-colors min-h-[48px]"
                >
                  Use Another Method
                </button>
              </div>
            </>
          )}

          {/* Cancelled (user cancelled from ready screen) */}
          {result.status === 'cancelled' && (
            <>
              <div className="space-y-1">
                <h2 className="text-xl font-bold text-[var(--text-primary)] font-[family-name:var(--font-display)]">
                  Payment Cancelled
                </h2>
              </div>
              <button
                onClick={onUseAnotherMethod}
                className="w-full h-14 rounded-xl font-semibold text-base border border-[var(--border-default)] text-[var(--text-primary)] hover:bg-[var(--surface-subtle)] transition-colors min-h-[48px]"
              >
                Back to Payment Options
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
