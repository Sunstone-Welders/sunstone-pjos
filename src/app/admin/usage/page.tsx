// src/app/admin/usage/page.tsx
// Platform Usage Intelligence — feature adoption, active tenants, Sunny insights
'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';

// ============================================================================
// Types
// ============================================================================

interface UsageOverview {
  total_events: number;
  events_this_week: number;
  active_tenants_this_week: number;
  most_used_feature: string;
}

interface FeatureAdoption {
  event_type: string;
  label: string;
  category: string;
  total: number;
  unique_tenants: number;
  adoption_pct: number;
  week_count: number;
}

interface ActiveTenant {
  tenant_id: string;
  tenant_name: string;
  subscription_tier: string;
  total_events: number;
  most_used_feature: string;
  last_active: string;
}

interface DailyPoint {
  date: string;
  count: number;
}

interface SunnyData {
  total_questions: number;
  questions_this_week: number;
  questions_by_day: DailyPoint[];
  top_tenants: { tenant_id: string; tenant_name: string; question_count: number }[];
  recent_questions: { question_preview: string; tenant_name: string; created_at: string }[];
}

interface UsageData {
  overview: UsageOverview;
  feature_adoption: FeatureAdoption[];
  most_active_tenants: ActiveTenant[];
  daily_activity: DailyPoint[];
}

// ============================================================================
// Category grouping
// ============================================================================

const CATEGORY_ORDER = ['pos', 'events', 'crm', 'inventory', 'ai', 'reports', 'marketing', 'setup', 'navigation'];
const CATEGORY_LABELS: Record<string, string> = {
  pos: 'Point of Sale',
  events: 'Events',
  crm: 'CRM & Messaging',
  inventory: 'Inventory',
  ai: 'AI & Sunny',
  reports: 'Reports',
  marketing: 'Marketing',
  setup: 'Setup & Config',
  navigation: 'Navigation',
};

// ============================================================================
// Tier badge
// ============================================================================

function TierBadge({ tier }: { tier: string }) {
  const colors: Record<string, { bg: string; text: string }> = {
    starter: { bg: 'rgba(255,255,255,0.06)', text: '#9B9590' },
    pro: { bg: 'rgba(255, 122, 0, 0.12)', text: '#FF9A40' },
    business: { bg: 'rgba(168, 85, 247, 0.12)', text: '#C084FC' },
  };
  const c = colors[tier] || colors.starter;
  return (
    <span
      className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider"
      style={{ backgroundColor: c.bg, color: c.text }}
    >
      {tier}
    </span>
  );
}

// ============================================================================
// Simple SVG Bar Chart
// ============================================================================

