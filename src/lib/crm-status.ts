// ============================================================================
// CRM Status Utility — src/lib/crm-status.ts
// ============================================================================
// Determines whether CRM features are active for a tenant based on
// trial dates and CRM subscription status.
// ============================================================================

interface CrmStatusInput {
  crm_enabled?: boolean;
  crm_trial_start?: string | null;
  crm_trial_end?: string | null;
  crm_subscription_id?: string | null;
  crm_deactivated_at?: string | null;
}

export interface CrmStatus {
  active: boolean;
  reason: 'trial' | 'subscribed' | 'expired' | 'deactivated' | 'none';
  daysLeft: number | null;
  trialExpired: boolean;
}

export function getCrmStatus(tenant: CrmStatusInput | null | undefined): CrmStatus {
  if (!tenant) {
    return { active: false, reason: 'none', daysLeft: null, trialExpired: false };
  }

  // Explicitly deactivated
  if (tenant.crm_deactivated_at && !tenant.crm_subscription_id) {
    return { active: false, reason: 'deactivated', daysLeft: null, trialExpired: true };
  }

  // Active paid subscription
  if (tenant.crm_subscription_id) {
    return { active: true, reason: 'subscribed', daysLeft: null, trialExpired: false };
  }

  // Check trial
  if (tenant.crm_trial_end) {
    const now = new Date();
    const trialEnd = new Date(tenant.crm_trial_end);
    const daysLeft = Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (daysLeft > 0) {
      return { active: true, reason: 'trial', daysLeft, trialExpired: false };
    }

    // Trial expired
    return { active: false, reason: 'expired', daysLeft: 0, trialExpired: true };
  }

  // Legacy: crm_enabled but no trial dates (pre-migration)
  if (tenant.crm_enabled) {
    return { active: true, reason: 'trial', daysLeft: null, trialExpired: false };
  }

  return { active: false, reason: 'none', daysLeft: null, trialExpired: false };
}
