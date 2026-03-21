-- ============================================================================
-- 057: Add sf_quote_number to reorder_history
-- ============================================================================
-- Stores the human-readable SF Quote Name (e.g., "90693") for easy reference.
-- ============================================================================

ALTER TABLE reorder_history ADD COLUMN IF NOT EXISTS sf_quote_number TEXT;
