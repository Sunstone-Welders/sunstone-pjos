// ============================================================================
// CRM Trial Check — POST /api/crm/check-trial
// ============================================================================
// Lazy check on dashboard load. If CRM trial expired and no subscription,
// disable CRM features. Returns current CRM status.
// ============================================================================

import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { getCrmStatus } from '@/lib/crm-status';

export async function POST() {
  try {
    const supabase = await createServerSupabase();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: member } = await supabase
      .from('tenant_members')
      .select('tenant_id')
      .eq('user_id', user.id)
      .not('accepted_at', 'is', null)
      .limit(1)
      .single();

    if (!member) {
      return NextResponse.json({ error: 'No tenant' }, { status: 404 });
    }

    const { data: tenant } = await supabase
      .from('tenants')
      .select('crm_enabled, crm_trial_start, crm_trial_end, crm_subscription_id, crm_deactivated_at')
      .eq('id', member.tenant_id)
      .single();

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    const status = getCrmStatus(tenant);

    // If trial expired and CRM is still marked enabled, disable it
    if (status.trialExpired && tenant.crm_enabled && !tenant.crm_subscription_id) {
      await supabase
        .from('tenants')
        .update({
          crm_enabled: false,
          crm_deactivated_at: new Date().toISOString(),
        })
        .eq('id', member.tenant_id);

      return NextResponse.json({
        ...status,
        active: false,
        justExpired: true,
      });
    }

    return NextResponse.json(status);
  } catch (error: any) {
    console.error('[CRM Check Trial]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
