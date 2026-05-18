// ============================================================================
// Tap to Pay — Processor-Agnostic Service Layer
// src/lib/tap-to-pay.ts
// ============================================================================
// Abstraction layer for Tap to Pay on iPhone / Android.
// The UI talks to these functions. All native SDK calls are STUBS — they will
// be replaced by Capacitor plugin calls when the native bridge is wired up.
// ============================================================================

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
  paymentIntentId?: string;     // Stripe
  transactionId?: string;       // Square
  errorMessage?: string;
  cardBrand?: string;
  last4?: string;
}

// ---------------------------------------------------------------------------
// Stubs — these will be replaced by Capacitor plugin calls
// ---------------------------------------------------------------------------

/**
 * Check if the current device supports Tap to Pay.
 * Returns true for iPhone XS+ (iOS 16.4+) and compatible Android devices.
 */
export async function checkTapToPayAvailability(): Promise<boolean> {
  // Will call native SDK to check device compatibility
  // For now, return false until native plugin is installed
  return false;
}

/**
 * Warm up the reader at app launch (Apple requirement 5.1.4).
 * Should be called early in the app lifecycle when Tap to Pay is enabled.
 */
export async function initializeTapToPay(processor: TapToPayProcessor): Promise<void> {
  console.log(`[TapToPay] Initialize stub called for ${processor}`);
}

/**
 * Check if the merchant has accepted the Tap to Pay Terms & Conditions.
 */
export async function checkTermsAccepted(): Promise<boolean> {
  return false;
}

/**
 * Trigger the native T&C acceptance flow (Apple/Google).
 * Returns true if the merchant accepted, false if they dismissed.
 */
export async function presentTermsAndConditions(): Promise<boolean> {
  return false;
}

/**
 * Collect a contactless payment.
 * Shows the native "hold card near device" UI and processes the payment.
 */
export async function collectPayment(
  amountCents: number,
  currency: string
): Promise<TapToPayResult> {
  return { status: 'error', errorMessage: 'Tap to Pay not yet configured' };
}

/**
 * Check the current reader connection status.
 */
export async function getReaderConnectionStatus(): Promise<'connected' | 'connecting' | 'not_connected'> {
  return 'not_connected';
}

/**
 * Returns 0-100 progress percentage during reader setup/configuration.
 */
export async function getConfigurationProgress(): Promise<number> {
  return 0;
}
