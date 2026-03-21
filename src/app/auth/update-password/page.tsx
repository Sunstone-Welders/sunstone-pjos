// src/app/auth/update-password/page.tsx
// NEW: Update password page — user lands here from the email reset link
// Supabase auto-picks up the tokens from the URL hash and establishes a session

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

export default function UpdatePasswordPage() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [sessionReady, setSessionReady] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  // Listen for the PASSWORD_RECOVERY event from Supabase
  // This fires when the user clicks the reset link and tokens are exchanged
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event) => {
        if (event === 'PASSWORD_RECOVERY') {
          setSessionReady(true);
        }
      }
    );

    // Also check if there's already a session (user may have refreshed)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setSessionReady(true);
      }
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validation
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password) || !/[^a-zA-Z0-9]/.test(password)) {
      setError('Password must include uppercase, lowercase, numbers, and a symbol.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);

    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });

      if (updateError) {
        // Handle common errors with friendlier messages
        if (updateError.message.includes('expired')) {
          setError(
            'This reset link has expired. Please request a new one.'
          );
        } else if (updateError.message.includes('same')) {
          setError(
            'New password must be different from your current password.'
          );
        } else {
          setError(updateError.message);
        }
        return;
      }

      setSuccess(true);

      // Sign out so they get a clean login
      await supabase.auth.signOut();

      // Redirect to login after a short delay
      setTimeout(() => {
        router.push('/auth/login');
      }, 3000);
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
            Set a new password
          </p>
        </div>

        {/* Card */}
        <div className="bg-surface-raised border border-border-default rounded-xl p-8 shadow-sm">
          {success ? (
            /* Success state */
            <div className="text-center space-y-4">
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
                Password updated!
              </h2>
              <p className="text-sm text-text-secondary">
                Your password has been changed successfully.
                <br />
                Redirecting you to login...
              </p>

              <Link
                href="/auth/login"
                className="inline-block mt-2 text-sm text-accent-600 hover:text-accent-700 font-medium transition-colors"
              >
                Go to login now →
              </Link>
            </div>
          ) : !sessionReady ? (
            /* Waiting for session / invalid link */
            <div className="text-center space-y-4">
              <div className="mx-auto w-8 h-8 border-2 border-accent-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-text-secondary">
                Verifying your reset link...
              </p>
              <p className="text-xs text-text-tertiary">
                If this takes too long, your link may have expired.{' '}
                <Link
                  href="/auth/reset-password"
                  className="text-accent-600 hover:text-accent-700 font-medium"
                >
                  Request a new one
                </Link>
              </p>
            </div>
          ) : (
            /* Form state */
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Error */}
              {error && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                  {error}
                  {error.includes('expired') && (
                    <Link
                      href="/auth/reset-password"
                      className="block mt-2 text-red-800 font-medium underline"
                    >
                      Request a new reset link
                    </Link>
                  )}
                </div>
              )}

              {/* New Password */}
              <div>
                <label
                  htmlFor="new-password"
                  className="block text-sm font-medium text-text-primary mb-1.5"
                >
                  New Password
                </label>
                <input
                  id="new-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  autoFocus
                  className="w-full h-12 px-4 rounded-lg border border-border-default bg-surface-base text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent-500/30 focus:border-accent-500 transition-colors"
                />
              </div>

              {/* Confirm Password */}
              <div>
                <label
                  htmlFor="confirm-password"
                  className="block text-sm font-medium text-text-primary mb-1.5"
                >
                  Confirm Password
                </label>
                <input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Type your new password again"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  className="w-full h-12 px-4 rounded-lg border border-border-default bg-surface-base text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent-500/30 focus:border-accent-500 transition-colors"
                />
                <p className="mt-1.5 text-xs text-text-tertiary">
                  Must be at least 8 characters with uppercase, lowercase, numbers, and a symbol. Common or leaked passwords will be rejected.
                </p>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                className="w-full h-12 rounded-lg bg-accent-600 text-white font-medium hover:bg-accent-700 focus:outline-none focus:ring-2 focus:ring-accent-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? 'Updating...' : 'Update Password'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}