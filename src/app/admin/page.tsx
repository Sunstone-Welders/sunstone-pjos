// ============================================================================
// Admin Overview Page v2 — src/app/admin/page.tsx
// ============================================================================
// Stats cards (existing) + Platform Intelligence AI insights section (new)
// Insights load async — stat cards render immediately, insights load after
// ============================================================================

'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

interface OverviewStats {
  totalTenants: number;
  totalUsers: number;
  planBreakdown: { starter: number; pro: number; business: number };
  platformRevenue: number;
  recentSignups: Array<{ name: string; created_at: string; tier: string }>;
  activeToday: number;
}

interface Insight {
  type: 'growth' | 'attention' | 'churn_risk' | 'opportunity' | 'milestone';
  title: string;
  body: string;
}

// ============================================================================
// Helpers
// ============================================================================

const money = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function insightConfig(type: string): { color: string; border: string; bg: string; iconBg: string; label: string } {
  switch (type) {
    case 'growth':
      return { color: 'text-success-600', border: 'border-l-success-500', bg: 'bg-success-50', iconBg: 'bg-success-100', label: 'Growth' };
    case 'attention':
      return { color: 'text-warning-600', border: 'border-l-warning-500', bg: 'bg-warning-50', iconBg: 'bg-warning-100', label: 'Attention' };
    case 'churn_risk':
      return { color: 'text-error-600', border: 'border-l-error-500', bg: 'bg-error-50', iconBg: 'bg-error-100', label: 'Churn Risk' };
    case 'opportunity':
      return { color: 'text-info-600', border: 'border-l-info-500', bg: 'bg-info-50', iconBg: 'bg-info-100', label: 'Opportunity' };
    case 'milestone':
      return { color: 'text-accent-600', border: 'border-l-accent-500', bg: 'bg-accent-50', iconBg: 'bg-accent-100', label: 'Milestone' };
    default:
      return { color: 'text-[var(--text-secondary)]', border: 'border-l-[var(--text-tertiary)]', bg: 'bg-[var(--surface-subtle)]', iconBg: 'bg-[var(--surface-subtle)]', label: 'Info' };
  }
}

// ============================================================================
// Main Page
// ============================================================================

