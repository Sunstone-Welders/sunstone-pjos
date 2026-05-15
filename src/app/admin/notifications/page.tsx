// src/app/admin/notifications/page.tsx
// Admin notification management — list, filter, send, archive, delete
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { format } from 'date-fns';

// ─── Types ──────────────────────────────────────────────────────────────────

interface Notification {
  id: string;
  type: 'announcement' | 'product_launch' | 'promotion' | 'feature_update' | 'tip_of_the_week';
  title: string;
  body: string;
  image_url: string | null;
  cta_text: string | null;
  cta_link: string | null;
  target_type: 'all' | 'tier' | 'tag' | 'specific';
  target_value: string | null;
  target_tenant_ids: string[] | null;
  status: 'draft' | 'scheduled' | 'sent' | 'archived';
  scheduled_for: string | null;
  sent_at: string | null;
  created_at: string;
  read_count: number;
  click_count: number;
  total_targeted: number;
}

type StatusFilter = 'all' | 'draft' | 'scheduled' | 'sent' | 'archived';

// ─── Constants ──────────────────────────────────────────────────────────────

const TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  announcement:    { bg: 'rgba(59, 130, 246, 0.15)', text: '#60A5FA' },
  product_launch:  { bg: 'rgba(168, 85, 247, 0.15)', text: '#C084FC' },
  promotion:       { bg: 'rgba(236, 72, 153, 0.15)', text: '#F472B6' },
  feature_update:  { bg: 'rgba(20, 184, 166, 0.15)', text: '#2DD4BF' },
  tip_of_the_week: { bg: 'rgba(245, 158, 11, 0.15)', text: '#FBBF24' },
};

const TYPE_LABELS: Record<string, string> = {
  announcement: 'Announcement',
  product_launch: 'Product Launch',
  promotion: 'Promotion',
  feature_update: 'Feature Update',
  tip_of_the_week: 'Tip of the Week',
};

const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  draft:     { bg: 'rgba(107, 114, 128, 0.15)', text: '#9CA3AF' },
  scheduled: { bg: 'rgba(245, 158, 11, 0.15)', text: '#FBBF24' },
  sent:      { bg: 'rgba(34, 197, 94, 0.15)',   text: '#4ADE80' },
  archived:  { bg: 'rgba(107, 114, 128, 0.10)', text: '#6B7280' },
};

const FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'sent', label: 'Sent' },
  { value: 'archived', label: 'Archived' },
];

// ─── Page ───────────────────────────────────────────────────────────────────

