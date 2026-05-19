-- Custom storefront domain for Business tier
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS custom_domain TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS custom_domain_status TEXT DEFAULT 'none'
  CHECK (custom_domain_status IN ('none', 'pending_dns', 'dns_verified', 'provisioning', 'active', 'error'));
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS custom_domain_error TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS custom_domain_verified_at TIMESTAMPTZ;

-- Index for middleware hostname lookup (needs to be fast — runs on every request)
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_custom_domain
  ON tenants(custom_domain) WHERE custom_domain IS NOT NULL;

NOTIFY pgrst, 'reload schema';
