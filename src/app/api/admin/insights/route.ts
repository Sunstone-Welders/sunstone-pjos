// ============================================================================
// Admin Insights API — src/app/api/admin/insights/route.ts
// ============================================================================
// GET: Collect platform-wide data and generate AI-powered insights
// Uses service role client (bypasses RLS) + verifyPlatformAdmin guard
// Three-tier resilience: AI → Rule-based fallback → Early-stage tips
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { verifyPlatformAdmin, AdminAuthError } from '@/lib/admin/verify-platform-admin';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { logAnthropicCost } from '@/lib/cost-tracker';
import { isDemoTenant } from '@/lib/demo/personas';

interface Insight {
  type: 'growth' | 'attention' | 'churn_risk' | 'opportunity' | 'milestone';
  title: string;
  body: string;
}

// ============================================================================
// Main handler
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    await verifyPlatformAdmin();
    const serviceClient = await createServiceRoleClient();

    // ── Collect platform data ──────────────────────────────────────────
    const data = await collectPlatformData(serviceClient);

    // ── Generate insights ──────────────────────────────────────────────
    let insights: Insight[];

    // Early-stage: if very few tenants / no data, show onboarding tips
    if (data.tenantHealth.total <= 1 && data.clients.totalSalesThisMonth === 0) {
      insights = getEarlyStageTips(data);
    } else {
      // Try AI-powered insights
      try {
        insights = await generateAIInsights(data);
      } catch (aiError) {
        console.error('[Admin Insights] AI generation failed, using rule-based:', aiError);
        insights = generateRuleBasedInsights(data);
      }
    }

    return NextResponse.json({
      insights,
      generated_at: new Date().toISOString(),
    });
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[Admin Insights] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ============================================================================
// Data collection
// ============================================================================

interface PlatformData {
  tenantHealth: {
    total: number;
    newThisMonth: number;
    newLastMonth: number;
    byTier: Record<string, number>;
    activeIn7Days: number;
    engagementRate: number;
    zeroSalesTenants: Array<{ name: string; daysSinceSignup: number }>;
    churnRiskTenants: Array<{ name: string; lastActive: string }>;
    avgDaysToFirstSale: number | null;
  };
  revenue: {
    platformFeesThisMonth: number;
    platformFeesLastMonth: number;
    gmvThisMonth: number;
    gmvLastMonth: number;
    avgFeePerTransaction: number;
    revenueByTier: Record<string, number>;
    topTenantsByGMV: Array<{ name: string; gmv: number }>;
  };
  adoption: {
    eventModeUsers: number;
    storeModeUsers: number;
    stripeConnected: number;
    eventsCreatedThisMonth: number;
    queueUsed: number;
    waiverUsed: number;
  };
  meta: {
    demoTenantCount: number;
  };
  inventory: {
    totalItems: number;
    zeroInventoryTenants: number;
    commonMaterials: Array<{ material: string; count: number }>;
  };
  clients: {
    totalSalesThisMonth: number;
    avgSaleValue: number;
    totalClients: number;
    busiestDay: string | null;
  };
}

