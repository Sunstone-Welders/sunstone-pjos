// ============================================================================
// Business Reports Page — src/app/dashboard/reports/page.tsx
// ============================================================================
// FIXED: Platform fee bug (only count absorbed fees as costs)
// FIXED: Revenue uses subtotal+tax+tip (not sale.total)
// FIXED: COGS uses snapshotted chain_material_cost + jump_ring_cost from sale_items
// ADDED: Materials COGS breakdown display (chain material + jump rings)
// FIXED: CSV export with corrected calculations + COGS columns
// ============================================================================

'use client';

import { useEffect, useState, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useTenant } from '@/hooks/use-tenant';
import { format, startOfYear, startOfMonth, subMonths, startOfQuarter, endOfQuarter } from 'date-fns';
import { useRouter } from 'next/navigation';
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Badge,
  Input,
} from '@/components/ui';
import type { Event, Sale, SaleItem, Refund } from '@/types';
import { PLATFORM_FEE_RATES } from '@/types';
import UpgradePrompt from '@/components/ui/UpgradePrompt';
import SunnyTutorial from '@/components/SunnyTutorial';
import ExpensesSection from '@/components/reports/ExpensesSection';
import type { ExpenseTotals } from '@/components/reports/ExpensesSection';

// ————————————————————————————————————————————————
// Types
// ————————————————————————————————————————————————

type ReportsTab = 'overview' | 'events';
type SourceFilter = 'all' | 'events' | 'store';
type DatePreset = 'ytd' | 'q1' | 'q2' | 'q3' | 'q4' | 'this_month' | 'last_month' | 'last_3' | 'custom';

interface AggregatedData {
  totalRevenue: number;
  totalSubtotal: number;
  totalTax: number;
  totalTips: number;
  totalPlatformFees: number;
  totalDiscounts: number;
  totalCOGS: number;
  totalChainCost: number;
  totalJumpRingCost: number;
  totalRefunds: number;
  netRevenue: number;
  salesCount: number;
  avgSaleValue: number;
  netProfit: number;
  paymentBreakdown: Record<string, { count: number; total: number }>;
  monthlyBreakdown: { month: string; revenue: number; costs: number; profit: number; salesCount: number }[];
}

interface EventSummary {
  id: string;
  name: string;
  date: string;
  location: string | null;
  salesCount: number;
  revenue: number;
  costs: number;
  profit: number;
}

// ————————————————————————————————————————————————
// Helpers
// ————————————————————————————————————————————————

const money = (n: number) => {
  const abs = Math.abs(n);
  const formatted = abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n < 0 ? `-$${formatted}` : `$${formatted}`;
};

const paymentMethodLabels: Record<string, string> = {
  stripe_link: 'Stripe (QR/Link)',
  cash: 'Cash',
  venmo: 'Venmo / Zelle',
  card_external: 'External Card',
  // Legacy values for older sales
  card_present: 'Card',
  card_not_present: 'Card (Remote)',
  other: 'Other',
};

function getDateRange(preset: DatePreset, year: number): { start: Date; end: Date } {
  const now = new Date();
  switch (preset) {
    case 'ytd':
      return { start: startOfYear(now), end: now };
    case 'q1':
      return { start: new Date(year, 0, 1), end: new Date(year, 2, 31, 23, 59, 59) };
    case 'q2':
      return { start: new Date(year, 3, 1), end: new Date(year, 5, 30, 23, 59, 59) };
    case 'q3':
      return { start: new Date(year, 6, 1), end: new Date(year, 8, 30, 23, 59, 59) };
    case 'q4':
      return { start: new Date(year, 9, 1), end: new Date(year, 11, 31, 23, 59, 59) };
    case 'this_month':
      return { start: startOfMonth(now), end: now };
    case 'last_month': {
      const last = subMonths(now, 1);
      return { start: startOfMonth(last), end: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59) };
    }
    case 'last_3':
      return { start: subMonths(startOfMonth(now), 2), end: now };
    default:
      return { start: startOfYear(now), end: now };
  }
}
// ————————————————————————————————————————————————
// Effective tier helper (client-side mirror of server logic)
// ————————————————————————————————————————————————

