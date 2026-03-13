// ============================================================================
// ProfilePage — Public artist profile (client component)
// ============================================================================

'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { applyTheme } from '@/lib/theme';
import { getThemeById, DEFAULT_THEME_ID } from '@/lib/themes';
import { Button, Input, Textarea } from '@/components/ui';
import type { ProfileSettings } from '@/types';

interface TenantProfile {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  bio: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  website: string | null;
  instagram_url: string | null;
  facebook_url: string | null;
  tiktok_url: string | null;
  theme_id: string;
  profile_settings: ProfileSettings;
  dedicated_phone_number: string | null;
  waiver_required: boolean;
}

interface ServiceItem {
  name: string;
  min_price: number;
}

interface TierItem {
  name: string;
  bracelet_price: number | null;
  anklet_price: number | null;
  ring_price: number | null;
  necklace_price_per_inch: number | null;
  hand_chain_price: number | null;
}

interface EventItem {
  id: string;
  name: string;
  start_time: string;
  end_time: string | null;
  location: string | null;
}

const OCCASION_OPTIONS = [
  'Birthday',
  'Bachelorette',
  'Girls Night',
  'Bridal Shower',
  'Baby Shower',
  'Corporate Event',
  'Holiday Party',
  'Other',
];

const TIME_OPTIONS = [
  'Morning (9am–12pm)',
  'Afternoon (12pm–4pm)',
  'Evening (4pm–8pm)',
  'Late Night (8pm+)',
  'Flexible',
];

