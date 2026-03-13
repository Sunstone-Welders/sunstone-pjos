-- ============================================================================
-- Migration 050: Event Chain Selections
-- ============================================================================
-- Allows artists to pre-select which chains are available at a specific event.
-- When pricing_mode = 'tier', the event form shows tier-based quick-select.
-- NULL or empty array = all chains available (existing behavior).
-- ============================================================================

ALTER TABLE events ADD COLUMN IF NOT EXISTS selected_chain_ids UUID[];
