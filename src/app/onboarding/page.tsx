'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { TenantProvider, useTenant } from '@/hooks/use-tenant';
import { ThemeProvider } from '@/components/themeprovider';
import { THEMES } from '@/lib/themes';
import { applyTheme } from '@/lib/theme';
import { getThemeById } from '@/lib/themes';
import { Button, Input } from '@/components/ui';

// ============================================================================
// Constants
// ============================================================================

const TOTAL_STEPS = 8; // 0-7 (was 9, removed business type)

const EXPERIENCE_LEVELS = [
  { value: 'just_starting', label: 'Just starting' },
  { value: 'less_than_1', label: 'Less than 1 year' },
  { value: '1_to_3', label: '1-3 years' },
  { value: '3_plus', label: '3+ years' },
];

const KITS = [
  {
    id: 'momentum',
    name: 'Momentum',
    tagline: '$2,399 — 7 chains',
    chains: 7,
    jumpRings: 50,
    connectors: false,
  },
  {
    id: 'dream',
    name: 'Dream',
    tagline: '$3,199 — 9 chains',
    chains: 9,
    jumpRings: 100,
    connectors: true,
  },
  {
    id: 'legacy',
    name: 'Legacy',
    tagline: '$4,999 — 15 chains',
    chains: 15,
    jumpRings: 200,
    connectors: true,
  },
];

const PRICING_OPTIONS = [
  {
    id: 'by_type',
    label: 'By product type',
    description: 'Set a flat price for bracelets, anklets, etc.',
  },
  {
    id: 'by_metal',
    label: 'By metal',
    description: 'Different prices for silver vs gold-filled',
  },
  {
    id: 'by_markup',
    label: 'By markup',
    description: 'Set a margin percentage over your cost',
  },
  {
    id: 'by_tier',
    label: 'By tier',
    description: 'Group chains into tiers (e.g. Sterling, Gold Filled, Premium). Great for menus organized by metal type.',
  },
  {
    id: 'individual',
    label: 'Price later',
    description: "I'll set prices individually in inventory",
  },
];

// ============================================================================
// Root wrapper
// ============================================================================

export default function OnboardingPageRoot() {
  return (
    <TenantProvider>
      <OnboardingThemeBridge />
    </TenantProvider>
  );
}

function OnboardingThemeBridge() {
  const { tenant } = useTenant();
  return (
    <ThemeProvider themeId={tenant?.theme_id || null}>
      <OnboardingFlow />
    </ThemeProvider>
  );
}

// ============================================================================
// Letter-by-letter text component
// ============================================================================

function LetterReveal({ text, className, stagger = 30, delay = 0 }: {
  text: string;
  className?: string;
  stagger?: number;
  delay?: number;
}) {
  return (
    <span className={className} aria-label={text}>
      {text.split('').map((char, i) => (
        <span
          key={i}
          className="ob-letter"
          style={{
            animationDelay: `${delay + i * stagger}ms`,
          }}
        >
          {char === ' ' ? '\u00A0' : char}
        </span>
      ))}
    </span>
  );
}

// ============================================================================
// Animated checkmark (SVG stroke draw)
// ============================================================================

function AnimatedCheck({ delay = 0, size = 20 }: { delay?: number; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className="ob-check-draw"
      style={{ animationDelay: `${delay}ms` }}
    >
      <path
        d="M5 13l4 4L19 7"
        stroke="var(--accent-primary)"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength="1"
      />
    </svg>
  );
}

// ============================================================================
// Main Onboarding Flow
// ============================================================================

