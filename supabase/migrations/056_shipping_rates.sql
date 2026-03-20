-- ============================================================================
-- 056: Shipping Rates Config + shipping_method column
-- ============================================================================
-- Seed shipping_rates config row in platform_settings and add
-- shipping_method column to reorder_history for tracking selected method.
-- ============================================================================

-- Seed shipping rates config
INSERT INTO platform_settings (key, value, updated_at)
VALUES ('shipping_rates', '{
  "standard": {"usps_priority":9.99,"ups_ground":15.84,"ups_2day":21.77,"ups_next_day":31.52,"will_call":0},
  "welder": {"west":25.00,"midwest":40.00,"east":60.00,"will_call":0},
  "argon_surcharge": 10.00
}', now())
ON CONFLICT (key) DO NOTHING;

-- Add shipping_method to reorder_history
ALTER TABLE reorder_history ADD COLUMN IF NOT EXISTS shipping_method TEXT;
