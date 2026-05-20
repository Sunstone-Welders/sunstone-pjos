// ============================================================================
// Square Tap to Pay — Capacitor plugin interface
// ============================================================================
// Bridges the Square Mobile Payments SDK (iOS Swift / Android Kotlin) into the
// web layer. Implementations live in:
//   ios/App/App/Plugins/SquareTapToPay/SquareTapToPayPlugin.swift
//   android/app/src/main/java/app/sunstonepj/studio/plugins/squaretaptopay/SquareTapToPayPlugin.kt
//   src/plugins/square-tap-to-pay/web.ts        (browser fallback)
// ============================================================================

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

export interface SquareTapToPayPlugin {
  /** Authorize the SDK with the tenant's Square OAuth credentials. Idempotent. */
  initialize(options: SquareInitializeOptions): Promise<void>;
  /** Whether the device + OS supports contactless Tap to Pay. */
  isAvailable(): Promise<{ available: boolean }>;
  /** Present the Square payment sheet for the given amount and await the result. */
  startPayment(options: SquareStartPaymentOptions): Promise<SquarePaymentResult>;
  /** Whether the SDK is currently authorized in the running process. */
  getAuthorizationState(): Promise<{ authorized: boolean }>;
}
