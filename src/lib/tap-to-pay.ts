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

import type { PluginListenerHandle } from '@capacitor/core';
import { isNativeApp } from './native';
import {
  SquareTapToPay,
  type SquareActivateReaderStatus,
} from '@/plugins/square-tap-to-pay';

/**
 * Flip to `true` to surface the diagnostic console logs from this module in
 * production builds. Off by default so TestFlight/App Store builds stay quiet;
 * the Swift plugin has an equivalent `#if DEBUG` guard on its `print` calls.
 */
const DEBUG = false;
const log = (...args: unknown[]) => {
  if (DEBUG) console.log('[TapToPay]', ...args);
};

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

// ---------------------------------------------------------------------------
// Process-lifetime guards
// ---------------------------------------------------------------------------
// `initializeTapToPay()` and `activateTapToPayReader()` both have side effects
// that must NOT race: init authorizes the SDK once per process; activate
// presents Square's settings sheet exactly once per cold-start. Without these
// dedup slots, a dashboard-mount call and a POS-mount call landing in the
// same frame would both fetch credentials, both call the native plugin, and
// the second activation would reject with "already in progress" on the Swift
// side. The guards collapse that into a single in-flight promise.

let initPromise: Promise<void> | null = null;
let hasInitialized = false;

let activationPromise: Promise<ActivationResult> | null = null;
// Truthy only after the native plugin emits `readerConnected` (i.e. the SDK's
// `readerWasAdded` callback actually fired for the Tap to Pay model). The
// listener below is the single writer for `connected` transitions; the
// `activateTapToPayReader()` promise resolution is treated as advisory, with
// one exception: `alreadyConnected` short-circuits before any event would
// fire, so we set the flag synchronously in that branch too.
let hasActivatedThisProcess = false;

let readerConnectedListenerPromise: Promise<PluginListenerHandle | null> | null = null;

/**
 * Lazily register a single process-wide listener for the native plugin's
 * `readerConnected` event. Set as the authoritative writer of
 * `hasActivatedThisProcess`, so fire-and-forget callers (dashboard mount)
 * don't need to await `activateTapToPayReader()` to know when the reader
 * actually attached.
 *
 * Idempotent: subsequent calls return the in-flight (or completed) promise
 * so we never register more than one bridge listener per process.
 */
async function ensureReaderConnectedListener(): Promise<void> {
  if (!isNativeApp()) return;
  if (readerConnectedListenerPromise) {
    await readerConnectedListenerPromise;
    return;
  }
  readerConnectedListenerPromise = SquareTapToPay.addListener(
    'readerConnected',
    () => {
      log('readerConnected event — marking process as activated');
      hasActivatedThisProcess = true;
    },
  ).catch((err) => {
    log('ensureReaderConnectedListener: failed to subscribe', err);
    // Reset so a retry can attempt to subscribe again.
    readerConnectedListenerPromise = null;
    return null;
  });
  await readerConnectedListenerPromise;
}

export type ActivationStatus =
  | SquareActivateReaderStatus
  | 'error'
  | 'unavailable';

export interface ActivationResult {
  status: ActivationStatus;
  errorMessage?: string;
}

/**
 * Warm up the SDK at app launch — silent, no UI. Called from the dashboard
 * client layout on mount when running natively.
 *
 * For Square: lazily fetches the tenant's OAuth credentials and authorizes
 * the Mobile Payments SDK. The SDK does NOT present Apple's Tap to Pay
 * settings sheet here — that happens later in `activateTapToPayReader()`.
 *
 * Idempotent per process: subsequent calls return the in-flight promise (or
 * resolve immediately if already initialized). Both guards reset on failure
 * so the retry path still works.
 */
export async function initializeTapToPay(
  processor: TapToPayProcessor
): Promise<void> {
  if (!isNativeApp()) return;
  if (processor !== 'square') {
    // Stripe Terminal will be wired up in a follow-up.
    throw new Error(`Tap to Pay for ${processor} is not yet implemented.`);
  }
  if (hasInitialized) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      log('initializeTapToPay: fetching credentials');
      const creds = await fetchSquareCredentials();
      // Android reads `applicationId`; iOS reads `squareApplicationID`. Send
      // both so the same payload satisfies both native plugins.
      await SquareTapToPay.initialize({
        accessToken: creds.accessToken,
        locationId: creds.locationId,
        applicationId: creds.applicationId,
        squareApplicationID: creds.applicationId,
      });
      hasInitialized = true;
      // Subscribe to readerConnected as soon as the SDK is authorized so the
      // flag flips the moment the native plugin emits the event — even if the
      // caller never awaits the activation promise.
      void ensureReaderConnectedListener();
      log('initializeTapToPay: SDK authorized');
    } catch (err) {
      log('initializeTapToPay: failed', err);
      hasInitialized = false;
      throw err;
    } finally {
      initPromise = null;
    }
  })();

  return initPromise;
}

