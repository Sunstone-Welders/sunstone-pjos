// ============================================================================
// Artist Ambassador Enrollment — POST /api/ambassador/enroll
// ============================================================================
// Enrolls the current user as an artist ambassador (auto-approved).
// Requires an active paid subscription.
// ============================================================================

import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceRoleClient } from '@/lib/supabase/server';
import { generateReferralCode, generateUniqueReferralCode } from '@/lib/ambassador-utils';

export async function POST() {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = await createServiceRoleClient();

    // Check if already an ambassador
    const { data: existing } = await admin
      .from('ambassadors')
      .select('id, status')
      .eq('user_id', user.id)
      .single();

    if (existing) {
      return NextResponse.json({ error: 'Already enrolled as ambassador', ambassador: existing }, { status: 409 });
    }

    // Get tenant info for the user
    const { data: member } = await admin
      .from('tenant_members')
      .select('tenant_id')
      .eq('user_id', user.id)
      .limit(1)
      .single();

    if (!member) {
      return NextResponse.json({ error: 'No tenant found' }, { status: 403 });
    }

    const { data: tenant } = await admin
      .from('tenants')
      .select('id, name, subscription_tier, subscription_status, trial_ends_at')
      .eq('id', member.tenant_id)
      .single();

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    // Check for active paid subscription (not trial, not expired)
    const isTrialing = tenant.subscription_status === 'trialing';
    const isStarter = tenant.subscription_tier === 'starter' && !isTrialing;
    const isPaid = ['starter', 'pro', 'business'].includes(tenant.subscription_tier) &&
      tenant.subscription_status === 'active';

    if (!isPaid && !isStarter) {
      return NextResponse.json(
        { error: 'Ambassadors must be on a paid plan. Upgrade to get started.' },
        { status: 403 }
      );
    }

    // Generate referral code from business name
    let referralCode = generateReferralCode(tenant.name);
    const { data: codeExists } = await admin
      .from('ambassadors')
      .select('id')
      .eq('referral_code', referralCode)
      .single();

    if (codeExists) {
      referralCode = generateUniqueReferralCode(tenant.name);
    }

    // Create ambassador record (auto-approved for paying artists)
    const { data: ambassador, error: insertError } = await admin
      .from('ambassadors')
      .insert({
        tenant_id: tenant.id,
        user_id: user.id,
        type: 'artist',
        status: 'active',
        name: tenant.name,
        email: user.email || '',
        referral_code: referralCode,
        approved_at: new Date().toISOString(),
      })
      .select('*')
      .single();

    if (insertError) {
      console.error('[Ambassador Enroll] Insert failed:', insertError);
      return NextResponse.json({ error: 'Failed to enroll' }, { status: 500 });
    }

    return NextResponse.json({ ambassador }, { status: 201 });
  } catch (error: any) {
    console.error('[Ambassador Enroll] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
