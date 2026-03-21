-- ============================================================================
-- Migration 061: Add 'clasp' to inventory_type enum
-- ============================================================================
-- The UI dropdown already includes 'clasp' as an option, but the database
-- enum was missing it, causing save failures.
-- ============================================================================

ALTER TYPE inventory_type ADD VALUE IF NOT EXISTS 'clasp';
