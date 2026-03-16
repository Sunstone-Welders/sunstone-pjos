'use client';

import { useRouter } from 'next/navigation';
import type { TodaysPrioritiesData } from '@/types';

export function TodaysPrioritiesCard({ data }: { data: TodaysPrioritiesData }) {
  const router = useRouter();
  if (!data) return null;

  const { items } = data;
  const hasItems = items.length > 0;

  return (
    <div
      className="border border-[var(--border-default)]"
      style={{
        borderRadius: 'var(--card-radius, 16px)',
        boxShadow: 'var(--shadow-card)',
        padding: 18,
        background: 'var(--surface-raised)',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
        <span
          className="text-text-tertiary uppercase"
          style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em' }}
        >
          {"Today\u2019s Priorities"}
        </span>
      </div>

      {hasItems ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {items.slice(0, 3).map((item, i) => (
            <button
              key={`${item.type}-${i}`}
              onClick={() => router.push(item.link)}
              className="hover:bg-[var(--surface-base)]"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 8px',
                borderRadius: 8,
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                textAlign: 'left',
                minHeight: 44,
                transition: 'background 0.15s',
              }}
            >
              <span style={{ fontSize: 16, flexShrink: 0, width: 24, textAlign: 'center' }}>
                {item.icon}
              </span>
              <span
                className="text-text-primary"
                style={{ fontSize: 13, fontWeight: 500, flex: 1 }}
              >
                {item.label}
              </span>
              <svg
                className="text-text-tertiary"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ flexShrink: 0 }}
              >
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          ))}
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: '12px 0' }}>
          <p style={{ fontSize: 20, marginBottom: 4 }}>{'\u2728'}</p>
          <p
            className="text-text-secondary"
            style={{ fontSize: 13, fontWeight: 500 }}
          >
            {"You\u2019re all caught up! No urgent items today."}
          </p>
        </div>
      )}
    </div>
  );
}
