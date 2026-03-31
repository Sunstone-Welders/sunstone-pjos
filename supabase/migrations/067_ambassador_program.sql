-- ============================================================================
-- Migration 067: Ambassador Program — Core Tables
-- ============================================================================
-- Creates the ambassador program tables: ambassadors, referrals,
-- commission_entries, ambassador_payouts. Adds referral attribution
-- columns to tenants. Enables RLS on all new tables.
-- ============================================================================

-- ── Enums ────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE ambassador_type AS ENUM ('artist', 'external');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE ambassador_status AS ENUM ('pending', 'active', 'suspended', 'terminated');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE referral_status AS ENUM ('clicked', 'signed_up', 'converted', 'churned', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE commission_status AS ENUM ('pending', 'approved', 'paid', 'reversed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE payout_status AS ENUM ('pending', 'processing', 'paid', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Ambassadors ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ambassadors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id),
  type ambassador_type NOT NULL,
  status ambassador_status NOT NULL DEFAULT 'pending',
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT,
  referral_code TEXT NOT NULL UNIQUE,
  stripe_connect_account_id TEXT,
  stripe_connect_onboarded BOOLEAN NOT NULL DEFAULT false,
  custom_code_requested TEXT,
  max_active_referrals INT NOT NULL DEFAULT 100,
  community_description TEXT,
  social_links TEXT,
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES auth.users(id),
  suspended_at TIMESTAMPTZ,
  suspended_reason TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ambassadors_code ON ambassadors(referral_code);
CREATE INDEX IF NOT EXISTS idx_ambassadors_tenant ON ambassadors(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ambassadors_email ON ambassadors(email);
CREATE INDEX IF NOT EXISTS idx_ambassadors_status ON ambassadors(status);
CREATE INDEX IF NOT EXISTS idx_ambassadors_user ON ambassadors(user_id);

-- ── Referrals ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS referrals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ambassador_id UUID NOT NULL REFERENCES ambassadors(id) ON DELETE CASCADE,
  referred_tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
  referral_code_used TEXT NOT NULL,
  attribution_source TEXT,
  cookie_set_at TIMESTAMPTZ,
  status referral_status NOT NULL DEFAULT 'clicked',
  signed_up_at TIMESTAMPTZ,
  converted_at TIMESTAMPTZ,
  churned_at TIMESTAMPTZ,
  commission_expires_at TIMESTAMPTZ,
  total_commission_earned NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_commission_paid NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_referrals_ambassador ON referrals(ambassador_id);
CREATE INDEX IF NOT EXISTS idx_referrals_tenant ON referrals(referred_tenant_id);
CREATE INDEX IF NOT EXISTS idx_referrals_status ON referrals(status);
CREATE INDEX IF NOT EXISTS idx_referrals_code ON referrals(referral_code_used);

-- ── Commission Entries ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS commission_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  referral_id UUID NOT NULL REFERENCES referrals(id) ON DELETE CASCADE,
  ambassador_id UUID NOT NULL REFERENCES ambassadors(id) ON DELETE CASCADE,
  billing_period_start DATE NOT NULL,
  billing_period_end DATE NOT NULL,
  referred_billing_amount NUMERIC(10,2) NOT NULL,
  commission_rate NUMERIC(5,4) NOT NULL DEFAULT 0.2000,
  commission_amount NUMERIC(10,2) NOT NULL,
  status commission_status NOT NULL DEFAULT 'pending',
  payout_id UUID,
  paid_at TIMESTAMPTZ,
  stripe_invoice_id TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_commissions_ambassador ON commission_entries(ambassador_id);
CREATE INDEX IF NOT EXISTS idx_commissions_referral ON commission_entries(referral_id);
CREATE INDEX IF NOT EXISTS idx_commissions_status ON commission_entries(status);

-- ── Ambassador Payouts ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ambassador_payouts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ambassador_id UUID NOT NULL REFERENCES ambassadors(id) ON DELETE CASCADE,
  total_amount NUMERIC(10,2) NOT NULL,
  commission_count INT NOT NULL,
  stripe_transfer_id TEXT,
  stripe_connect_account_id TEXT NOT NULL,
  status payout_status NOT NULL DEFAULT 'pending',
  scheduled_for DATE NOT NULL,
  processed_at TIMESTAMPTZ,
  failed_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payouts_ambassador ON ambassador_payouts(ambassador_id);
CREATE INDEX IF NOT EXISTS idx_payouts_status ON ambassador_payouts(status);
CREATE INDEX IF NOT EXISTS idx_payouts_scheduled ON ambassador_payouts(scheduled_for);

-- FK from commission_entries → ambassador_payouts (deferred because both must exist)
ALTER TABLE commission_entries
  ADD CONSTRAINT fk_commission_payout
  FOREIGN KEY (payout_id) REFERENCES ambassador_payouts(id);

CREATE INDEX IF NOT EXISTS idx_commissions_payout ON commission_entries(payout_id);

-- ── Tenants: referral attribution columns ────────────────────────────────────

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS referred_by_ambassador_id UUID REFERENCES ambassadors(id);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS referral_code_used TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS referral_cookie_data JSONB;

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE ambassadors ENABLE ROW LEVEL SECURITY;
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE ambassador_payouts ENABLE ROW LEVEL SECURITY;

-- Ambassadors: users can read/update own record
CREATE POLICY "ambassadors_select_own" ON ambassadors
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "ambassadors_update_own" ON ambassadors
  FOR UPDATE USING (user_id = auth.uid());

-- Platform admins can do everything on ambassadors
CREATE POLICY "ambassadors_admin_all" ON ambassadors
  FOR ALL USING (
    EXISTS (SELECT 1 FROM platform_admins WHERE user_id = auth.uid())
  );

-- Referrals: ambassadors can read their own
CREATE POLICY "referrals_select_own" ON referrals
  FOR SELECT USING (
    ambassador_id IN (SELECT id FROM ambassadors WHERE user_id = auth.uid())
  );

CREATE POLICY "referrals_admin_all" ON referrals
  FOR ALL USING (
    EXISTS (SELECT 1 FROM platform_admins WHERE user_id = auth.uid())
  );

-- Commission entries: ambassadors can read their own
CREATE POLICY "commissions_select_own" ON commission_entries
  FOR SELECT USING (
    ambassador_id IN (SELECT id FROM ambassadors WHERE user_id = auth.uid())
  );

CREATE POLICY "commissions_admin_all" ON commission_entries
  FOR ALL USING (
    EXISTS (SELECT 1 FROM platform_admins WHERE user_id = auth.uid())
  );

-- Payouts: ambassadors can read their own
CREATE POLICY "payouts_select_own" ON ambassador_payouts
  FOR SELECT USING (
    ambassador_id IN (SELECT id FROM ambassadors WHERE user_id = auth.uid())
  );

CREATE POLICY "payouts_admin_all" ON ambassador_payouts
  FOR ALL USING (
    EXISTS (SELECT 1 FROM platform_admins WHERE user_id = auth.uid())
  );

-- ── Updated_at triggers ──────────────────────────────────────────────────────

CREATE TRIGGER set_updated_at BEFORE UPDATE ON ambassadors
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON referrals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
