-- ============================================================================
-- Migration 080: Ambassador Per-Ambassador Commission Rate + Duration
-- ============================================================================
-- Adds commission_rate and commission_duration_months columns to the
-- ambassadors table so each ambassador can have a custom deal.
-- Defaults match the existing hardcoded values (20%, 8 months).
-- ============================================================================

ALTER TABLE ambassadors
  ADD COLUMN IF NOT EXISTS commission_rate NUMERIC(5,4) DEFAULT 0.2000,
  ADD COLUMN IF NOT EXISTS commission_duration_months INT DEFAULT 8;
