// ============================================================================
// Event P&L Report Page — Polished for beauty professionals
// ============================================================================
// Destination: src/app/dashboard/reports/event/page.tsx (REPLACES existing)
// FIXED: Platform fee bug (only count absorbed fees as costs)
// FIXED: Revenue uses subtotal+tax+tip (not sale.total)
// FIXED: COGS uses snapshotted chain_material_cost + jump_ring_cost from sale_items
// ADDED: Materials COGS breakdown display (chain material + jump rings)
// FIXED: CSV export with corrected calculations + COGS columns
// ============================================================================

'use client';

import { useEffect, useState, Suspense } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useTenant } from '@/hooks/use-tenant';
import { format } from 'date-fns';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Badge,
} from '@/components/ui';
import type { Event, Sale, SaleItem, Refund } from '@/types';
import ExpensesSection from '@/components/reports/ExpensesSection';
import type { ExpenseTotals } from '@/components/reports/ExpensesSection';

// ————————————————————————————————————————————————
// Types
// ————————————————————————————————————————————————

interface EventPL {
  event: Event;
  sales: (Sale & { sale_items: SaleItem[] })[];
  totalRevenue: number;
  totalSubtotal: number;
  totalTax: number;
  totalTips: number;
  totalPlatformFees: number;
  totalDiscounts: number;
  totalRefunds: number;
  netRevenue: number;
  boothFee: number;
  costOfGoods: number;
  chainMaterialCost: number;
  jumpRingCost: number;
  netProfit: number;
  salesCount: number;
  avgSaleValue: number;
  paymentBreakdown: Record<string, { count: number; total: number }>;
  topItems: { name: string; quantity: number; revenue: number }[];
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

// ————————————————————————————————————————————————
// CSV Export — FIXED
// ————————————————————————————————————————————————

function exportCSV(report: EventPL, expenses: ExpenseTotals, cashDrawer?: { opening: number; sales: number; tips: number; payIns: number; payOuts: number; expected: number; counted: number | null; overShort: number | null } | null) {
  const eventName = report.event.name.replace(/[^a-zA-Z0-9 ]/g, '');
  const eventDate = format(new Date(report.event.start_time), 'yyyy-MM-dd');
  const filename = `${eventName} - PL Report - ${eventDate}.csv`;

  const lines: string[] = [];

  // Header
  lines.push('Event P&L Report');
  lines.push(`Event,"${report.event.name}"`);
  lines.push(`Date,"${format(new Date(report.event.start_time), 'EEEE, MMMM d, yyyy')}"`);
  if (report.event.location) lines.push(`Location,"${report.event.location}"`);
  lines.push('');

  // Summary
  lines.push('SUMMARY');
  lines.push(`Total Sales,${report.salesCount}`);
  lines.push(`Average Sale,${report.avgSaleValue.toFixed(2)}`);
  lines.push('');

  // Revenue
  lines.push('REVENUE');
  lines.push(`Gross Revenue,${report.totalRevenue.toFixed(2)}`);
  lines.push(`Product Revenue,${report.totalSubtotal.toFixed(2)}`);
  lines.push(`Tax Collected,${report.totalTax.toFixed(2)}`);
  lines.push(`Tips,${report.totalTips.toFixed(2)}`);
  if (report.totalDiscounts > 0) lines.push(`Discounts Given,-${report.totalDiscounts.toFixed(2)}`);
  if (report.totalRefunds > 0) lines.push(`Refunds,-${report.totalRefunds.toFixed(2)}`);
  lines.push(`Net Revenue,${report.netRevenue.toFixed(2)}`);
  lines.push('');

  // Costs
  lines.push('COSTS');
  if (report.chainMaterialCost > 0) lines.push(`Chain Material,${report.chainMaterialCost.toFixed(2)}`);
  if (report.jumpRingCost > 0) lines.push(`Jump Rings,${report.jumpRingCost.toFixed(2)}`);
  lines.push(`Total COGS,${report.costOfGoods.toFixed(2)}`);
  lines.push(`Booth Fee,${report.boothFee.toFixed(2)}`);
  if (expenses.total > 0) {
    lines.push(`Other Expenses,${expenses.total.toFixed(2)}`);
  }
  lines.push(`Platform Fees (Absorbed),${report.totalPlatformFees.toFixed(2)}`);
  lines.push(`Total Costs,${(report.costOfGoods + report.boothFee + report.totalPlatformFees + expenses.total).toFixed(2)}`);
  lines.push('');

  // Profit
  lines.push('PROFIT');
  lines.push(`Net Profit,${report.netProfit.toFixed(2)}`);
  if (report.totalSubtotal > 0) {
    lines.push(`Margin,${((report.netProfit / report.totalSubtotal) * 100).toFixed(1)}%`);
  }
  lines.push('');

  // Payment methods
  lines.push('PAYMENT METHODS');
  lines.push('Method,Count,Total');
  Object.entries(report.paymentBreakdown).forEach(([method, data]) => {
    lines.push(`"${paymentMethodLabels[method] || method}",${data.count},${data.total.toFixed(2)}`);
  });
  lines.push('');

  // Cash drawer
  if (cashDrawer) {
    lines.push('CASH DRAWER');
    lines.push(`Opening Balance,${cashDrawer.opening.toFixed(2)}`);
    lines.push(`Cash Sales,${cashDrawer.sales.toFixed(2)}`);
    lines.push(`Cash Tips,${cashDrawer.tips.toFixed(2)}`);
    lines.push(`Pay Ins,${cashDrawer.payIns.toFixed(2)}`);
    lines.push(`Pay Outs,${cashDrawer.payOuts.toFixed(2)}`);
    lines.push(`Expected,${cashDrawer.expected.toFixed(2)}`);
    if (cashDrawer.counted != null) lines.push(`Counted,${cashDrawer.counted.toFixed(2)}`);
    if (cashDrawer.overShort != null) lines.push(`Over/Short,${cashDrawer.overShort.toFixed(2)}`);
    lines.push('');
  }

  // Top items
  lines.push('TOP ITEMS');
  lines.push('Item,Quantity,Revenue');
  report.topItems.forEach((item) => {
    lines.push(`"${item.name}",${item.quantity},${item.revenue.toFixed(2)}`);
  });
  lines.push('');

  // Individual sales — FIXED: include chain_material_cost and jump_ring_cost
  lines.push('INDIVIDUAL SALES');
  lines.push('Sale #,Time,Items,Payment Method,Subtotal,Tax,Tip,Platform Fee,Fee Type,Chain Cost,JR Cost,Total');
  report.sales.forEach((sale, idx) => {
    const items = (sale.sale_items || []).map((i) => i.name).join('; ') || '–';
    const feeHandling = (sale as any).fee_handling || 'absorb';
    const saleChainCost = (sale.sale_items || []).reduce((s, i) => s + (Number((i as any).chain_material_cost) || 0), 0);
    const saleJRCost = (sale.sale_items || []).reduce((s, i) => s + (Number((i as any).jump_ring_cost) || 0), 0);
    lines.push([
      idx + 1,
      `"${format(new Date(sale.created_at), 'h:mm a')}"`,
      `"${items}"`,
      `"${paymentMethodLabels[sale.payment_method] || sale.payment_method}"`,
      Number(sale.subtotal).toFixed(2),
      Number(sale.tax_amount).toFixed(2),
      Number(sale.tip_amount).toFixed(2),
      Number(sale.platform_fee_amount).toFixed(2),
      feeHandling,
      saleChainCost.toFixed(2),
      saleJRCost.toFixed(2),
      Number(sale.total).toFixed(2),
    ].join(','));
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

function EventPLReportPage() {
  const { tenant, can } = useTenant();
  const params = useSearchParams();
  const router = useRouter();
  const eventId = params.get('eventId');

  // Permission guard
  useEffect(() => {
    if (!can('reports:view')) {
      router.push('/dashboard');
    }
  }, [can, router]);

  const [report, setReport] = useState<EventPL | null>(null);
  const [loading, setLoading] = useState(true);
  const [allEvents, setAllEvents] = useState<Event[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(eventId);
  const [expenseTotals, setExpenseTotals] = useState<ExpenseTotals>({ total: 0, byCategory: {} });
  const [cashDrawerSummary, setCashDrawerSummary] = useState<{
    opening: number; sales: number; tips: number; payIns: number; payOuts: number;
    expected: number; counted: number | null; overShort: number | null; drawerCount: number;
  } | null>(null);
  useEffect(() => {
   if (eventId && eventId !== selectedEventId) {setSelectedEventId(eventId);}
   }, [eventId]);

  const supabase = createClient();

  // Load events list
  useEffect(() => {
    if (!tenant) return;
    supabase
      .from('events')
      .select('*')
      .eq('tenant_id', tenant.id)
      .order('start_time', { ascending: false })
      .then(({ data }) => {
        setAllEvents((data || []) as Event[]);
        if (!eventId && !selectedEventId && data && data.length > 0) {
          setSelectedEventId(data[0].id);
        }
      });
  }, [tenant]);

  // Load P&L data (re-compute when expenses change)
  useEffect(() => {
    if (!tenant || !selectedEventId) return;
    loadReport(selectedEventId);
  }, [tenant, selectedEventId, expenseTotals]);

  // ============================================================
  // Load & compute report — WITH FINANCIAL ACCURACY FIXES
  // ============================================================
  const loadReport = async (evId: string) => {
    if (!tenant) return;
    setLoading(true);

    // NOTE: fee_handling included via * wildcard. sale_items includes chain_material_cost and jump_ring_cost
    const [eventRes, salesRes, refundsRes] = await Promise.all([
      supabase.from('events').select('*').eq('id', evId).single(),
      supabase
        .from('sales')
        .select('*, sale_items(*)')
        .eq('event_id', evId)
        .eq('status', 'completed')
        .in('payment_status', ['completed'])
        .order('created_at', { ascending: true }),
      supabase.from('refunds').select('*, sale:sales!inner(event_id)')
        .eq('tenant_id', tenant.id)
        .eq('sale.event_id', evId),
    ]);

    if (!eventRes.data) { setLoading(false); return; }

    const event = eventRes.data as Event;
    const sales = (salesRes.data || []) as (Sale & { sale_items: SaleItem[] })[];
    const eventRefunds = (refundsRes.data || []) as any[];
    const totalRefunds = eventRefunds.reduce((sum: number, r: any) => sum + Number(r.amount), 0);

    let totalSubtotal = 0;
    let totalTax = 0;
    let totalTips = 0;
    let totalPlatformFees = 0; // Only absorbed fees
    let totalDiscounts = 0;
    let chainMaterialCost = 0;
    let jumpRingCost = 0;
    const paymentBreakdown: Record<string, { count: number; total: number }> = {};
    const itemMap = new Map<string, { name: string; quantity: number; revenue: number }>();

    for (const sale of sales) {
      const sub = Number(sale.subtotal);
      const tax = Number(sale.tax_amount);
      const tip = Number(sale.tip_amount);

      totalSubtotal += sub;
      totalTax += tax;
      totalTips += tip;
      totalDiscounts += Number(sale.discount_amount);

      // FIX: Only count platform fees as cost when artist absorbed them
      const feeHandling = (sale as any).fee_handling;
      const feeAmount = Number(sale.platform_fee_amount) || 0;
      if (feeHandling === 'absorb' || feeHandling === null) {
        totalPlatformFees += feeAmount;
      }

      // FIX: Revenue for payment breakdown = subtotal + tax + tip
      const saleRevenue = sub + tax + tip;
      const pm = sale.payment_method;
      if (!paymentBreakdown[pm]) paymentBreakdown[pm] = { count: 0, total: 0 };
      paymentBreakdown[pm].count++;
      paymentBreakdown[pm].total += saleRevenue;

      // FIX: COGS from snapshotted sale_items (not inventory lookup)
      for (const item of (sale.sale_items || [])) {
        const qty = Number(item.quantity);
        const lineTotal = Number(item.line_total);

        chainMaterialCost += Number((item as any).chain_material_cost) || 0;
        jumpRingCost += Number((item as any).jump_ring_cost) || 0;

        const key = item.name;
        const existing = itemMap.get(key);
        if (existing) {
          existing.quantity += qty;
          existing.revenue += lineTotal;
        } else {
          itemMap.set(key, { name: key, quantity: qty, revenue: lineTotal });
        }
      }
    }

    const boothFee = Number(event.booth_fee) || 0;

    // FIX: Revenue = subtotal + tax + tip (not sale.total)
    const totalRevenue = totalSubtotal + totalTax + totalTips;
    const costOfGoods = chainMaterialCost + jumpRingCost;
    const netRevenue = totalRevenue - totalRefunds;

    // Net Profit = subtotal - refunds - COGS - booth fee - absorbed platform fees - expenses
    const netProfit = totalSubtotal - totalRefunds - costOfGoods - boothFee - totalPlatformFees - expenseTotals.total;
    const salesCount = sales.length;
    const avgSaleValue = salesCount > 0 ? totalRevenue / salesCount : 0;

    const topItems = Array.from(itemMap.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    setReport({
      event, sales, totalRevenue, totalSubtotal, totalTax, totalTips,
      totalPlatformFees, totalDiscounts, totalRefunds, netRevenue,
      boothFee, costOfGoods,
      chainMaterialCost, jumpRingCost,
      netProfit, salesCount, avgSaleValue, paymentBreakdown, topItems,
    });

    // Fetch cash drawers for this event
    try {
      const drawersRes = await fetch(`/api/cash-drawers?event_id=${evId}`);
      const drawers = await drawersRes.json();
      if (Array.isArray(drawers) && drawers.length > 0) {
        let opening = 0, cdSales = 0, cdTips = 0, payIns = 0, payOuts = 0;
        let counted: number | null = null, overShort: number | null = null;
        for (const d of drawers) {
          opening += Number(d.opening_amount) || 0;
          if (d.closing_amount != null) counted = (counted || 0) + Number(d.closing_amount);
          if (d.difference != null) overShort = (overShort || 0) + Number(d.difference);
          // Fetch transactions for each drawer
          const txnRes = await fetch(`/api/cash-drawers/${d.id}`);
          const detail = await txnRes.json();
          for (const txn of detail.transactions || []) {
            const amt = Number(txn.amount);
            if (txn.type === 'sale') cdSales += amt;
            else if (txn.type === 'tip') cdTips += amt;
            else if (txn.type === 'pay_in') payIns += amt;
            else if (txn.type === 'pay_out') payOuts += amt;
          }
        }
        const expected = opening + cdSales + cdTips + payIns - payOuts;
        setCashDrawerSummary({ opening, sales: cdSales, tips: cdTips, payIns, payOuts, expected: Math.round(expected * 100) / 100, counted, overShort, drawerCount: drawers.length });
      } else {
        setCashDrawerSummary(null);
      }
    } catch {
      setCashDrawerSummary(null);
    }

    setLoading(false);
  };

  if (!tenant) {
    return <div className="text-text-tertiary py-12 text-center">Loading...</div>;
  }

  return (
    <div className="space-y-8 max-w-3xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Event Report</h1>
          <p className="text-text-tertiary text-sm mt-1">
            Your event at a glance — revenue, costs, and takeaways.
          </p>
        </div>
        <button
          onClick={() => router.push('/dashboard/reports')}
          className="text-sm text-[var(--accent-primary)] hover:underline"
        >
          ← All Reports
        </button>
      </div>

      {/* Event picker */}
      <Card>
        <CardContent className="px-5 py-4">
          <label className="block text-xs font-medium text-text-tertiary uppercase tracking-wide mb-2">
            Select Event
          </label>
          <select
            value={selectedEventId || ''}
            onChange={(e) => setSelectedEventId(e.target.value)}
            className="w-full h-10 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--surface-raised)] text-text-primary text-sm focus:outline-none focus:border-[var(--border-strong)] focus:ring-[3px] focus:ring-[rgba(0,0,0,0.04)]"
          >
            {allEvents.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.name} — {format(new Date(ev.start_time), 'MMM d, yyyy')}
              </option>
            ))}
          </select>
        </CardContent>
      </Card>

      {loading ? (
        <div className="py-16 text-center">
          <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-accent-500 border-t-transparent" />
          <p className="text-text-tertiary mt-3 text-sm">Crunching numbers...</p>
        </div>
      ) : !report ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-text-tertiary">No report data available.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Event info bar */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-text-primary">{report.event.name}</h2>
              <p className="text-sm text-text-tertiary">
                {format(new Date(report.event.start_time), 'EEEE, MMMM d, yyyy')}
                {report.event.location && ` · ${report.event.location}`}
              </p>
            </div>
            <Button variant="secondary" size="sm" onClick={() => exportCSV(report, expenseTotals, cashDrawerSummary)}>
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
            <KPICard
              label="Net Profit"
              value={money(report.netProfit)}
              tone={report.netProfit >= 0 ? 'positive' : 'negative'}
            />
            <KPICard label="Revenue" value={money(report.totalRevenue)} />
            <KPICard label="Sales" value={report.salesCount.toString()} />
            <KPICard label="Avg Sale" value={money(report.avgSaleValue)} />
          </div>

          {/* Revenue & Cost Breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Revenue */}
            <Card>
              <CardHeader>
                <CardTitle>Revenue</CardTitle>
              </CardHeader>
              <CardContent className="space-y-0">
                <ReportRow label="Gross Revenue" value={money(report.totalRevenue)} />
                <div className="ml-4 mb-1">
                  <div className="flex items-center justify-between py-1">
                    <span className="text-xs text-text-tertiary">Product revenue</span>
                    <span className="text-xs text-text-tertiary">{money(report.totalSubtotal)}</span>
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <span className="text-xs text-text-tertiary">Tax collected</span>
                    <span className="text-xs text-text-tertiary">{money(report.totalTax)}</span>
                  </div>
                  {report.totalTips > 0 && (
                    <div className="flex items-center justify-between py-1">
                      <span className="text-xs text-text-tertiary">Tips</span>
                      <span className="text-xs text-text-tertiary">{money(report.totalTips)}</span>
                    </div>
                  )}
                </div>
                {report.totalDiscounts > 0 && (
                  <ReportRow label="Discounts Given" value={money(-report.totalDiscounts)} negative />
                )}
                {report.totalRefunds > 0 && (
                  <ReportRow label="Refunds" value={money(-report.totalRefunds)} negative />
                )}
                <div className="border-t border-[var(--border-default)] mt-1 pt-3">
                  <ReportRow label="Net Revenue" value={money(report.netRevenue)} bold />
                </div>
              </CardContent>
            </Card>

            {/* Costs */}
            <Card>
              <CardHeader>
                <CardTitle>Costs</CardTitle>
              </CardHeader>
              <CardContent className="space-y-0">
                <ReportRow label="Cost of Goods" value={money(report.costOfGoods)} negative />

                {/* Materials COGS Breakdown */}
                {(report.chainMaterialCost > 0 || report.jumpRingCost > 0) && (
                  <div className="ml-4 mb-1">
                    {report.chainMaterialCost > 0 && (
                      <div className="flex items-center justify-between py-1">
                        <span className="text-xs text-text-tertiary">Chain material</span>
                        <span className="text-xs text-text-tertiary">{money(report.chainMaterialCost)}</span>
                      </div>
                    )}
                    {report.jumpRingCost > 0 && (
                      <div className="flex items-center justify-between py-1">
                        <span className="text-xs text-text-tertiary">Jump rings</span>
                        <span className="text-xs text-text-tertiary">{money(report.jumpRingCost)}</span>
                      </div>
                    )}
                  </div>
                )}

                <ReportRow label="Booth Fee" value={money(report.boothFee)} negative />
                {expenseTotals.total > 0 && (
                  <ReportRow label="Other Expenses" value={money(expenseTotals.total)} negative />
                )}
                <ReportRow label="Platform Fees" value={money(report.totalPlatformFees)} negative />
                <div className="border-t border-[var(--border-default)] mt-1 pt-3">
                  <ReportRow
                    label="Total Costs"
                    value={money(report.costOfGoods + report.boothFee + report.totalPlatformFees + expenseTotals.total)}
                    bold
                    negative
                  />
                </div>
                <div className="border-t border-[var(--border-default)] mt-1 pt-4">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-text-primary">Net Profit</span>
                    <span className={`text-xl font-semibold ${report.netProfit >= 0 ? 'text-success-600' : 'text-error-500'}`}>
                      {money(report.netProfit)}
                    </span>
                  </div>
                  {report.totalSubtotal > 0 && (
                    <p className="text-xs text-text-tertiary mt-1 text-right">
                      {((report.netProfit / report.totalSubtotal) * 100).toFixed(1)}% margin
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Best Sellers */}
          {report.topItems.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Best Sellers</CardTitle>
              </CardHeader>
              <CardContent className="space-y-0">
                {report.topItems.map((item, idx) => (
                  <div key={item.name} className="flex items-center justify-between py-3 border-b border-[var(--border-subtle)] last:border-b-0">
                    <div className="flex items-center gap-3">
                      <span
                        className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                        style={{ backgroundColor: 'var(--accent-primary)' }}
                      >
                        {idx + 1}
                      </span>
                      <div>
                        <p className="text-sm font-medium text-text-primary">{item.name}</p>
                        <p className="text-xs text-text-tertiary">{item.quantity} sold</p>
                      </div>
                    </div>
                    <span className="text-sm font-medium text-text-primary">{money(item.revenue)}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Payment Methods */}
          <Card>
            <CardHeader>
              <CardTitle>Payment Methods</CardTitle>
            </CardHeader>
            <CardContent className="space-y-0">
              {Object.entries(report.paymentBreakdown).map(([method, data]) => (
                <div key={method} className="flex items-center justify-between py-2.5 border-b border-[var(--border-subtle)] last:border-b-0">
                  <div className="flex items-center gap-2.5">
                    <span className="text-sm text-text-primary">{paymentMethodLabels[method] || method}</span>
                    <span className="text-xs text-text-tertiary">{data.count} sale{data.count !== 1 ? 's' : ''}</span>
                  </div>
                  <span className="text-sm font-medium text-text-primary">{money(data.total)}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Cash Drawer Summary */}
          {cashDrawerSummary && (
            <Card>
              <CardHeader>
                <CardTitle>Cash Drawer Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-0">
                {[
                  { label: 'Opening Balance', value: money(cashDrawerSummary.opening) },
                  { label: 'Cash Sales', value: money(cashDrawerSummary.sales) },
                  ...(cashDrawerSummary.tips > 0 ? [{ label: 'Cash Tips', value: money(cashDrawerSummary.tips) }] : []),
                  ...(cashDrawerSummary.payIns > 0 ? [{ label: 'Pay Ins', value: money(cashDrawerSummary.payIns) }] : []),
                  ...(cashDrawerSummary.payOuts > 0 ? [{ label: 'Pay Outs', value: `-${money(cashDrawerSummary.payOuts)}` }] : []),
                  { label: 'Expected Cash', value: money(cashDrawerSummary.expected), bold: true },
                  ...(cashDrawerSummary.counted != null ? [{ label: 'Counted Cash', value: money(cashDrawerSummary.counted) }] : []),
                  ...(cashDrawerSummary.overShort != null ? [{
                    label: cashDrawerSummary.overShort >= 0 ? 'Over' : 'Short',
                    value: `${cashDrawerSummary.overShort >= 0 ? '+' : '-'}${money(Math.abs(cashDrawerSummary.overShort))}`,
                    color: cashDrawerSummary.overShort === 0 ? 'text-emerald-600' : cashDrawerSummary.overShort > 0 ? 'text-blue-600' : 'text-red-600',
                  }] : []),
                ].map((row: any) => (
                  <div key={row.label} className="flex items-center justify-between py-2.5 border-b border-[var(--border-subtle)] last:border-b-0">
                    <span className={`text-sm ${row.bold ? 'font-semibold text-text-primary' : 'text-text-secondary'}`}>{row.label}</span>
                    <span className={`text-sm font-medium ${row.color || 'text-text-primary'}`}>{row.value}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Expenses linked to this event */}
          {report.event && (
            <ExpensesSection
              tenantId={tenant.id}
              startDate="2000-01-01"
              endDate="2099-12-31"
              eventId={report.event.id}
              onTotalsReady={setExpenseTotals}
            />
          )}

          {/* Sales Timeline */}
          {report.sales.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Sales Timeline</CardTitle>
              </CardHeader>
              <CardContent className="space-y-0">
                {report.sales.map((sale, idx) => {
                  const items = (sale.sale_items || []).map((i) => i.name).join(', ') || '–';
                  const feeHandling = (sale as any).fee_handling;
                  const feeAmount = Number(sale.platform_fee_amount) || 0;

                  return (
                    <div key={sale.id} className="flex items-start gap-3 py-3 border-b border-[var(--border-subtle)] last:border-b-0">
                      <span className="text-xs text-text-tertiary mt-0.5 w-16 shrink-0">
                        {format(new Date(sale.created_at), 'h:mm a')}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-text-primary truncate">{items}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-text-tertiary">
                            {paymentMethodLabels[sale.payment_method] || sale.payment_method}
                          </span>
                          {feeAmount > 0 && (
                            <span className={`text-xs ${feeHandling === 'pass_to_customer' ? 'text-text-tertiary' : 'text-red-400'}`}>
                              · ${feeAmount.toFixed(2)} fee{feeHandling === 'pass_to_customer' ? ' (customer)' : ''}
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="text-sm font-medium text-text-primary shrink-0">
                        {money(Number(sale.subtotal) + Number(sale.tax_amount) + Number(sale.tip_amount))}
                      </span>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}
        </>
      )}
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
export default function EventPLReportPageWrapper() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><p className="text-text-secondary">Loading...</p></div>}>
      <EventPLReportPage />
    </Suspense>
  );
}