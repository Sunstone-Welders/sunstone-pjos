// ============================================================================
// Shopify Catalog Sync — src/app/api/shopify/sync/route.ts
// ============================================================================
// GET: Syncs the Shopify catalog to the local cache table.
// - Checks if cache is fresh (< 24h) and skips unless ?force=true
// - Callable manually or on a schedule
// - Uses OAuth access token from platform_settings (via shopify.ts)
// - Returns detailed diagnostics for debugging
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { fetchAllProducts, getShopifyAccessToken } from '@/lib/shopify';
import { verifyPlatformAdmin, AdminAuthError } from '@/lib/admin/verify-platform-admin';
import type { SunstoneProduct } from '@/lib/shopify';

export async function GET(request: NextRequest) {
  // ── Auth: platform admins only ──────────────────────────────────────
  try {
    await verifyPlatformAdmin();
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

  const startTime = Date.now();
  const domain = process.env.SHOPIFY_STORE_DOMAIN;

  console.log('[Shopify Sync] ── Starting sync ──');
  console.log('[Shopify Sync] SHOPIFY_STORE_DOMAIN:', domain ? `"${domain}"` : 'NOT SET');

  if (!domain) {
    return NextResponse.json(
      {
        error: 'SHOPIFY_STORE_DOMAIN not configured',
        hint: 'Set SHOPIFY_STORE_DOMAIN in your environment variables.',
      },
      { status: 500 }
    );
  }

  // Verify OAuth token is available
  try {
    await getShopifyAccessToken();
    console.log('[Shopify Sync] OAuth access token: available');
  } catch {
    return NextResponse.json(
      {
        error: 'Shopify OAuth token not found',
        hint: 'Complete the OAuth flow by visiting /api/shopify/auth as a platform admin.',
      },
      { status: 500 }
    );
  }

  try {
    const force = request.nextUrl.searchParams.get('force') === 'true';
    const db = await createServiceRoleClient();

    // ── Step 2: Cache freshness check ──────────────────────────────────
    if (!force) {
      try {
        const { data: cache } = await db
          .from('sunstone_catalog_cache')
          .select('expires_at')
          .limit(1)
          .single();

        if (cache && new Date(cache.expires_at) > new Date()) {
          console.log('[Shopify Sync] Cache is still fresh, skipping sync');
          return NextResponse.json({
            status: 'fresh',
            message: 'Cache is still valid. Use ?force=true to refresh.',
            expiresAt: cache.expires_at,
          });
        }
      } catch {
        console.log('[Shopify Sync] No existing cache found — proceeding with sync');
      }
    }

    // ── Step 3: Fetch products from Shopify ────────────────────────────
    let products: SunstoneProduct[] = [];

    try {
      console.log('[Shopify Sync] Fetching products...');
      products = await fetchAllProducts();
      console.log(`[Shopify Sync] Products fetched: ${products.length}`);
    } catch (err: any) {
      const productError = err.message || String(err);
      console.error('[Shopify Sync] PRODUCT FETCH FAILED:', productError);
      return NextResponse.json(
        {
          error: 'Failed to fetch products from Shopify',
          detail: productError,
          diagnostics: {
            SHOPIFY_STORE_DOMAIN: domain,
            apiUrl: `https://${domain}/admin/api/2026-01/graphql.json`,
            elapsedMs: Date.now() - startTime,
          },
          hint: 'Check Vercel function logs for detailed Shopify API response. Common causes: expired OAuth token (re-run /api/shopify/auth), wrong store domain, API version issue.',
        },
        { status: 502 }
      );
    }

    // Sale items detected via compareAtPrice on variants
    const saleCount = products.filter((p) =>
      p.variants.some((v) => v.compareAtPrice && parseFloat(v.compareAtPrice) > parseFloat(v.price))
    ).length;

    // ── Step 4: Write to cache ─────────────────────────────────────────
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    try {
      console.log('[Shopify Sync] Writing to cache...');
      // Singleton pattern: delete all + insert fresh
      const { error: deleteError } = await db
        .from('sunstone_catalog_cache')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');

      if (deleteError) {
        console.warn('[Shopify Sync] Delete old cache warning:', deleteError.message);
      }

      const { error: insertError } = await db.from('sunstone_catalog_cache').insert({
        products,
        discounts: [],
        synced_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
      });

      if (insertError) {
        console.error('[Shopify Sync] Cache insert failed:', insertError.message);
        return NextResponse.json(
          { error: 'Failed to write cache', detail: insertError.message },
          { status: 500 }
        );
      }

      console.log('[Shopify Sync] Cache written successfully');
    } catch (err: any) {
      console.error('[Shopify Sync] Cache write exception:', err.message);
      return NextResponse.json(
        { error: 'Failed to write cache', detail: err.message },
        { status: 500 }
      );
    }

    const elapsed = Date.now() - startTime;
    console.log(`[Shopify Sync] ── Sync complete (${elapsed}ms) ──`);

    return NextResponse.json({
      status: 'synced',
      productCount: products.length,
      saleItemCount: saleCount,
      syncedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      elapsedMs: elapsed,
    });
  } catch (err: any) {
    console.error('[Shopify Sync] Unexpected error:', err);
    return NextResponse.json(
      {
        error: 'Unexpected error',
      },
      { status: 500 }
    );
  }
}
