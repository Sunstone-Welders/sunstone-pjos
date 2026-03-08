-- ============================================================================
-- Migration 036: Fix platform_costs blanket RLS policy
-- ============================================================================
-- The existing USING(true) WITH CHECK(true) policy grants any authenticated
-- user full read/write access to all platform cost records. Service role
-- already bypasses RLS, so this policy only opens the door to regular users.
-- ============================================================================

-- Drop the overly-permissive blanket policy
DROP POLICY IF EXISTS "Service role full access" ON platform_costs;

-- No user-facing policies needed — service role bypasses RLS automatically.
-- Regular authenticated users should have zero access to platform cost data.
