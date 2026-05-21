// ============================================================================
// Tap to Pay — Processor-Agnostic Service Layer
// src/lib/tap-to-pay.ts
// ============================================================================
// Single surface the POS / Settings UI talks to. Calls into the native
// Capacitor plugin (src/plugins/square-tap-to-pay) on iOS/Android; no-ops in
// the browser. Today only the `'square'` branch is wired up to the SDK;
// `'stripe'` (Stripe Terminal Tap to Pay) lands in a follow-up.
//
// Type surface stays the same as the original UX-shell so all existing
// callers (TapToPaySetup, TapToPayFlow, Settings) work unchanged.
// ============================================================================

'use client';

import { isNativeApp } from './native';
import { SquareTapToPay } from '@/plugins/square-tap-to-pay';

export type TapToPayProcessor = 'stripe' | 'square';

export type TapToPayStatus =
  | 'not_available'
  | 'not_setup'
  | 'ready'
  | 'connecting'
  | 'waiting_for_card'
  | 'processing'
  | 'success'
  | 'declined'
  | 'error'
  | 'timed_out';

export interface TapToPayConfig {
  processor: TapToPayProcessor;
  isAvailable: boolean;        // Device supports it (iPhone XS+, compatible Android)
  isEnabled: boolean;          // Artist has completed setup
  termsAccepted: boolean;      // T&C accepted
  readerReady: boolean;        // Reader is warmed up and ready
}

export interface TapToPayResult {
  status: 'success' | 'declined' | 'error' | 'timed_out' | 'cancelled';
  paymentIntentId?: string;     // Stripe Terminal
  transactionId?: string;       // Square Mobile Payments SDK
  clientTransactionId?: string; // Square — local/offline-staged id
  errorMessage?: string;
  cardBrand?: string;
  last4?: string;
}

