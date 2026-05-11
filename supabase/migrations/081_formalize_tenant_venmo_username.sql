-- Formalize column added via SQL Editor
-- venmo_username already exists in production but was not tracked in migrations
-- default_payment_processor is already tracked in 020_refunds_expenses_coexistence.sql

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS venmo_username TEXT;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
