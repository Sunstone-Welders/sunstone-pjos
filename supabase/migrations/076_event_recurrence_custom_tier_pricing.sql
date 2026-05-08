-- ============================================================================
-- Migration 076: Event Recurrence + Custom Tier Pricing
-- ============================================================================
-- 1. Adds recurring_group_id to events for tracking batch-created recurring events
-- 2. Creates pricing_tier_custom_prices for custom product type prices per tier
-- ============================================================================

-- ============================================================================
-- EVENT RECURRENCE TRACKING
-- ============================================================================

ALTER TABLE events ADD COLUMN IF NOT EXISTS recurring_group_id UUID;

-- ============================================================================
-- CUSTOM TIER PRICING
-- ============================================================================
-- Allows custom product types (beyond the 5 built-in) to have tier-based prices.
-- Each row maps a pricing_tier + product_type to a specific price.

CREATE TABLE IF NOT EXISTS pricing_tier_custom_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  pricing_tier_id UUID NOT NULL REFERENCES pricing_tiers(id) ON DELETE CASCADE,
  product_type_id UUID NOT NULL REFERENCES product_types(id) ON DELETE CASCADE,
  price NUMERIC(10,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(pricing_tier_id, product_type_id)
);

CREATE INDEX idx_ptcp_tenant ON pricing_tier_custom_prices(tenant_id);
CREATE INDEX idx_ptcp_tier ON pricing_tier_custom_prices(pricing_tier_id);

ALTER TABLE pricing_tier_custom_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenants can manage their own custom tier prices"
  ON pricing_tier_custom_prices FOR ALL
  USING (tenant_id IN (SELECT get_user_tenant_ids()));