/**
 * Manual reader activation — call this only when the artist explicitly taps
 * "Set up Tap to Pay" on the POS payment screen (or as a safety-net retry in
 * TapToPayFlow). Presents Square's settings sheet and resolves when the
 * embedded reader attaches, when the artist dismisses the sheet manually, or
 * after a 5-minute safety timeout fires natively.
 *
 * Idempotent per process: a successful `connected` or `alreadyConnected`
 * result short-circuits subsequent calls. On `timeout`, `cancelled`, or
 * `error`, the flag resets so the artist can retry.
 */
export async function activateTapToPayReader(): Promise<ActivationResult> {
  if (!isNativeApp()) {
    return { status: 'unavailable', errorMessage: 'Native app only.' };
  }
  if (hasActivatedThisProcess) {
    return { status: 'alreadyConnected' };
  }
  if (activationPromise) return activationPromise;

  activationPromise = (async () => {
    try {
      // The SDK has to be authorized before we can drive the settings sheet.
      // The dashboard-mount init usually wins this race, but if the artist
      // jumps straight to POS we run it on demand.
      await initializeTapToPay('square');
      log('activateTapToPayReader: calling native activateReader');
      const { status } = await SquareTapToPay.activateReader();
      log('activateTapToPayReader: status =', status);
      // `connected` already implies `readerConnected` fired on the native
      // side, so the listener above has already flipped the flag. The
      // `alreadyConnected` branch is the exception — the reader was attached
      // before we subscribed, so we set it here.
      if (status === 'alreadyConnected') {
        hasActivatedThisProcess = true;
      }
      return { status };
    } catch (err: any) {
      log('activateTapToPayReader: error', err);
      return {
        status: 'error',
        errorMessage: err?.message ?? 'Tap to Pay activation failed.',
      };
    } finally {
      activationPromise = null;
    }
  })();

  return activationPromise;
}

/**
 * Synchronous read of the in-process activation flag. Used by the activation
 * gate to skip its overlay entirely on POS re-mounts within the same app
 * session — the reader is already attached, so there is nothing to show.
 */
export function hasTapToPayBeenActivatedThisProcess(): boolean {
  return hasActivatedThisProcess;
}

/**
 * Synchronous read of the current reader connection state. Today this maps
 * 1:1 to `hasTapToPayBeenActivatedThisProcess` — Tap to Pay on iPhone holds
 * its connection for the process lifetime once attached. Kept as a separate
 * name so callers reading "is the reader live right now?" don't have to
 * reason about the historical "did we ever activate?" framing.
 */
export function isReaderConnected(): boolean {
  return hasActivatedThisProcess;
}

/**
 * Single source of truth for whether to show any Tap to Pay UI. All four
 * must be true:
 *   1. Running natively (iOS app, not browser)
 *   2. Device + OS supports contactless (iPhone XS+, iOS 16.7+)
 *   3. Apple's `com.apple.developer.proximity-reader.payment.acceptance`
 *      entitlement is present in the running binary
 *   4. Tenant has Tap to Pay enabled AND Square is connected (passed in by
 *      caller — this function only handles the device-side gates)
 *
 * Returns false on any failure so a broken native check never accidentally
 * surfaces a Tap to Pay button that won't work.
 */
export async function isTapToPayCapable(opts: {
  tapToPayEnabled: boolean;
  squareConnected: boolean;
}): Promise<boolean> {
  if (!isNativeApp()) return false;
  if (!opts.tapToPayEnabled || !opts.squareConnected) return false;
  try {
    const [{ available }, { entitled }] = await Promise.all([
      SquareTapToPay.isAvailable(),
      SquareTapToPay.hasProximityReaderEntitlement(),
    ]);
    log('isTapToPayCapable: available=', available, 'entitled=', entitled);
    return available && entitled;
  } catch (err) {
    log('isTapToPayCapable: error', err);
    return false;
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
