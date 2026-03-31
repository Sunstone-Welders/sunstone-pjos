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
          Help grow the permanent jewelry community and get rewarded. Share Sunstone Studio with PJ artists and earn recurring commissions.
        </p>
      </div>

      {/* Benefits */}
      <div className="max-w-4xl mx-auto px-4 mb-12">
        <div className="bg-white rounded-2xl border border-[#e8e3de] shadow-sm p-8">
          <h2 className="text-lg font-semibold text-[#1a1a1a] mb-6 text-center">Why Become an Ambassador?</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div className="text-center space-y-2">
              <div className="w-10 h-10 rounded-full bg-[#FDF2F6] flex items-center justify-center mx-auto">
                <svg className="w-5 h-5 text-[#B1275E]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-[#1a1a1a]">Recurring Commission</p>
              <p className="text-xs text-[#666]">Earn a percentage of every referred artist&apos;s monthly subscription</p>
            </div>
            <div className="text-center space-y-2">
              <div className="w-10 h-10 rounded-full bg-[#FDF2F6] flex items-center justify-center mx-auto">
                <svg className="w-5 h-5 text-[#B1275E]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-[#1a1a1a]">Monthly Payouts</p>
              <p className="text-xs text-[#666]">Cash payouts deposited directly to you every month</p>
            </div>
            <div className="text-center space-y-2">
              <div className="w-10 h-10 rounded-full bg-[#FDF2F6] flex items-center justify-center mx-auto">
                <svg className="w-5 h-5 text-[#B1275E]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-[#1a1a1a]">Grow the Community</p>
              <p className="text-xs text-[#666]">Help PJ artists discover the tools they need to run their business</p>
            </div>
          </div>
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
