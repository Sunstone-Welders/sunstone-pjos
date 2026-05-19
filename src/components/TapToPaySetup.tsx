// ============================================================================
// TapToPaySetup — Full setup flow overlay
// ============================================================================
// Steps: T&C acceptance → Education screens → Configuration progress → Done
// Usable from Settings and inline from PaymentScreen.
// ============================================================================

'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { presentTermsAndConditions, getConfigurationProgress } from '@/lib/tap-to-pay';
import TapToPayEducation from '@/components/TapToPayEducation';
import { toast } from 'sonner';

type SetupStep = 'terms' | 'education' | 'configuring' | 'done';

interface TapToPaySetupProps {
  tenantId: string;
  userId: string;
  processor: string;         // 'Stripe', 'Square', or 'Stripe and Square'
  onComplete: () => void;    // Called when setup finishes
  onClose: () => void;       // Called when user dismisses
}

export default function TapToPaySetup({
  tenantId,
  userId,
  processor,
  onComplete,
  onClose,
}: TapToPaySetupProps) {
  const [step, setStep] = useState<SetupStep>('terms');
  const [accepting, setAccepting] = useState(false);
  const [progress, setProgress] = useState(0);

  // ── T&C acceptance ──
  const handleAcceptTerms = async () => {
    setAccepting(true);
    try {
      // Call native stub — will be replaced by real SDK call
      const accepted = await presentTermsAndConditions();

      // For the UX shell, proceed regardless of stub result
      // In production, this will gate on actual acceptance
      const supabase = createClient();
      await supabase
        .from('tenants')
        .update({
          tap_to_pay_terms_accepted_at: new Date().toISOString(),
          tap_to_pay_terms_accepted_by: userId,
        })
        .eq('id', tenantId);

      setStep('education');
    } catch {
      toast.error('Could not complete Terms & Conditions. Please try again.');
    } finally {
      setAccepting(false);
    }
  };

  // ── Configuration progress simulation ──
  useEffect(() => {
    if (step !== 'configuring') return;

    // Poll progress from native SDK stub
    const interval = setInterval(async () => {
      const p = await getConfigurationProgress();
      // Stub returns 0, simulate progress for UX shell
      setProgress((prev) => {
        const next = Math.min(prev + 15, 100);
        if (next >= 100) {
          clearInterval(interval);
          setTimeout(() => setStep('done'), 400);
        }
        return next;
      });
    }, 500);

    return () => clearInterval(interval);
  }, [step]);

  // ── Education complete → configuration ──
  const handleEducationComplete = () => {
    setStep('configuring');
  };

  // ── Done → enable and close ──
  const handleFinish = async () => {
    const supabase = createClient();
    await supabase
      .from('tenants')
      .update({ tap_to_pay_enabled: true })
      .eq('id', tenantId);
    onComplete();
  };

  // ── Education screens ──
  if (step === 'education') {
    return (
      <TapToPayEducation
        onComplete={handleEducationComplete}
        onClose={onClose}
      />
    );
  }

  // ── Overlay container ──
  return (
    <div className="fixed inset-0 z-[70] bg-[var(--surface-base)] flex flex-col items-center justify-center px-8">
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 w-10 h-10 rounded-full bg-[var(--surface-subtle)] flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {/* ── Step: Terms & Conditions ── */}
      {step === 'terms' && (
        <div className="w-full max-w-sm text-center space-y-6">
          {/* Icon */}
          <div className="flex justify-center">
            <div className="w-20 h-20 rounded-full bg-[color-mix(in_srgb,var(--accent-primary)_12%,transparent)] flex items-center justify-center">
              <svg className="w-10 h-10 text-[var(--accent-primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
              </svg>
            </div>
          </div>

          <div className="space-y-2">
            <h2 className="text-xl font-bold text-[var(--text-primary)] font-[family-name:var(--font-display)]">
              Terms & Conditions
            </h2>
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
              To use Tap to Pay, you need to accept the Terms and Conditions from your payment processor.
            </p>
            <p className="text-xs text-[var(--text-tertiary)]">
              Connected via {processor}
            </p>
          </div>

          <button
            onClick={handleAcceptTerms}
            disabled={accepting}
            className="w-full h-14 rounded-xl font-semibold text-base text-white transition-all active:scale-[0.97] disabled:opacity-60 min-h-[48px]"
            style={{ backgroundColor: 'var(--accent-primary)' }}
          >
            {accepting ? 'Loading...' : 'Accept Terms & Conditions'}
          </button>
        </div>
      )}

      {/* ── Step: Configuring ── */}
      {step === 'configuring' && (
        <div className="w-full max-w-sm text-center space-y-6">
          <div className="flex justify-center">
            <div className="w-16 h-16 animate-spin rounded-full border-4 border-[var(--border-default)] border-t-[var(--accent-primary)]" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-[var(--text-primary)] font-[family-name:var(--font-display)]">
              Setting Up Tap to Pay
            </h2>
            <p className="text-sm text-[var(--text-secondary)]">
              Configuring your device for contactless payments...
            </p>
          </div>
          {/* Progress bar */}
          <div className="w-full bg-[var(--border-default)] rounded-full h-2 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${progress}%`, backgroundColor: 'var(--accent-primary)' }}
            />
          </div>
          <p className="text-xs text-[var(--text-tertiary)]">{progress}% complete</p>
        </div>
      )}

      {/* ── Step: Done ── */}
      {step === 'done' && (
        <div className="w-full max-w-sm text-center space-y-6">
          <div className="flex justify-center">
            <div className="w-20 h-20 rounded-full bg-green-50 flex items-center justify-center">
              <svg className="w-10 h-10 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-[var(--text-primary)] font-[family-name:var(--font-display)]">
              You&apos;re All Set!
            </h2>
            <p className="text-sm text-[var(--text-secondary)]">
              Tap to Pay is ready to use. Look for the Tap to Pay button at checkout.
            </p>
          </div>
          <button
            onClick={handleFinish}
            className="w-full h-14 rounded-xl font-semibold text-base text-white transition-all active:scale-[0.97] min-h-[48px]"
            style={{ backgroundColor: 'var(--accent-primary)' }}
          >
            Done
          </button>
        </div>
      )}
    </div>
  );
}
