// ============================================================================
// Tap to Pay — processor-agnostic service layer
// src/lib/tap-to-pay.ts
// ============================================================================
// One surface for the POS / Settings UI to talk to whichever processor the
// tenant is using. Today this delegates to the Square Mobile Payments SDK via
// the local Capacitor plugin (src/plugins/square-tap-to-pay). The Stripe
// Terminal path (stripe_tap) will plug in alongside Square in a follow-up.
//
// Everything in this module no-ops on web — callers can invoke without
// guarding for platform, and isNativeApp() returns false in the browser.
// ============================================================================

'use client';

import { isNativeApp } from './native';
import { SquareTapToPay } from '@/plugins/square-tap-to-pay';

export type TapToPayProcessor = 'square' | 'stripe';

export interface TapToPayCredentials {
  accessToken: string;
  locationId: string;
  /** Square developer application ID — required on Android, ignored on iOS. */
  applicationId?: string;
}

export interface TapToPayResult {
  status: 'success' | 'cancelled' | 'declined' | 'error';
  /** Server-side payment id from the processor — store on the sale row. */
  transactionId?: string;
  /** Client-side id (useful for offline-staged payments). */
  clientTransactionId?: string;
  cardBrand?: string;
  last4?: string;
  errorMessage?: string;
}

export type ReaderConnectionStatus =
  | 'not_applicable'
  | 'connecting'
  | 'ready'
  | 'unavailable';

export interface ConfigurationProgress {
  /** SDK has valid credentials in memory. */
  authorized: boolean;
  /** Device + OS reports it can accept contactless payments. */
  deviceReady: boolean;
}

// ── Capability check ────────────────────────────────────────────────────────

export async function checkTapToPayAvailability(): Promise<boolean> {
  if (!isNativeApp()) return false;
  try {
    const { available } = await SquareTapToPay.isAvailable();
    return available;
  } catch {
    return false;
  }
}

// ── Authorization ───────────────────────────────────────────────────────────

export async function initializeTapToPay(
  processor: TapToPayProcessor,
  credentials: TapToPayCredentials
): Promise<void> {
  if (!isNativeApp()) {
    throw new Error('Tap to Pay is only available in the Sunstone Studio app.');
  }

  if (processor === 'square') {
    await SquareTapToPay.initialize({
      accessToken: credentials.accessToken,
      locationId: credentials.locationId,
      applicationId: credentials.applicationId,
    });
    return;
  }

  // Stripe Terminal Tap to Pay lands in a follow-up; surface a clear error
  // rather than silently no-op'ing.
  throw new Error(`Tap to Pay for ${processor} is not yet implemented.`);
}

// ── Terms & Conditions ─────────────────────────────────────────────────────
//
// Both Square's Mobile Payments SDK (iOS) and Apple's Tap to Pay on iPhone
// present their own native terms screens the first time `authorize` runs.
// On Android, no in-app T&C step is required. So at this layer we treat
// terms as "owned by the SDK" — these helpers are kept for parity with the
// Stripe Terminal flow, which has explicit T&C handles.
// ─────────────────────────────────────────────────────────────────────────

export async function checkTermsAccepted(
  _processor: TapToPayProcessor
): Promise<boolean> {
  // SDK presents terms inline on first authorize; treat as accepted once
  // initializeTapToPay() resolves without throwing.
  return true;
}

export async function presentTermsAndConditions(
  _processor: TapToPayProcessor
): Promise<void> {
  // No-op — see comment above.
}

// ── Payment collection ──────────────────────────────────────────────────────

export async function collectPayment(
  amountCents: number,
  currency: string,
  processor: TapToPayProcessor,
  note?: string
): Promise<TapToPayResult> {
  if (!isNativeApp()) {
    return {
      status: 'error',
      errorMessage: 'Tap to Pay is only available in the Sunstone Studio app.',
    };
  }

  if (processor === 'square') {
    try {
      const result = await SquareTapToPay.startPayment({
        amountCents,
        currencyCode: currency,
        note,
      });

      // The plugin uses 'error' to cover both decline and SDK failure. The
      // service-layer surface separates them so the UI can show a retry CTA
      // for declines vs a "contact support" for unexpected errors. Square's
      // SDK doesn't expose a decline-specific status, so today both land as
      // 'error' — when we wire Stripe Terminal we can refine this.
      const status =
        result.status === 'success'
          ? 'success'
          : result.status === 'cancelled'
            ? 'cancelled'
            : 'error';

      return {
        status,
        transactionId: result.transactionId,
        clientTransactionId: result.clientTransactionId,
        cardBrand: result.cardBrand,
        last4: result.last4,
        errorMessage: result.errorMessage,
      };
    } catch (err: any) {
      return {
        status: 'error',
        errorMessage: err?.message ?? 'Tap to Pay failed unexpectedly.',
      };
    }
  }

  return {
    status: 'error',
    errorMessage: `Tap to Pay for ${processor} is not yet implemented.`,
  };
}

// ── Status helpers (for Settings UI feedback) ──────────────────────────────

export async function getReaderConnectionStatus(
  processor: TapToPayProcessor
): Promise<ReaderConnectionStatus> {
  // Square's Tap to Pay uses the device itself as the reader — there is no
  // external pairing step, unlike Stripe Terminal's BBPOS readers. Returning
  // 'not_applicable' tells the UI not to render a reader-pairing widget.
  if (processor === 'square') return 'not_applicable';
  return 'unavailable';
}

export async function getConfigurationProgress(
  processor: TapToPayProcessor
): Promise<ConfigurationProgress> {
  if (!isNativeApp()) return { authorized: false, deviceReady: false };

  if (processor === 'square') {
    try {
      const [{ authorized }, { available }] = await Promise.all([
        SquareTapToPay.getAuthorizationState(),
        SquareTapToPay.isAvailable(),
      ]);
      return { authorized, deviceReady: available };
    } catch {
      return { authorized: false, deviceReady: false };
    }
  }

  return { authorized: false, deviceReady: false };
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Maps the processor to the payment_method enum value stored on the sale row.
 * Keep in sync with migration 078.
 */
export function paymentMethodFor(
  processor: TapToPayProcessor
): 'square_tap' | 'stripe_tap' {
  return processor === 'square' ? 'square_tap' : 'stripe_tap';
}
