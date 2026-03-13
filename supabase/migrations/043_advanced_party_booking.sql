-- ============================================================================
-- Migration 043: Advanced Party Booking — Deposits, Revenue, Rewards
-- ============================================================================
-- Adds deposit collection, minimum guarantee, revenue tracking, and host
-- rewards to the party booking system. CRM-gated features.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Tenant party reward settings
-- ---------------------------------------------------------------------------

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS party_reward_settings jsonb;

-- ---------------------------------------------------------------------------
-- 2. Party request financial columns
-- ---------------------------------------------------------------------------

ALTER TABLE party_requests ADD COLUMN IF NOT EXISTS deposit_amount numeric(10,2) NOT NULL DEFAULT 0;
ALTER TABLE party_requests ADD COLUMN IF NOT EXISTS deposit_status text NOT NULL DEFAULT 'none';
ALTER TABLE party_requests ADD COLUMN IF NOT EXISTS deposit_paid_at timestamptz;
ALTER TABLE party_requests ADD COLUMN IF NOT EXISTS stripe_checkout_session_id text;
ALTER TABLE party_requests ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text;
ALTER TABLE party_requests ADD COLUMN IF NOT EXISTS minimum_guarantee numeric(10,2) NOT NULL DEFAULT 0;
ALTER TABLE party_requests ADD COLUMN IF NOT EXISTS total_revenue numeric(10,2) NOT NULL DEFAULT 0;
ALTER TABLE party_requests ADD COLUMN IF NOT EXISTS total_sales integer NOT NULL DEFAULT 0;
ALTER TABLE party_requests ADD COLUMN IF NOT EXISTS host_reward_amount numeric(10,2) NOT NULL DEFAULT 0;
ALTER TABLE party_requests ADD COLUMN IF NOT EXISTS host_reward_redeemed boolean NOT NULL DEFAULT false;
ALTER TABLE party_requests ADD COLUMN IF NOT EXISTS host_reward_redeemed_at timestamptz;

-- Add check constraint for deposit_status
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'party_requests_deposit_status_check'
  ) THEN
    ALTER TABLE party_requests ADD CONSTRAINT party_requests_deposit_status_check
      CHECK (deposit_status IN ('none', 'pending', 'paid', 'waived'));
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Sales party linkage
-- ---------------------------------------------------------------------------

ALTER TABLE sales ADD COLUMN IF NOT EXISTS party_request_id uuid REFERENCES party_requests(id) ON DELETE SET NULL;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS party_rsvp_id uuid REFERENCES party_rsvps(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sales_party ON sales(party_request_id);
