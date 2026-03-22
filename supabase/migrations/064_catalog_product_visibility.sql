-- ============================================================================
-- 064: Catalog Product Visibility Overrides
-- ============================================================================
-- Platform-wide visibility control for the Shop Sunstone artist catalog.
-- Products are visible by default; this table stores explicit hide/show overrides.
-- Managed by platform admins only — no tenant_id, no RLS needed.
-- ============================================================================

CREATE TABLE IF NOT EXISTS catalog_product_visibility (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shopify_product_id TEXT NOT NULL UNIQUE,
  is_visible BOOLEAN NOT NULL DEFAULT true,
  hidden_reason TEXT,
  hidden_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_catalog_visibility_product ON catalog_product_visibility(shopify_product_id);
CREATE INDEX idx_catalog_visibility_hidden ON catalog_product_visibility(is_visible) WHERE is_visible = false;