export default function AdminOverviewPage() {
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [insightsLoading, setInsightsLoading] = useState(true);
  const [insightsError, setInsightsError] = useState(false);
  // Load stats (existing pattern)
  useEffect(() => {
    loadStats();
  }, []);

  // Load insights (async, separate from stats)
  useEffect(() => {
    loadInsights();
  }, []);

  async function loadStats() {
    try {
      // Fetch tenants for overview stats
      const tenantsRes = await fetch('/api/admin/tenants');
      const tenantsData = await tenantsRes.json();
      const tenants = tenantsData.tenants || [];

      // Fetch users
      const usersRes = await fetch('/api/admin/users');
      const usersData = await usersRes.json();
      const users = usersData.users || [];

      // Fetch revenue
      const revenueRes = await fetch('/api/admin/revenue');
      const revenueData = await revenueRes.json();

      // Calculate stats
      const planBreakdown = { starter: 0, pro: 0, business: 0 };
      for (const t of tenants) {
        const tier = (t.subscription_tier || 'starter') as keyof typeof planBreakdown;
        if (planBreakdown[tier] !== undefined) planBreakdown[tier]++;
      }

      const today = new Date().toISOString().substring(0, 10);
      const activeToday = tenants.filter((t: any) =>
        t.last_active && t.last_active.substring(0, 10) === today
      ).length;

      const recentSignups = tenants
        .sort((a: any, b: any) => b.created_at.localeCompare(a.created_at))
        .slice(0, 5)
        .map((t: any) => ({
          name: t.name,
          created_at: t.created_at,
          tier: t.subscription_tier || 'starter',
        }));

      setStats({
        totalTenants: tenants.length,
        totalUsers: users.length,
        planBreakdown,
        platformRevenue: revenueData.totals?.platform_fees || 0,
        recentSignups,
        activeToday,
      });
    } catch (err) {
      console.error('Failed to load admin stats:', err);
    } finally {
      setStatsLoading(false);
    }
  }

  async function loadInsights() {
    setInsightsLoading(true);
    setInsightsError(false);
    try {
      const res = await fetch('/api/admin/insights');
      if (!res.ok) throw new Error('Failed to fetch insights');
      const data = await res.json();
      setInsights(data.insights || []);
    } catch (err) {
      console.error('Failed to load insights:', err);
      setInsightsError(true);
    } finally {
      setInsightsLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div>
        <h1
          className="text-2xl font-bold text-[var(--text-primary)]"
          style={{ fontFamily: 'var(--font-display, Georgia)' }}
        >
          Platform Overview
        </h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          Sunstone PJOS — platform health at a glance
        </p>
      </div>

      {/* ================================================================ */}
      {/* Stat Cards                                                        */}
      {/* ================================================================ */}
      {statsLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-[var(--surface-raised)] rounded-xl border border-[var(--border-default)] p-5 animate-pulse">
              <div className="h-3 w-20 bg-[var(--surface-subtle)] rounded mb-3" />
              <div className="h-8 w-16 bg-[var(--surface-subtle)] rounded" />
            </div>
          ))}
        </div>
      ) : stats ? (
        <>
          {/* Primary Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Total Tenants" value={stats.totalTenants} />
            <StatCard label="Total Users" value={stats.totalUsers} />
            <StatCard label="Platform Revenue" value={money(stats.platformRevenue)} />
            <StatCard label="Active Today" value={stats.activeToday} />
          </div>

          {/* Plan Breakdown + Recent Signups */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Plan Breakdown */}
            <div className="bg-[var(--surface-raised)] rounded-xl border border-[var(--border-default)] p-5">
              <h3 className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wide mb-4">
                Plan Breakdown
              </h3>
              <div className="space-y-3">
                <PlanRow tier="Starter" count={stats.planBreakdown.starter} total={stats.totalTenants} color="bg-[var(--text-tertiary)]" />
                <PlanRow tier="Pro" count={stats.planBreakdown.pro} total={stats.totalTenants} color="bg-info-500" />
                <PlanRow tier="Business" count={stats.planBreakdown.business} total={stats.totalTenants} color="bg-warning-500" />
              </div>
            </div>

            {/* Recent Signups */}
            <div className="bg-[var(--surface-raised)] rounded-xl border border-[var(--border-default)] p-5">
              <h3 className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wide mb-4">
                Recent Signups
              </h3>
              {stats.recentSignups.length === 0 ? (
                <p className="text-sm text-[var(--text-tertiary)]">No tenants yet</p>
              ) : (
                <div className="space-y-0 divide-y divide-[var(--border-subtle)]">
                  {stats.recentSignups.map((s, i) => (
                    <div key={i} className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[var(--text-primary)] truncate">{s.name}</p>
                        <p className="text-xs text-[var(--text-tertiary)]">{new Date(s.created_at).toLocaleDateString()}</p>
                      </div>
                      <TierBadge tier={s.tier} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      ) : (
        <div className="bg-[var(--surface-raised)] rounded-xl border border-[var(--border-default)] p-8 text-center">
          <p className="text-[var(--text-secondary)]">Failed to load stats. Try refreshing.</p>
        </div>
      )}

      {/* ================================================================ */}
      {/* Platform Intelligence — AI Insights                               */}
      {/* ================================================================ */}
      <div>
        {/* Section Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent-400 to-accent-600 flex items-center justify-center shadow-sm">
              <SparkleIcon className="w-4 h-4 text-[var(--text-on-accent)]" />
            </div>
            <div>
              <h2
                className="text-lg font-bold text-[var(--text-primary)]"
                style={{ fontFamily: 'var(--font-display, Georgia)' }}
              >
                Platform Intelligence
              </h2>
              <p className="text-xs text-[var(--text-secondary)]">AI-powered analysis of your platform data</p>
            </div>
          </div>
          <button
            onClick={loadInsights}
            disabled={insightsLoading}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
              insightsLoading
                ? 'bg-[var(--surface-subtle)] text-[var(--text-tertiary)] cursor-not-allowed'
                : 'bg-[var(--surface-subtle)] text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)] hover:text-[var(--text-primary)]'
            )}
          >
            <RefreshIcon className={cn('w-3.5 h-3.5', insightsLoading && 'animate-spin')} />
            {insightsLoading ? 'Analyzing…' : 'Refresh'}
          </button>
        </div>

        {/* Insights Content */}
        {insightsLoading ? (
          // Skeleton loading state
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-[var(--surface-raised)] rounded-xl border border-[var(--border-default)] p-5 animate-pulse">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-[var(--surface-subtle)] shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-48 bg-[var(--surface-subtle)] rounded" />
                    <div className="h-3 w-full bg-[var(--surface-subtle)] rounded" />
                    <div className="h-3 w-3/4 bg-[var(--surface-subtle)] rounded" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : insightsError ? (
          // Error state
          <div className="bg-[var(--surface-raised)] rounded-xl border border-[var(--border-default)] p-8 text-center">
            <div className="w-12 h-12 rounded-full bg-[var(--surface-subtle)] flex items-center justify-center mx-auto mb-3">
              <AlertCircleIcon className="w-6 h-6 text-[var(--text-tertiary)]" />
            </div>
            <p className="text-sm text-[var(--text-secondary)] mb-3">Insights unavailable — check back soon</p>
            <button
              onClick={loadInsights}
              className="px-4 py-2 bg-warning-50 text-warning-600 rounded-lg text-sm font-medium hover:bg-warning-100 transition-colors"
            >
              Retry
            </button>
          </div>
        ) : insights.length === 0 ? (
          // Empty state
          <div className="bg-[var(--surface-raised)] rounded-xl border border-[var(--border-default)] p-8 text-center">
            <div className="w-12 h-12 rounded-full bg-accent-50 flex items-center justify-center mx-auto mb-3">
              <SparkleIcon className="w-6 h-6 text-accent-500" />
            </div>
            <p className="text-sm text-[var(--text-secondary)]">No insights yet — insights will appear as platform data grows.</p>
          </div>
        ) : (
          // Insight cards
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {insights.map((insight, i) => (
              <InsightCard key={i} insight={insight} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-[var(--surface-raised)] rounded-xl border border-[var(--border-default)] p-5">
      <div className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wide mb-1">{label}</div>
      <div className="text-2xl font-bold text-[var(--text-primary)] tracking-tight ">{value}</div>
    </div>
  );
}

function PlanRow({ tier, count, total, color }: { tier: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm text-[var(--text-secondary)] font-medium">{tier}</span>
        <span className="text-sm text-[var(--text-secondary)]">
          {count} <span className="text-[var(--text-tertiary)]">({pct}%)</span>
        </span>
      </div>
      <div className="h-2 bg-[var(--surface-subtle)] rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
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
    <span className={cn('inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium shrink-0', styles[tier] || styles.starter)}>
      {tier.charAt(0).toUpperCase() + tier.slice(1)}
    </span>
  );
}

function InsightCard({ insight }: { insight: Insight }) {
  const config = insightConfig(insight.type);

  return (
    <div className={cn(
      'bg-[var(--surface-raised)] rounded-xl border border-[var(--border-default)] p-5 border-l-4 transition-colors',
      config.border
    )}>
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center shrink-0', config.iconBg)}>
          <InsightTypeIcon type={insight.type} className={cn('w-4.5 h-4.5', config.color)} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="text-sm font-semibold text-[var(--text-primary)] leading-snug">{insight.title}</h4>
          </div>
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{insight.body}</p>
          <span className={cn('inline-block mt-2 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full', config.bg, config.color)}>
            {config.label}
          </span>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Insight type icons
// ============================================================================

function InsightTypeIcon({ type, className }: { type: string; className?: string }) {
  switch (type) {
    case 'growth':
      return <TrendingUpIcon className={className} />;
    case 'attention':
      return <AlertCircleIcon className={className} />;
    case 'churn_risk':
      return <AlertTriangleIcon className={className} />;
    case 'opportunity':
      return <LightbulbIcon className={className} />;
    case 'milestone':
      return <StarIcon className={className} />;
    default:
      return <SparkleIcon className={className} />;
  }
}

// ============================================================================
// Icons (inline SVG)
// ============================================================================

function SparkleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
    </svg>
  );
}

function TrendingUpIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
    </svg>
  );
}

function AlertCircleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="10" />
      <path strokeLinecap="round" d="M12 8v4m0 4h.01" />
    </svg>
  );
}

function AlertTriangleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
    </svg>
  );
}

function LightbulbIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
    </svg>
  );
}

function StarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
    </svg>
  );
}

function RefreshIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
    </svg>
  );
}