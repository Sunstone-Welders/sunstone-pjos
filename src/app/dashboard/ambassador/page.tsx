// ============================================================================
// Artist Ambassador Dashboard — src/app/dashboard/ambassador/page.tsx
// ============================================================================
// In-app ambassador page: enrollment CTA, upgrade prompt, or full dashboard
// (via shared AmbassadorDashboardContent component).
// ============================================================================

'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useTenant } from '@/hooks/use-tenant';
import { Button, Card } from '@/components/ui';
import { toast } from 'sonner';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import AmbassadorDashboardContent from '@/components/ambassador/AmbassadorDashboardContent';

export default function AmbassadorPage() {
  return (
    <Suspense>
      <AmbassadorPageInner />
    </Suspense>
  );
}

function AmbassadorPageInner() {
  const { tenant } = useTenant();
  const searchParams = useSearchParams();
  const [ambassador, setAmbassador] = useState<{ id: string; commission_rate?: number; commission_duration_months?: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const res = await fetch('/api/ambassador/dashboard');
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();
      setAmbassador(data.ambassador);
    } catch {
      // Not enrolled — that's ok
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Handle ?connect=complete or ?connect=refresh from Stripe return
  useEffect(() => {
    const connectParam = searchParams.get('connect');
    if (!connectParam) return;

    if (connectParam === 'complete') {
      fetch('/api/ambassador/connect/status')
        .then((r) => r.json())
        .then((data) => {
          if (data.onboarded) {
            toast.success('Payouts connected! You\'ll receive monthly payouts on the 15th.');
            loadData();
          } else {
            toast.error('Payout setup is incomplete. Please try again.');
          }
        })
        .catch(() => toast.error('Failed to verify payout setup'));

      window.history.replaceState({}, '', '/dashboard/ambassador');
    } else if (connectParam === 'refresh') {
      toast('Please complete your payout setup to receive commissions.');
      window.history.replaceState({}, '', '/dashboard/ambassador');
    }
  }, [searchParams, loadData]);

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

  // ── Not on a paid plan and not already an ambassador — show upgrade prompt ──
  const hasPaidPlan = tenant?.subscription_status === 'active' || !!tenant?.stripe_subscription_id;
  if (!ambassador && !hasPaidPlan) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Ambassador Program</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">Earn commission by referring PJ artists to Sunstone Studio</p>
        </div>

        <Card className="p-8 text-center space-y-6">
          <div className="w-16 h-16 rounded-full bg-[var(--accent-50)] flex items-center justify-center mx-auto">
            <svg className="w-8 h-8 text-[var(--accent-600)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-semibold text-[var(--text-primary)]">Upgrade to Unlock</h2>
            <p className="text-sm text-[var(--text-secondary)] mt-2 max-w-md mx-auto">
              The Ambassador Program is available to artists on a paid Sunstone plan. Choose a plan to start earning commissions on referrals.
            </p>
          </div>
          <Link href="/dashboard/settings?tab=subscription">
            <Button variant="primary" size="lg" className="min-h-[48px]">
              View Plans
            </Button>
          </Link>
        </Card>
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

  // ── Enrolled — show full dashboard ──
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Ambassador Program</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">Share your link and earn commission on referrals</p>
      </div>

      <AmbassadorDashboardContent />
    </div>
  );
}
