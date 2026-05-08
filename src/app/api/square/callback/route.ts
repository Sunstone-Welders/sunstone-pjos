// src/app/api/square/callback/route.ts
// Updated: Better error logging for production debugging

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const stateParam = searchParams.get('state');
  const error = searchParams.get('error');
  const errorDescription = searchParams.get('error_description');

  const settingsUrl = new URL('/dashboard/settings', request.url);

  // Log incoming callback for debugging
  console.log('[Square Callback] Received:', {
    hasCode: !!code,
    hasState: !!stateParam,
    error: error || 'none',
    errorDescription: errorDescription || 'none',
    callbackUrl: request.url.split('?')[0], // log URL without params for safety
  });

  // Handle Square denial
  if (error) {
    console.error('[Square Callback] OAuth denied by user or Square:', error, errorDescription);
    settingsUrl.searchParams.set('error', 'square_denied');
    return NextResponse.redirect(settingsUrl);
  }

  if (!code || !stateParam) {
    console.error('[Square Callback] Missing code or state parameter');
    settingsUrl.searchParams.set('error', 'missing_params');
    return NextResponse.redirect(settingsUrl);
  }

  try {
    // Decode state
    let state: { tenant_id: string; user_id: string; nonce: string };
    try {
      state = JSON.parse(Buffer.from(stateParam, 'base64url').toString());
    } catch {
      console.error('[Square Callback] Failed to decode state parameter');
      settingsUrl.searchParams.set('error', 'invalid_state');
      return NextResponse.redirect(settingsUrl);
    }

    const applicationId = process.env.SQUARE_APP_ID!;
    const applicationSecret = process.env.SQUARE_APP_SECRET!;
    const environment = process.env.SQUARE_ENVIRONMENT || 'sandbox';
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;

    // Log config (safe — no secrets)
    console.log('[Square Callback] Config:', {
      hasAppId: !!applicationId,
      hasAppSecret: !!applicationSecret,
      environment,
      appUrl,
      tenantId: state.tenant_id,
    });

    if (!applicationId || !applicationSecret) {
      console.error('[Square Callback] Missing Square credentials in env vars');
      settingsUrl.searchParams.set('error', 'square_not_configured');
      return NextResponse.redirect(settingsUrl);
    }

    const squareBaseUrl = environment === 'production'
      ? 'https://connect.squareup.com'
      : 'https://connect.squareupsandbox.com';

    const redirectUri = `${appUrl}/api/square/callback`;

    // Exchange authorization code for tokens
    console.log('[Square Callback] Exchanging code for tokens at:', `${squareBaseUrl}/oauth2/token`);

    const tokenResponse = await fetch(`${squareBaseUrl}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: applicationId,
        client_secret: applicationSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      const errBody = await tokenResponse.text();
      console.error('[Square Callback] Token exchange failed:', {
        status: tokenResponse.status,
        statusText: tokenResponse.statusText,
        body: errBody,
        redirectUri,
      });
      settingsUrl.searchParams.set('error', 'token_exchange_failed');
      return NextResponse.redirect(settingsUrl);
    }

    const tokenData = await tokenResponse.json();
    const { access_token, refresh_token, merchant_id } = tokenData;

    if (!access_token || !merchant_id) {
      console.error('[Square Callback] Incomplete token response — missing access_token or merchant_id');
      settingsUrl.searchParams.set('error', 'incomplete_response');
      return NextResponse.redirect(settingsUrl);
    }

    console.log('[Square Callback] Token exchange successful, merchant:', merchant_id);

    // Fetch merchant's primary location
    let locationId: string | null = null;
    try {
      const locRes = await fetch(`${squareBaseUrl}/v2/locations`, {
        headers: {
          'Authorization': `Bearer ${access_token}`,
          'Content-Type': 'application/json',
        },
      });

      if (locRes.ok) {
        const locData = await locRes.json();
        const locations = locData.locations || [];
        const active = locations.find((l: any) => l.status === 'ACTIVE');
        locationId = active?.id || locations[0]?.id || null;
        console.log('[Square Callback] Location found:', locationId, `(${locations.length} total)`);
      } else {
        console.warn('[Square Callback] Locations fetch failed:', locRes.status);
      }
    } catch (locErr) {
      console.warn('[Square Callback] Could not fetch Square locations:', locErr);
    }

    // Store tokens on the tenant using service role (bypasses RLS)
    const serviceClient = await createServiceRoleClient();

    const { error: updateError } = await serviceClient
      .from('tenants')
      .update({
        square_merchant_id: merchant_id,
        square_access_token: access_token,
        square_refresh_token: refresh_token || null,
        square_location_id: locationId,
      })
      .eq('id', state.tenant_id);

    if (updateError) {
      console.error('[Square Callback] Failed to store tokens in DB:', updateError);
      settingsUrl.searchParams.set('error', 'storage_failed');
      return NextResponse.redirect(settingsUrl);
    }

    console.log('[Square Callback] Square connected successfully for tenant:', state.tenant_id);
    settingsUrl.searchParams.set('success', 'square_connected');
    return NextResponse.redirect(settingsUrl);

  } catch (err: any) {
    console.error('[Square Callback] Unexpected error:', err?.message, err?.stack);
    settingsUrl.searchParams.set('error', 'callback_failed');
    return NextResponse.redirect(settingsUrl);
  }
}