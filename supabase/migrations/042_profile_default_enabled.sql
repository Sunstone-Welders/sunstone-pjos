-- ============================================================================
-- Migration 042: Set profile default to enabled for all tenants
-- ============================================================================
-- Every artist gets a storefront with zero setup. They can turn it OFF
-- if they want, but the default is ON.
-- ============================================================================

-- Enable profile for all existing tenants
UPDATE tenants
SET profile_settings = jsonb_set(
  COALESCE(profile_settings, '{}'::jsonb),
  '{enabled}',
  'true'::jsonb
)
WHERE profile_settings IS NULL
   OR profile_settings->>'enabled' = 'false'
   OR profile_settings->>'enabled' IS NULL;

-- Update the column default for future tenants
ALTER TABLE tenants
ALTER COLUMN profile_settings
SET DEFAULT '{"enabled": true, "show_pricing": true, "show_events": true, "show_party_booking": true, "show_contact": true}'::jsonb;
