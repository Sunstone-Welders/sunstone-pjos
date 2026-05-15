// Admin API — Platform Usage Analytics
// Returns overview stats, feature adoption, most active tenants, daily activity

import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { verifyPlatformAdmin, AdminAuthError } from '@/lib/admin/verify-platform-admin';

const EVENT_LABELS: Record<string, string> = {
  sale_completed: 'Sale Completed',
  inventory_item_added: 'Inventory Item Added',
  inventory_item_restocked: 'Inventory Restocked',
  client_created: 'Client Created',
  event_created: 'Event Created',
  waiver_signed: 'Waiver Signed',
  queue_entry_created: 'Queue Entry Created',
  sunny_question_asked: 'Sunny Question Asked',
  gift_card_purchased: 'Gift Card Purchased',
  gift_card_redeemed: 'Gift Card Redeemed',
  report_exported: 'Report Exported',
  workflow_created: 'Workflow Created',
  party_booked: 'Party Booked',
  broadcast_sent: 'Broadcast Sent',
  receipt_sent: 'Receipt Sent',
  stripe_connected: 'Stripe Connected',
  square_connected: 'Square Connected',
  theme_changed: 'Theme Changed',
  storefront_viewed: 'Storefront Viewed',
  warranty_sold: 'Warranty Sold',
  refund_processed: 'Refund Processed',
  team_member_invited: 'Team Member Invited',
  sms_sent: 'SMS Sent',
  page_view: 'Page View',
};

export async function GET() {
  try {
    await verifyPlatformAdmin();
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: 'Auth error' }, { status: 500 });
  }

  const serviceClient = await createServiceRoleClient();
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // Fetch all events for aggregation (limit to recent data for performance)
  const { data: allEvents } = await serviceClient
    .from('usage_events')
    .select('tenant_id, event_type, event_category, created_at')
    .order('created_at', { ascending: false })
    .limit(50000);

  const events = allEvents || [];

  // Total tenant count
  const { count: totalTenants } = await serviceClient
    .from('tenants')
    .select('*', { count: 'exact', head: true });

  // === Overview ===
  const totalEvents = events.length;
  const weekEvents = events.filter(e => e.created_at >= sevenDaysAgo);
  const eventsThisWeek = weekEvents.length;
  const activeTenants = new Set(weekEvents.map(e => e.tenant_id)).size;

  // Most used feature this week
  const weekTypeCount: Record<string, number> = {};
  for (const e of weekEvents) {
    weekTypeCount[e.event_type] = (weekTypeCount[e.event_type] || 0) + 1;
  }
  const mostUsedType = Object.entries(weekTypeCount).sort((a, b) => b[1] - a[1])[0];
  const mostUsedFeature = mostUsedType
    ? EVENT_LABELS[mostUsedType[0]] || mostUsedType[0]
    : 'N/A';

  // === Feature Adoption ===
  const typeStats: Record<string, { total: number; week: number; tenants: Set<string>; category: string }> = {};
  for (const e of events) {
    if (!typeStats[e.event_type]) {
      typeStats[e.event_type] = { total: 0, week: 0, tenants: new Set(), category: e.event_category };
    }
    typeStats[e.event_type].total++;
    typeStats[e.event_type].tenants.add(e.tenant_id);
    if (e.created_at >= sevenDaysAgo) typeStats[e.event_type].week++;
  }

  const featureAdoption = Object.entries(typeStats)
    .map(([type, stats]) => ({
      event_type: type,
      label: EVENT_LABELS[type] || type,
      category: stats.category,
      total: stats.total,
      unique_tenants: stats.tenants.size,
      adoption_pct: totalTenants ? Math.round((stats.tenants.size / totalTenants) * 100) : 0,
      week_count: stats.week,
    }))
    .sort((a, b) => b.total - a.total);

  // === Most Active Tenants ===
  const tenantStats: Record<string, { total: number; typeCount: Record<string, number>; lastActive: string }> = {};
  for (const e of events) {
    if (!tenantStats[e.tenant_id]) {
      tenantStats[e.tenant_id] = { total: 0, typeCount: {}, lastActive: e.created_at };
    }
    tenantStats[e.tenant_id].total++;
    tenantStats[e.tenant_id].typeCount[e.event_type] = (tenantStats[e.tenant_id].typeCount[e.event_type] || 0) + 1;
    if (e.created_at > tenantStats[e.tenant_id].lastActive) {
      tenantStats[e.tenant_id].lastActive = e.created_at;
    }
  }

  const topTenantIds = Object.entries(tenantStats)
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 15)
    .map(([id]) => id);

  const { data: tenantInfo } = topTenantIds.length > 0
    ? await serviceClient
        .from('tenants')
        .select('id, name, subscription_tier')
        .in('id', topTenantIds)
    : { data: [] };
  const tenantMap: Record<string, { name: string; tier: string }> = {};
  for (const t of tenantInfo || []) {
    tenantMap[t.id] = { name: t.name, tier: t.subscription_tier };
  }

  const mostActiveTenants = topTenantIds.map(id => {
    const stats = tenantStats[id];
    const topType = Object.entries(stats.typeCount).sort((a, b) => b[1] - a[1])[0];
    return {
      tenant_id: id,
      tenant_name: tenantMap[id]?.name || 'Unknown',
      subscription_tier: tenantMap[id]?.tier || 'starter',
      total_events: stats.total,
      most_used_feature: topType ? (EVENT_LABELS[topType[0]] || topType[0]) : 'N/A',
      last_active: stats.lastActive,
    };
  });

  // === Daily Activity (last 30 days) ===
  const dayCountMap: Record<string, number> = {};
  for (let i = 0; i < 30; i++) {
    const d = new Date(now.getTime() - (29 - i) * 24 * 60 * 60 * 1000);
    dayCountMap[d.toISOString().slice(0, 10)] = 0;
  }
  for (const e of events) {
    if (e.created_at < thirtyDaysAgo) continue;
    const day = e.created_at.slice(0, 10);
    if (dayCountMap[day] !== undefined) dayCountMap[day]++;
  }
  const dailyActivity = Object.entries(dayCountMap).map(([date, count]) => ({ date, count }));

  return NextResponse.json({
    overview: {
      total_events: totalEvents,
      events_this_week: eventsThisWeek,
      active_tenants_this_week: activeTenants,
      most_used_feature: mostUsedFeature,
    },
    feature_adoption: featureAdoption,
    most_active_tenants: mostActiveTenants,
    daily_activity: dailyActivity,
  });
}
