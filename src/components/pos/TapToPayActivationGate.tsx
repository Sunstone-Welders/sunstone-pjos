// ============================================================================
// TapToPayActivationGate — Decides when to show TapToPayActivation overlay
// src/components/pos/TapToPayActivationGate.tsx
// ============================================================================
// Wraps the POS and Event Mode pages. On mount, checks whether all four
// capability gates pass (native + device-capable + entitlement + tenant
// flags). If so, and the reader hasn't been activated this process, and the
// user hasn't skipped this browser session, mounts TapToPayActivation as a
// full-screen overlay on top of {children}.
//
// {children} (POS UI) always renders — the overlay sits above so a skip just
// reveals what was already there. This keeps the artist's flow unblocked
// when activation fails or they choose to dismiss it.
// ============================================================================

'use client';

import { useEffect, useState } from 'react';
import {
  hasTapToPayBeenActivatedThisProcess,
  isTapToPayCapable,
} from '@/lib/tap-to-pay';
import TapToPayActivation from './TapToPayActivation';

const SKIP_STORAGE_KEY = 'tapToPayActivationSkipped';

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
  const [shouldShow, setShouldShow] = useState(false);

  useEffect(() => {
    let cancelled = false;

    // If the user already drove activation to success once this process, or
    // explicitly skipped during this browser session, skip the overlay
    // entirely. The Tap to Pay button in PaymentScreen → TapToPayFlow still
    // has its own recovery path.
    if (hasTapToPayBeenActivatedThisProcess()) return;
    if (typeof window !== 'undefined' &&
        sessionStorage.getItem(SKIP_STORAGE_KEY) === '1') {
      return;
    }

    void isTapToPayCapable({ tapToPayEnabled, squareConnected }).then((capable) => {
      if (cancelled) return;
      if (capable) setShouldShow(true);
    });

    return () => {
      cancelled = true;
    };
  }, [tapToPayEnabled, squareConnected]);

  const handleConnected = () => {
    setShouldShow(false);
  };

  const handleSkip = () => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(SKIP_STORAGE_KEY, '1');
    }
    setShouldShow(false);
  };

  return (
    <>
      {children}
      {shouldShow && (
        <TapToPayActivation
          onConnected={handleConnected}
          onSkip={handleSkip}
        />
      )}
    </>
  );
}
