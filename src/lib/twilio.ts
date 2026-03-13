// ============================================================================
// Twilio Utility — src/lib/twilio.ts
// ============================================================================
// Centralized module for all Twilio operations: sending SMS, phone number
// provisioning, webhook validation, and dedicated number lookup.
// ============================================================================

import { createServiceRoleClient } from '@/lib/supabase/server';

// ---------------------------------------------------------------------------
// Phone Normalization
// ---------------------------------------------------------------------------

/**
 * Normalize a phone number to E.164 format (+1XXXXXXXXXX for US).
 * Strips all non-digit characters, prepends +1 if missing country code.
 */
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('1') && digits.length === 11) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (phone.startsWith('+')) return phone;
  return `+${digits}`;
}

/**
 * Strip a phone number to its last 10 digits for normalized comparison.
 * Works with any format: +18014009693, 801-400-9693, (801) 400-9693, 8014009693, etc.
 */
export function normalizePhoneDigits(phone: string): string {
  return phone.replace(/\D/g, '').slice(-10);
}

// ---------------------------------------------------------------------------
// Dedicated Phone Number Lookup (in-memory cache)
// ---------------------------------------------------------------------------

const phoneCache = new Map<string, { number: string | null; expiresAt: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Look up the dedicated phone number for a tenant.
 * Falls back to the shared platform number if no dedicated number exists.
 */
export async function getFromNumber(tenantId: string): Promise<string> {
  const now = Date.now();
  const cached = phoneCache.get(tenantId);
  if (cached && cached.expiresAt > now && cached.number) {
    return cached.number;
  }

  try {
    const supabase = await createServiceRoleClient();
    const { data } = await supabase
      .from('tenants')
      .select('dedicated_phone_number')
      .eq('id', tenantId)
      .single();

    const number = data?.dedicated_phone_number || process.env.TWILIO_PHONE_NUMBER || '';
    phoneCache.set(tenantId, { number, expiresAt: now + CACHE_TTL });
    return number;
  } catch {
    return process.env.TWILIO_PHONE_NUMBER || '';
  }
}

/** Invalidate cache after provisioning/release. */
export function clearPhoneCache(tenantId: string): void {
  phoneCache.delete(tenantId);
}

// ---------------------------------------------------------------------------
// Send SMS
// ---------------------------------------------------------------------------

/**
 * Send an SMS message via Twilio.
 * If tenantId is provided, sends from the tenant's dedicated number (or falls back to platform number).
 * If skipConsentCheck is false (default) and queueEntryId is provided, checks sms_consent before sending.
 * Returns the Twilio message SID, or null if sending was skipped.
 */
export async function sendSMS(params: {
  to: string;
  body: string;
  tenantId?: string;
  /** Queue entry ID — used to check sms_consent before sending */
  queueEntryId?: string;
  /** Skip consent check (for CRM two-way messages where user initiated) */
  skipConsentCheck?: boolean;
}): Promise<string | null> {
  const { to, body, tenantId, queueEntryId, skipConsentCheck } = params;

  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    console.log(`[Twilio SMS Skipped] Would send to ${to}: ${body.slice(0, 50)}`);
    return null;
  }

  // Belt-and-suspenders consent check for queue-based messages
  if (queueEntryId && !skipConsentCheck) {
    try {
      const supabase = await createServiceRoleClient();
      const { data: entry } = await supabase
        .from('queue_entries')
        .select('sms_consent')
        .eq('id', queueEntryId)
        .single();
      if (entry && !entry.sms_consent) {
        console.log(`[Twilio SMS Blocked] Recipient has not consented — queue entry ${queueEntryId}`);
        return null;
      }
    } catch {
      // If lookup fails, allow send (caller already checked consent)
    }
  }

  const from = tenantId
    ? await getFromNumber(tenantId)
    : (process.env.TWILIO_PHONE_NUMBER || '');

  const twilio = require('twilio');
  const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

  // Build message params — prefer Messaging Service SID for A2P 10DLC compliance
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
  const messageParams: Record<string, string> = {
    body,
    to: normalizePhone(to),
  };

  if (messagingServiceSid) {
    messageParams.messagingServiceSid = messagingServiceSid;
    // Include from number so the recipient sees the tenant's dedicated number
    if (from) messageParams.from = from;
  } else {
    // Fallback for dev/testing without a Messaging Service
    messageParams.from = from;
  }

  const message = await client.messages.create(messageParams);

  return message.sid || null;
}

