-- Usage events table for tracking feature engagement
CREATE TABLE IF NOT EXISTS usage_events (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  event_category text NOT NULL,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_usage_events_tenant ON usage_events(tenant_id);
CREATE INDEX idx_usage_events_type ON usage_events(event_type);
CREATE INDEX idx_usage_events_category ON usage_events(event_category);
CREATE INDEX idx_usage_events_created ON usage_events(created_at);
CREATE INDEX idx_usage_events_tenant_type ON usage_events(tenant_id, event_type);

-- RLS: tenants can only insert their own events, admins can read all
ALTER TABLE usage_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenants can insert own events" ON usage_events
  FOR INSERT WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Service role full access" ON usage_events
  FOR ALL USING (auth.role() = 'service_role');
