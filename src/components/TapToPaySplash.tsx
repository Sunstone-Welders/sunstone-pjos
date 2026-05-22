// ============================================================================
// TapToPaySplash — One-time discovery screen (Apple Requirement 5.6.2)
// ============================================================================
// Shown once per tenant when:
//   - Running in native app on compatible device
//   - Stripe or Square is connected
//   - tap_to_pay_splash_shown is false
//   - User is admin/owner
// ============================================================================

'use client';

interface TapToPaySplashProps {
  onSetUpNow: () => void;
  onDismiss: () => void;
}

export default function TapToPaySplash({ onSetUpNow, onDismiss }: TapToPaySplashProps) {
  return (
    <>
      {/* Backdrop — semi-transparent overlay over the dashboard. Tapping it
          dismisses the splash, same as "Maybe Later". */}
      <div
        className="fixed inset-0 z-[60] bg-black/50"
        onClick={onDismiss}
        aria-hidden="true"
      />
      {/* Modal */}
      <div className="fixed inset-0 z-[61] flex items-center justify-center p-6 pointer-events-none">
        <div
          className="w-full max-w-sm text-center space-y-6 bg-[var(--surface-raised)] rounded-3xl p-8 shadow-[var(--shadow-card)] pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
        >
        {/* Contactless icon */}
        <div className="flex justify-center">
          <div className="w-28 h-28 rounded-full bg-[color-mix(in_srgb,var(--accent-primary)_12%,transparent)] flex items-center justify-center">
            <svg className="w-16 h-16 text-[var(--accent-primary)]" viewBox="0 0 64 64" fill="none">
              <rect x="12" y="16" width="40" height="32" rx="6" stroke="currentColor" strokeWidth="2" />
              <rect x="18" y="22" width="8" height="6" rx="1.5" fill="currentColor" opacity="0.3" />
              <path d="M40 32c0-2.2 1.8-4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M40 32c0-4.4 3.6-8 8-8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M40 32c0-6.6 5.4-12 12-12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
        </div>

        {/* Badge */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold tracking-wide uppercase"
          style={{ backgroundColor: 'color-mix(in srgb, var(--accent-primary) 15%, transparent)', color: 'var(--accent-primary)' }}
        >
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
          New
        </div>

        {/* Heading + description */}
        <div className="space-y-3">
          <h2 className="text-2xl font-bold text-[var(--text-primary)] font-[family-name:var(--font-display)]">
            Tap to Pay
          </h2>
          <p className="text-base text-[var(--text-secondary)] leading-relaxed">
            Accept contactless payments right from your phone.
          </p>
          <p className="text-sm text-[var(--text-tertiary)]">
            Credit cards, debit cards, Apple Pay, Google Pay — no reader needed.
          </p>
        </div>

        {/* Actions */}
        <div className="space-y-3 pt-2">
          <button
            onClick={onSetUpNow}
            className="w-full h-14 rounded-xl font-semibold text-base text-white transition-all active:scale-[0.97] min-h-[48px]"
            style={{ backgroundColor: 'var(--accent-primary)' }}
          >
            Set Up Now
          </button>
          <button
            onClick={onDismiss}
            className="w-full h-12 rounded-xl font-medium text-sm text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors min-h-[48px]"
          >
            Maybe Later
          </button>
        </div>
        </div>
      </div>
    </>
  );
}
