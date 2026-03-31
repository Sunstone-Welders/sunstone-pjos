// ============================================================================
// External Ambassador Signup — src/app/ambassador/page.tsx
// ============================================================================
// Public landing page for the ambassador program.
// No auth required — external influencers/educators can apply.
// ============================================================================

'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function AmbassadorSignupPage() {
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    community_description: '',
    social_links: '',
    agreed: false,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!form.agreed) {
      setError('You must agree to the Ambassador Terms of Service.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/ambassador/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          phone: form.phone,
          community_description: form.community_description,
          social_links: form.social_links,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Something went wrong');
        return;
      }

      setSuccess(true);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-[#FDFBF9]">
        <div className="w-full max-w-lg text-center">
          <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="font-display text-3xl font-bold text-[#1a1a1a] mb-3">Application Submitted!</h1>
          <p className="text-[#666] leading-relaxed max-w-md mx-auto">
            Thank you for applying to the Sunstone Ambassador Program. We&apos;ll review your application within 48 hours and send you an email with your referral link once approved.
          </p>
          <div className="mt-8">
            <Link href="/" className="text-[#B1275E] font-medium hover:underline">
              Back to Sunstone
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FDFBF9]">
      {/* Hero Section */}
      <div className="max-w-4xl mx-auto px-4 pt-16 pb-12 text-center">
        <Link href="/" className="inline-block mb-8">
          <span className="font-display text-3xl font-bold text-[#B1275E] tracking-tight">Sunstone</span>
        </Link>
        <h1 className="font-display text-4xl sm:text-5xl font-bold text-[#1a1a1a] mb-4">
          Ambassador Program
        </h1>
        <p className="text-lg text-[#666] max-w-2xl mx-auto leading-relaxed">
          Earn 20% recurring commission for every permanent jewelry artist you refer to Sunstone Studio. Monthly cash payouts for 8 months per referral.
        </p>
      </div>

      {/* Commission Calculator */}
      <div className="max-w-4xl mx-auto px-4 mb-12">
        <div className="bg-white rounded-2xl border border-[#e8e3de] shadow-sm p-8">
          <h2 className="text-lg font-semibold text-[#1a1a1a] mb-6 text-center">Commission Examples</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { plan: 'Starter', price: '$99/mo', commission: '$19.80/mo', annual: '$158.40' },
              { plan: 'Pro', price: '$169/mo', commission: '$33.80/mo', annual: '$270.40' },
              { plan: 'Business', price: '$279/mo', commission: '$55.80/mo', annual: '$446.40' },
            ].map((tier) => (
              <div key={tier.plan} className="text-center p-4 rounded-xl bg-[#FDFBF9] border border-[#e8e3de]">
                <p className="text-sm font-medium text-[#999] uppercase tracking-wider">{tier.plan}</p>
                <p className="text-sm text-[#666] mt-1">{tier.price}</p>
                <p className="text-2xl font-bold text-[#B1275E] mt-2">{tier.commission}</p>
                <p className="text-xs text-[#999] mt-1">Up to {tier.annual} per referral</p>
              </div>
            ))}
          </div>
          <p className="text-center text-sm text-[#999] mt-6">
            Refer 5 artists on Pro and earn <strong className="text-[#1a1a1a]">$169/mo in passive income</strong>
          </p>
        </div>
      </div>

      {/* Application Form */}
      <div className="max-w-lg mx-auto px-4 pb-20">
        <div className="bg-white rounded-2xl border border-[#e8e3de] shadow-sm p-8">
          <h2 className="text-xl font-semibold text-[#1a1a1a] mb-1">Apply to Become an Ambassador</h2>
          <p className="text-sm text-[#999] mb-6">No subscription required. Earn commissions by sharing your referral link.</p>

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-[#1a1a1a] mb-1.5">Full Name *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full h-11 px-3 rounded-xl border border-[#e8e3de] bg-white text-sm text-[#1a1a1a] focus:outline-none focus:border-[#B1275E] focus:ring-2 focus:ring-[#B1275E]/20"
                placeholder="Your full name"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[#1a1a1a] mb-1.5">Email *</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full h-11 px-3 rounded-xl border border-[#e8e3de] bg-white text-sm text-[#1a1a1a] focus:outline-none focus:border-[#B1275E] focus:ring-2 focus:ring-[#B1275E]/20"
                placeholder="you@example.com"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[#1a1a1a] mb-1.5">Phone <span className="text-[#999]">(optional)</span></label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full h-11 px-3 rounded-xl border border-[#e8e3de] bg-white text-sm text-[#1a1a1a] focus:outline-none focus:border-[#B1275E] focus:ring-2 focus:ring-[#B1275E]/20"
                placeholder="555-123-4567"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[#1a1a1a] mb-1.5">How do you influence the PJ community? *</label>
              <textarea
                value={form.community_description}
                onChange={(e) => setForm({ ...form, community_description: e.target.value })}
                className="w-full h-24 px-3 py-2 rounded-xl border border-[#e8e3de] bg-white text-sm text-[#1a1a1a] focus:outline-none focus:border-[#B1275E] focus:ring-2 focus:ring-[#B1275E]/20 resize-none"
                placeholder="Tell us about your PJ community presence, teaching, social following, etc."
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[#1a1a1a] mb-1.5">Social Media Links <span className="text-[#999]">(optional)</span></label>
              <textarea
                value={form.social_links}
                onChange={(e) => setForm({ ...form, social_links: e.target.value })}
                className="w-full h-16 px-3 py-2 rounded-xl border border-[#e8e3de] bg-white text-sm text-[#1a1a1a] focus:outline-none focus:border-[#B1275E] focus:ring-2 focus:ring-[#B1275E]/20 resize-none"
                placeholder="Instagram, TikTok, YouTube, etc."
              />
            </div>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.agreed}
                onChange={(e) => setForm({ ...form, agreed: e.target.checked })}
                className="mt-1 h-4 w-4 rounded border-[#e8e3de] text-[#B1275E] focus:ring-[#B1275E]"
              />
              <span className="text-sm text-[#666]">
                I agree to the{' '}
                <Link href="/terms" className="text-[#B1275E] underline">Ambassador Terms of Service</Link>
              </span>
            </label>

            <button
              type="submit"
              disabled={loading}
              className="w-full h-12 bg-[#B1275E] hover:bg-[#952050] text-white font-semibold rounded-xl transition-colors disabled:opacity-50"
            >
              {loading ? 'Submitting...' : 'Apply to Become an Ambassador'}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-[#999] mt-6">
          Already a Sunstone Studio user?{' '}
          <Link href="/auth/login" className="text-[#B1275E] font-medium hover:underline">
            Sign in to enroll from your dashboard
          </Link>
        </p>
      </div>
    </div>
  );
}
