// ============================================================================
// Shopify OAuth Callback — src/app/api/shopify/callback/route.ts
// ============================================================================
// GET: Handles the redirect from Shopify after authorization.
// Exchanges the temporary code for a permanent access token and stores it
// in the platform_settings table in Supabase.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const code = request.nextUrl.searchParams.get('code');
    const state = request.nextUrl.searchParams.get('state');

    if (!code) {
      return new NextResponse(
        '<html><body><h1>Error</h1><p>Missing authorization code from Shopify.</p></body></html>',
        { status: 400, headers: { 'Content-Type': 'text/html' } }
      );
    }

    const domain = process.env.SHOPIFY_STORE_DOMAIN;
    const clientId = process.env.SHOPIFY_CLIENT_ID;
    const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;

    if (!domain || !clientId || !clientSecret) {
      return new NextResponse(
        '<html><body><h1>Error</h1><p>Shopify OAuth environment variables not configured.</p></body></html>',
        { status: 500, headers: { 'Content-Type': 'text/html' } }
      );
    }

    const db = await createServiceRoleClient();

    // Verify nonce (CSRF protection)
    if (state) {
      const { data: nonceRecord } = await db
        .from('platform_settings')
        .select('value')
        .eq('key', 'shopify_oauth_nonce')
        .single();

      if (!nonceRecord || nonceRecord.value !== state) {
        return new NextResponse(
          '<html><body><h1>Error</h1><p>Invalid state parameter. Possible CSRF attack. Please try again from /api/shopify/auth.</p></body></html>',
          { status: 403, headers: { 'Content-Type': 'text/html' } }
        );
      }

      // Clear the nonce after verification
      await db.from('platform_settings').delete().eq('key', 'shopify_oauth_nonce');
    }

    // Exchange code for permanent access token
    console.log('[Shopify Callback] Exchanging code for access token...');

    const tokenResponse = await fetch(`https://${domain}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
      }),
    });

    if (!tokenResponse.ok) {
      const errorBody = await tokenResponse.text();
      console.error('[Shopify Callback] Token exchange failed:', tokenResponse.status, errorBody);
      return new NextResponse(
        `<html><body><h1>Error</h1><p>Failed to exchange authorization code: ${tokenResponse.status}</p><pre>${errorBody.slice(0, 500)}</pre></body></html>`,
        { status: 502, headers: { 'Content-Type': 'text/html' } }
      );
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;
    const grantedScope = tokenData.scope;

    if (!accessToken) {
      console.error('[Shopify Callback] No access_token in response:', tokenData);
      return new NextResponse(
        '<html><body><h1>Error</h1><p>Shopify did not return an access token.</p></body></html>',
        { status: 502, headers: { 'Content-Type': 'text/html' } }
      );
    }

    console.log(`[Shopify Callback] Got access token (${accessToken.length} chars), scope: ${grantedScope}`);

    // Store in platform_settings
    const { error: upsertError } = await db.from('platform_settings').upsert(
      {
        key: 'shopify_access_token',
        value: accessToken,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'key' }
    );

    if (upsertError) {
      console.error('[Shopify Callback] Failed to store token:', upsertError.message);
      return new NextResponse(
        `<html><body><h1>Error</h1><p>Token obtained but failed to save: ${upsertError.message}</p></body></html>`,
        { status: 500, headers: { 'Content-Type': 'text/html' } }
      );
    }

    // Also store the granted scope for reference
    await db.from('platform_settings').upsert(
      {
        key: 'shopify_granted_scope',
        value: grantedScope || '',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'key' }
    );

    console.log('[Shopify Callback] Access token stored successfully');

    return new NextResponse(
      `<html>
        <head><title>Shopify Connected</title></head>
        <body style="font-family: system-ui, sans-serif; max-width: 500px; margin: 80px auto; text-align: center;">
          <h1 style="color: #16a34a;">Shopify Connected Successfully!</h1>
          <p>Your Sunstone Shopify store is now connected.</p>
          <p style="color: #666; font-size: 14px;">Scope: ${grantedScope || 'N/A'}</p>
          <p style="margin-top: 24px;">You can close this tab. Product sync will use this connection automatically.</p>
        </body>
      </html>`,
      { status: 200, headers: { 'Content-Type': 'text/html' } }
    );
  } catch (err: any) {
    console.error('[Shopify Callback] Unexpected error:', err);
    return new NextResponse(
      `<html><body><h1>Error</h1><p>Unexpected error: ${err.message}</p></body></html>`,
      { status: 500, headers: { 'Content-Type': 'text/html' } }
    );
  }
}
