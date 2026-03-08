-- ============================================================================
-- Migration 040: Create mentor_knowledge_gaps & mentor_knowledge_additions
-- ============================================================================
-- These tables were referenced in code but never created (migration 027 was
-- skipped). This migration creates both tables with proper RLS policies.
--
-- mentor_knowledge_gaps: Stores questions Sunny couldn't fully answer.
--   Inserted by the mentor route (service role) when gap is detected.
--   Reviewed by platform admins in the Learning tab.
--
-- mentor_knowledge_additions: Approved Q&A pairs that enhance Sunny's knowledge.
--   Created by admins (via Learning tab) or Atlas AI (via approve_knowledge_gap tool).
-- ============================================================================

-- ── Table: mentor_knowledge_gaps ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS mentor_knowledge_gaps (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid REFERENCES tenants(id) ON DELETE CASCADE,
  user_id       uuid,
  user_message  text NOT NULL,
  sunny_response text,
  category      text DEFAULT 'other',
  topic         text DEFAULT 'other',
  status        text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'approved', 'dismissed')),
  admin_notes   text,
  reviewed_at   timestamptz,
  reviewed_by   uuid,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_knowledge_gaps_status
  ON mentor_knowledge_gaps(status);
CREATE INDEX IF NOT EXISTS idx_knowledge_gaps_tenant
  ON mentor_knowledge_gaps(tenant_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_gaps_created
  ON mentor_knowledge_gaps(created_at DESC);

-- RLS
ALTER TABLE mentor_knowledge_gaps ENABLE ROW LEVEL SECURITY;

-- Service role (Sunny's gap detection) can insert
-- Service role bypasses RLS, so no INSERT policy needed for that path.
-- Platform admins read/update via service role client too.

-- Tenant members can view their own tenant's gaps (optional, not currently used in UI)
CREATE POLICY "Tenant members can view own gaps"
  ON mentor_knowledge_gaps FOR SELECT
  USING (tenant_id IN (SELECT get_user_tenant_ids()));


-- ── Table: mentor_knowledge_additions ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS mentor_knowledge_additions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category      text NOT NULL DEFAULT 'other',
  question      text NOT NULL,
  answer        text NOT NULL,
  keywords      text[] DEFAULT '{}',
  source_gap_id uuid REFERENCES mentor_knowledge_gaps(id) ON DELETE SET NULL,
  source        text,
  created_by    uuid,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_knowledge_additions_active
  ON mentor_knowledge_additions(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_knowledge_additions_category
  ON mentor_knowledge_additions(category);

-- RLS
ALTER TABLE mentor_knowledge_additions ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read active additions (Sunny needs to query these)
CREATE POLICY "Authenticated users can read active additions"
  ON mentor_knowledge_additions FOR SELECT
  USING (is_active = true AND auth.uid() IS NOT NULL);
