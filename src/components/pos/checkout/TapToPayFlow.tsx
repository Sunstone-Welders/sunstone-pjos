// ============================================================================
// TapToPayFlow — Payment collection flow screens
// ============================================================================
// Bridges to Square's native payment sheet, then renders our branded result.
// We deliberately do NOT show a "ready to tap" screen — Square's native UI is
// where the customer actually taps their card. Showing our own first would
// mislead the artist into thinking the tap goes against the wrong surface.
// ============================================================================

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  collectPayment,
  initializeTapToPay,
  activateTapToPayReader,
  isReaderConnected,
  type TapToPayResult,
} from '@/lib/tap-to-pay';

type FlowStep = 'starting' | 'result';

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
  const [step, setStep] = useState<FlowStep>('starting');
  const [result, setResult] = useState<TapToPayResult | null>(null);
  const startedRef = useRef(false);

  const startCollection = useCallback(async () => {
    try {
      // Defensive init — idempotent. The dashboard mount warms the SDK but we
      // re-authorize here so a cold-start (process killed in background) or a
      // missed warm-up still produces a working payment.
      await initializeTapToPay('square');
      // Fallback activation: if the reader didn't auto-attach during init,
      // present Square's settings sheet as a recovery path. On clean installs
      // this is a no-op because the reader is already connected.
      if (!isReaderConnected()) {
        const activation = await activateTapToPayReader();
        if (
          activation.status !== 'connected' &&
          activation.status !== 'alreadyConnected'
        ) {
          const failureResult: TapToPayResult = {
            status:
              activation.status === 'timeout'
                ? 'timed_out'
                : activation.status === 'cancelled'
                  ? 'cancelled'
                  : 'error',
            errorMessage:
              'Card reader not available. Use QR Code or Text Link instead.',
          };
          setResult(failureResult);
          setStep('result');
          onComplete(failureResult);
          return;
        }
      }
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

  // Start collection immediately on mount. Square's native sheet takes over
  // the screen within a fraction of a second, so the "Starting payment..."
  // state is just a brief honest indicator that we're handing off.
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void startCollection();
  }, [startCollection]);

  const handleRetry = () => {
    setResult(null);
    setStep('starting');
    onRetry();
    startedRef.current = false;
    void startCollection();
  };

  return (
    <div className="fixed inset-0 z-[60] bg-[var(--surface-base)] flex flex-col items-center justify-center px-8">

      {/* ── Starting (handing off to Square's native sheet) ── */}
      {step === 'starting' && (
        <div className="w-full max-w-sm text-center space-y-6">
          <div className="flex justify-center">
            <div className="w-12 h-12 animate-spin rounded-full border-4 border-[var(--border-default)] border-t-[var(--accent-primary)]" />
          </div>
          <p className="text-base text-[var(--text-secondary)]">
            Starting payment&hellip;
          </p>
          <button
            onClick={onCancel}
            className="w-full h-12 rounded-xl font-medium text-base border border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)] transition-colors min-h-[48px]"
          >
            Cancel
          </button>
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

          {/* Cancelled (user cancelled from Square's sheet) */}
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
