// ============================================================================
// TapToPayFlow — drives the Mobile Payments SDK from the POS
// src/components/pos/checkout/TapToPayFlow.tsx
// ============================================================================
// Full-screen overlay that:
//   1. Ensures the SDK is authorized (re-fetches credentials if not)
//   2. Calls collectPayment()
//   3. Reports the result via onComplete (success | cancelled | declined | error)
//
// The native SDK presents its own payment sheet, so this component mostly
// shows progress text while the sheet is up.
// ============================================================================

'use client';

import { useEffect, useRef, useState } from 'react';
import {
  collectPayment,
  getConfigurationProgress,
  initializeTapToPay,
  type TapToPayProcessor,
  type TapToPayResult,
} from '@/lib/tap-to-pay';

interface TapToPayFlowProps {
  /** Sale amount in dollars (PaymentScreen passes `total` directly). */
  amountDollars: number;
  currency?: string;
  processor: TapToPayProcessor;
  note?: string;
  onComplete: (result: TapToPayResult) => void;
  onCancel: () => void;
}

type Phase = 'authorizing' | 'collecting' | 'success' | 'failed';

export function TapToPayFlow({
  amountDollars,
  currency = 'USD',
  processor,
  note,
  onComplete,
  onCancel,
}: TapToPayFlowProps) {
  const [phase, setPhase] = useState<Phase>('authorizing');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [result, setResult] = useState<TapToPayResult | null>(null);
  // Guard against React 18 strict-mode dev double-invoke firing the SDK twice
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const run = async () => {
      try {
        // 1. Make sure the SDK has fresh credentials. The SDK retains
        //    authorization across the process lifetime, so re-init is cheap
        //    and idempotent — but if the app was killed since Settings setup,
        //    we need to fetch and authorize now.
        const { authorized } = await getConfigurationProgress(processor);
        if (!authorized) {
          const credsRes = await fetch('/api/square/mobile-payments-auth', {
            method: 'POST',
            credentials: 'include',
          });
          if (!credsRes.ok) {
            const body = await credsRes.json().catch(() => ({}));
            throw new Error(
              body.error ?? 'Could not load Square credentials. Reconnect Square in Settings.'
            );
          }
          const { accessToken, locationId, applicationId } = await credsRes.json();
          await initializeTapToPay(processor, { accessToken, locationId, applicationId });
        }

        // 2. Collect the payment. The SDK presents its native sheet here.
        setPhase('collecting');
        const amountCents = Math.round(amountDollars * 100);
        const r = await collectPayment(amountCents, currency, processor, note);
        setResult(r);

        if (r.status === 'success') {
          setPhase('success');
          // Short pause so the user sees confirmation before parent advances.
          setTimeout(() => onComplete(r), 900);
        } else if (r.status === 'cancelled') {
          // User backed out of the SDK sheet — bubble up so the parent can
          // return to method selection without a noisy error.
          onCancel();
        } else {
          setPhase('failed');
          setErrorMessage(r.errorMessage ?? 'Payment could not be completed.');
        }
      } catch (err: any) {
        setPhase('failed');
        setErrorMessage(err?.message ?? 'Tap to Pay failed unexpectedly.');
      }
    };

    void run();
  }, [amountDollars, currency, processor, note, onComplete, onCancel]);

  const retry = () => {
    startedRef.current = false;
    setErrorMessage(null);
    setResult(null);
    setPhase('authorizing');
    // Re-run by tripping the ref + state — the useEffect doesn't re-fire on
    // these state changes, so manually invoke.
    startedRef.current = true;
    (async () => {
      try {
        setPhase('collecting');
        const r = await collectPayment(
          Math.round(amountDollars * 100),
          currency,
          processor,
          note
        );
        setResult(r);
        if (r.status === 'success') {
          setPhase('success');
          setTimeout(() => onComplete(r), 900);
        } else if (r.status === 'cancelled') {
          onCancel();
        } else {
          setPhase('failed');
          setErrorMessage(r.errorMessage ?? 'Payment could not be completed.');
        }
      } catch (err: any) {
        setPhase('failed');
        setErrorMessage(err?.message ?? 'Tap to Pay failed unexpectedly.');
      }
    })();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--surface-base)] px-6">
      <div className="w-full max-w-md text-center space-y-6">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-tertiary)]">
            Tap to Pay
          </p>
          <p className="text-[40px] font-bold text-[var(--text-primary)] tracking-tight leading-none mt-1">
            ${amountDollars.toFixed(2)}
          </p>
        </div>

        {phase === 'authorizing' && (
          <div className="space-y-3 py-8">
            <Spinner />
            <p className="text-sm text-[var(--text-secondary)]">
              Preparing card reader...
            </p>
          </div>
        )}

        {phase === 'collecting' && (
          <div className="space-y-3 py-8">
            <Spinner />
            <p className="text-sm text-[var(--text-secondary)]">
              Hold the customer&apos;s card near your device.
            </p>
            <p className="text-xs text-[var(--text-tertiary)]">
              Follow the prompts on screen.
            </p>
          </div>
        )}

        {phase === 'success' && (
          <div className="space-y-3 py-8">
            <div className="mx-auto text-[var(--accent-primary)] animate-[scale-in_0.3s_ease-out]">
              <CheckCircle />
            </div>
            <p className="text-lg font-semibold text-[var(--text-primary)]">
              Payment received
            </p>
            {result?.cardBrand && result?.last4 && (
              <p className="text-sm text-[var(--text-tertiary)]">
                {result.cardBrand} ····{result.last4}
              </p>
            )}
          </div>
        )}

        {phase === 'failed' && (
          <div className="space-y-4 py-4">
            <p className="text-sm text-red-600">
              {errorMessage ?? 'Payment could not be completed.'}
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={retry}
                className="w-full h-12 rounded-xl font-semibold text-base min-h-[48px]"
                style={{ backgroundColor: 'var(--accent-primary)', color: 'white' }}
              >
                Try Again
              </button>
              <button
                onClick={onCancel}
                className="w-full h-12 rounded-xl font-medium text-sm text-[var(--text-secondary)] border border-[var(--border-default)] min-h-[48px]"
              >
                Use a Different Payment Method
              </button>
            </div>
          </div>
        )}

        {phase !== 'failed' && phase !== 'success' && (
          <button
            onClick={onCancel}
            className="text-sm text-[var(--text-tertiary)] hover:text-[var(--text-primary)] min-h-[44px]"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

// ── Bits ────────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-[var(--accent-primary)] border-t-transparent" />
  );
}

function CheckCircle() {
  return (
    <svg
      className="mx-auto w-16 h-16"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}
