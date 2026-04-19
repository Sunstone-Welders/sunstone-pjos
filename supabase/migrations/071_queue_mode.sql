-- 071: Add queue_mode flag to events
-- When true, waiver signers are auto-enqueued and get position SMS.
-- When false (default), waivers work normally but no queue entry is created.
ALTER TABLE events ADD COLUMN IF NOT EXISTS queue_mode boolean NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';
