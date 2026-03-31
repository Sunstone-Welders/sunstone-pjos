// ============================================================================
// Artist Ambassador Dashboard — src/app/dashboard/ambassador/page.tsx
// ============================================================================
// In-app ambassador page: enrollment CTA or basic dashboard with
// referral link, stats, and referral list.
// ============================================================================

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTenant } from '@/hooks/use-tenant';
import { Button, Card } from '@/components/ui';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface AmbassadorData {
  id: string;
  type: string;
  status: string;
  name: string;
  referral_code: string;
  created_at: string;
}

interface ReferralData {
  id: string;
  status: string;
  attribution_source: string | null;
  created_at: string;
  signed_up_at: string | null;
  converted_at: string | null;
  total_commission_earned: number;
}

interface DashboardStats {
  totalClicks: number;
  totalSignups: number;
  totalConverted: number;
  totalEarned: number;
  totalPaid: number;
}

export default function AmbassadorPage() {
  const { tenant } = useTenant();
  const [ambassador, setAmbassador] = useState<AmbassadorData | null>(null);
  const [referrals, setReferrals] = useState<ReferralData[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState(false);
  const [copied, setCopied] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const res = await fetch('/api/ambassador/dashboard');
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();
      setAmbassador(data.ambassador);
      setReferrals(data.referrals || []);
      setStats(data.stats);
    } catch {
      // Not enrolled — that's ok
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleEnroll = async () => {
    setEnrolling(true);
    try {
      const res = await fetch('/api/ambassador/enroll', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Failed to enroll');
        return;
      }
      toast.success('Welcome to the Ambassador Program!');
      await loadData();
    } catch {
      toast.error('Failed to enroll');
    } finally {
      setEnrolling(false);
    }
  };

  const referralLink = ambassador
    ? `${process.env.NEXT_PUBLIC_APP_URL || 'https://sunstonepj.app'}/join/${ambassador.referral_code}`
    : '';

  const copyLink = () => {
    navigator.clipboard.writeText(referralLink);
    setCopied(true);
    toast.success('Link copied!');
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-[var(--surface-raised)] rounded w-64" />
          <div className="h-48 bg-[var(--surface-raised)] rounded-xl" />
        </div>
      </div>
    );
  }

  // ── Not enrolled — show invitation ──
  if (!ambassador) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Ambassador Program</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">Earn commission by referring PJ artists to Sunstone Studio</p>
        </div>

        <Card className="p-8 text-center space-y-6">
          {/* Gift icon */}
          <div className="w-16 h-16 rounded-full bg-[var(--accent-50)] flex items-center justify-center mx-auto">
            <svg className="w-8 h-8 text-[var(--accent-600)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 11.25v8.25a1.5 1.5 0 01-1.5 1.5H5.25a1.5 1.5 0 01-1.5-1.5v-8.25M12 4.875A2.625 2.625 0 109.375 7.5H12m0-2.625V7.5m0-2.625A2.625 2.625 0 1114.625 7.5H12m0 0V21m-8.625-9.75h18c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125h-18c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
            </svg>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-[var(--text-primary)]">Earn 20% Commission</h2>
            <p className="text-sm text-[var(--text-secondary)] mt-2 max-w-md mx-auto">
              Share Sunstone Studio with other PJ artists and earn 20% of their monthly subscription for 8 months.
            </p>
          </div>

          {/* Commission table */}
          <div className="max-w-sm mx-auto">
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

          <Button variant="primary" size="lg" onClick={handleEnroll} loading={enrolling} className="min-h-[48px]">
            Become an Ambassador
          </Button>
        </Card>
      </div>
    );
  }

  // ── Enrolled — show dashboard ──
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Ambassador Program</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">Share your link and earn commission on referrals</p>
      </div>

      {/* Referral Link Card */}
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
        <div>
          <p className="text-xs text-[var(--text-tertiary)]">
            Referral Code: <span className="font-medium text-[var(--text-secondary)]">{ambassador.referral_code}</span>
          </p>
        </div>
      </Card>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Clicks', value: stats.totalClicks },
            { label: 'Signups', value: stats.totalSignups },
            { label: 'Converted', value: stats.totalConverted },
            { label: 'Earned', value: `$${stats.totalEarned.toFixed(2)}` },
          ].map((s) => (
            <Card key={s.label} className="p-4">
              <p className="text-xs text-[var(--text-tertiary)] uppercase tracking-wider">{s.label}</p>
              <p className="text-xl font-bold text-[var(--text-primary)] mt-1">{s.value}</p>
            </Card>
          ))}
        </div>
      )}

      {/* Referrals List */}
      <Card className="overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border-subtle)]">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">Referrals</h3>
        </div>
        {referrals.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-[var(--text-tertiary)]">
            No referrals yet. Share your link to get started!
          </div>
        ) : (
          <div className="divide-y divide-[var(--border-subtle)]">
            {referrals.map((r) => (
              <div key={r.id} className="px-4 py-3 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${
                      r.status === 'converted' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                      r.status === 'signed_up' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                      r.status === 'clicked' ? 'bg-gray-50 text-gray-600 border-gray-200' :
                      'bg-gray-50 text-gray-500 border-gray-200'
                    }`}>
                      {r.status.replace('_', ' ')}
                    </span>
                    {r.attribution_source && (
                      <span className="text-[11px] text-[var(--text-tertiary)]">{r.attribution_source.replace('_', ' ')}</span>
                    )}
                  </div>
                  <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
                    {format(new Date(r.created_at), 'MMM d, yyyy')}
                  </p>
                </div>
                {Number(r.total_commission_earned) > 0 && (
                  <span className="text-sm font-medium text-[var(--accent-600)]">
                    ${Number(r.total_commission_earned).toFixed(2)}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Coming soon note */}
      <div className="text-center text-xs text-[var(--text-tertiary)] py-4">
        Full earnings dashboard and payout tracking coming soon.
      </div>
    </div>
  );
}
