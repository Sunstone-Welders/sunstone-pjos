// ============================================================================
// Salesforce API Client — src/lib/salesforce.ts
// ============================================================================
// Uses jsforce for OAuth + API calls. Provides SOQL query, create, update,
// get, and Apex REST helpers for the Studio Reorder API.
// ============================================================================

import jsforce from 'jsforce';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedConnection: any = null;
let connectionExpiresAt = 0;

// ── Connection ───────────────────────────────────────────────────────────

async function getConnection(): Promise<any> {
  // Return cached connection if still fresh
  if (cachedConnection && connectionExpiresAt > Date.now()) {
    return cachedConnection;
  }

  const loginUrl = process.env.SF_LOGIN_URL || 'https://login.salesforce.com';
  const username = process.env.SF_USERNAME || '';
  const password = process.env.SF_PASSWORD || '';
  const securityToken = process.env.SF_SECURITY_TOKEN || '';

  if (!username || !password) {
    throw new Error(
      `Salesforce credentials missing: ${[
        !username && 'SF_USERNAME',
        !password && 'SF_PASSWORD',
      ].filter(Boolean).join(', ')}`
    );
  }

  console.log('[SF Auth] Connecting via jsforce:', {
    loginUrl,
    username: !!username,
    password: !!password,
    securityToken: securityToken ? 'set' : 'empty',
  });

  const conn = new jsforce.Connection({ loginUrl });
  await conn.login(username, password + securityToken);

  console.log('[SF Auth] Login successful, instance:', conn.instanceUrl);

  cachedConnection = conn;
  // Cache for 55 minutes (SF sessions last longer but we refresh early)
  connectionExpiresAt = Date.now() + 55 * 60 * 1000;

  return conn;
}

/**
 * Clear cached connection (used on auth failure for retry).
 */
function clearConnection() {
  cachedConnection = null;
  connectionExpiresAt = 0;
}

// ── API Helpers ──────────────────────────────────────────────────────────

/**
 * Run a SOQL query and return the records array.
 */
export async function sfQuery<T = Record<string, any>>(soql: string): Promise<T[]> {
  const conn = await getConnection();
  try {
    const result = await conn.query(soql);
    return result.records || [];
  } catch (err: any) {
    if (err.errorCode === 'INVALID_SESSION_ID') {
      clearConnection();
      const retryConn = await getConnection();
      const result = await retryConn.query(soql);
      return result.records || [];
    }
    throw err;
  }
}

/**
 * Create a record and return the new Id.
 */
export async function sfCreate(
  objectType: string,
  fields: Record<string, any>
): Promise<string> {
  const conn = await getConnection();
  try {
    const result = await conn.sobject(objectType).create(fields);
    if (!result.success || !result.id) {
      throw new Error(`SF create ${objectType} failed: ${JSON.stringify(result)}`);
    }
    return result.id;
  } catch (err: any) {
    if (err.errorCode === 'INVALID_SESSION_ID') {
      clearConnection();
      const retryConn = await getConnection();
      const result = await retryConn.sobject(objectType).create(fields);
      if (!result.success || !result.id) {
        throw new Error(`SF create ${objectType} failed: ${JSON.stringify(result)}`);
      }
      return result.id;
    }
    throw err;
  }
}

/**
 * Update a record by Id. Returns void on success.
 */
export async function sfUpdate(
  objectType: string,
  id: string,
  fields: Record<string, any>
): Promise<void> {
  const conn = await getConnection();
  try {
    await conn.sobject(objectType).update({ Id: id, ...fields });
  } catch (err: any) {
    if (err.errorCode === 'INVALID_SESSION_ID') {
      clearConnection();
      const retryConn = await getConnection();
      await retryConn.sobject(objectType).update({ Id: id, ...fields });
      return;
    }
    throw err;
  }
}

/**
 * Get a single record by Id with specific fields.
 */
export async function sfGet<T = Record<string, any>>(
  objectType: string,
  id: string,
  fields?: string[]
): Promise<T> {
  const conn = await getConnection();
  try {
    if (fields?.length) {
      const result = await conn.sobject(objectType).retrieve(id);
      // jsforce returns all fields; pick only requested ones if specified
      const filtered: any = {};
      for (const f of fields) {
        filtered[f] = (result as any)[f];
      }
      return filtered as T;
    }
    return (await conn.sobject(objectType).retrieve(id)) as T;
  } catch (err: any) {
    if (err.errorCode === 'INVALID_SESSION_ID') {
      clearConnection();
      const retryConn = await getConnection();
      if (fields?.length) {
        const result = await retryConn.sobject(objectType).retrieve(id);
        const filtered: any = {};
        for (const f of fields) {
          filtered[f] = (result as any)[f];
        }
        return filtered as T;
      }
      return (await retryConn.sobject(objectType).retrieve(id)) as T;
    }
    throw err;
  }
}

// ── Apex REST (Studio Reorder API) ───────────────────────────────────────

/**
 * Call the custom SF Apex REST endpoint: /services/apexrest/studio/reorder
 */
export async function sfApexRest(action: string, data: Record<string, any> = {}): Promise<any> {
  const conn = await getConnection();

  const doRequest = async (c: any) => {
    const result = await c.requestPost('/services/apexrest/studio/reorder', {
      action,
      ...data,
    });
    // Apex REST returns a JSON string — parse if needed
    if (typeof result === 'string') {
      try { return JSON.parse(result); } catch { return result; }
    }
    return result;
  };

  try {
    return await doRequest(conn);
  } catch (err: any) {
    if (err.errorCode === 'INVALID_SESSION_ID') {
      clearConnection();
      const retryConn = await getConnection();
      return await doRequest(retryConn);
    }
    throw err;
  }
}

// ── Convenience wrappers ─────────────────────────────────────────────────

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
