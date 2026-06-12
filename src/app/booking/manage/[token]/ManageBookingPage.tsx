// ============================================================================
// ManageBookingPage — Client component for /booking/manage/[token]
// ============================================================================
// Three states:
//   1. Active booking — show details + Cancel / Reschedule buttons
//   2. Reschedule view — date strip + time slot picker + confirm
//   3. Cancelled — show "already cancelled" with link to rebook
// ============================================================================

'use client';

import { useEffect, useState, useCallback } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { applyTheme } from '@/lib/theme';
import { getThemeById, DEFAULT_THEME_ID } from '@/lib/themes';
import { Button } from '@/components/ui';

// ── Types ───────────────────────────────────────────────────────────────────

interface BookingInfo {
  id: string;
  tenantId: string;
  bookingTypeId: string;
  startTime: string;
  endTime: string;
  status: string;
  customerName: string;
  isCancelled: boolean;
  depositAmount: number | null;
  depositStatus: string | null;
  depositPaidAt: string | null;
}

interface BookingTypeInfo {
  id: string;
  name: string;
  durationMinutes: number;
  description: string | null;
  price: number | null;
  depositAmount: number | null;
  depositRequired: boolean;
}

interface TenantInfo {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  themeId: string;
  location: string | null;
}

interface Slot {
  start_time: string;
  end_time: string;
}

type ViewState = 'loading' | 'details' | 'reschedule' | 'cancelled' | 'not_found' | 'error';

// ── Helpers ─────────────────────────────────────────────────────────────────

function getDateRange(days: number): Date[] {
  const dates: Date[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    dates.push(d);
  }
  return dates;
}

function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0];
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'UTC',
  });
}

function formatDateLong(d: Date): string {
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function formatDateShort(d: Date): string {
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function formatDayLetter(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'narrow' });
}

function formatDayNum(d: Date): string {
  return d.getDate().toString();
}

// ── Component ───────────────────────────────────────────────────────────────

