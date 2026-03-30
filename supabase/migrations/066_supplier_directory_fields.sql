-- ============================================================================
-- Migration 066: Add Supplier Directory Fields
-- ============================================================================
-- Adds contact/address/social/account columns to the suppliers table.
-- Migration 062 defined these but was never applied to production.
-- Idempotent — safe to re-run.
-- ============================================================================

ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS account_number text;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS street text;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS state text;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS postal_code text;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS country text DEFAULT 'US';
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS instagram text;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS facebook text;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS tiktok text;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
