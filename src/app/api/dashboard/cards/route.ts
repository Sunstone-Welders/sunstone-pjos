// ============================================================================
// Dashboard Cards API — src/app/api/dashboard/cards/route.ts
// ============================================================================
// GET: Generates context-aware dashboard cards from real tenant data.
// Cached for 24 hours per tenant. One Claude API call per refresh for
// Sunny's Take (personalized AI insight), everything else is pure queries.
//
// Content Strategy (by priority):
//   0. Getting Started checklist (tenants < 14 days old)
//   1. Next Event (event within 14 days, boosted if <= 3 days)
//   3. Sunny's Take (AI insight — Claude API, cached 24h)
//   4. Inventory Alert (low stock items)
//   5. Revenue Snapshot (ALWAYS — $0 if no sales)
//  25. Suggested Outreach (stale clients)
//  35. Recent Messages (broadcasts in last 7 days)
//  30. Networking Nudge (no events in 14 days)
//  45. PJ University (tenants < 30 days old)
//  50. Sunstone Product Spotlight (ALWAYS — weekly catalog rotation)
//
// Resilience: Each card generator is wrapped in try/catch so one failing
// query never kills the entire dashboard. Revenue + Sunstone are guaranteed.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase, createServiceRoleClient } from '@/lib/supabase/server';
import { getCachedCatalog, type SunstoneProduct } from '@/lib/shopify';
import type { DashboardCard } from '@/types';