function getEffectiveTier(tenant: any): 'starter' | 'pro' | 'business' {
  if (!tenant) return 'starter';
  const status = tenant.subscription_status;
  const trialEnd = tenant.trial_ends_at;
  const tier = tenant.subscription_tier;

  if (status === 'active') {
    if (tier === 'pro') return 'pro';
    if (tier === 'business') return 'business';
    return 'starter';
  }

  if (trialEnd) {
    const end = new Date(trialEnd);
    if (end > new Date()) return 'pro';
  }

  return 'starter';
}

// ————————————————————————————————————————————————
// CSV Export (overview) — FIXED
// ————————————————————————————————————————————————

function exportOverviewCSV(data: AggregatedData, dateLabel: string, sourceLabel: string, expenses: ExpenseTotals) {
  const filename = `Business Report - ${dateLabel} - ${sourceLabel}.csv`;
  const lines: string[] = [];

  lines.push('Business P&L Report');
  lines.push(`Period,"${dateLabel}"`);
  lines.push(`Source,"${sourceLabel}"`);
  lines.push('');

  lines.push('SUMMARY');
  lines.push(`Total Sales,${data.salesCount}`);
  lines.push(`Average Sale,${data.avgSaleValue.toFixed(2)}`);
  lines.push('');

  lines.push('REVENUE');
  lines.push(`Gross Revenue,${data.totalRevenue.toFixed(2)}`);
  lines.push(`Product Revenue,${data.totalSubtotal.toFixed(2)}`);
  lines.push(`Tax Collected,${data.totalTax.toFixed(2)}`);
  lines.push(`Tips,${data.totalTips.toFixed(2)}`);
  if (data.totalDiscounts > 0) lines.push(`Discounts Given,-${data.totalDiscounts.toFixed(2)}`);
  if (data.totalRefunds > 0) lines.push(`Refunds,-${data.totalRefunds.toFixed(2)}`);
  lines.push(`Net Revenue,${data.netRevenue.toFixed(2)}`);
  lines.push('');

  lines.push('COSTS');
  if (data.totalChainCost > 0) lines.push(`Chain Material,${data.totalChainCost.toFixed(2)}`);
  if (data.totalJumpRingCost > 0) lines.push(`Jump Rings,${data.totalJumpRingCost.toFixed(2)}`);
  lines.push(`Total COGS,${data.totalCOGS.toFixed(2)}`);
  if (expenses.total > 0) {
    lines.push('');
    lines.push('EXPENSES');
    Object.entries(expenses.byCategory)
      .sort((a, b) => b[1] - a[1])
      .forEach(([cat, amt]) => {
        lines.push(`"${cat}",${amt.toFixed(2)}`);
      });
    lines.push(`Total Expenses,${expenses.total.toFixed(2)}`);
  }
  lines.push('');
  lines.push(`Platform Fees (Absorbed),${data.totalPlatformFees.toFixed(2)}`);
  lines.push(`Total Costs,${(data.totalCOGS + data.totalPlatformFees + expenses.total).toFixed(2)}`);
  lines.push('');

  lines.push('PROFIT');
  lines.push(`Net Profit,${data.netProfit.toFixed(2)}`);
  if (data.totalSubtotal > 0) {
    lines.push(`Margin,${((data.netProfit / data.totalSubtotal) * 100).toFixed(1)}%`);
  }
  lines.push('');

  lines.push('PAYMENT METHODS');
  lines.push('Method,Count,Total');
  Object.entries(data.paymentBreakdown).forEach(([method, d]) => {
    lines.push(`"${paymentMethodLabels[method] || method}",${d.count},${d.total.toFixed(2)}`);
  });
  lines.push('');

  lines.push('MONTHLY BREAKDOWN');
  lines.push('Month,Revenue,Costs,Profit,Sales');
  data.monthlyBreakdown.forEach((m) => {
    lines.push(`"${m.month}",${m.revenue.toFixed(2)},${m.costs.toFixed(2)},${m.profit.toFixed(2)},${m.salesCount}`);
  });

  const csv = lines.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

// ————————————————————————————————————————————————
// Component
// ————————————————————————————————————————————————

export default function ReportsPage() {
  const { tenant, can } = useTenant();
  const router = useRouter();

  // Permission guard
  useEffect(() => {
    if (!can('reports:view')) {
      router.push('/dashboard');
    }
  }, [can, router]);

  const supabase = createClient();
  const [activeTab, setActiveTab] = useState<ReportsTab>('overview');

  // Overview state
  const [datePreset, setDatePreset] = useState<DatePreset>('ytd');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [loading, setLoading] = useState(true);
  const [sales, setSales] = useState<(Sale & { sale_items: SaleItem[] })[]>([]);
  const [boothFeeMap, setBoothFeeMap] = useState<Map<string, number>>(new Map());
  const [refunds, setRefunds] = useState<Refund[]>([]);
  const [expenseTotals, setExpenseTotals] = useState<ExpenseTotals>({ total: 0, byCategory: {} });

  // Events tab state
  const [events, setEvents] = useState<Event[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);

  const currentYear = new Date().getFullYear();

  // ——— SUBSCRIPTION GATING ———
  const effectiveTier = getEffectiveTier(tenant);
  const isFullReports = effectiveTier === 'pro' || effectiveTier === 'business';

  // Compute date range
  const dateRange = useMemo(() => {
    if (datePreset === 'custom' && customStart && customEnd) {
      return { start: new Date(customStart), end: new Date(customEnd + 'T23:59:59') };
    }
    return getDateRange(datePreset, currentYear);
  }, [datePreset, customStart, customEnd, currentYear]);

  const dateLabel = useMemo(() => {
    if (datePreset === 'custom' && customStart && customEnd) {
      return `${format(new Date(customStart), 'MMM d, yyyy')} – ${format(new Date(customEnd), 'MMM d, yyyy')}`;
    }
    const labels: Record<DatePreset, string> = {
      ytd: `Year to Date (${currentYear})`,
      q1: `Q1 ${currentYear}`,
      q2: `Q2 ${currentYear}`,
      q3: `Q3 ${currentYear}`,
      q4: `Q4 ${currentYear}`,
      this_month: format(new Date(), 'MMMM yyyy'),
      last_month: format(subMonths(new Date(), 1), 'MMMM yyyy'),
      last_3: 'Last 3 Months',
      custom: 'Custom Range',
    };
    return labels[datePreset];
  }, [datePreset, customStart, customEnd, currentYear]);

  const sourceLabel = sourceFilter === 'all' ? 'All Sales' : sourceFilter === 'events' ? 'Events Only' : 'Store Only';

  // Load sales data
  useEffect(() => {
    if (!tenant) return;
    loadData();
  }, [tenant, dateRange, sourceFilter]);

  const loadData = async () => {
    if (!tenant) return;
    setLoading(true);

    // NOTE: fee_handling is included via the * wildcard on sales
    let query = supabase
      .from('sales')
      .select('*, sale_items(*)')
      .eq('tenant_id', tenant.id)
      .eq('status', 'completed')
      .gte('created_at', dateRange.start.toISOString())
      .lte('created_at', dateRange.end.toISOString())
      .order('created_at', { ascending: true });

    if (sourceFilter === 'events') {
      query = query.not('event_id', 'is', null);
    } else if (sourceFilter === 'store') {
      query = query.is('event_id', null);
    }

    const [salesRes, eventsRes, refundsRes] = await Promise.all([
      query,
      supabase.from('events').select('id, booth_fee').eq('tenant_id', tenant.id),
      supabase.from('refunds')
        .select('*')
        .eq('tenant_id', tenant.id)
        .gte('created_at', dateRange.start.toISOString())
        .lte('created_at', dateRange.end.toISOString()),
    ]);

    const bm = new Map<string, number>();
    (eventsRes.data || []).forEach((ev: any) => {
      bm.set(ev.id, Number(ev.booth_fee) || 0);
    });
    setBoothFeeMap(bm);

    setSales((salesRes.data || []) as (Sale & { sale_items: SaleItem[] })[]);
    setRefunds((refundsRes.data || []) as Refund[]);
    setLoading(false);
  };

  // Load events list for events tab
  useEffect(() => {
    if (!tenant || activeTab !== 'events') return;
    setEventsLoading(true);
    supabase
      .from('events')
      .select('*')
      .eq('tenant_id', tenant.id)
      .order('start_time', { ascending: false })
      .then(({ data }) => {
        setEvents((data || []) as Event[]);
        setEventsLoading(false);
      });
  }, [tenant, activeTab]);

  // ============================================================
  // Aggregate overview data — WITH FINANCIAL ACCURACY FIXES
  // ============================================================
  const aggregated: AggregatedData = useMemo(() => {
    let totalSubtotal = 0;
    let totalTax = 0;
    let totalTips = 0;
    let totalPlatformFees = 0; // Only absorbed fees
    let totalDiscounts = 0;
    let totalChainCost = 0;
    let totalJumpRingCost = 0;
    const paymentBreakdown: Record<string, { count: number; total: number }> = {};
    const monthBuckets = new Map<string, { revenue: number; costs: number; profit: number; salesCount: number }>();

    for (const sale of sales) {
      const sub = Number(sale.subtotal);
      const tax = Number(sale.tax_amount);
      const tip = Number(sale.tip_amount);
      const disc = Number(sale.discount_amount);

      totalSubtotal += sub;
      totalTax += tax;
      totalTips += tip;
      totalDiscounts += disc;

      // FIX: Only count platform fees as cost when artist absorbed them
      const feeHandling = (sale as any).fee_handling;
      const feeAmount = Number(sale.platform_fee_amount) || 0;
      if (feeHandling === 'absorb' || feeHandling === null) {
        totalPlatformFees += feeAmount;
      }

      // FIX: COGS from snapshotted sale_items (not inventory lookup)
      let saleCOGS = 0;
      for (const item of (sale.sale_items || [])) {
        const chainCost = Number((item as any).chain_material_cost) || 0;
        const jrCost = Number((item as any).jump_ring_cost) || 0;
        totalChainCost += chainCost;
        totalJumpRingCost += jrCost;
        saleCOGS += chainCost + jrCost;
      }

      // FIX: Revenue = subtotal + tax + tip (not sale.total, which includes pass-through fees)
      const saleRevenue = sub + tax + tip;

      // Payment breakdown
      const pm = sale.payment_method;
      if (!paymentBreakdown[pm]) paymentBreakdown[pm] = { count: 0, total: 0 };
      paymentBreakdown[pm].count++;
      paymentBreakdown[pm].total += saleRevenue;

      // Monthly breakdown — only absorbed fees in costs
      const monthKey = format(new Date(sale.created_at), 'yyyy-MM');
      const absorbedFee = (feeHandling === 'absorb' || feeHandling === null) ? feeAmount : 0;
      const saleCosts = saleCOGS + absorbedFee;
      const saleProfit = sub - saleCOGS - absorbedFee;
      const existing = monthBuckets.get(monthKey);
      if (existing) {
        existing.revenue += saleRevenue;
        existing.costs += saleCosts;
        existing.profit += saleProfit;
        existing.salesCount++;
      } else {
        monthBuckets.set(monthKey, { revenue: saleRevenue, costs: saleCosts, profit: saleProfit, salesCount: 1 });
      }
    }

    // FIX: Revenue = subtotal + tax + tip
    const totalRevenue = totalSubtotal + totalTax + totalTips;
    const totalCOGS = totalChainCost + totalJumpRingCost;

    // Refunds total (based on refund period, not sale date)
    const totalRefunds = refunds.reduce((sum, r) => sum + Number(r.amount), 0);
    const netRevenue = totalRevenue - totalRefunds;

    // Net profit includes refunds and expenses
    const netProfit = totalSubtotal - totalRefunds - totalCOGS - totalPlatformFees - expenseTotals.total;
    const salesCount = sales.length;
    const avgSaleValue = salesCount > 0 ? totalRevenue / salesCount : 0;

    const monthlyBreakdown = Array.from(monthBuckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, data]) => ({
        month: format(new Date(key + '-01'), 'MMM yyyy'),
        ...data,
      }));

    return {
      totalRevenue, totalSubtotal, totalTax, totalTips, totalPlatformFees,
      totalDiscounts, totalCOGS, totalChainCost, totalJumpRingCost,
      totalRefunds, netRevenue,
      salesCount, avgSaleValue, netProfit,
      paymentBreakdown, monthlyBreakdown,
    };
  }, [sales, refunds, expenseTotals]);

  // ============================================================
  // Build event summaries for events tab — WITH FIXES
  // ============================================================
  const eventSummaries: EventSummary[] = useMemo(() => {
    if (activeTab !== 'events') return [];

    return events.map((ev) => {
      const eventSales = sales.filter((s) => s.event_id === ev.id);

      let subtotal = 0;
      let revenue = 0;
      let cogs = 0;
      let absorbedFees = 0;

      for (const sale of eventSales) {
        const sub = Number(sale.subtotal);
        subtotal += sub;
        // Revenue for display = subtotal + tax + tip
        revenue += sub + Number(sale.tax_amount) + Number(sale.tip_amount);

        // FIX: Only count absorbed platform fees
        const feeHandling = (sale as any).fee_handling;
        const feeAmount = Number(sale.platform_fee_amount) || 0;
        if (feeHandling === 'absorb' || feeHandling === null) {
          absorbedFees += feeAmount;
        }

        // FIX: COGS from snapshotted sale_items
        for (const item of (sale.sale_items || [])) {
          cogs += (Number((item as any).chain_material_cost) || 0) + (Number((item as any).jump_ring_cost) || 0);
        }
      }

      const boothFee = boothFeeMap.get(ev.id) || 0;
      const costs = cogs + boothFee + absorbedFees;

      return {
        id: ev.id,
        name: ev.name,
        date: ev.start_time,
        location: ev.location || null,
        salesCount: eventSales.length,
        revenue,
        costs,
        profit: subtotal - cogs - boothFee - absorbedFees,
      };
    }).filter((ev) => ev.salesCount > 0 || new Date(ev.date) >= dateRange.start);
  }, [events, sales, boothFeeMap, activeTab, dateRange]);

  if (!tenant) {
    return <div className="text-text-tertiary py-12 text-center">Loading…</div>;
  }

  // ================================================================
  // STARTER TIER — Basic stats only
  // ================================================================
  if (!isFullReports) {
    return (
      <div className="space-y-6 max-w-4xl">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Reports</h1>
          <p className="text-text-tertiary text-sm mt-1">Track your business performance.</p>
        </div>

        {loading ? (
          <div className="py-16 text-center">
            <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-accent-500 border-t-transparent" />
            <p className="text-text-tertiary mt-3 text-sm">Loading…</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <KPICard label="Total Sales" value={aggregated.salesCount.toString()} />
            <KPICard label="Total Revenue" value={money(aggregated.totalRevenue)} />
            <KPICard
              label="Today's Sales"
              value={money(
                sales
                  .filter((s) => {
                    const saleDate = new Date(s.created_at);
                    const today = new Date();
                    return (
                      saleDate.getFullYear() === today.getFullYear() &&
                      saleDate.getMonth() === today.getMonth() &&
                      saleDate.getDate() === today.getDate()
                    );
                  })
                  .reduce((sum, s) => sum + Number(s.total), 0)
              )}
            />
          </div>
        )}

        <UpgradePrompt
          feature="Full Business Reports"
          description="Unlock date range filtering, event-level P&L, cost breakdowns, monthly trends, payment method analysis, and CSV export."
          variant="inline"
        />
      </div>
    );
  }

  // ================================================================
  // PRO / BUSINESS — Full reports
  // ================================================================
  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Reports</h1>
          <p className="text-text-tertiary text-sm mt-1">Track your business performance over time.</p>
        </div>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 p-1 bg-[var(--surface-subtle)] rounded-lg w-fit">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'overview'
              ? 'bg-[var(--surface-base)] text-[var(--text-primary)] shadow-sm'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          Overview
        </button>
        <button
          onClick={() => setActiveTab('events')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'events'
              ? 'bg-[var(--surface-base)] text-[var(--text-primary)] shadow-sm'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          Events
        </button>
      </div>

      {/* ================================================================ */}
      {/* Overview Tab                                                      */}
      {/* ================================================================ */}
      {activeTab === 'overview' && (
        <div className="space-y-6">

          {/* Filters */}
          <Card>
            <CardContent className="px-5 py-4 space-y-4">
              {/* Date presets */}
              <div>
                <label className="block text-xs font-medium text-text-tertiary uppercase tracking-wide mb-2">Period</label>
                <div className="flex flex-wrap gap-2">
                  {([
                    ['ytd', 'YTD'],
                    ['this_month', 'This Month'],
                    ['last_month', 'Last Month'],
                    ['last_3', 'Last 3 Mo'],
                    ['q1', 'Q1'],
                    ['q2', 'Q2'],
                    ['q3', 'Q3'],
                    ['q4', 'Q4'],
                    ['custom', 'Custom'],
                  ] as [DatePreset, string][]).map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => setDatePreset(key)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        datePreset === key
                          ? 'bg-accent-500 text-white'
                          : 'bg-[var(--surface-raised)] text-text-secondary hover:text-text-primary hover:bg-[var(--surface-subtle)]'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom date inputs */}
              {datePreset === 'custom' && (
                <div className="flex gap-3 items-end">
                  <div className="flex-1">
                    <Input
                      label="From"
                      type="date"
                      value={customStart}
                      onChange={(e) => setCustomStart(e.target.value)}
                    />
                  </div>
                  <div className="flex-1">
                    <Input
                      label="To"
                      type="date"
                      value={customEnd}
                      onChange={(e) => setCustomEnd(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {/* Source filter */}
              <div>
                <label className="block text-xs font-medium text-text-tertiary uppercase tracking-wide mb-2">Source</label>
                <div className="flex gap-2">
                  {([
                    ['all', 'All Sales'],
                    ['events', 'Events'],
                    ['store', 'Store'],
                  ] as [SourceFilter, string][]).map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => setSourceFilter(key)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        sourceFilter === key
                          ? 'bg-accent-500 text-white'
                          : 'bg-[var(--surface-raised)] text-text-secondary hover:text-text-primary hover:bg-[var(--surface-subtle)]'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {loading ? (
            <div className="py-16 text-center">
              <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-accent-500 border-t-transparent" />
              <p className="text-text-tertiary mt-3 text-sm">Crunching numbers…</p>
            </div>
          ) : (
            <>
              {/* Period header with export */}
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-text-primary">{dateLabel}</h2>
                  <p className="text-sm text-text-tertiary">{sourceLabel} · {aggregated.salesCount} sale{aggregated.salesCount !== 1 ? 's' : ''}</p>
                </div>
                <Button variant="secondary" size="sm" onClick={() => exportOverviewCSV(aggregated, dateLabel, sourceLabel, expenseTotals)}>
                  <span className="flex items-center gap-1.5">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                    </svg>
                    Export
                  </span>
                </Button>
              </div>

              {/* KPI Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <KPICard label="Net Profit" value={money(aggregated.netProfit)} tone={aggregated.netProfit >= 0 ? 'positive' : 'negative'} />
                <KPICard label="Revenue" value={money(aggregated.totalRevenue)} />
                <KPICard label="Sales" value={aggregated.salesCount.toString()} />
                <KPICard label="Avg Sale" value={money(aggregated.avgSaleValue)} />
              </div>

              {/* Revenue & Cost Breakdown */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader><CardTitle>Revenue</CardTitle></CardHeader>
                  <CardContent className="space-y-0">
                    <ReportRow label="Gross Revenue" value={money(aggregated.totalRevenue)} />
                    <div className="ml-4 mb-1">
                      <div className="flex items-center justify-between py-1">
                        <span className="text-xs text-text-tertiary">Product revenue</span>
                        <span className="text-xs text-text-tertiary">{money(aggregated.totalSubtotal)}</span>
                      </div>
                      <div className="flex items-center justify-between py-1">
                        <span className="text-xs text-text-tertiary">Tax collected</span>
                        <span className="text-xs text-text-tertiary">{money(aggregated.totalTax)}</span>
                      </div>
                      {aggregated.totalTips > 0 && (
                        <div className="flex items-center justify-between py-1">
                          <span className="text-xs text-text-tertiary">Tips</span>
                          <span className="text-xs text-text-tertiary">{money(aggregated.totalTips)}</span>
                        </div>
                      )}
                    </div>
                    {aggregated.totalDiscounts > 0 && (
                      <ReportRow label="Discounts Given" value={money(-aggregated.totalDiscounts)} negative />
                    )}
                    {aggregated.totalRefunds > 0 && (
                      <ReportRow label="Refunds" value={money(-aggregated.totalRefunds)} negative />
                    )}
                    <div className="border-t border-[var(--border-default)] mt-1 pt-3">
                      <ReportRow label="Net Revenue" value={money(aggregated.netRevenue)} bold />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle>Costs</CardTitle></CardHeader>
                  <CardContent className="space-y-0">
                    <ReportRow label="Product Costs / COGS" value={money(aggregated.totalCOGS)} negative />

                    {/* Materials COGS Breakdown */}
                    {(aggregated.totalChainCost > 0 || aggregated.totalJumpRingCost > 0) && (
                      <div className="ml-4 mb-1">
                        {aggregated.totalChainCost > 0 && (
                          <div className="flex items-center justify-between py-1">
                            <span className="text-xs text-text-tertiary">Chain material</span>
                            <span className="text-xs text-text-tertiary">{money(aggregated.totalChainCost)}</span>
                          </div>
                        )}
                        {aggregated.totalJumpRingCost > 0 && (
                          <div className="flex items-center justify-between py-1">
                            <span className="text-xs text-text-tertiary">Jump rings</span>
                            <span className="text-xs text-text-tertiary">{money(aggregated.totalJumpRingCost)}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Expense categories */}
                    {expenseTotals.total > 0 && (
                      <>
                        {(expenseTotals.byCategory['Booth Fee'] || 0) > 0 && (
                          <ReportRow label="Booth Fees" value={money(expenseTotals.byCategory['Booth Fee'])} negative />
                        )}
                        {(() => {
                          const supplies = (expenseTotals.byCategory['Supplies'] || 0)
                            + (expenseTotals.byCategory['Chain Restock'] || 0)
                            + (expenseTotals.byCategory['Packaging & Display'] || 0);
                          return supplies > 0 ? <ReportRow label="Supplies & Materials" value={money(supplies)} negative /> : null;
                        })()}
                        {(expenseTotals.byCategory['Travel & Gas'] || 0) > 0 && (
                          <ReportRow label="Travel" value={money(expenseTotals.byCategory['Travel & Gas'])} negative />
                        )}
                        {(expenseTotals.byCategory['Marketing & Advertising'] || 0) > 0 && (
                          <ReportRow label="Marketing" value={money(expenseTotals.byCategory['Marketing & Advertising'])} negative />
                        )}
                        {(() => {
                          const knownCats = ['Booth Fee', 'Supplies', 'Chain Restock', 'Packaging & Display', 'Travel & Gas', 'Marketing & Advertising'];
                          const otherExpenses = Object.entries(expenseTotals.byCategory)
                            .filter(([cat]) => !knownCats.includes(cat))
                            .reduce((sum, [, amt]) => sum + amt, 0);
                          return otherExpenses > 0 ? <ReportRow label="Other Expenses" value={money(otherExpenses)} negative /> : null;
                        })()}
                      </>
                    )}

                    <ReportRow label="Platform Fees" value={money(aggregated.totalPlatformFees)} negative />
                    <div className="border-t border-[var(--border-default)] mt-1 pt-3">
                      <ReportRow label="Total Costs" value={money(aggregated.totalCOGS + aggregated.totalPlatformFees + expenseTotals.total)} bold negative />
                    </div>
                    <div className="border-t border-[var(--border-default)] mt-1 pt-4">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-text-primary">Net Profit</span>
                        <span className={`text-xl font-semibold ${aggregated.netProfit >= 0 ? 'text-success-600' : 'text-error-500'}`}>
                          {money(aggregated.netProfit)}
                        </span>
                      </div>
                      {aggregated.totalSubtotal > 0 && (
                        <p className="text-xs text-text-tertiary mt-1 text-right">
                          {((aggregated.netProfit / aggregated.totalSubtotal) * 100).toFixed(1)}% margin
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Payment Methods */}
              <Card>
                <CardHeader><CardTitle>Payment Methods</CardTitle></CardHeader>
                <CardContent className="space-y-0">
                  {Object.entries(aggregated.paymentBreakdown).map(([method, data]) => (
                    <div key={method} className="flex items-center justify-between py-2.5 border-b border-[var(--border-subtle)] last:border-b-0">
                      <div className="flex items-center gap-2.5">
                        <span className="text-sm text-text-primary">{paymentMethodLabels[method] || method}</span>
                        <span className="text-xs text-text-tertiary">{data.count} sale{data.count !== 1 ? 's' : ''}</span>
                      </div>
                      <span className="text-sm font-medium text-text-primary">{money(data.total)}</span>
                    </div>
                  ))}
                  {Object.keys(aggregated.paymentBreakdown).length === 0 && (
                    <p className="text-text-tertiary text-center py-6 text-sm">No sales in this period</p>
                  )}
                </CardContent>
              </Card>

              {/* Expenses */}
              <ExpensesSection
                tenantId={tenant.id}
                startDate={format(dateRange.start, 'yyyy-MM-dd')}
                endDate={format(dateRange.end, 'yyyy-MM-dd')}
                onTotalsReady={setExpenseTotals}
              />

              {/* Monthly Breakdown */}
              {aggregated.monthlyBreakdown.length > 1 && (
                <Card>
                  <CardHeader><CardTitle>Monthly Breakdown</CardTitle></CardHeader>
                  <CardContent className="space-y-0">
                    {aggregated.monthlyBreakdown.map((m) => (
                      <div key={m.month} className="flex items-center justify-between py-3 border-b border-[var(--border-subtle)] last:border-b-0">
                        <div>
                          <p className="text-sm font-medium text-text-primary">{m.month}</p>
                          <p className="text-xs text-text-tertiary">{m.salesCount} sale{m.salesCount !== 1 ? 's' : ''}</p>
                        </div>
                        <div className="text-right">
                          <p className={`text-sm font-semibold ${m.profit >= 0 ? 'text-success-600' : 'text-error-500'}`}>
                            {money(m.profit)}
                          </p>
                          <p className="text-xs text-text-tertiary">{money(m.revenue)} rev</p>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      )}

      {/* ================================================================ */}
      {/* Events Tab                                                        */}
      {/* ================================================================ */}
      {activeTab === 'events' && (
        <div className="space-y-4">
          <p className="text-sm text-text-secondary">
            Click any event to see the detailed breakdown.
          </p>

          {eventsLoading ? (
            <div className="py-16 text-center">
              <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-accent-500 border-t-transparent" />
              <p className="text-text-tertiary mt-3 text-sm">Loading events…</p>
            </div>
          ) : events.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-text-tertiary">No events yet.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {events.map((ev) => {
                const summary = eventSummaries.find((s) => s.id === ev.id);
                const salesCount = summary?.salesCount || 0;
                const revenue = summary?.revenue || 0;
                const profit = summary?.profit || 0;

                return (
                  <Card
                    key={ev.id}
                    className="cursor-pointer hover:border-[var(--accent-primary)] transition-colors"
                    onClick={() => router.push(`/dashboard/reports/event?eventId=${ev.id}`)}
                  >
                    <CardContent className="px-5 py-4">
                      <div className="flex items-center justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-text-primary truncate">{ev.name}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-text-tertiary">
                              {format(new Date(ev.start_time), 'MMM d, yyyy')}
                            </span>
                            {ev.location && (
                              <>
                                <span className="text-xs text-text-tertiary">·</span>
                                <span className="text-xs text-text-tertiary truncate">{ev.location}</span>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          {salesCount > 0 ? (
                            <>
                              <p className={`text-sm font-semibold ${profit >= 0 ? 'text-success-600' : 'text-error-500'}`}>
                                {money(profit)}
                              </p>
                              <p className="text-xs text-text-tertiary">{salesCount} sale{salesCount !== 1 ? 's' : ''}</p>
                            </>
                          ) : (
                            <Badge variant="default" size="sm">No sales</Badge>
                          )}
                        </div>
                        <svg className="w-4 h-4 text-text-tertiary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                        </svg>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      <SunnyTutorial
        pageKey="reports"
        tips={[
          { title: 'Revenue vs profit', body: 'Revenue is your total sales. Profit subtracts material costs, booth fees, and platform fees. Check both to understand your margins.' },
          { title: 'Compare events', body: 'Switch to the Events tab to see performance by event. Compare revenue, average sale, and profit across different markets.' },
        ]}
      />
    </div>
  );
}

// ————————————————————————————————————————————————
// Sub-components
// ————————————————————————————————————————————————

function KPICard({ label, value, tone }: { label: string; value: string; tone?: 'positive' | 'negative' }) {
  let valueColor = 'text-text-primary';
  if (tone === 'positive') valueColor = 'text-success-600';
  if (tone === 'negative') valueColor = 'text-error-500';

  return (
    <Card>
      <CardContent className="px-5 py-4">
        <p className="text-xs text-text-tertiary uppercase tracking-wide font-medium mb-1">{label}</p>
        <p className={`text-2xl font-semibold tracking-tight ${valueColor}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

function ReportRow({ label, value, negative, subtle, bold }: {
  label: string; value: string; negative?: boolean; subtle?: boolean; bold?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className={`text-sm ${bold ? 'font-semibold text-text-primary' : subtle ? 'text-text-tertiary' : 'text-text-secondary'}`}>{label}</span>
      <span className={`text-sm ${bold ? 'font-semibold text-text-primary' : negative ? 'text-error-500' : subtle ? 'text-text-tertiary' : 'text-text-primary'}`}>{value}</span>
    </div>
  );
}