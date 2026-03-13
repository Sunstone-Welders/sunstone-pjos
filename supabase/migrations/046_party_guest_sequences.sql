-- ============================================================================
-- Migration 046: Party Guest Marketing Sequences
-- ============================================================================
-- Extends the party message system to support post-party guest marketing.
-- Track A (waiver + SMS consent) gets a 4-message sequence + CRM client creation.
-- Track B (RSVP-only) gets 2 courtesy messages, no client creation.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Add guest-linking columns to party_scheduled_messages
-- ---------------------------------------------------------------------------

ALTER TABLE party_scheduled_messages
  ADD COLUMN IF NOT EXISTS party_rsvp_id uuid REFERENCES party_rsvps(id) ON DELETE SET NULL;

ALTER TABLE party_scheduled_messages
  ADD COLUMN IF NOT EXISTS skip_reason text;

-- ---------------------------------------------------------------------------
-- 2. Update status CHECK to include 'skipped'
-- ---------------------------------------------------------------------------

ALTER TABLE party_scheduled_messages DROP CONSTRAINT IF EXISTS party_scheduled_messages_status_check;
ALTER TABLE party_scheduled_messages ADD CONSTRAINT party_scheduled_messages_status_check
  CHECK (status IN ('pending', 'sent', 'cancelled', 'failed', 'skipped'));

-- ---------------------------------------------------------------------------
-- 3. Add client_id to party_rsvps (link guest to CRM client)
-- ---------------------------------------------------------------------------

ALTER TABLE party_rsvps
  ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES clients(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 4. Tenant toggle for guest sequences
-- ---------------------------------------------------------------------------

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS party_guest_sequences boolean NOT NULL DEFAULT true;

-- ---------------------------------------------------------------------------
-- 5. Update message_templates category to include 'party-guest'
-- ---------------------------------------------------------------------------

ALTER TABLE message_templates DROP CONSTRAINT IF EXISTS message_templates_category_check;
ALTER TABLE message_templates ADD CONSTRAINT message_templates_category_check
  CHECK (category IN ('general', 'aftercare', 'promotion', 'reminder', 'follow_up', 'thank_you', 'booking', 'party', 'party-guest'));

-- ---------------------------------------------------------------------------
-- 6. Index for looking up guest messages by RSVP
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_party_sched_msgs_rsvp
  ON party_scheduled_messages(party_rsvp_id)
  WHERE party_rsvp_id IS NOT NULL;
