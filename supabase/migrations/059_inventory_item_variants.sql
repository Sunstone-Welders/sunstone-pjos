-- ============================================================================
-- 059: Inventory Item Variants
-- ============================================================================
-- Sub-variants for inventory items (e.g., birthstone months, charm designs,
-- jump ring gauges). Each variant has its own stock count, cost, sell price.
-- Chains do NOT use this — chains are tracked by metal/inch already.
-- ============================================================================

-- Inventory item variants table
CREATE TABLE inventory_item_variants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  inventory_item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sku TEXT,
  cost_per_unit NUMERIC(10,4) NOT NULL DEFAULT 0,
  sell_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  quantity_on_hand NUMERIC(12,4) NOT NULL DEFAULT 0,
  reorder_threshold NUMERIC(12,4) DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sunstone_variant_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_item_variants_item ON inventory_item_variants(inventory_item_id);
CREATE INDEX idx_item_variants_tenant ON inventory_item_variants(tenant_id);
CREATE INDEX idx_item_variants_low_stock ON inventory_item_variants(tenant_id)
  WHERE quantity_on_hand <= reorder_threshold AND is_active = true;

-- RLS
ALTER TABLE inventory_item_variants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own tenant variants"
  ON inventory_item_variants FOR SELECT
  USING (tenant_id IN (SELECT get_user_tenant_ids()));

CREATE POLICY "Users can insert own tenant variants"
  ON inventory_item_variants FOR INSERT
  WITH CHECK (tenant_id IN (SELECT get_user_tenant_ids()));

CREATE POLICY "Users can update own tenant variants"
  ON inventory_item_variants FOR UPDATE
  USING (tenant_id IN (SELECT get_user_tenant_ids()));

CREATE POLICY "Users can delete own tenant variants"
  ON inventory_item_variants FOR DELETE
  USING (tenant_id IN (SELECT get_user_tenant_ids()));

-- Add has_variants flag to inventory_items
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS has_variants BOOLEAN NOT NULL DEFAULT false;

-- Add variant_id to sale_items (for POS — will be used in the next prompt)
ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS inventory_variant_id UUID REFERENCES inventory_item_variants(id);

-- Add variant_id to inventory_movements (for stock tracking per variant)
ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS inventory_variant_id UUID REFERENCES inventory_item_variants(id);
