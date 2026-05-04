// ============================================================================
// Subscription Utilities — src/lib/subscription.ts
// ============================================================================
// Centralized subscription tier logic: feature gating, trial checking,
// platform fee rates, and Sunny question limits.
// ============================================================================

export type SubscriptionTier = 'starter' | 'pro' | 'business';
export type SubscriptionStatus = 'none' | 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid';

export type Feature =
  | 'ai_insights'
  | 'full_reports'
  | 'crm'
  | 'unlimited_sunny'
  | 'team_members_3'
  | 'team_members_unlimited';

// Feature access matrix
const FEATURE_ACCESS: Record<Feature, SubscriptionTier[]> = {
  ai_insights:            ['pro', 'business'],
  full_reports:           ['pro', 'business'],
  crm:                    ['pro', 'business'],
  unlimited_sunny:        ['pro', 'business'],
  team_members_3:         ['pro', 'business'],
  team_members_unlimited: ['business'],
};

// Platform fee rates by tier (as decimal — 0.03 = 3%)
const FEE_RATES: Record<SubscriptionTier, number> = {
  starter:  0.03,   // 3%
  pro:      0.015,  // 1.5%
  business: 0,      // 0%
};

// Platform fee rates as stored in DB (percentage number — 3 = 3%)
const FEE_PERCENT: Record<SubscriptionTier, number> = {
  starter:  3,
  pro:      1.5,
  business: 0,
};

// Sunny question limits per tier
const SUNNY_LIMITS: Record<SubscriptionTier, number> = {
  starter:  5,
  pro:      Infinity,
  business: Infinity,
};

// ============================================================================
// Tenant subscription shape (matches the DB columns)
// ============================================================================

interface TenantSubscriptionFields {
  subscription_tier: SubscriptionTier;
  subscription_status: SubscriptionStatus;
  trial_ends_at: string | null;
  subscription_period_end: string | null;
  admin_tier_override?: boolean;
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Returns the effective subscription tier for a tenant.
 * If trialing but trial has expired, returns 'starter'.
 */
export function getSubscriptionTier(tenant: TenantSubscriptionFields): SubscriptionTier {
  // Admin override — skip all Stripe/trial logic
  if (tenant.admin_tier_override && tenant.subscription_tier) {
    return tenant.subscription_tier;
  }

  if (tenant.subscription_status === 'trialing') {
    if (!tenant.trial_ends_at) return 'starter';
    const trialEnd = new Date(tenant.trial_ends_at);
    if (trialEnd <= new Date()) return 'starter'; // Trial expired
    return tenant.subscription_tier; // Still in trial
  }

  if (tenant.subscription_status === 'active') {
    return tenant.subscription_tier;
  }

  // past_due gets a grace period — keep their tier
  if (tenant.subscription_status === 'past_due') {
    return tenant.subscription_tier;
  }

  // canceled, unpaid, none → starter
  return 'starter';
}

/**
 * Whether the tenant's trial is currently active.
 */
export function isTrialActive(tenant: TenantSubscriptionFields): boolean {
  // Admin override means no trial logic applies
  if (tenant.admin_tier_override) return false;
  if (tenant.subscription_status !== 'trialing') return false;
  if (!tenant.trial_ends_at) return false;
  return new Date(tenant.trial_ends_at) > new Date();
}

/**
 * Number of days remaining in trial. Returns 0 if not trialing or expired.
 */
export function getTrialDaysRemaining(tenant: TenantSubscriptionFields): number {
  if (tenant.admin_tier_override) return 0;
  if (!isTrialActive(tenant)) return 0;
  const now = new Date();
  const end = new Date(tenant.trial_ends_at!);
  const diffMs = end.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
}

/**
 * Platform fee rate as a decimal (0.03, 0.015, 0) for the given tier.
 */
export function getPlatformFeeRate(tier: SubscriptionTier): number {
  return FEE_RATES[tier] ?? 0.03;
}

/**
 * Platform fee rate as a percentage number (3, 1.5, 0) for the given tier.
 * This matches the `platform_fee_percent` DB column format.
 */
export function getPlatformFeePercent(tier: SubscriptionTier): number {
  return FEE_PERCENT[tier] ?? 3;
}

/**
 * Whether the given tier can access a specific feature.
 */
export function canAccessFeature(tier: SubscriptionTier, feature: Feature): boolean {
  return FEATURE_ACCESS[feature]?.includes(tier) ?? false;
}

/**
 * Sunny AI Mentor question limit for the tier.
 * Returns Infinity for pro/business (unlimited).
 */
export function getSunnyQuestionLimit(tier: SubscriptionTier): number {
  return SUNNY_LIMITS[tier] ?? 5;
}