-- ============================================================================
-- Migration 080: Track in-app Tap to Pay enrollment per tenant
-- ============================================================================
-- After an artist initializes the Mobile Payments SDK on a native device and
-- accepts the Tap to Pay terms, we set tap_to_pay_enabled = true so the POS
-- and Event Mode flows know to show the Tap to Pay option.
--
-- Existing controls (square_access_token, default_payment_processor) still
-- gate visibility — this flag only signals the artist has completed setup.
-- ============================================================================

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS tap_to_pay_enabled BOOLEAN NOT NULL DEFAULT FALSE;

NOTIFY pgrst, 'reload schema';
