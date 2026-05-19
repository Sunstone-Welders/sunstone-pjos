// ============================================================================
// TapToPayEducation — Swipeable education screens (Apple Requirement 5.4)
// ============================================================================
// 4 screens explaining Tap to Pay. Accessible from Settings at any time.
// Used during initial setup and via "View Tutorial" link.
// ============================================================================

'use client';

import { useState } from 'react';

// ── SVG Illustrations ──

const ContactlessIcon = ({ className = 'w-24 h-24' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 96 96" fill="none">
    <rect x="20" y="24" width="56" height="48" rx="8" stroke="currentColor" strokeWidth="2.5" />
    <rect x="28" y="32" width="12" height="10" rx="2" fill="currentColor" opacity="0.3" />
    <path d="M56 48c0-3.3 2.7-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <path d="M56 48c0-6.6 5.4-12 12-12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <path d="M56 48c0-9.9 8.1-18 18-18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const TapCardIcon = ({ className = 'w-24 h-24' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 96 96" fill="none">
    <rect x="12" y="30" width="40" height="36" rx="6" stroke="currentColor" strokeWidth="2.5" />
    <rect x="18" y="36" width="10" height="8" rx="2" fill="currentColor" opacity="0.3" />
    <path d="M60 20v56" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.3" />
    <rect x="64" y="22" width="24" height="52" rx="4" stroke="currentColor" strokeWidth="2.5" />
    <circle cx="76" cy="68" r="2" fill="currentColor" opacity="0.4" />
    <path d="M50 48l8-4v8l-8-4z" fill="currentColor" opacity="0.5" />
  </svg>
);

const WalletIcon = ({ className = 'w-24 h-24' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 96 96" fill="none">
    <rect x="16" y="28" width="28" height="40" rx="4" stroke="currentColor" strokeWidth="2.5" />
    <circle cx="30" cy="62" r="2" fill="currentColor" opacity="0.4" />
    <path d="M48 48c0-2.2 1.8-4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <path d="M48 48c0-4.4 3.6-8 8-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <path d="M48 48c0-6.6 5.4-12 12-12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <rect x="56" y="28" width="28" height="40" rx="4" stroke="currentColor" strokeWidth="2.5" />
    <circle cx="70" cy="62" r="2" fill="currentColor" opacity="0.4" />
  </svg>
);

const CheckmarkIcon = ({ className = 'w-24 h-24' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 96 96" fill="none">
    <circle cx="48" cy="48" r="28" stroke="currentColor" strokeWidth="2.5" />
    <path d="M36 48l8 8 16-16" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// ── Screen data ──

interface EducationScreen {
  icon: React.ReactNode;
  title: string;
  body: string;
}

const SCREENS: EducationScreen[] = [
  {
    icon: <ContactlessIcon />,
    title: 'Accept contactless payments',
    body: 'Accept credit cards, debit cards, Apple Pay, and Google Pay right on your phone. No extra hardware needed.',
  },
  {
    icon: <TapCardIcon />,
    title: 'How it works',
    body: "Build your cart, tap 'Tap to Pay', and hold your phone near the customer's card or phone. Payment completes in seconds.",
  },
  {
    icon: <WalletIcon />,
    title: 'Digital wallets too',
    body: 'Customers can pay with Apple Pay, Google Pay, Samsung Pay, and other digital wallets — just like a card tap.',
  },
  {
    icon: <CheckmarkIcon />,
    title: "You're ready",
    body: 'Tap to Pay is set up. Look for the Tap to Pay button at checkout.',
  },
];

// ── Component ──

interface TapToPayEducationProps {
  onComplete: () => void;
  onClose?: () => void;
}

export default function TapToPayEducation({ onComplete, onClose }: TapToPayEducationProps) {
  const [current, setCurrent] = useState(0);
  const isLast = current === SCREENS.length - 1;
  const screen = SCREENS[current];

  const handleNext = () => {
    if (isLast) {
      onComplete();
    } else {
      setCurrent((c) => c + 1);
    }
  };

  const handleBack = () => {
    if (current === 0) {
      onClose?.();
    } else {
      setCurrent((c) => c - 1);
    }
  };

  // Swipe detection
  const [touchStart, setTouchStart] = useState<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.touches[0].clientX);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStart === null) return;
    const diff = e.changedTouches[0].clientX - touchStart;
    if (Math.abs(diff) > 50) {
      if (diff < 0 && !isLast) setCurrent((c) => c + 1);
      if (diff > 0 && current > 0) setCurrent((c) => c - 1);
    }
    setTouchStart(null);
  };

  return (
    <div className="fixed inset-0 z-[70] bg-[var(--surface-base)] flex flex-col">
      {/* Close button */}
      {onClose && (
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-[var(--surface-subtle)] flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}

      {/* Content */}
      <div
        className="flex-1 flex flex-col items-center justify-center px-8 text-center"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div className="text-[var(--accent-primary)] mb-8">
          {screen.icon}
        </div>
        <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-3 font-[family-name:var(--font-display)]">
          {screen.title}
        </h2>
        <p className="text-base text-[var(--text-secondary)] max-w-sm leading-relaxed">
          {screen.body}
        </p>
      </div>

      {/* Navigation */}
      <div className="px-8 pb-10 space-y-4">
        {/* Dots */}
        <div className="flex justify-center gap-2">
          {SCREENS.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrent(i)}
              className={`w-2.5 h-2.5 rounded-full transition-all ${
                i === current
                  ? 'bg-[var(--accent-primary)] w-6'
                  : 'bg-[var(--border-default)]'
              }`}
            />
          ))}
        </div>

        {/* Buttons */}
        <div className="flex gap-3">
          {current > 0 && (
            <button
              onClick={handleBack}
              className="flex-1 h-14 rounded-xl font-semibold text-base border border-[var(--border-default)] text-[var(--text-primary)] hover:bg-[var(--surface-subtle)] transition-colors min-h-[48px]"
            >
              Back
            </button>
          )}
          <button
            onClick={handleNext}
            className="flex-1 h-14 rounded-xl font-semibold text-base text-white transition-all active:scale-[0.97] min-h-[48px]"
            style={{ backgroundColor: 'var(--accent-primary)' }}
          >
            {isLast ? 'Get Started' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
