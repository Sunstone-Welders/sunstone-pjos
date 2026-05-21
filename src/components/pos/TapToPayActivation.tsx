// ============================================================================
// TapToPayActivation — Branded reader activation overlay
// src/components/pos/TapToPayActivation.tsx
// ============================================================================
// Wraps Square's `presentSettings` flow in Sunstone UI. Driven by
// `activateTapToPayReader()` (which calls the native plugin's activateReader);
// the Swift side presents Square's settings sheet on top of this overlay and
// auto-dismisses it via `SettingsManager.dismissSettings()` when the embedded
// reader attaches.
//
// States:
//   activating  — fresh call, spinner + "Setting up your card reader…"
//   nudging     — after 15s, hints that the user may need to confirm in
//                 the system sheet sitting on top
//   timeout     — after 75s without reader, shows error + retry CTA
//                 (fires before the Swift-side 90s hard timeout so the
//                 user sees branded feedback first)
//   error       — explicit error from the native plugin
//
// The overlay listens for `readerConnected` and `readerActivationTimedOut`
// events from the plugin so it auto-dismisses even when the activation
// resolves outside the awaited promise (e.g. another caller already drove
// it to completion). Listener registration is intentionally split into its
// own mount-only effect so callback identity changes from the parent don't
// thrash the Capacitor bridge with addListener/removeListener pairs.
// ============================================================================

'use client';

import { useEffect, useRef, useState } from 'react';
import {
  activateTapToPayReader,
  type ActivationResult,
} from '@/lib/tap-to-pay';
import { SquareTapToPay } from '@/plugins/square-tap-to-pay';
import type { PluginListenerHandle } from '@capacitor/core';

type ActivationStage = 'activating' | 'nudging' | 'timeout' | 'error';

interface TapToPayActivationProps {
  /** Fired when the reader is connected (or was already connected). */
  onConnected: () => void;
  /** User chose to skip — overlay should close, POS still loads underneath. */
  onSkip: () => void;
}

const NUDGE_DELAY_MS = 15_000;
const TIMEOUT_HINT_MS = 75_000;

