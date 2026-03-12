-- ============================================================================
-- Migration 041: Public Artist Profile & Party Booking
-- ============================================================================
-- Adds profile columns to tenants, party_requests table, party_rsvps table.
-- Profile defaults to enabled: true — every artist gets a storefront automatically.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Add profile columns to tenants
-- ---------------------------------------------------------------------------

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS bio text;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS state text;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS instagram_url text;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS facebook_url text;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS tiktok_url text;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS profile_settings jsonb NOT NULL DEFAULT '{"enabled": true, "show_pricing": true, "show_events": true, "show_party_booking": true, "show_contact": true}'::jsonb;

-- ---------------------------------------------------------------------------
-- 2. party_requests table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS party_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'confirmed', 'completed', 'cancelled')),
  host_name text NOT NULL,
  host_email text,
  host_phone text NOT NULL,
  preferred_date date,
  preferred_time text,
  location text,
  estimated_guests integer,
  occasion text,
  message text,
  notes text,
  event_id uuid REFERENCES events(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_party_requests_tenant ON party_requests(tenant_id);
CREATE INDEX IF NOT EXISTS idx_party_requests_status ON party_requests(tenant_id, status);

-- ---------------------------------------------------------------------------
-- 3. party_rsvps table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS party_rsvps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  party_request_id uuid NOT NULL REFERENCES party_requests(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text,
  phone text,
  attending boolean NOT NULL DEFAULT true,
  plus_ones integer NOT NULL DEFAULT 0,
  waiver_signed boolean NOT NULL DEFAULT false,
  waiver_id uuid REFERENCES waivers(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_party_rsvps_request ON party_rsvps(party_request_id);
CREATE INDEX IF NOT EXISTS idx_party_rsvps_tenant ON party_rsvps(tenant_id);

-- ---------------------------------------------------------------------------
-- 4. RLS Policies
-- ---------------------------------------------------------------------------

ALTER TABLE party_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE party_rsvps ENABLE ROW LEVEL SECURITY;

-- party_requests: public INSERT (for booking form)
CREATE POLICY "party_requests_public_insert"
  ON party_requests FOR INSERT
  WITH CHECK (true);

-- party_requests: tenant-scoped SELECT
CREATE POLICY "party_requests_tenant_select"
  ON party_requests FOR SELECT
  USING (tenant_id IN (SELECT get_user_tenant_ids()));

-- party_requests: tenant-scoped UPDATE
CREATE POLICY "party_requests_tenant_update"
  ON party_requests FOR UPDATE
  USING (tenant_id IN (SELECT get_user_tenant_ids()));

-- party_requests: tenant-scoped DELETE
CREATE POLICY "party_requests_tenant_delete"
  ON party_requests FOR DELETE
  USING (tenant_id IN (SELECT get_user_tenant_ids()));

-- party_rsvps: public INSERT (for RSVP form)
CREATE POLICY "party_rsvps_public_insert"
  ON party_rsvps FOR INSERT
  WITH CHECK (true);

-- party_rsvps: tenant-scoped SELECT
CREATE POLICY "party_rsvps_tenant_select"
  ON party_rsvps FOR SELECT
  USING (tenant_id IN (SELECT get_user_tenant_ids()));

-- ---------------------------------------------------------------------------
-- 5. Updated_at trigger for party_requests
-- ---------------------------------------------------------------------------

CREATE OR REPLACE TRIGGER party_requests_updated_at
  BEFORE UPDATE ON party_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
