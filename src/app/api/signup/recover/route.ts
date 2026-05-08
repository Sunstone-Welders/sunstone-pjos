// ============================================================================
// Signup Recovery Route — src/app/api/signup/recover/route.ts
// ============================================================================
// Creates tenant + tenant_member for authenticated users who have an auth
// account but no tenant (orphaned signup). Called from the onboarding page
// when it detects a logged-in user with no workspace.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase, createServiceRoleClient } from '@/lib/supabase/server';
import { provisionPhoneNumber } from '@/lib/twilio';

export async function POST(request: NextRequest) {
  try {
    const { businessName } = await request.json();

    if (!businessName || typeof businessName !== 'string' || !businessName.trim()) {
      return NextResponse.json(
        { error: 'Business name is required' },
        { status: 400 }
      );
    }

    // Authenticate via session (user is already logged in)
    const sessionSupabase = await createServerSupabase();
    const { data: { user } } = await sessionSupabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Use service role for writes (bypasses RLS)
    const supabase = await createServiceRoleClient();

    // Verify this user truly has no tenant
    const { data: existingMember } = await supabase
      .from('tenant_members')
      .select('tenant_id')
      .eq('user_id', user.id)
      .limit(1)
      .single();

    if (existingMember) {
      // They already have a workspace — redirect will handle it
      return NextResponse.json({ tenantId: existingMember.tenant_id });
    }

    // Also check if they own a tenant without a member row
    const { data: ownedTenant } = await supabase
      .from('tenants')
      .select('id')
      .eq('owner_id', user.id)
      .limit(1)
      .single();

    if (ownedTenant) {
      // Tenant exists but no member row — repair the membership
      const { error: memberError } = await supabase
        .from('tenant_members')
        .insert({
          tenant_id: ownedTenant.id,
          user_id: user.id,
          role: 'admin',
          accepted_at: new Date().toISOString(),
        });

      if (memberError) {
        console.error('[signup/recover] Failed to repair membership', {
          userId: user.id,
          tenantId: ownedTenant.id,
          error: memberError.message,
        });
        return NextResponse.json(
          { error: 'Failed to restore your workspace. Please contact support.' },
          { status: 500 }
        );
      }

      console.log('[signup/recover] Repaired missing membership', {
        userId: user.id,
        tenantId: ownedTenant.id,
      });
      return NextResponse.json({ tenantId: ownedTenant.id });
    }

    // No tenant at all — create one fresh
    const trimmedName = businessName.trim();
    const slug =
      trimmedName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .substring(0, 48) + `-${Date.now().toString(36)}`;

    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 30);

    // Create tenant
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .insert({
        name: trimmedName,
        slug,
        owner_id: user.id,
        subscription_tier: 'pro',
        subscription_status: 'trialing',
        trial_ends_at: trialEndsAt.toISOString(),
        platform_fee_percent: 0,
        crm_enabled: true,
        crm_activated_at: new Date().toISOString(),
        crm_trial_start: new Date().toISOString(),
        crm_trial_end: trialEndsAt.toISOString(),
        onboarding_completed: false,
        onboarding_step: 0,
        onboarding_data: {},
      })
      .select('id')
      .single();

    if (tenantError) {
      console.error('[signup/recover] FAILED to create tenant', {
        userId: user.id,
        error: tenantError.message,
        code: tenantError.code,
      });
      return NextResponse.json(
        { error: 'Failed to create your workspace. Please contact support.' },
        { status: 500 }
      );
    }

    // Create membership
    const { error: memberError } = await supabase
      .from('tenant_members')
      .insert({
        tenant_id: tenant.id,
        user_id: user.id,
        role: 'admin',
        accepted_at: new Date().toISOString(),
      });

    if (memberError) {
      console.error('[signup/recover] FAILED to create membership', {
        userId: user.id,
        tenantId: tenant.id,
        error: memberError.message,
      });
      // Rollback tenant
      await supabase.from('tenants').delete().eq('id', tenant.id);
      return NextResponse.json(
        { error: 'Failed to create your workspace. Please contact support.' },
        { status: 500 }
      );
    }

    console.log('[signup/recover] Created workspace for orphaned user', {
      userId: user.id,
      tenantId: tenant.id,
    });

    // Non-blocking: provision phone number
    provisionPhoneNumber(tenant.id).catch(err =>
      console.warn('[signup/recover] Auto-provision phone failed:', err.message)
    );

    return NextResponse.json({ tenantId: tenant.id });
  } catch (error: any) {
    console.error('[signup/recover] Unhandled error:', error);
    return NextResponse.json(
      { error: 'Something went wrong. Please try again or contact support.' },
      { status: 500 }
    );
  }
}
