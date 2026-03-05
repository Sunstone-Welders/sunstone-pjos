-- ============================================================================
-- 032: CRM trial columns, auto-reply, Sunny text responder
-- ============================================================================

-- CRM trial + subscription columns
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS crm_trial_start TIMESTAMPTZ;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS crm_trial_end TIMESTAMPTZ;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS crm_subscription_id TEXT;

-- Auto-reply settings
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS auto_reply_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS auto_reply_message TEXT DEFAULT 'Thanks for your message! I''m currently with a client but will get back to you as soon as I can.';

-- Sunny text responder mode: off | suggest | auto
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS sunny_text_mode TEXT NOT NULL DEFAULT 'off';

-- AI suggested response on conversations
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS ai_suggested_response TEXT;

-- Enable CRM for all existing tenants (they get crm included in trial or are already paying)
UPDATE tenants
SET crm_enabled = true,
    crm_activated_at = COALESCE(crm_activated_at, created_at),
    crm_trial_start = COALESCE(created_at, NOW()),
    crm_trial_end = COALESCE(trial_ends_at, created_at + INTERVAL '60 days')
WHERE crm_enabled = false OR crm_trial_start IS NULL;
