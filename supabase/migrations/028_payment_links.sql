-- ============================================================================
-- 028_payment_links.sql — Stripe Payment Links for POS
-- ============================================================================
-- Adds columns to support Stripe Checkout-based payment links in the POS.
-- Customers pay via QR code or text link; platform fee collected automatically.
-- ============================================================================

-- Stripe Checkout session tracking
ALTER TABLE sales ADD COLUMN IF NOT EXISTS stripe_checkout_session_id TEXT;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT;

-- Platform fee actually collected via Stripe (revenue for the platform)
ALTER TABLE sales ADD COLUMN IF NOT EXISTS platform_fee_collected NUMERIC(10,2) DEFAULT 0;

-- Indexes for lookup performance
CREATE INDEX IF NOT EXISTS idx_sales_payment_status ON sales(payment_status);
CREATE INDEX IF NOT EXISTS idx_sales_stripe_session ON sales(stripe_checkout_session_id);