export interface TapToPayCredentials {
  accessToken: string;
  locationId: string;
  /** Square developer application ID — required on Android, ignored on iOS. */
  applicationId?: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function fetchSquareCredentials(): Promise<TapToPayCredentials> {
  const res = await fetch('/api/square/mobile-payments-auth', {
    method: 'POST',
    credentials: 'include',
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      body.error ??
        'Could not load Square credentials. Reconnect Square in Settings.'
    );
  }
  return (await res.json()) as TapToPayCredentials;
}

// ---------------------------------------------------------------------------
// Public API — same shape as the original UX-shell stubs
// ---------------------------------------------------------------------------

/**
 * Check if the current device supports Tap to Pay.
 * Returns true for iPhone XS+ (iOS 16.4+) and compatible Android devices.
 */
export async function checkTapToPayAvailability(): Promise<boolean> {
  if (!isNativeApp()) return false;
  try {
    const { available } = await SquareTapToPay.isAvailable();
    return available;
  } catch {
    return false;
  }
}

/**
 * Warm up the reader at app launch (Apple requirement 5.1.4).
 * Should be called early in the app lifecycle when Tap to Pay is enabled.
 *
 * For Square: lazily fetches the tenant's OAuth credentials and authorizes
 * the Mobile Payments SDK. The SDK presents Apple's Tap to Pay terms on
 * first authorize (iOS); on Android no in-app T&C step is required.
 *
 * Idempotent — safe to call repeatedly.
 */
export async function initializeTapToPay(
  processor: TapToPayProcessor
): Promise<void> {
  if (!isNativeApp()) return;
  if (processor !== 'square') {
    // Stripe Terminal will be wired up in a follow-up.
    throw new Error(`Tap to Pay for ${processor} is not yet implemented.`);
  }
  const creds = await fetchSquareCredentials();
  // Android reads `applicationId`; iOS reads `squareApplicationID`. Send both
  // so the same payload satisfies both native plugins.
  await SquareTapToPay.initialize({
    accessToken: creds.accessToken,
    locationId: creds.locationId,
    applicationId: creds.applicationId,
    squareApplicationID: creds.applicationId,
  });

  // TEMPORARY: drive Square's Mobile Payments SDK settings screen to inspect
  // the Tap to Pay on iPhone setup state. Remove once we understand why the
  // embedded reader isn't auto-pairing.
  try {
    console.log('[TapToPay] Opening Square settings...');
    await SquareTapToPay.presentSettings();
    console.log('[TapToPay] Square settings dismissed');
  } catch (e) {
    console.log('[TapToPay] presentSettings error:', e);
  }
}

/**
 * Check if the merchant has accepted the Tap to Pay Terms & Conditions.
 * For Square: T&C are bundled into the SDK authorize() call, so an authorized
 * state implies terms have been accepted in this process lifetime.
 */
export async function checkTermsAccepted(): Promise<boolean> {
  if (!isNativeApp()) return false;
  try {
    const { authorized } = await SquareTapToPay.getAuthorizationState();
    return authorized;
  } catch {
    return false;
  }
}

/**
 * Trigger the native T&C acceptance flow (Apple/Google).
 * Returns true if the merchant accepted, false if they dismissed.
 *
 * For Square: this just initializes the SDK — Apple's Tap to Pay T&C are
 * presented natively as part of the iOS SDK's authorize() on first call.
 * If initialize resolves cleanly, terms were accepted.
 */
export async function presentTermsAndConditions(): Promise<boolean> {
  if (!isNativeApp()) return false;
  try {
    await initializeTapToPay('square');
    return true;
  } catch {
    return false;
  }
}

/**
 * Collect a contactless payment.
 * Shows the native "hold card near device" UI and processes the payment.
 *
 * The third `processor` arg defaults to `'square'` so the existing
 * 2-arg callers in the UX shell keep working unchanged.
 */
export async function collectPayment(
  amountCents: number,
  currency: string,
  processor: TapToPayProcessor = 'square'
): Promise<TapToPayResult> {
  if (!isNativeApp()) {
    return {
      status: 'error',
      errorMessage: 'Tap to Pay is only available in the Sunstone Studio app.',
    };
  }
  if (processor !== 'square') {
    return {
      status: 'error',
      errorMessage: `Tap to Pay for ${processor} is not yet implemented.`,
    };
  }
  try {
    const result = await SquareTapToPay.startPayment({
      amountCents,
      currencyCode: currency.toUpperCase(),
    });
    // The plugin reports 'error' for both declines and SDK failures. Square's
    // SDK doesn't surface a decline-specific status today, so all non-success/
    // non-cancel results land as 'error' here.
    const status: TapToPayResult['status'] =
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

/**
 * Reader connection status for the Settings UI.
 *
 * For Square Mobile Payments SDK the "reader" is the phone itself — there is
 * no external pairing step. We treat "authorized" as "connected".
 */
export async function getReaderConnectionStatus(): Promise<
  'connected' | 'connecting' | 'not_connected'
> {
  if (!isNativeApp()) return 'not_connected';
  try {
    const { authorized } = await SquareTapToPay.getAuthorizationState();
    return authorized ? 'connected' : 'not_connected';
  } catch {
    return 'not_connected';
  }
}

/**
 * Returns 0-100 progress percentage during reader setup/configuration.
 *
 * For Square setup is effectively instant (authorize → done), so we return
 * 100 once the SDK reports authorized and 0 otherwise. The Settings UI uses
 * its own progress simulation, so this value is mostly informational.
 */
export async function getConfigurationProgress(): Promise<number> {
  if (!isNativeApp()) return 0;
  try {
    const { authorized } = await SquareTapToPay.getAuthorizationState();
    return authorized ? 100 : 0;
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Compat helper kept so other callers can reach the enum value cleanly
// ---------------------------------------------------------------------------

/**
 * Maps the processor to the payment_method enum value stored on the sale row.
 * Keep in sync with migration 078.
 */
export function paymentMethodFor(
  processor: TapToPayProcessor
): 'square_tap' | 'stripe_tap' {
  return processor === 'square' ? 'square_tap' : 'stripe_tap';
}
