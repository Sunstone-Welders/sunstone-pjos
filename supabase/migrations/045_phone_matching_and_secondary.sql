-- ============================================================================
-- Migration 045: Phone Matching + Secondary Phone Numbers
-- ============================================================================
-- 1. find_client_by_phone() — DB-side normalized phone matching
-- 2. link_orphaned_conversations() — Retroactive conversation linking
-- 3. client_phone_numbers table — Multiple phones per client
-- 4. Backfill primary phones from clients.phone
-- 5. sync_client_primary_phone() trigger
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. find_client_by_phone(p_tenant_id, p_digits)
-- ---------------------------------------------------------------------------
-- Strips clients.phone to last 10 digits and compares.
-- Also checks client_phone_numbers.phone_normalized.
-- Returns TABLE(id, phone) LIMIT 1.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION find_client_by_phone(p_tenant_id uuid, p_digits text)
RETURNS TABLE(id uuid, phone text) AS $$
BEGIN
  -- First check clients.phone (primary)
  RETURN QUERY
    SELECT c.id, c.phone
    FROM clients c
    WHERE c.tenant_id = p_tenant_id
      AND c.phone IS NOT NULL
      AND RIGHT(REGEXP_REPLACE(c.phone, '\D', '', 'g'), 10) = RIGHT(REGEXP_REPLACE(p_digits, '\D', '', 'g'), 10)
    LIMIT 1;

  IF FOUND THEN RETURN; END IF;

  -- Fallback: check client_phone_numbers
  RETURN QUERY
    SELECT c.id, c.phone
    FROM client_phone_numbers cpn
    JOIN clients c ON c.id = cpn.client_id
    WHERE cpn.tenant_id = p_tenant_id
      AND cpn.phone_normalized = RIGHT(REGEXP_REPLACE(p_digits, '\D', '', 'g'), 10)
    LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ---------------------------------------------------------------------------
-- 2. link_orphaned_conversations(p_tenant_id, p_client_id, p_digits)
-- ---------------------------------------------------------------------------
-- Updates conversations where client_id IS NULL and phone digits match.
-- Returns the count of linked conversations.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION link_orphaned_conversations(p_tenant_id uuid, p_client_id uuid, p_digits text)
RETURNS integer AS $$
DECLARE
  linked_count integer;
BEGIN
  UPDATE conversations
  SET client_id = p_client_id
  WHERE tenant_id = p_tenant_id
    AND client_id IS NULL
    AND RIGHT(REGEXP_REPLACE(phone_number, '\D', '', 'g'), 10) = RIGHT(REGEXP_REPLACE(p_digits, '\D', '', 'g'), 10);

  GET DIAGNOSTICS linked_count = ROW_COUNT;
  RETURN linked_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ---------------------------------------------------------------------------
-- 3. client_phone_numbers table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS client_phone_numbers (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  phone text NOT NULL,
  phone_normalized text NOT NULL, -- last 10 digits only
  label text DEFAULT 'mobile',
  is_primary boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Unique: no duplicate normalized numbers within a tenant
CREATE UNIQUE INDEX IF NOT EXISTS idx_client_phone_numbers_tenant_normalized
  ON client_phone_numbers (tenant_id, phone_normalized);

-- Fast lookup by client
CREATE INDEX IF NOT EXISTS idx_client_phone_numbers_client
  ON client_phone_numbers (client_id);

-- RLS
ALTER TABLE client_phone_numbers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can manage client phone numbers"
  ON client_phone_numbers
  FOR ALL
  USING (tenant_id IN (SELECT get_user_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT get_user_tenant_ids()));

-- ---------------------------------------------------------------------------
-- 4. Backfill primary phones from clients.phone
-- ---------------------------------------------------------------------------

INSERT INTO client_phone_numbers (tenant_id, client_id, phone, phone_normalized, label, is_primary)
SELECT
  c.tenant_id,
  c.id,
  c.phone,
  RIGHT(REGEXP_REPLACE(c.phone, '\D', '', 'g'), 10),
  'mobile',
  true
FROM clients c
WHERE c.phone IS NOT NULL
  AND LENGTH(REGEXP_REPLACE(c.phone, '\D', '', 'g')) >= 10
ON CONFLICT (tenant_id, phone_normalized) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 5. sync_client_primary_phone() trigger
-- ---------------------------------------------------------------------------
-- Keeps client_phone_numbers in sync when clients.phone changes.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION sync_client_primary_phone()
RETURNS trigger AS $$
DECLARE
  old_normalized text;
  new_normalized text;
BEGIN
  -- Only act if phone actually changed
  IF OLD.phone IS NOT DISTINCT FROM NEW.phone THEN
    RETURN NEW;
  END IF;

  -- Remove old primary entry
  IF OLD.phone IS NOT NULL AND LENGTH(REGEXP_REPLACE(OLD.phone, '\D', '', 'g')) >= 10 THEN
    old_normalized := RIGHT(REGEXP_REPLACE(OLD.phone, '\D', '', 'g'), 10);
    DELETE FROM client_phone_numbers
    WHERE client_id = NEW.id AND is_primary = true;
  END IF;

  -- Insert new primary entry
  IF NEW.phone IS NOT NULL AND LENGTH(REGEXP_REPLACE(NEW.phone, '\D', '', 'g')) >= 10 THEN
    new_normalized := RIGHT(REGEXP_REPLACE(NEW.phone, '\D', '', 'g'), 10);
    INSERT INTO client_phone_numbers (tenant_id, client_id, phone, phone_normalized, label, is_primary)
    VALUES (NEW.tenant_id, NEW.id, NEW.phone, new_normalized, 'mobile', true)
    ON CONFLICT (tenant_id, phone_normalized) DO UPDATE
      SET client_id = EXCLUDED.client_id,
          phone = EXCLUDED.phone,
          is_primary = true;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_sync_client_primary_phone
  AFTER UPDATE OF phone ON clients
  FOR EACH ROW
  EXECUTE FUNCTION sync_client_primary_phone();
