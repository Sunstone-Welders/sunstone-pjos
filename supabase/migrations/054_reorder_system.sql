-- ============================================================================
-- 054_reorder_system.sql — One-Touch Sunstone Reorder
-- ============================================================================
-- Adds:
-- 1. sunstone_product_id column on inventory_items (links to Shopify product)
-- 2. reorder_history table for tracking supply reorders
-- ============================================================================

-- ── 1. Link inventory items to Shopify products ────────────────────────────

ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS sunstone_product_id TEXT;

COMMENT ON COLUMN inventory_items.sunstone_product_id IS
  'Shopify product GID (e.g. gid://shopify/Product/12345). Set when item is sourced from Sunstone Supply.';

CREATE INDEX IF NOT EXISTS idx_inventory_sunstone_product
  ON inventory_items(sunstone_product_id)
  WHERE sunstone_product_id IS NOT NULL;

-- ── 2. Reorder history ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS reorder_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  shopify_draft_order_id TEXT,
  shopify_order_id TEXT,
  shopify_order_name TEXT,
  invoice_url TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  items JSONB NOT NULL DEFAULT '[]',
  total_amount NUMERIC DEFAULT 0,
  notes TEXT,
  ordered_by UUID REFERENCES auth.users(id),
  received_at TIMESTAMPTZ,
  received_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON COLUMN reorder_history.status IS 'draft | checkout_sent | completed | cancelled';
COMMENT ON COLUMN reorder_history.items IS '[{inventory_item_id, variant_id, name, quantity, unit_price}]';

-- ── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE reorder_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenants can view their own reorders"
  ON reorder_history FOR SELECT
  USING (tenant_id IN (SELECT get_user_tenant_ids()));

CREATE POLICY "Tenants can create reorders"
  ON reorder_history FOR INSERT
  WITH CHECK (tenant_id IN (SELECT get_user_tenant_ids()));

CREATE POLICY "Tenants can update their own reorders"
  ON reorder_history FOR UPDATE
  USING (tenant_id IN (SELECT get_user_tenant_ids()));

-- ── Indexes ─────────────────────────────────────────────────────────────────

CREATE INDEX idx_reorder_history_tenant ON reorder_history(tenant_id);
CREATE INDEX idx_reorder_history_status ON reorder_history(status);
CREATE INDEX idx_reorder_history_created ON reorder_history(tenant_id, created_at DESC);
