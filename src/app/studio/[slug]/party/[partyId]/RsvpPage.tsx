// ============================================================================
// RsvpPage — Public party RSVP form (client component)
// ============================================================================

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { applyTheme } from '@/lib/theme';
import { getThemeById, DEFAULT_THEME_ID } from '@/lib/themes';
import { Button, Input } from '@/components/ui';

interface PartyInfo {
  id: string;
  host_name: string;
  preferred_date: string | null;
  preferred_time: string | null;
  location: string | null;
  estimated_guests: number | null;
  occasion: string | null;
  status: string;
}

interface TenantInfo {
  name: string;
  slug: string;
  logo_url: string | null;
  theme_id: string;
  waiver_required: boolean;
}

export default function RsvpPage({ slug, partyId }: { slug: string; partyId: string }) {
  const [party, setParty] = useState<PartyInfo | null>(null);
  const [tenant, setTenant] = useState<TenantInfo | null>(null);
  const [attendingCount, setAttendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [logoError, setLogoError] = useState(false);

  // RSVP form
  const [name, setName] = useState('');
  const [attending, setAttending] = useState(true);
  const [plusOnes, setPlusOnes] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/public/party?id=${partyId}`);
        if (!res.ok) {
          if (res.status === 403) {
            setError('booking_unavailable');
          } else {
            setError('not_found');
          }
          return;
        }
        const data = await res.json();
        setParty(data.party);
        setTenant(data.tenant);
        setAttendingCount(data.attending_count || 0);
      } catch {
        setError('error');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [partyId]);

  useEffect(() => {
    const themeId = tenant?.theme_id || DEFAULT_THEME_ID;
    const theme = getThemeById(themeId);
    applyTheme(theme);
  }, [tenant?.theme_id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!name.trim()) {
      setFormError('Please enter your name.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/party-rsvps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          partyRequestId: partyId,
          name: name.trim(),
          attending,
          plusOnes: attending ? plusOnes : 0,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to RSVP');
      }
      setSubmitted(true);
      if (attending) setAttendingCount((c) => c + 1 + plusOnes);
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--surface-base)]">
        <div className="w-8 h-8 border-2 border-[var(--accent-primary)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error === 'booking_unavailable') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--surface-base)] px-4">
        <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center mb-4">
          <svg className="w-6 h-6 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
        </div>
        <h1 className="text-2xl font-semibold text-[var(--text-primary)] mb-2" style={{ fontFamily: 'var(--font-heading)' }}>
          Booking Unavailable
        </h1>
        <p className="text-[var(--text-secondary)] text-center max-w-sm">
          Party booking is currently unavailable for this artist. Please contact them directly for more information.
        </p>
      </div>
    );
  }

  if (error || !party || !tenant) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--surface-base)] px-4">
        <h1 className="text-2xl font-semibold text-[var(--text-primary)] mb-2" style={{ fontFamily: 'var(--font-heading)' }}>
          Party Not Found
        </h1>
        <p className="text-[var(--text-secondary)]">This party doesn&apos;t exist or the link is invalid.</p>
      </div>
    );
  }

  const dateStr = party.preferred_date
    ? new Date(party.preferred_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    : null;

  const partyTitle = party.occasion
    ? `${party.host_name}'s ${party.occasion}`
    : `${party.host_name}'s Permanent Jewelry Party`;

  return (
    <div className="min-h-screen bg-[var(--surface-base)]">
      <div className="max-w-[480px] mx-auto px-4 py-8 space-y-6">

        {/* Header */}
        <div className="text-center space-y-3">
          {tenant.logo_url && !logoError ? (
            <div className="w-16 h-16 mx-auto rounded-full overflow-hidden border-2 border-[var(--border-default)] bg-[var(--surface-raised)]">
              <Image
                src={tenant.logo_url}
                alt={tenant.name}
                width={64}
                height={64}
                className="w-full h-full object-cover"
                onError={() => setLogoError(true)}
              />
            </div>
          ) : null}
          <div>
            <p className="text-xs text-[var(--text-tertiary)] uppercase tracking-wider">You&apos;re Invited</p>
            <h1 className="text-xl font-bold text-[var(--text-primary)] mt-1" style={{ fontFamily: 'var(--font-heading)' }}>
              {partyTitle}
            </h1>
            <p className="text-sm text-[var(--text-secondary)] mt-1">with {tenant.name}</p>
          </div>
        </div>

        {/* Party Details */}
        <div className="bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-xl p-4 space-y-2">
          {dateStr && (
            <div className="flex items-center gap-2 text-sm">
              <svg className="w-4 h-4 text-[var(--text-tertiary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
              </svg>
              <span className="text-[var(--text-primary)]">{dateStr}</span>
              {party.preferred_time && <span className="text-[var(--text-secondary)]">· {party.preferred_time}</span>}
            </div>
          )}
          {party.location && (
            <div className="flex items-center gap-2 text-sm">
              <svg className="w-4 h-4 text-[var(--text-tertiary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
              </svg>
              <span className="text-[var(--text-primary)]">{party.location}</span>
            </div>
          )}
          <div className="flex items-center gap-2 text-sm">
            <svg className="w-4 h-4 text-[var(--text-tertiary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
            </svg>
            <span className="text-[var(--text-primary)]">{attendingCount} attending</span>
          </div>
        </div>

        {/* RSVP Form */}
        {submitted ? (
          <div className="bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-xl p-6 text-center space-y-2">
            <div className="w-12 h-12 mx-auto rounded-full bg-green-50 flex items-center justify-center">
              <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
            <h3 className="text-base font-semibold text-[var(--text-primary)]">
              {attending ? 'See You There!' : 'Thanks for letting us know!'}
            </h3>
            {attending && tenant.waiver_required && (
              <p className="text-sm text-[var(--text-secondary)]">
                Don&apos;t forget to{' '}
                <Link href={`/waiver?tenant=${slug}`} className="text-[var(--accent-primary)] hover:underline">
                  sign your waiver
                </Link>{' '}
                before the event.
              </p>
            )}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-xl p-4 space-y-4">
            <h2 className="text-base font-semibold text-[var(--text-primary)]">RSVP</h2>

            <Input
              label="Your Name"
              required
              placeholder="Jane Smith"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />

            {/* Attending toggle */}
            <div>
              <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">Will you attend?</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setAttending(true)}
                  className={`flex-1 py-2.5 text-sm font-medium rounded-lg border transition-colors ${
                    attending
                      ? 'bg-[var(--accent-primary)] text-[var(--text-on-accent)] border-[var(--accent-primary)]'
                      : 'bg-[var(--surface-base)] text-[var(--text-secondary)] border-[var(--border-default)] hover:bg-[var(--surface-subtle)]'
                  }`}
                >
                  Yes, I&apos;ll be there!
                </button>
                <button
                  type="button"
                  onClick={() => setAttending(false)}
                  className={`flex-1 py-2.5 text-sm font-medium rounded-lg border transition-colors ${
                    !attending
                      ? 'bg-[var(--surface-subtle)] text-[var(--text-primary)] border-[var(--border-strong)]'
                      : 'bg-[var(--surface-base)] text-[var(--text-secondary)] border-[var(--border-default)] hover:bg-[var(--surface-subtle)]'
                  }`}
                >
                  Can&apos;t make it
                </button>
              </div>
            </div>

            {attending && (
              <Input
                label="Bringing anyone? (plus ones)"
                type="number"
                min="0"
                max="10"
                value={plusOnes.toString()}
                onChange={(e) => setPlusOnes(parseInt(e.target.value) || 0)}
              />
            )}

            {formError && <p className="text-sm text-red-600">{formError}</p>}

            <Button type="submit" variant="primary" className="w-full" loading={submitting}>
              Submit RSVP
            </Button>
          </form>
        )}

        {/* Waiver link */}
        {tenant.waiver_required && !submitted && (
          <div className="text-center">
            <Link
              href={`/waiver?tenant=${slug}`}
              className="text-sm text-[var(--accent-primary)] hover:underline"
            >
              Sign your waiver ahead of time →
            </Link>
          </div>
        )}

        {/* Footer */}
        <footer className="text-center pt-4 pb-8 border-t border-[var(--border-subtle)]">
          <Link href={`/studio/${slug}`} className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors">
            View {tenant.name}&apos;s Profile
          </Link>
        </footer>
      </div>
    </div>
  );
}
