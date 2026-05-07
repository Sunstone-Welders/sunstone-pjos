-- ============================================================================
-- 074: SMS Verification Codes
-- ============================================================================
-- Replaces email confirmation with SMS verification on signup.
-- Stores one-time codes with expiry + attempt tracking.
-- ============================================================================

-- SMS Verification Codes table
CREATE TABLE IF NOT EXISTS sms_verification_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phone text NOT NULL,
  code text NOT NULL,
  expires_at timestamptz NOT NULL,
  verified_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for lookups
CREATE INDEX idx_sms_verification_user ON sms_verification_codes(user_id, created_at DESC);
CREATE INDEX idx_sms_verification_phone ON sms_verification_codes(phone, created_at DESC);

-- RLS — only service role can read/write (API routes use service role)
ALTER TABLE sms_verification_codes ENABLE ROW LEVEL SECURITY;

-- Add phone_verified boolean to tenants
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS phone_verified boolean NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';
