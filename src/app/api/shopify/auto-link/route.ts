// ============================================================================
// Shopify Auto-Link — src/app/api/shopify/auto-link/route.ts
// ============================================================================
// POST: Bulk-links inventory items to Sunstone catalog products by name match.
// For each Sunstone-supplier item missing sunstone_product_id, searches the
// catalog cache for a confident single match and sets the link.
// Also backfills items with supplier text "Sunstone" but no supplier_id.
// Auth: Requires logged-in tenant user.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get tenant
    const { data: member } = await supabase
      .from('tenant_members')
      .select('tenant_id')
      .eq('user_id', user.id)
      .not('accepted_at', 'is', null)
      .limit(1)
      .single();

    if (!member) {
      return NextResponse.json({ error: 'No tenant found' }, { status: 404 });
    }

    const tenantId = member.tenant_id;

    // ── Load catalog cache ─────────────────────────────────────────────
    const { data: cache } = await supabase
      .from('sunstone_catalog_cache')
      .select('products')
      .limit(1)
      .single();

    if (!cache?.products) {
      return NextResponse.json({
        error: 'No Sunstone catalog synced. Ask your admin to sync the Shopify catalog first.',
      }, { status: 400 });
    }

    const catalogProducts = (cache.products as any[]).filter(
      (p: any) => p.status === 'ACTIVE'
    );

    if (catalogProducts.length === 0) {
      return NextResponse.json({
        error: 'Catalog is empty — no active products found.',
      }, { status: 400 });
    }

    // ── Find the Sunstone supplier for this tenant ─────────────────────
    const { data: sunstoneSupplier } = await supabase
      .from('suppliers')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('is_sunstone', true)
      .limit(1)
      .single();

    // ── Phase 1: Backfill supplier_id for items with text "Sunstone" ──
    let supplierBackfilled = 0;
    if (sunstoneSupplier) {
      const { data: textOnlyItems } = await supabase
        .from('inventory_items')
        .select('id')
        .eq('tenant_id', tenantId)
        .is('supplier_id', null)
        .ilike('supplier', 'sunstone')
        .eq('is_active', true);

      if (textOnlyItems && textOnlyItems.length > 0) {
        const ids = textOnlyItems.map((i) => i.id);
        const { error } = await supabase
          .from('inventory_items')
          .update({ supplier_id: sunstoneSupplier.id })
          .in('id', ids)
          .eq('tenant_id', tenantId);

        if (!error) supplierBackfilled = ids.length;
      }
    }

    // ── Phase 2: Auto-link unlinked Sunstone items to catalog ──────────
    // Get all active items that have a Sunstone supplier but no product link
    const { data: unlinkItems } = await supabase
      .from('inventory_items')
      .select('id, name')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .is('sunstone_product_id', null)
      .or(
        sunstoneSupplier
          ? `supplier_id.eq.${sunstoneSupplier.id},supplier.ilike.sunstone`
          : 'supplier.ilike.sunstone'
      );

    let linked = 0;
    let skipped = 0;
    const linkResults: { name: string; productId: string; productTitle: string; variantId: string | null }[] = [];

    if (unlinkItems && unlinkItems.length > 0) {
      for (const item of unlinkItems) {
        const lower = item.name.toLowerCase().trim();
        const baseName = lower.split(/\s*[\u2014\u2013-]\s*/)[0].trim();

        const matches = catalogProducts.filter((p: any) => {
          const title = (p.title || '').toLowerCase();
          return title === baseName || title.startsWith(baseName + ' ') || title.includes(baseName);
        });

        if (matches.length === 1) {
          const product = matches[0];
          const productId = product.id;
          let variantId: string | null = null;

          // Try to match variant by material hint in item name (e.g. "Bryce Chain — Sterling Silver")
          const itemParts = item.name.split(/\s*[\u2014\u2013-]\s*/);
          const materialHint = itemParts.length > 1 ? itemParts[1].trim().toLowerCase() : '';

          if (materialHint && product.variants?.length > 1) {
            const matchingVariants = product.variants.filter((v: any) =>
              (v.title || '').toLowerCase().includes(materialHint)
            );
            if (matchingVariants.length > 0) {
              // For chains: pick "By the Inch" variant, otherwise first match
              const byInch = matchingVariants.find((v: any) => /by the inch/i.test(v.title));
              variantId = (byInch || matchingVariants[0]).id;
            }
          } else if (product.variants?.length === 1) {
            variantId = product.variants[0].id;
          }

          const updateData: Record<string, any> = { sunstone_product_id: productId };
          if (variantId) updateData.sunstone_variant_id = variantId;

          // Also set supplier_id if missing
          if (sunstoneSupplier) {
            updateData.supplier_id = sunstoneSupplier.id;
          }

          const { error } = await supabase
            .from('inventory_items')
            .update(updateData)
            .eq('id', item.id)
            .eq('tenant_id', tenantId);

          if (!error) {
            linked++;
            linkResults.push({
              name: item.name,
              productId,
              productTitle: product.title,
              variantId,
            });
          }
        } else {
          skipped++;
        }
      }
    }

    return NextResponse.json({
      linked,
      skipped,
      supplierBackfilled,
      total: (unlinkItems?.length || 0),
      results: linkResults,
    });
  } catch (error: any) {
    console.error('Auto-link error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
