// ============================================================================
// Signup Route — src/app/api/signup/route.ts
// ============================================================================
// Creates tenant + tenant_member using service role (bypasses RLS).
// Sets 60-day Pro trial on new tenants.
// Stores first_name in auth user metadata.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase, createServiceRoleClient } from '@/lib/supabase/server';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';
import { provisionPhoneNumber } from '@/lib/twilio';

const RATE_LIMIT = { prefix: 'signup', limit: 5, windowSeconds: 300 };

export async function POST(request: NextRequest) {
  try {
    // Rate limit by IP (5 signups per 5 minutes)
    const ip = getClientIP(request);
    const rl = checkRateLimit(ip, RATE_LIMIT);
    if (!rl.allowed) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const { userId, businessName, firstName } = await request.json();

    if (!userId || !businessName) {
      return NextResponse.json(
        { error: 'Missing userId or businessName' },
        { status: 400 }
      );
    }

    // ── Verify caller identity — userId must match the authenticated user ──
    const authClient = await createServerSupabase();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user || user.id !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Use service role client — bypasses RLS entirely
    const supabase = await createServiceRoleClient();

    // Create slug from business name
    const slug =
      businessName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .substring(0, 48) + `-${Date.now().toString(36)}`;

    // Calculate trial end date (60 days from now)
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 60);

    // 1. Create tenant with 60-day Pro trial
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .insert({
        name: businessName,
        slug,
        owner_id: userId,
        // Subscription: 60-day Pro trial
        subscription_tier: 'pro',
        subscription_status: 'trialing',
        trial_ends_at: trialEndsAt.toISOString(),
        platform_fee_percent: 1.5,
        // CRM: enabled during trial
        crm_enabled: true,
        crm_activated_at: new Date().toISOString(),
        crm_trial_start: new Date().toISOString(),
        crm_trial_end: trialEndsAt.toISOString(),
        // Onboarding
        onboarding_completed: false,
        onboarding_step: 0,
        onboarding_data: {},
      })
      .select('id')
      .single();

    if (tenantError) {
      console.error('Tenant creation failed:', tenantError);
      return NextResponse.json(
        { error: 'Failed to create account' },
        { status: 500 }
      );
    }

    // 2. Create tenant member
    const { error: memberError } = await supabase
      .from('tenant_members')
      .insert({
        tenant_id: tenant.id,
        user_id: userId,
        role: 'admin',
        accepted_at: new Date().toISOString(),
      });

    if (memberError) {
      console.error('Member creation failed:', memberError);
      // Non-fatal — use-tenant hook will auto-repair
    }

    // 3. Store name in auth user metadata (full name + parsed first name)
    if (firstName) {
      const parsedFirst = firstName.trim().split(/\s+/)[0] || firstName.trim();
      const { error: metaError } = await supabase.auth.admin.updateUserById(userId, {
        user_metadata: { full_name: firstName.trim(), first_name: parsedFirst },
      });
      if (metaError) {
        console.warn('Failed to set name metadata:', metaError.message);
      }
    }

    // 4. Auto-provision dedicated phone number (non-blocking)
    provisionPhoneNumber(tenant.id).catch(err =>
      console.warn('[Signup] Auto-provision phone failed:', err.message)
    );

    return NextResponse.json({ tenantId: tenant.id });
  } catch (error: any) {
    console.error('Signup API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
