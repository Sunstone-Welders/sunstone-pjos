// ============================================================================
// Ambassador Utilities — src/lib/ambassador-utils.ts
// ============================================================================
// Referral code generation, validation, and link building.
// ============================================================================

/**
 * Generate a referral code from a name.
 * "Sarah Johnson" → "sarah-johnson"
 * "Luna PJ Studio" → "luna-pj-studio"
 * Strips special chars, lowercases, replaces spaces with hyphens.
 */
export function generateReferralCode(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50);
}

/**
 * Generate a unique referral code — appends random 4-digit suffix if needed.
 * Caller should check for collisions in the database.
 */
export function generateUniqueReferralCode(name: string): string {
  const base = generateReferralCode(name);
  const suffix = Math.floor(1000 + Math.random() * 9000).toString();
  return `${base}-${suffix}`;
}

/**
 * Generate the full referral link from a code.
 */
export function getReferralLink(code: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://sunstonepj.app';
  return `${baseUrl}/join/${code}`;
}

/**
 * Validate a referral code format.
 * Must be lowercase, hyphens, alphanumeric, 3-50 chars.
 */
export function isValidReferralCode(code: string): boolean {
  return /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/.test(code);
}

/**
 * Format ambassador name for public display.
 * "Sarah Johnson" → "Sarah J."
 */
export function formatAmbassadorDisplayName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length < 2) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}
