-- ============================================================================
-- Migration 078: Add Tap to Pay payment method enum values
-- ============================================================================
-- Adds 'stripe_tap' and 'square_tap' to the payment_method enum for
-- in-app Tap to Pay payments via Stripe Terminal SDK and Square Mobile
-- Payments SDK (Capacitor on iOS/Android).
-- ============================================================================

ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'stripe_tap';
ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'square_tap';

NOTIFY pgrst, 'reload schema';
