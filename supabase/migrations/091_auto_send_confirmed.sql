-- 091: Add auto_send_confirmed flag to tenants
-- Tracks whether a tenant has acknowledged the auto-send confirmation modal.
-- Once true, subsequent "Send automatically" toggles skip the confirmation.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS auto_send_confirmed BOOLEAN DEFAULT false;
