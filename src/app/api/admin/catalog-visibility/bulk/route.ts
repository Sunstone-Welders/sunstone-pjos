// ============================================================================
// Admin Catalog Visibility Bulk API — POST
// ============================================================================
// Upserts visibility for multiple products at once.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { verifyPlatformAdmin } from '@/lib/admin/verify-platform-admin';
import { createServiceRoleClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const admin = await verifyPlatformAdmin();
    const db = await createServiceRoleClient();
    const body = await request.json();

    const { product_ids, is_visible, hidden_reason } = body;

    if (!Array.isArray(product_ids) || product_ids.length === 0 || typeof is_visible !== 'boolean') {
      return NextResponse.json(
        { error: 'product_ids (string[]) and is_visible (boolean) required' },
        { status: 400 }
      );
    }

    const rows = product_ids.map((id: string) => ({
      shopify_product_id: id,
      is_visible,
      hidden_reason: hidden_reason || null,
      hidden_by: admin.id,
      updated_at: new Date().toISOString(),
    }));

    const { error } = await db
      .from('catalog_product_visibility')
      .upsert(rows, { onConflict: 'shopify_product_id' });

    if (error) throw error;

    return NextResponse.json({ success: true, count: product_ids.length });
  } catch (err: any) {
    if (err?.status === 401 || err?.status === 403) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    console.error('[Admin CatalogVisibility] Bulk POST error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
