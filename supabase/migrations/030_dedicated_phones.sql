-- ============================================================================
-- 030: Dedicated Phone Numbers + Two-Way SMS Conversations
-- ============================================================================

-- Tenant columns for dedicated phone
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS dedicated_phone_number TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS dedicated_phone_sid TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS crm_activated_at TIMESTAMPTZ;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS crm_deactivated_at TIMESTAMPTZ;

-- Conversations table
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  phone_number TEXT NOT NULL,
  direction TEXT NOT NULL,
  body TEXT NOT NULL,
  twilio_sid TEXT,
  status TEXT NOT NULL DEFAULT 'delivered',
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversations_tenant_client ON conversations(tenant_id, client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_tenant_phone ON conversations(tenant_id, phone_number, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_unread ON conversations(tenant_id, client_id, read) WHERE read = false;
CREATE INDEX IF NOT EXISTS idx_tenants_dedicated_phone ON tenants(dedicated_phone_number) WHERE dedicated_phone_number IS NOT NULL;

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can read conversations"
  ON conversations FOR SELECT
  USING (tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()));

CREATE POLICY "Tenant members can insert conversations"
  ON conversations FOR INSERT
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()));

-- Client columns for unread tracking
ALTER TABLE clients ADD COLUMN IF NOT EXISTS unread_messages INTEGER DEFAULT 0;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMPTZ;
