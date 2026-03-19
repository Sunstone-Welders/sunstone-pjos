// ============================================================================
// Salesforce API Client — src/lib/salesforce.ts
// ============================================================================
// Username-Password OAuth flow with token caching. Provides SOQL query,
// create, update, and get helpers for SF REST API v59.0.
// ============================================================================

const SF_LOGIN_URL = process.env.SF_LOGIN_URL || 'https://login.salesforce.com';
const SF_CLIENT_ID = process.env.SF_CLIENT_ID!;
const SF_CLIENT_SECRET = process.env.SF_CLIENT_SECRET!;
const SF_USERNAME = process.env.SF_USERNAME!;
const SF_PASSWORD = process.env.SF_PASSWORD!;
const SF_SECURITY_TOKEN = process.env.SF_SECURITY_TOKEN || '';
const SF_API_VERSION = 'v59.0';

interface SFToken {
  accessToken: string;
  instanceUrl: string;
  expiresAt: number;
}

let cachedToken: SFToken | null = null;

// ── Auth ──────────────────────────────────────────────────────────────────

async function authenticate(): Promise<SFToken> {
  // Diagnostic: log which env vars are present (never log values)
  console.log('[SF Auth] Config check:', {
    SF_LOGIN_URL: SF_LOGIN_URL,
    SF_CLIENT_ID: !!SF_CLIENT_ID,
    SF_CLIENT_SECRET: !!SF_CLIENT_SECRET,
    SF_USERNAME: !!SF_USERNAME,
    SF_PASSWORD: !!SF_PASSWORD,
    SF_SECURITY_TOKEN: SF_SECURITY_TOKEN ? 'set' : 'empty',
  });

  if (!SF_CLIENT_ID || !SF_CLIENT_SECRET || !SF_USERNAME || !SF_PASSWORD) {
    throw new Error(
      `Salesforce env vars missing: ${[
        !SF_CLIENT_ID && 'SF_CLIENT_ID',
        !SF_CLIENT_SECRET && 'SF_CLIENT_SECRET',
        !SF_USERNAME && 'SF_USERNAME',
        !SF_PASSWORD && 'SF_PASSWORD',
      ].filter(Boolean).join(', ')}`
    );
  }

  const params = new URLSearchParams({
    grant_type: 'password',
    client_id: SF_CLIENT_ID,
    client_secret: SF_CLIENT_SECRET,
    username: SF_USERNAME,
    password: `${SF_PASSWORD}${SF_SECURITY_TOKEN}`,
  });

  const res = await fetch(`${SF_LOGIN_URL}/services/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error('[SF Auth] Failed:', res.status, text);
    throw new Error(`Salesforce authentication failed: ${res.status}`);
  }

  const data = await res.json();
  const token: SFToken = {
    accessToken: data.access_token,
    instanceUrl: data.instance_url,
    // Cache for 1 hour (SF sessions last longer but we refresh early)
    expiresAt: Date.now() + 55 * 60 * 1000,
  };

  cachedToken = token;
  return token;
}

async function getToken(): Promise<SFToken> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken;
  }
  return authenticate();
}

// ── API Helpers ───────────────────────────────────────────────────────────

async function sfFetch(
  path: string,
  options: RequestInit = {},
  retry = true
): Promise<any> {
  const token = await getToken();
  const url = `${token.instanceUrl}/services/data/${SF_API_VERSION}${path}`;

  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token.accessToken}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  // Auto-refresh on 401 and retry once
  if (res.status === 401 && retry) {
    cachedToken = null;
    return sfFetch(path, options, false);
  }

  if (!res.ok) {
    const body = await res.text();
    console.error(`[SF API] ${res.status} ${path}:`, body);
    throw new Error(`Salesforce API error ${res.status}: ${body}`);
  }

  // Some operations (204 No Content) return no body
  if (res.status === 204) return null;

  return res.json();
}

/**
 * Run a SOQL query and return the records array.
 */
export async function sfQuery<T = Record<string, any>>(soql: string): Promise<T[]> {
  const data = await sfFetch(`/query?q=${encodeURIComponent(soql)}`);
  return (data?.records || []) as T[];
}

/**
 * Create a record and return the new Id.
 */
export async function sfCreate(
  objectType: string,
  fields: Record<string, any>
): Promise<string> {
  const data = await sfFetch(`/sobjects/${objectType}`, {
    method: 'POST',
    body: JSON.stringify(fields),
  });
  if (!data?.id) {
    throw new Error(`SF create ${objectType} returned no id`);
  }
  return data.id as string;
}

/**
 * Update a record by Id. Returns null on success.
 */
export async function sfUpdate(
  objectType: string,
  id: string,
  fields: Record<string, any>
): Promise<void> {
  await sfFetch(`/sobjects/${objectType}/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(fields),
  });
}

