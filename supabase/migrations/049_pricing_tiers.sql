-- ============================================================================
-- Migration 049: Pricing Tiers
-- ============================================================================
-- Adds tier-based pricing for chains. Artists create named pricing tiers
-- (e.g., "Sterling Silver", "Gold Filled", "Premium/14k"), each with default
-- prices for every product type. Individual chains are assigned to a tier.
-- ============================================================================

-- ============================================================================
-- PRICING TIERS TABLE
-- ============================================================================

CREATE TABLE pricing_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  bracelet_price NUMERIC(10,2),
  anklet_price NUMERIC(10,2),
  ring_price NUMERIC(10,2),
  necklace_price_per_inch NUMERIC(10,2),
  hand_chain_price NUMERIC(10,2),
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pricing_tiers_tenant ON pricing_tiers(tenant_id);

ALTER TABLE pricing_tiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenants can manage their own pricing tiers"
  ON pricing_tiers FOR ALL
  USING (tenant_id IN (SELECT get_user_tenant_ids()));

-- ============================================================================
-- LINK INVENTORY ITEMS TO A TIER
-- ============================================================================

ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS pricing_tier_id UUID REFERENCES pricing_tiers(id) ON DELETE SET NULL;

-- ============================================================================
-- TENANT-LEVEL PRICING MODE
-- ============================================================================
-- Valid values: 'flat', 'per_product', 'tier'
-- Default 'per_product' preserves existing behavior for all current tenants.

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS pricing_mode TEXT DEFAULT 'per_product';
