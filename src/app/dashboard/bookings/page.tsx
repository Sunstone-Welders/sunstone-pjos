// ============================================================================
// Bookings Dashboard — /dashboard/bookings
// ============================================================================
// Artist-facing booking management: list, filter, approve/decline, status updates.
// ============================================================================

'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useTenant } from '@/hooks/use-tenant';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '@/components/ui/Modal';

// ============================================================================
// Types
// ============================================================================

interface BookingType {
  name: string;
  duration_minutes: number;
  color: string | null;
}

interface Booking {
  id: string;
  tenant_id: string;
  booking_type_id: string;
  staff_id: string | null;
  client_id: string | null;
  start_time: string;
  end_time: string;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show';
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  notes: string | null;
  cancellation_token: string;
  created_at: string;
  updated_at: string;
  booking_types: BookingType | null;
}

type TabKey = 'upcoming' | 'pending' | 'past' | 'all';

// ============================================================================
// Helpers
// ============================================================================

const STATUS_CONFIG: Record<string, { label: string; variant: 'warning' | 'success' | 'info' | 'default' | 'error' }> = {
  pending:   { label: 'Pending',   variant: 'warning' },
  confirmed: { label: 'Confirmed', variant: 'success' },
  completed: { label: 'Completed', variant: 'info' },
  cancelled: { label: 'Cancelled', variant: 'default' },
  no_show:   { label: 'No-show',   variant: 'error' },
};

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'UTC',
  });
}

function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatPhone(phone: string | null) {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '').slice(-10);
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return phone;
}

/** Get the start of the week (Sunday) for a given date */
function getWeekStart(d: Date): Date {
  const result = new Date(d);
  result.setUTCHours(0, 0, 0, 0);
  result.setUTCDate(result.getUTCDate() - result.getUTCDay());
  return result;
}

/** Get 7 days starting from a date */
function getWeekDays(start: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    return d;
  });
}

/** Format short day header: "Sun 15" */
function formatWeekDay(d: Date): { dayName: string; dayNum: string } {
  return {
    dayName: d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }),
    dayNum: d.getUTCDate().toString(),
  };
}

/** Format hour label: "8 AM" */
function formatHourLabel(hour: number): string {
  if (hour === 0) return '12 AM';
  if (hour < 12) return `${hour} AM`;
  if (hour === 12) return '12 PM';
  return `${hour - 12} PM`;
}

/** Get UTC hour from ISO string */
function getUTCHour(iso: string): number {
  return new Date(iso).getUTCHours();
}

/** Get UTC minutes from ISO string */
function getUTCMinutes(iso: string): number {
  return new Date(iso).getUTCMinutes();
}

/** Check if two dates are the same UTC day */
function isSameUTCDay(a: Date, b: Date): boolean {
  return a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);
}

type ViewMode = 'list' | 'week';

// ============================================================================
// Main Page
// ============================================================================

