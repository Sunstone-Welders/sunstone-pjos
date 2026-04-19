// ============================================================================
// UpgradePrompt — src/components/ui/UpgradePrompt.tsx
// ============================================================================
// Reusable component shown when a Starter-tier user hits a gated feature.
// Two variants: 'inline' (card replacing content) and 'banner' (top strip)
// Design: Premium invitation, not pushy. Luxury brand — calm confidence.
// ============================================================================

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, Button } from '@/components/ui';
import { canShowBillingUI } from '@/lib/billing-gate';

interface UpgradePromptProps {
  /** Display name of the gated feature */
  feature: string;
  /** 'inline' replaces content area; 'banner' is a slim top strip */
  variant: 'inline' | 'banner';
  /** Optional description of the feature value */
  description?: string;
  /** If true, shows "Your Pro trial has ended" messaging */
  trialExpired?: boolean;
}

export default function UpgradePrompt({ feature, variant, description, trialExpired }: UpgradePromptProps) {
  const router = useRouter();
  const [dismissed, setDismissed] = useState(false);

  // Hide upgrade prompts entirely on native — no pricing/purchase messaging allowed
  if (!canShowBillingUI()) return null;

  const navigateToPlans = () => {
    router.push('/dashboard/settings?tab=subscription');
  };

  // ── Banner variant ──
  if (variant === 'banner') {
    if (dismissed) return null;

    return (
      <div className="bg-gradient-to-r from-[var(--accent-50,#fdf2f8)] to-[var(--surface-raised)] border-b border-[var(--border-default)] px-4 py-2.5 flex items-center justify-between gap-3">
        <p className="text-sm text-[var(--text-secondary)] flex-1 min-w-0">
          <span className="hidden sm:inline">You&apos;re on the Starter plan. </span>
          Upgrade to Pro to unlock <span className="font-medium text-[var(--text-primary)]">{feature}</span>.
        </p>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="primary" size="sm" onClick={navigateToPlans}>
            Upgrade
          </Button>
          <button
            onClick={() => setDismissed(true)}
            className="p-1 rounded-md text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)] transition-colors"
            aria-label="Dismiss"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    );
  }

  // ── Inline variant ──
  return (
    <Card>
      <CardContent className="py-8 px-6">
        <div className="flex flex-col items-center text-center max-w-sm mx-auto">
          {/* Lock icon */}
          <div className="w-12 h-12 rounded-full bg-[var(--accent-50,#fdf2f8)] flex items-center justify-center mb-4">
            <svg
              className="w-6 h-6 text-[var(--accent-500)]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
              />
            </svg>
          </div>

          <h3
            className="text-lg font-semibold text-[var(--text-primary)] mb-1"
            style={{ fontFamily: 'var(--font-display, Fraunces, serif)' }}
          >
            {feature}
          </h3>

          {description && (
            <p className="text-sm text-[var(--text-secondary)] mb-4 leading-relaxed">
              {description}
            </p>
          )}

          {trialExpired && (
            <p className="text-xs text-amber-600 mb-4">
              Your Pro trial has ended. Upgrade to keep these features.
            </p>
          )}

          <Button variant="primary" onClick={navigateToPlans}>
            Upgrade to Pro
          </Button>

          <p className="text-xs text-[var(--text-tertiary)] mt-3">
            Available on Pro ($169/mo) and Business ($279/mo)
          </p>
        </div>
      </CardContent>
    </Card>
  );
}