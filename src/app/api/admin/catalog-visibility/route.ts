// ============================================================================
// Admin Catalog Visibility API — GET + POST
// ============================================================================
// GET:  Returns all visibility overrides
// POST: Upserts a single product's visibility
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { verifyPlatformAdmin } from '@/lib/admin/verify-platform-admin';
import { createServiceRoleClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const admin = await verifyPlatformAdmin();
    const db = await createServiceRoleClient();

    const { data, error } = await db
      .from('catalog_product_visibility')
      .select('shopify_product_id, is_visible, hidden_reason, updated_at');

    if (error) throw error;

    return NextResponse.json({ overrides: data || [] });
  } catch (err: any) {
    if (err?.status === 401 || err?.status === 403) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    console.error('[Admin CatalogVisibility] GET error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await verifyPlatformAdmin();
    const db = await createServiceRoleClient();
    const body = await request.json();

    const { shopify_product_id, is_visible, hidden_reason } = body;

    if (!shopify_product_id || typeof is_visible !== 'boolean') {
      return NextResponse.json(
        { error: 'shopify_product_id (string) and is_visible (boolean) required' },
        { status: 400 }
      );
    }

    const { error } = await db
      .from('catalog_product_visibility')
      .upsert(
        {
          shopify_product_id,
          is_visible,
          hidden_reason: hidden_reason || null,
          hidden_by: admin.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'shopify_product_id' }
      );

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err: any) {
    if (err?.status === 401 || err?.status === 403) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    console.error('[Admin CatalogVisibility] POST error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
