-- ============================================================================
-- 089: Multi-Provider Deposit Support
-- ============================================================================
-- Adds deposit_payment_provider and square_order_id to bookings and
-- party_requests tables so deposits can be collected via Stripe OR Square.
-- ============================================================================

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS deposit_payment_provider text,
  ADD COLUMN IF NOT EXISTS square_order_id text;

ALTER TABLE party_requests
  ADD COLUMN IF NOT EXISTS deposit_payment_provider text,
  ADD COLUMN IF NOT EXISTS square_order_id text;

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
