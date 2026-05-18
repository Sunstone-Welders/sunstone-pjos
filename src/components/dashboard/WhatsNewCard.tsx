// ============================================================================
// WhatsNewCard — Shows latest unread notification on the dashboard home
// ============================================================================

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTenant } from '@/hooks/use-tenant';
import { trackEvent } from '@/lib/track-usage-client';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  image_url: string | null;
  cta_text: string | null;
  cta_link: string | null;
  sent_at: string;
  is_read: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Type colors
// ─────────────────────────────────────────────────────────────────────────────

const TYPE_COLORS: Record<string, string> = {
  announcement: '#3B82F6',
  product_launch: '#8B5CF6',
  promotion: '#EC4899',
  feature_update: '#14B8A6',
  tip_of_the_week: '#F59E0B',
};

function getTypeColor(type: string): string {
  return TYPE_COLORS[type] || '#6B7280';
}

function getTypeLabel(type: string): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function WhatsNewCard() {
  const onOpenInbox = useCallback(() => {
    window.dispatchEvent(new Event('open-notification-inbox'));
  }, []);
  const router = useRouter();
  const { tenant } = useTenant();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [dismissing, setDismissing] = useState(false);

  // Fetch notifications on mount
  useEffect(() => {
    fetch('/api/notifications')
      .then(r => r.ok ? r.json() : { notifications: [] })
      .then(d => setNotifications(d.notifications || []))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  // Get first unread notification
  const unread = notifications.filter(n => !n.is_read);
  const current = unread[0] || null;

  // ── Dismiss (mark as read) ──────────────────────────────────────────────
  const handleDismiss = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!current) return;

    setDismissing(true);

    // Mark as read
    await fetch(`/api/notifications/${current.id}/read`, { method: 'POST' }).catch(() => {});

    // Update local state
    setNotifications(prev => prev.map(n => n.id === current.id ? { ...n, is_read: true } : n));

    // Small delay for fade animation
    setTimeout(() => setDismissing(false), 150);
  }, [current]);

  // ── CTA click ───────────────────────────────────────────────────────────
  const handleCtaClick = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!current?.cta_link) return;

    if (tenant?.id) {
      trackEvent(tenant.id, 'notification_cta_clicked', { notification_id: current.id });
    }

    await fetch(`/api/notifications/${current.id}/click`, { method: 'POST' }).catch(() => {});

    if (!current.is_read) {
      await fetch(`/api/notifications/${current.id}/read`, { method: 'POST' }).catch(() => {});
      setNotifications(prev => prev.map(n => n.id === current.id ? { ...n, is_read: true } : n));
    }

    if (current.cta_link.startsWith('/')) {
      router.push(current.cta_link);
    } else {
      window.open(current.cta_link, '_blank', 'noopener');
    }
  }, [current, tenant?.id, router]);

  // Don't render if no unread notifications or still loading
  if (!loaded || !current) return null;

  const typeColor = getTypeColor(current.type);

  return (
    <div
      className={`relative overflow-hidden transition-all duration-200 ${dismissing ? 'opacity-0 scale-[0.98]' : 'opacity-100 scale-100'}`}
      style={{
        background: 'var(--surface-raised)',
        borderRadius: 'var(--card-radius, 12px)',
        boxShadow: 'var(--shadow-card, 0 1px 3px rgba(0,0,0,0.06))',
        border: '1px solid var(--border-default)',
        marginBottom: 14,
      }}
    >
      {/* Accent top border */}
      <div style={{ height: 3, background: `linear-gradient(90deg, ${typeColor}, var(--accent-500))` }} />

      <div className="p-4">
        {/* Header row */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            {/* Sparkle icon */}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="text-[var(--accent-500)]">
              <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
            </svg>
            <span className="text-text-primary font-semibold" style={{ fontSize: 14 }}>
              What&apos;s New
            </span>
            <span
              className="text-white font-medium rounded-full px-2 py-0.5"
              style={{ fontSize: 10, lineHeight: '16px', background: typeColor }}
            >
              {getTypeLabel(current.type)}
            </span>
          </div>

          {/* Dismiss button */}
          <button
            onClick={handleDismiss}
            className="flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-subtle)] transition-colors rounded-lg"
            style={{ width: 32, height: 32, border: 'none', background: 'transparent', cursor: 'pointer' }}
            aria-label="Dismiss notification"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>

        {/* Title */}
        <p className="text-text-primary font-semibold" style={{ fontSize: 15, margin: '0 0 4px' }}>
          {current.title}
        </p>

        {/* Body (truncated to ~2 lines) */}
        <p
          className="text-text-secondary"
          style={{
            fontSize: 13,
            lineHeight: '18px',
            margin: 0,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical' as const,
            overflow: 'hidden',
          }}
        >
          {current.body}
        </p>

        {/* Actions row */}
        <div className="flex items-center gap-3 mt-3">
          {current.cta_text && current.cta_link && (
            <button
              onClick={handleCtaClick}
              className="bg-[var(--accent-500)] text-[var(--text-on-accent)] hover:bg-[var(--accent-600)] transition-colors font-medium"
              style={{
                fontSize: 12,
                padding: '6px 14px',
                borderRadius: 8,
                border: 'none',
                cursor: 'pointer',
                minHeight: 32,
              }}
            >
              {current.cta_text}
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onOpenInbox(); }}
            className="text-[var(--accent-500)] hover:text-[var(--accent-600)] transition-colors font-medium"
            style={{
              fontSize: 12,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '6px 4px',
            }}
          >
            View all notifications
          </button>
        </div>
      </div>
    </div>
  );
}
