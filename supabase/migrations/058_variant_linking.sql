-- 058_variant_linking.sql
-- Add variant-level product linking to inventory items
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS sunstone_variant_id TEXT;
COMMENT ON COLUMN inventory_items.sunstone_variant_id IS
  'Shopify variant ID. Paired with sunstone_product_id for variant-level linking.';
