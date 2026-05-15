-- ============================================================================
-- Migration 085: Platform Notifications
-- ============================================================================
-- Adds promotional notification system for admin → tenant communication.
-- Two tables: platform_notifications (admin-created) and
-- platform_notification_reads (tenant read/click tracking).
-- ============================================================================

-- ============================================================================
-- Table: platform_notifications
-- ============================================================================
CREATE TABLE platform_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  type text NOT NULL CHECK (type IN ('announcement', 'product_launch', 'promotion', 'feature_update', 'tip_of_the_week')),
  title text NOT NULL,
  body text NOT NULL,
  image_url text,
  cta_text text,
  cta_link text,
  target_type text NOT NULL DEFAULT 'all' CHECK (target_type IN ('all', 'tier', 'tag', 'specific')),
  target_value text,
  target_tenant_ids uuid[],
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'sent', 'archived')),
  scheduled_for timestamptz,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- Table: platform_notification_reads
-- ============================================================================
CREATE TABLE platform_notification_reads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES platform_notifications(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  read_at timestamptz NOT NULL DEFAULT now(),
  cta_clicked_at timestamptz,
  UNIQUE(notification_id, user_id)
);

-- ============================================================================
-- Indexes
-- ============================================================================
CREATE INDEX idx_platform_notifications_status ON platform_notifications(status);
CREATE INDEX idx_platform_notifications_scheduled ON platform_notifications(scheduled_for) WHERE status = 'scheduled';
CREATE INDEX idx_platform_notifications_sent_at ON platform_notifications(sent_at DESC) WHERE status = 'sent';
CREATE INDEX idx_platform_notification_reads_notification ON platform_notification_reads(notification_id);
CREATE INDEX idx_platform_notification_reads_tenant ON platform_notification_reads(tenant_id);
CREATE INDEX idx_platform_notification_reads_user ON platform_notification_reads(user_id);

-- ============================================================================
-- RLS
-- ============================================================================
ALTER TABLE platform_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_notification_reads ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read sent notifications
-- (Admin routes use service role client and bypass RLS entirely)

CREATE POLICY "users_read_sent_notifications" ON platform_notifications
  FOR SELECT USING (
    auth.role() = 'authenticated' AND status = 'sent'
  );

-- Users: can insert their own read records
CREATE POLICY "users_insert_own_reads" ON platform_notification_reads
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
  );

-- Users: can update their own read records (for CTA click tracking)
CREATE POLICY "users_update_own_reads" ON platform_notification_reads
  FOR UPDATE USING (
    user_id = auth.uid()
  );

-- Users: can select their own read records
CREATE POLICY "users_select_own_reads" ON platform_notification_reads
  FOR SELECT USING (
    user_id = auth.uid()
  );

-- ============================================================================
-- Updated_at trigger
-- ============================================================================
CREATE TRIGGER set_platform_notifications_updated_at
  BEFORE UPDATE ON platform_notifications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Reload PostgREST schema cache
-- ============================================================================
NOTIFY pgrst, 'reload schema';
