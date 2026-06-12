// ============================================================================
// BookingPage — Public slot selection + booking form (client component)
// ============================================================================
// Three-step flow: Date Selection → Time Slot → Booking Form → Confirmation
// ============================================================================

'use client';

import { useEffect, useState, useCallback } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { applyTheme } from '@/lib/theme';
import { getThemeById, DEFAULT_THEME_ID } from '@/lib/themes';
import { Button, Input, Textarea } from '@/components/ui';

// ── Types ───────────────────────────────────────────────────────────────────

interface TenantInfo {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  theme_id: string;
}

interface BookingTypeInfo {
  id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  price: number | null;
  deposit_amount: number | null;
  deposit_required: boolean;
  booking_mode: string;
}

interface Slot {
  start_time: string;
  end_time: string;
}

interface CreatedBooking {
  id: string;
  start_time: string;
  end_time: string;
  status: string;
  customer_name: string;
  booking_type_id: string;
  cancellation_token: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Generate next N dates starting from today */
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

/** Get the max bookable date (90 days from today) */
function getMaxDate(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 90);
  return d;
}

/** Get today at midnight */
function getToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Generate calendar grid for a given month/year */
function getMonthGrid(year: number, month: number): (Date | null)[][] {
  const firstDay = new Date(year, month, 1);
  const startDow = firstDay.getDay(); // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const weeks: (Date | null)[][] = [];
  let week: (Date | null)[] = new Array(startDow).fill(null);

  for (let day = 1; day <= daysInMonth; day++) {
    week.push(new Date(year, month, day));
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }
  if (week.length > 0) {
    while (week.length < 7) week.push(null);
    weeks.push(week);
  }
  return weeks;
}

/** Format month header: "June 2026" */
function formatMonthYear(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

/** Format date as YYYY-MM-DD */
function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0];
}

/** Format ISO time to "10:00 AM" */
function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'UTC',
  });
}

/** Format date for display: "Wed, Jun 11" */
function formatDateLong(d: Date): string {
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/** Short day: "W" for Wednesday */
function formatDayLetter(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'narrow' });
}

/** Day number: "11" */
function formatDayNum(d: Date): string {
  return d.getDate().toString();
}

/** Build a Google Calendar event URL */
function buildGoogleCalendarUrl(params: {
  title: string;
  startTime: string;
  endTime: string;
  description: string;
  location: string;
}): string {
  const fmt = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const qs = new URLSearchParams({
    action: 'TEMPLATE',
    text: params.title,
    dates: `${fmt(params.startTime)}/${fmt(params.endTime)}`,
    details: params.description,
    location: params.location,
  });
  return `https://calendar.google.com/calendar/render?${qs.toString()}`;
}

// ── Component ───────────────────────────────────────────────────────────────

