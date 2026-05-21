// ============================================================================
// Square Tap to Pay — Capacitor plugin interface
// ============================================================================
// Bridges the Square Mobile Payments SDK (iOS Swift / Android Kotlin) into the
// web layer. Implementations live in:
//   ios/App/App/Plugins/SquareTapToPay/SquareTapToPayPlugin.swift
//   android/app/src/main/java/app/sunstonepj/studio/plugins/squaretaptopay/SquareTapToPayPlugin.kt
//   src/plugins/square-tap-to-pay/web.ts        (browser fallback)
// ============================================================================

import type { PluginListenerHandle } from '@capacitor/core';

export interface SquareInitializeOptions {
  accessToken: string;
  locationId: string;
  /**
   * Square developer application ID (e.g. "sq0idp-...").
   * Required on Android — the Mobile Payments SDK needs it for its one-time
   * initialize() call before authorize.
   */
  applicationId?: string;
  /**
   * Same value as `applicationId`, under the key the iOS Swift plugin reads.
   * The iOS native bridge uses `squareApplicationID` (matching Square's iOS
   * SDK naming); Android uses `applicationId`. Callers should set both.
   */
  squareApplicationID?: string;
}

export interface SquareStartPaymentOptions {
  /** Sale amount in the smallest currency unit (cents for USD). */
  amountCents: number;
  /** ISO-4217 currency code, e.g. "USD". */
  currencyCode: string;
  /** Optional note attached to the payment for the merchant's records. */
  note?: string;
}

export type SquarePaymentStatus = 'success' | 'cancelled' | 'error';

export interface SquarePaymentResult {
  status: SquarePaymentStatus;
  /** Square server-side payment ID, present on success. */
  transactionId?: string;
  /** Square client-side payment ID, present on success or when offline-staged. */
  clientTransactionId?: string;
  /** "VISA", "MASTERCARD", etc. — undefined for non-card or failures. */
  cardBrand?: string;
  /** Last 4 digits of the card used, when available. */
  last4?: string;
  /** Human-readable error message when status === 'error'. */
  errorMessage?: string;
}

/**
 * Result of an `activateReader()` call. Each case corresponds to a distinct
 * UX path in the branded activation overlay.
 */
export type SquareActivateReaderStatus =
  | 'alreadyConnected' // Reader was already attached — overlay should skip.
  | 'connected'        // Reader attached during this activation.
  | 'cancelled'        // User dismissed Square's settings sheet manually.
  | 'timeout';         // 45s safety timeout fired without a reader.

export interface SquareActivateReaderResult {
  status: SquareActivateReaderStatus;
}

/** Payload of the `readerConnected` plugin event. */
export interface SquareReaderConnectedEvent {
  /** Always `"tapToPay"` today — left open for future reader models. */
  model: string;
}

/** Plugin events emitted to JS listeners. */
export type SquareTapToPayPluginEvents = {
  readerConnected: SquareReaderConnectedEvent;
  readerActivationTimedOut: Record<string, never>;
};

export interface SquareTapToPayPlugin {
  /**
   * Authorize the SDK with the tenant's Square OAuth credentials. Idempotent.
   *
   * This call is intentionally silent — it does not open Square's settings
   * sheet or wait for the embedded Tap to Pay reader to attach. Reader
   * activation is a separate just-in-time step (see `activateReader`).
   */
  initialize(options: SquareInitializeOptions): Promise<void>;
  /** Whether the device + OS supports contactless Tap to Pay. */
  isAvailable(): Promise<{ available: boolean }>;
  /** Present the Square payment sheet for the given amount and await the result. */
  startPayment(options: SquareStartPaymentOptions): Promise<SquarePaymentResult>;
  /** Whether the SDK is currently authorized in the running process. */
  getAuthorizationState(): Promise<{ authorized: boolean }>;
  /**
   * Present Square's built-in Mobile Payments SDK settings screen as a manual
   * recovery escape hatch. Prefer `activateReader()` for the normal flow —
   * that variant auto-dismisses the sheet on reader connect and emits events
   * the branded overlay subscribes to.
   */
  presentSettings(): Promise<void>;
  /**
   * Drives the embedded Tap to Pay reader onto `ReaderManager.readers` by
   * presenting Square's settings sheet, then auto-dismissing it via
   * `SettingsManager.dismissSettings()` as soon as `readerWasAdded` fires.
   *
   * Resolves with one of: `alreadyConnected`, `connected`, `cancelled`,
   * `timeout`. Single-flight per process — concurrent calls reject.
   */
  activateReader(): Promise<SquareActivateReaderResult>;
  /**
   * Force-dismisses Square's settings sheet if our branded overlay needs to
   * take it down (overlay cancel button, higher-priority modal, etc.).
   * Resolves with `{ dismissed: true }` if the sheet was up, `false` otherwise.
   */
  dismissActivation(): Promise<{ dismissed: boolean }>;
  /**
   * Whether the running binary's entitlements include Apple's
   * `com.apple.developer.proximity-reader.payment.acceptance`. Used as the
   * top-level gate for every Tap to Pay surface in production builds.
   * Android and web always resolve `{ entitled: false }`.
   */
  hasProximityReaderEntitlement(): Promise<{ entitled: boolean }>;
  /** Subscribe to a plugin event; the returned handle removes the listener. */
  addListener<E extends keyof SquareTapToPayPluginEvents>(
    eventName: E,
    listenerFunc: (event: SquareTapToPayPluginEvents[E]) => void,
  ): Promise<PluginListenerHandle>;
}
