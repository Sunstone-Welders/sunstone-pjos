-- 087_ambassador_only_mode.sql
-- Flag for ambassador-only tenants (influencers who don't use Studio tools)
-- These tenants see only the Ambassador dashboard + Settings.

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS ambassador_only boolean NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';
