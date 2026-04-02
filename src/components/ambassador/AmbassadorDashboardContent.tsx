// ============================================================================
// AmbassadorDashboardContent — Shared ambassador dashboard
// ============================================================================
// Full ambassador dashboard used by both:
//   - /dashboard/ambassador (artist ambassadors, inside dashboard layout)
//   - /ambassador/dashboard (external ambassadors, standalone layout)
// ============================================================================

'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button, Card } from '@/components/ui';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { getMarketingAssets } from '@/lib/ambassador-assets';

// ── Types ──

interface AmbassadorData {
  id: string;
  type: string;
  status: string;
  name: string;
  referral_code: string;
  stripe_connect_onboarded: boolean;
  created_at: string;
}

interface DashboardStats {
  totalClicks: number;
  totalSignups: number;
  totalConverted: number;
  totalEarned: number;
  totalPaid: number;
}

interface PendingCommissions {
  total: number;
  count: number;
}

interface ReferralItem {
  id: string;
  status: string;
  signed_up_at: string | null;
  converted_at: string | null;
  churned_at: string | null;
  commission_expires_at: string | null;
  total_commission_earned: number;
  total_commission_paid: number;
  months_remaining: number | null;
  referred_business_name: string | null;
  referred_plan: string | null;
  referral_code_used: string;
  created_at: string;
}

interface ReferralSummary {
  total: number;
  signed_up: number;
  converted: number;
  churned: number;
  expired: number;
}

interface PayoutItem {
  id: string;
  total_amount: number;
  commission_count: number;
  status: string;
  scheduled_for: string;
  processed_at: string | null;
  created_at: string;
}

interface LifetimeStats {
  total_paid: number;
  total_pending: number;
  next_payout_date: string;
}

type ReferralFilter = 'all' | 'signed_up' | 'converted' | 'churned' | 'expired';

// ── Main Component ──