// ---------------------------------------------------------------------------
// Webhook Validation
// ---------------------------------------------------------------------------

/**
 * Validate an incoming Twilio webhook signature.
 * Returns true in development if TWILIO_SKIP_VALIDATION is set.
 */
export function validateTwilioWebhook(
  url: string,
  params: Record<string, string>,
  signature: string
): boolean {
  if (process.env.TWILIO_SKIP_VALIDATION === 'true') return true;

  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) return false;

  const twilio = require('twilio');
  return twilio.validateRequest(authToken, signature, url, params);
}

// ---------------------------------------------------------------------------
// Phone Number Provisioning
// ---------------------------------------------------------------------------

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://sunstonepj.app';

/**
 * Provision a dedicated Twilio phone number for a tenant.
 * Searches for available local numbers, buys one, and configures the webhook.
 * Returns the phone number + SID, or null on failure.
 */
export async function provisionPhoneNumber(
  tenantId: string,
  areaCode?: string
): Promise<{ phoneNumber: string; sid: string } | null> {
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    console.warn('[Twilio] Cannot provision — missing credentials');
    return null;
  }

  try {
    const supabase = await createServiceRoleClient();

    // Check if tenant already has a dedicated number
    const { data: tenant } = await supabase
      .from('tenants')
      .select('dedicated_phone_number')
      .eq('id', tenantId)
      .single();

    if (tenant?.dedicated_phone_number) {
      console.log('[Twilio] Tenant already has dedicated number:', tenant.dedicated_phone_number);
      return null;
    }

    const twilio = require('twilio');
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

    // Search for available local numbers
    const available = await client.availablePhoneNumbers('US').local.list({
      areaCode: areaCode || '385',
      smsEnabled: true,
      limit: 5,
    });

    if (!available || available.length === 0) {
      // Fallback: try without area code constraint
      const fallback = await client.availablePhoneNumbers('US').local.list({
        smsEnabled: true,
        limit: 5,
      });
      if (!fallback || fallback.length === 0) {
        console.error('[Twilio] No available phone numbers found');
        return null;
      }
      available.push(...fallback);
    }

    const chosen = available[0];

    // Purchase the number and configure webhooks (SMS + Voice)
    const purchased = await client.incomingPhoneNumbers.create({
      phoneNumber: chosen.phoneNumber,
      smsUrl: `${APP_URL}/api/twilio/inbound`,
      smsMethod: 'POST',
      voiceUrl: `${APP_URL}/api/voice/inbound`,
      voiceMethod: 'POST',
      friendlyName: `Sunstone PJOS - ${tenantId.slice(0, 8)}`,
    });

    // Add number to Messaging Service sender pool for A2P 10DLC compliance
    const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
    if (messagingServiceSid) {
      try {
        await client.messaging.v1
          .services(messagingServiceSid)
          .phoneNumbers.create({ phoneNumberSid: purchased.sid });
        console.log(`[Twilio] Added ${purchased.phoneNumber} to Messaging Service ${messagingServiceSid}`);
      } catch (msErr: any) {
        console.error('[Twilio] Failed to add number to Messaging Service:', msErr.message);
        // Non-fatal — number is still usable, just not in the service pool yet
      }
    }

    // Update tenant record
    const { error: updateError } = await supabase
      .from('tenants')
      .update({
        dedicated_phone_number: purchased.phoneNumber,
        dedicated_phone_sid: purchased.sid,
        crm_activated_at: new Date().toISOString(),
      })
      .eq('id', tenantId);

    if (updateError) {
      console.error('[Twilio] Failed to update tenant after provisioning:', updateError);
    }

    // Clear cache so getFromNumber picks up the new number
    clearPhoneCache(tenantId);

    console.log(`[Twilio] Provisioned ${purchased.phoneNumber} for tenant ${tenantId}`);

    return { phoneNumber: purchased.phoneNumber, sid: purchased.sid };
  } catch (err: any) {
    console.error('[Twilio] Provisioning failed:', err.message);
    return null;
  }
}
