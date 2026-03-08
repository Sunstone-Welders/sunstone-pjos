-- ============================================================================
-- Migration 037: Enable RLS on platform_config and sunstone_product_catalog
-- ============================================================================
-- These tables were created without ENABLE ROW LEVEL SECURITY, meaning any
-- authenticated Supabase client has full read/write access.
-- ============================================================================

-- ── platform_config ─────────────────────────────────────────────────────────
ALTER TABLE platform_config ENABLE ROW LEVEL SECURITY;

-- Read-only for all authenticated users (reference data)
CREATE POLICY "Anyone can read platform config"
  ON platform_config FOR SELECT
  USING (true);

-- No INSERT/UPDATE/DELETE policies — only service role can write

-- ── sunstone_product_catalog ────────────────────────────────────────────────
ALTER TABLE sunstone_product_catalog ENABLE ROW LEVEL SECURITY;

-- Read-only for all authenticated users (product catalog)
CREATE POLICY "Anyone can read product catalog"
  ON sunstone_product_catalog FOR SELECT
  USING (true);

-- No INSERT/UPDATE/DELETE policies — only service role can write

-- ── sunstone_catalog_cache (also missing RLS) ───────────────────────────────
ALTER TABLE IF EXISTS sunstone_catalog_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read catalog cache"
  ON sunstone_catalog_cache FOR SELECT
  USING (true);

-- No INSERT/UPDATE/DELETE policies — only service role can write
