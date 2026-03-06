'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTenant } from '@/hooks/use-tenant';
import type { TutorialPageKey } from '@/types';

interface TipDef {
  title: string;
  body: string;
}

interface SunnyTutorialProps {
  pageKey: TutorialPageKey;
  tips: TipDef[];
}

export default function SunnyTutorial({ pageKey, tips }: SunnyTutorialProps) {
  const { isOwner } = useTenant();
  const [completed, setCompleted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [currentTip, setCurrentTip] = useState(0);
  const [loading, setLoading] = useState(true);

  // Only show for owners
  if (!isOwner) return null;

  // Check if tutorial already completed on mount
  useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
        const res = await fetch('/api/tutorials');
        if (res.ok) {
          const data = await res.json();
          const found = data.progress?.find((p: any) => p.page_key === pageKey && p.completed);
          if (!cancelled && found) setCompleted(true);
        }
      } catch {
        // Silently fail
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    check();
    return () => { cancelled = true; };
  }, [pageKey]);

  const markComplete = useCallback(async () => {
    try {
      await fetch('/api/tutorials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ page_key: pageKey }),
      });
    } catch {
      // Best-effort
    }
    setCompleted(true);
    setIsOpen(false);
  }, [pageKey]);

  const handleNext = () => {
    if (currentTip < tips.length - 1) {
      setCurrentTip(currentTip + 1);
    } else {
      markComplete();
    }
  };

  // Don't render if completed, loading, or no tips
  if (loading || completed || tips.length === 0) return null;

  const tip = tips[currentTip];
  const isLast = currentTip === tips.length - 1;

  return (
    <>
      {/* Floating pill — z-20 to avoid overlaying checkout/action buttons */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed top-20 right-4 md:top-auto md:bottom-6 md:right-6 z-20 flex items-center gap-2 px-4 py-2.5 rounded-full bg-[var(--accent-primary)] text-[var(--text-on-accent)] shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105"
        >
          <SparkleIcon className="w-4 h-4" />
          <span className="text-sm font-medium">Sunny&apos;s Tips</span>
          <span className="bg-white/20 text-xs font-semibold rounded-full px-1.5 py-0.5">
            {tips.length - currentTip}
          </span>
        </button>
      )}

      {/* Tip overlay */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/20 z-30"
            onClick={() => setIsOpen(false)}
          />

          {/* Card — positioned at top on mobile to avoid checkout overlap */}
          <div className="fixed top-20 right-4 md:top-auto md:bottom-6 md:right-6 z-30 w-[340px] max-w-[calc(100vw-2rem)] rounded-xl border border-[var(--border-default)] bg-[var(--surface-raised)] shadow-xl animate-slide-up">
            {/* Header */}
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
              <div className="flex items-center gap-2">
                <SparkleIcon className="w-4 h-4 text-[var(--accent-primary)]" />
                <span className="text-xs font-medium text-text-tertiary">
                  Tip {currentTip + 1} of {tips.length}
                </span>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="text-text-tertiary hover:text-text-secondary p-1"
                aria-label="Close"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Body */}
            <div className="px-4 pb-2">
              <h3 className="text-sm font-semibold text-text-primary mb-1">{tip.title}</h3>
              <p className="text-sm text-text-secondary leading-relaxed">{tip.body}</p>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--border-subtle)]">
              {/* Progress dots */}
              <div className="flex gap-1.5">
                {tips.map((_, i) => (
                  <div
                    key={i}
                    className={`w-1.5 h-1.5 rounded-full transition-colors ${
                      i === currentTip
                        ? 'bg-[var(--accent-primary)]'
                        : i < currentTip
                          ? 'bg-[var(--accent-300)]'
                          : 'bg-[var(--border-default)]'
                    }`}
                  />
                ))}
              </div>

              <button
                onClick={handleNext}
                className="text-sm font-medium text-[var(--accent-primary)] hover:text-[var(--accent-hover)] transition-colors"
              >
                {isLast ? 'Got it!' : 'Next'}
              </button>
            </div>
          </div>

          <style jsx global>{`
            @keyframes slideUp {
              from { opacity: 0; transform: translateY(12px); }
              to { opacity: 1; transform: translateY(0); }
            }
            .animate-slide-up {
              animation: slideUp 0.2s ease-out forwards;
            }
          `}</style>
        </>
      )}
    </>
  );
}

function SparkleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 2L14.09 8.26L20 9.27L15.55 13.97L16.91 20L12 16.9L7.09 20L8.45 13.97L4 9.27L9.91 8.26L12 2Z" />
    </svg>
  );
}