/**
 * Get a single record by Id with specific fields.
 */
export async function sfGet<T = Record<string, any>>(
  objectType: string,
  id: string,
  fields?: string[]
): Promise<T> {
  const fieldParam = fields?.length ? `?fields=${fields.join(',')}` : '';
  return sfFetch(`/sobjects/${objectType}/${id}${fieldParam}`) as Promise<T>;
}

// ── Apex REST (Studio Reorder API) ────────────────────────────────────────

/**
 * Call the custom SF Apex REST endpoint: /services/apexrest/studio/reorder
 */
export async function sfApexRest(action: string, data: Record<string, any> = {}): Promise<any> {
  const token = await getToken();
  const url = `${token.instanceUrl}/services/apexrest/studio/reorder`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action, ...data }),
  });

  // Auto-refresh on 401 and retry once
  if (res.status === 401) {
    cachedToken = null;
    const retryToken = await getToken();
    const retryRes = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${retryToken.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action, ...data }),
    });
    if (!retryRes.ok) {
      const body = await retryRes.text();
      console.error(`[SF ApexRest] ${retryRes.status}:`, body);
      throw new Error(`SF Apex REST error ${retryRes.status}: ${body}`);
    }
    return retryRes.json();
  }

  if (!res.ok) {
    const body = await res.text();
    console.error(`[SF ApexRest] ${res.status}:`, body);
    throw new Error(`SF Apex REST error ${res.status}: ${body}`);
  }

  return res.json();
}

/**
 * Find SF Account by Contact email. Returns account info + payment methods flag.
 */
export async function sfFindAccount(email: string) {
  return sfApexRest('findAccount', { email });
}

/**
 * Get saved Authorize.net payment methods for an SF Account.
 */
export async function sfGetPaymentMethods(accountId: string) {
  return sfApexRest('getPaymentMethods', { accountId });
}

/**
 * Charge a saved card on an Opportunity via Authorize.net.
 */
export async function sfChargeSavedCard(
  opportunityId: string,
  amount: number,
  cardId: string,
  accountId: string
) {
  return sfApexRest('chargeSavedCard', {
    opportunityId,
    amount,
    cardId,
    accountId,
  });
}

/**
 * Add a new card to an SF Account via Authorize.net.
 */
export async function sfAddCard(
  accountId: string,
  cardData: {
    nameOnCard: string;
    cardNumber: string;
    expirationMonth: number;
    expirationYear: number;
    cvv: string;
  }
) {
  return sfApexRest('addCard', {
    accountId,
    ...cardData,
  });
}

/**
 * Multi-strategy account search: email → business name → person name.
 * Returns { matches: [...], confidence: 'exact_email' | 'business_name' | 'person_name' | 'none' }
 */
export async function sfSearchAccounts(
  email: string,
  businessName: string,
  firstName: string,
  lastName: string
) {
  return sfApexRest('searchAccounts', {
    email,
    businessName,
    firstName,
    lastName,
  });
}

/**
 * Create a new SF Account + Contact for a first-time customer.
 * Returns { success, accountId, contactId } or { success: false, error }.
 */
export async function sfCreateAccount(accountData: {
  accountName: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  shippingStreet: string;
  shippingCity: string;
  shippingState: string;
  shippingPostalCode: string;
  shippingCountry: string;
}) {
  return sfApexRest('createAccount', accountData);
}