export default function BookingPage({
  slug,
  bookingTypeId,
}: {
  slug: string;
  bookingTypeId: string;
}) {
  // State
  const [tenant, setTenant] = useState<TenantInfo | null>(null);
  const [bookingType, setBookingType] = useState<BookingTypeInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [logoError, setLogoError] = useState(false);

  // Date + slots
  const [dates] = useState(() => getDateRange(30));
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [slots, setSlots] = useState<Slot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);

  // Calendar picker mode
  const [pickerMode, setPickerMode] = useState<'strip' | 'calendar'>('strip');
  const [calMonth, setCalMonth] = useState(() => new Date().getMonth());
  const [calYear, setCalYear] = useState(() => new Date().getFullYear());

  // Form
  const [form, setForm] = useState({
    customerName: '',
    customerPhone: '',
    customerEmail: '',
    notes: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  // Confirmation
  const [confirmedBooking, setConfirmedBooking] = useState<CreatedBooking | null>(null);
  const [confirmedStatus, setConfirmedStatus] = useState<'confirmed' | 'pending' | null>(null);

  // ── Load tenant + initial data ────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      try {
        const profileRes = await fetch(`/api/public/profile?slug=${encodeURIComponent(slug)}`);
        if (!profileRes.ok) {
          setError(profileRes.status === 404 ? 'not_found' : 'error');
          return;
        }
        const profileData = await profileRes.json();
        setTenant(profileData.tenant);

        // Set default selected date to today
        setSelectedDate(toDateStr(new Date()));
      } catch {
        setError('error');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [slug]);

  // ── Apply theme ───────────────────────────────────────────────────────────
  useEffect(() => {
    const themeId = tenant?.theme_id || DEFAULT_THEME_ID;
    const theme = getThemeById(themeId);
    applyTheme(theme);
  }, [tenant?.theme_id]);

  // ── Fetch slots when date changes ─────────────────────────────────────────
  const fetchSlots = useCallback(async (date: string) => {
    if (!tenant) return;
    setSlotsLoading(true);
    setSlots([]);
    setSelectedSlot(null);

    try {
      const params = new URLSearchParams({
        tenantId: tenant.id,
        bookingTypeId,
        date,
      });
      const res = await fetch(`/api/public/bookings/available-slots?${params}`);
      if (!res.ok) {
        setSlots([]);
        return;
      }
      const data = await res.json();
      setSlots(data.slots || []);

      // Set booking type info from the slot response (first load)
      if (data.bookingType && !bookingType) {
        setBookingType(data.bookingType);
      }
    } catch {
      setSlots([]);
    } finally {
      setSlotsLoading(false);
    }
  }, [tenant, bookingTypeId, bookingType]);

  useEffect(() => {
    if (selectedDate && tenant) {
      fetchSlots(selectedDate);
    }
  }, [selectedDate, tenant, fetchSlots]);

  // ── Handle date selection ─────────────────────────────────────────────────
  const handleDateSelect = (dateStr: string) => {
    setSelectedDate(dateStr);
    setSelectedSlot(null);
    setFormError('');
  };

  // ── Handle slot selection ─────────────────────────────────────────────────
  const handleSlotSelect = (slot: Slot) => {
    setSelectedSlot(slot);
    setFormError('');
  };

  // ── Handle form submit ────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenant || !selectedSlot || !bookingType) return;
    setFormError('');

    if (!form.customerName.trim() || !form.customerPhone.trim()) {
      setFormError('Name and phone number are required.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/public/bookings/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: tenant.id,
          bookingTypeId,
          startTime: selectedSlot.start_time,
          customerName: form.customerName.trim(),
          customerPhone: form.customerPhone.trim(),
          customerEmail: form.customerEmail.trim() || null,
          notes: form.notes.trim() || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to create booking');
      }

      const data = await res.json();
      setConfirmedBooking(data.booking);
      setConfirmedStatus(data.status);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
      setFormError(message);
    } finally {
      setSubmitting(false);
    }
  };

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--surface-base)]">
        <div className="w-8 h-8 border-2 border-[var(--accent-primary)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // ── Error / Not Found ─────────────────────────────────────────────────────
  if (error || !tenant) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--surface-base)] px-4">
        <h1 className="text-2xl font-semibold text-[var(--text-primary)] mb-2" style={{ fontFamily: 'var(--font-heading)' }}>
          Studio Not Found
        </h1>
        <p className="text-[var(--text-secondary)]">This profile doesn&apos;t exist or isn&apos;t public yet.</p>
      </div>
    );
  }

  // ── Confirmation Screen ───────────────────────────────────────────────────
  if (confirmedBooking && confirmedStatus) {
    const bookingDate = new Date(confirmedBooking.start_time);
    const dateDisplay = bookingDate.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    });

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
              {confirmedStatus === 'confirmed' ? 'Booking Confirmed!' : 'Request Submitted!'}
            </h1>

            <p className="text-sm text-[var(--text-secondary)] max-w-sm mx-auto">
              {confirmedStatus === 'confirmed'
                ? "Your booking is confirmed! You'll receive a text shortly."
                : `Your booking request has been submitted! ${tenant.name} will confirm shortly.`}
            </p>
          </div>

          <div className="bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-xl p-5 space-y-3">
            <h2 className="text-base font-semibold text-[var(--text-primary)]">
              {bookingType?.name || 'Appointment'}
            </h2>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                </svg>
                {dateDisplay}
              </div>
              <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {formatTime(confirmedBooking.start_time)} — {formatTime(confirmedBooking.end_time)}
              </div>
              <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                </svg>
                {confirmedBooking.customer_name}
              </div>
            </div>

            {bookingType?.deposit_required && bookingType.deposit_amount && (
              <div className="pt-2 border-t border-[var(--border-subtle)]">
                <p className="text-xs text-[var(--accent-primary)] font-medium">
                  A deposit of ${Number(bookingType.deposit_amount).toFixed(2)} is required to confirm your booking.
                </p>
              </div>
            )}
          </div>

          {/* ── Add to Calendar ─────────────────────────────────── */}
          {confirmedStatus === 'confirmed' && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-[var(--text-secondary)] text-center">Add to Calendar</p>
              <div className="flex gap-2">
                <a
                  href={buildGoogleCalendarUrl({
                    title: `${bookingType?.name || 'Appointment'} — ${tenant.name}`,
                    startTime: confirmedBooking.start_time,
                    endTime: confirmedBooking.end_time,
                    description: `${bookingType?.duration_minutes || 30} min appointment with ${tenant.name}`,
                    location: '',
                  })}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 min-h-[48px] rounded-xl border border-[var(--border-default)] bg-[var(--surface-raised)] text-sm font-medium text-[var(--text-primary)] hover:border-[var(--accent-primary)] transition-colors"
                >
                  <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19.5 3h-3V1.5h-1.5V3h-6V1.5H7.5V3h-3C3.675 3 3 3.675 3 4.5v15c0 .825.675 1.5 1.5 1.5h15c.825 0 1.5-.675 1.5-1.5v-15c0-.825-.675-1.5-1.5-1.5zm0 16.5h-15V8.25h15V19.5z"/>
                  </svg>
                  Google Calendar
                </a>
                <a
                  href={`${typeof window !== 'undefined' ? window.location.origin : ''}/api/public/bookings/${confirmedBooking.id}/calendar?token=${confirmedBooking.cancellation_token}`}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 min-h-[48px] rounded-xl border border-[var(--border-default)] bg-[var(--surface-raised)] text-sm font-medium text-[var(--text-primary)] hover:border-[var(--accent-primary)] transition-colors"
                >
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                  </svg>
                  Apple / Outlook
                </a>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-3">
            <Link
              href={`/studio/${slug}/book`}
              className="text-center text-sm font-medium text-[var(--accent-primary)] hover:underline"
            >
              Book another appointment
            </Link>
            <Link
              href={`/studio/${slug}`}
              className="text-center text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
            >
              Back to {tenant.name}
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

  // ── Main Booking Flow ─────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[var(--surface-base)]">
      <div className="max-w-[640px] mx-auto px-4 py-8 space-y-6">

        {/* ── Header ───────────────────────────────────────────── */}
        <div className="flex items-center gap-3">
          <Link
            href={`/studio/${slug}/book`}
            className="flex items-center justify-center w-10 h-10 rounded-full bg-[var(--surface-raised)] border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </Link>
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {tenant.logo_url && !logoError ? (
              <div className="w-10 h-10 rounded-full overflow-hidden border border-[var(--border-default)] bg-[var(--surface-raised)] flex-shrink-0">
                <Image
                  src={tenant.logo_url}
                  alt={tenant.name}
                  width={40}
                  height={40}
                  className="w-full h-full object-cover"
                  onError={() => setLogoError(true)}
                />
              </div>
            ) : (
              <div className="w-10 h-10 rounded-full bg-[var(--accent-100)] flex items-center justify-center flex-shrink-0">
                <span className="text-sm font-bold text-[var(--accent-primary)]" style={{ fontFamily: 'var(--font-heading)' }}>
                  {tenant.name.charAt(0)}
                </span>
              </div>
            )}
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-[var(--text-primary)] truncate" style={{ fontFamily: 'var(--font-heading)' }}>
                {bookingType?.name || 'Book Appointment'}
              </h1>
              <p className="text-xs text-[var(--text-secondary)]">
                {tenant.name}
                {bookingType ? ` — ${bookingType.duration_minutes} min` : ''}
                {bookingType?.price != null ? ` — $${Number(bookingType.price).toFixed(0)}` : ''}
              </p>
            </div>
          </div>
        </div>

        {/* ── Step 1: Date Selection ─────────────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">
              Select a Date
            </h2>
            <button
              onClick={() => setPickerMode(pickerMode === 'strip' ? 'calendar' : 'strip')}
              className="flex items-center justify-center w-8 h-8 rounded-lg border border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent-primary)] transition-colors"
              title={pickerMode === 'strip' ? 'Switch to calendar view' : 'Switch to strip view'}
            >
              {pickerMode === 'strip' ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5m-9-6h.008v.008H12v-.008zM12 15h.008v.008H12V15zm0 2.25h.008v.008H12v-.008zM9.75 15h.008v.008H9.75V15zm0 2.25h.008v.008H9.75v-.008zM7.5 15h.008v.008H7.5V15zm0 2.25h.008v.008H7.5v-.008zm6.75-4.5h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V15zm0 2.25h.008v.008h-.008v-.008zm2.25-4.5h.008v.008H16.5v-.008zm0 2.25h.008v.008H16.5V15z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                </svg>
              )}
            </button>
          </div>

          {/* Strip Mode */}
          {pickerMode === 'strip' && (
            <>
              <div className="flex gap-1.5 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
                {dates.map((d) => {
                  const ds = toDateStr(d);
                  const isSelected = ds === selectedDate;
                  const isToday = ds === toDateStr(new Date());
                  return (
                    <button
                      key={ds}
                      onClick={() => handleDateSelect(ds)}
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
                  {formatDateLong(new Date(selectedDate + 'T00:00:00'))}
                </p>
              )}
            </>
          )}

          {/* Calendar Month Grid Mode */}
          {pickerMode === 'calendar' && (() => {
            const today = getToday();
            const maxDate = getMaxDate();
            const weeks = getMonthGrid(calYear, calMonth);
            const todayStr = toDateStr(today);
            const canPrev = calYear > today.getFullYear() || (calYear === today.getFullYear() && calMonth > today.getMonth());
            const canNext = new Date(calYear, calMonth + 1, 1) <= maxDate;

            return (
              <div className="bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-xl p-3">
                {/* Month header with navigation */}
                <div className="flex items-center justify-between mb-3">
                  <button
                    onClick={() => {
                      if (canPrev) {
                        if (calMonth === 0) { setCalMonth(11); setCalYear(calYear - 1); }
                        else setCalMonth(calMonth - 1);
                      }
                    }}
                    disabled={!canPrev}
                    className="flex items-center justify-center w-8 h-8 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-subtle)] transition-colors disabled:opacity-30 disabled:pointer-events-none"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                    </svg>
                  </button>
                  <span className="text-sm font-semibold text-[var(--text-primary)]">
                    {formatMonthYear(calYear, calMonth)}
                  </span>
                  <button
                    onClick={() => {
                      if (canNext) {
                        if (calMonth === 11) { setCalMonth(0); setCalYear(calYear + 1); }
                        else setCalMonth(calMonth + 1);
                      }
                    }}
                    disabled={!canNext}
                    className="flex items-center justify-center w-8 h-8 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-subtle)] transition-colors disabled:opacity-30 disabled:pointer-events-none"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                    </svg>
                  </button>
                </div>

                {/* Day-of-week headers */}
                <div className="grid grid-cols-7 mb-1">
                  {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                    <div key={i} className="text-center text-[10px] font-medium text-[var(--text-tertiary)] uppercase py-1">
                      {d}
                    </div>
                  ))}
                </div>

                {/* Day cells */}
                {weeks.map((week, wi) => (
                  <div key={wi} className="grid grid-cols-7">
                    {week.map((day, di) => {
                      if (!day) return <div key={di} className="h-10" />;
                      const ds = toDateStr(day);
                      const isPast = day < today;
                      const isBeyondMax = day > maxDate;
                      const isDisabled = isPast || isBeyondMax;
                      const isSelected = ds === selectedDate;
                      const isToday = ds === todayStr;

                      return (
                        <button
                          key={di}
                          onClick={() => !isDisabled && handleDateSelect(ds)}
                          disabled={isDisabled}
                          className={`
                            relative flex flex-col items-center justify-center h-10 rounded-lg text-sm transition-colors
                            ${isDisabled
                              ? 'text-[var(--text-tertiary)] opacity-40 cursor-not-allowed'
                              : isSelected
                                ? 'bg-[var(--accent-primary)] text-white font-semibold'
                                : 'text-[var(--text-primary)] hover:bg-[var(--surface-subtle)] cursor-pointer'
                            }
                          `}
                        >
                          {day.getDate()}
                          {isToday && (
                            <div className={`absolute bottom-1 w-1 h-1 rounded-full ${isSelected ? 'bg-white' : 'bg-[var(--accent-primary)]'}`} />
                          )}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            );
          })()}

          {/* Selected date display for calendar mode */}
          {pickerMode === 'calendar' && selectedDate && (
            <p className="text-xs text-[var(--text-secondary)] mt-2">
              {formatDateLong(new Date(selectedDate + 'T00:00:00'))}
            </p>
          )}
        </section>

        {/* ── Step 2: Time Slots ──────────────────────────────────── */}
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
                    onClick={() => handleSlotSelect(slot)}
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

        {/* ── Step 3: Booking Form ───────────────────────────────── */}
        {selectedSlot && (
          <section className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-3">
              Your Information
            </h2>

            <div className="bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-xl p-4 mb-4">
              <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                <svg className="w-4 h-4 text-[var(--accent-primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="font-medium text-[var(--text-primary)]">
                  {formatDateLong(new Date(selectedDate + 'T00:00:00'))} at {formatTime(selectedSlot.start_time)}
                </span>
                <span className="text-[var(--text-tertiary)]">
                  ({bookingType?.duration_minutes} min)
                </span>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              <Input
                label="Your Name"
                required
                placeholder="Jane Smith"
                value={form.customerName}
                onChange={(e) => setForm({ ...form, customerName: e.target.value })}
              />
              <Input
                label="Phone Number"
                required
                type="tel"
                placeholder="(555) 123-4567"
                value={form.customerPhone}
                onChange={(e) => setForm({ ...form, customerPhone: e.target.value })}
              />
              <Input
                label="Email (optional)"
                type="email"
                placeholder="jane@example.com"
                value={form.customerEmail}
                onChange={(e) => setForm({ ...form, customerEmail: e.target.value })}
              />
              <Textarea
                label="Notes (optional)"
                placeholder="Anything you'd like us to know..."
                rows={3}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />

              {bookingType?.deposit_required && bookingType.deposit_amount && (
                <div className="bg-[var(--accent-100)] border border-[var(--accent-primary)]/20 rounded-xl p-3">
                  <p className="text-sm text-[var(--accent-primary)] font-medium">
                    A deposit of ${Number(bookingType.deposit_amount).toFixed(2)} is required to confirm your booking.
                  </p>
                </div>
              )}

              {formError && (
                <p className="text-sm text-red-600">{formError}</p>
              )}

              <Button type="submit" variant="primary" className="w-full" loading={submitting}>
                {bookingType?.booking_mode === 'auto' ? 'Confirm Booking' : 'Request Booking'}
              </Button>
            </form>
          </section>
        )}

        {/* ── Footer ─────────────────────────────────────────────── */}
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
