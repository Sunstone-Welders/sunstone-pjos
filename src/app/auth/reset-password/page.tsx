// src/app/auth/reset-password/page.tsx
// NEW: Forgot password page — sends Supabase password reset email

'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function ResetPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });

      if (!res.ok) {
        setError('Something went wrong. Please try again.');
        return;
      }

      setSent(true);
    } catch (err: any) {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-surface-base">
      <div className="w-full max-w-md">
        {/* Brand */}
        <div className="text-center mb-8">
          <h1 className="font-display text-3xl font-bold text-text-primary">
            Sunstone
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            Reset your password
          </p>
        </div>

        {/* Card */}
        <div className="bg-surface-raised border border-border-default rounded-xl p-8 shadow-sm">
          {sent ? (
            /* Success state */
            <div className="text-center space-y-4">
              {/* Checkmark icon */}
              <div className="mx-auto w-12 h-12 rounded-full bg-green-50 flex items-center justify-center">
                <svg
                  className="w-6 h-6 text-green-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4.5 12.75l6 6 9-13.5"
                  />
                </svg>
              </div>

              <h2 className="text-lg font-semibold text-text-primary">
                Check your email
              </h2>
              <p className="text-sm text-text-secondary leading-relaxed">
                We sent a password reset link to{' '}
                <span className="font-medium text-text-primary">{email}</span>.
                <br />
                Click the link in the email to set a new password.
              </p>
              <p className="text-xs text-text-tertiary">
                Didn&apos;t receive it? Check your spam folder or try again.
              </p>

              <div className="pt-2 space-y-3">
                <button
                  onClick={() => {
                    setSent(false);
                    setEmail('');
                  }}
                  className="w-full h-12 rounded-lg border border-border-default text-text-primary font-medium hover:bg-surface-base transition-colors"
                >
                  Try a different email
                </button>
                <Link
                  href="/auth/login"
                  className="block text-sm text-accent-600 hover:text-accent-700 font-medium transition-colors"
                >
                  ← Back to login
                </Link>
              </div>
            </div>
          ) : (
            /* Form state */
            <>
              <p className="text-sm text-text-secondary mb-6 leading-relaxed">
                Enter your email address and we&apos;ll send you a link to reset
                your password.
              </p>

              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Error */}
                {error && (
                  <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                    {error}
                  </div>
                )}

                {/* Email */}
                <div>
                  <label
                    htmlFor="reset-email"
                    className="block text-sm font-medium text-text-primary mb-1.5"
                  >
                    Email
                  </label>
                  <input
                    id="reset-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    autoComplete="email"
                    autoFocus
                    className="w-full h-12 px-4 rounded-lg border border-border-default bg-surface-base text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent-500/30 focus:border-accent-500 transition-colors"
                  />
                </div>

                {/* Submit */}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full h-12 rounded-lg bg-accent-600 text-white font-medium hover:bg-accent-700 focus:outline-none focus:ring-2 focus:ring-accent-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? 'Sending...' : 'Send Reset Link'}
                </button>
              </form>

              {/* Back to login */}
              <p className="mt-6 text-center">
                <Link
                  href="/auth/login"
                  className="text-sm text-text-secondary hover:text-accent-600 transition-colors"
                >
                  ← Back to login
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}