async function collectPlatformData(serviceClient: any): Promise<PlatformData> {
  const now = new Date();
  const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // ── Tenants ──────────────────────────────────────────────────────────
  const { data: tenants } = await serviceClient
    .from('tenants')
    .select('id, name, slug, subscription_tier, stripe_account_id, onboarding_completed, created_at');

  const allTenantsRaw = tenants || [];
  // Filter out demo tenants from all metrics
  const demoTenantCount = allTenantsRaw.filter((t: any) => isDemoTenant(t.id)).length;
  const allTenants = allTenantsRaw.filter((t: any) => !isDemoTenant(t.id));
  const total = allTenants.length;

  const newThisMonth = allTenants.filter(
    (t: any) => new Date(t.created_at) >= startOfThisMonth
  ).length;
  const newLastMonth = allTenants.filter(
    (t: any) => new Date(t.created_at) >= startOfLastMonth && new Date(t.created_at) < startOfThisMonth
  ).length;

  const byTier: Record<string, number> = { starter: 0, pro: 0, business: 0 };
  for (const t of allTenants) {
    const tier = t.subscription_tier || 'starter';
    byTier[tier] = (byTier[tier] || 0) + 1;
  }

  // ── All completed sales ──────────────────────────────────────────────
  const { data: allSales } = await serviceClient
    .from('sales')
    .select('id, tenant_id, total, subtotal, tax_amount, tip_amount, platform_fee_amount, payment_method, created_at')
    .eq('status', 'completed');

  const sales = allSales || [];

  // Sales by tenant for activity tracking
  const salesByTenant: Record<string, { count: number; lastSale: string; firstSale: string }> = {};
  for (const s of sales) {
    if (!salesByTenant[s.tenant_id]) {
      salesByTenant[s.tenant_id] = { count: 0, lastSale: s.created_at, firstSale: s.created_at };
    }
    salesByTenant[s.tenant_id].count++;
    if (s.created_at > salesByTenant[s.tenant_id].lastSale) {
      salesByTenant[s.tenant_id].lastSale = s.created_at;
    }
    if (s.created_at < salesByTenant[s.tenant_id].firstSale) {
      salesByTenant[s.tenant_id].firstSale = s.created_at;
    }
  }

  // Active in last 7 days (tenants with sales in last 7 days)
  const activeIn7Days = allTenants.filter((t: any) => {
    const last = salesByTenant[t.id]?.lastSale;
    return last && new Date(last) >= sevenDaysAgo;
  }).length;

  const engagementRate = total > 0 ? Math.round((activeIn7Days / total) * 100) : 0;

  // Zero sales tenants
  const zeroSalesTenants = allTenants
    .filter((t: any) => !salesByTenant[t.id])
    .map((t: any) => ({
      name: t.name || t.slug,
      daysSinceSignup: Math.floor((now.getTime() - new Date(t.created_at).getTime()) / (1000 * 60 * 60 * 24)),
    }));

  // Churn risk: active 30 days ago but not in last 14 days
  const churnRiskTenants = allTenants
    .filter((t: any) => {
      const info = salesByTenant[t.id];
      if (!info) return false;
      const lastSaleDate = new Date(info.lastSale);
      return lastSaleDate >= thirtyDaysAgo && lastSaleDate < fourteenDaysAgo;
    })
    .map((t: any) => ({
      name: t.name || t.slug,
      lastActive: salesByTenant[t.id].lastSale,
    }));

  // Avg days to first sale
  let totalDaysToFirst = 0;
  let tenantsWithSales = 0;
  for (const t of allTenants) {
    const info = salesByTenant[t.id];
    if (info) {
      const signupDate = new Date(t.created_at);
      const firstSaleDate = new Date(info.firstSale);
      totalDaysToFirst += Math.max(0, Math.floor((firstSaleDate.getTime() - signupDate.getTime()) / (1000 * 60 * 60 * 24)));
      tenantsWithSales++;
    }
  }
  const avgDaysToFirstSale = tenantsWithSales > 0 ? Math.round(totalDaysToFirst / tenantsWithSales) : null;

  // ── Revenue (this month vs last month) ───────────────────────────────
  const salesThisMonth = sales.filter((s: any) => new Date(s.created_at) >= startOfThisMonth);
  const salesLastMonth = sales.filter(
    (s: any) => new Date(s.created_at) >= startOfLastMonth && new Date(s.created_at) < startOfThisMonth
  );

  const platformFeesThisMonth = salesThisMonth.reduce((sum: number, s: any) => sum + (Number(s.platform_fee_amount) || 0), 0);
  const platformFeesLastMonth = salesLastMonth.reduce((sum: number, s: any) => sum + (Number(s.platform_fee_amount) || 0), 0);
  const gmvThisMonth = salesThisMonth.reduce((sum: number, s: any) => sum + (Number(s.total) || 0), 0);
  const gmvLastMonth = salesLastMonth.reduce((sum: number, s: any) => sum + (Number(s.total) || 0), 0);
  const avgFeePerTransaction = salesThisMonth.length > 0 ? platformFeesThisMonth / salesThisMonth.length : 0;

  // Revenue by tier
  const revenueByTier: Record<string, number> = { starter: 0, pro: 0, business: 0 };
  const tenantTierMap: Record<string, string> = {};
  for (const t of allTenants) {
    tenantTierMap[t.id] = t.subscription_tier || 'starter';
  }
  for (const s of salesThisMonth) {
    const tier = tenantTierMap[s.tenant_id] || 'starter';
    revenueByTier[tier] = (revenueByTier[tier] || 0) + (Number(s.platform_fee_amount) || 0);
  }

  // Top 5 tenants by GMV this month
  const gmvByTenantThisMonth: Record<string, { name: string; gmv: number }> = {};
  for (const s of salesThisMonth) {
    if (!gmvByTenantThisMonth[s.tenant_id]) {
      const t = allTenants.find((t: any) => t.id === s.tenant_id);
      gmvByTenantThisMonth[s.tenant_id] = { name: t?.name || 'Unknown', gmv: 0 };
    }
    gmvByTenantThisMonth[s.tenant_id].gmv += Number(s.total) || 0;
  }
  const topTenantsByGMV = Object.values(gmvByTenantThisMonth)
    .sort((a, b) => b.gmv - a.gmv)
    .slice(0, 5);

  // ── Feature adoption ─────────────────────────────────────────────────
  // Event mode = tenants that have sales with an event_id (check events table)
  const { data: events } = await serviceClient
    .from('events')
    .select('id, tenant_id, created_at');

  const allEvents = events || [];
  const tenantsWithEvents = new Set(allEvents.map((e: any) => e.tenant_id));
  const eventsCreatedThisMonth = allEvents.filter(
    (e: any) => new Date(e.created_at) >= startOfThisMonth
  ).length;

  // Store mode = tenants with sales that have no event_id
  // We can approximate: tenants with sales but without events = store mode users
  const tenantsWithSalesSet = new Set(Object.keys(salesByTenant));
  const storeModeUsers = [...tenantsWithSalesSet].filter(id => !tenantsWithEvents.has(id)).length;
  // Some tenants may use both modes — event mode count = tenants with events
  const eventModeUsers = tenantsWithEvents.size;

  // Payment processor adoption
  const stripeConnected = allTenants.filter((t: any) => t.stripe_account_id).length;

  // Queue usage
  const { count: queueCount } = await serviceClient
    .from('queue_entries')
    .select('tenant_id', { count: 'exact', head: true });

  // Waiver usage
  const { count: waiverCount } = await serviceClient
    .from('waivers')
    .select('tenant_id', { count: 'exact', head: true });

  // ── Inventory ────────────────────────────────────────────────────────
  const { data: inventory } = await serviceClient
    .from('inventory_items')
    .select('id, tenant_id, material, name');

  const allInventory = inventory || [];
  const totalItems = allInventory.length;
  const tenantsWithInventory = new Set(allInventory.map((i: any) => i.tenant_id));
  const zeroInventoryTenants = allTenants.filter((t: any) => !tenantsWithInventory.has(t.id)).length;

  // Common materials
  const materialCounts: Record<string, number> = {};
  for (const item of allInventory) {
    const mat = item.material || 'Unknown';
    materialCounts[mat] = (materialCounts[mat] || 0) + 1;
  }
  const commonMaterials = Object.entries(materialCounts)
    .map(([material, count]) => ({ material, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // ── Client/Sales patterns ────────────────────────────────────────────
  const totalSalesThisMonth = salesThisMonth.length;
  const avgSaleValue = totalSalesThisMonth > 0
    ? salesThisMonth.reduce((sum: number, s: any) => sum + (Number(s.total) || 0), 0) / totalSalesThisMonth
    : 0;

  const { count: totalClients } = await serviceClient
    .from('clients')
    .select('id', { count: 'exact', head: true });

  // Busiest day of week
  const dayOfWeekCounts: Record<string, number> = {};
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  for (const s of sales) {
    const day = dayNames[new Date(s.created_at).getDay()];
    dayOfWeekCounts[day] = (dayOfWeekCounts[day] || 0) + 1;
  }
  const busiestDay = Object.entries(dayOfWeekCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  return {
    tenantHealth: {
      total,
      newThisMonth,
      newLastMonth,
      byTier,
      activeIn7Days,
      engagementRate,
      zeroSalesTenants,
      churnRiskTenants,
      avgDaysToFirstSale,
    },
    revenue: {
      platformFeesThisMonth: Math.round(platformFeesThisMonth * 100) / 100,
      platformFeesLastMonth: Math.round(platformFeesLastMonth * 100) / 100,
      gmvThisMonth: Math.round(gmvThisMonth * 100) / 100,
      gmvLastMonth: Math.round(gmvLastMonth * 100) / 100,
      avgFeePerTransaction: Math.round(avgFeePerTransaction * 100) / 100,
      revenueByTier,
      topTenantsByGMV,
    },
    adoption: {
      eventModeUsers,
      storeModeUsers,
      stripeConnected,
      eventsCreatedThisMonth,
      queueUsed: queueCount || 0,
      waiverUsed: waiverCount || 0,
    },
    inventory: {
      totalItems,
      zeroInventoryTenants,
      commonMaterials,
    },
    clients: {
      totalSalesThisMonth,
      avgSaleValue: Math.round(avgSaleValue * 100) / 100,
      totalClients: totalClients || 0,
      busiestDay,
    },
    meta: {
      demoTenantCount,
    },
  };
}

// ============================================================================
// AI-powered insights (primary tier)
// ============================================================================

async function generateAIInsights(data: PlatformData): Promise<Insight[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  const systemPrompt = `You are Atlas, the platform intelligence AI for Sunstone PJOS. You help Tony (the platform founder) understand how his SaaS platform is performing and where to focus his attention.

PLATFORM CONTEXT:
- Sunstone PJOS is a pre-launch SaaS for permanent jewelry artists
- The platform is in invite-only beta with a small number of real artists
- Payment processing is exclusively through Stripe (no Square)
- Demo/test tenant accounts have been excluded from these metrics — all data shown is from real users
- Low numbers are EXPECTED at this stage — calibrate analysis accordingly
- Do NOT generate crisis-level alerts for normal pre-launch metrics (e.g. low engagement with only a few tenants is expected)

PERSONALITY:
- Direct, data-driven, strategic
- Think like a SaaS advisor / COO
- Highlight what needs attention first, celebrate wins second
- Be specific with numbers — percentages, trends, comparisons
- Suggest concrete actions Tony can take

INSIGHT CATEGORIES:
- "growth" — positive platform trends
- "attention" — something that needs action
- "churn_risk" — tenants at risk of leaving
- "opportunity" — untapped potential
- "milestone" — platform achievement

Return 4-6 insights as a JSON array:
[{ "type": "growth|attention|churn_risk|opportunity|milestone", "title": "string", "body": "string" }]

FOCUS AREAS (in priority order):
1. Churn signals — who's disengaging and what can Tony do about it
2. Onboarding friction — who signed up but isn't using the platform
3. Revenue trends — is the platform growing, flat, or declining
4. Feature adoption — which features are being used/ignored
5. Growth wins — celebrate momentum to keep Tony motivated

TONE: Concise and strategic. No fluff. Tony is the founder — speak to him like a smart advisor, not a dashboard. Name specific tenants when discussing churn risk or onboarding issues. Use real numbers and percentages.

IMPORTANT: Return ONLY the JSON array, no markdown, no backticks, no extra text.`;

  const userMessage = `Here's the current platform data for Sunstone PJOS:

TENANT HEALTH:
- Total tenants: ${data.tenantHealth.total}
- New this month: ${data.tenantHealth.newThisMonth} (last month: ${data.tenantHealth.newLastMonth})
- By tier: Starter: ${data.tenantHealth.byTier.starter || 0}, Pro: ${data.tenantHealth.byTier.pro || 0}, Business: ${data.tenantHealth.byTier.business || 0}
- Active in last 7 days: ${data.tenantHealth.activeIn7Days} of ${data.tenantHealth.total} (${data.tenantHealth.engagementRate}% engagement)
- Tenants with zero sales: ${data.tenantHealth.zeroSalesTenants.map(t => `${t.name} (${t.daysSinceSignup} days since signup)`).join(', ') || 'None'}
- Churn risk tenants (active 30d ago, inactive last 14d): ${data.tenantHealth.churnRiskTenants.map(t => `${t.name} (last active: ${new Date(t.lastActive).toLocaleDateString()})`).join(', ') || 'None'}
- Average days to first sale: ${data.tenantHealth.avgDaysToFirstSale ?? 'N/A'}

REVENUE:
- Platform fees this month: $${data.revenue.platformFeesThisMonth.toFixed(2)} (last month: $${data.revenue.platformFeesLastMonth.toFixed(2)})
- GMV this month: $${data.revenue.gmvThisMonth.toFixed(2)} (last month: $${data.revenue.gmvLastMonth.toFixed(2)})
- Avg platform fee per transaction: $${data.revenue.avgFeePerTransaction.toFixed(2)}
- Revenue by tier: Starter: $${(data.revenue.revenueByTier.starter || 0).toFixed(2)}, Pro: $${(data.revenue.revenueByTier.pro || 0).toFixed(2)}, Business: $${(data.revenue.revenueByTier.business || 0).toFixed(2)}
- Top tenants by GMV this month: ${data.revenue.topTenantsByGMV.map(t => `${t.name}: $${t.gmv.toFixed(2)}`).join(', ') || 'None'}

FEATURE ADOPTION:
- Event Mode users: ${data.adoption.eventModeUsers}
- Store Mode users: ${data.adoption.storeModeUsers}
- Stripe connected: ${data.adoption.stripeConnected}
- Events created this month: ${data.adoption.eventsCreatedThisMonth}
- Queue entries total: ${data.adoption.queueUsed}
- Waivers total: ${data.adoption.waiverUsed}

INVENTORY:
- Total inventory items: ${data.inventory.totalItems}
- Tenants with zero inventory: ${data.inventory.zeroInventoryTenants}
- Most common materials: ${data.inventory.commonMaterials.map(m => `${m.material} (${m.count})`).join(', ') || 'None'}

CLIENT/SALES PATTERNS:
- Total sales this month: ${data.clients.totalSalesThisMonth}
- Average sale value: $${data.clients.avgSaleValue.toFixed(2)}
- Total clients across platform: ${data.clients.totalClients}
- Busiest day of week: ${data.clients.busiestDay || 'N/A'}

Analyze this data and return 4-6 strategic insights as a JSON array.`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[Admin Insights] Anthropic API error:', errorText);
    throw new Error(`Anthropic API error: ${response.status}`);
  }

  const result = await response.json();

  // Log Anthropic cost (fire-and-forget)
  if (result.usage) {
    logAnthropicCost({
      tenantId: null,
      operation: 'admin_insights',
      model: 'claude-sonnet-4-20250514',
      usage: result.usage,
    });
  }

  const text = result.content?.[0]?.text || '';

  // Parse JSON from response (strip backticks if present)
  const cleaned = text.replace(/```json\s?/g, '').replace(/```/g, '').trim();
  const insights: Insight[] = JSON.parse(cleaned);

  // Validate and clamp to 4-6 insights
  return insights
    .filter((i: any) => i.type && i.title && i.body)
    .slice(0, 6);
}

// ============================================================================
// Rule-based fallback insights (secondary tier)
// ============================================================================

function generateRuleBasedInsights(data: PlatformData): Insight[] {
  const insights: Insight[] = [];

  // Churn risk
  if (data.tenantHealth.churnRiskTenants.length > 0) {
    const names = data.tenantHealth.churnRiskTenants.map(t => t.name).join(', ');
    insights.push({
      type: 'churn_risk',
      title: `${data.tenantHealth.churnRiskTenants.length} tenant${data.tenantHealth.churnRiskTenants.length > 1 ? 's' : ''} going quiet`,
      body: `${names} ${data.tenantHealth.churnRiskTenants.length > 1 ? 'were' : 'was'} active last month but haven't logged any sales in the past 14 days. Consider a personal check-in or re-engagement email.`,
    });
  }

  // Onboarding friction
  if (data.tenantHealth.zeroSalesTenants.length > 0) {
    const stale = data.tenantHealth.zeroSalesTenants.filter(t => t.daysSinceSignup > 7);
    if (stale.length > 0) {
      const names = stale.map(t => `${t.name} (${t.daysSinceSignup}d)`).join(', ');
      insights.push({
        type: 'attention',
        title: `${stale.length} tenant${stale.length > 1 ? 's' : ''} stuck in onboarding`,
        body: `${names} signed up over a week ago with zero sales. Average time to first sale is ${data.tenantHealth.avgDaysToFirstSale ?? '?'} days — these tenants may need a walkthrough or nudge.`,
      });
    }
  }

  // Revenue trend
  if (data.revenue.platformFeesLastMonth > 0) {
    const changePercent = ((data.revenue.platformFeesThisMonth - data.revenue.platformFeesLastMonth) / data.revenue.platformFeesLastMonth * 100);
    if (changePercent > 0) {
      insights.push({
        type: 'growth',
        title: `Platform revenue up ${changePercent.toFixed(0)}% month-over-month`,
        body: `Platform fees are $${data.revenue.platformFeesThisMonth.toFixed(2)} this month vs $${data.revenue.platformFeesLastMonth.toFixed(2)} last month. GMV is $${data.revenue.gmvThisMonth.toFixed(2)}.`,
      });
    } else {
      insights.push({
        type: 'attention',
        title: `Platform revenue down ${Math.abs(changePercent).toFixed(0)}% month-over-month`,
        body: `Platform fees dropped from $${data.revenue.platformFeesLastMonth.toFixed(2)} last month to $${data.revenue.platformFeesThisMonth.toFixed(2)}. Review if this is seasonal or if specific tenants have slowed down.`,
      });
    }
  }

  // Feature adoption
  if (data.adoption.storeModeUsers < data.tenantHealth.total * 0.3 && data.tenantHealth.total > 2) {
    insights.push({
      type: 'opportunity',
      title: 'Store Mode underutilized',
      body: `Only ${data.adoption.storeModeUsers} of ${data.tenantHealth.total} tenants have used Store Mode. Most are event-only. Highlighting Store Mode in onboarding could increase daily usage and revenue.`,
    });
  }

  // Payment processor
  const noProcessor = data.tenantHealth.total - data.adoption.stripeConnected;
  if (noProcessor > 0 && data.tenantHealth.total > 1) {
    insights.push({
      type: 'attention',
      title: `${noProcessor} tenant${noProcessor > 1 ? 's' : ''} without Stripe`,
      body: `${noProcessor} of ${data.tenantHealth.total} tenants haven't connected Stripe. They can only accept cash/external payments, which limits their revenue potential.`,
    });
  }

  // Engagement milestone
  if (data.tenantHealth.engagementRate >= 50) {
    insights.push({
      type: 'milestone',
      title: `${data.tenantHealth.engagementRate}% weekly engagement`,
      body: `${data.tenantHealth.activeIn7Days} of ${data.tenantHealth.total} tenants were active in the last 7 days. Strong engagement is a great sign for retention.`,
    });
  }

  // Top earner spotlight
  if (data.revenue.topTenantsByGMV.length > 0) {
    const top = data.revenue.topTenantsByGMV[0];
    const topShare = data.revenue.gmvThisMonth > 0
      ? Math.round((top.gmv / data.revenue.gmvThisMonth) * 100)
      : 0;
    insights.push({
      type: 'growth',
      title: `${top.name} leading GMV this month`,
      body: `Your top earner ${top.name} drove $${top.gmv.toFixed(2)} in GMV (${topShare}% of platform total). Consider featuring them as a success story.`,
    });
  }

  return insights.slice(0, 6);
}

// ============================================================================
// Early-stage tips (tertiary tier)
// ============================================================================

function getEarlyStageTips(data: PlatformData): Insight[] {
  const insights: Insight[] = [
    {
      type: 'milestone',
      title: 'Platform is live!',
      body: `You have ${data.tenantHealth.total} tenant${data.tenantHealth.total !== 1 ? 's' : ''} signed up. As tenants start making sales, this section will show AI-powered insights about revenue trends, churn risks, and growth opportunities.`,
    },
    {
      type: 'opportunity',
      title: 'Focus on your first 5 tenants',
      body: 'Early tenants are your best feedback loop. Offer hands-on onboarding — walk them through their first event setup and first sale. Their experience will shape the product.',
    },
    {
      type: 'attention',
      title: 'Check payment processing setup',
      body: `${data.adoption.stripeConnected} of ${data.tenantHealth.total} tenants have connected Stripe. Help any remaining tenants get Stripe connected so they can start processing card payments.`,
    },
  ];

  if (data.inventory.zeroInventoryTenants > 0) {
    insights.push({
      type: 'attention',
      title: `${data.inventory.zeroInventoryTenants} tenant${data.inventory.zeroInventoryTenants > 1 ? 's' : ''} need inventory`,
      body: 'Tenants without inventory items can\'t use the POS effectively. Guide them to add their chain products and set up pricing.',
    });
  }

  return insights;
}