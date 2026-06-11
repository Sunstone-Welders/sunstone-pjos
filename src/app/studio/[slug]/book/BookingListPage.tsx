// ============================================================================
// BookingListPage — Public booking type list (client component)
// ============================================================================

'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { applyTheme } from '@/lib/theme';
import { getThemeById, DEFAULT_THEME_ID } from '@/lib/themes';

// ── Types ───────────────────────────────────────────────────────────────────

interface TenantInfo {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  bio: string | null;
  city: string | null;
  state: string | null;
  theme_id: string;
}

interface BookingTypeItem {
  id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  price: number | null;
  deposit_amount: number | null;
  deposit_required: boolean;
  booking_mode: string;
  color: string | null;
}

// ── Component ───────────────────────────────────────────────────────────────

export default function BookingListPage({ slug }: { slug: string }) {
  const [tenant, setTenant] = useState<TenantInfo | null>(null);
  const [bookingTypes, setBookingTypes] = useState<BookingTypeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [logoError, setLogoError] = useState(false);

  // Load tenant + booking types
  useEffect(() => {
    async function load() {
      try {
        // Fetch tenant info
        const profileRes = await fetch(`/api/public/profile?slug=${encodeURIComponent(slug)}`);
        if (!profileRes.ok) {
          setError(profileRes.status === 404 ? 'not_found' : 'error');
          return;
        }
        const profileData = await profileRes.json();
        setTenant(profileData.tenant);

        // Fetch booking types
        const typesRes = await fetch(`/api/public/bookings/types?tenantId=${profileData.tenant.id}`);
        if (typesRes.ok) {
          const typesData = await typesRes.json();
          setBookingTypes(typesData.bookingTypes || []);
        }
      } catch {
        setError('error');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [slug]);

  // Apply tenant theme
  useEffect(() => {
    const themeId = tenant?.theme_id || DEFAULT_THEME_ID;
    const theme = getThemeById(themeId);
    applyTheme(theme);
  }, [tenant?.theme_id]);

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

  const location = [tenant.city, tenant.state].filter(Boolean).join(', ');

  return (
    <div className="min-h-screen bg-[var(--surface-base)]">
      <div className="max-w-[640px] mx-auto px-4 py-8 space-y-8">

        {/* ── Header ─────────────────────────────────────────────── */}
        <section className="text-center space-y-4">
          <Link
            href={`/studio/${slug}`}
            className="inline-flex items-center gap-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
            Back to profile
          </Link>

          {tenant.logo_url && !logoError ? (
            <div className="w-20 h-20 mx-auto rounded-full overflow-hidden border-2 border-[var(--border-default)] bg-[var(--surface-raised)]">
              <Image
                src={tenant.logo_url}
                alt={tenant.name}
                width={80}
                height={80}
                className="w-full h-full object-cover"
                onError={() => setLogoError(true)}
              />
            </div>
          ) : (
            <div className="w-20 h-20 mx-auto rounded-full bg-[var(--accent-100)] flex items-center justify-center">
              <span className="text-2xl font-bold text-[var(--accent-primary)]" style={{ fontFamily: 'var(--font-heading)' }}>
                {tenant.name.charAt(0)}
              </span>
            </div>
          )}

          <div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)]" style={{ fontFamily: 'var(--font-heading)' }}>
              Book an Appointment
            </h1>
            <p className="text-sm text-[var(--text-secondary)] mt-1">
              {tenant.name}{location ? ` — ${location}` : ''}
            </p>
          </div>
        </section>

        {/* ── Booking Types ──────────────────────────────────────── */}
        {bookingTypes.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--surface-raised)] flex items-center justify-center">
              <svg className="w-8 h-8 text-[var(--text-tertiary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-1" style={{ fontFamily: 'var(--font-heading)' }}>
              No Services Available
            </h2>
            <p className="text-sm text-[var(--text-secondary)]">
              {tenant.name} hasn&apos;t set up online booking yet. Check back soon!
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {bookingTypes.map((bt) => (
              <Link
                key={bt.id}
                href={`/studio/${slug}/book/${bt.id}`}
                className="block bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-xl p-4 hover:border-[var(--accent-primary)] hover:shadow-sm transition-all"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {bt.color && (
                        <div
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: bt.color }}
                        />
                      )}
                      <h3 className="text-base font-semibold text-[var(--text-primary)]">
                        {bt.name}
                      </h3>
                    </div>
                    {bt.description && (
                      <p className="text-sm text-[var(--text-secondary)] mt-1 line-clamp-2">
                        {bt.description}
                      </p>
                    )}
                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-xs text-[var(--text-tertiary)] flex items-center gap-1">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {bt.duration_minutes} min
                      </span>
                      {bt.deposit_required && bt.deposit_amount && (
                        <span className="text-xs text-[var(--accent-primary)] font-medium">
                          Deposit required
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    {bt.price != null && (
                      <span className="text-base font-semibold text-[var(--text-primary)]">
                        ${Number(bt.price).toFixed(0)}
                      </span>
                    )}
                    <svg className="w-5 h-5 text-[var(--text-tertiary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                    </svg>
                  </div>
                </div>
              </Link>
            ))}
          </div>
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
