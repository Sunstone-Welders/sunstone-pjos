// ============================================================================
// NotificationInbox — Slide-out panel showing all platform notifications
// ============================================================================

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
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
  read_at: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Type colors (hardcoded for notification type indicators only)
// ─────────────────────────────────────────────────────────────────────────────

const TYPE_COLORS: Record<string, string> = {
  announcement: '#3B82F6',    // blue
  product_launch: '#8B5CF6',  // purple
  promotion: '#EC4899',       // pink
  feature_update: '#14B8A6',  // teal
  tip_of_the_week: '#F59E0B', // amber
};

function getTypeColor(type: string): string {
  return TYPE_COLORS[type] || '#6B7280';
}

function getTypeLabel(type: string): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ─────────────────────────────────────────────────────────────────────────────
// Relative time
// ─────────────────────────────────────────────────────────────────────────────

function relativeTime(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay === 1) return 'Yesterday';
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

interface NotificationInboxProps {
  isOpen: boolean;
  onClose: () => void;
  onRead: () => void;      // Decrement bell badge by 1
  onMarkAllRead: () => void; // Reset bell badge to 0
}

export default function NotificationInbox({ isOpen, onClose, onRead, onMarkAllRead }: NotificationInboxProps) {
  const router = useRouter();
  const { tenant } = useTenant();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // ── Fetch on open ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);

    if (tenant?.id) {
      trackEvent(tenant.id, 'notification_inbox_opened');
    }

    fetch('/api/notifications')
      .then(r => r.ok ? r.json() : { notifications: [] })
      .then(d => setNotifications(d.notifications || []))
      .catch(() => setNotifications([]))
      .finally(() => setLoading(false));
  }, [isOpen, tenant?.id]);

  // ── Close on Escape ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  // ── Mark single as read ─────────────────────────────────────────────────
  const markRead = useCallback(async (id: string) => {
    const notif = notifications.find(n => n.id === id);
    if (!notif || notif.is_read) return;

    // Optimistic update
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    onRead();

    await fetch(`/api/notifications/${id}/read`, { method: 'POST' }).catch(() => {});
  }, [notifications, onRead]);

  // ── Mark all as read ────────────────────────────────────────────────────
  const handleMarkAllRead = useCallback(async () => {
    const unread = notifications.filter(n => !n.is_read);
    if (unread.length === 0) return;

    // Optimistic update
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    onMarkAllRead();

    // Fire all read requests (fire and forget)
    for (const n of unread) {
      fetch(`/api/notifications/${n.id}/read`, { method: 'POST' }).catch(() => {});
    }
  }, [notifications, onMarkAllRead]);

  // ── CTA click ───────────────────────────────────────────────────────────
  const handleCtaClick = useCallback(async (notif: Notification) => {
    if (!notif.cta_link) return;

    if (tenant?.id) {
      trackEvent(tenant.id, 'notification_cta_clicked', { notification_id: notif.id });
    }

    // Track click
    await fetch(`/api/notifications/${notif.id}/click`, { method: 'POST' }).catch(() => {});

    // Mark as read too
    if (!notif.is_read) {
      setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, is_read: true } : n));
      onRead();
    }

    // Navigate
    if (notif.cta_link.startsWith('/')) {
      onClose();
      router.push(notif.cta_link);
    } else {
      window.open(notif.cta_link, '_blank', 'noopener');
    }
  }, [tenant?.id, onRead, onClose, router]);

  // ── Expand / toggle card ────────────────────────────────────────────────
  const toggleExpand = useCallback((id: string) => {
    setExpandedId(prev => prev === id ? null : id);
    // Mark as read when expanding
    markRead(id);
  }, [markRead]);

  const unreadCount = notifications.filter(n => !n.is_read).length;

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop — mobile only */}
      <div
        className="fixed inset-0 z-[60] bg-black/30 md:hidden"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className="fixed top-0 right-0 z-[61] h-full flex flex-col bg-[var(--surface-raised)] shadow-xl"
        style={{
          width: '100%',
          maxWidth: 400,
          animation: 'notification-inbox-slide-in 0.2s ease-out',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 shrink-0 border-b border-[var(--border-default)]"
          style={{ height: 56 }}
        >
          <h2
            className="text-text-primary font-semibold"
            style={{ fontSize: 16 }}
          >
            Notifications
          </h2>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-[var(--accent-500)] hover:text-[var(--accent-600)] transition-colors"
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '4px 8px',
                }}
              >
                Mark all read
              </button>
            )}
            <button
              onClick={onClose}
              className="flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-subtle)] transition-colors rounded-lg"
              style={{ width: 36, height: 36, border: 'none', background: 'transparent', cursor: 'pointer' }}
              aria-label="Close notifications"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="space-y-3 p-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="animate-pulse">
                  <div className="h-4 bg-[var(--surface-subtle)] rounded w-24 mb-2" />
                  <div className="h-3 bg-[var(--surface-subtle)] rounded w-full mb-1" />
                  <div className="h-3 bg-[var(--surface-subtle)] rounded w-2/3" />
                </div>
              ))}
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="text-[var(--text-tertiary)] mb-3">
                <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
              </svg>
              <p className="text-text-secondary font-medium" style={{ fontSize: 14 }}>
                You&apos;re all caught up!
              </p>
              <p className="text-text-tertiary" style={{ fontSize: 13, marginTop: 4 }}>
                No notifications right now.
              </p>
            </div>
          ) : (
            <div>
              {notifications.map(notif => (
                <NotificationCard
                  key={notif.id}
                  notification={notif}
                  isExpanded={expandedId === notif.id}
                  onToggle={() => toggleExpand(notif.id)}
                  onCtaClick={() => handleCtaClick(notif)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Slide-in animation */}
      <InboxSlideStyle />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// NotificationCard
// ─────────────────────────────────────────────────────────────────────────────

function NotificationCard({
  notification,
  isExpanded,
  onToggle,
  onCtaClick,
}: {
  notification: Notification;
  isExpanded: boolean;
  onToggle: () => void;
  onCtaClick: () => void;
}) {
  const n = notification;
  const typeColor = getTypeColor(n.type);

  return (
    <div
      className={`border-b border-[var(--border-subtle)] transition-colors cursor-pointer ${
        !n.is_read ? 'bg-[var(--accent-50)]' : 'bg-transparent hover:bg-[var(--surface-subtle)]'
      }`}
      onClick={onToggle}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); } }}
      style={{ minHeight: 48 }}
    >
      <div className="px-4 py-3">
        {/* Top row: type badge + timestamp */}
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            {/* Unread dot */}
            {!n.is_read && (
              <span
                className="shrink-0 rounded-full"
                style={{ width: 8, height: 8, background: 'var(--accent-500)' }}
              />
            )}
            {/* Type badge */}
            <span
              className="text-white font-medium rounded-full px-2 py-0.5"
              style={{ fontSize: 10, lineHeight: '16px', background: typeColor }}
            >
              {getTypeLabel(n.type)}
            </span>
          </div>
          <span className="text-text-tertiary shrink-0" style={{ fontSize: 11 }}>
            {relativeTime(n.sent_at)}
          </span>
        </div>

        {/* Title */}
        <p className="text-text-primary font-semibold" style={{ fontSize: 14, margin: '4px 0 2px' }}>
          {n.title}
        </p>

        {/* Image (if present, show above body) */}
        {n.image_url && isExpanded && (
          <div className="mt-2 mb-2 rounded-lg overflow-hidden" style={{ maxHeight: 180 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={n.image_url}
              alt=""
              className="w-full object-cover"
              style={{ maxHeight: 180 }}
            />
          </div>
        )}

        {/* Body — truncated or expanded */}
        <p
          className="text-text-secondary"
          style={{
            fontSize: 13,
            lineHeight: '18px',
            margin: 0,
            ...(isExpanded
              ? {}
              : {
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical' as const,
                  overflow: 'hidden',
                }),
          }}
        >
          {n.body}
        </p>

        {/* Expand hint */}
        {!isExpanded && n.body.length > 100 && (
          <span className="text-[var(--accent-500)]" style={{ fontSize: 12, fontWeight: 500 }}>
            Read more
          </span>
        )}

        {/* CTA button (shown when expanded) */}
        {isExpanded && n.cta_text && n.cta_link && (
          <button
            onClick={e => { e.stopPropagation(); onCtaClick(); }}
            className="mt-3 bg-[var(--accent-500)] text-[var(--text-on-accent)] hover:bg-[var(--accent-600)] transition-colors font-medium"
            style={{
              fontSize: 13,
              padding: '8px 16px',
              borderRadius: 8,
              border: 'none',
              cursor: 'pointer',
              minHeight: 36,
            }}
          >
            {n.cta_text}
          </button>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Slide-in animation style
// ─────────────────────────────────────────────────────────────────────────────

let inboxStyleInjected = false;

function InboxSlideStyle() {
  useEffect(() => {
    if (inboxStyleInjected || typeof document === 'undefined') return;
    inboxStyleInjected = true;
    const style = document.createElement('style');
    style.textContent = `
      @keyframes notification-inbox-slide-in {
        from { transform: translateX(100%); }
        to   { transform: translateX(0); }
      }
    `;
    document.head.appendChild(style);
  }, []);

  return null;
}
