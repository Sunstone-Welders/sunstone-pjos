// ============================================================================
// Square Mobile Payments SDK Auth — POST /api/square/mobile-payments-auth
// ============================================================================
// Returns the Square OAuth access token and location ID needed by the
// Mobile Payments SDK to initialize on-device for Tap to Pay.
//
// The Square Mobile Payments SDK uses Pattern (a): the raw OAuth access token
// and location ID are passed directly to the SDK's authorize() method.
// The older Mobile Authorization API (short-lived codes) was deprecated and
// retired December 31, 2025.
//
// SECURITY: Auth required. Credentials are only returned to authenticated
// tenant members. The access token is scoped to the seller's Square account
// via OAuth.
// ============================================================================

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase, createServiceRoleClient } from '@/lib/supabase/server';

export async function POST(_req: NextRequest) {
  try {
    // ── Auth check ──────────────────────────────────────────────────────
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: member } = await supabase
      .from('tenant_members')
      .select('tenant_id')
      .eq('user_id', user.id)
      .limit(1)
      .single();
    if (!member) return NextResponse.json({ error: 'No tenant membership' }, { status: 403 });

    const tenantId = member.tenant_id;

    // ── Get tenant's Square credentials ─────────────────────────────────
    const db = await createServiceRoleClient();

    const { data: tenant } = await db
      .from('tenants')
      .select('square_access_token, square_location_id, square_merchant_id')
      .eq('id', tenantId)
      .single();

    if (!tenant?.square_access_token || !tenant?.square_location_id || !tenant?.square_merchant_id) {
      return NextResponse.json(
        { error: 'Square not connected. Go to Settings → Payments to connect.' },
        { status: 400 }
      );
    }

    // ── Return credentials for Mobile Payments SDK authorize() ──────────
    // applicationId is the *platform's* Square developer application ID
    // (not the tenant's merchant ID). The Android SDK needs it for its
    // one-time MobilePaymentsSdk.initialize() call; iOS does not require it.
    return NextResponse.json({
      accessToken: tenant.square_access_token,
      locationId: tenant.square_location_id,
      merchantId: tenant.square_merchant_id,
      applicationId: process.env.SQUARE_APP_ID ?? null,
    });
  } catch (error: any) {
    console.error('[Square Mobile Auth] Error:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve Square credentials. Please try again.' },
      { status: 500 }
    );
  }
}
