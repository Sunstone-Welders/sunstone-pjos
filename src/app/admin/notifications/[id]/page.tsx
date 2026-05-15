// src/app/admin/notifications/[id]/page.tsx
// Notification detail — content preview + read/click analytics
'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { format } from 'date-fns';

// ─── Types ──────────────────────────────────────────────────────────────────

interface NotificationDetail {
  id: string;
  type: string;
  title: string;
  body: string;
  image_url: string | null;
  cta_text: string | null;
  cta_link: string | null;
  target_type: string;
  target_value: string | null;
  target_tenant_ids: string[] | null;
  status: string;
  scheduled_for: string | null;
  sent_at: string | null;
  created_at: string;
}

interface ReadRecord {
  tenant_id: string;
  user_id: string;
  read_at: string;
  cta_clicked_at: string | null;
  tenant_name: string;
}

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

// ─── Page ───────────────────────────────────────────────────────────────────

export default function NotificationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [notification, setNotification] = useState<NotificationDetail | null>(null);
  const [reads, setReads] = useState<ReadRecord[]>([]);
  const [readCount, setReadCount] = useState(0);
  const [clickCount, setClickCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [archiving, setArchiving] = useState(false);

  useEffect(() => {
    loadDetail();
  }, [id]);

  async function loadDetail() {
    try {
      const res = await fetch(`/api/admin/notifications/${id}`);
      if (!res.ok) {
        toast.error('Notification not found');
        router.push('/admin/notifications');
        return;
      }
      const data = await res.json();
      setNotification(data.notification);
      setReads(data.reads || []);
      setReadCount(data.read_count || 0);
      setClickCount(data.click_count || 0);
    } catch {
      toast.error('Failed to load notification');
      router.push('/admin/notifications');
    } finally {
      setLoading(false);
    }
  }

  async function handleArchive() {
    setArchiving(true);
    try {
      const res = await fetch(`/api/admin/notifications/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'archived' }),
      });
      if (!res.ok) throw new Error('Failed to archive');
      toast.success('Notification archived');
      router.push('/admin/notifications');
    } catch {
      toast.error('Failed to archive notification');
    } finally {
      setArchiving(false);
    }
  }

  function getTotalTargeted(): number {
    if (!notification) return 0;
    if (notification.target_type === 'specific' && notification.target_tenant_ids) {
      return notification.target_tenant_ids.length;
    }
    // For 'all' and 'tier' targeting, we don't have precise count from this endpoint
    // Use read_count as a floor estimate
    return Math.max(readCount, 1);
  }

  // ─── Loading ────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="h-5 w-5 bg-[var(--surface-subtle)] rounded animate-pulse" />
          <div className="h-6 w-48 bg-[var(--surface-subtle)] rounded animate-pulse" />
        </div>
        <div className="bg-[var(--surface-raised)] rounded-xl border border-[var(--border-default)] p-8 animate-pulse">
          <div className="space-y-3">
            <div className="h-5 w-24 bg-[var(--surface-subtle)] rounded-full" />
            <div className="h-6 w-64 bg-[var(--surface-subtle)] rounded" />
            <div className="h-4 w-full bg-[var(--surface-subtle)] rounded" />
            <div className="h-4 w-3/4 bg-[var(--surface-subtle)] rounded" />
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-[var(--surface-raised)] rounded-xl border border-[var(--border-default)] p-6 animate-pulse">
              <div className="h-4 w-16 bg-[var(--surface-subtle)] rounded mb-2" />
              <div className="h-8 w-12 bg-[var(--surface-subtle)] rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!notification) return null;

  const readRate = readCount > 0 ? Math.round((readCount / Math.max(getTotalTargeted(), readCount)) * 100) : 0;
  const clickRate = readCount > 0 ? Math.round((clickCount / readCount) * 100) : 0;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="space-y-2">
          {/* Back link */}
          <button
            onClick={() => router.push('/admin/notifications')}
            className="flex items-center gap-1.5 text-xs font-medium transition-colors min-h-[36px]"
            style={{ color: 'var(--text-secondary)' }}
          >
            <ArrowLeftIcon className="w-4 h-4" />
            Back to Notifications
          </button>
          {/* Title + badges */}
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-[var(--text-primary)]" style={{ fontFamily: 'var(--font-display, Georgia)' }}>
              {notification.title}
            </h1>
            <span
              className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium"
              style={{
                backgroundColor: TYPE_COLORS[notification.type]?.bg,
                color: TYPE_COLORS[notification.type]?.text,
              }}
            >
              {TYPE_LABELS[notification.type] || notification.type}
            </span>
            <span
              className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium"
              style={{
                backgroundColor: STATUS_STYLES[notification.status]?.bg,
                color: STATUS_STYLES[notification.status]?.text,
              }}
            >
              {notification.status.charAt(0).toUpperCase() + notification.status.slice(1)}
            </span>
          </div>
          {/* Sent date */}
          {notification.sent_at && (
            <p className="text-xs text-[var(--text-tertiary)]">
              Sent {format(new Date(notification.sent_at), 'MMMM d, yyyy \'at\' h:mm a')}
            </p>
          )}
        </div>
        {/* Archive button */}
        {notification.status === 'sent' && (
          <button
            onClick={handleArchive}
            disabled={archiving}
            className="px-4 min-h-[44px] text-sm font-medium rounded-lg transition-colors hover:bg-[rgba(255,255,255,0.06)]"
            style={{ color: 'var(--text-secondary)', border: '1px solid var(--border-default)' }}
          >
            {archiving ? 'Archiving...' : 'Archive'}
          </button>
        )}
      </div>

      {/* Content Preview */}
      <div className="bg-[var(--surface-raised)] rounded-xl border border-[var(--border-default)] p-6">
        <h2 className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider mb-4">Preview</h2>
        <NotificationPreview notification={notification} />
      </div>

      {/* Analytics Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Read" value={readCount} />
        <StatCard label="Read Rate" value={`${readRate}%`} />
        <StatCard label="CTA Clicks" value={clickCount} />
        <StatCard label="Click Rate" value={readCount > 0 ? `${clickRate}%` : '—'} />
      </div>

      {/* Read Table */}
      <div className="bg-[var(--surface-raised)] rounded-xl border border-[var(--border-default)]">
        <div className="px-6 py-4 border-b border-[var(--border-subtle)]">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">
            Read Activity
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border-subtle)]">
                <th className="text-left text-xs font-medium text-[var(--text-secondary)] px-4 py-3">Tenant</th>
                <th className="text-left text-xs font-medium text-[var(--text-secondary)] px-4 py-3">Read At</th>
                <th className="text-left text-xs font-medium text-[var(--text-secondary)] px-4 py-3">CTA Clicked</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {reads.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-12 text-center text-[var(--text-tertiary)]">
                    No reads yet
                  </td>
                </tr>
              ) : (
                reads.map((r, i) => (
                  <tr key={`${r.tenant_id}-${i}`} className="hover:bg-[var(--surface-subtle)]">
                    <td className="px-4 py-3 font-medium text-[var(--text-primary)]">{r.tenant_name}</td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">
                      {format(new Date(r.read_at), 'MMM d, yyyy h:mm a')}
                    </td>
                    <td className="px-4 py-3">
                      {r.cta_clicked_at ? (
                        <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium" style={{ backgroundColor: 'rgba(34, 197, 94, 0.15)', color: '#4ADE80' }}>
                          Yes — {format(new Date(r.cta_clicked_at), 'h:mm a')}
                        </span>
                      ) : (
                        <span className="text-[var(--text-tertiary)]">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Shared Preview Card ────────────────────────────────────────────────────

function NotificationPreview({ notification }: {
  notification: {
    type: string;
    title: string;
    body: string;
    image_url?: string | null;
    cta_text?: string | null;
    cta_link?: string | null;
    sent_at?: string | null;
  };
  timestamp?: string;
}) {
  const [imgError, setImgError] = useState(false);

  return (
    <div
      className="rounded-lg p-5 max-w-md space-y-3"
      style={{ backgroundColor: 'var(--surface-subtle)', border: '1px solid var(--border-subtle)' }}
    >
      {/* Type badge */}
      <span
        className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium"
        style={{
          backgroundColor: TYPE_COLORS[notification.type]?.bg,
          color: TYPE_COLORS[notification.type]?.text,
        }}
      >
        {TYPE_LABELS[notification.type] || notification.type}
      </span>

      {/* Title */}
      <h4 className="text-sm font-semibold text-[var(--text-primary)]">{notification.title || 'Untitled'}</h4>

      {/* Body with preserved line breaks */}
      <p className="text-sm text-[var(--text-secondary)] whitespace-pre-line leading-relaxed">
        {notification.body || 'No content yet...'}
      </p>

      {/* Image */}
      {notification.image_url && !imgError && (
        <img
          src={notification.image_url}
          alt=""
          className="w-full rounded-lg object-cover max-h-48"
          onError={() => setImgError(true)}
        />
      )}
      {notification.image_url && imgError && (
        <div className="w-full h-32 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--surface-base)', border: '1px dashed var(--border-default)' }}>
          <span className="text-xs text-[var(--text-tertiary)]">Image failed to load</span>
        </div>
      )}

      {/* CTA button */}
      {notification.cta_text && notification.cta_link && (
        <button
          className="inline-flex items-center px-4 min-h-[40px] rounded-lg text-sm font-medium transition-colors"
          style={{ backgroundColor: '#FF7A00', color: '#FFFFFF' }}
          onClick={(e) => e.preventDefault()}
        >
          {notification.cta_text}
        </button>
      )}

      {/* Timestamp */}
      <p className="text-[11px] text-[var(--text-tertiary)]">
        {notification.sent_at
          ? format(new Date(notification.sent_at), 'MMM d, yyyy h:mm a')
          : 'Just now'}
      </p>
    </div>
  );
}

// ─── Stat Card ──────────────────────────────────────────────────────────────

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="bg-[var(--surface-raised)] rounded-xl border border-[var(--border-default)] p-6">
      <div className="text-xs font-medium text-[var(--text-secondary)] mb-1">{label}</div>
      <div className="text-2xl font-bold text-[var(--text-primary)]">{value}</div>
    </div>
  );
}

// ─── Icons ──────────────────────────────────────────────────────────────────

function ArrowLeftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
    </svg>
  );
}
