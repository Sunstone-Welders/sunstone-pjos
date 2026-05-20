// src/app/api/square/authorize/route.ts
// Updated: Better error logging + environment validation for production debugging

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      console.error('[Square OAuth] Auth failed:', authError?.message);
      return NextResponse.redirect(new URL('/auth/login', request.url));
    }

    // Get tenant for the current user
    const { data: member, error: memberError } = await supabase
      .from('tenant_members')
      .select('tenant_id')
      .eq('user_id', user.id)
      .single();

    if (memberError || !member) {
      console.error('[Square OAuth] No tenant found for user:', user.id, memberError?.message);
      return NextResponse.redirect(new URL('/dashboard/settings?error=no_tenant', request.url));
    }

    const applicationId = process.env.SQUARE_APP_ID;
    const environment = process.env.SQUARE_ENVIRONMENT || 'sandbox';
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;

    // Log configuration for debugging (safe — doesn't log secrets)
    console.log('[Square OAuth] Config check:', {
      hasAppId: !!applicationId,
      environment,
      appUrl,
      tenantId: member.tenant_id,
    });

    if (!applicationId) {
      console.error('[Square OAuth] SQUARE_APP_ID is not set');
      return NextResponse.redirect(new URL('/dashboard/settings?error=square_not_configured', request.url));
    }

    if (!appUrl) {
      console.error('[Square OAuth] NEXT_PUBLIC_APP_URL is not set');
      return NextResponse.redirect(new URL('/dashboard/settings?error=square_not_configured', request.url));
    }

    const baseUrl = environment === 'production'
      ? 'https://connect.squareup.com'
      : 'https://connect.squareupsandbox.com';

    const redirectUri = `${appUrl}/api/square/callback`;

    // State parameter includes tenant ID for the callback to know which tenant to update
    const state = Buffer.from(JSON.stringify({
      tenant_id: member.tenant_id,
      user_id: user.id,
      nonce: Math.random().toString(36).substring(2, 15),
    })).toString('base64url');

    const scopes = [
      'MERCHANT_PROFILE_READ',
      'PAYMENTS_WRITE',
      'PAYMENTS_WRITE_IN_PERSON',
      'PAYMENTS_READ',
      'ORDERS_WRITE',
      'ORDERS_READ',
    ].join('+');

    const authUrl = `${baseUrl}/oauth2/authorize?client_id=${applicationId}&scope=${scopes}&session=false&state=${state}&redirect_uri=${encodeURIComponent(redirectUri)}`;

    console.log('[Square OAuth] Redirecting to Square:', {
      baseUrl,
      redirectUri,
      scopeCount: 5,
    });

    return NextResponse.redirect(authUrl);
  } catch (error: any) {
    console.error('[Square OAuth] Initiation error:', error?.message, error?.stack);
    return NextResponse.redirect(new URL('/dashboard/settings?error=oauth_failed', request.url));
  }
}