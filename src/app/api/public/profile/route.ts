// ============================================================================
// Public Profile API — GET /api/public/profile?slug=X
// ============================================================================
// Returns tenant profile info, product types with min prices, and upcoming events.
// Uses service role to bypass RLS — this is a public endpoint.
// ============================================================================

import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const slug = searchParams.get('slug');

  if (!slug) {
    return NextResponse.json({ error: 'Missing slug' }, { status: 400 });
  }

  const supabase = await createServiceRoleClient();

  // Fetch tenant
  const { data: tenant, error: tenantError } = await supabase
    .from('tenants')
    .select('id, name, slug, logo_url, bio, city, state, phone, website, instagram_url, facebook_url, tiktok_url, theme_id, profile_settings, dedicated_phone_number, waiver_text, waiver_required, pricing_mode')
    .eq('slug', slug)
    .single();

  if (tenantError || !tenant) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Check if profile is enabled
  const settings = (tenant.profile_settings || {}) as Record<string, boolean>;
  if (!settings.enabled) {
    return NextResponse.json({ error: 'Profile not enabled' }, { status: 404 });
  }

  // Fetch product types with min sell_price from chain_product_prices
  let services: { name: string; min_price: number }[] = [];
  if (settings.show_pricing !== false) {
    const { data: prices } = await supabase
      .from('chain_product_prices')
      .select('sell_price, product_type:product_types(name)')
      .eq('tenant_id', tenant.id)
      .eq('is_active', true);

    if (prices && prices.length > 0) {
      // Group by product type and find min price
      const byType = new Map<string, number>();
      for (const p of prices) {
        const name = (p.product_type as any)?.name;
        if (!name) continue;
        const current = byType.get(name);
        if (current === undefined || p.sell_price < current) {
          byType.set(name, p.sell_price);
        }
      }
      services = Array.from(byType.entries()).map(([name, min_price]) => ({ name, min_price }));
    }
  }

  // Fetch tier pricing data (when tier mode + toggle enabled)
  let tiers: { name: string; bracelet_price: number | null; anklet_price: number | null; ring_price: number | null; necklace_price_per_inch: number | null; hand_chain_price: number | null }[] = [];
  if (settings.show_tier_pricing && tenant.pricing_mode === 'tier') {
    const { data: tierData } = await supabase
      .from('pricing_tiers')
      .select('name, bracelet_price, anklet_price, ring_price, necklace_price_per_inch, hand_chain_price')
      .eq('tenant_id', tenant.id)
      .eq('is_active', true)
      .order('sort_order');

    if (tierData) {
      // Only include tiers that have at least one price set
      tiers = tierData.filter((t: any) =>
        t.bracelet_price || t.anklet_price || t.ring_price || t.necklace_price_per_inch || t.hand_chain_price
      );
    }
  }

  // Fetch upcoming events
  let events: { id: string; name: string; start_time: string; end_time: string | null; location: string | null }[] = [];
  if (settings.show_events !== false) {
    const { data: evts } = await supabase
      .from('events')
      .select('id, name, start_time, end_time, location')
      .eq('tenant_id', tenant.id)
      .eq('is_active', true)
      .gte('start_time', new Date().toISOString())
      .order('start_time')
      .limit(10);

    events = evts || [];
  }

  return NextResponse.json({
    tenant: {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      logo_url: tenant.logo_url,
      bio: tenant.bio,
      city: tenant.city,
      state: tenant.state,
      phone: tenant.phone,
      website: tenant.website,
      instagram_url: tenant.instagram_url,
      facebook_url: tenant.facebook_url,
      tiktok_url: tenant.tiktok_url,
      theme_id: tenant.theme_id,
      profile_settings: tenant.profile_settings,
      dedicated_phone_number: tenant.dedicated_phone_number,
      waiver_required: tenant.waiver_required,
    },
    services,
    events,
    tiers,
  });
}