export default function TapToPayActivation({
  onConnected,
  onSkip,
}: TapToPayActivationProps) {
  const [stage, setStage] = useState<ActivationStage>('activating');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // attemptKey forces the activation effect to re-run when the user taps
  // "Try again" — bumping the key restarts the lifecycle cleanly.
  const [attemptKey, setAttemptKey] = useState(0);
  const cancelledRef = useRef(false);

  // Mirror the latest callbacks into refs so the mount-only listener effect
  // below can call them without listing them in its dependency array — that
  // was the source of the addListener/removeListener thrashing.
  const onConnectedRef = useRef(onConnected);
  const onSkipRef = useRef(onSkip);
  useEffect(() => {
    onConnectedRef.current = onConnected;
    onSkipRef.current = onSkip;
  });

  // Listener subscription — runs exactly once on mount. Empty deps array is
  // load-bearing: any extra dep would re-subscribe on every render while the
  // overlay is up, flooding the Capacitor bridge.
  useEffect(() => {
    let unmounted = false;
    const handles: PluginListenerHandle[] = [];

    void SquareTapToPay.addListener('readerConnected', () => {
      if (cancelledRef.current) return;
      onConnectedRef.current();
    }).then((h) => {
      if (unmounted) void h.remove();
      else handles.push(h);
    });
    void SquareTapToPay.addListener('readerActivationTimedOut', () => {
      if (cancelledRef.current) return;
      setStage('timeout');
    }).then((h) => {
      if (unmounted) void h.remove();
      else handles.push(h);
    });

    return () => {
      unmounted = true;
      for (const h of handles) void h.remove();
    };
  }, []);

  // Activation lifecycle — runs on mount and on every retry via attemptKey.
  // `cancelledRef` flips true on cleanup so a stale activation promise from
  // the previous attempt can't resolve into the new attempt's UI state.
  useEffect(() => {
    cancelledRef.current = false;
    setStage('activating');
    setErrorMessage(null);

    const nudgeTimer = setTimeout(() => {
      if (!cancelledRef.current) {
        setStage((prev) => (prev === 'activating' ? 'nudging' : prev));
      }
    }, NUDGE_DELAY_MS);

    const timeoutHintTimer = setTimeout(() => {
      if (!cancelledRef.current) {
        setStage((prev) =>
          prev === 'activating' || prev === 'nudging' ? 'timeout' : prev,
        );
      }
    }, TIMEOUT_HINT_MS);

    void activateTapToPayReader().then((result: ActivationResult) => {
      if (cancelledRef.current) return;
      switch (result.status) {
        case 'connected':
        case 'alreadyConnected':
          onConnectedRef.current();
          return;
        case 'cancelled':
          // User dismissed Square's sheet manually — treat as a skip so the
          // overlay closes and POS loads underneath. They can re-trigger
          // from the inline Tap to Pay CTA later.
          onSkipRef.current();
          return;
        case 'timeout':
          setStage('timeout');
          return;
        case 'unavailable':
        case 'error':
        default:
          setStage('error');
          setErrorMessage(
            result.errorMessage ?? 'Could not activate the card reader.',
          );
          return;
      }
    });

    return () => {
      cancelledRef.current = true;
      clearTimeout(nudgeTimer);
      clearTimeout(timeoutHintTimer);
    };
  }, [attemptKey]);

  const handleSkip = async () => {
    cancelledRef.current = true;
    // Best-effort: force Square's sheet down if our overlay is going away
    // before activation finished. The Swift call is idempotent.
    try {
      await SquareTapToPay.dismissActivation();
    } catch {
      // Native call may not exist on web; ignore.
    }
    onSkip();
  };

  const handleRetry = () => {
    setAttemptKey((k) => k + 1);
  };

  return (
    <div className="fixed inset-0 z-[65] bg-[var(--surface-base)] flex flex-col items-center justify-center px-8">
      {stage !== 'error' && stage !== 'timeout' && (
        <div className="w-full max-w-sm text-center space-y-7">
          <div className="flex justify-center">
            <div className="w-16 h-16 animate-spin rounded-full border-4 border-[var(--border-default)] border-t-[var(--accent-primary)]" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-[var(--text-primary)] font-[family-name:var(--font-display)]">
              Setting up your card reader
            </h2>
            <p className="text-base text-[var(--text-secondary)] leading-relaxed">
              This takes about 30 seconds the first time you open the app each
              day.
            </p>
            {stage === 'nudging' && (
              <p className="text-sm text-[var(--text-tertiary)] pt-2">
                Still working… you may need to grant permission on the next
                screen.
              </p>
            )}
          </div>
          <button
            onClick={handleSkip}
            className="text-sm text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors min-h-[44px] px-2"
          >
            Skip for now
          </button>
        </div>
      )}

      {stage === 'timeout' && (
        <div className="w-full max-w-sm text-center space-y-6">
          <div className="flex justify-center">
            <div className="w-20 h-20 rounded-full bg-yellow-50 flex items-center justify-center">
              <svg
                className="w-10 h-10 text-yellow-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 8v4l3 3M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-[var(--text-primary)] font-[family-name:var(--font-display)]">
              Taking longer than expected
            </h2>
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
              We couldn&apos;t connect to the card reader. Make sure you&apos;re
              connected to the internet and try again.
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleRetry}
              className="flex-1 h-14 rounded-xl font-semibold text-base text-white transition-all active:scale-[0.97] min-h-[48px]"
              style={{ backgroundColor: 'var(--accent-primary)' }}
            >
              Try again
            </button>
            <button
              onClick={handleSkip}
              className="flex-1 h-14 rounded-xl font-semibold text-base border border-[var(--border-default)] text-[var(--text-primary)] hover:bg-[var(--surface-subtle)] transition-colors min-h-[48px]"
            >
              Skip
            </button>
          </div>
        </div>
      )}

      {stage === 'error' && (
        <div className="w-full max-w-sm text-center space-y-6">
          <div className="flex justify-center">
            <div className="w-20 h-20 rounded-full bg-red-50 flex items-center justify-center">
              <svg
                className="w-10 h-10 text-red-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                />
              </svg>
            </div>
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-[var(--text-primary)] font-[family-name:var(--font-display)]">
              Card reader setup failed
            </h2>
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
              {errorMessage ?? 'An unexpected error occurred.'}
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleRetry}
              className="flex-1 h-14 rounded-xl font-semibold text-base text-white transition-all active:scale-[0.97] min-h-[48px]"
              style={{ backgroundColor: 'var(--accent-primary)' }}
            >
              Try again
            </button>
            <button
              onClick={handleSkip}
              className="flex-1 h-14 rounded-xl font-semibold text-base border border-[var(--border-default)] text-[var(--text-primary)] hover:bg-[var(--surface-subtle)] transition-colors min-h-[48px]"
            >
              Skip
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
