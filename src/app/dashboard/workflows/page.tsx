'use client';

import { useTenant } from '@/hooks/use-tenant';
import UpgradePrompt from '@/components/ui/UpgradePrompt';

export default function WorkflowsPage() {
  const { tenant, isLoading } = useTenant();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-[var(--accent-500)] border-t-transparent" />
      </div>
    );
  }

  if (!tenant?.crm_enabled) {
    return (
      <div className="max-w-2xl mx-auto py-12">
        <UpgradePrompt
          feature="Automated Workflows"
          description="Set up aftercare sequences, follow-up reminders, birthday automations, and more — all running automatically in the background."
          variant="inline"
        />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Workflows</h1>
          <p className="text-[var(--text-tertiary)] mt-1">Automated sequences and reminders for your clients</p>
        </div>
      </div>

      {/* Coming soon placeholder */}
      <div className="bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-xl p-12 text-center">
        <div className="w-16 h-16 rounded-full bg-[var(--accent-50)] flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-[var(--accent-500)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-2">Workflows Coming Soon</h2>
        <p className="text-sm text-[var(--text-secondary)] max-w-md mx-auto">
          Automated aftercare sequences, follow-up reminders, birthday messages, and re-engagement campaigns — all running in the background while you focus on welding.
        </p>
      </div>
    </div>
  );
}
