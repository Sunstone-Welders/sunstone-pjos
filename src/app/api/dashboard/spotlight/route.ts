// ============================================================================
// Dashboard Spotlight API — src/app/api/dashboard/spotlight/route.ts
// ============================================================================
// Lightweight endpoint returning just the current spotlight product for the
// persistent mini card in the dashboard sidebar / mobile banner.
// Uses the same Shopify cached catalog + platform_config override as the
// full dashboard cards endpoint, but returns a single compact object.
// ============================================================================

import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceRoleClient } from '@/lib/supabase/server';
import { getCachedCatalog, type SunstoneProduct } from '@/lib/shopify';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function formatSpotlight(product: SunstoneProduct, isSale: boolean, badge: string | null) {
  const variant = product.variants[0];
  const price = variant?.price ? `$${variant.price}` : null;

  return {
    title: product.title,
    url: product.url,
    imageUrl: product.imageUrl || null,
    badge: isSale ? (badge || 'Sale') : 'Featured',
    price,
    salePrice: isSale ? price : null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/dashboard/spotlight
// ─────────────────────────────────────────────────────────────────────────────

export async function GET() {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ spotlight: null });

    const db = await createServiceRoleClient();

    // Check for admin override (pinned product)
    try {
      const { data: config } = await db
        .from('platform_config')
        .select('value')
        .eq('key', 'sunstone_spotlight')
        .single();

      if (config?.value) {
        const spotlight = config.value as Record<string, any>;
        if (spotlight.mode === 'custom' && spotlight.custom_product_handle) {
          // Check auto-expiry
          if (spotlight.custom_expires_at && new Date(spotlight.custom_expires_at) <= new Date()) {
            // Expired — fall through to catalog rotation
          } else {
            const catalog = await getCachedCatalog();
            const pinned = catalog?.products.find((p) => p.handle === spotlight.custom_product_handle);
            if (pinned) {
              return NextResponse.json({ spotlight: formatSpotlight(pinned, false, null) });
            }
          }
        }
      }
    } catch {
      // platform_config may not exist — fall through
    }

    // Catalog rotation
    const catalog = await getCachedCatalog();
    if (!catalog || catalog.products.length === 0) {
      return NextResponse.json({ spotlight: null });
    }

    // Exclusions
    let excludedHandles: string[] = [];
    try {
      const { data: excl } = await db
        .from('platform_config')
        .select('value')
        .eq('key', 'spotlight_exclusions')
        .single();
      excludedHandles = (excl?.value as string[]) || [];
    } catch {
      // No exclusions
    }

    const eligible = excludedHandles.length > 0
      ? catalog.products.filter((p) => !excludedHandles.includes(p.handle))
      : catalog.products;

    if (eligible.length === 0) {
      return NextResponse.json({ spotlight: null });
    }

    // Prioritize sale items
    const saleProduct = eligible.find((p) =>
      p.variants.some((v) => v.compareAtPrice && parseFloat(v.compareAtPrice) > parseFloat(v.price))
    );
    if (saleProduct) {
      return NextResponse.json({ spotlight: formatSpotlight(saleProduct, true, 'On Sale') });
    }

    // Weekly rotation
    const week = getISOWeek(new Date());
    const product = eligible[week % eligible.length];

    return NextResponse.json({ spotlight: formatSpotlight(product, false, null) });
  } catch {
    return NextResponse.json({ spotlight: null });
  }
}
