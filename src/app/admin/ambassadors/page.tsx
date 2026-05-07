// ============================================================================
// Admin Ambassadors Page — src/app/admin/ambassadors/page.tsx
// ============================================================================
// Platform admin management of ambassador program.
// List, approve, suspend, reactivate ambassadors.
// ============================================================================

'use client';

import { useEffect, useState, useMemo } from 'react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface AmbassadorStats {
  totalReferrals: number;
  signups: number;
  converted: number;
  totalEarned: number;
}

interface Ambassador {
  id: string;
  type: 'artist' | 'external';
  status: 'pending' | 'active' | 'suspended' | 'terminated';
  name: string;
  email: string;
  phone: string | null;
  referral_code: string;
  stripe_connect_onboarded: boolean;
  community_description: string | null;
  social_links: string | null;
  approved_at: string | null;
  suspended_at: string | null;
  suspended_reason: string | null;
  created_at: string;
  commission_rate: number;
  commission_duration_months: number;
  stats: AmbassadorStats;
  pendingCommission: number;
  lastPayout: { amount: number; date: string } | null;
}

interface Summary {
  total: number;
  active: number;
  pending: number;
  totalReferrals: number;
  totalEarned: number;
  totalPaidOut: number;
  totalPendingCommissions: number;
  conversionRate: number;
  churnRate: number;
  nextPayoutDate: string;
}

interface TopAmbassador {
  id: string;
  name: string;
  referral_code: string;
  totalEarned: number;
  totalPaid: number;
  converted: number;
  totalReferrals: number;
}

interface MonthlyTrend {
  month: string;
  earned: number;
  paid: number;
  count: number;
}

type FilterStatus = 'all' | 'pending' | 'active' | 'suspended';