export default function ProfilePage({ slug }: { slug: string }) {
  const [tenant, setTenant] = useState<TenantProfile | null>(null);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [tiers, setTiers] = useState<TierItem[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [logoError, setLogoError] = useState(false);

  // Party booking form
  const [form, setForm] = useState({
    host_name: '',
    host_phone: '',
    host_email: '',
    preferred_date: '',
    preferred_time: '',
    estimated_guests: '',
    occasion: '',
    message: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState('');

  // Load profile data
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/public/profile?slug=${encodeURIComponent(slug)}`);
        if (!res.ok) {
          setError(res.status === 404 ? 'not_found' : 'error');
          return;
        }
        const data = await res.json();
        setTenant(data.tenant);
        setServices(data.services || []);
        setTiers(data.tiers || []);
        setEvents(data.events || []);
      } catch {
        setError('error');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [slug]);

  // Apply theme
  useEffect(() => {
    const themeId = tenant?.theme_id || DEFAULT_THEME_ID;
    const theme = getThemeById(themeId);
    applyTheme(theme);
  }, [tenant?.theme_id]);

  const settings = tenant?.profile_settings;

  // Submit party booking
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenant) return;
    setFormError('');

    if (!form.host_name.trim() || !form.host_phone.trim()) {
      setFormError('Name and phone number are required.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/party-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: tenant.id,
          hostName: form.host_name.trim(),
          hostPhone: form.host_phone.trim(),
          hostEmail: form.host_email.trim() || null,
          preferredDate: form.preferred_date || null,
          preferredTime: form.preferred_time || null,
          estimatedGuests: form.estimated_guests ? parseInt(form.estimated_guests) : null,
          occasion: form.occasion || null,
          message: form.message.trim() || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to submit');
      }
      setSubmitted(true);
    } catch (err: any) {
      setFormError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--surface-base)]">
        <div className="w-8 h-8 border-2 border-[var(--accent-primary)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Error / not found
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
  const contactNumber = tenant.dedicated_phone_number || tenant.phone;

  return (
    <div className="min-h-screen bg-[var(--surface-base)]">
      <div className="max-w-[640px] mx-auto px-4 py-8 space-y-8">

        {/* ── Hero ──────────────────────────────────────────────── */}
        <section className="text-center space-y-4">
          {tenant.logo_url && !logoError ? (
            <div className="w-24 h-24 mx-auto rounded-full overflow-hidden border-2 border-[var(--border-default)] bg-[var(--surface-raised)]">
              <Image
                src={tenant.logo_url}
                alt={tenant.name}
                width={96}
                height={96}
                className="w-full h-full object-cover"
                onError={() => setLogoError(true)}
              />
            </div>
          ) : (
            <div className="w-24 h-24 mx-auto rounded-full bg-[var(--accent-100)] flex items-center justify-center">
              <span className="text-3xl font-bold text-[var(--accent-primary)]" style={{ fontFamily: 'var(--font-heading)' }}>
                {tenant.name.charAt(0)}
              </span>
            </div>
          )}

          <div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)]" style={{ fontFamily: 'var(--font-heading)' }}>
              {tenant.name}
            </h1>
            {location && (
              <p className="text-sm text-[var(--text-secondary)] mt-1 flex items-center justify-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                </svg>
                {location}
              </p>
            )}
          </div>

          {tenant.bio && (
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed max-w-md mx-auto">
              {tenant.bio}
            </p>
          )}
        </section>

        {/* ── Services ──────────────────────────────────────────── */}
        {settings?.show_pricing !== false && services.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-[var(--text-primary)]" style={{ fontFamily: 'var(--font-heading)' }}>
              Services
            </h2>
            <div className="space-y-2">
              {services.map((s) => (
                <div
                  key={s.name}
                  className="flex items-center justify-between px-4 py-3 bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-xl"
                >
                  <span className="text-sm font-medium text-[var(--text-primary)]">{s.name}</span>
                  <span className="text-sm text-[var(--text-secondary)]">starting at ${s.min_price}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Tier Pricing ────────────────────────────────────── */}
        {tiers.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-[var(--text-primary)]" style={{ fontFamily: 'var(--font-heading)' }}>
              Pricing
            </h2>
            <div className="space-y-3">
              {tiers.map((tier) => {
                const prices: { label: string; value: string }[] = [];
                if (tier.bracelet_price) prices.push({ label: 'Bracelet', value: `$${Number(tier.bracelet_price).toFixed(0)}` });
                if (tier.anklet_price) prices.push({ label: 'Anklet', value: `$${Number(tier.anklet_price).toFixed(0)}` });
                if (tier.ring_price) prices.push({ label: 'Ring', value: `$${Number(tier.ring_price).toFixed(0)}` });
                if (tier.necklace_price_per_inch) prices.push({ label: 'Necklace', value: `$${Number(tier.necklace_price_per_inch).toFixed(0)}/in` });
                if (tier.hand_chain_price) prices.push({ label: 'Hand Chain', value: `$${Number(tier.hand_chain_price).toFixed(0)}` });
                return (
                  <div
                    key={tier.name}
                    className="px-4 py-3.5 bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-xl"
                  >
                    <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-2">{tier.name}</h3>
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      {prices.map((p) => (
                        <span key={p.label} className="text-sm text-[var(--text-secondary)]">
                          {p.label} <span className="font-medium text-[var(--text-primary)]">{p.value}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ── Upcoming Events ──────────────────────────────────── */}
        {settings?.show_events !== false && events.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-[var(--text-primary)]" style={{ fontFamily: 'var(--font-heading)' }}>
              Upcoming Events
            </h2>
            <div className="space-y-2">
              {events.map((evt) => {
                const d = new Date(evt.start_time);
                const dateStr = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
                return (
                  <div
                    key={evt.id}
                    className="px-4 py-3 bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-xl space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-[var(--text-primary)]">{evt.name}</span>
                      <Link
                        href={`/waiver?tenant=${slug}&event=${evt.id}`}
                        className="text-xs font-medium text-[var(--accent-primary)] hover:underline"
                      >
                        Sign Waiver
                      </Link>
                    </div>
                    <p className="text-xs text-[var(--text-secondary)]">
                      {dateStr} at {timeStr}
                      {evt.location && ` · ${evt.location}`}
                    </p>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ── Book a Party ─────────────────────────────────────── */}
        {settings?.show_party_booking !== false && (
          <section id="book-party" className="space-y-3">
            <h2 className="text-lg font-semibold text-[var(--text-primary)]" style={{ fontFamily: 'var(--font-heading)' }}>
              Book a Private Party
            </h2>

            {submitted ? (
              <div className="bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-xl p-6 text-center space-y-2">
                <div className="w-12 h-12 mx-auto rounded-full bg-green-50 flex items-center justify-center">
                  <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                </div>
                <h3 className="text-base font-semibold text-[var(--text-primary)]">Request Sent!</h3>
                <p className="text-sm text-[var(--text-secondary)]">
                  {tenant.name} will be in touch soon to confirm your party details.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-xl p-4 space-y-3">
                <Input
                  label="Your Name"
                  required
                  placeholder="Jane Smith"
                  value={form.host_name}
                  onChange={(e) => setForm({ ...form, host_name: e.target.value })}
                />
                <Input
                  label="Phone Number"
                  required
                  type="tel"
                  placeholder="(555) 123-4567"
                  value={form.host_phone}
                  onChange={(e) => setForm({ ...form, host_phone: e.target.value })}
                />
                <Input
                  label="Email (optional)"
                  type="email"
                  placeholder="jane@example.com"
                  value={form.host_email}
                  onChange={(e) => setForm({ ...form, host_email: e.target.value })}
                />

                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label="Preferred Date"
                    type="date"
                    value={form.preferred_date}
                    onChange={(e) => setForm({ ...form, preferred_date: e.target.value })}
                  />
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Preferred Time</label>
                    <select
                      className="w-full px-3 py-2 text-sm border border-[var(--border-default)] rounded-lg bg-[var(--surface-base)] text-[var(--text-primary)]"
                      value={form.preferred_time}
                      onChange={(e) => setForm({ ...form, preferred_time: e.target.value })}
                    >
                      <option value="">Select...</option>
                      {TIME_OPTIONS.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label="Estimated Guests"
                    type="number"
                    min="1"
                    placeholder="8"
                    value={form.estimated_guests}
                    onChange={(e) => setForm({ ...form, estimated_guests: e.target.value })}
                  />
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Occasion</label>
                    <select
                      className="w-full px-3 py-2 text-sm border border-[var(--border-default)] rounded-lg bg-[var(--surface-base)] text-[var(--text-primary)]"
                      value={form.occasion}
                      onChange={(e) => setForm({ ...form, occasion: e.target.value })}
                    >
                      <option value="">Select...</option>
                      {OCCASION_OPTIONS.map((o) => (
                        <option key={o} value={o}>{o}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <Textarea
                  label="Message (optional)"
                  placeholder="Tell us about your event..."
                  rows={3}
                  value={form.message}
                  onChange={(e) => setForm({ ...form, message: e.target.value })}
                />

                {formError && (
                  <p className="text-sm text-red-600">{formError}</p>
                )}

                <Button type="submit" variant="primary" className="w-full" loading={submitting}>
                  Send Party Request
                </Button>
              </form>
            )}
          </section>
        )}

        {/* ── Contact & Social ─────────────────────────────────── */}
        {settings?.show_contact !== false && (
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-[var(--text-primary)]" style={{ fontFamily: 'var(--font-heading)' }}>
              Get in Touch
            </h2>
            <div className="flex flex-wrap gap-3">
              {contactNumber && (
                <a
                  href={`sms:${contactNumber}`}
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium bg-[var(--accent-primary)] text-[var(--text-on-accent)] rounded-xl hover:opacity-90 transition-opacity"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
                  </svg>
                  Text Me
                </a>
              )}
              {tenant.instagram_url && (
                <a
                  href={tenant.instagram_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium bg-[var(--surface-raised)] border border-[var(--border-default)] text-[var(--text-primary)] rounded-xl hover:bg-[var(--surface-subtle)] transition-colors"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
                  </svg>
                  Instagram
                </a>
              )}
              {tenant.facebook_url && (
                <a
                  href={tenant.facebook_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium bg-[var(--surface-raised)] border border-[var(--border-default)] text-[var(--text-primary)] rounded-xl hover:bg-[var(--surface-subtle)] transition-colors"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                  </svg>
                  Facebook
                </a>
              )}
              {tenant.tiktok_url && (
                <a
                  href={tenant.tiktok_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium bg-[var(--surface-raised)] border border-[var(--border-default)] text-[var(--text-primary)] rounded-xl hover:bg-[var(--surface-subtle)] transition-colors"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 00-.79-.05A6.34 6.34 0 003.15 15.2a6.34 6.34 0 0010.86 4.48V13.2a8.26 8.26 0 005.58 2.17V12a4.84 4.84 0 01-3.77-1.54V6.69h3.77z" />
                  </svg>
                  TikTok
                </a>
              )}
            </div>
          </section>
        )}

        {/* ── Footer ───────────────────────────────────────────── */}
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