function BarChart({ data, height = 160 }: { data: DailyPoint[]; height?: number }) {
  if (data.length === 0) return null;
  const max = Math.max(...data.map(d => d.count), 1);

  return (
    <div className="w-full overflow-x-auto">
      <svg width="100%" height={height} viewBox={`0 0 ${data.length * 20} ${height}`} preserveAspectRatio="none">
        {data.map((d, i) => {
          const barHeight = (d.count / max) * (height - 24);
          return (
            <g key={d.date}>
              <rect
                x={i * 20 + 2}
                y={height - 24 - barHeight}
                width={16}
                height={Math.max(barHeight, 1)}
                rx={2}
                fill={d.count > 0 ? '#FF7A00' : 'rgba(255,255,255,0.04)'}
                opacity={d.count > 0 ? 0.8 : 0.3}
              />
              {i % 7 === 0 && (
                <text
                  x={i * 20 + 10}
                  y={height - 4}
                  textAnchor="middle"
                  fill="#6B6560"
                  fontSize="8"
                >
                  {d.date.slice(5)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ============================================================================
// Page
// ============================================================================

export default function AdminUsagePage() {
  const [data, setData] = useState<UsageData | null>(null);
  const [sunny, setSunny] = useState<SunnyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(CATEGORY_ORDER));

  useEffect(() => {
    Promise.all([
      fetch('/api/admin/analytics/usage').then(r => r.ok ? r.json() : null),
      fetch('/api/admin/analytics/sunny').then(r => r.ok ? r.json() : null),
    ])
      .then(([usageData, sunnyData]) => {
        if (usageData) setData(usageData);
        if (sunnyData) setSunny(sunnyData);
      })
      .catch(() => toast.error('Failed to load usage data'))
      .finally(() => setLoading(false));
  }, []);

  function toggleCategory(cat: string) {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-2 border-[#FF7A00] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const overview = data?.overview;
  const hasData = overview && overview.total_events > 0;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1
          className="text-2xl font-bold"
          style={{ color: '#E8E4DF', fontFamily: 'var(--font-display, Georgia)' }}
        >
          Usage Intelligence
        </h1>
        <p className="text-sm mt-1" style={{ color: '#6B6560' }}>
          Feature engagement, active tenants, and Sunny AI insights
        </p>
      </div>

      {/* Section 1 — Overview Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Events" value={overview?.total_events ?? 0} />
        <StatCard label="This Week" value={overview?.events_this_week ?? 0} />
        <StatCard label="Active Tenants (7d)" value={overview?.active_tenants_this_week ?? 0} />
        <StatCard label="Top Feature (7d)" value={overview?.most_used_feature ?? 'N/A'} isText />
      </div>

      {!hasData && (
        <div
          className="rounded-xl p-8 text-center"
          style={{ backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid #2A2A35' }}
        >
          <div className="text-3xl mb-3">📊</div>
          <p className="text-sm font-medium" style={{ color: '#E8E4DF' }}>
            No usage data yet
          </p>
          <p className="text-xs mt-1" style={{ color: '#6B6560' }}>
            Tracking is now active. Data will appear as tenants use the platform.
          </p>
        </div>
      )}

      {/* Section 5 — Daily Activity Chart */}
      {hasData && data?.daily_activity && (
        <div
          className="rounded-xl p-5"
          style={{ backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid #2A2A35' }}
        >
          <h2 className="text-sm font-semibold mb-4" style={{ color: '#E8E4DF' }}>
            Daily Activity (Last 30 Days)
          </h2>
          <BarChart data={data.daily_activity} />
        </div>
      )}

      {/* Section 2 — Feature Adoption */}
      {hasData && data?.feature_adoption && data.feature_adoption.length > 0 && (
        <div
          className="rounded-xl overflow-hidden"
          style={{ backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid #2A2A35' }}
        >
          <div className="px-5 py-4" style={{ borderBottom: '1px solid #2A2A35' }}>
            <h2 className="text-sm font-semibold" style={{ color: '#E8E4DF' }}>
              Feature Adoption
            </h2>
          </div>

          {CATEGORY_ORDER.filter(cat =>
            data.feature_adoption.some(f => f.category === cat)
          ).map(cat => {
            const features = data.feature_adoption.filter(f => f.category === cat);
            const isExpanded = expandedCategories.has(cat);

            return (
              <div key={cat}>
                <button
                  className="w-full flex items-center justify-between px-5 py-3 text-left transition-colors hover:bg-[rgba(255,255,255,0.02)]"
                  style={{ borderBottom: '1px solid #222230' }}
                  onClick={() => toggleCategory(cat)}
                >
                  <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#FF7A00' }}>
                    {CATEGORY_LABELS[cat] || cat}
                  </span>
                  <svg
                    className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="#6B6560"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {isExpanded && (
                  <div>
                    {/* Header row */}
                    <div
                      className="grid grid-cols-5 px-5 py-2 text-[10px] uppercase tracking-wider font-semibold"
                      style={{ color: '#6B6560', borderBottom: '1px solid #222230' }}
                    >
                      <span className="col-span-2">Feature</span>
                      <span className="text-right">Total</span>
                      <span className="text-right">7d</span>
                      <span className="text-right">Adoption</span>
                    </div>

                    {features.map(f => (
                      <div
                        key={f.event_type}
                        className="grid grid-cols-5 px-5 py-2.5 text-sm transition-colors hover:bg-[rgba(255,255,255,0.02)]"
                        style={{ borderBottom: '1px solid #1A1A24' }}
                      >
                        <span className="col-span-2 truncate" style={{ color: '#E8E4DF' }}>
                          {f.label}
                        </span>
                        <span className="text-right tabular-nums" style={{ color: '#9B9590' }}>
                          {f.total.toLocaleString()}
                        </span>
                        <span className="text-right tabular-nums" style={{ color: '#9B9590' }}>
                          {f.week_count.toLocaleString()}
                        </span>
                        <span className="text-right" style={{ color: f.adoption_pct > 50 ? '#22C55E' : f.adoption_pct > 20 ? '#FF9A40' : '#9B9590' }}>
                          {f.adoption_pct}%
                          <span className="text-[10px] ml-1" style={{ color: '#6B6560' }}>
                            ({f.unique_tenants})
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Section 3 — Most Active Tenants */}
      {hasData && data?.most_active_tenants && data.most_active_tenants.length > 0 && (
        <div
          className="rounded-xl overflow-hidden"
          style={{ backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid #2A2A35' }}
        >
          <div className="px-5 py-4" style={{ borderBottom: '1px solid #2A2A35' }}>
            <h2 className="text-sm font-semibold" style={{ color: '#E8E4DF' }}>
              Most Active Tenants
            </h2>
          </div>

          {/* Header */}
          <div
            className="grid grid-cols-6 px-5 py-2 text-[10px] uppercase tracking-wider font-semibold"
            style={{ color: '#6B6560', borderBottom: '1px solid #222230' }}
          >
            <span className="col-span-2">Tenant</span>
            <span className="text-right">Events</span>
            <span className="col-span-2 text-center">Top Feature</span>
            <span className="text-right">Last Active</span>
          </div>

          {data.most_active_tenants.map((t, i) => (
            <div
              key={t.tenant_id}
              className="grid grid-cols-6 px-5 py-2.5 text-sm items-center transition-colors hover:bg-[rgba(255,255,255,0.02)]"
              style={{ borderBottom: '1px solid #1A1A24' }}
            >
              <span className="col-span-2 flex items-center gap-2 truncate">
                <span className="text-[10px] font-bold w-5 text-center" style={{ color: '#6B6560' }}>
                  {i + 1}
                </span>
                <span className="truncate" style={{ color: '#E8E4DF' }}>{t.tenant_name}</span>
                <TierBadge tier={t.subscription_tier} />
              </span>
              <span className="text-right tabular-nums" style={{ color: '#9B9590' }}>
                {t.total_events.toLocaleString()}
              </span>
              <span className="col-span-2 text-center text-xs truncate" style={{ color: '#6B6560' }}>
                {t.most_used_feature}
              </span>
              <span className="text-right text-xs" style={{ color: '#6B6560' }}>
                {new Date(t.last_active).toLocaleDateString()}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Section 4 — Sunny Intelligence */}
      <SunnyIntelligence data={sunny} />
    </div>
  );
}

// ============================================================================
// Stat Card
// ============================================================================

function StatCard({ label, value, isText }: { label: string; value: number | string; isText?: boolean }) {
  return (
    <div
      className="rounded-xl p-4"
      style={{ backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid #2A2A35' }}
    >
      <div className="text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: '#6B6560' }}>
        {label}
      </div>
      <div
        className={`text-xl font-bold ${isText ? 'text-sm' : ''}`}
        style={{ color: '#E8E4DF', fontFamily: isText ? undefined : 'var(--font-display, Georgia)' }}
      >
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
    </div>
  );
}

// ============================================================================
// Sunny Intelligence Section
// ============================================================================

function SunnyIntelligence({ data }: { data: SunnyData | null }) {
  if (!data) return null;

  const hasQuestions = data.total_questions > 0;

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid #2A2A35' }}
    >
      <div className="px-5 py-4 flex items-center gap-2" style={{ borderBottom: '1px solid #2A2A35' }}>
        <SunnyIcon />
        <h2 className="text-sm font-semibold" style={{ color: '#E8E4DF' }}>
          Sunny Intelligence
        </h2>
      </div>

      {!hasQuestions ? (
        <div className="px-5 py-8 text-center">
          <p className="text-sm" style={{ color: '#9B9590' }}>
            Sunny question tracking is now active. Insights will appear as artists ask questions.
          </p>
        </div>
      ) : (
        <div className="p-5 space-y-6">
          {/* Stats row */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <StatCard label="Total Questions" value={data.total_questions} />
            <StatCard label="This Week" value={data.questions_this_week} />
            <div className="hidden lg:block">
              <StatCard label="Top Asker" value={data.top_tenants[0]?.tenant_name ?? 'N/A'} isText />
            </div>
          </div>

          {/* Questions per day chart */}
          {data.questions_by_day.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: '#6B6560' }}>
                Questions Per Day (30d)
              </h3>
              <BarChart data={data.questions_by_day} height={120} />
            </div>
          )}

          {/* Top tenants by Sunny usage */}
          {data.top_tenants.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: '#6B6560' }}>
                Top Tenants by Sunny Usage
              </h3>
              <div className="space-y-1">
                {data.top_tenants.map((t, i) => (
                  <div key={t.tenant_id} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-[rgba(255,255,255,0.02)]">
                    <span className="flex items-center gap-2 text-sm">
                      <span className="text-[10px] font-bold w-5 text-center" style={{ color: '#6B6560' }}>{i + 1}</span>
                      <span style={{ color: '#E8E4DF' }}>{t.tenant_name}</span>
                    </span>
                    <span className="text-sm tabular-nums" style={{ color: '#FF9A40' }}>
                      {t.question_count}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent questions */}
          {data.recent_questions.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: '#6B6560' }}>
                Recent Questions
              </h3>
              <div className="space-y-2">
                {data.recent_questions.map((q, i) => (
                  <div
                    key={i}
                    className="px-3 py-2.5 rounded-lg"
                    style={{ backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid #222230' }}
                  >
                    <p className="text-sm leading-relaxed" style={{ color: '#E8E4DF' }}>
                      &ldquo;{q.question_preview}&rdquo;
                    </p>
                    <div className="flex items-center justify-between mt-1.5">
                      <span className="text-[11px]" style={{ color: '#6B6560' }}>{q.tenant_name}</span>
                      <span className="text-[11px]" style={{ color: '#6B6560' }}>
                        {new Date(q.created_at).toLocaleString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Sunny Icon
// ============================================================================

function SunnyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FF7A00" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
    </svg>
  );
}