export default function AdminAmbassadorsPage() {
  const [ambassadors, setAmbassadors] = useState<Ambassador[]>([]);
  const [summary, setSummary] = useState<Summary>({ total: 0, active: 0, pending: 0, totalReferrals: 0, totalEarned: 0, totalPaidOut: 0, totalPendingCommissions: 0, conversionRate: 0, churnRate: 0, nextPayoutDate: '' });
  const [topAmbassadors, setTopAmbassadors] = useState<TopAmbassador[]>([]);
  const [monthlyTrend, setMonthlyTrend] = useState<MonthlyTrend[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterStatus>('all');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadData = async () => {
    try {
      const res = await fetch('/api/admin/ambassadors');
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();
      setAmbassadors(data.ambassadors || []);
      setSummary(data.summary || { total: 0, active: 0, pending: 0, totalReferrals: 0, totalEarned: 0, totalPaidOut: 0, totalPendingCommissions: 0, conversionRate: 0, churnRate: 0, nextPayoutDate: '' });
      setTopAmbassadors(data.topAmbassadors || []);
      setMonthlyTrend(data.monthlyTrend || []);
    } catch {
      toast.error('Failed to load ambassadors');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const filtered = useMemo(() => {
    if (filter === 'all') return ambassadors;
    return ambassadors.filter((a) => a.status === filter);
  }, [ambassadors, filter]);

  const handleUpdateAmbassador = async (ambassadorId: string, updates: Record<string, any>) => {
    setActionLoading(ambassadorId);
    try {
      const res = await fetch(`/api/admin/ambassadors/${ambassadorId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to update');
      }
      toast.success('Ambassador updated');
      await loadData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update');
    } finally {
      setActionLoading(null);
    }
  };

  const handleAction = async (ambassadorId: string, action: 'approve' | 'suspend' | 'reactivate') => {
    setActionLoading(ambassadorId);
    try {
      const res = await fetch(`/api/admin/ambassadors/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ambassadorId }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || `Failed to ${action}`);
      }
      toast.success(`Ambassador ${action}d`);
      await loadData();
    } catch (err: any) {
      toast.error(err.message || `Failed to ${action}`);
    } finally {
      setActionLoading(null);
    }
  };

  const statusBadge = (status: string) => {
    const styles: Record<string, string> = {
      pending: 'bg-amber-50 text-amber-700 border-amber-200',
      active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      suspended: 'bg-red-50 text-red-700 border-red-200',
      terminated: 'bg-gray-100 text-gray-500 border-gray-200',
    };
    return (
      <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border', styles[status] || styles.terminated)}>
        {status}
      </span>
    );
  };

  const typeBadge = (type: string) => (
    <span className={cn(
      'inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border',
      type === 'artist' ? 'bg-purple-50 text-purple-700 border-purple-200' : 'bg-blue-50 text-blue-700 border-blue-200'
    )}>
      {type}
    </span>
  );

  if (loading) {
    return <div className="p-8 text-gray-400">Loading ambassadors...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Ambassador Program</h1>
        <p className="text-sm text-gray-400 mt-1">Manage ambassador applications and referral tracking</p>
      </div>

      {/* Program Overview Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {[
          { label: 'Ambassadors', value: `${summary.active} active`, sub: `${summary.pending} pending` },
          { label: 'Total Referrals', value: summary.totalReferrals, sub: `${(summary.conversionRate * 100).toFixed(0)}% conversion` },
          { label: 'Total Earned', value: `$${summary.totalEarned.toFixed(2)}`, sub: `$${summary.totalPaidOut.toFixed(2)} paid out` },
          { label: 'Pending Payouts', value: `$${summary.totalPendingCommissions.toFixed(2)}`, sub: `Next: ${summary.nextPayoutDate || '—'}` },
          { label: 'Churn Rate', value: `${(summary.churnRate * 100).toFixed(1)}%`, sub: `of converted referrals` },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs text-gray-400 uppercase tracking-wider">{s.label}</p>
            <p className="text-xl font-bold text-white mt-1">{s.value}</p>
            <p className="text-[11px] text-gray-500 mt-0.5">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Top Ambassadors + Monthly Trend */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top Ambassadors */}
        <div className="rounded-xl border border-white/10 overflow-hidden">
          <div className="px-4 py-3 bg-white/5 border-b border-white/10">
            <h3 className="text-sm font-semibold text-white">Top Ambassadors</h3>
          </div>
          {topAmbassadors.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-gray-500">No active ambassadors yet</div>
          ) : (
            <div className="divide-y divide-white/5">
              {topAmbassadors.map((a, i) => (
                <div key={a.id} className="px-4 py-3 flex items-center gap-3">
                  <span className="text-xs font-bold text-gray-500 w-5">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{a.name}</p>
                    <p className="text-xs text-gray-400">{a.converted} converted / {a.totalReferrals} referrals</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-[#FF7A00]">${a.totalEarned.toFixed(2)}</p>
                    <p className="text-[11px] text-gray-500">${a.totalPaid.toFixed(2)} paid</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Monthly Trend */}
        <div className="rounded-xl border border-white/10 overflow-hidden">
          <div className="px-4 py-3 bg-white/5 border-b border-white/10">
            <h3 className="text-sm font-semibold text-white">Monthly Commission Trend</h3>
          </div>
          {monthlyTrend.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-gray-500">No commission data yet</div>
          ) : (
            <>
              <div className="grid grid-cols-4 gap-3 px-4 py-2 text-xs font-medium text-gray-400 uppercase tracking-wider bg-white/[0.02]">
                <div>Month</div>
                <div className="text-right">Commissions</div>
                <div className="text-right">Earned</div>
                <div className="text-right">Paid</div>
              </div>
              <div className="divide-y divide-white/5">
                {monthlyTrend.map((m) => (
                  <div key={m.month} className="grid grid-cols-4 gap-3 px-4 py-2.5 text-sm">
                    <div className="text-gray-300">{m.month}</div>
                    <div className="text-right text-gray-400">{m.count}</div>
                    <div className="text-right text-white font-medium">${m.earned.toFixed(2)}</div>
                    <div className="text-right text-gray-400">${m.paid.toFixed(2)}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2">
        {(['all', 'pending', 'active', 'suspended'] as FilterStatus[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-medium transition-colors min-h-[44px]',
              filter === f ? 'bg-[#FF7A00] text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10'
            )}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
            {f === 'pending' && summary.pending > 0 && (
              <span className="ml-1.5 bg-amber-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">{summary.pending}</span>
            )}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-xl border border-white/10 overflow-hidden">
        {/* Header */}
        <div className="hidden sm:grid grid-cols-[1fr_120px_80px_80px_60px_100px_100px_100px_140px] gap-4 px-4 py-3 bg-white/5 text-xs font-medium text-gray-400 uppercase tracking-wider">
          <div>Ambassador</div>
          <div>Code</div>
          <div>Type</div>
          <div>Status</div>
          <div className="text-center">Payouts</div>
          <div className="text-right">Referrals</div>
          <div className="text-right">Earned</div>
          <div className="text-right">Pending</div>
          <div className="text-right">Actions</div>
        </div>

        {filtered.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-gray-500">No ambassadors found</div>
        ) : (
          <div className="divide-y divide-white/5">
            {filtered.map((a) => (
              <div key={a.id}>
                <div
                  className="px-4 py-3 sm:grid sm:grid-cols-[1fr_120px_80px_80px_60px_100px_100px_100px_140px] sm:gap-4 sm:items-center hover:bg-white/[0.02] transition-colors cursor-pointer"
                  onClick={() => setExpandedId(expandedId === a.id ? null : a.id)}
                >
                  {/* Name + Email */}
                  <div className="min-w-0 flex items-center gap-2">
                    <svg className={cn('w-3 h-3 text-gray-500 shrink-0 transition-transform', expandedId === a.id && 'rotate-90')} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                    </svg>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white truncate">{a.name}</p>
                      <p className="text-xs text-gray-400 truncate">{a.email}</p>
                    </div>
                  </div>

                  {/* Code */}
                  <div className="text-xs text-gray-300 truncate">{a.referral_code}</div>

                  {/* Type */}
                  <div>{typeBadge(a.type)}</div>

                  {/* Status */}
                  <div>{statusBadge(a.status)}</div>

                  {/* Connect */}
                  <div className="text-center">
                    {a.stripe_connect_onboarded ? (
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </span>
                    ) : (
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gray-500/20 text-gray-500">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </span>
                    )}
                  </div>

                  {/* Referrals */}
                  <div className="text-right text-sm text-gray-300">{a.stats.totalReferrals}</div>

                  {/* Earned */}
                  <div className="text-right text-sm text-gray-300">${a.stats.totalEarned.toFixed(2)}</div>

                  {/* Pending Commission */}
                  <div className="text-right text-sm text-gray-300">
                    {a.pendingCommission > 0 ? (
                      <span className="text-[#FF7A00]">${a.pendingCommission.toFixed(2)}</span>
                    ) : '—'}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                    {a.status === 'pending' && (
                      <>
                        <button
                          onClick={() => handleAction(a.id, 'approve')}
                          disabled={actionLoading === a.id}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 min-h-[36px]"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => handleAction(a.id, 'suspend')}
                          disabled={actionLoading === a.id}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-600/20 text-red-400 hover:bg-red-600/30 disabled:opacity-50 min-h-[36px]"
                        >
                          Reject
                        </button>
                      </>
                    )}
                    {a.status === 'active' && (
                      <button
                        onClick={() => handleAction(a.id, 'suspend')}
                        disabled={actionLoading === a.id}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-600/20 text-red-400 hover:bg-red-600/30 disabled:opacity-50 min-h-[36px]"
                      >
                        Suspend
                      </button>
                    )}
                    {a.status === 'suspended' && (
                      <button
                        onClick={() => handleAction(a.id, 'reactivate')}
                        disabled={actionLoading === a.id}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#FF7A00]/20 text-[#FF7A00] hover:bg-[#FF7A00]/30 disabled:opacity-50 min-h-[36px]"
                      >
                        Reactivate
                      </button>
                    )}
                  </div>
                </div>

                {/* Expanded Detail */}
                {expandedId === a.id && (
                  <AmbassadorDetailPanel
                    ambassador={a}
                    onUpdate={(updates) => handleUpdateAmbassador(a.id, updates)}
                    saving={actionLoading === a.id}
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Ambassador Detail Panel (expanded row) ──────────────────────────────────

function AmbassadorDetailPanel({
  ambassador: a,
  onUpdate,
  saving,
}: {
  ambassador: Ambassador;
  onUpdate: (updates: Record<string, any>) => void;
  saving: boolean;
}) {
  const [editRate, setEditRate] = useState(Math.round(a.commission_rate * 10000) / 100);
  const [editDuration, setEditDuration] = useState(a.commission_duration_months);
  const [dirty, setDirty] = useState(false);

  const currentRateDecimal = editRate / 100;
  const hasChanged = currentRateDecimal !== a.commission_rate || editDuration !== a.commission_duration_months;

  const handleSave = () => {
    onUpdate({
      commission_rate: currentRateDecimal,
      commission_duration_months: editDuration,
    });
    setDirty(false);
  };

  return (
    <div className="px-4 pb-4 pt-1 bg-white/[0.02] border-t border-white/5">
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-sm">
        {/* Info */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Details</p>
          <div className="space-y-1 text-xs">
            <p><span className="text-gray-500">Phone:</span> <span className="text-gray-300">{a.phone || '—'}</span></p>
            <p><span className="text-gray-500">Joined:</span> <span className="text-gray-300">{format(new Date(a.created_at), 'MMM d, yyyy')}</span></p>
            {a.approved_at && <p><span className="text-gray-500">Approved:</span> <span className="text-gray-300">{format(new Date(a.approved_at), 'MMM d, yyyy')}</span></p>}
            {a.suspended_at && <p><span className="text-gray-500">Suspended:</span> <span className="text-red-400">{format(new Date(a.suspended_at), 'MMM d, yyyy')}</span></p>}
            {a.suspended_reason && <p><span className="text-gray-500">Reason:</span> <span className="text-red-400">{a.suspended_reason}</span></p>}
            {a.social_links && <p><span className="text-gray-500">Social:</span> <span className="text-gray-300 break-all">{a.social_links}</span></p>}
          </div>
          {a.community_description && (
            <div className="mt-2">
              <p className="text-xs text-gray-500">Community Description:</p>
              <p className="text-xs text-gray-300 mt-0.5">{a.community_description}</p>
            </div>
          )}
        </div>

        {/* Commission Settings (editable) */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Commission Settings</p>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Rate (%)</label>
              <input
                type="number"
                min={1}
                max={50}
                step={1}
                value={editRate}
                onChange={(e) => { setEditRate(Number(e.target.value)); setDirty(true); }}
                className="w-full h-9 px-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white focus:outline-none focus:border-[#FF7A00] focus:ring-1 focus:ring-[#FF7A00]"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Duration (months)</label>
              <input
                type="number"
                min={1}
                max={24}
                step={1}
                value={editDuration}
                onChange={(e) => { setEditDuration(Number(e.target.value)); setDirty(true); }}
                className="w-full h-9 px-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white focus:outline-none focus:border-[#FF7A00] focus:ring-1 focus:ring-[#FF7A00]"
              />
            </div>
            {(dirty && hasChanged) && (
              <button
                onClick={handleSave}
                disabled={saving || editRate < 1 || editRate > 50 || editDuration < 1 || editDuration > 24}
                className="w-full h-9 rounded-lg text-xs font-medium bg-[#FF7A00] text-white hover:bg-[#FF7A00]/90 disabled:opacity-50 transition-colors"
              >
                {saving ? 'Saving...' : 'Save Commission Settings'}
              </button>
            )}
          </div>
        </div>

        {/* Referral Breakdown */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Referral Breakdown</p>
          <div className="space-y-1 text-xs">
            <p><span className="text-gray-500">Total Referrals:</span> <span className="text-gray-300">{a.stats.totalReferrals}</span></p>
            <p><span className="text-gray-500">Signups (trial):</span> <span className="text-blue-400">{a.stats.signups}</span></p>
            <p><span className="text-gray-500">Converted (paid):</span> <span className="text-emerald-400">{a.stats.converted}</span></p>
            <p><span className="text-gray-500">Active Referrals:</span> <span className="text-emerald-400">{a.stats.signups}</span></p>
            <p><span className="text-gray-500">Conversion Rate:</span> <span className="text-gray-300">{a.stats.totalReferrals > 0 ? ((a.stats.converted / a.stats.totalReferrals) * 100).toFixed(0) : 0}%</span></p>
          </div>
        </div>

        {/* Financial */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Financials</p>
          <div className="space-y-1 text-xs">
            <p><span className="text-gray-500">Total Earned:</span> <span className="text-white font-medium">${a.stats.totalEarned.toFixed(2)}</span></p>
            <p><span className="text-gray-500">Pending Payout:</span> <span className="text-[#FF7A00]">{a.pendingCommission > 0 ? `$${a.pendingCommission.toFixed(2)}` : '—'}</span></p>
            <p><span className="text-gray-500">Last Payout:</span> <span className="text-gray-300">{a.lastPayout ? `$${a.lastPayout.amount.toFixed(2)} on ${format(new Date(a.lastPayout.date), 'MMM d')}` : '—'}</span></p>
            <p><span className="text-gray-500">Stripe Connect:</span> <span className={a.stripe_connect_onboarded ? 'text-emerald-400' : 'text-gray-500'}>{a.stripe_connect_onboarded ? 'Connected' : 'Not connected'}</span></p>
          </div>
        </div>
      </div>
    </div>
  );
}
