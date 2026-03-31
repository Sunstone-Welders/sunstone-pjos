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
  community_description: string | null;
  social_links: string | null;
  approved_at: string | null;
  suspended_at: string | null;
  suspended_reason: string | null;
  created_at: string;
  stats: AmbassadorStats;
}

interface Summary {
  total: number;
  active: number;
  pending: number;
  totalReferrals: number;
  totalEarned: number;
}

type FilterStatus = 'all' | 'pending' | 'active' | 'suspended';

export default function AdminAmbassadorsPage() {
  const [ambassadors, setAmbassadors] = useState<Ambassador[]>([]);
  const [summary, setSummary] = useState<Summary>({ total: 0, active: 0, pending: 0, totalReferrals: 0, totalEarned: 0 });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterStatus>('all');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadData = async () => {
    try {
      const res = await fetch('/api/admin/ambassadors');
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();
      setAmbassadors(data.ambassadors || []);
      setSummary(data.summary || { total: 0, active: 0, pending: 0, totalReferrals: 0, totalEarned: 0 });
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

      {/* Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        {[
          { label: 'Total', value: summary.total },
          { label: 'Active', value: summary.active },
          { label: 'Pending', value: summary.pending },
          { label: 'Referrals', value: summary.totalReferrals },
          { label: 'Earned (All)', value: `$${summary.totalEarned.toFixed(2)}` },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs text-gray-400 uppercase tracking-wider">{s.label}</p>
            <p className="text-xl font-bold text-white mt-1">{s.value}</p>
          </div>
        ))}
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
        <div className="hidden sm:grid grid-cols-[1fr_120px_80px_80px_100px_100px_140px] gap-4 px-4 py-3 bg-white/5 text-xs font-medium text-gray-400 uppercase tracking-wider">
          <div>Ambassador</div>
          <div>Code</div>
          <div>Type</div>
          <div>Status</div>
          <div className="text-right">Referrals</div>
          <div className="text-right">Earned</div>
          <div className="text-right">Actions</div>
        </div>

        {filtered.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-gray-500">No ambassadors found</div>
        ) : (
          <div className="divide-y divide-white/5">
            {filtered.map((a) => (
              <div key={a.id} className="px-4 py-3 sm:grid sm:grid-cols-[1fr_120px_80px_80px_100px_100px_140px] sm:gap-4 sm:items-center hover:bg-white/[0.02] transition-colors">
                {/* Name + Email */}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white truncate">{a.name}</p>
                  <p className="text-xs text-gray-400 truncate">{a.email}</p>
                  {a.community_description && (
                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{a.community_description}</p>
                  )}
                </div>

                {/* Code */}
                <div className="text-xs text-gray-300 font-mono truncate">{a.referral_code}</div>

                {/* Type */}
                <div>{typeBadge(a.type)}</div>

                {/* Status */}
                <div>{statusBadge(a.status)}</div>

                {/* Referrals */}
                <div className="text-right text-sm text-gray-300">{a.stats.totalReferrals}</div>

                {/* Earned */}
                <div className="text-right text-sm text-gray-300">${a.stats.totalEarned.toFixed(2)}</div>

                {/* Actions */}
                <div className="flex items-center justify-end gap-2">
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
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
