// ============================================================================
// Admin Catalog Products API — GET
// ============================================================================
// Returns the full Shopify catalog from cache for the admin catalog
// management page. Includes product IDs, titles, types, variant counts.
// ============================================================================

import { NextResponse } from 'next/server';
import { verifyPlatformAdmin } from '@/lib/admin/verify-platform-admin';
import { getCachedCatalog } from '@/lib/shopify';

export async function GET() {
  try {
    await verifyPlatformAdmin();

    const catalog = await getCachedCatalog();

    if (!catalog) {
      return NextResponse.json({ products: [] });
    }

    // Return all ACTIVE products with the fields the admin page needs
    const products = catalog.products
      .filter((p) => p.status === 'ACTIVE')
      .map((p) => ({
        id: p.id,
        title: p.title,
        productType: p.productType || '',
        imageUrl: p.imageUrl,
        tags: p.tags || [],
        variants: (p.variants || []).map((v) => ({
          title: v.title,
          price: v.price,
        })),
      }));

    return NextResponse.json({ products, syncedAt: catalog.syncedAt });
  } catch (err: any) {
    if (err?.status === 401 || err?.status === 403) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    console.error('[Admin CatalogVisibility] Catalog GET error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
