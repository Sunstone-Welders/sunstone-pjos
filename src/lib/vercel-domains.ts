// ============================================================================
// Vercel Domains API — src/lib/vercel-domains.ts
// ============================================================================
// Wraps the Vercel Domains API for custom storefront domain management.
// Business tier only. Used by /api/storefront/domain route.
// ============================================================================

const VERCEL_API_TOKEN = process.env.VERCEL_API_TOKEN;
const VERCEL_PROJECT_ID = process.env.VERCEL_PROJECT_ID;
const VERCEL_TEAM_ID = process.env.VERCEL_TEAM_ID; // optional, needed if project is in a team

function teamQuery(): string {
  return VERCEL_TEAM_ID ? `?teamId=${VERCEL_TEAM_ID}` : '';
}

function headers(): Record<string, string> {
  if (!VERCEL_API_TOKEN) throw new Error('VERCEL_API_TOKEN is not configured');
  return {
    Authorization: `Bearer ${VERCEL_API_TOKEN}`,
    'Content-Type': 'application/json',
  };
}

function ensureProjectId(): string {
  if (!VERCEL_PROJECT_ID) throw new Error('VERCEL_PROJECT_ID is not configured');
  return VERCEL_PROJECT_ID;
}

// ── Domain validation ────────────────────────────────────────────────────────

const DOMAIN_REGEX = /^(?!-)[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)*\.[a-zA-Z]{2,}$/;

export function isValidDomain(domain: string): boolean {
  if (!domain || domain.length > 253) return false;
  return DOMAIN_REGEX.test(domain);
}

export function normalizeDomain(raw: string): string {
  let d = raw.trim().toLowerCase();
  // Strip protocol
  d = d.replace(/^https?:\/\//, '');
  // Strip trailing path/slash
  d = d.split('/')[0];
  // Strip www. prefix
  if (d.startsWith('www.')) d = d.slice(4);
  return d;
}

export function isSubdomain(domain: string): boolean {
  return domain.split('.').length > 2;
}

// ── API helpers ──────────────────────────────────────────────────────────────

async function vercelFetch(
  path: string,
  options: RequestInit = {}
): Promise<{ ok: boolean; status: number; data: any }> {
  const url = `https://api.vercel.com${path}${path.includes('?') ? '&' : '?'}${VERCEL_TEAM_ID ? `teamId=${VERCEL_TEAM_ID}` : ''}`;
  try {
    const res = await fetch(url, { ...options, headers: headers() });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch (err: any) {
    return { ok: false, status: 0, data: { error: { message: err.message || 'Network error' } } };
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

export interface AddDomainResult {
  success: boolean;
  verified: boolean;
  verification?: { type: string; domain: string; value: string }[];
  error?: string;
}

/**
 * Add a domain to the Vercel project.
 * Returns verification records if the domain needs DNS verification.
 */
export async function addDomainToProject(domain: string): Promise<AddDomainResult> {
  const projectId = ensureProjectId();
  const { ok, status, data } = await vercelFetch(
    `/v10/projects/${projectId}/domains`,
    { method: 'POST', body: JSON.stringify({ name: domain }) }
  );

  if (ok) {
    return {
      success: true,
      verified: data.verified ?? false,
      verification: data.verification || undefined,
    };
  }

  // Domain already in use by another project
  if (status === 409) {
    return {
      success: false,
      verified: false,
      error: 'This domain is already in use by another project. Please remove it there first or use a different domain.',
    };
  }

  return {
    success: false,
    verified: false,
    error: data?.error?.message || `Vercel API error (${status})`,
  };
}

/**
 * Remove a domain from the Vercel project.
 */
export async function removeDomainFromProject(domain: string): Promise<{ success: boolean; error?: string }> {
  const projectId = ensureProjectId();
  const { ok, data } = await vercelFetch(
    `/v10/projects/${projectId}/domains/${encodeURIComponent(domain)}`,
    { method: 'DELETE' }
  );

  if (ok) return { success: true };
  return { success: false, error: data?.error?.message || 'Failed to remove domain' };
}

export interface DomainStatus {
  verified: boolean;
  configured: boolean;
  misconfigured: boolean;
  error?: string;
}

/**
 * Get domain configuration status from Vercel.
 */
export async function getDomainStatus(domain: string): Promise<DomainStatus> {
  const projectId = ensureProjectId();
  const { ok, data } = await vercelFetch(
    `/v10/projects/${projectId}/domains/${encodeURIComponent(domain)}`,
    { method: 'GET' }
  );

  if (!ok) {
    return { verified: false, configured: false, misconfigured: false, error: data?.error?.message };
  }

  return {
    verified: data.verified ?? false,
    configured: !data.misconfigured,
    misconfigured: data.misconfigured ?? false,
  };
}

export interface VerifyResult {
  verified: boolean;
  error?: string;
}

/**
 * Trigger DNS verification for a domain.
 */
export async function verifyDomainDNS(domain: string): Promise<VerifyResult> {
  const projectId = ensureProjectId();
  const { ok, data } = await vercelFetch(
    `/v10/projects/${projectId}/domains/${encodeURIComponent(domain)}/verify`,
    { method: 'POST' }
  );

  if (ok) {
    return { verified: data.verified ?? false };
  }

  return { verified: false, error: data?.error?.message || 'Verification failed' };
}
