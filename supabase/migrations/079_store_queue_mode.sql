-- ============================================================================
-- 079: Store Queue Mode
-- ============================================================================
-- 1. Make queue_entries.event_id nullable (store mode queue has no event)
-- 2. Add store_queue_mode boolean to tenants table
-- 3. Add index for store mode queue queries
-- ============================================================================

-- 1. Make event_id nullable on queue_entries
ALTER TABLE queue_entries ALTER COLUMN event_id DROP NOT NULL;

-- 2. Add store_queue_mode flag to tenants
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS store_queue_mode boolean NOT NULL DEFAULT false;

-- 3. Index for store mode queue queries (tenant_id where event_id IS NULL)
CREATE INDEX IF NOT EXISTS idx_queue_store_mode
  ON queue_entries (tenant_id, status)
  WHERE event_id IS NULL;
