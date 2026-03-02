-- ============================================================================
-- Migration: platform_settings table
-- ============================================================================
-- Key-value store for platform-wide settings (Shopify OAuth tokens, etc.)
-- Only accessible via service role — no user-facing RLS policies.
-- ============================================================================

CREATE TABLE IF NOT EXISTS platform_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS: only service role should access this (no RLS policy = denied by default with RLS enabled)
ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (bypasses RLS automatically)
-- No user-facing policies needed — this is admin-only data
