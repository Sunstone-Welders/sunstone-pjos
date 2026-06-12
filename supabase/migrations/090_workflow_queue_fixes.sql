-- ============================================================================
-- 090: Workflow Queue Fixes — reconcile live schema to code expectations
-- ============================================================================
-- APPLY MANUALLY in Supabase SQL Editor before deploying code changes.
-- ============================================================================

-- 1. workflow_queue.description — declared in migration 014 but never applied
--    to live DB. Every queueWorkflow() insert has failed with 42703 since launch.
ALTER TABLE workflow_queue ADD COLUMN IF NOT EXISTS description text;

-- 2. workflow_templates.trigger_tag — referenced in workflows.ts:94 for
--    tag_added trigger type. Latent bug until we enable tag-based workflows.
ALTER TABLE workflow_templates ADD COLUMN IF NOT EXISTS trigger_tag text;

-- 3. workflow_templates.send_mode — NEW column. Gates the cron processor.
--    'review_first' (default) = manual review via NeedsAttention widget.
--    'auto_send' = cron sends automatically when scheduled_for is due.
ALTER TABLE workflow_templates ADD COLUMN IF NOT EXISTS send_mode text DEFAULT 'review_first';

-- Force PostgREST to pick up the schema changes immediately
NOTIFY pgrst, 'reload schema';
