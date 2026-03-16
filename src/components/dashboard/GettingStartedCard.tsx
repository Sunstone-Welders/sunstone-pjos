'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { GettingStartedData } from '@/types';

export function GettingStartedCard({ data }: { data: GettingStartedData }) {
  const router = useRouter();
  const [dismissed, setDismissed] = useState(false);
  const [fading, setFading] = useState(false);

  const allDone = data && data.completedCount >= data.totalCount;

  // Auto-dismiss after brief congrats when all steps complete
  useEffect(() => {
    if (!allDone || dismissed) return;
    const fadeTimer = setTimeout(() => setFading(true), 2700);
    const dismissTimer = setTimeout(() => {
      setDismissed(true);
      fetch('/api/dashboard/getting-started', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'dismiss' }),
      }).catch(() => {});
    }, 3200);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(dismissTimer);
    };
  }, [allDone, dismissed]);

  if (!data || !Array.isArray(data.steps) || dismissed) return null;

  const { steps, completedCount, totalCount } = data;
  const pct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  async function handleDismiss() {
    setDismissed(true);
    try {
      await fetch('/api/dashboard/getting-started', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'dismiss' }),
      });
    } catch {
      // Non-critical — card is already hidden locally
    }
  }

  async function handleStepClick(step: { label: string; done: boolean; href: string }) {
    if (step.done) return;

    // If this is the theme step, mark it as done before navigating
    if (step.label === 'Customize your theme') {
      try {
        await fetch('/api/dashboard/getting-started', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'mark_theme_done' }),
        });
      } catch {
        // Non-critical — navigate anyway
      }
    }

    router.push(step.href);
  }

  // ── All-done congrats state ────────────────────────────────────────────
  if (allDone) {
    return (
      <div
        className="col-span-full border border-[var(--border-default)]"
        style={{
          borderRadius: 'var(--card-radius, 16px)',
          boxShadow: 'var(--shadow-card)',
          padding: 24,
          background: 'linear-gradient(135deg, var(--accent-50), var(--surface-raised))',
          opacity: fading ? 0 : 1,
          transition: 'opacity 0.5s ease',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'center' }}>
          <div
            className="bg-accent-500"
            style={{
              width: 32,
              height: 32,
              borderRadius: 9999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-on-accent)" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          </div>
          <p
            className="text-text-primary"
            style={{
              fontFamily: 'var(--font-heading)',
              fontSize: 17,
              fontWeight: 600,
            }}
          >
            {"You\u2019re all set! Let\u2019s get to work."}
          </p>
        </div>
      </div>
    );
  }

  // ── Normal checklist state ─────────────────────────────────────────────
  const encouragement =
    completedCount === 0
      ? "Let\u2019s get started!"
      : completedCount >= totalCount - 1
        ? 'Almost there!'
        : "You\u2019re making great progress!";

  return (
    <div
      className="col-span-full border border-[var(--border-default)]"
      style={{
        borderRadius: 'var(--card-radius, 16px)',
        boxShadow: 'var(--shadow-card)',
        padding: 18,
        background: 'linear-gradient(135deg, var(--accent-50), var(--surface-raised))',
        position: 'relative',
      }}
    >
      {/* Dismiss button */}
      <button
        onClick={handleDismiss}
        aria-label="Dismiss Getting Started"
        className="text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
        style={{
          position: 'absolute',
          top: 8,
          right: 8,
          width: 44,
          height: 44,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: 'none',
          background: 'transparent',
          cursor: 'pointer',
          borderRadius: 8,
          transition: 'color 0.15s',
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 6L6 18" />
          <path d="M6 6l12 12" />
        </svg>
      </button>

      {/* Header */}
      <div className="flex items-center justify-between" style={{ marginBottom: 12, paddingRight: 36 }}>
        <span
          className="text-text-tertiary uppercase"
          style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em' }}
        >
          Getting Started
        </span>
        <span
          className="text-accent-600"
          style={{ fontSize: 11, fontWeight: 600 }}
        >
          {completedCount} of {totalCount}
        </span>
      </div>

      {/* Progress bar */}
      <div
        className="bg-[var(--surface-raised)]"
        style={{ height: 4, borderRadius: 9999, overflow: 'hidden', marginBottom: 14 }}
      >
        <div
          className="bg-accent-500"
          style={{
            height: '100%',
            width: `${pct}%`,
            borderRadius: 9999,
            transition: 'width 0.3s ease',
          }}
        />
      </div>

      {/* Encouragement */}
      <p
        className="text-text-primary"
        style={{
          fontFamily: 'var(--font-heading)',
          fontSize: 15,
          fontWeight: 600,
          lineHeight: 1.3,
          marginBottom: 10,
        }}
      >
        {encouragement}
      </p>

      {/* Checklist */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {steps.map((step) => (
          <button
            key={step.href + step.label}
            onClick={() => handleStepClick(step)}
            disabled={step.done}
            className={step.done ? '' : 'hover:bg-accent-50'}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '6px 8px',
              borderRadius: 8,
              border: 'none',
              background: 'transparent',
              cursor: step.done ? 'default' : 'pointer',
              textAlign: 'left',
              transition: 'background 0.15s',
            }}
          >
            {/* Check circle */}
            <div
              className={step.done ? 'bg-accent-500' : 'border border-[var(--border-strong)]'}
              style={{
                width: 20,
                height: 20,
                borderRadius: 9999,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              {step.done && (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-on-accent)" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              )}
            </div>

            {/* Label */}
            <span
              className={step.done ? 'text-text-tertiary' : 'text-text-primary'}
              style={{
                fontSize: 13,
                fontWeight: 500,
                textDecoration: step.done ? 'line-through' : 'none',
              }}
            >
              {step.label}
            </span>

            {/* Arrow for incomplete */}
            {!step.done && (
              <svg
                className="text-text-tertiary"
                width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
                style={{ marginLeft: 'auto', flexShrink: 0 }}
              >
                <path d="M9 18l6-6-6-6" />
              </svg>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
