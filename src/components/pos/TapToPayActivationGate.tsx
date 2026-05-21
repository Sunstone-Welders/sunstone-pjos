// ============================================================================
// TapToPayActivationGate — Inline status banner above POS
// src/components/pos/TapToPayActivationGate.tsx
// ============================================================================
// Wraps the POS and Event Mode pages. Reader activation is now kicked off at
// dashboard mount (see DashboardClientLayout), so by the time POS renders the
// reader is typically already attached. This gate ONLY observes connection
// state — it never re-triggers activation on mount.
//
// States:
//   hidden       — reader connected, or device isn't Tap to Pay capable
//   connecting   — reader not yet attached; show a soft inline banner so the
//                  artist can start building the order while it finishes
//   unavailable  — 90s elapsed with no readerConnected event; show a final
//                  banner steering to QR / Text Link, with a Try Again CTA
// ============================================================================

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  activateTapToPayReader,
  isReaderConnected,
  isTapToPayCapable,
} from '@/lib/tap-to-pay';
import { SquareTapToPay } from '@/plugins/square-tap-to-pay';
import type { PluginListenerHandle } from '@capacitor/core';

type BannerState = 'hidden' | 'connecting' | 'unavailable';

const UNAVAILABLE_TIMEOUT_MS = 90_000;

interface TapToPayActivationGateProps {
  tapToPayEnabled: boolean;
  squareConnected: boolean;
  children: React.ReactNode;
}

export default function TapToPayActivationGate({
  tapToPayEnabled,
  squareConnected,
  children,
}: TapToPayActivationGateProps) {
  const [state, setState] = useState<BannerState>('hidden');
  // Tracks whether this device passed all four capability gates. We only
  // ever show the banner if capable — otherwise the artist isn't getting a
  // Tap to Pay button anywhere else either.
  const [capable, setCapable] = useState(false);

  const listenerRef = useRef<PluginListenerHandle | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const armUnavailableTimer = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setState((prev) => (prev === 'connecting' ? 'unavailable' : prev));
      timeoutRef.current = null;
    }, UNAVAILABLE_TIMEOUT_MS);
  }, []);

  useEffect(() => {
    let cancelled = false;

    void isTapToPayCapable({ tapToPayEnabled, squareConnected }).then((isCapable) => {
      if (cancelled) return;
      if (!isCapable) return;
      setCapable(true);

      if (isReaderConnected()) {
        setState('hidden');
        return;
      }

      setState('connecting');
      armUnavailableTimer();

      void SquareTapToPay.addListener('readerConnected', () => {
        if (cancelled) return;
        setState('hidden');
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
      }).then((handle) => {
        if (cancelled) {
          void handle.remove();
          return;
        }
        listenerRef.current = handle;
      });
    });

    return () => {
      cancelled = true;
      void listenerRef.current?.remove();
      listenerRef.current = null;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [tapToPayEnabled, squareConnected, armUnavailableTimer]);

  const handleRetry = useCallback(() => {
    setState('connecting');
    armUnavailableTimer();
    // Fire-and-forget. The lib's readerConnected listener flips the flag
    // when the reader actually attaches; the local listener above dismisses
    // the banner in response.
    activateTapToPayReader().catch(() => {
      // Surface as unavailable so the user has an obvious next step.
      setState('unavailable');
    });
  }, [armUnavailableTimer]);

  if (!capable || state === 'hidden') {
    return <>{children}</>;
  }

  return (
    <>
      {state === 'connecting' && (
        <div className="w-full bg-[var(--surface-subtle)] border-b border-[var(--border-default)] px-4 py-3 flex items-center gap-3">
          <div className="w-5 h-5 animate-spin rounded-full border-2 border-[var(--border-default)] border-t-[var(--accent-primary)] flex-shrink-0" />
          <p className="text-sm text-[var(--text-secondary)]">
            Card reader still connecting… You can start building orders while
            it connects.
          </p>
        </div>
      )}
      {state === 'unavailable' && (
        <div className="w-full bg-[var(--surface-subtle)] border-b border-[var(--border-default)] px-4 py-3 flex items-center justify-between gap-3">
          <p className="text-sm text-[var(--text-secondary)]">
            Card reader unavailable. You can still accept payments via QR Code
            or Text Link.
          </p>
          <button
            onClick={handleRetry}
            className="text-sm font-semibold text-[var(--accent-primary)] hover:underline min-h-[44px] px-3 flex-shrink-0"
          >
            Try Again
          </button>
        </div>
      )}
      {children}
    </>
  );
}