// Bump this version whenever card generation logic changes. Cached cards with
// a different version are treated as stale and regenerated on next load.
const CARD_CACHE_VERSION = 8;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function daysUntil(dateStr: string): number {
  const now = new Date();
  const target = new Date(dateStr);
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

/** ISO week number (1-52) for a given date */
function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

// ─────────────────────────────────────────────────────────────────────────────
// Default fallback cards — returned when API cannot reach the database
// ─────────────────────────────────────────────────────────────────────────────

function fallbackCards(): DashboardCard[] {
  return [
    {
      type: 'revenue_snapshot',
      priority: 5,
      data: {
        monthRevenue: 0,
        lastMonthRevenue: 0,
        pctChange: null,
        salesCount: 0,
        eventsCount: 0,
        dailyBars: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      },
    },
    {
      type: 'sunstone_product',
      priority: 50,
      data: {
        title: 'Set Up Your Inventory',
        body: 'Add your chains, charms, and supplies to start tracking stock and pricing products automatically.',
        actionLabel: 'Add Inventory',
        actionRoute: '/dashboard/inventory',
      },
    },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/dashboard/cards
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      console.warn('Dashboard cards: not authenticated, returning fallback');
      return NextResponse.json({ cards: fallbackCards(), cached: false, fallback: true });
    }

    let db;
    try {
      db = await createServiceRoleClient();
    } catch (err) {
      console.error('Dashboard cards: failed to create service client:', err);
      return NextResponse.json({ cards: fallbackCards(), cached: false, fallback: true });
    }

    const { data: membership } = await db
      .from('tenant_members')
      .select('tenant_id')
      .eq('user_id', user.id)
      .limit(1)
      .single();

    if (!membership) {
      console.warn('Dashboard cards: no tenant membership for user', user.id);
      return NextResponse.json({ cards: fallbackCards(), cached: false, fallback: true });
    }

    const tenantId = membership.tenant_id;

    // Check cache (table may not exist yet — gracefully skip)
    const forceRefresh = request.nextUrl.searchParams.get('refresh') === '1';
    if (!forceRefresh) {
      try {
        const { data: cached } = await db
          .from('dashboard_card_cache')
          .select('cards, expires_at, cache_version')
          .eq('tenant_id', tenantId)
          .single();

        if (cached && cached.cards && Array.isArray(cached.cards) && cached.cards.length > 0) {
          // Bust cache if version mismatch (code was updated since last cache write)
          const cachedVersion = (cached as any).cache_version ?? 0;
          if (cachedVersion === CARD_CACHE_VERSION && new Date(cached.expires_at) > new Date()) {
            // Always regenerate the getting_started card so checklist stays fresh
            const hasGettingStarted = cached.cards.some((c: any) => c.type === 'getting_started');
            if (hasGettingStarted) {
              // Re-check getting_started conditions live
              const freshCards = await refreshGettingStarted(db, tenantId, cached.cards as DashboardCard[]);
              if (freshCards !== null) {
                return NextResponse.json({ cards: freshCards, cached: true });
              }
              // null → all done, fall through to full regeneration
            }
            return NextResponse.json({ cards: cached.cards, cached: true });
          }
        }
      } catch {
        // Cache table may not exist or cache_version column missing — continue to generate
      }
    }

    // Generate cards
    const cards = await generateCards(db, tenantId);

    // Safety net: if generateCards returned nothing, use fallback
    if (cards.length === 0) {
      console.warn('Dashboard cards: generateCards returned empty, using fallback');
      return NextResponse.json({ cards: fallbackCards(), cached: false, fallback: true });
    }

    // Try to cache (upsert) — non-critical if table doesn't exist
    try {
      const cacheNow = new Date();
      await db
        .from('dashboard_card_cache')
        .upsert(
          {
            tenant_id: tenantId,
            cards,
            cache_version: CARD_CACHE_VERSION,
            generated_at: cacheNow.toISOString(),
            expires_at: new Date(cacheNow.getTime() + 24 * 60 * 60 * 1000).toISOString(),
          },
          { onConflict: 'tenant_id' }
        );
    } catch {
      // Cache write failed — non-critical (cache_version column may not exist yet)
    }

    return NextResponse.json({ cards, cached: false });
  } catch (err) {
    console.error('Dashboard cards error:', err);
    return NextResponse.json({ cards: fallbackCards(), cached: false, fallback: true });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Getting Started — live refresh (never stale from cache)
// ─────────────────────────────────────────────────────────────────────────────

async function refreshGettingStarted(
  db: Awaited<ReturnType<typeof createServiceRoleClient>>,
  tenantId: string,
  cachedCards: DashboardCard[]
): Promise<DashboardCard[] | null> {
  try {
    const { data: tenant } = await db
      .from('tenants')
      .select('square_merchant_id, stripe_account_id, theme_id, onboarding_data')
      .eq('id', tenantId)
      .single();

    const [eventsCount, inventoryCount, taxCount] = await Promise.all([
      db.from('events').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId),
      db.from('inventory_items').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('is_active', true),
      db.from('tax_profiles').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId),
    ]);

    const hasEvents = (eventsCount.count || 0) > 0;
    const hasInventory = (inventoryCount.count || 0) > 0;
    const hasPayment = !!(tenant?.square_merchant_id || tenant?.stripe_account_id);
    const onboardingData = (tenant?.onboarding_data as Record<string, any>) || {};
    const hasTheme = (tenant?.theme_id && tenant.theme_id !== 'rose-gold') || onboardingData.theme_customized === true;
    const hasTaxRate = (taxCount.count || 0) > 0;

    const steps = [
      { label: 'Create your first event', done: hasEvents, href: '/dashboard/events' },
      { label: 'Add inventory items', done: hasInventory, href: '/dashboard/inventory' },
      { label: 'Connect a payment processor', done: hasPayment, href: '/dashboard/settings' },
      { label: 'Customize your theme', done: hasTheme, href: '/dashboard/settings' },
      { label: 'Set your tax rate', done: hasTaxRate, href: '/dashboard/settings' },
    ];

    const completedCount = steps.filter((s) => s.done).length;
    const otherCards = cachedCards.filter((c) => c.type !== 'getting_started');

    if (onboardingData.getting_started_dismissed === true) {
      return otherCards;
    }

    const allDone = completedCount >= steps.length;
    if (allDone) {
      // All done — bust cache and signal full regeneration so new card types are included
      try { await db.from('dashboard_card_cache').delete().eq('tenant_id', tenantId); } catch { /* non-critical */ }
      return null;
    }

    return [
      { type: 'getting_started', priority: 0, data: { steps, completedCount, totalCount: steps.length } } as DashboardCard,
      ...otherCards,
    ];
  } catch {
    return cachedCards; // On error, return cached as-is
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Card Generation — each section wrapped in try/catch for resilience
// ─────────────────────────────────────────────────────────────────────────────

async function generateCards(
  db: Awaited<ReturnType<typeof createServiceRoleClient>>,
  tenantId: string
): Promise<DashboardCard[]> {
  const cards: DashboardCard[] = [];
  const now = new Date();

  // ── Fetch tenant for age + feature checks ─────────────────────────────
  let tenant: Record<string, any> | null = null;
  try {
    const { data } = await db
      .from('tenants')
      .select('created_at, theme_id, square_merchant_id, stripe_account_id, onboarding_completed, waiver_text, waiver_required, onboarding_data')
      .eq('id', tenantId)
      .single();
    tenant = data;
  } catch {
    // Continue without tenant data — age-based cards won't show
  }

  const tenantCreatedAt = tenant?.created_at ? new Date(tenant.created_at) : null;
  const tenantAgeDays = tenantCreatedAt
    ? Math.floor((now.getTime() - tenantCreatedAt.getTime()) / (1000 * 60 * 60 * 24))
    : 999; // If unknown, treat as established

  // Date boundaries
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd = thisMonthStart;
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const fourteenDaysFromNow = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

  // Run all queries in parallel — wrapped in try/catch so one table missing
  // doesn't kill everything. Each result defaults to empty if query fails.
  let eventsResult: { data: any[] | null } = { data: [] };
  let thisMonthSalesResult: { data: any[] | null } = { data: [] };
  let lastMonthSalesResult: { data: any[] | null } = { data: [] };
  let dailySalesResult: { data: any[] | null } = { data: [] };
  let eventsThisMonthResult: { count: number | null } = { count: 0 };
  let lowStockResult: { data: any[] | null } = { data: [] };
  let staleClientsResult: { data: any[] | null } = { data: [] };
  let clientCountResult: { count: number | null } = { count: 0 };
  let broadcastsResult: { data: any[] | null } = { data: [] };
  let upcomingEventsResult: { data: any[] | null } = { data: [] };
  let allEventsCountResult: { count: number | null } = { count: 0 };
  let inventoryCountResult: { count: number | null } = { count: 0 };
  let taxProfilesCountResult: { count: number | null } = { count: 0 };
  let unreadClientsResult: { data: any[] | null } = { data: [] };
  let newPartyRequestsCount: { count: number | null } = { count: 0 };
  let pendingWarrantyClaimsCount: { count: number | null } = { count: 0 };
  let totalSalesCount: { count: number | null } = { count: 0 };
  let totalWarrantyCount: { count: number | null } = { count: 0 };
  let partyBookingsCount: { count: number | null } = { count: 0 };

  try {
    [
      eventsResult,
      thisMonthSalesResult,
      lastMonthSalesResult,
      dailySalesResult,
      eventsThisMonthResult,
      lowStockResult,
      staleClientsResult,
      clientCountResult,
      broadcastsResult,
      upcomingEventsResult,
      allEventsCountResult,
      inventoryCountResult,
      taxProfilesCountResult,
      unreadClientsResult,
      newPartyRequestsCount,
      pendingWarrantyClaimsCount,
      totalSalesCount,
      totalWarrantyCount,
      partyBookingsCount,
    ] = await Promise.all([
      // Next event — use start of today (UTC) so events happening today aren't missed
      (() => {
        const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
        return db
          .from('events')
          .select('id, name, location, start_time, booth_fee')
          .eq('tenant_id', tenantId)
          .gte('start_time', todayStart.toISOString())
          .order('start_time', { ascending: true })
          .limit(1);
      })(),

      // This month sales
      db
        .from('sales')
        .select('subtotal, created_at')
        .eq('tenant_id', tenantId)
        .eq('status', 'completed')
        .gte('created_at', thisMonthStart.toISOString()),

      // Last month sales
      db
        .from('sales')
        .select('subtotal')
        .eq('tenant_id', tenantId)
        .eq('status', 'completed')
        .gte('created_at', lastMonthStart.toISOString())
        .lt('created_at', lastMonthEnd.toISOString()),

      // Daily sales for bar chart (last 12 days)
      (() => {
        const twelveAgo = new Date(now.getTime() - 12 * 24 * 60 * 60 * 1000);
        return db
          .from('sales')
          .select('subtotal, created_at')
          .eq('tenant_id', tenantId)
          .eq('status', 'completed')
          .gte('created_at', twelveAgo.toISOString());
      })(),

      // Events this month (for revenue card subtitle)
      db
        .from('events')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .gte('start_time', thisMonthStart.toISOString())
        .lt('start_time', new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString()),

      // Inventory items (all active)
      db
        .from('inventory_items')
        .select('id, name, quantity_on_hand, reorder_threshold, sunstone_product_id')
        .eq('tenant_id', tenantId)
        .eq('is_active', true),

      // Stale clients: created 60+ days ago
      db
        .from('clients')
        .select('id, first_name, last_name, created_at')
        .eq('tenant_id', tenantId)
        .lt('created_at', sixtyDaysAgo.toISOString())
        .order('created_at', { ascending: false })
        .limit(20),

      // Total client count
      db
        .from('clients')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId),

      // Recent broadcasts (last 7 days)
      db
        .from('broadcasts')
        .select('id, name, status, sent_count, total_recipients, sent_at, created_at')
        .eq('tenant_id', tenantId)
        .eq('status', 'completed')
        .gte('sent_at', sevenDaysAgo.toISOString())
        .order('sent_at', { ascending: false })
        .limit(5),

      // Upcoming events in next 14 days (for nudge check)
      db
        .from('events')
        .select('id')
        .eq('tenant_id', tenantId)
        .gte('start_time', now.toISOString())
        .lt('start_time', fourteenDaysFromNow.toISOString()),

      // All events count (for Getting Started check)
      db
        .from('events')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId),

      // Inventory count (for Getting Started check)
      db
        .from('inventory_items')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('is_active', true),

      // Tax profiles count (for Getting Started check)
      db
        .from('tax_profiles')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId),

      // Unread client messages (Today's Priorities)
      db
        .from('clients')
        .select('unread_messages')
        .eq('tenant_id', tenantId)
        .gt('unread_messages', 0),

      // New party requests (Today's Priorities)
      db
        .from('party_requests')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('status', 'new'),

      // Pending warranty claims (Today's Priorities)
      db
        .from('warranty_claims')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('status', 'submitted'),

      // Total completed sales (Growth Tip stage)
      db
        .from('sales')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('status', 'completed'),

      // Total warranties (Growth Tip attach rate)
      db
        .from('warranties')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId),

      // Confirmed/completed party bookings (Growth Tip)
      db
        .from('party_requests')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .in('status', ['confirmed', 'completed']),
    ]);
  } catch (err) {
    console.error('Dashboard cards: parallel queries failed:', err);
    // Continue with defaults — revenue $0 card will still be generated below
  }

  // ── Getting Started Checklist ──────────────────────────────────────────────
  const onboardingData = (tenant?.onboarding_data as Record<string, any>) || {};
  const isDismissed = onboardingData.getting_started_dismissed === true;
  let onboardingComplete = isDismissed;

  if (!isDismissed) {
    try {
      const hasEvents = (allEventsCountResult.count || 0) > 0;
      const hasInventory = (inventoryCountResult.count || 0) > 0;
      const hasPayment = !!(tenant?.square_merchant_id || tenant?.stripe_account_id);
      const hasTheme = (tenant?.theme_id && tenant.theme_id !== 'rose-gold') || onboardingData.theme_customized === true;
      const hasTaxRate = (taxProfilesCountResult.count || 0) > 0;

      const steps = [
        { label: 'Create your first event', done: hasEvents, href: '/dashboard/events' },
        { label: 'Add inventory items', done: hasInventory, href: '/dashboard/inventory' },
        { label: 'Connect a payment processor', done: hasPayment, href: '/dashboard/settings' },
        { label: 'Customize your theme', done: hasTheme, href: '/dashboard/settings' },
        { label: 'Set your tax rate', done: hasTaxRate, href: '/dashboard/settings' },
      ];

      const completedCount = steps.filter((s) => s.done).length;
      const allDone = completedCount >= steps.length;
      const completedAt = onboardingData.getting_started_completed_at;

      if (allDone && !completedAt) {
        // First time all done — record timestamp, show congrats (client auto-dismisses after 3s)
        try {
          await db.from('tenants').update({
            onboarding_data: { ...onboardingData, getting_started_completed_at: new Date().toISOString() },
          }).eq('id', tenantId);
        } catch { /* non-critical */ }
        cards.push({
          type: 'getting_started',
          priority: 0,
          data: { steps, completedCount, totalCount: steps.length },
        });
        onboardingComplete = true;
      } else if (allDone && completedAt) {
        // Previously completed but not dismissed yet — auto-dismiss server-side
        try {
          await db.from('tenants').update({
            onboarding_data: { ...onboardingData, getting_started_dismissed: true },
          }).eq('id', tenantId);
        } catch { /* non-critical */ }
        onboardingComplete = true;
      } else {
        // Still in progress — show checklist
        cards.push({
          type: 'getting_started',
          priority: 0,
          data: { steps, completedCount, totalCount: steps.length },
        });
      }
    } catch (err) {
      console.error('Dashboard cards: getting_started failed:', err);
    }
  }

  // ── Today's Priorities + Growth Tip (shown after onboarding complete) ────
  if (onboardingComplete) {
    try {
      const priorityItems: { type: string; label: string; link: string; icon: string }[] = [];

      // 1. Upcoming event within 7 days
      const upcomingEvents = eventsResult.data || [];
      if (upcomingEvents.length > 0) {
        const next = upcomingEvents[0];
        const days = Math.max(0, daysUntil(next.start_time));
        if (days <= 7) {
          const dayText = days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`;
          priorityItems.push({
            type: 'upcoming_event',
            label: `${next.name} is ${dayText}`,
            link: '/dashboard/events',
            icon: '\u{1F4C5}',
          });
        }
      }

      // 2. Low stock chains
      const allStock = lowStockResult.data || [];
      const lowItems = allStock.filter((i: any) => i.quantity_on_hand <= i.reorder_threshold && i.quantity_on_hand >= 0);
      if (lowItems.length > 0) {
        priorityItems.push({
          type: 'low_stock',
          label: `${lowItems.length} item${lowItems.length === 1 ? '' : 's'} running low`,
          link: '/dashboard/inventory',
          icon: '\u26A0\uFE0F',
        });
      }

      // 3. Unread messages
      const unreadClients = unreadClientsResult.data || [];
      const unreadTotal = unreadClients.reduce((s: number, c: any) => s + (Number(c.unread_messages) || 0), 0);
      if (unreadTotal > 0) {
        priorityItems.push({
          type: 'unread_messages',
          label: `${unreadTotal} unread message${unreadTotal === 1 ? '' : 's'}`,
          link: '/dashboard/messages',
          icon: '\u{1F4AC}',
        });
      }

      // 4. Pending party requests
      const newParties = newPartyRequestsCount.count || 0;
      if (newParties > 0) {
        priorityItems.push({
          type: 'party_requests',
          label: `${newParties} new party request${newParties === 1 ? '' : 's'}`,
          link: '/dashboard/parties',
          icon: '\u{1F389}',
        });
      }

      // 5. Pending warranty claims
      const pendingClaims = pendingWarrantyClaimsCount.count || 0;
      if (pendingClaims > 0) {
        priorityItems.push({
          type: 'warranty_claims',
          label: `${pendingClaims} warranty claim${pendingClaims === 1 ? '' : 's'} to review`,
          link: '/dashboard/warranties',
          icon: '\u{1F527}',
        });
      }

      // 6. No events scheduled (only if nothing else is urgent)
      if (priorityItems.length === 0 && (upcomingEventsResult.data || []).length === 0) {
        priorityItems.push({
          type: 'no_events',
          label: 'No upcoming events \u2014 create one to start selling',
          link: '/dashboard/events',
          icon: '\u{1F4C5}',
        });
      }

      cards.push({
        type: 'todays_priorities',
        priority: 0,
        data: { items: priorityItems.slice(0, 3) },
      });
    } catch (err) {
      console.error('Dashboard cards: todays_priorities failed:', err);
    }

    // ── Growth Tip (rules-based, stage-aware) ─────────────────────────────
    try {
      const totalSales = totalSalesCount.count || 0;
      const totalWarranties = totalWarrantyCount.count || 0;
      const partyBookings = partyBookingsCount.count || 0;
      const thisMonthSales = thisMonthSalesResult.data || [];
      const avgSale = thisMonthSales.length > 0
        ? thisMonthSales.reduce((s: number, r: any) => s + (Number(r.subtotal) || 0), 0) / thisMonthSales.length
        : 0;

      const dayOfYear = Math.floor(
        (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000
      );

      let stage: 'new' | 'growth' | 'established' = 'new';
      let tip = '';
      let metric: number | undefined;

      if (totalSales < 10) {
        stage = 'new';
        const tips = [
          'Offer anklets alongside bracelets \u2014 artists who bundle see significantly higher average tickets.',
          'Your first private party is the fastest way to build word-of-mouth. Share your booking link on social!',
          'Add a variety of chain styles to your inventory. Customers love having options.',
        ];
        tip = tips[dayOfYear % tips.length];
      } else if (totalSales <= 100) {
        stage = 'growth';
        const warrantyRate = totalSales > 0 ? Math.round((totalWarranties / totalSales) * 100) : 0;
        if (warrantyRate < 20) {
          tip = `Only ${warrantyRate}% of your sales include warranty protection. Offering it on every piece is an easy revenue boost.`;
          metric = warrantyRate;
        } else if (partyBookings === 0) {
          tip = 'Private parties drive 3-5x the revenue of typical events. Try promoting your booking page.';
        } else if (avgSale > 0 && avgSale < 50) {
          tip = 'Consider adding premium chains (14k gold) \u2014 even a few high-ticket options lift your average sale.';
        } else {
          const tips = [
            'Private parties drive 3-5x the revenue of typical events. Try promoting your booking page.',
            'Consider adding premium chains (14k gold) \u2014 even a few high-ticket options lift your average sale.',
          ];
          tip = tips[dayOfYear % tips.length];
        }
      } else {
        stage = 'established';
        const tips = [
          "Review your best-selling chains and make sure you're always stocked. Running out at an event means lost revenue.",
          "Focus on repeat business \u2014 a quick 'thinking of you' text to past clients goes a long way.",
        ];
        tip = tips[dayOfYear % tips.length];
      }

      // Fallback if tip is somehow empty
      if (!tip) {
        const fallbacks = [
          'Photos of happy customers wearing their new jewelry are your best marketing. Ask permission and post!',
          'Respond to messages within an hour when possible \u2014 fast replies build trust and close more bookings.',
          'Track your expenses in Reports to see your true profit margins, not just revenue.',
        ];
        tip = fallbacks[dayOfYear % fallbacks.length];
      }

      cards.push({
        type: 'growth_tip',
        priority: 0,
        data: { stage, tip, ...(metric !== undefined ? { metric } : {}) },
      });
    } catch (err) {
      console.error('Dashboard cards: growth_tip failed:', err);
    }
  }

  // ── Next Event Card (shown if next event is within 14 days) ─────────────
  try {
    const upcomingEvents = eventsResult.data || [];
    if (upcomingEvents.length > 0) {
      const next = upcomingEvents[0];
      const days = Math.max(0, daysUntil(next.start_time)); // 0 = today
      if (days <= 14) {
        cards.push({
          type: 'next_event',
          priority: days <= 3 ? 1 : 10,
          data: {
            eventName: next.name,
            date: formatDate(next.start_time),
            location: next.location,
            daysUntil: days,
            boothFee: next.booth_fee || 0,
          },
        });
      }
    }
  } catch (err) {
    console.error('Dashboard cards: next_event failed:', err);
  }

  // ── Fetch Shopify catalog (used by Sunny's Take + Spotlight) ─────────
  let shopifyCatalog: Awaited<ReturnType<typeof getCachedCatalog>> = null;
  try {
    shopifyCatalog = await getCachedCatalog();
  } catch {
    // Non-critical — continue without catalog data
  }

  // Build a concise catalog summary for Sunny's Take
  let catalogSummary: string | null = null;
  if (shopifyCatalog && shopifyCatalog.products.length > 0) {
    const summaryParts: string[] = [];
    // Detect sale items via compareAtPrice on variants
    const saleProducts = shopifyCatalog.products.filter((p) =>
      p.variants.some((v) => v.compareAtPrice && parseFloat(v.compareAtPrice) > parseFloat(v.price))
    );
    if (saleProducts.length > 0) {
      summaryParts.push(`Items on sale: ${saleProducts.slice(0, 5).map((p) => {
        const v = p.variants.find((v) => v.compareAtPrice && parseFloat(v.compareAtPrice) > parseFloat(v.price));
        return `${p.title} ($${v?.price || '?'}, was $${v?.compareAtPrice || '?'})`;
      }).join(', ')}`);
    }
    // Top 3 products (variety)
    const topProducts = shopifyCatalog.products.slice(0, 3);
    summaryParts.push(`Featured products: ${topProducts.map((p) => `${p.title} ($${p.variants[0]?.price || '?'})`).join(', ')}`);
    catalogSummary = summaryParts.join('\n');
  }

  // ── Sunny's Take (AI insight — one Claude call per 24h cache refresh) ───
  try {
    const sunnyInsight = await generateSunnyTake(
      thisMonthSalesResult.data || [],
      lastMonthSalesResult.data || [],
      eventsResult.data || [],
      upcomingEventsResult.data || [],
      lowStockResult.data || [],
      clientCountResult.count || 0,
      staleClientsResult.data || [],
      tenantAgeDays,
      catalogSummary,
    );
    if (sunnyInsight) {
      cards.push({
        type: 'sunny_take',
        priority: 3,
        data: {
          insight: sunnyInsight,
          generatedAt: new Date().toISOString(),
        },
      });
    }
  } catch (err) {
    console.error('Dashboard cards: sunny_take failed:', err);
    // Non-critical — dashboard works fine without it
  }

  // ── Revenue Snapshot (ALWAYS shown — $0 if no sales) ────────────────────
  try {
    const thisMonthSales = thisMonthSalesResult.data || [];
    const lastMonthSales = lastMonthSalesResult.data || [];
    const dailySalesRaw = dailySalesResult.data || [];

    const monthRevenue = thisMonthSales.reduce((s: number, r: any) => s + (Number(r.subtotal) || 0), 0);
    const lastMonthRevenue = lastMonthSales.reduce((s: number, r: any) => s + (Number(r.subtotal) || 0), 0);
    const pctChange = lastMonthRevenue > 0
      ? ((monthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100
      : null;

    // Build 12-day bar chart data
    const dailyTotals: number[] = [];
    for (let i = 11; i >= 0; i--) {
      const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
      const dayTotal = dailySalesRaw
        .filter((s: any) => {
          const d = new Date(s.created_at);
          return d >= dayStart && d < dayEnd;
        })
        .reduce((sum: number, s: any) => sum + (Number(s.subtotal) || 0), 0);
      dailyTotals.push(dayTotal);
    }
    const maxDaily = Math.max(...dailyTotals, 1);
    const dailyBars = dailyTotals.map((d) => d / maxDaily);

    cards.push({
      type: 'revenue_snapshot',
      priority: 5,
      data: {
        monthRevenue,
        lastMonthRevenue,
        pctChange: pctChange !== null ? Math.round(pctChange) : null,
        salesCount: thisMonthSales.length,
        eventsCount: eventsThisMonthResult.count || 0,
        dailyBars,
      },
    });
  } catch (err) {
    console.error('Dashboard cards: revenue_snapshot failed:', err);
    // Push a $0 revenue card even if the calculation fails
    cards.push({
      type: 'revenue_snapshot',
      priority: 5,
      data: {
        monthRevenue: 0,
        lastMonthRevenue: 0,
        pctChange: null,
        salesCount: 0,
        eventsCount: 0,
        dailyBars: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      },
    });
  }

  // ── Inventory Alert ─────────────────────────────────────────────────────
  try {
    const allStock = lowStockResult.data || [];
    const lowItems = allStock
      .filter((i: any) => i.quantity_on_hand <= i.reorder_threshold)
      .sort((a: any, b: any) => {
        const ra = a.reorder_threshold > 0 ? a.quantity_on_hand / a.reorder_threshold : 0;
        const rb = b.reorder_threshold > 0 ? b.quantity_on_hand / b.reorder_threshold : 0;
        return ra - rb;
      })
      .slice(0, 4);

    if (lowItems.length > 0) {
      cards.push({
        type: 'inventory_alert',
        priority: lowItems.some((i: any) => i.quantity_on_hand === 0) ? 2 : 15,
        data: {
          items: lowItems.map((i: any) => ({
            id: i.id,
            name: i.name,
            stock: i.quantity_on_hand,
            threshold: i.reorder_threshold,
            sunstone_product_id: i.sunstone_product_id || null,
            status:
              i.quantity_on_hand === 0
                ? 'critical'
                : i.quantity_on_hand <= i.reorder_threshold * 0.5
                  ? 'critical'
                  : 'low',
          })),
        },
      });
    }
  } catch (err) {
    console.error('Dashboard cards: inventory_alert failed:', err);
  }

  // ── Suggested Outreach ──────────────────────────────────────────────────
  try {
    const staleClients = staleClientsResult.data || [];
    if (staleClients.length > 0) {
      const clientsWithReason: { name: string; reason: string }[] = [];

      for (const client of staleClients.slice(0, 5)) {
        try {
          const { data: lastSale } = await db
            .from('sales')
            .select('created_at')
            .eq('tenant_id', tenantId)
            .eq('client_id', client.id)
            .eq('status', 'completed')
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

          if (lastSale) {
            const daysSince = Math.floor(
              (now.getTime() - new Date(lastSale.created_at).getTime()) / (1000 * 60 * 60 * 24)
            );
            if (daysSince >= 60) {
              const name = [client.first_name, client.last_name].filter(Boolean).join(' ') || 'Unknown';
              clientsWithReason.push({
                name,
                reason: `Last purchase ${daysSince} days ago`,
              });
            }
          } else {
            const name = [client.first_name, client.last_name].filter(Boolean).join(' ') || 'Unknown';
            clientsWithReason.push({
              name,
              reason: 'No purchases yet',
            });
          }
        } catch {
          // Individual client lookup failed — skip this client
        }

        if (clientsWithReason.length >= 3) break;
      }

      if (clientsWithReason.length > 0) {
        cards.push({
          type: 'suggested_outreach',
          priority: 25,
          data: { clients: clientsWithReason },
        });
      }
    }
  } catch (err) {
    console.error('Dashboard cards: suggested_outreach failed:', err);
  }

  // ── Networking Nudge ────────────────────────────────────────────────────
  try {
    const upcomingIn14 = upcomingEventsResult.data || [];
    const totalClients = clientCountResult.count || 0;

    if (upcomingIn14.length === 0) {
      cards.push({
        type: 'networking_nudge',
        priority: 30,
        data: {
          title: 'Book Your Next Event',
          body: totalClients > 0
            ? `You have ${totalClients} clients waiting to see you. Events drive repeat sales and grow your audience.`
            : 'Events are where you grow — get your next one on the calendar and start building your client list.',
          primaryLabel: 'Create Event',
          primaryRoute: '/dashboard/events',
          secondaryLabel: 'Browse Tips',
          secondaryRoute: '/dashboard/reports',
        },
      });
    }
  } catch (err) {
    console.error('Dashboard cards: networking_nudge failed:', err);
  }

  // ── Recent Messages ─────────────────────────────────────────────────────
  try {
    const recentBroadcasts = broadcastsResult.data || [];
    if (recentBroadcasts.length > 0) {
      const messages = recentBroadcasts.slice(0, 3).map((b: any) => {
        const sentDate = b.sent_at ? new Date(b.sent_at) : new Date(b.created_at);
        const hoursAgo = Math.floor((now.getTime() - sentDate.getTime()) / (1000 * 60 * 60));
        const timeStr = hoursAgo < 1 ? 'Just now'
          : hoursAgo < 24 ? `${hoursAgo}h ago`
          : `${Math.floor(hoursAgo / 24)}d ago`;

        return {
          sender: 'Sunstone',
          initials: 'S',
          text: `${b.name} — sent to ${b.sent_count} recipients`,
          time: timeStr,
          isSystem: true,
        };
      });

      cards.push({
        type: 'recent_messages',
        priority: 40,
        data: { messages },
      });
    }
  } catch (err) {
    console.error('Dashboard cards: recent_messages failed:', err);
  }

  // ── PJ University (tenants < 30 days old) ─────────────────────────────
  if (tenantAgeDays < 30) {
    try {
      cards.push({
        type: 'pj_university',
        priority: 45,
        data: {
          title: 'PJ University',
          subtitle: 'Courses on pricing, event setup, welding techniques, and growing your permanent jewelry business.',
          ctaLabel: 'Start Learning',
          ctaUrl: 'https://permanentjewelry-sunstonewelders.thinkific.com/users/sign_in',
        },
      });
    } catch (err) {
      console.error('Dashboard cards: pj_university failed:', err);
    }
  }

  // ── Sunstone Product Spotlight (ALWAYS shown) ─────────────────────────
  // Reads from sunstone_product_catalog with weekly rotation.
  // Supports admin override via platform_config.sunstone_spotlight.
  try {
    const spotlightProduct = await getSunstoneSpotlight(db);

    if (spotlightProduct) {
      cards.push({
        type: 'sunstone_product',
        priority: 50,
        data: spotlightProduct,
      });
    } else {
      // Fallback: static tip if catalog tables don't exist yet
      cards.push({
        type: 'sunstone_product',
        priority: 50,
        data: getSunstoneTipFallback(
          lowStockResult.data?.length || 0,
          clientCountResult.count || 0,
          (eventsResult.data || []).length,
        ),
      });
    }
  } catch (err) {
    console.error('Dashboard cards: sunstone_product failed:', err);
    // Static fallback
    cards.push({
      type: 'sunstone_product',
      priority: 50,
      data: {
        title: 'Explore Sunstone',
        body: 'Premium chains, charms, and welders for your permanent jewelry business.',
        actionLabel: 'Shop Now',
        actionRoute: 'https://sunstonewelders.com',
        badge: 'From Sunstone',
      },
    });
  }

  cards.sort((a, b) => a.priority - b.priority);
  return cards;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sunny's Take — personalized AI insight via Claude API
// ─────────────────────────────────────────────────────────────────────────────

const SUNNY_SYSTEM_PROMPT = `You are Sunny, a friendly and knowledgeable permanent jewelry business mentor. Given the following business data, write a 2-3 sentence personalized insight. Be specific (use actual numbers), encouraging, and include ONE actionable suggestion. Keep it warm and conversational — like a smart friend checking in on their business. Do not use emojis. Do not start with "Hey" or "Hi". Jump straight into the insight. If there are relevant Sunstone products (especially promotions), you may briefly mention one product that could help the artist, but keep it natural — not salesy.`;

async function generateSunnyTake(
  thisMonthSales: any[],
  lastMonthSales: any[],
  nextEvents: any[],
  upcomingEvents: any[],
  inventoryItems: any[],
  clientCount: number,
  staleClients: any[],
  tenantAgeDays: number,
  catalogSummary?: string | null,
): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn('Dashboard cards: ANTHROPIC_API_KEY not set, skipping sunny_take');
    return null;
  }

  // Build a concise business data summary for Claude
  const monthRevenue = thisMonthSales.reduce((s, r) => s + (Number(r.subtotal) || 0), 0);
  const lastMonthRevenue = lastMonthSales.reduce((s, r) => s + (Number(r.subtotal) || 0), 0);
  const pctChange = lastMonthRevenue > 0
    ? Math.round(((monthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100)
    : null;

  const lowStockItems = inventoryItems.filter(
    (i: any) => i.quantity_on_hand <= i.reorder_threshold
  );
  const criticalItems = lowStockItems.filter((i: any) => i.quantity_on_hand === 0);

  const nextEvent = nextEvents.length > 0 ? nextEvents[0] : null;
  const daysToNextEvent = nextEvent
    ? Math.max(0, Math.ceil((new Date(nextEvent.start_time).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;

  const businessData = {
    tenantAgeDays,
    thisMonth: {
      revenue: monthRevenue,
      salesCount: thisMonthSales.length,
    },
    lastMonth: {
      revenue: lastMonthRevenue,
      salesCount: lastMonthSales.length,
    },
    revenueChangePercent: pctChange,
    clients: {
      total: clientCount,
      needingOutreach: staleClients.length,
    },
    inventory: {
      totalItems: inventoryItems.length,
      lowStock: lowStockItems.length,
      outOfStock: criticalItems.length,
      lowStockNames: lowStockItems.slice(0, 3).map((i: any) => `${i.name} (${i.quantity_on_hand} left)`),
    },
    events: {
      upcomingCount: upcomingEvents.length,
      nextEventName: nextEvent?.name || null,
      daysToNextEvent,
      nextEventLocation: nextEvent?.location || null,
    },
  };

  let userMessage = `Here is the current business data for a permanent jewelry artist:\n\n${JSON.stringify(businessData, null, 2)}`;

  // Append catalog summary if available (active promotions, featured products)
  if (catalogSummary) {
    userMessage += `\n\nSunstone catalog highlights:\n${catalogSummary}`;
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 256,
        system: SUNNY_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    if (!response.ok) {
      console.error('Sunny take: Anthropic API error:', response.status);
      return null;
    }

    const result = await response.json();
    const text = result.content?.find((c: any) => c.type === 'text')?.text;
    if (!text || text.trim().length === 0) return null;

    // Clean up: remove any markdown formatting Claude might add
    return text.trim().replace(/^["']|["']$/g, '');
  } catch (err) {
    console.error('Sunny take: API call failed:', err);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Sunstone Spotlight — weekly rotation from catalog with admin override
// ─────────────────────────────────────────────────────────────────────────────

async function getSunstoneSpotlight(
  db: Awaited<ReturnType<typeof createServiceRoleClient>>
): Promise<Record<string, unknown> | null> {
  // Step 1: Check for admin override in platform_config
  try {
    const { data: config } = await db
      .from('platform_config')
      .select('value')
      .eq('key', 'sunstone_spotlight')
      .single();

    if (config?.value) {
      const spotlight = config.value as Record<string, any>;

      // Custom mode: admin has pinned a specific Shopify product by handle
      if (spotlight.mode === 'custom' && spotlight.custom_product_handle) {
        // Check auto-expiry
        if (spotlight.custom_expires_at) {
          const expiresAt = new Date(spotlight.custom_expires_at);
          if (expiresAt <= new Date()) {
            // Expired — reset to rotate mode (non-blocking, fire-and-forget)
            void db.from('platform_config')
              .update({ value: { mode: 'rotate' }, updated_at: new Date().toISOString() })
              .eq('key', 'sunstone_spotlight');
            // Fall through to catalog rotation below
          } else {
            // Not expired — find pinned product in Shopify cache
            const pinned = await findShopifyProduct(spotlight.custom_product_handle);
            if (pinned) return pinned;
          }
        } else {
          // No expiry set — use pinned product indefinitely
          const pinned = await findShopifyProduct(spotlight.custom_product_handle);
          if (pinned) return pinned;
        }
      }
    }
  } catch {
    // platform_config table may not exist yet — fall through to catalog
  }

  // Step 2: Use Shopify cached catalog
  const catalog = await getCachedCatalog();
  if (!catalog || catalog.products.length === 0) return null;

  // Load spotlight exclusions
  let excludedHandles: string[] = [];
  try {
    const { data: excl } = await db
      .from('platform_config')
      .select('value')
      .eq('key', 'spotlight_exclusions')
      .single();
    excludedHandles = (excl?.value as string[]) || [];
  } catch {
    // No exclusions set — use all products
  }

  const eligible = excludedHandles.length > 0
    ? catalog.products.filter((p) => !excludedHandles.includes(p.handle))
    : catalog.products;

  if (eligible.length === 0) return null;

  // Step 2a: If any eligible product has a compareAtPrice > price, feature it as a sale item
  const saleProduct = eligible.find((p) =>
    p.variants.some((v) => v.compareAtPrice && parseFloat(v.compareAtPrice) > parseFloat(v.price))
  );

  if (saleProduct) {
    return formatShopifySpotlight(saleProduct, 'On Sale', true);
  }

  // Step 2b: Weekly rotation through eligible products
  const weekNumber = getISOWeek(new Date());
  const index = weekNumber % eligible.length;
  const product = eligible[index];

  return formatShopifySpotlight(product, null, false);
}

/** Look up a product from the Shopify cache by handle */
async function findShopifyProduct(handle: string): Promise<Record<string, unknown> | null> {
  const catalog = await getCachedCatalog();
  if (!catalog) return null;

  const product = catalog.products.find((p) => p.handle === handle);
  if (!product) return null;

  return formatShopifySpotlight(product, null, false);
}

/** Format a Shopify product into a spotlight card data object */
function formatShopifySpotlight(
  product: SunstoneProduct,
  discountTitle: string | null,
  isSale: boolean
): Record<string, unknown> {
  const defaultVariant = product.variants[0];
  const price = defaultVariant?.price ? `$${defaultVariant.price}` : null;

  // Truncate description to ~120 chars for the card body
  const body = product.description
    ? product.description.replace(/<[^>]*>/g, '').slice(0, 120).trim() + (product.description.length > 120 ? '...' : '')
    : 'A top pick from Sunstone.';

  return {
    title: product.title,
    body,
    actionLabel: 'Order from Sunstone',
    actionRoute: product.url,
    imageUrl: product.imageUrl || null,
    badge: isSale ? (discountTitle || 'Sale') : 'Featured This Week',
    price: isSale ? price : price,
    salePrice: isSale && discountTitle ? price : null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Static Sunstone Tips (fallback when catalog tables don't exist)
// ─────────────────────────────────────────────────────────────────────────────

function getSunstoneTipFallback(
  inventoryCount: number,
  clientCount: number,
  upcomingEventCount: number
): Record<string, unknown> {
  if (inventoryCount === 0) {
    return {
      title: 'Set Up Your Inventory',
      body: 'Add your chains, charms, and supplies to start tracking stock and pricing products automatically.',
      actionLabel: 'Add Inventory',
      actionRoute: '/dashboard/inventory',
    };
  }
  if (upcomingEventCount === 0) {
    return {
      title: 'Create Your First Event',
      body: 'Events help you track sales by location, manage booth fees, and generate per-event reports.',
      actionLabel: 'Create Event',
      actionRoute: '/dashboard/events',
    };
  }
  if (clientCount === 0) {
    return {
      title: 'Build Your Client List',
      body: 'Clients are automatically added when you complete a sale. You can also import existing contacts.',
      actionLabel: 'View Clients',
      actionRoute: '/dashboard/clients',
    };
  }

  const tips = [
    {
      title: 'Try Event Mode',
      body: 'Full-screen POS for events — faster checkout and live sales tracking.',
      actionLabel: 'Learn More',
      actionRoute: '/dashboard/events',
    },
    {
      title: 'Broadcast to Clients',
      body: 'Send SMS or email blasts about upcoming events, promotions, or new products.',
      actionLabel: 'Create Broadcast',
      actionRoute: '/dashboard/broadcasts',
    },
    {
      title: 'Track Performance',
      body: 'Revenue trends, top-selling items, and event comparisons in your reports.',
      actionLabel: 'View Reports',
      actionRoute: '/dashboard/reports',
    },
  ];

  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24)
  );
  return tips[dayOfYear % tips.length];
}
