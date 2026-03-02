// ============================================================================
// Admin Spotlight API — src/app/api/admin/spotlight/route.ts
// ============================================================================
// GET: Returns current spotlight config + cached Shopify catalog
// PUT: Updates spotlight config (pin product, set duration, reset to rotation)
// POST: Triggers a manual Shopify catalog sync
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { verifyPlatformAdmin } from '@/lib/admin/verify-platform-admin';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getCachedCatalog, fetchAllProducts } from '@/lib/shopify';

export async function GET() {
  try {
    await verifyPlatformAdmin();
    const db = await createServiceRoleClient();

    // Fetch spotlight config
    const { data: config } = await db
      .from('platform_config')
      .select('value, updated_at')
      .eq('key', 'sunstone_spotlight')
      .single();

    // Fetch cached catalog
    const catalog = await getCachedCatalog();

    return NextResponse.json({
      config: config?.value || { mode: 'rotate' },
      configUpdatedAt: config?.updated_at || null,
      catalog: catalog
        ? {
            products: catalog.products.map((p) => ({
              handle: p.handle,
              title: p.title,
              imageUrl: p.imageUrl,
              price: p.variants[0]?.price || null,
              productType: p.productType,
              url: p.url,
            })),
            discountCount: catalog.discounts.length,
            syncedAt: catalog.syncedAt,
          }
        : null,
    });
  } catch (err: any) {
    if (err?.status === 401 || err?.status === 403) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    console.error('[Admin Spotlight] GET error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    await verifyPlatformAdmin();
    const db = await createServiceRoleClient();
    const body = await request.json();

    const { mode, custom_product_handle, duration_days } = body;

    if (mode === 'rotate') {
      // Reset to rotation mode
      await db
        .from('platform_config')
        .upsert(
          {
            key: 'sunstone_spotlight',
            value: { mode: 'rotate' },
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'key' }
        );

      return NextResponse.json({ success: true, mode: 'rotate' });
    }

    if (mode === 'custom' && custom_product_handle) {
      const expiresAt = duration_days
        ? new Date(Date.now() + duration_days * 24 * 60 * 60 * 1000).toISOString()
        : null;

      await db
        .from('platform_config')
        .upsert(
          {
            key: 'sunstone_spotlight',
            value: {
              mode: 'custom',
              custom_product_handle,
              custom_expires_at: expiresAt,
            },
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'key' }
        );

      return NextResponse.json({
        success: true,
        mode: 'custom',
        handle: custom_product_handle,
        expiresAt,
      });
    }

    return NextResponse.json({ error: 'Invalid mode or missing fields' }, { status: 400 });
  } catch (err: any) {
    if (err?.status === 401 || err?.status === 403) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    console.error('[Admin Spotlight] PUT error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function POST() {
  try {
    await verifyPlatformAdmin();
    const db = await createServiceRoleClient();

    // Fetch products directly (no self-referential HTTP call)
    console.log('[Admin Spotlight] Starting manual sync...');
    const products = await fetchAllProducts();

    const saleCount = products.filter((p) =>
      p.variants.some((v) => v.compareAtPrice && parseFloat(v.compareAtPrice) > parseFloat(v.price))
    ).length;

    // Write to cache
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    await db
      .from('sunstone_catalog_cache')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');

    const { error: insertError } = await db.from('sunstone_catalog_cache').insert({
      products,
      discounts: [],
      synced_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
    });

    if (insertError) {
      console.error('[Admin Spotlight] Cache write failed:', insertError.message);
      return NextResponse.json({ error: 'Cache write failed', detail: insertError.message }, { status: 500 });
    }

    console.log(`[Admin Spotlight] Sync complete: ${products.length} products`);

    return NextResponse.json({
      success: true,
      sync: {
        status: 'synced',
        productCount: products.length,
        saleItemCount: saleCount,
        syncedAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
      },
    });
  } catch (err: any) {
    if (err?.status === 401 || err?.status === 403) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    console.error('[Admin Spotlight] POST (sync) error:', err);
    return NextResponse.json({ error: err.message || 'Sync failed' }, { status: 500 });
  }
}
