-- ============================================================================
-- 075_atlas_sms.sql — Atlas SMS conversation history
-- ============================================================================

CREATE TABLE IF NOT EXISTS atlas_sms_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  phone text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  message text NOT NULL,
  escalated boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_atlas_sms_phone ON atlas_sms_messages(phone, created_at DESC);
CREATE INDEX idx_atlas_sms_tenant ON atlas_sms_messages(tenant_id, created_at DESC);

ALTER TABLE atlas_sms_messages ENABLE ROW LEVEL SECURITY;
-- Service role only — no user-facing policies needed

NOTIFY pgrst, 'reload schema';
