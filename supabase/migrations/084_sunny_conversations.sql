-- 084_sunny_conversations.sql
-- Persist Sunny AI mentor conversations for history, analytics, and feedback

-- Sunny conversation sessions
CREATE TABLE IF NOT EXISTS sunny_conversations (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text,
  message_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sunny_conv_tenant ON sunny_conversations(tenant_id);
CREATE INDEX idx_sunny_conv_user ON sunny_conversations(user_id);
CREATE INDEX idx_sunny_conv_updated ON sunny_conversations(updated_at DESC);

-- Individual messages within conversations
CREATE TABLE IF NOT EXISTS sunny_messages (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id uuid NOT NULL REFERENCES sunny_conversations(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  tokens_used int,
  tool_calls jsonb,
  feedback text CHECK (feedback IN ('thumbs_up', 'thumbs_down')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sunny_msg_conversation ON sunny_messages(conversation_id);
CREATE INDEX idx_sunny_msg_tenant ON sunny_messages(tenant_id);
CREATE INDEX idx_sunny_msg_created ON sunny_messages(created_at DESC);
CREATE INDEX idx_sunny_msg_feedback ON sunny_messages(feedback) WHERE feedback IS NOT NULL;

-- RLS
ALTER TABLE sunny_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE sunny_messages ENABLE ROW LEVEL SECURITY;

-- Tenants can read their own conversations
CREATE POLICY "Users read own conversations" ON sunny_conversations
  FOR SELECT USING (
    user_id = auth.uid() OR
    tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Users read own messages" ON sunny_messages
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid())
  );

-- Service role for full access (API routes use service role)
CREATE POLICY "Service role full access conversations" ON sunny_conversations
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access messages" ON sunny_messages
  FOR ALL USING (auth.role() = 'service_role');
