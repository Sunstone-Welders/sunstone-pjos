-- ============================================================================
-- Migration 025: Rename subscription_tier 'free' → 'starter'
-- ============================================================================
-- Updates any tenants still using the legacy 'free' tier value to 'starter'.
-- The application code already uses 'starter' as the canonical tier name.
-- This migration ensures the database is consistent.
-- ============================================================================

UPDATE tenants
SET subscription_tier = 'starter',
    updated_at = now()
WHERE subscription_tier = 'free';
