'use client';

import type { GrowthTipData } from '@/types';

export function GrowthTipCard({ data }: { data: GrowthTipData }) {
  if (!data?.tip) return null;

  return (
    <div
      className="border border-[var(--border-default)]"
      style={{
        borderRadius: 'var(--card-radius, 16px)',
        boxShadow: 'var(--shadow-card)',
        padding: 18,
        background: 'linear-gradient(135deg, var(--accent-50), var(--surface-raised))',
        borderLeft: '3px solid var(--accent-400)',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <svg
          className="text-accent-500"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path d="M12 0l3.09 6.26L22 7.27l-5 4.87L18.18 19 12 15.77 5.82 19 7 12.14l-5-4.87 6.91-1.01L12 0z" />
        </svg>
        <span
          className="text-accent-600 uppercase"
          style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em' }}
        >
          Growth Tip
        </span>
      </div>

      {/* Tip text */}
      <p
        className="text-text-primary"
        style={{
          fontSize: 14,
          fontWeight: 400,
          lineHeight: 1.6,
          marginTop: 10,
        }}
      >
        {data.tip}
      </p>

      {/* Footer */}
      <p
        className="text-text-tertiary"
        style={{ fontSize: 10, marginTop: 10 }}
      >
        Powered by Sunny
      </p>
    </div>
  );
}
