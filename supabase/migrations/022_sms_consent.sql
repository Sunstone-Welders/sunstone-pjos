-- ============================================================================
-- Migration 022: Add sms_consent column to waivers and queue_entries
-- ============================================================================
-- Required for Twilio A2P 10DLC compliance. Tracks explicit opt-in consent
-- for SMS messaging collected on the public waiver page.
-- ============================================================================

ALTER TABLE waivers ADD COLUMN IF NOT EXISTS sms_consent BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE queue_entries ADD COLUMN IF NOT EXISTS sms_consent BOOLEAN NOT NULL DEFAULT false;
