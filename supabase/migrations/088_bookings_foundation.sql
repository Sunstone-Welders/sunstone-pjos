-- ============================================================================
-- 088: Bookings Foundation
-- ============================================================================
-- Additive-only schema for the Bookings feature: booking types, availability
-- rules/overrides, bookings table, plus staff dimension columns on
-- tenant_members and booking settings on tenants.
-- No data changes, no drops, no behavior changes to existing features.
-- ============================================================================

-- ═══════════════════════════════════════════════════════════════════════════════
-- A) tenant_role enum: add 'manager'
-- ═══════════════════════════════════════════════════════════════════════════════
-- ALTER TYPE ... ADD VALUE IF NOT EXISTS is supported in PG 9.3+
-- Cannot be run inside a transaction block, but Supabase migrations run each
-- file as its own transaction. If this fails, it means 'manager' already exists.

ALTER TYPE tenant_role ADD VALUE IF NOT EXISTS 'manager';

-- ═══════════════════════════════════════════════════════════════════════════════
-- B) tenant_members: additive columns
-- ═══════════════════════════════════════════════════════════════════════════════
-- display_name already exists on live DB (no migration), so ADD IF NOT EXISTS
-- formalizes it under version control.

ALTER TABLE tenant_members ADD COLUMN IF NOT EXISTS display_name text;
ALTER TABLE tenant_members ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE tenant_members ADD COLUMN IF NOT EXISTS hourly_rate numeric(10,2);
ALTER TABLE tenant_members ADD COLUMN IF NOT EXISTS bookable boolean NOT NULL DEFAULT false;

-- ═══════════════════════════════════════════════════════════════════════════════
-- C) tenants: booking settings columns
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS team_booking_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS customers_choose_staff boolean NOT NULL DEFAULT false;
-- No FK constraint: PostgREST cannot disambiguate a second FK path
-- between tenants and tenant_members. Enforce in application code.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS default_booking_staff_id uuid;

-- ═══════════════════════════════════════════════════════════════════════════════
-- D) booking_types table
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS booking_types (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name                   text NOT NULL,
  description            text,
  duration_minutes       int NOT NULL,
  buffer_before_minutes  int NOT NULL DEFAULT 0,
  buffer_after_minutes   int NOT NULL DEFAULT 0,
  booking_mode           text NOT NULL DEFAULT 'request',  -- 'auto' | 'request'
  price                  numeric(10,2),
  deposit_amount         numeric(10,2),
  deposit_required       boolean NOT NULL DEFAULT false,
  color                  text,
  staff_id               uuid REFERENCES tenant_members(id) ON DELETE SET NULL,
  is_active              boolean NOT NULL DEFAULT true,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- E) availability_rules table (weekly recurring)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS availability_rules (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  staff_id      uuid REFERENCES tenant_members(id) ON DELETE CASCADE,
  day_of_week   int NOT NULL,   -- 0=Sun .. 6=Sat
  start_time    time NOT NULL,
  end_time      time NOT NULL,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- F) availability_overrides table (date-specific blocks/additions)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS availability_overrides (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  staff_id    uuid REFERENCES tenant_members(id) ON DELETE CASCADE,
  date        date NOT NULL,
  start_time  time,            -- null + type='block' = whole day blocked
  end_time    time,
  type        text NOT NULL DEFAULT 'block',  -- 'block' | 'available'
  reason      text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- G) bookings table
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS bookings (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  booking_type_id             uuid NOT NULL REFERENCES booking_types(id) ON DELETE RESTRICT,
  staff_id                    uuid REFERENCES tenant_members(id) ON DELETE SET NULL,
  client_id                   uuid REFERENCES clients(id) ON DELETE SET NULL,
  start_time                  timestamptz NOT NULL,
  end_time                    timestamptz NOT NULL,
  status                      text NOT NULL DEFAULT 'pending',
                              -- pending | confirmed | completed | cancelled | no_show
  customer_name               text,
  customer_phone              text,
  customer_email              text,
  notes                       text,
  -- deposit columns mirrored from party_requests
  deposit_amount              numeric(10,2),
  deposit_status              text DEFAULT 'none',
                              -- none | pending | paid | waived
  deposit_paid_at             timestamptz,
  stripe_checkout_session_id  text,
  stripe_payment_intent_id    text,
  cancellation_token          uuid NOT NULL DEFAULT gen_random_uuid(),
  event_id                    uuid REFERENCES events(id) ON DELETE SET NULL,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- H) Indexes
-- ═══════════════════════════════════════════════════════════════════════════════

-- booking_types
CREATE INDEX IF NOT EXISTS idx_booking_types_tenant
  ON booking_types(tenant_id);
CREATE INDEX IF NOT EXISTS idx_booking_types_tenant_active
  ON booking_types(tenant_id, is_active);

-- availability_rules
CREATE INDEX IF NOT EXISTS idx_availability_rules_tenant
  ON availability_rules(tenant_id);
CREATE INDEX IF NOT EXISTS idx_availability_rules_tenant_staff_dow
  ON availability_rules(tenant_id, staff_id, day_of_week);

-- availability_overrides
CREATE INDEX IF NOT EXISTS idx_availability_overrides_tenant_date
  ON availability_overrides(tenant_id, date);

-- bookings
CREATE INDEX IF NOT EXISTS idx_bookings_tenant
  ON bookings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_bookings_tenant_start
  ON bookings(tenant_id, start_time);
CREATE INDEX IF NOT EXISTS idx_bookings_tenant_status
  ON bookings(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_bookings_cancellation_token
  ON bookings(cancellation_token);
CREATE INDEX IF NOT EXISTS idx_bookings_event
  ON bookings(event_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- I) updated_at triggers (using update_updated_at() from 001_initial_schema)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE TRIGGER set_booking_types_updated_at
  BEFORE UPDATE ON booking_types
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER set_availability_rules_updated_at
  BEFORE UPDATE ON availability_rules
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER set_availability_overrides_updated_at
  BEFORE UPDATE ON availability_overrides
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER set_bookings_updated_at
  BEFORE UPDATE ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════════
-- J) Row Level Security — authenticated tenant-only (no public/anon policies)
-- ═══════════════════════════════════════════════════════════════════════════════
-- Matches the get_user_tenant_ids() + FOR ALL pattern from 051_warranty_system.
-- Public booking page will use service-role API routes (like waivers/parties).

ALTER TABLE booking_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenants can manage their own booking types"
  ON booking_types FOR ALL
  USING (tenant_id IN (SELECT get_user_tenant_ids()));

ALTER TABLE availability_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenants can manage their own availability rules"
  ON availability_rules FOR ALL
  USING (tenant_id IN (SELECT get_user_tenant_ids()));

ALTER TABLE availability_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenants can manage their own availability overrides"
  ON availability_overrides FOR ALL
  USING (tenant_id IN (SELECT get_user_tenant_ids()));

ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenants can manage their own bookings"
  ON bookings FOR ALL
  USING (tenant_id IN (SELECT get_user_tenant_ids()));

-- ═══════════════════════════════════════════════════════════════════════════════
-- Done — notify PostgREST to reload schema cache
-- ═══════════════════════════════════════════════════════════════════════════════

NOTIFY pgrst, 'reload schema';