export default function AmbassadorDashboardContent() {
  const [ambassador, setAmbassador] = useState<AmbassadorData | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [pending, setPending] = useState<PendingCommissions>({ total: 0, count: 0 });
  const [referrals, setReferrals] = useState<ReferralItem[]>([]);
  const [referralSummary, setReferralSummary] = useState<ReferralSummary>({ total: 0, signed_up: 0, converted: 0, churned: 0, expired: 0 });
  const [payouts, setPayouts] = useState<PayoutItem[]>([]);
  const [lifetime, setLifetime] = useState<LifetimeStats>({ total_paid: 0, total_pending: 0, next_payout_date: '' });
  const [loading, setLoading] = useState(true);
  const [referralFilter, setReferralFilter] = useState<ReferralFilter>('all');
  const [connectLoading, setConnectLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showCustomize, setShowCustomize] = useState(false);
  const [customCode, setCustomCode] = useState('');
  const [customizeLoading, setCustomizeLoading] = useState(false);
  const [showCommissionDetails, setShowCommissionDetails] = useState(false);
  const [expandedAsset, setExpandedAsset] = useState<string | null>(null);
  const [copiedAssetKey, setCopiedAssetKey] = useState<string | null>(null);

  // ── Data Loading ──

  const loadDashboard = useCallback(async () => {
    try {
      const res = await fetch('/api/ambassador/dashboard');
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();
      setAmbassador(data.ambassador);
      setStats(data.stats);
      setPending(data.pending || { total: 0, count: 0 });
    } catch {
      // Not enrolled
    } finally {
      setLoading(false);
    }
  }, []);

  const loadReferrals = useCallback(async (filter: ReferralFilter) => {
    try {
      const url = filter === 'all' ? '/api/ambassador/referrals' : `/api/ambassador/referrals?status=${filter}`;
      const res = await fetch(url);
      if (!res.ok) return;
      const data = await res.json();
      setReferrals(data.referrals || []);
      setReferralSummary(data.summary || { total: 0, signed_up: 0, converted: 0, churned: 0, expired: 0 });
    } catch {
      // Non-fatal
    }
  }, []);

  const loadPayouts = useCallback(async () => {
    try {
      const res = await fetch('/api/ambassador/payouts');
      if (!res.ok) return;
      const data = await res.json();
      setPayouts(data.payouts || []);
      setLifetime(data.lifetime || { total_paid: 0, total_pending: 0, next_payout_date: '' });
    } catch {
      // Non-fatal
    }
  }, []);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  useEffect(() => {
    if (ambassador) {
      loadReferrals(referralFilter);
      loadPayouts();
    }
  }, [ambassador, referralFilter, loadReferrals, loadPayouts]);

  // ── Actions ──

  const referralLink = ambassador
    ? `${process.env.NEXT_PUBLIC_APP_URL || 'https://sunstonepj.app'}/join/${ambassador.referral_code}`
    : '';

  const copyLink = () => {
    navigator.clipboard.writeText(referralLink);
    setCopied(true);
    toast.success('Link copied!');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleConnectSetup = async () => {
    setConnectLoading(true);
    try {
      const res = await fetch('/api/ambassador/connect', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed to start payout setup'); return; }
      window.location.href = data.url;
    } catch { toast.error('Failed to start payout setup'); }
    finally { setConnectLoading(false); }
  };

  const handleConnectLogin = async () => {
    try {
      const res = await fetch('/api/ambassador/connect/login');
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed to open dashboard'); return; }
      window.open(data.url, '_blank');
    } catch { toast.error('Failed to open dashboard'); }
  };

  const handleCustomizeCode = async () => {
    if (!customCode.trim()) return;
    setCustomizeLoading(true);
    try {
      const res = await fetch('/api/ambassador/customize-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: customCode.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Failed to update code'); return; }
      toast.success('Referral code updated!');
      setShowCustomize(false);
      setCustomCode('');
      await loadDashboard();
    } catch { toast.error('Failed to update code'); }
    finally { setCustomizeLoading(false); }
  };

  const getNextPayoutDate = () => {
    if (lifetime.next_payout_date) return new Date(lifetime.next_payout_date + 'T00:00:00');
    const now = new Date();
    return now.getDate() < 15
      ? new Date(now.getFullYear(), now.getMonth(), 15)
      : new Date(now.getFullYear(), now.getMonth() + 1, 15);
  };

  // ── Loading State ──

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 bg-[var(--surface-raised)] rounded w-64 animate-pulse" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <div key={i} className="h-24 bg-[var(--surface-raised)] rounded-xl animate-pulse" />)}
        </div>
        <div className="h-48 bg-[var(--surface-raised)] rounded-xl animate-pulse" />
      </div>
    );
  }

  if (!ambassador) return null;

  // ── Marketing Assets ──
  const marketingAssets = ambassador ? getMarketingAssets(referralLink) : [];

  const copyAssetText = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedAssetKey(key);
    toast.success('Copied!');
    setTimeout(() => setCopiedAssetKey(null), 2000);
  };

  // ── Earned This Month ──
  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  // We approximate from pending count — actual monthly breakdown would need commission_entries query
  const earnedThisMonth = pending.total; // Pending commissions are current period

  // ── Render ──

  return (
    <div className="space-y-6">

      {/* Section 1: Overview Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="p-4">
          <p className="text-xs text-[var(--text-tertiary)] uppercase tracking-wider">Total Earned</p>
          <p className="text-2xl font-bold text-emerald-600 mt-1">${(stats?.totalEarned || 0).toFixed(2)}</p>
          <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5">all time</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-[var(--text-tertiary)] uppercase tracking-wider">Paid Out</p>
          <p className="text-2xl font-bold text-[var(--text-primary)] mt-1">${lifetime.total_paid.toFixed(2)}</p>
          <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5">lifetime</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-[var(--text-tertiary)] uppercase tracking-wider">Pending Payout</p>
          <p className="text-2xl font-bold text-[var(--accent-600)] mt-1">${pending.total.toFixed(2)}</p>
          <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5">
            Next: {format(getNextPayoutDate(), 'MMM d')}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-[var(--text-tertiary)] uppercase tracking-wider">Active Referrals</p>
          <p className="text-2xl font-bold text-[var(--text-primary)] mt-1">{referralSummary.converted}</p>
          <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5">earning commission</p>
        </Card>
      </div>

      {/* Section 2: Referral Link */}
      <Card className="p-6 space-y-4">
        <div>
          <p className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider mb-1">Your Referral Link</p>
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-[var(--surface-base)] border border-[var(--border-default)] rounded-lg px-3 py-2.5 text-sm text-[var(--text-primary)] truncate select-all">
              {referralLink}
            </div>
            <Button variant="primary" size="sm" onClick={copyLink} className="shrink-0 min-h-[44px]">
              {copied ? 'Copied!' : 'Copy'}
            </Button>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <p className="text-xs text-[var(--text-tertiary)]">
            Your Code: <span className="font-medium text-[var(--text-secondary)] uppercase">{ambassador.referral_code}</span>
          </p>
          <button
            onClick={() => setShowCustomize(!showCustomize)}
            className="text-xs text-[var(--accent-600)] hover:text-[var(--accent-700)] font-medium min-h-[44px] px-2"
          >
            {showCustomize ? 'Cancel' : 'Customize Code'}
          </button>
        </div>

        {/* Inline customize form */}
        {showCustomize && (
          <div className="flex items-center gap-2 pt-1">
            <input
              type="text"
              value={customCode}
              onChange={(e) => setCustomCode(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
              placeholder="my-custom-code"
              className="flex-1 h-11 px-3 rounded-lg border border-[var(--border-default)] bg-[var(--surface-base)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-500)] focus:ring-2 focus:ring-[var(--accent-500)]/20"
              maxLength={50}
            />
            <Button
              variant="primary"
              size="sm"
              onClick={handleCustomizeCode}
              loading={customizeLoading}
              disabled={!customCode.trim() || customCode.trim().length < 3}
              className="shrink-0 min-h-[44px]"
            >
              Save
            </Button>
          </div>
        )}

        <p className="text-xs text-[var(--text-tertiary)]">
          Share this link with PJ artists. When they sign up and subscribe, you earn 20% of their monthly billing for 8 months.
        </p>
      </Card>

      {/* Section 3: Stripe Connect Status */}
      {!ambassador.stripe_connect_onboarded ? (
        <Card className="p-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-full bg-[var(--accent-50)] flex items-center justify-center shrink-0">
              <svg className="w-6 h-6 text-[var(--accent-600)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">Set Up Your Payouts</h3>
              <p className="text-sm text-[var(--text-secondary)] mt-1">
                Connect your bank account to receive commission payments. Takes about 2 minutes.
              </p>
              <Button variant="primary" size="sm" onClick={handleConnectSetup} loading={connectLoading} className="mt-3 min-h-[44px]">
                Connect Bank Account
              </Button>
            </div>
          </div>
        </Card>
      ) : (
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center shrink-0">
                <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-sm text-[var(--text-primary)]">Payouts active — bank account connected</p>
            </div>
            <button onClick={handleConnectLogin} className="text-xs text-[var(--accent-600)] hover:text-[var(--accent-700)] font-medium min-h-[44px] px-3">
              Manage payout settings
            </button>
          </div>
        </Card>
      )}

      {/* Section 4: Share & Promote */}
      <Card className="overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-[var(--accent-50)] flex items-center justify-center shrink-0">
            <svg className="w-4 h-4 text-[var(--accent-600)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 110-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253.962.584 1.892.985 2.783.247.55.06 1.21-.463 1.511l-.657.38c-.551.318-1.26.117-1.527-.461a20.845 20.845 0 01-1.44-4.282m3.102.069a18.03 18.03 0 01-.59-4.59c0-1.586.205-3.124.59-4.59m0 9.18a23.848 23.848 0 018.835 2.535M10.34 6.66a23.847 23.847 0 008.835-2.535m0 0A23.74 23.74 0 0018.795 3m.38 1.125a23.91 23.91 0 011.014 5.395m-1.014 8.855c-.118.38-.245.754-.38 1.125m.38-1.125a23.91 23.91 0 001.014-5.395m0-3.46c.495.413.811 1.035.811 1.73 0 .695-.316 1.317-.811 1.73m0-3.46a24.347 24.347 0 010 3.46" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">Share & Promote</h3>
            <p className="text-xs text-[var(--text-tertiary)]">Ready-made content to share Sunstone Studio with your audience</p>
          </div>
        </div>

        <div className="divide-y divide-[var(--border-subtle)]">
          {marketingAssets.map((asset) => (
            <div key={asset.id}>
              <button
                onClick={() => setExpandedAsset(expandedAsset === asset.id ? null : asset.id)}
                className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-[var(--surface-raised)]/50 transition-colors min-h-[48px]"
              >
                <span className="text-sm font-medium text-[var(--text-primary)]">{asset.title}</span>
                <svg className={`w-4 h-4 text-[var(--text-tertiary)] transition-transform shrink-0 ${expandedAsset === asset.id ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                </svg>
              </button>

              {expandedAsset === asset.id && (
                <div className="px-4 pb-4 space-y-3">
                  {asset.items.map((item, idx) => {
                    const copyKey = `${asset.id}-${idx}`;
                    return (
                      <div key={idx} className="rounded-lg border border-[var(--border-default)] overflow-hidden">
                        <div className="flex items-center justify-between px-3 py-2 bg-[var(--surface-raised)]">
                          <span className="text-xs font-medium text-[var(--text-secondary)]">{item.label}</span>
                          <button
                            onClick={() => copyAssetText(copyKey, item.text)}
                            className="text-xs font-medium text-[var(--accent-600)] hover:text-[var(--accent-700)] min-h-[36px] px-2"
                          >
                            {copiedAssetKey === copyKey ? 'Copied!' : 'Copy'}
                          </button>
                        </div>
                        <div className="px-3 py-2.5 text-xs text-[var(--text-secondary)] whitespace-pre-wrap leading-relaxed">
                          {item.text}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="px-4 py-3 border-t border-[var(--border-subtle)] bg-[var(--surface-raised)]/50">
          <p className="text-[11px] text-[var(--text-tertiary)]">
            FTC requires you to disclose your ambassador relationship. Add #ad or #sponsored to paid promotions.
          </p>
        </div>
      </Card>

      {/* Section 5: Referrals Table */}
      <Card className="overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border-subtle)]">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">Referrals</h3>
        </div>
        {/* Filter tabs */}
        <div className="flex gap-1 px-4 pt-3 pb-2 overflow-x-auto">
          {([
            { key: 'all' as ReferralFilter, label: 'All', count: referralSummary.total },
            { key: 'signed_up' as ReferralFilter, label: 'In Trial', count: referralSummary.signed_up },
            { key: 'converted' as ReferralFilter, label: 'Active', count: referralSummary.converted },
            { key: 'churned' as ReferralFilter, label: 'Churned', count: referralSummary.churned },
            { key: 'expired' as ReferralFilter, label: 'Expired', count: referralSummary.expired },
          ]).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setReferralFilter(tab.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors min-h-[36px] ${
                referralFilter === tab.key
                  ? 'bg-[var(--accent-600)] text-white'
                  : 'bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:bg-[var(--surface-raised)]/80'
              }`}
            >
              {tab.label}
              {tab.count > 0 && (
                <span className={`ml-1 text-[10px] ${referralFilter === tab.key ? 'text-white/80' : 'text-[var(--text-tertiary)]'}`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Table */}
        {referrals.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <svg className="w-10 h-10 text-[var(--text-tertiary)] mx-auto mb-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
            </svg>
            <p className="text-sm text-[var(--text-tertiary)]">No referrals yet. Share your link to get started!</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            {/* Desktop header */}
            <div className="hidden sm:grid grid-cols-[1fr_80px_90px_90px_100px_80px] gap-3 px-4 py-2 text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider">
              <div>Referred Artist</div>
              <div>Plan</div>
              <div>Status</div>
              <div>Signed Up</div>
              <div className="text-right">Earned</div>
              <div className="text-right">Time Left</div>
            </div>
            <div className="divide-y divide-[var(--border-subtle)]">
              {referrals.map((r, idx) => (
                <div key={r.id} className="px-4 py-3 sm:grid sm:grid-cols-[1fr_80px_90px_90px_100px_80px] sm:gap-3 sm:items-center">
                  {/* Artist name */}
                  <div className="text-sm font-medium text-[var(--text-primary)]">
                    {r.referred_business_name || `Artist #${idx + 1}`}
                  </div>
                  {/* Plan */}
                  <div className="text-xs text-[var(--text-secondary)] capitalize mt-0.5 sm:mt-0">
                    {r.referred_plan || (r.status === 'signed_up' ? 'Trial' : '—')}
                  </div>
                  {/* Status badge */}
                  <div className="mt-1 sm:mt-0">
                    <ReferralStatusBadge status={r.status} />
                  </div>
                  {/* Date */}
                  <div className="text-xs text-[var(--text-tertiary)] mt-0.5 sm:mt-0">
                    {r.signed_up_at ? format(new Date(r.signed_up_at), 'MMM d, yyyy') : format(new Date(r.created_at), 'MMM d, yyyy')}
                  </div>
                  {/* Earned */}
                  <div className="text-sm text-right text-[var(--text-primary)] font-medium mt-0.5 sm:mt-0">
                    {r.total_commission_earned > 0 ? `$${r.total_commission_earned.toFixed(2)}` : '—'}
                  </div>
                  {/* Time left */}
                  <div className="text-xs text-right text-[var(--text-tertiary)] mt-0.5 sm:mt-0">
                    {r.months_remaining != null && r.months_remaining > 0 ? `${r.months_remaining}mo` : '—'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* Section 6: Payout History */}
      <Card className="overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">Payout History</h3>
          {ambassador.stripe_connect_onboarded && (
            <button onClick={handleConnectLogin} className="text-xs text-[var(--accent-600)] hover:text-[var(--accent-700)] font-medium min-h-[44px] px-2">
              View tax documents
            </button>
          )}
        </div>
        {payouts.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <svg className="w-10 h-10 text-[var(--text-tertiary)] mx-auto mb-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
            </svg>
            <p className="text-sm text-[var(--text-tertiary)]">No payouts yet. Commissions are paid monthly on the 15th (minimum $25).</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div className="hidden sm:grid grid-cols-[100px_100px_100px_80px] gap-3 px-4 py-2 text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider">
              <div>Date</div>
              <div className="text-right">Amount</div>
              <div className="text-right">Commissions</div>
              <div className="text-right">Status</div>
            </div>
            <div className="divide-y divide-[var(--border-subtle)]">
              {payouts.map((p) => (
                <div key={p.id} className="px-4 py-3 sm:grid sm:grid-cols-[100px_100px_100px_80px] sm:gap-3 sm:items-center">
                  <div className="text-sm text-[var(--text-primary)]">
                    {p.processed_at ? format(new Date(p.processed_at), 'MMM d, yyyy') : format(new Date(p.scheduled_for), 'MMM d, yyyy')}
                  </div>
                  <div className="text-sm text-right font-medium text-[var(--text-primary)]">${p.total_amount.toFixed(2)}</div>
                  <div className="text-sm text-right text-[var(--text-secondary)]">{p.commission_count}</div>
                  <div className="text-right mt-1 sm:mt-0">
                    <PayoutStatusBadge status={p.status} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* Section 7: Commission Details (collapsible) */}
      <div>
        <button
          onClick={() => setShowCommissionDetails(!showCommissionDetails)}
          className="flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors min-h-[48px]"
        >
          <svg className={`w-4 h-4 transition-transform ${showCommissionDetails ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
          How commissions work
        </button>

        {showCommissionDetails && (
          <Card className="p-6 mt-2 space-y-4">
            <div className="max-w-sm">
              <div className="rounded-xl border border-[var(--border-default)] overflow-hidden">
                <div className="grid grid-cols-3 gap-0 text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider bg-[var(--surface-raised)] px-4 py-2">
                  <div>Plan</div>
                  <div className="text-right">Price</div>
                  <div className="text-right">You Earn</div>
                </div>
                {[
                  { plan: 'Starter', price: '$99', earn: '$19.80' },
                  { plan: 'Pro', price: '$169', earn: '$33.80' },
                  { plan: 'Business', price: '$279', earn: '$55.80' },
                ].map((row) => (
                  <div key={row.plan} className="grid grid-cols-3 gap-0 px-4 py-2.5 border-t border-[var(--border-subtle)] text-sm">
                    <div className="text-[var(--text-primary)] font-medium">{row.plan}</div>
                    <div className="text-right text-[var(--text-secondary)]">{row.price}/mo</div>
                    <div className="text-right text-[var(--accent-600)] font-semibold">{row.earn}/mo</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="text-xs text-[var(--text-tertiary)] space-y-1">
              <p>Commission rate: 20% for 8 months from each referral&apos;s first payment.</p>
              <p>Payouts processed on the 15th of each month. Minimum payout: $25.</p>
              <p>Commissions below the minimum roll over to the next month.</p>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

// ── Helper Components ──

function ReferralStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    clicked: 'bg-gray-50 text-gray-600 border-gray-200',
    signed_up: 'bg-blue-50 text-blue-700 border-blue-200',
    converted: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    churned: 'bg-red-50 text-red-600 border-red-200',
    expired: 'bg-amber-50 text-amber-600 border-amber-200',
  };
  const labels: Record<string, string> = {
    clicked: 'Clicked',
    signed_up: 'In Trial',
    converted: 'Active',
    churned: 'Churned',
    expired: 'Expired',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${styles[status] || styles.clicked}`}>
      {labels[status] || status}
    </span>
  );
}

function PayoutStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    paid: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    pending: 'bg-amber-50 text-amber-600 border-amber-200',
    processing: 'bg-blue-50 text-blue-700 border-blue-200',
    failed: 'bg-red-50 text-red-600 border-red-200',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${styles[status] || styles.pending}`}>
      {status}
    </span>
  );
}
