-- ============================================================================
-- 055: Salesforce Reorder Integration
-- ============================================================================
-- Adds SF fields to reorder_history, SF account cache + Stripe reorder
-- customer ID to tenants.
-- ============================================================================

-- SF + Stripe fields on reorder_history
ALTER TABLE reorder_history ADD COLUMN IF NOT EXISTS sf_opportunity_id TEXT;
ALTER TABLE reorder_history ADD COLUMN IF NOT EXISTS sf_quote_id TEXT;
ALTER TABLE reorder_history ADD COLUMN IF NOT EXISTS sf_order_id TEXT;
ALTER TABLE reorder_history ADD COLUMN IF NOT EXISTS tracking_number TEXT;
ALTER TABLE reorder_history ADD COLUMN IF NOT EXISTS shipping_carrier TEXT;
ALTER TABLE reorder_history ADD COLUMN IF NOT EXISTS shipping_status TEXT DEFAULT 'processing';
ALTER TABLE reorder_history ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT;
ALTER TABLE reorder_history ADD COLUMN IF NOT EXISTS tax_amount NUMERIC DEFAULT 0;
ALTER TABLE reorder_history ADD COLUMN IF NOT EXISTS shipping_amount NUMERIC DEFAULT 0;

-- SF Account ID cache on tenants
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS sf_account_id TEXT;

-- Stripe customer ID for reorder payments (separate from Connect customer)
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS stripe_reorder_customer_id TEXT;
