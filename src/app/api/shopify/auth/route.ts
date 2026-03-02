// ============================================================================
// Shopify OAuth Install — src/app/api/shopify/auth/route.ts
// ============================================================================
// GET: Redirects to Shopify OAuth authorization page.
// Admin-only — only platform admins can initiate the OAuth flow.
// One-time action to connect the Sunstone Shopify store.
// ============================================================================

import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { verifyPlatformAdmin, AdminAuthError } from '@/lib/admin/verify-platform-admin';

export async function GET() {
  try {
    await verifyPlatformAdmin();

    const domain = process.env.SHOPIFY_STORE_DOMAIN;
    const clientId = process.env.SHOPIFY_CLIENT_ID;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://sunstonepj.app';

    if (!domain || !clientId) {
      return NextResponse.json(
        {
          error: 'Shopify OAuth not configured',
          diagnostics: {
            SHOPIFY_STORE_DOMAIN: domain ? 'set' : 'MISSING',
            SHOPIFY_CLIENT_ID: clientId ? 'set' : 'MISSING',
          },
          hint: 'Set SHOPIFY_STORE_DOMAIN, SHOPIFY_CLIENT_ID, and SHOPIFY_CLIENT_SECRET in environment variables.',
        },
        { status: 500 }
      );
    }

    // Generate and store nonce for CSRF protection
    const nonce = randomBytes(16).toString('hex');
    const db = await createServiceRoleClient();
    await db.from('platform_settings').upsert(
      { key: 'shopify_oauth_nonce', value: nonce, updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    );

    const redirectUri = `${appUrl}/api/shopify/callback`;
    const scopes = 'read_products,read_inventory';

    const authUrl =
      `https://${domain}/admin/oauth/authorize` +
      `?client_id=${clientId}` +
      `&scope=${scopes}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&state=${nonce}`;

    console.log('[Shopify Auth] Redirecting to Shopify OAuth:', authUrl);

    return NextResponse.redirect(authUrl);
  } catch (err: any) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[Shopify Auth] Error:', err);
    return NextResponse.json({ error: 'Unexpected error', detail: err.message }, { status: 500 });
  }
}