export default function ManageBookingPage({ token }: { token: string }) {
  const [view, setView] = useState<ViewState>('loading');
  const [booking, setBooking] = useState<BookingInfo | null>(null);
  const [bookingType, setBookingType] = useState<BookingTypeInfo | null>(null);
  const [tenant, setTenant] = useState<TenantInfo | null>(null);
  const [logoError, setLogoError] = useState(false);

  // Deposit state
  const [depositBanner, setDepositBanner] = useState<'success' | 'cancelled' | null>(null);
  const [depositPayUrl, setDepositPayUrl] = useState<string | null>(null);
  const [creatingDepositLink, setCreatingDepositLink] = useState(false);

  // Cancel state
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState('');

  // Reschedule state
  const [dates] = useState(() => getDateRange(30));
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [slots, setSlots] = useState<Slot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [showRescheduleConfirm, setShowRescheduleConfirm] = useState(false);
  const [rescheduling, setRescheduling] = useState(false);
  const [rescheduleError, setRescheduleError] = useState('');
  const [rescheduleSuccess, setRescheduleSuccess] = useState(false);

  // ── Load booking data ───────────────────────────────────────────────────
  useEffect(() => {
    // Check URL params for deposit status
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('deposit') === 'success') setDepositBanner('success');
      else if (params.get('deposit') === 'cancelled') setDepositBanner('cancelled');
    }

    async function load() {
      try {
        const res = await fetch(`/api/public/bookings/manage?token=${encodeURIComponent(token)}`);
        if (res.status === 404) {
          setView('not_found');
          return;
        }
        if (!res.ok) {
          setView('error');
          return;
        }
        const data = await res.json();
        setBooking(data.booking);
        setBookingType(data.bookingType);
        setTenant(data.tenant);
        setView(data.booking.isCancelled ? 'cancelled' : 'details');
      } catch {
        setView('error');
      }
    }
    load();
  }, [token]);

  // ── Apply theme ─────────────────────────────────────────────────────────
  useEffect(() => {
    const themeId = tenant?.themeId || DEFAULT_THEME_ID;
    const theme = getThemeById(themeId);
    applyTheme(theme);
  }, [tenant?.themeId]);

  // ── Fetch available slots ───────────────────────────────────────────────
  const fetchSlots = useCallback(async (date: string) => {
    if (!tenant || !booking || !bookingType) return;
    setSlotsLoading(true);
    setSlots([]);
    setSelectedSlot(null);
    setShowRescheduleConfirm(false);
    setRescheduleError('');

    try {
      const params = new URLSearchParams({
        tenantId: tenant.id,
        bookingTypeId: booking.bookingTypeId,
        date,
      });
      const res = await fetch(`/api/public/bookings/available-slots?${params}`);
      if (!res.ok) {
        setSlots([]);
        return;
      }
      const data = await res.json();
      setSlots(data.slots || []);
    } catch {
      setSlots([]);
    } finally {
      setSlotsLoading(false);
    }
  }, [tenant, booking, bookingType]);

  useEffect(() => {
    if (selectedDate && view === 'reschedule') {
      fetchSlots(selectedDate);
    }
  }, [selectedDate, view, fetchSlots]);

  // ── Handle cancel ───────────────────────────────────────────────────────
  const handleCancel = async () => {
    setCancelling(true);
    setCancelError('');

    try {
      const res = await fetch('/api/public/bookings/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to cancel booking');
      }

      setBooking((prev) => prev ? { ...prev, status: 'cancelled', isCancelled: true } : prev);
      setView('cancelled');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Something went wrong.';
      setCancelError(message);
    } finally {
      setCancelling(false);
    }
  };

  // ── Handle reschedule ───────────────────────────────────────────────────
  const handleReschedule = async () => {
    if (!selectedSlot) return;
    setRescheduling(true);
    setRescheduleError('');

    try {
      const res = await fetch('/api/public/bookings/reschedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newStartTime: selectedSlot.start_time }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to reschedule booking');
      }

      const data = await res.json();
      setBooking((prev) =>
        prev
          ? {
              ...prev,
              startTime: data.booking.start_time,
              endTime: data.booking.end_time,
            }
          : prev
      );
      setRescheduleSuccess(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Something went wrong.';
      setRescheduleError(message);
    } finally {
      setRescheduling(false);
    }
  };

  // ── Create fresh deposit link ───────────────────────────────────────────
  const handlePayDeposit = async () => {
    if (!booking) return;
    setCreatingDepositLink(true);
    try {
      const res = await fetch(`/api/public/bookings/create-deposit-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: booking.id, token }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to create deposit link');
      }
      const data = await res.json();
      if (data.paymentUrl) {
        window.location.href = data.paymentUrl;
      }
    } catch (err: unknown) {
      console.error('[ManageBooking] Deposit link error:', err);
    } finally {
      setCreatingDepositLink(false);
    }
  };

  // ── Enter reschedule mode ───────────────────────────────────────────────
  const enterReschedule = () => {
    setSelectedDate(toDateStr(new Date()));
    setRescheduleSuccess(false);
    setRescheduleError('');
    setSelectedSlot(null);
    setShowRescheduleConfirm(false);
    setView('reschedule');
  };

  // ── Back to details ─────────────────────────────────────────────────────
  const backToDetails = () => {
    setRescheduleSuccess(false);
    setRescheduleError('');
    setSelectedSlot(null);
    setView('details');
  };

  // ── Loading ─────────────────────────────────────────────────────────────
  if (view === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--surface-base)]">
        <div className="w-8 h-8 border-2 border-[var(--accent-primary)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // ── Not Found ───────────────────────────────────────────────────────────
  if (view === 'not_found' || view === 'error') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--surface-base)] px-4">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--surface-raised)] flex items-center justify-center">
          <svg className="w-8 h-8 text-[var(--text-tertiary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
        </div>
        <h1 className="text-xl font-semibold text-[var(--text-primary)] mb-2" style={{ fontFamily: 'var(--font-heading)' }}>
          Booking Not Found
        </h1>
        <p className="text-sm text-[var(--text-secondary)] text-center max-w-sm">
          This booking link is invalid or the booking can no longer be modified.
        </p>
      </div>
    );
  }

  // ── Cancelled State ─────────────────────────────────────────────────────
  if (view === 'cancelled' && tenant) {
    return (
      <div className="min-h-screen bg-[var(--surface-base)]">
        <div className="max-w-[640px] mx-auto px-4 py-8 space-y-6">
          <div className="text-center space-y-4">
            <div className="w-16 h-16 mx-auto rounded-full bg-red-50 flex items-center justify-center">
              <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)]" style={{ fontFamily: 'var(--font-heading)' }}>
              Booking Cancelled
            </h1>
            <p className="text-sm text-[var(--text-secondary)] max-w-sm mx-auto">
              This booking has been cancelled.
            </p>
          </div>

          {booking && bookingType && (
            <div className="bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-xl p-5 space-y-3 opacity-60">
              <h2 className="text-base font-semibold text-[var(--text-primary)]">
                {bookingType.name}
              </h2>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                  </svg>
                  <span className="line-through">
                    {formatDateLong(new Date(booking.startTime))}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="line-through">
                    {formatTime(booking.startTime)} — {formatTime(booking.endTime)}
                  </span>
                </div>
              </div>
            </div>
          )}

          <div className="text-center">
            <Link
              href={`/studio/${tenant.slug}/book`}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--accent-primary)] hover:underline"
            >
              Book a new appointment
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
            </Link>
          </div>

          <footer className="text-center pt-4 pb-8 border-t border-[var(--border-subtle)]">
            <a
              href="https://sunstonepj.app"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
            >
              Powered by Sunstone Studio
            </a>
          </footer>
        </div>
      </div>
    );
  }

  // ── Reschedule Success ──────────────────────────────────────────────────
  if (view === 'reschedule' && rescheduleSuccess && booking && bookingType && tenant) {
    return (
      <div className="min-h-screen bg-[var(--surface-base)]">
        <div className="max-w-[640px] mx-auto px-4 py-8 space-y-6">
          <div className="text-center space-y-4">
            <div className="w-16 h-16 mx-auto rounded-full bg-green-50 flex items-center justify-center">
              <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)]" style={{ fontFamily: 'var(--font-heading)' }}>
              Booking Rescheduled!
            </h1>
            <p className="text-sm text-[var(--text-secondary)] max-w-sm mx-auto">
              Your appointment has been updated. You&apos;ll receive a confirmation text shortly.
            </p>
          </div>

          <div className="bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-xl p-5 space-y-3">
            <h2 className="text-base font-semibold text-[var(--text-primary)]">
              {bookingType.name}
            </h2>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                </svg>
                {formatDateLong(new Date(booking.startTime))}
              </div>
              <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {formatTime(booking.startTime)} — {formatTime(booking.endTime)}
              </div>
              <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                </svg>
                {booking.customerName}
              </div>
              <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349m-16.5 11.65V9.35m0 0a3.001 3.001 0 003.75-.615A2.993 2.993 0 009.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 002.25 1.016c.896 0 1.7-.393 2.25-1.016A3.001 3.001 0 0021 9.349m-18 0a2.999 2.999 0 00.615-3.75L5.25 3h13.5l1.635 2.599A2.999 2.999 0 0021 9.349" />
                </svg>
                {tenant.name}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <button
              onClick={backToDetails}
              className="text-center text-sm font-medium text-[var(--accent-primary)] hover:underline"
            >
              View booking details
            </button>
          </div>

          <footer className="text-center pt-4 pb-8 border-t border-[var(--border-subtle)]">
            <a
              href="https://sunstonepj.app"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
            >
              Powered by Sunstone Studio
            </a>
          </footer>
        </div>
      </div>
    );
  }

  // ── Reschedule View ─────────────────────────────────────────────────────
  if (view === 'reschedule' && booking && bookingType && tenant) {
    return (
      <div className="min-h-screen bg-[var(--surface-base)]">
        <div className="max-w-[640px] mx-auto px-4 py-8 space-y-6">

          {/* Header with back button */}
          <div className="flex items-center gap-3">
            <button
              onClick={backToDetails}
              className="flex items-center justify-center w-10 h-10 rounded-full bg-[var(--surface-raised)] border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
            </button>
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-[var(--text-primary)]" style={{ fontFamily: 'var(--font-heading)' }}>
                Reschedule Appointment
              </h1>
              <p className="text-xs text-[var(--text-secondary)]">
                {bookingType.name} with {tenant.name} — {bookingType.durationMinutes} min
              </p>
            </div>
          </div>

          {/* Current booking */}
          <div className="bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-xl p-4">
            <p className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider mb-1">Current Time</p>
            <p className="text-sm text-[var(--text-secondary)]">
              {formatDateLong(new Date(booking.startTime))} at {formatTime(booking.startTime)}
            </p>
          </div>

          {/* Date strip */}
          <section>
            <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-3">
              Select a New Date
            </h2>
            <div className="flex gap-1.5 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
              {dates.map((d) => {
                const ds = toDateStr(d);
                const isSelected = ds === selectedDate;
                const isToday = ds === toDateStr(new Date());
                return (
                  <button
                    key={ds}
                    onClick={() => {
                      setSelectedDate(ds);
                      setSelectedSlot(null);
                      setShowRescheduleConfirm(false);
                      setRescheduleError('');
                    }}
                    className={`
                      flex flex-col items-center justify-center min-w-[52px] h-[68px] rounded-xl border transition-all flex-shrink-0
                      ${isSelected
                        ? 'bg-[var(--accent-primary)] border-[var(--accent-primary)] text-white'
                        : 'bg-[var(--surface-raised)] border-[var(--border-default)] text-[var(--text-primary)] hover:border-[var(--accent-primary)]'
                      }
                    `}
                  >
                    <span className={`text-[10px] font-medium uppercase ${isSelected ? 'text-white/80' : 'text-[var(--text-tertiary)]'}`}>
                      {formatDayLetter(d)}
                    </span>
                    <span className={`text-lg font-semibold ${isSelected ? 'text-white' : ''}`}>
                      {formatDayNum(d)}
                    </span>
                    {isToday && (
                      <div className={`w-1 h-1 rounded-full mt-0.5 ${isSelected ? 'bg-white' : 'bg-[var(--accent-primary)]'}`} />
                    )}
                  </button>
                );
              })}
            </div>
            {selectedDate && (
              <p className="text-xs text-[var(--text-secondary)] mt-2">
                {formatDateShort(new Date(selectedDate + 'T00:00:00'))}
              </p>
            )}
          </section>

          {/* Time slots */}
          <section>
            <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-3">
              Available Times
            </h2>

            {slotsLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-6 h-6 border-2 border-[var(--accent-primary)] border-t-transparent rounded-full animate-spin" />
              </div>
            ) : slots.length === 0 ? (
              <div className="text-center py-8 bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-xl">
                <svg className="w-8 h-8 mx-auto mb-2 text-[var(--text-tertiary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm text-[var(--text-secondary)]">
                  No availability on this date. Try another day.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {slots.map((slot) => {
                  const isSelected = selectedSlot?.start_time === slot.start_time;
                  return (
                    <button
                      key={slot.start_time}
                      onClick={() => {
                        setSelectedSlot(slot);
                        setShowRescheduleConfirm(true);
                        setRescheduleError('');
                      }}
                      className={`
                        px-3 py-2.5 text-sm font-medium rounded-xl border transition-all min-h-[48px]
                        ${isSelected
                          ? 'bg-[var(--accent-primary)] border-[var(--accent-primary)] text-white'
                          : 'bg-[var(--surface-raised)] border-[var(--border-default)] text-[var(--text-primary)] hover:border-[var(--accent-primary)]'
                        }
                      `}
                    >
                      {formatTime(slot.start_time)}
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          {/* Confirm reschedule */}
          {showRescheduleConfirm && selectedSlot && (
            <section className="animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-xl p-4 space-y-3">
                <p className="text-sm font-medium text-[var(--text-primary)]">
                  Confirm new time:
                </p>
                <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                  <svg className="w-4 h-4 text-[var(--accent-primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="font-medium text-[var(--text-primary)]">
                    {formatDateLong(new Date(selectedDate + 'T00:00:00'))} at {formatTime(selectedSlot.start_time)}
                  </span>
                </div>

                {rescheduleError && (
                  <p className="text-sm text-red-600">{rescheduleError}</p>
                )}

                <Button
                  variant="primary"
                  className="w-full"
                  loading={rescheduling}
                  onClick={handleReschedule}
                >
                  Confirm Reschedule
                </Button>
              </div>
            </section>
          )}

          <footer className="text-center pt-4 pb-8 border-t border-[var(--border-subtle)]">
            <a
              href="https://sunstonepj.app"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
            >
              Powered by Sunstone Studio
            </a>
          </footer>
        </div>
      </div>
    );
  }

  // ── Active Booking Details ──────────────────────────────────────────────
  if (view === 'details' && booking && bookingType && tenant) {
    const bookingDate = new Date(booking.startTime);

    return (
      <div className="min-h-screen bg-[var(--surface-base)]">
        <div className="max-w-[640px] mx-auto px-4 py-8 space-y-6">

          {/* Header */}
          <div className="flex items-center gap-3">
            {tenant.logoUrl && !logoError ? (
              <div className="w-12 h-12 rounded-full overflow-hidden border border-[var(--border-default)] bg-[var(--surface-raised)] flex-shrink-0">
                <Image
                  src={tenant.logoUrl}
                  alt={tenant.name}
                  width={48}
                  height={48}
                  className="w-full h-full object-cover"
                  onError={() => setLogoError(true)}
                />
              </div>
            ) : (
              <div className="w-12 h-12 rounded-full bg-[var(--accent-100)] flex items-center justify-center flex-shrink-0">
                <span className="text-base font-bold text-[var(--accent-primary)]" style={{ fontFamily: 'var(--font-heading)' }}>
                  {tenant.name.charAt(0)}
                </span>
              </div>
            )}
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-[var(--text-primary)]" style={{ fontFamily: 'var(--font-heading)' }}>
                Manage Your Booking
              </h1>
              <p className="text-xs text-[var(--text-secondary)]">
                {tenant.name}
              </p>
            </div>
          </div>

          {/* Deposit banners */}
          {depositBanner === 'success' && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
              <svg className="w-5 h-5 text-green-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              <p className="text-sm font-medium text-green-800">
                Deposit received! Your booking is confirmed.
              </p>
            </div>
          )}
          {depositBanner === 'cancelled' && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3">
              <svg className="w-5 h-5 text-amber-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
              <p className="text-sm font-medium text-amber-800">
                Deposit not completed. You can pay below.
              </p>
            </div>
          )}

          {/* Booking details card */}
          <div className="bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-xl p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-base font-semibold text-[var(--text-primary)]">
                {bookingType.name}
              </h2>
              <span className={`
                inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium flex-shrink-0
                ${booking.status === 'confirmed'
                  ? 'bg-green-50 text-green-700 border border-green-200'
                  : 'bg-amber-50 text-amber-700 border border-amber-200'
                }
              `}>
                {booking.status === 'confirmed' ? 'Confirmed' : 'Pending Approval'}
              </span>
            </div>

            <div className="space-y-2.5">
              <div className="flex items-center gap-2.5 text-sm text-[var(--text-secondary)]">
                <svg className="w-4 h-4 flex-shrink-0 text-[var(--text-tertiary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                </svg>
                {formatDateLong(bookingDate)}
              </div>
              <div className="flex items-center gap-2.5 text-sm text-[var(--text-secondary)]">
                <svg className="w-4 h-4 flex-shrink-0 text-[var(--text-tertiary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {formatTime(booking.startTime)} — {formatTime(booking.endTime)}
                <span className="text-[var(--text-tertiary)]">({bookingType.durationMinutes} min)</span>
              </div>
              <div className="flex items-center gap-2.5 text-sm text-[var(--text-secondary)]">
                <svg className="w-4 h-4 flex-shrink-0 text-[var(--text-tertiary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                </svg>
                {booking.customerName}
              </div>
              {tenant.location && (
                <div className="flex items-center gap-2.5 text-sm text-[var(--text-secondary)]">
                  <svg className="w-4 h-4 flex-shrink-0 text-[var(--text-tertiary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                  </svg>
                  {tenant.location}
                </div>
              )}
            </div>

            {bookingType.price != null && (
              <div className="pt-3 border-t border-[var(--border-subtle)]">
                <p className="text-sm text-[var(--text-secondary)]">
                  Price: <span className="font-medium text-[var(--text-primary)]">${Number(bookingType.price).toFixed(0)}</span>
                </p>
              </div>
            )}
          </div>

          {/* Pay Deposit button for confirmed bookings with pending deposit */}
          {booking.status === 'confirmed' &&
            booking.depositStatus === 'pending' &&
            booking.depositAmount &&
            depositBanner !== 'success' && (
            <button
              onClick={handlePayDeposit}
              disabled={creatingDepositLink}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 min-h-[48px] rounded-xl bg-[var(--accent-primary)] text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60"
            >
              {creatingDepositLink ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
                </svg>
              )}
              Pay ${Number(booking.depositAmount).toFixed(2)} Deposit
            </button>
          )}

          {/* Action buttons */}
          <div className="flex gap-3">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={enterReschedule}
            >
              <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5m-9-3.75h.008v.008H12v-.008z" />
              </svg>
              Reschedule
            </Button>
            <Button
              variant="secondary"
              className="flex-1 !text-red-600 !border-red-200 hover:!bg-red-50"
              onClick={() => setShowCancelConfirm(true)}
            >
              <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
              Cancel Booking
            </Button>
          </div>

          {/* Cancel confirmation */}
          {showCancelConfirm && (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 bg-red-50 border border-red-200 rounded-xl p-4 space-y-3">
              <p className="text-sm text-red-800 font-medium">
                Are you sure you want to cancel your {bookingType.name} appointment on{' '}
                {formatDateLong(bookingDate)}?
              </p>
              <p className="text-xs text-red-600">
                This cannot be undone.
              </p>

              {cancelError && (
                <p className="text-sm text-red-700 font-medium">{cancelError}</p>
              )}

              <div className="flex gap-3">
                <Button
                  variant="secondary"
                  className="flex-1 !text-red-700 !bg-red-100 !border-red-300 hover:!bg-red-200"
                  loading={cancelling}
                  onClick={handleCancel}
                >
                  Yes, Cancel
                </Button>
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={() => {
                    setShowCancelConfirm(false);
                    setCancelError('');
                  }}
                >
                  Never mind
                </Button>
              </div>
            </div>
          )}

          <footer className="text-center pt-4 pb-8 border-t border-[var(--border-subtle)]">
            <a
              href="https://sunstonepj.app"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
            >
              Powered by Sunstone Studio
            </a>
          </footer>
        </div>
      </div>
    );
  }

  // Fallback
  return null;
}
