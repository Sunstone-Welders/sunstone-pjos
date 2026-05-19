// src/app/admin/revenue/page.tsx
// Revenue analytics — subscription MRR, sales volume, breakdowns by tenant and plan tier
'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/utils';
import { toast } from 'sonner';

interface DailyTierData {
  sales_volume: number; count: number;
}

interface RevenueData {
  totals: { sales_volume: number; sales_count: number; mrr: number; revenue_per_tenant: number };
  subscribers: Record<string, number>;
  by_tier: Record<string, { sales_volume: number; count: number; subscribers: number }>;
  by_tenant: Array<{ tenant_id: string; name: string; tier: string; sales_volume: number; count: number }>;
  daily: Array<{ date: string; sales_volume: number; count: number; byTier?: Record<string, DailyTierData> }>;
}

type TimeRange = '7d' | '30d' | '90d' | 'all';

export default function AdminRevenuePage() {
  const [data, setData] = useState<RevenueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<TimeRange>('30d');
  const [accessDenied, setAccessDenied] = useState(false);

  useEffect(() => {
    // Client-side role gate
    fetch('/api/admin/check')
      .then(r => r.json())
      .then(d => {
        if (d.role === 'support' || d.role === 'viewer') {
          setAccessDenied(true);
          setLoading(false);
        } else {
          loadRevenue();
        }
      })
      .catch(() => loadRevenue());
  }, []);

  async function loadRevenue() {
    try {
      const res = await fetch('/api/admin/revenue');
      const json = await res.json();
      if (res.ok) setData(json);
    } catch {
      toast.error('Failed to load revenue data');
    } finally {
      setLoading(false);
    }
  }

  // Filter daily data by time range
  function getFilteredDaily() {
    if (!data) return [];
    if (timeRange === 'all') return data.daily;
    const days = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().substring(0, 10);
    return data.daily.filter(d => d.date >= cutoffStr);
  }

  if (accessDenied) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="text-4xl mb-4">🔒</div>
        <h1 className="text-xl font-bold text-[var(--text-primary)]" style={{ fontFamily: 'var(--font-display, Georgia)' }}>
          Access Restricted
        </h1>
        <p className="text-sm text-[var(--text-secondary)] mt-2">
          You don&apos;t have permission to view revenue data. Contact a super admin for access.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]" style={{ fontFamily: 'var(--font-display, Georgia)' }}>
          Revenue
        </h1>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-[var(--surface-raised)] rounded-xl border border-[var(--border-default)] p-6 animate-pulse">
              <div className="h-4 w-20 bg-[var(--surface-subtle)] rounded mb-3" />
              <div className="h-8 w-24 bg-[var(--surface-subtle)] rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const filteredDaily = getFilteredDaily();
  const maxDailyVolume = Math.max(...filteredDaily.map(d => d.sales_volume), 1);

  // Calculate filtered totals
  const filteredTotals = filteredDaily.reduce(
    (acc, d) => ({
      sales_volume: acc.sales_volume + d.sales_volume,
      count: acc.count + d.count,
    }),
    { sales_volume: 0, count: 0 }
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]" style={{ fontFamily: 'var(--font-display, Georgia)' }}>
          Revenue
        </h1>
        {/* Time range selector */}
        <div className="flex items-center bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-lg p-1">
          {(['7d', '30d', '90d', 'all'] as TimeRange[]).map(range => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                timeRange === range
                  ? 'bg-accent-500 text-[var(--text-on-accent)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              )}
            >
              {range === 'all' ? 'All Time' : range.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* ── Top-line Stats ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[var(--surface-raised)] rounded-xl border border-[var(--border-default)] p-6">
          <div className="text-xs font-medium text-[var(--text-secondary)] mb-1">MRR</div>
          <div className="text-2xl font-bold text-accent-600 ">
            {formatCurrency(data.totals.mrr)}
          </div>
          <div className="text-xs text-[var(--text-tertiary)] mt-1">Monthly Recurring Revenue</div>
        </div>
        <div className="bg-[var(--surface-raised)] rounded-xl border border-[var(--border-default)] p-6">
          <div className="text-xs font-medium text-[var(--text-secondary)] mb-1">Revenue per Tenant</div>
          <div className="text-2xl font-bold text-[var(--text-primary)] ">
            {formatCurrency(data.totals.revenue_per_tenant)}
          </div>
          <div className="text-xs text-[var(--text-tertiary)] mt-1">MRR / active subscribers</div>
        </div>
        <div className="bg-[var(--surface-raised)] rounded-xl border border-[var(--border-default)] p-6">
          <div className="text-xs font-medium text-[var(--text-secondary)] mb-1">Platform Sales Volume</div>
          <div className="text-2xl font-bold text-[var(--text-primary)] ">
            {formatCurrency(timeRange === 'all' ? data.totals.sales_volume : filteredTotals.sales_volume)}
          </div>
          <div className="text-xs text-[var(--text-tertiary)] mt-1">
            {timeRange === 'all' ? data.totals.sales_count : filteredTotals.count} sales
          </div>
        </div>
        <div className="bg-[var(--surface-raised)] rounded-xl border border-[var(--border-default)] p-6">
          <div className="text-xs font-medium text-[var(--text-secondary)] mb-1">Active Subscribers</div>
          <div className="text-2xl font-bold text-[var(--text-primary)] ">
            {Object.values(data.subscribers).reduce((a, b) => a + b, 0)}
          </div>
          <div className="text-xs text-[var(--text-tertiary)] mt-1">Across all tiers</div>
        </div>
      </div>

      {/* ── Daily Sales Volume Chart (simple bar chart) ── */}
      {filteredDaily.length > 0 && (
        <div className="bg-[var(--surface-raised)] rounded-xl border border-[var(--border-default)] p-6">
          <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Daily Sales Volume</h2>
          <div className="flex items-end gap-[2px] h-40 overflow-x-auto pb-2">
            {filteredDaily.map((d, i) => {
              const height = maxDailyVolume > 0 ? (d.sales_volume / maxDailyVolume) * 100 : 0;
              return (
                <div key={d.date} className="flex flex-col items-center group relative" style={{ minWidth: filteredDaily.length > 60 ? 4 : 12 }}>
                  <div
                    className="w-full bg-accent-400 rounded-t-sm hover:bg-accent-500 transition-colors cursor-default"
                    style={{ height: `${Math.max(height, 2)}%` }}
                    title={`${d.date}: ${formatCurrency(d.sales_volume)}`}
                  />
                  {/* Tooltip on hover */}
                  <div className="hidden group-hover:block absolute bottom-full mb-2 bg-[var(--surface-overlay)] text-[var(--text-primary)] text-[10px] rounded-md px-2 py-1 whitespace-nowrap z-10 pointer-events-none border border-[var(--border-default)] shadow-md">
                    {d.date}: {formatCurrency(d.sales_volume)}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-between text-[10px] text-[var(--text-tertiary)] mt-1">
            <span>{filteredDaily[0]?.date}</span>
            <span>{filteredDaily[filteredDaily.length - 1]?.date}</span>
          </div>
        </div>
      )}

      {/* ── By Plan Tier ── */}
      <div className="bg-[var(--surface-raised)] rounded-xl border border-[var(--border-default)] p-6">
        <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Activity by Plan Tier</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {(['starter', 'pro', 'business'] as const).map(tier => {
            // Compute filtered tier totals from daily data when a time range is active
            const tierData = timeRange === 'all'
              ? (data.by_tier[tier] || { sales_volume: 0, count: 0, subscribers: 0 })
              : {
                  ...filteredDaily.reduce(
                    (acc, d) => {
                      const t = d.byTier?.[tier];
                      if (!t) return acc;
                      return { sales_volume: acc.sales_volume + t.sales_volume, count: acc.count + t.count };
                    },
                    { sales_volume: 0, count: 0 }
                  ),
                  subscribers: data.by_tier[tier]?.subscribers || 0,
                };
            const tierColors: Record<string, string> = {
              starter: 'border-l-[var(--text-tertiary)]',
              pro: 'border-l-info-500',
              business: 'border-l-warning-500',
            };
            return (
              <div
                key={tier}
                className={cn('border border-[var(--border-subtle)] rounded-lg p-4 border-l-4', tierColors[tier])}
              >
                <div className="text-sm font-medium text-[var(--text-secondary)] capitalize mb-2">{tier}</div>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-[var(--text-secondary)]">Subscribers</span>
                    <span className=" font-medium text-[var(--text-primary)]">{tierData.subscribers}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--text-secondary)]">Sales Volume</span>
                    <span className=" text-[var(--text-secondary)]">{formatCurrency(tierData.sales_volume)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--text-secondary)]">Sales</span>
                    <span className=" text-[var(--text-secondary)]">{tierData.count}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Top Tenants by Sales Volume ── */}
      <div className="bg-[var(--surface-raised)] rounded-xl border border-[var(--border-default)]">
        <div className="px-6 py-4 border-b border-[var(--border-subtle)]">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Top Tenants by Sales Volume</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border-subtle)]">
                <th className="text-left text-xs font-medium text-[var(--text-secondary)] px-4 py-3">#</th>
                <th className="text-left text-xs font-medium text-[var(--text-secondary)] px-4 py-3">Tenant</th>
                <th className="text-left text-xs font-medium text-[var(--text-secondary)] px-4 py-3">Plan</th>
                <th className="text-right text-xs font-medium text-[var(--text-secondary)] px-4 py-3">Sales Volume</th>
                <th className="text-right text-xs font-medium text-[var(--text-secondary)] px-4 py-3">Sales</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {data.by_tenant.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-[var(--text-tertiary)]">
                    No sales data yet
                  </td>
                </tr>
              )}
              {data.by_tenant.slice(0, 20).map((t, i) => (
                <tr key={t.tenant_id} className="hover:bg-[var(--surface-subtle)]">
                  <td className="px-4 py-3 text-[var(--text-tertiary)] ">{i + 1}</td>
                  <td className="px-4 py-3 font-medium text-[var(--text-primary)]">{t.name}</td>
                  <td className="px-4 py-3">
                    <TierBadge tier={t.tier} />
                  </td>
                  <td className="px-4 py-3 text-right  text-accent-600 font-medium">
                    {formatCurrency(t.sales_volume)}
                  </td>
                  <td className="px-4 py-3 text-right  text-[var(--text-secondary)]">{t.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function TierBadge({ tier }: { tier: string }) {
  const styles: Record<string, string> = {
    starter: 'bg-[var(--surface-subtle)] text-[var(--text-secondary)]',
    pro: 'bg-info-50 text-info-600',
    business: 'bg-warning-50 text-warning-600',
  };
  return (
    <span className={cn('inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium', styles[tier] || styles.starter)}>
      {tier.charAt(0).toUpperCase() + tier.slice(1)}
    </span>
  );
}
