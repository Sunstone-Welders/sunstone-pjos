// ============================================================================
// NotificationBell — Bell icon with unread badge for dashboard header
// ============================================================================

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Hook: poll unread notification count every 60s
// ─────────────────────────────────────────────────────────────────────────────

export function useNotificationUnreadCount() {
  const [count, setCount] = useState(0);
  const prevCount = useRef(0);
  const [shouldWiggle, setShouldWiggle] = useState(false);

  useEffect(() => {
    const fetchCount = () => {
      fetch('/api/notifications/unread-count')
        .then(r => r.ok ? r.json() : { count: 0 })
        .then(d => {
          const newCount = d.count || 0;
          if (newCount > prevCount.current && prevCount.current >= 0) {
            setShouldWiggle(true);
            setTimeout(() => setShouldWiggle(false), 800);
          }
          prevCount.current = newCount;
          setCount(newCount);
        })
        .catch(() => {});
    };

    fetchCount();
    const interval = setInterval(fetchCount, 60000);
    return () => clearInterval(interval);
  }, []);

  const decrement = useCallback(() => {
    setCount(c => Math.max(0, c - 1));
    prevCount.current = Math.max(0, prevCount.current - 1);
  }, []);

  const reset = useCallback(() => {
    setCount(0);
    prevCount.current = 0;
  }, []);

  return { count, shouldWiggle, decrement, reset };
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

interface NotificationBellProps {
  count: number;
  shouldWiggle: boolean;
  onClick: () => void;
}

export default function NotificationBell({ count, shouldWiggle, onClick }: NotificationBellProps) {
  return (
    <button
      onClick={onClick}
      className="relative flex items-center justify-center transition-colors hover:bg-[var(--surface-subtle)] rounded-lg"
      style={{
        width: 40,
        height: 40,
        border: 'none',
        background: 'transparent',
        cursor: 'pointer',
      }}
      aria-label={count > 0 ? `${count} unread notifications` : 'Notifications'}
      title="Notifications"
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`${count > 0 ? 'text-[var(--text-primary)]' : 'text-[var(--text-tertiary)]'} ${shouldWiggle ? 'notification-bell-wiggle' : ''}`}
      >
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>

      {/* Badge */}
      {count > 0 && (
        <span
          className="absolute flex items-center justify-center bg-[#EF4444] text-white font-semibold pointer-events-none"
          style={{
            top: 4,
            right: 4,
            minWidth: 16,
            height: 16,
            fontSize: 10,
            lineHeight: 1,
            borderRadius: 8,
            padding: '0 4px',
          }}
        >
          {count > 9 ? '9+' : count}
        </span>
      )}

      {/* Wiggle animation (injected once via style tag) */}
      <WiggleStyle />
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Inline CSS for wiggle animation (injected once)
// ─────────────────────────────────────────────────────────────────────────────

let wiggleInjected = false;

function WiggleStyle() {
  useEffect(() => {
    if (wiggleInjected || typeof document === 'undefined') return;
    wiggleInjected = true;
    const style = document.createElement('style');
    style.textContent = `
      @keyframes notification-bell-wiggle {
        0% { transform: rotate(0deg); }
        15% { transform: rotate(12deg); }
        30% { transform: rotate(-10deg); }
        45% { transform: rotate(8deg); }
        60% { transform: rotate(-6deg); }
        75% { transform: rotate(3deg); }
        100% { transform: rotate(0deg); }
      }
      .notification-bell-wiggle {
        animation: notification-bell-wiggle 0.6s ease-in-out;
      }
    `;
    document.head.appendChild(style);
  }, []);

  return null;
}