export default function AdminNotificationsPage() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [sendConfirm, setSendConfirm] = useState<Notification | null>(null);

  useEffect(() => {
    loadNotifications();
  }, []);

  async function loadNotifications() {
    try {
      const res = await fetch('/api/admin/notifications');
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setNotifications(data.notifications || []);
    } catch {
      toast.error('Failed to load notifications');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    setActionLoading(id);
    try {
      const res = await fetch(`/api/admin/notifications/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      setNotifications(prev => prev.filter(n => n.id !== id));
      toast.success('Notification deleted');
    } catch {
      toast.error('Failed to delete notification');
    } finally {
      setActionLoading(null);
      setDeleteConfirm(null);
    }
  }

  async function handleSend(id: string) {
    setActionLoading(id);
    try {
      const res = await fetch(`/api/admin/notifications/${id}/send`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to send');
      toast.success('Notification sent');
      await loadNotifications();
    } catch {
      toast.error('Failed to send notification');
    } finally {
      setActionLoading(null);
      setSendConfirm(null);
    }
  }

  async function handleArchive(id: string) {
    setActionLoading(id);
    try {
      const res = await fetch(`/api/admin/notifications/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'archived' }),
      });
      if (!res.ok) throw new Error('Failed to archive');
      toast.success('Notification archived');
      await loadNotifications();
    } catch {
      toast.error('Failed to archive notification');
    } finally {
      setActionLoading(null);
    }
  }

  function getTargetSummary(n: Notification): string {
    if (n.target_type === 'all') return 'All tenants';
    if (n.target_type === 'tier' && n.target_value) {
      return `${n.target_value.charAt(0).toUpperCase() + n.target_value.slice(1)} tier`;
    }
    if (n.target_type === 'specific' && n.target_tenant_ids) {
      return `${n.target_tenant_ids.length} specific tenant${n.target_tenant_ids.length !== 1 ? 's' : ''}`;
    }
    return 'All tenants';
  }

  const filtered = filter === 'all' ? notifications : notifications.filter(n => n.status === filter);

  // ─── Loading state ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h1 className="text-2xl font-bold text-[var(--text-primary)]" style={{ fontFamily: 'var(--font-display, Georgia)' }}>
            Notifications
          </h1>
        </div>
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-[var(--surface-raised)] rounded-xl border border-[var(--border-default)] p-6 animate-pulse">
              <div className="flex items-start gap-3">
                <div className="h-5 w-24 bg-[var(--surface-subtle)] rounded-full" />
                <div className="flex-1 space-y-2">
                  <div className="h-5 w-48 bg-[var(--surface-subtle)] rounded" />
                  <div className="h-4 w-72 bg-[var(--surface-subtle)] rounded" />
                </div>
                <div className="h-5 w-16 bg-[var(--surface-subtle)] rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]" style={{ fontFamily: 'var(--font-display, Georgia)' }}>
          Notifications
        </h1>
        <button
          onClick={() => router.push('/admin/notifications/compose')}
          className="inline-flex items-center gap-2 px-4 min-h-[48px] rounded-lg text-sm font-medium transition-colors"
          style={{ backgroundColor: '#FF7A00', color: '#FFFFFF' }}
        >
          <PlusIcon className="w-4 h-4" />
          New Notification
        </button>
      </div>

      {/* Filter chips */}
      <div className="flex items-center gap-2 flex-wrap">
        {FILTER_OPTIONS.map(opt => (
          <button
            key={opt.value}
            onClick={() => setFilter(opt.value)}
            className={cn(
              'px-3 py-1.5 text-xs font-medium rounded-lg transition-colors min-h-[36px]',
              filter === opt.value
                ? 'text-[var(--text-on-accent)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-default)]'
            )}
            style={{
              backgroundColor: filter === opt.value ? '#FF7A00' : 'transparent',
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Notification list */}
      {filtered.length === 0 ? (
        <div className="bg-[var(--surface-raised)] rounded-xl border border-[var(--border-default)] p-12 text-center">
          <div className="text-3xl mb-3 opacity-40">
            <BellOffIcon className="w-10 h-10 mx-auto" style={{ color: 'var(--text-tertiary)' }} />
          </div>
          <p className="text-sm text-[var(--text-secondary)]">
            {notifications.length === 0
              ? 'No notifications yet. Create your first one to reach your artists.'
              : `No ${filter} notifications.`}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(n => (
            <div
              key={n.id}
              className="bg-[var(--surface-raised)] rounded-xl border border-[var(--border-default)] p-5 transition-colors hover:border-[var(--border-strong)]"
            >
              <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                {/* Left content */}
                <div className="flex-1 min-w-0 space-y-2">
                  {/* Badges row */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Type badge */}
                    <span
                      className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium"
                      style={{
                        backgroundColor: TYPE_COLORS[n.type]?.bg || TYPE_COLORS.announcement.bg,
                        color: TYPE_COLORS[n.type]?.text || TYPE_COLORS.announcement.text,
                      }}
                    >
                      {TYPE_LABELS[n.type] || n.type}
                    </span>
                    {/* Status badge */}
                    <span
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium"
                      style={{
                        backgroundColor: STATUS_STYLES[n.status]?.bg,
                        color: STATUS_STYLES[n.status]?.text,
                      }}
                    >
                      {n.status.charAt(0).toUpperCase() + n.status.slice(1)}
                      {n.status === 'scheduled' && n.scheduled_for && (
                        <span className="ml-1 opacity-75">
                          {format(new Date(n.scheduled_for), 'MMM d, h:mm a')}
                        </span>
                      )}
                      {n.status === 'sent' && n.sent_at && (
                        <span className="ml-1 opacity-75">
                          {format(new Date(n.sent_at), 'MMM d, h:mm a')}
                        </span>
                      )}
                    </span>
                  </div>

                  {/* Title */}
                  <h3 className="text-sm font-semibold text-[var(--text-primary)] truncate">{n.title}</h3>

                  {/* Meta: target + stats */}
                  <div className="flex items-center gap-3 text-xs text-[var(--text-tertiary)]">
                    <span>{getTargetSummary(n)}</span>
                    {n.status === 'sent' && (
                      <>
                        <span className="w-px h-3 bg-[var(--border-default)]" />
                        <span>{n.read_count} read{n.read_count !== 1 ? 's' : ''}</span>
                        {n.cta_text && (
                          <>
                            <span className="w-px h-3 bg-[var(--border-default)]" />
                            <span>{n.click_count} click{n.click_count !== 1 ? 's' : ''}</span>
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  {(n.status === 'draft' || n.status === 'scheduled') && (
                    <>
                      <button
                        onClick={() => router.push(`/admin/notifications/compose?id=${n.id}`)}
                        className="px-3 min-h-[36px] text-xs font-medium rounded-lg transition-colors hover:bg-[rgba(255,255,255,0.06)]"
                        style={{ color: 'var(--text-secondary)', border: '1px solid var(--border-default)' }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setSendConfirm(n)}
                        disabled={actionLoading === n.id}
                        className="px-3 min-h-[36px] text-xs font-medium rounded-lg transition-colors"
                        style={{ backgroundColor: 'rgba(34, 197, 94, 0.15)', color: '#4ADE80' }}
                      >
                        Send Now
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(n.id)}
                        disabled={actionLoading === n.id}
                        className="px-3 min-h-[36px] text-xs font-medium rounded-lg transition-colors hover:bg-[rgba(239,68,68,0.1)]"
                        style={{ color: '#F87171' }}
                      >
                        Delete
                      </button>
                    </>
                  )}
                  {n.status === 'sent' && (
                    <>
                      <button
                        onClick={() => router.push(`/admin/notifications/${n.id}`)}
                        className="px-3 min-h-[36px] text-xs font-medium rounded-lg transition-colors hover:bg-[rgba(255,255,255,0.06)]"
                        style={{ color: 'var(--text-secondary)', border: '1px solid var(--border-default)' }}
                      >
                        View Details
                      </button>
                      <button
                        onClick={() => handleArchive(n.id)}
                        disabled={actionLoading === n.id}
                        className="px-3 min-h-[36px] text-xs font-medium rounded-lg transition-colors hover:bg-[rgba(255,255,255,0.06)]"
                        style={{ color: 'var(--text-tertiary)' }}
                      >
                        Archive
                      </button>
                    </>
                  )}
                  {n.status === 'archived' && (
                    <button
                      onClick={() => router.push(`/admin/notifications/${n.id}`)}
                      className="px-3 min-h-[36px] text-xs font-medium rounded-lg transition-colors hover:bg-[rgba(255,255,255,0.06)]"
                      style={{ color: 'var(--text-secondary)', border: '1px solid var(--border-default)' }}
                    >
                      View Details
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Delete Confirmation Modal ── */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setDeleteConfirm(null)} />
          <div
            className="relative w-full max-w-sm rounded-xl p-6 space-y-4"
            style={{ backgroundColor: 'var(--surface-raised)', border: '1px solid var(--border-default)' }}
          >
            <h3 className="text-base font-semibold text-[var(--text-primary)]">Delete Notification</h3>
            <p className="text-sm text-[var(--text-secondary)]">
              Are you sure? This action cannot be undone.
            </p>
            <div className="flex items-center gap-3 justify-end">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 min-h-[44px] text-sm font-medium rounded-lg transition-colors hover:bg-[rgba(255,255,255,0.06)]"
                style={{ color: 'var(--text-secondary)' }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                disabled={actionLoading === deleteConfirm}
                className="px-4 min-h-[44px] text-sm font-medium rounded-lg transition-colors"
                style={{ backgroundColor: 'rgba(239, 68, 68, 0.15)', color: '#F87171' }}
              >
                {actionLoading === deleteConfirm ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Send Confirmation Modal ── */}
      {sendConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setSendConfirm(null)} />
          <div
            className="relative w-full max-w-sm rounded-xl p-6 space-y-4"
            style={{ backgroundColor: 'var(--surface-raised)', border: '1px solid var(--border-default)' }}
          >
            <h3 className="text-base font-semibold text-[var(--text-primary)]">Send Notification</h3>
            <p className="text-sm text-[var(--text-secondary)]">
              Send &ldquo;{sendConfirm.title}&rdquo; to {getTargetSummary(sendConfirm)}?
              This can&apos;t be undone.
            </p>
            <div className="flex items-center gap-3 justify-end">
              <button
                onClick={() => setSendConfirm(null)}
                className="px-4 min-h-[44px] text-sm font-medium rounded-lg transition-colors hover:bg-[rgba(255,255,255,0.06)]"
                style={{ color: 'var(--text-secondary)' }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleSend(sendConfirm.id)}
                disabled={actionLoading === sendConfirm.id}
                className="px-4 min-h-[44px] text-sm font-medium rounded-lg transition-colors"
                style={{ backgroundColor: '#FF7A00', color: '#FFFFFF' }}
              >
                {actionLoading === sendConfirm.id ? 'Sending...' : 'Yes, Send'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Icons ──────────────────────────────────────────────────────────────────

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  );
}

function BellOffIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.143 17.082a24.248 24.248 0 005.714 0m-5.714 0a3 3 0 005.714 0M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31" />
    </svg>
  );
}
