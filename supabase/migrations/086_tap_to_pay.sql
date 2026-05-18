-- ============================================================================
-- Migration 086: Tap to Pay tenant fields
-- ============================================================================

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS tap_to_pay_enabled BOOLEAN DEFAULT false;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS tap_to_pay_terms_accepted_at TIMESTAMPTZ;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS tap_to_pay_terms_accepted_by UUID REFERENCES auth.users(id);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS tap_to_pay_splash_shown BOOLEAN DEFAULT false;

NOTIFY pgrst, 'reload schema';