function OnboardingFlow() {
  const router = useRouter();
  const { tenant, isLoading, isOwner, refetch } = useTenant();
  const supabase = createClient();

  const [step, setStep] = useState(0);
  const [transitioning, setTransitioning] = useState(false);
  const [transPhase, setTransPhase] = useState<'idle' | 'exit' | 'enter'>('idle');
  const [firstName, setFirstName] = useState('');
  const [fullName, setFullName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Step data
  const [businessName, setBusinessName] = useState('');
  const [phone, setPhone] = useState('');
  const [smsConsent, setSmsConsent] = useState(false);
  const [experience, setExperience] = useState('');
  const [selectedKit, setSelectedKit] = useState<string | null>(null);
  const [kitLoading, setKitLoading] = useState(false);
  const [kitResult, setKitResult] = useState<{ chains: number; jumpRings: number } | null>(null);
  const [kitLoadProgress, setKitLoadProgress] = useState(0);
  const [kitItems, setKitItems] = useState<string[]>([]);
  const [kitLoadHeading, setKitLoadHeading] = useState('Loading your inventory...');
  const [pricingMode, setPricingMode] = useState('');
  const [pricingValues, setPricingValues] = useState<Record<string, number>>({});
  const [selectedTheme, setSelectedTheme] = useState('rose-gold');
  const [pricingApplied, setPricingApplied] = useState(false);

  // Welcome animation states
  const [welcomeReady, setWelcomeReady] = useState(false);
  const [lineReady, setLineReady] = useState(false);
  const [subtitleReady, setSubtitleReady] = useState(false);

  // Grand reveal states
  const [revealReady, setRevealReady] = useState(false);
  const [revealPulse, setRevealPulse] = useState(false);
  const [revealCard, setRevealCard] = useState(false);
  const [revealButton, setRevealButton] = useState(false);

  // Theme picker glow
  const [glowTheme, setGlowTheme] = useState<string | null>(null);

  // Redirect if onboarding already completed
  useEffect(() => {
    if (!isLoading && tenant?.onboarding_completed) {
      router.replace('/dashboard');
    }
  }, [isLoading, tenant, router]);

  // Resume from saved step
  useEffect(() => {
    if (tenant) {
      if (tenant.onboarding_step > 0) setStep(tenant.onboarding_step);
      if (tenant.name) setBusinessName(tenant.name);
      if (tenant.phone) setPhone(tenant.phone);
      if (tenant.theme_id) setSelectedTheme(tenant.theme_id);
    }
  }, [tenant]);

  // Load name from auth metadata
  useEffect(() => {
    async function loadName() {
      const { data: { user } } = await supabase.auth.getUser();
      const meta = user?.user_metadata;
      if (meta?.first_name) setFirstName(meta.first_name);
      if (meta?.full_name) setFullName(meta.full_name);
      else if (meta?.first_name) setFullName(meta.first_name);
    }
    loadName();
  }, [supabase]);

  // Welcome screen animation sequence
  useEffect(() => {
    if (step === 0) {
      const nameLen = (firstName || 'there').length + 'Welcome to Sunstone Studio, .'.length;
      const t1 = setTimeout(() => setWelcomeReady(true), 100);
      const t2 = setTimeout(() => setLineReady(true), nameLen * 30 + 400);
      const t3 = setTimeout(() => setSubtitleReady(true), nameLen * 30 + 1000);
      return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
    } else {
      setWelcomeReady(false);
      setLineReady(false);
      setSubtitleReady(false);
    }
  }, [step, firstName]);

  // Grand reveal animation sequence
  useEffect(() => {
    if (step === 7) {
      const name = 'You\'re all set!';
      const t1 = setTimeout(() => setRevealReady(true), 100);
      const t2 = setTimeout(() => setRevealPulse(true), name.length * 30 + 300);
      const t3 = setTimeout(() => setRevealCard(true), name.length * 30 + 600);
      const t4 = setTimeout(() => setRevealButton(true), name.length * 30 + 1000);
      return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); };
    } else {
      setRevealReady(false);
      setRevealPulse(false);
      setRevealCard(false);
      setRevealButton(false);
    }
  }, [step]);

  // Save step progress
  const saveStep = useCallback(async (newStep: number, extraData?: Record<string, any>) => {
    if (!tenant) return;
    const updatePayload: Record<string, any> = { onboarding_step: newStep };
    if (extraData) {
      const { data: current } = await supabase
        .from('tenants')
        .select('onboarding_data')
        .eq('id', tenant.id)
        .single();
      const currentData = (current?.onboarding_data as Record<string, any>) || {};
      updatePayload.onboarding_data = { ...currentData, ...extraData };
    }
    await supabase.from('tenants').update(updatePayload).eq('id', tenant.id);
  }, [tenant, supabase]);

  // Animated step transition: exit (scale down + blur + fade) → enter (scale up + deblur + fade)
  const goTo = useCallback((newStep: number, extraData?: Record<string, any>) => {
    if (transitioning) return;
    setTransitioning(true);
    setTransPhase('exit');
    setTimeout(() => {
      setStep(newStep);
      setTransPhase('enter');
      saveStep(newStep, extraData);
      setTimeout(() => {
        setTransPhase('idle');
        setTransitioning(false);
      }, 300);
    }, 250);
  }, [transitioning, saveStep]);

  const handleSkip = async () => {
    if (!tenant) return;
    setSaving(true);
    await supabase
      .from('tenants')
      .update({ onboarding_completed: true, onboarding_step: TOTAL_STEPS })
      .eq('id', tenant.id);
    await refetch();
    router.replace('/dashboard');
  };

  const handleComplete = async () => {
    if (!tenant) return;
    setSaving(true);
    await supabase
      .from('tenants')
      .update({
        onboarding_completed: true,
        onboarding_step: TOTAL_STEPS,
        theme_id: selectedTheme,
      })
      .eq('id', tenant.id);
    await refetch();
    router.replace('/dashboard');
  };

  const loadKit = async (kitId: string) => {
    setKitLoading(true);
    setError('');
    setKitLoadProgress(0);
    setKitItems([]);
    setKitLoadHeading('Loading your inventory...');

    // Simulated progress for UX
    const kitDef = KITS.find(k => k.id === kitId);
    const itemNames: string[] = [];
    if (kitDef) {
      for (let i = 0; i < kitDef.chains; i++) itemNames.push(`Chain ${i + 1}`);
      itemNames.push('Jump Rings');
      if (kitDef.connectors) itemNames.push('Connectors');
    }

    // Start progress animation
    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.random() * 15 + 5;
      if (progress > 90) progress = 90;
      setKitLoadProgress(progress);
    }, 200);

    try {
      const res = await fetch('/api/onboarding/load-kit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kit: kitId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      clearInterval(interval);
      setKitLoadProgress(100);

      // Reveal items one at a time
      const names: string[] = [];
      if (data.chains > 0) names.push(`${data.chains} chains added`);
      if (data.jumpRings > 0) names.push(`${data.jumpRings} jump rings added`);
      if (kitDef?.connectors) names.push('Connectors added');
      names.push('Inventory ready');

      for (let i = 0; i < names.length; i++) {
        await new Promise(r => setTimeout(r, 80 * (i + 1)));
        setKitItems(prev => [...prev, names[i]]);
      }

      await new Promise(r => setTimeout(r, 400));
      setKitLoadHeading('Your inventory is ready.');
      setKitResult({ chains: data.chains || 0, jumpRings: data.jumpRings || 0 });
    } catch (err: any) {
      clearInterval(interval);
      setError(err.message || 'Failed to load kit');
    } finally {
      setKitLoading(false);
    }
  };

  const applyPricing = async () => {
    setSaving(true);
    setError('');
    try {
      const payload: Record<string, any> = { mode: pricingMode, ...pricingValues };
      const res = await fetch('/api/onboarding/apply-pricing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPricingApplied(true);
    } catch (err: any) {
      setError(err.message || 'Failed to apply pricing');
    } finally {
      setSaving(false);
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--surface-base)]">
        <div className="text-text-tertiary">Loading...</div>
      </div>
    );
  }

  if (!tenant) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--surface-base)]">
        <div className="text-center space-y-3">
          <p className="text-text-secondary">Unable to load your workspace.</p>
          <Button variant="ghost" onClick={() => router.push('/auth/login')}>
            Back to Login
          </Button>
        </div>
      </div>
    );
  }

  const progress = (step / (TOTAL_STEPS - 1)) * 100;

  // Step transition class
  const stepClass =
    transPhase === 'exit'
      ? 'ob-step-exit'
      : transPhase === 'enter'
        ? 'ob-step-enter'
        : 'ob-step-idle';

  return (
    <div className="min-h-screen bg-[var(--surface-base)] flex flex-col ob-page-bg" style={{ transition: 'background-color 500ms ease' }}>
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4 shrink-0">
        <div className="flex items-center gap-3 flex-1">
          <span className="font-display text-lg font-bold text-[var(--accent-primary)]">Sunstone</span>
          <div className="flex-1 max-w-xs h-2 bg-[var(--border-default)] rounded-full overflow-hidden">
            <div
              className="h-full bg-[var(--accent-primary)] rounded-full transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
        {step > 0 && step < TOTAL_STEPS - 1 && (
          <button
            onClick={handleSkip}
            disabled={saving}
            className="text-sm text-text-tertiary hover:text-text-secondary transition-colors"
          >
            Skip setup
          </button>
        )}
      </div>

      {/* Step content */}
      <div className="flex-1 flex items-center justify-center px-4 pb-8">
        <div className={`w-full max-w-lg ${stepClass}`}>

          {/* Step 0: Welcome */}
          {step === 0 && (
            <div className="text-center space-y-6">
              <div className="space-y-3 relative">
                {welcomeReady && (
                  <h1 className="font-display text-4xl md:text-5xl font-bold text-text-primary">
                    <LetterReveal text={`Welcome to Sunstone Studio, ${firstName || 'there'}.`} />
                  </h1>
                )}

                {/* Horizontal line that draws from center */}
                <div className="flex justify-center py-2">
                  <div
                    className={`h-[1px] bg-[var(--accent-primary)] transition-all ease-out ${
                      lineReady ? 'w-[200px] opacity-100' : 'w-0 opacity-0'
                    }`}
                    style={{ transitionDuration: '600ms' }}
                  />
                </div>

                <p
                  className={`text-lg text-text-secondary transition-all duration-500 ease-out ${
                    subtitleReady ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
                  }`}
                >
                  Let&apos;s get your business set up in just a few minutes.
                </p>
              </div>
              <div
                className={`transition-all duration-500 ease-out ${
                  subtitleReady ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'
                }`}
                style={{ transitionDelay: subtitleReady ? '200ms' : '0ms' }}
              >
                <Button
                  variant="primary"
                  onClick={() => goTo(1)}
                  className="min-h-[48px] px-8 text-base ob-btn-spring"
                >
                  Let&apos;s Go
                </Button>
              </div>
            </div>
          )}

          {/* Step 1: Business Name */}
          {step === 1 && (
            <div className="space-y-6">
              <div className="text-center">
                <h2 className="font-display text-2xl font-bold text-text-primary">
                  What&apos;s your business called?
                </h2>
                <p className="text-sm text-text-secondary mt-2">
                  You can always change this later in Settings.
                </p>
              </div>
              <Input
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="My Jewelry Studio"
                autoFocus
                className="text-center text-lg"
              />
              <div className="flex justify-center gap-3">
                <Button variant="ghost" onClick={() => goTo(0)}>Back</Button>
                <Button
                  variant="primary"
                  onClick={() => {
                    if (!businessName.trim()) { setError('Business name is required'); return; }
                    setError('');
                    supabase.from('tenants').update({ name: businessName.trim() }).eq('id', tenant.id);
                    goTo(2);
                  }}
                  className="min-h-[48px] px-8 ob-btn-spring"
                >
                  Next
                </Button>
              </div>
              {error && <p className="text-sm text-center text-[var(--error-600)]">{error}</p>}
            </div>
          )}

          {/* Step 2: Phone Number */}
          {step === 2 && (
            <div className="space-y-6">
              <div className="text-center">
                <h2 className="font-display text-2xl font-bold text-text-primary">
                  What&apos;s your phone number?
                </h2>
                <p className="text-sm text-text-secondary mt-2">
                  We&apos;ll use this to keep you updated on your account.
                </p>
              </div>
              <div className="space-y-3">
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(555) 123-4567"
                  type="tel"
                  autoFocus
                  className="text-center text-lg"
                />
                <p className="text-[11px] leading-relaxed text-text-tertiary px-2">
                  By providing your phone number, you agree to receive SMS messages from
                  Sunstone PJ including account updates and tips. Message and data rates
                  may apply. Reply STOP to opt out at any time.
                </p>
                <label className="flex items-start gap-2.5 px-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={smsConsent}
                    onChange={(e) => setSmsConsent(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded border-[var(--border-default)] accent-[var(--accent-primary)]"
                  />
                  <span className="text-sm text-text-secondary">
                    I agree to receive SMS messages
                  </span>
                </label>
              </div>
              <div className="flex justify-center gap-3">
                <Button variant="ghost" onClick={() => goTo(1)}>Back</Button>
                <Button
                  variant="primary"
                  onClick={() => {
                    if (phone.trim() && !smsConsent) {
                      setError('Please agree to receive SMS messages to continue');
                      return;
                    }
                    setError('');
                    if (phone.trim()) {
                      supabase.from('tenants').update({ phone: phone.trim() }).eq('id', tenant.id);
                    }
                    goTo(3, { phone: phone.trim() });
                  }}
                  disabled={!!phone.trim() && !smsConsent}
                  className="min-h-[48px] px-8 ob-btn-spring"
                >
                  {phone.trim() ? 'Next' : 'Skip'}
                </Button>
              </div>
              {error && <p className="text-sm text-center text-[var(--error-600)]">{error}</p>}
            </div>
          )}

          {/* Step 3: Experience */}
          {step === 3 && (
            <div className="space-y-6">
              <div className="text-center">
                <h2 className="font-display text-2xl font-bold text-text-primary">
                  How long have you been doing this?
                </h2>
              </div>
              <div className="flex flex-wrap gap-3 justify-center">
                {EXPERIENCE_LEVELS.map((exp) => (
                  <button
                    key={exp.value}
                    onClick={() => {
                      setExperience(exp.value);
                      goTo(4, { experience: exp.value });
                    }}
                    className={`px-5 py-3 rounded-full border-2 text-sm font-medium transition-all duration-200 ob-btn-spring ${
                      experience === exp.value
                        ? 'border-[var(--accent-primary)] bg-[var(--accent-50)] text-[var(--accent-primary)]'
                        : 'border-[var(--border-default)] bg-[var(--surface-raised)] text-text-primary hover:border-[var(--accent-300)]'
                    }`}
                  >
                    {exp.label}
                  </button>
                ))}
              </div>
              <div className="flex justify-center">
                <Button variant="ghost" onClick={() => goTo(2)}>Back</Button>
              </div>
            </div>
          )}

          {/* Step 4: Kit Selection */}
          {step === 4 && (
            <div className="space-y-6">
              <div className="text-center">
                <h2 className="font-display text-2xl font-bold text-text-primary">
                  Did you purchase a Sunstone starter kit?
                </h2>
                <p className="text-sm text-text-secondary mt-2">
                  We&apos;ll pre-load your inventory so you&apos;re ready to sell.
                </p>
              </div>

              {/* Kit loading animation */}
              {kitLoading && (
                <div className="space-y-4">
                  <div className="rounded-xl border border-[var(--border-default)] bg-[var(--surface-raised)] p-6 overflow-hidden">
                    <p className="text-sm font-semibold text-text-primary mb-3 ob-crossfade">
                      {kitLoadHeading}
                    </p>
                    {/* Progress bar */}
                    <div className="h-[2px] bg-[var(--border-default)] rounded-full overflow-hidden mb-4">
                      <div
                        className="h-full bg-[var(--accent-primary)] rounded-full transition-all duration-300 ease-out"
                        style={{ width: `${kitLoadProgress}%` }}
                      />
                    </div>
                    {/* Item reveals */}
                    <div className="space-y-2">
                      {kitItems.map((item, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-2.5 ob-item-reveal"
                          style={{ animationDelay: `${i * 80}ms` }}
                        >
                          <AnimatedCheck delay={i * 80 + 200} size={18} />
                          <span className="text-sm text-text-secondary">{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Kit result */}
              {!kitLoading && kitResult && (
                <div className="space-y-4">
                  <div className="rounded-xl border border-[var(--accent-200)] bg-[var(--accent-50)] p-6 text-center">
                    <AnimatedCheck size={48} />
                    <p className="text-lg font-semibold text-text-primary mt-3">Kit loaded</p>
                    <p className="text-sm text-text-secondary mt-1">
                      {kitResult.chains} chains and {kitResult.jumpRings} jump rings added to your inventory.
                    </p>
                  </div>
                  <div className="flex justify-center">
                    <Button
                      variant="primary"
                      onClick={() => goTo(5)}
                      className="min-h-[48px] px-8 ob-btn-spring"
                    >
                      Set Pricing
                    </Button>
                  </div>
                </div>
              )}

              {/* Kit selection cards */}
              {!kitLoading && !kitResult && (
                <>
                  <div className="grid gap-3">
                    {KITS.map((kit) => {
                      const isSelected = selectedKit === kit.id;
                      const hasSelection = selectedKit !== null;
                      return (
                        <button
                          key={kit.id}
                          onClick={() => setSelectedKit(kit.id)}
                          className={`p-4 rounded-xl border-2 text-left transition-all duration-200 ob-btn-spring ${
                            isSelected
                              ? 'border-[var(--accent-primary)] bg-[var(--accent-50)]'
                              : hasSelection
                                ? 'border-[var(--border-default)] bg-[var(--surface-raised)] opacity-60 scale-[0.98]'
                                : 'border-[var(--border-default)] bg-[var(--surface-raised)] hover:border-[var(--accent-300)]'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="text-base font-semibold text-text-primary">{kit.name}</span>
                              <span className="text-xs text-text-tertiary ml-2">{kit.tagline}</span>
                            </div>
                            {isSelected && (
                              <CheckIcon className="w-5 h-5 text-[var(--accent-primary)]" />
                            )}
                          </div>
                          <p className="text-xs text-text-secondary mt-1">
                            {kit.chains} chains &middot; {kit.jumpRings} jump rings{kit.connectors ? ' + connectors' : ''}
                          </p>
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex flex-col items-center gap-3">
                    {selectedKit && (
                      <div className="ob-slide-up">
                        <Button
                          variant="primary"
                          onClick={() => loadKit(selectedKit)}
                          className="min-h-[48px] px-8 ob-btn-spring"
                        >
                          Load My Kit
                        </Button>
                      </div>
                    )}
                    <button
                      onClick={() => {
                        setSelectedKit(null);
                        goTo(6, { kit: 'none' });
                      }}
                      className="text-sm text-text-tertiary hover:text-text-secondary transition-colors"
                    >
                      I didn&apos;t buy a kit
                    </button>
                  </div>
                </>
              )}

              {error && <p className="text-sm text-center text-[var(--error-600)]">{error}</p>}
              {!kitLoading && (
                <div className="flex justify-center">
                  <Button variant="ghost" onClick={() => goTo(3)}>Back</Button>
                </div>
              )}
            </div>
          )}

          {/* Step 5: Pricing */}
          {step === 5 && (
            <div className="space-y-6">
              <div className="text-center">
                <h2 className="font-display text-2xl font-bold text-text-primary">
                  How would you like to price your jewelry?
                </h2>
              </div>

              {!pricingMode ? (
                <div className="grid gap-3">
                  {PRICING_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => setPricingMode(opt.id)}
                      className="p-4 rounded-xl border-2 border-[var(--border-default)] bg-[var(--surface-raised)] hover:border-[var(--accent-300)] text-left transition-all duration-200 ob-btn-spring"
                    >
                      <span className="text-sm font-semibold text-text-primary">{opt.label}</span>
                      <p className="text-xs text-text-secondary mt-0.5">{opt.description}</p>
                    </button>
                  ))}
                </div>
              ) : pricingMode === 'by_tier' ? (
                <div className="text-center space-y-4">
                  <p className="text-sm text-text-secondary">
                    You can create your pricing tiers in Settings &rarr; Default Pricing after setup.
                  </p>
                  <Button
                    variant="primary"
                    onClick={() => {
                      applyPricing();
                      goTo(6);
                    }}
                    className="min-h-[48px] px-8 ob-btn-spring"
                  >
                    Continue
                  </Button>
                </div>
              ) : pricingMode === 'individual' ? (
                <div className="text-center space-y-4">
                  <p className="text-sm text-text-secondary">
                    No problem. You can set prices in the Inventory page anytime.
                  </p>
                  <Button
                    variant="primary"
                    onClick={() => {
                      applyPricing();
                      goTo(6);
                    }}
                    className="min-h-[48px] px-8 ob-btn-spring"
                  >
                    Continue
                  </Button>
                </div>
              ) : !pricingApplied ? (
                <div className="space-y-4">
                  {pricingMode === 'by_type' && (
                    <div className="space-y-3">
                      <p className="text-sm text-text-secondary text-center">Set a price for each product type:</p>
                      <Input
                        label="Bracelet price ($)"
                        type="number"
                        value={pricingValues.bracelet_price?.toString() || ''}
                        onChange={(e) => setPricingValues({ ...pricingValues, bracelet_price: parseFloat(e.target.value) || 0 })}
                        placeholder="45"
                        min={0}
                        step={0.01}
                      />
                      <Input
                        label="Anklet price ($)"
                        type="number"
                        value={pricingValues.anklet_price?.toString() || ''}
                        onChange={(e) => setPricingValues({ ...pricingValues, anklet_price: parseFloat(e.target.value) || 0 })}
                        placeholder="55"
                        min={0}
                        step={0.01}
                      />
                      <Input
                        label="Necklace price per inch ($)"
                        type="number"
                        value={pricingValues.necklace_price?.toString() || ''}
                        onChange={(e) => setPricingValues({ ...pricingValues, necklace_price: parseFloat(e.target.value) || 0 })}
                        placeholder="8"
                        min={0}
                        step={0.01}
                      />
                      <Input
                        label="Ring price ($)"
                        type="number"
                        value={pricingValues.ring_price?.toString() || ''}
                        onChange={(e) => setPricingValues({ ...pricingValues, ring_price: parseFloat(e.target.value) || 0 })}
                        placeholder="25"
                        min={0}
                        step={0.01}
                      />
                    </div>
                  )}
                  {pricingMode === 'by_metal' && (
                    <div className="space-y-3">
                      <Input
                        label="Silver price ($)"
                        type="number"
                        value={pricingValues.silver_price?.toString() || ''}
                        onChange={(e) => setPricingValues({ ...pricingValues, silver_price: parseFloat(e.target.value) || 0 })}
                        placeholder="35"
                        min={0}
                        step={0.01}
                      />
                      <Input
                        label="Gold-filled price ($)"
                        type="number"
                        value={pricingValues.gold_price?.toString() || ''}
                        onChange={(e) => setPricingValues({ ...pricingValues, gold_price: parseFloat(e.target.value) || 0 })}
                        placeholder="55"
                        min={0}
                        step={0.01}
                      />
                    </div>
                  )}
                  {pricingMode === 'by_markup' && (
                    <Input
                      label="Profit margin (%)"
                      type="number"
                      value={pricingValues.margin?.toString() || ''}
                      onChange={(e) => setPricingValues({ ...pricingValues, margin: parseFloat(e.target.value) || 0 })}
                      placeholder="50"
                      helperText="E.g. 50% margin means you sell for 2x your cost"
                      min={1}
                      max={99}
                    />
                  )}

                  {selectedKit && selectedKit !== 'momentum' && (
                    <Input
                      label="Connectors add-on price ($)"
                      type="number"
                      value={pricingValues.connectors_price?.toString() || ''}
                      onChange={(e) => setPricingValues({ ...pricingValues, connectors_price: parseFloat(e.target.value) || 0 })}
                      placeholder="5"
                      min={0}
                      step={0.01}
                    />
                  )}

                  <div className="flex justify-center gap-3">
                    <Button variant="ghost" onClick={() => setPricingMode('')}>Change method</Button>
                    <Button
                      variant="primary"
                      onClick={applyPricing}
                      loading={saving}
                      className="min-h-[48px] px-8 ob-btn-spring"
                    >
                      Apply Pricing
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="text-center space-y-4">
                  <div className="rounded-xl border border-[var(--accent-200)] bg-[var(--accent-50)] p-6">
                    <div className="flex justify-center mb-3">
                      <AnimatedCheck size={48} />
                    </div>
                    <p className="text-lg font-semibold text-text-primary">Pricing applied</p>
                    <p className="text-sm text-text-secondary mt-1">
                      You can adjust individual prices anytime in Inventory.
                    </p>
                  </div>
                  <Button
                    variant="primary"
                    onClick={() => goTo(6)}
                    className="min-h-[48px] px-8 ob-btn-spring"
                  >
                    Continue
                  </Button>
                </div>
              )}

              {error && <p className="text-sm text-center text-[var(--error-600)]">{error}</p>}
              <div className="flex justify-center">
                <Button variant="ghost" onClick={() => goTo(4)}>Back</Button>
              </div>
            </div>
          )}

          {/* Step 6: Theme Picker */}
          {step === 6 && (
            <div className="space-y-6">
              <div className="text-center">
                <h2 className="font-display text-2xl font-bold text-text-primary">
                  Choose your look
                </h2>
                <p className="text-sm text-text-secondary mt-2">
                  Pick a theme that matches your brand. This changes colors, fonts, and feel.
                </p>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {THEMES.map((theme) => {
                  const isSelected = selectedTheme === theme.id;
                  const isGlowing = glowTheme === theme.id;
                  return (
                    <button
                      key={theme.id}
                      onClick={() => {
                        setSelectedTheme(theme.id);
                        setGlowTheme(theme.id);
                        applyTheme(theme);
                        setTimeout(() => setGlowTheme(null), 800);
                      }}
                      className={`relative p-3 rounded-xl border-2 transition-all duration-200 ob-btn-spring ${
                        isSelected
                          ? 'border-[var(--accent-primary)] shadow-md'
                          : 'border-[var(--border-default)] hover:border-[var(--accent-300)]'
                      }`}
                      style={isGlowing ? {
                        boxShadow: `0 0 20px 4px ${theme.accent}33`,
                        animation: 'ob-glow-pulse 800ms ease-out forwards',
                      } : undefined}
                    >
                      <div className="flex gap-1 mb-2">
                        <div className="w-4 h-4 rounded-full" style={{ backgroundColor: theme.accent }} />
                        <div className="w-4 h-4 rounded-full" style={{ backgroundColor: theme.background }} />
                        <div className="w-4 h-4 rounded-full" style={{ backgroundColor: theme.textPrimary }} />
                      </div>
                      <p className="text-xs font-medium text-text-primary truncate">{theme.name}</p>
                      <p className="text-[10px] text-text-tertiary">{theme.mode}</p>
                      {isSelected && (
                        <div className="absolute top-2 right-2">
                          <CheckIcon className="w-4 h-4 text-[var(--accent-primary)]" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
              <div className="flex justify-center gap-3">
                <Button variant="ghost" onClick={() => {
                  if (tenant?.theme_id) applyTheme(getThemeById(tenant.theme_id));
                  goTo(selectedKit ? 5 : 4);
                }}>Back</Button>
                <Button
                  variant="primary"
                  onClick={() => {
                    supabase.from('tenants').update({ theme_id: selectedTheme }).eq('id', tenant.id);
                    goTo(7);
                  }}
                  className="min-h-[48px] px-8 ob-btn-spring"
                >
                  Next
                </Button>
              </div>
            </div>
          )}

          {/* Step 7: Grand Reveal */}
          {step === 7 && (
            <div className="text-center space-y-6 relative">
              {/* Radial pulse behind text */}
              {revealPulse && (
                <div className="ob-radial-pulse" />
              )}

              <div className="space-y-3 relative z-10">
                {revealReady && (
                  <h1 className="font-display text-3xl md:text-4xl font-bold text-text-primary">
                    <LetterReveal text="You're all set!" />
                  </h1>
                )}
                <p
                  className={`text-lg text-text-secondary transition-all duration-500 ease-out ${
                    revealCard ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
                  }`}
                >
                  Your workspace is ready. Let&apos;s build something beautiful.
                </p>
              </div>

              {/* Summary card */}
              <div
                className={`rounded-xl border border-[var(--border-default)] bg-[var(--surface-raised)] p-6 text-left space-y-3 max-w-sm mx-auto transition-all ease-out relative z-10 ${
                  revealCard ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
                }`}
                style={{
                  transitionDuration: '500ms',
                  transitionTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
                }}
              >
                <SummaryRow label="Business" value={businessName || tenant.name} />
                {selectedKit && (
                  <SummaryRow label="Kit" value={KITS.find(k => k.id === selectedKit)?.name || 'None'} />
                )}
                <SummaryRow label="Theme" value={THEMES.find(t => t.id === selectedTheme)?.name || 'Rose Gold'} />
              </div>

              <div
                className={`transition-all ease-out relative z-10 ${
                  revealButton ? 'opacity-100 scale-100' : 'opacity-0 scale-90'
                }`}
                style={{ transitionDuration: '400ms', transitionTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)' }}
              >
                <Button
                  variant="primary"
                  onClick={handleComplete}
                  loading={saving}
                  className="min-h-[48px] px-8 text-base ob-btn-spring"
                >
                  Start Exploring
                </Button>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* All CSS animations */}
      <style jsx global>{`
        /* Letter-by-letter reveal */
        .ob-letter {
          display: inline-block;
          opacity: 0;
          transform: translateY(6px);
          animation: ob-letter-in 0.3s ease-out forwards;
        }
        @keyframes ob-letter-in {
          to { opacity: 1; transform: translateY(0); }
        }

        /* Step transitions: exit = scale down + blur + fade */
        .ob-step-idle {
          opacity: 1;
          transform: scale(1);
          filter: blur(0);
        }
        .ob-step-exit {
          opacity: 0;
          transform: scale(0.98);
          filter: blur(2px);
          transition: opacity 250ms ease, transform 250ms ease, filter 250ms ease;
        }
        .ob-step-enter {
          opacity: 1;
          transform: scale(1);
          filter: blur(0);
          animation: ob-step-enter-anim 300ms ease-out 100ms both;
        }
        @keyframes ob-step-enter-anim {
          from {
            opacity: 0;
            transform: scale(1.02);
            filter: blur(2px);
          }
          to {
            opacity: 1;
            transform: scale(1);
            filter: blur(0);
          }
        }

        /* Spring easing on buttons/cards */
        .ob-btn-spring {
          transition-timing-function: cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        /* Slide up for Load My Kit button */
        .ob-slide-up {
          animation: ob-slide-up 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }
        @keyframes ob-slide-up {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }

        /* Kit item reveal: slide in from left + fade */
        .ob-item-reveal {
          opacity: 0;
          transform: translateX(-12px);
          animation: ob-item-in 0.3s ease-out forwards;
        }
        @keyframes ob-item-in {
          to { opacity: 1; transform: translateX(0); }
        }

        /* Checkmark draw animation */
        .ob-check-draw path {
          stroke-dasharray: 1;
          stroke-dashoffset: 1;
          animation: ob-check-stroke 0.4s ease-out forwards;
        }
        .ob-check-draw {
          animation-fill-mode: both;
        }
        @keyframes ob-check-stroke {
          to { stroke-dashoffset: 0; }
        }

        /* Crossfade for kit loading heading */
        .ob-crossfade {
          transition: opacity 0.3s ease;
        }

        /* Theme picker glow pulse */
        @keyframes ob-glow-pulse {
          0% { box-shadow: 0 0 0 0 var(--accent-primary, rgba(200, 150, 100, 0.2)); }
          50% { box-shadow: 0 0 20px 6px rgba(var(--accent-primary-rgb, 200, 150, 100), 0.2); }
          100% { box-shadow: 0 0 0 0 transparent; }
        }

        /* Grand reveal radial pulse */
        .ob-radial-pulse {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 0;
          height: 0;
          border-radius: 50%;
          background: radial-gradient(circle, var(--accent-primary) 0%, transparent 70%);
          opacity: 0.05;
          animation: ob-radial-expand 800ms ease-out forwards;
          pointer-events: none;
          z-index: 0;
        }
        @keyframes ob-radial-expand {
          0% { width: 0; height: 0; opacity: 0.08; }
          100% { width: 500px; height: 500px; opacity: 0; }
        }
      `}</style>
    </div>
  );
}

// ============================================================================
// Subcomponents
// ============================================================================

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-text-secondary">{label}</span>
      <span className="text-text-primary font-medium">{value}</span>
    </div>
  );
}

// ============================================================================
// Icons
// ============================================================================

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}
