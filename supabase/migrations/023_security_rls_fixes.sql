-- ============================================================================
-- Migration 023: Security RLS Fixes
-- ============================================================================
-- Enables RLS and adds tenant-scoped policies on tables that were missing them:
--   - message_log
--   - client_notes
--   - admin_notes
-- Also fixes the overly-permissive dashboard_card_cache policy.
-- ============================================================================

-- ── message_log ─────────────────────────────────────────────────────────────

ALTER TABLE message_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view their message logs"
  ON message_log FOR SELECT
  USING (tenant_id IN (SELECT get_user_tenant_ids()));

CREATE POLICY "Tenant members can insert message logs"
  ON message_log FOR INSERT
  WITH CHECK (tenant_id IN (SELECT get_user_tenant_ids()));

-- ── client_notes ────────────────────────────────────────────────────────────

ALTER TABLE client_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view their client notes"
  ON client_notes FOR SELECT
  USING (tenant_id IN (SELECT get_user_tenant_ids()));

CREATE POLICY "Tenant members can insert client notes"
  ON client_notes FOR INSERT
  WITH CHECK (tenant_id IN (SELECT get_user_tenant_ids()));

CREATE POLICY "Tenant members can update their client notes"
  ON client_notes FOR UPDATE
  USING (tenant_id IN (SELECT get_user_tenant_ids()));

CREATE POLICY "Tenant members can delete their client notes"
  ON client_notes FOR DELETE
  USING (tenant_id IN (SELECT get_user_tenant_ids()));

-- ── admin_notes ─────────────────────────────────────────────────────────────
-- admin_notes are platform-level notes about tenants, written by platform admins.
-- Regular users should not see them. Service role (used by admin routes) bypasses RLS.

ALTER TABLE admin_notes ENABLE ROW LEVEL SECURITY;

-- No user-facing policies — admin_notes are only accessed via service role
-- in admin API routes that call verifyPlatformAdmin() first.

-- ── dashboard_card_cache — fix blanket policy ───────────────────────────────
-- The existing "Service role full access to card cache" policy uses
-- USING (true) WITH CHECK (true), which is overly permissive.
-- Service role already bypasses RLS automatically, so that policy is redundant
-- AND it also grants access to any authenticated user (not just service role).
-- Drop it and keep only the tenant-scoped SELECT policy.

DROP POLICY IF EXISTS "Service role full access to card cache" ON dashboard_card_cache;