export default function BookingsPage() {
  const { tenant } = useTenant();
  const supabase = createClient();

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>('upcoming');
  const [search, setSearch] = useState('');
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [declineModal, setDeclineModal] = useState<Booking | null>(null);
  const [declineReason, setDeclineReason] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [hasBookingTypes, setHasBookingTypes] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));

  // ── Data fetching ─────────────────────────────────────────────────────────
  const fetchBookings = useCallback(async () => {
    if (!tenant) return;

    // Check if tenant has any booking types configured
    const { count } = await supabase
      .from('booking_types')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenant.id);
    setHasBookingTypes((count ?? 0) > 0);

    const { data, error } = await supabase
      .from('bookings')
      .select('*, booking_types(name, duration_minutes, color)')
      .eq('tenant_id', tenant.id)
      .order('start_time', { ascending: false });

    if (!error && data) {
      setBookings(data as Booking[]);
    }
    setLoading(false);
  }, [tenant]);

  useEffect(() => { fetchBookings(); }, [fetchBookings]);

  // ── Toast auto-dismiss ────────────────────────────────────────────────────
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  // ── Tab filtering ─────────────────────────────────────────────────────────
  const now = useMemo(() => new Date(), []);

  const filtered = useMemo(() => {
    let list: Booking[];
    switch (activeTab) {
      case 'upcoming':
        list = bookings.filter(b =>
          ['pending', 'confirmed'].includes(b.status) &&
          new Date(b.start_time) >= now
        ).sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
        break;
      case 'pending':
        list = bookings.filter(b => b.status === 'pending')
          .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        break;
      case 'past':
        list = bookings.filter(b =>
          new Date(b.start_time) < now || ['completed', 'cancelled', 'no_show'].includes(b.status)
        ).sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime());
        break;
      default: // 'all'
        list = [...bookings].sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime());
    }

    // Search filter
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(b =>
        (b.customer_name || '').toLowerCase().includes(q) ||
        (b.customer_phone || '').includes(q) ||
        (b.booking_types?.name || '').toLowerCase().includes(q)
      );
    }

    return list;
  }, [bookings, activeTab, search, now]);

  // ── Stats ─────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - today.getDay());
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);

    const todayCount = bookings.filter(b => {
      const d = b.start_time.slice(0, 10);
      return d === todayStr && ['pending', 'confirmed'].includes(b.status);
    }).length;

    const weekCount = bookings.filter(b => {
      const d = new Date(b.start_time);
      return d >= weekStart && d < weekEnd && ['pending', 'confirmed'].includes(b.status);
    }).length;

    const pendingCount = bookings.filter(b => b.status === 'pending').length;

    return { todayCount, weekCount, pendingCount };
  }, [bookings]);

  // ── Actions ───────────────────────────────────────────────────────────────
  const handleApprove = async (booking: Booking) => {
    setActionLoading(booking.id);
    try {
      const res = await fetch(`/api/bookings/${booking.id}/approve`, { method: 'POST' });
      if (res.ok) {
        setBookings(prev => prev.map(b =>
          b.id === booking.id ? { ...b, status: 'confirmed' as const } : b
        ));
        setToast('Booking confirmed');
        if (selectedBooking?.id === booking.id) {
          setSelectedBooking(prev => prev ? { ...prev, status: 'confirmed' } : null);
        }
      }
    } finally {
      setActionLoading(null);
    }
  };

  const handleDecline = async () => {
    if (!declineModal) return;
    setActionLoading(declineModal.id);
    try {
      const res = await fetch(`/api/bookings/${declineModal.id}/decline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: declineReason }),
      });
      if (res.ok) {
        setBookings(prev => prev.map(b =>
          b.id === declineModal.id ? { ...b, status: 'cancelled' as const } : b
        ));
        setToast('Booking declined');
        if (selectedBooking?.id === declineModal.id) {
          setSelectedBooking(prev => prev ? { ...prev, status: 'cancelled' } : null);
        }
      }
    } finally {
      setActionLoading(null);
      setDeclineModal(null);
      setDeclineReason('');
    }
  };

  const handleStatusChange = async (booking: Booking, newStatus: 'completed' | 'no_show' | 'cancelled') => {
    setActionLoading(booking.id);
    try {
      const res = await fetch(`/api/bookings/${booking.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        setBookings(prev => prev.map(b =>
          b.id === booking.id ? { ...b, status: newStatus } : b
        ));
        const labels: Record<string, string> = {
          completed: 'Marked complete',
          no_show: 'Marked no-show',
          cancelled: 'Booking cancelled',
        };
        setToast(labels[newStatus]);
        if (selectedBooking?.id === booking.id) {
          setSelectedBooking(prev => prev ? { ...prev, status: newStatus } : null);
        }
      }
    } finally {
      setActionLoading(null);
    }
  };

  // ── Tab counts ────────────────────────────────────────────────────────────
  const tabCounts = useMemo(() => ({
    upcoming: bookings.filter(b => ['pending', 'confirmed'].includes(b.status) && new Date(b.start_time) >= now).length,
    pending: bookings.filter(b => b.status === 'pending').length,
    past: bookings.filter(b => new Date(b.start_time) < now || ['completed', 'cancelled', 'no_show'].includes(b.status)).length,
    all: bookings.length,
  }), [bookings, now]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Bookings</h1>
        {/* View toggle */}
        <div className="flex items-center gap-1 bg-[var(--surface-subtle)] rounded-lg p-0.5">
          <button
            onClick={() => setViewMode('list')}
            className={`flex items-center justify-center w-8 h-8 rounded-md transition-colors ${
              viewMode === 'list'
                ? 'bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-sm'
                : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
            }`}
            title="List view"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
          </button>
          <button
            onClick={() => setViewMode('week')}
            className={`flex items-center justify-center w-8 h-8 rounded-md transition-colors ${
              viewMode === 'week'
                ? 'bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-sm'
                : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
            }`}
            title="Week view"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
            </svg>
          </button>
        </div>
      </div>

      {/* Stats Row */}
      {!loading && bookings.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-[var(--surface-raised)] rounded-2xl p-4 border border-[var(--border-default)]">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">Today</p>
            <p className="text-2xl font-bold text-[var(--text-primary)] mt-1">{stats.todayCount}</p>
          </div>
          <div className="bg-[var(--surface-raised)] rounded-2xl p-4 border border-[var(--border-default)]">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">This Week</p>
            <p className="text-2xl font-bold text-[var(--text-primary)] mt-1">{stats.weekCount}</p>
          </div>
          <div className="bg-[var(--surface-raised)] rounded-2xl p-4 border border-[var(--border-default)]">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">Pending</p>
            <p className="text-2xl font-bold text-[var(--warning-600)] mt-1">{stats.pendingCount}</p>
          </div>
        </div>
      )}

      {/* ── List View ─────────────────────────────────────────────── */}
      {viewMode === 'list' && (
        <>
          {/* Tabs */}
          <div className="flex items-center gap-1 bg-[var(--surface-subtle)] rounded-xl p-1 overflow-x-auto">
            {([
              { key: 'upcoming', label: 'Upcoming' },
              { key: 'pending', label: 'Pending' },
              { key: 'past', label: 'Past' },
              { key: 'all', label: 'All' },
            ] as { key: TabKey; label: string }[]).map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex-1 min-w-0 px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  activeTab === tab.key
                    ? 'bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-sm'
                    : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
                }`}
              >
                {tab.label}
                {tabCounts[tab.key] > 0 && (
                  <span className={`ml-1.5 text-[11px] ${
                    tab.key === 'pending' && activeTab !== 'pending'
                      ? 'text-[var(--warning-600)] font-bold'
                      : ''
                  }`}>
                    {tabCounts[tab.key]}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-tertiary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search bookings..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full h-10 pl-10 pr-4 rounded-xl border border-[var(--border-default)] bg-[var(--surface-base)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-subtle)]"
            />
          </div>

          {/* Booking List */}
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="rounded-xl border border-[var(--border-default)] bg-[var(--surface-raised)] p-4 animate-pulse">
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full bg-[var(--surface-subtle)]" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 w-40 bg-[var(--surface-subtle)] rounded" />
                      <div className="h-3 w-56 bg-[var(--surface-subtle)] rounded" />
                    </div>
                    <div className="h-6 w-16 bg-[var(--surface-subtle)] rounded-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState tab={activeTab} hasSearch={!!search.trim()} hasBookingTypes={hasBookingTypes} />
          ) : (
            <div className="space-y-2">
              {filtered.map(booking => (
                <BookingCard
                  key={booking.id}
                  booking={booking}
                  actionLoading={actionLoading}
                  onSelect={() => setSelectedBooking(booking)}
                  onApprove={() => handleApprove(booking)}
                  onDecline={() => { setDeclineModal(booking); setDeclineReason(''); }}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Week View ─────────────────────────────────────────────── */}
      {viewMode === 'week' && (
        <WeekView
          bookings={bookings}
          weekStart={weekStart}
          onWeekChange={setWeekStart}
          onSelectBooking={setSelectedBooking}
          loading={loading}
        />
      )}

      {/* Detail Modal */}
      {selectedBooking && (
        <BookingDetailModal
          booking={selectedBooking}
          actionLoading={actionLoading}
          onClose={() => setSelectedBooking(null)}
          onApprove={() => handleApprove(selectedBooking)}
          onDecline={() => { setDeclineModal(selectedBooking); setDeclineReason(''); }}
          onMarkComplete={() => handleStatusChange(selectedBooking, 'completed')}
          onMarkNoShow={() => handleStatusChange(selectedBooking, 'no_show')}
          onCancel={() => handleStatusChange(selectedBooking, 'cancelled')}
        />
      )}

      {/* Decline Confirmation Modal */}
      <Modal isOpen={!!declineModal} onClose={() => { setDeclineModal(null); setDeclineReason(''); }} size="sm">
        <ModalHeader>
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">Decline Booking</h2>
        </ModalHeader>
        <ModalBody>
          <p className="text-sm text-[var(--text-secondary)] mb-4">
            Decline this booking from <strong>{declineModal?.customer_name}</strong>?
          </p>
          <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
            Reason (optional)
          </label>
          <textarea
            value={declineReason}
            onChange={e => setDeclineReason(e.target.value)}
            placeholder="e.g. Fully booked that day"
            rows={2}
            className="w-full px-3 py-2 rounded-lg border border-[var(--border-default)] bg-[var(--surface-base)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-subtle)] resize-none"
          />
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" size="sm" onClick={() => { setDeclineModal(null); setDeclineReason(''); }}>
            Cancel
          </Button>
          <Button
            variant="danger"
            size="sm"
            loading={actionLoading === declineModal?.id}
            onClick={handleDecline}
          >
            Decline Booking
          </Button>
        </ModalFooter>
      </Modal>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-xl shadow-lg text-sm font-medium text-[var(--text-primary)] animate-in fade-in slide-in-from-bottom-4 duration-200">
          {toast}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// BookingCard
// ============================================================================

function BookingCard({
  booking,
  actionLoading,
  onSelect,
  onApprove,
  onDecline,
}: {
  booking: Booking;
  actionLoading: string | null;
  onSelect: () => void;
  onApprove: () => void;
  onDecline: () => void;
}) {
  const config = STATUS_CONFIG[booking.status] || STATUS_CONFIG.cancelled;
  const typeName = booking.booking_types?.name || 'Appointment';
  const duration = booking.booking_types?.duration_minutes || 0;
  const color = booking.booking_types?.color || 'var(--accent-500)';

  return (
    <div
      className="bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-xl p-4 cursor-pointer hover:border-[var(--accent-200)] transition-colors"
      onClick={onSelect}
    >
      <div className="flex items-start gap-3">
        {/* Color dot */}
        <div
          className="w-3 h-3 rounded-full mt-1.5 shrink-0"
          style={{ backgroundColor: color }}
        />

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Row 1: Type + Status */}
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="text-sm font-semibold text-[var(--text-primary)] truncate">{typeName}</span>
            <Badge variant={config.variant} size="sm">{config.label}</Badge>
          </div>

          {/* Row 2: Customer */}
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm text-[var(--text-primary)]">{booking.customer_name || 'Unknown'}</span>
            {booking.customer_phone && (
              <a
                href={`tel:${booking.customer_phone}`}
                onClick={e => e.stopPropagation()}
                className="text-xs text-[var(--accent-600)] hover:underline"
              >
                {formatPhone(booking.customer_phone)}
              </a>
            )}
          </div>

          {/* Row 3: Date + Time + Duration */}
          <div className="flex items-center gap-2 text-xs text-[var(--text-tertiary)]">
            <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
            </svg>
            <span>{formatDate(booking.start_time)}</span>
            <span>&middot;</span>
            <span>{formatTime(booking.start_time)}</span>
            {duration > 0 && (
              <>
                <span>&middot;</span>
                <span>{formatDuration(duration)}</span>
              </>
            )}
            {booking.notes && (
              <>
                <span>&middot;</span>
                <span className="flex items-center gap-0.5" title={booking.notes}>
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
                  </svg>
                  Note
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Pending actions */}
      {booking.status === 'pending' && (
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[var(--border-subtle)]" onClick={e => e.stopPropagation()}>
          <Button
            variant="primary"
            size="sm"
            className="flex-1"
            loading={actionLoading === booking.id}
            onClick={onApprove}
          >
            Approve
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="flex-1"
            onClick={onDecline}
          >
            Decline
          </Button>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// BookingDetailModal
// ============================================================================

function BookingDetailModal({
  booking,
  actionLoading,
  onClose,
  onApprove,
  onDecline,
  onMarkComplete,
  onMarkNoShow,
  onCancel,
}: {
  booking: Booking;
  actionLoading: string | null;
  onClose: () => void;
  onApprove: () => void;
  onDecline: () => void;
  onMarkComplete: () => void;
  onMarkNoShow: () => void;
  onCancel: () => void;
}) {
  const config = STATUS_CONFIG[booking.status] || STATUS_CONFIG.cancelled;
  const typeName = booking.booking_types?.name || 'Appointment';
  const duration = booking.booking_types?.duration_minutes || 0;
  const color = booking.booking_types?.color || 'var(--accent-500)';
  const isLoading = actionLoading === booking.id;

  return (
    <Modal isOpen onClose={onClose} size="lg">
      <ModalHeader>
        <div className="flex items-center gap-3">
          <div className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: color }} />
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">{typeName}</h2>
          <Badge variant={config.variant} size="sm">{config.label}</Badge>
        </div>
      </ModalHeader>

      <ModalBody className="space-y-4">
        {/* Customer Info */}
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">Customer</h3>
          <div className="text-sm text-[var(--text-primary)] font-medium">{booking.customer_name || 'Unknown'}</div>
          {booking.customer_phone && (
            <div className="flex items-center gap-2">
              <a href={`tel:${booking.customer_phone}`} className="text-sm text-[var(--accent-600)] hover:underline">
                {formatPhone(booking.customer_phone)}
              </a>
              <a href={`sms:${booking.customer_phone}`} className="text-xs text-[var(--text-tertiary)] hover:text-[var(--accent-600)]">
                Text
              </a>
            </div>
          )}
          {booking.customer_email && (
            <div className="text-sm text-[var(--text-secondary)]">{booking.customer_email}</div>
          )}
        </div>

        {/* Date/Time */}
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">Appointment</h3>
          <div className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
            <svg className="w-4 h-4 text-[var(--text-tertiary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
            </svg>
            <span>{formatDate(booking.start_time)} at {formatTime(booking.start_time)}</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
            <svg className="w-4 h-4 text-[var(--text-tertiary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>
              {formatTime(booking.start_time)} – {formatTime(booking.end_time)}
              {duration > 0 && ` (${formatDuration(duration)})`}
            </span>
          </div>
        </div>

        {/* Notes */}
        {booking.notes && (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">Notes</h3>
            <p className="text-sm text-[var(--text-secondary)] bg-[var(--surface-subtle)] rounded-lg p-3">
              {booking.notes}
            </p>
          </div>
        )}

        {/* Timestamps */}
        <div className="text-xs text-[var(--text-tertiary)] pt-2 border-t border-[var(--border-subtle)]">
          Booked {new Date(booking.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
        </div>
      </ModalBody>

      <ModalFooter className="flex-wrap">
        {/* Pending actions */}
        {booking.status === 'pending' && (
          <>
            <Button variant="primary" size="sm" loading={isLoading} onClick={onApprove}>
              Approve
            </Button>
            <Button variant="danger" size="sm" onClick={onDecline}>
              Decline
            </Button>
          </>
        )}

        {/* Confirmed actions */}
        {booking.status === 'confirmed' && (
          <>
            <Button variant="primary" size="sm" loading={isLoading} onClick={onMarkComplete}>
              Mark Complete
            </Button>
            <Button variant="ghost" size="sm" loading={isLoading} onClick={onMarkNoShow}>
              No-show
            </Button>
            <Button variant="danger" size="sm" onClick={onCancel}>
              Cancel
            </Button>
          </>
        )}

        <Button variant="secondary" size="sm" onClick={onClose} className="ml-auto">
          Close
        </Button>
      </ModalFooter>
    </Modal>
  );
}

// ============================================================================
// WeekView
// ============================================================================

const WEEK_HOUR_START = 7;
const WEEK_HOUR_END = 21;
const HOUR_HEIGHT = 60; // px per hour

function WeekView({
  bookings,
  weekStart,
  onWeekChange,
  onSelectBooking,
  loading,
}: {
  bookings: Booking[];
  weekStart: Date;
  onWeekChange: (d: Date) => void;
  onSelectBooking: (b: Booking) => void;
  loading: boolean;
}) {
  const days = useMemo(() => getWeekDays(weekStart), [weekStart]);
  const todayStr = new Date().toISOString().slice(0, 10);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // On mobile show 3-day view centered on today
  const visibleDays = useMemo(() => {
    if (!isMobile) return days;
    const todayIdx = days.findIndex(d => d.toISOString().slice(0, 10) === todayStr);
    const centerIdx = todayIdx >= 0 ? todayIdx : 0;
    const start = Math.max(0, Math.min(centerIdx - 1, days.length - 3));
    return days.slice(start, start + 3);
  }, [days, isMobile, todayStr]);

  // Filter bookings for this week (active statuses only)
  const weekBookings = useMemo(() => {
    const weekEnd = new Date(weekStart);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);
    return bookings.filter(b => {
      const d = new Date(b.start_time);
      return d >= weekStart && d < weekEnd && ['pending', 'confirmed'].includes(b.status);
    });
  }, [bookings, weekStart]);

  // Group bookings by day string
  const bookingsByDay = useMemo(() => {
    const map = new Map<string, Booking[]>();
    for (const b of weekBookings) {
      const dayKey = b.start_time.slice(0, 10);
      const arr = map.get(dayKey) || [];
      arr.push(b);
      map.set(dayKey, arr);
    }
    return map;
  }, [weekBookings]);

  // Current time indicator
  const [currentTime, setCurrentTime] = useState(new Date());
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  const navigateWeek = (dir: -1 | 1) => {
    const next = new Date(weekStart);
    next.setUTCDate(next.getUTCDate() + dir * 7);
    onWeekChange(next);
  };

  const goToToday = () => {
    onWeekChange(getWeekStart(new Date()));
  };

  const totalHours = WEEK_HOUR_END - WEEK_HOUR_START;

  // Week range label
  const weekEndDate = new Date(weekStart);
  weekEndDate.setUTCDate(weekEndDate.getUTCDate() + 6);
  const weekLabel = `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })} – ${weekEndDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}`;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-6 h-6 border-2 border-[var(--accent-primary)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Week navigation */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigateWeek(-1)}
            className="flex items-center justify-center w-8 h-8 rounded-lg border border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </button>
          <button
            onClick={() => navigateWeek(1)}
            className="flex items-center justify-center w-8 h-8 rounded-lg border border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </button>
          <span className="text-sm font-semibold text-[var(--text-primary)]">{weekLabel}</span>
        </div>
        <button
          onClick={goToToday}
          className="px-3 py-1.5 text-xs font-medium rounded-lg border border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
        >
          Today
        </button>
      </div>

      {/* Calendar grid */}
      <div className="bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-xl overflow-hidden">
        {/* Day headers */}
        <div className={`grid border-b border-[var(--border-default)]`} style={{ gridTemplateColumns: `48px repeat(${visibleDays.length}, 1fr)` }}>
          {/* Time axis label */}
          <div className="h-12" />
          {visibleDays.map(day => {
            const { dayName, dayNum } = formatWeekDay(day);
            const isToday = day.toISOString().slice(0, 10) === todayStr;
            return (
              <div key={day.toISOString()} className={`h-12 flex flex-col items-center justify-center border-l border-[var(--border-default)] ${isToday ? 'bg-[var(--accent-100)]' : ''}`}>
                <span className="text-[10px] font-medium text-[var(--text-tertiary)] uppercase">{dayName}</span>
                <span className={`text-sm font-semibold ${isToday ? 'text-[var(--accent-primary)]' : 'text-[var(--text-primary)]'}`}>{dayNum}</span>
              </div>
            );
          })}
        </div>

        {/* Time grid */}
        <div className="relative overflow-y-auto" style={{ maxHeight: '600px' }}>
          <div className={`grid`} style={{ gridTemplateColumns: `48px repeat(${visibleDays.length}, 1fr)`, height: `${totalHours * HOUR_HEIGHT}px` }}>
            {/* Time labels */}
            <div className="relative">
              {Array.from({ length: totalHours }, (_, i) => (
                <div
                  key={i}
                  className="absolute right-2 text-[10px] text-[var(--text-tertiary)] leading-none"
                  style={{ top: `${i * HOUR_HEIGHT - 5}px` }}
                >
                  {formatHourLabel(WEEK_HOUR_START + i)}
                </div>
              ))}
            </div>

            {/* Day columns */}
            {visibleDays.map(day => {
              const dayStr = day.toISOString().slice(0, 10);
              const isToday = dayStr === todayStr;
              const dayBookings = bookingsByDay.get(dayStr) || [];

              return (
                <div key={dayStr} className={`relative border-l border-[var(--border-default)] ${isToday ? 'bg-[var(--accent-100)]/30' : ''}`}>
                  {/* Hour grid lines */}
                  {Array.from({ length: totalHours }, (_, i) => (
                    <div
                      key={i}
                      className="absolute left-0 right-0 border-t border-[var(--border-subtle)]"
                      style={{ top: `${i * HOUR_HEIGHT}px` }}
                    />
                  ))}

                  {/* Current time indicator */}
                  {isToday && (() => {
                    const nowHour = currentTime.getUTCHours();
                    const nowMin = currentTime.getUTCMinutes();
                    if (nowHour < WEEK_HOUR_START || nowHour >= WEEK_HOUR_END) return null;
                    const topPx = (nowHour - WEEK_HOUR_START) * HOUR_HEIGHT + (nowMin / 60) * HOUR_HEIGHT;
                    return (
                      <div
                        className="absolute left-0 right-0 z-20 pointer-events-none"
                        style={{ top: `${topPx}px` }}
                      >
                        <div className="w-2 h-2 rounded-full bg-red-500 -ml-1 -mt-1 absolute" />
                        <div className="h-px bg-red-500 w-full" />
                      </div>
                    );
                  })()}

                  {/* Booking blocks */}
                  {dayBookings.map(b => {
                    const startH = getUTCHour(b.start_time);
                    const startM = getUTCMinutes(b.start_time);
                    const endH = getUTCHour(b.end_time);
                    const endM = getUTCMinutes(b.end_time);
                    const duration = b.booking_types?.duration_minutes || 30;
                    const color = b.booking_types?.color || 'var(--accent-500)';
                    const isPending = b.status === 'pending';

                    const topPx = Math.max(0, (startH - WEEK_HOUR_START) * HOUR_HEIGHT + (startM / 60) * HOUR_HEIGHT);
                    const heightPx = Math.max(24, ((endH - startH) * 60 + (endM - startM)) / 60 * HOUR_HEIGHT);

                    return (
                      <button
                        key={b.id}
                        onClick={() => onSelectBooking(b)}
                        className={`absolute left-0.5 right-0.5 z-10 rounded-md px-1.5 py-0.5 text-left overflow-hidden cursor-pointer hover:opacity-90 transition-opacity ${
                          isPending ? 'border-2 border-dashed' : 'border'
                        }`}
                        style={{
                          top: `${topPx}px`,
                          height: `${heightPx}px`,
                          backgroundColor: `${color}20`,
                          borderColor: color,
                        }}
                        title={`${b.customer_name || 'Unknown'} — ${b.booking_types?.name || 'Appointment'} (${formatTime(b.start_time)})`}
                      >
                        <span className="block text-[10px] font-semibold truncate" style={{ color }}>
                          {formatTime(b.start_time)}
                        </span>
                        {duration >= 30 && (
                          <span className="block text-[10px] truncate text-[var(--text-secondary)]">
                            {b.customer_name?.split(' ')[0] || 'Unknown'}
                          </span>
                        )}
                        {duration >= 45 && (
                          <span className="block text-[9px] truncate text-[var(--text-tertiary)]">
                            {b.booking_types?.name || 'Appt'}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Week summary */}
      <p className="text-xs text-[var(--text-tertiary)] text-center">
        {weekBookings.length} booking{weekBookings.length !== 1 ? 's' : ''} this week
      </p>
    </div>
  );
}

// ============================================================================
// EmptyState
// ============================================================================

function EmptyState({ tab, hasSearch, hasBookingTypes }: { tab: TabKey; hasSearch: boolean; hasBookingTypes: boolean }) {
  if (hasSearch) {
    return (
      <Card padding="lg">
        <CardContent>
          <div className="text-center py-8">
            <svg className="w-10 h-10 mx-auto mb-3 text-[var(--text-tertiary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <p className="text-[var(--text-tertiary)]">No bookings match your search</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // No booking types configured — show setup prompt
  if (!hasBookingTypes && tab === 'all') {
    return (
      <Card padding="lg">
        <CardContent>
          <div className="text-center py-8">
            <svg className="w-10 h-10 mx-auto mb-3 text-[var(--text-tertiary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <p className="text-sm font-medium text-[var(--text-primary)] mb-1">No booking types set up yet</p>
            <p className="text-sm text-[var(--text-tertiary)] mb-4">
              Create your first booking type in Settings to start accepting appointments.
            </p>
            <Link
              href="/dashboard/settings?section=booking"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-[var(--accent-primary)] bg-[var(--accent-100)] rounded-lg hover:bg-[var(--accent-200)] transition-colors"
            >
              Set Up Bookings
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  const messages: Record<TabKey, { icon: string; text: string }> = {
    upcoming: { icon: 'calendar', text: 'No upcoming bookings' },
    pending: { icon: 'clock', text: 'No pending requests — all caught up!' },
    past: { icon: 'archive', text: 'No past bookings yet' },
    all: { icon: 'calendar', text: 'No bookings yet. Share your booking page to get started!' },
  };

  const msg = messages[tab];

  return (
    <Card padding="lg">
      <CardContent>
        <div className="text-center py-8">
          <svg className="w-10 h-10 mx-auto mb-3 text-[var(--text-tertiary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
          </svg>
          <p className="text-[var(--text-tertiary)]">{msg.text}</p>
        </div>
      </CardContent>
    </Card>
  );
}
