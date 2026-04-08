-- Trial expiration email tracking
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS trial_email_7day_sent_at timestamptz;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS trial_email_1day_sent_at timestamptz;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS trial_email_expired_sent_at timestamptz;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS trial_reactivated_at timestamptz;

NOTIFY pgrst, 'reload schema';
