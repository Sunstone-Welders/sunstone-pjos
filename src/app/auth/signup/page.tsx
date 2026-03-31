'use client';

import { useState, useEffect, Suspense } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button, Input } from '@/components/ui';

export default function SignupPage() {
  return (
    <Suspense>
      <SignupForm />
    </Suspense>
  );
}

function SignupForm() {
  const [firstName, setFirstName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [businessName, setBusinessName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [referralName, setReferralName] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  // Check for referral code from URL param or cookie
  useEffect(() => {
    const ref = searchParams.get('ref');
    const cookieRef = document.cookie.match(/referral_code=([^;]+)/)?.[1];
    const code = ref || cookieRef || '';
    if (!code) return;
    setReferralCode(code);

    // Look up ambassador display name
    fetch(`/api/ambassador/lookup?code=${encodeURIComponent(code)}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.displayName) setReferralName(data.displayName);
      })
      .catch(() => {});
  }, [searchParams]);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    // Client-side password validation
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      setLoading(false);
      return;
    }
    if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password) || !/[^a-zA-Z0-9]/.test(password)) {
      setError('Password must include uppercase, lowercase, numbers, and a symbol.');
      setLoading(false);
      return;
    }

    try {
      // 1. Create auth user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { business_name: businessName, first_name: firstName.trim() } },
      });

      if (authError) throw new Error(authError.message);
      if (!authData.user) throw new Error('Signup failed. Please try again.');

      // 2. Create tenant + member via server API (bypasses RLS — no session needed)
      const res = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: authData.user.id,
          businessName: businessName.trim(),
          firstName: firstName.trim(),
          referralCode: referralCode || undefined,
        }),
      });

      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.error || 'Business setup failed');
      }

      // 3. Check if we have a session (no email confirmation) or need to wait
      const { data: { session } } = await supabase.auth.getSession();

      if (session) {
        // Logged in immediately — go to onboarding
        router.push('/onboarding');
      } else {
        // Email confirmation required — show success message
        setSuccess(true);
      }
    } catch (err: any) {
      setError(err?.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Success state — waiting for email confirmation
  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-surface-base">
        <div className="w-full max-w-[420px]">
          <div className="text-center mb-8">
            <h1 className="font-display text-4xl font-bold text-accent-600 tracking-tight">
              Sunstone
            </h1>
          </div>
          <div className="rounded-xl border border-border-default bg-surface-raised shadow-sm p-8 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-[var(--accent-50)] flex items-center justify-center mx-auto">
              <svg className="w-8 h-8 text-[var(--accent-600)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-text-primary">
              Check your inbox
            </h2>
            <p className="text-sm text-text-secondary">
              We sent a confirmation link to <strong>{email}</strong>.
              Click the link to activate your account and start your free trial.
            </p>
            <div className="pt-2">
              <Link
                href="/auth/login"
                className="text-sm text-accent-600 hover:text-accent-700 font-medium"
              >
                Go to Sign In
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-surface-base">
      <div className="w-full max-w-[420px]">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <h1 className="font-display text-4xl font-bold text-accent-600 tracking-tight">
            Sunstone
          </h1>
          <p className="text-text-primary text-lg font-semibold mt-3">
            Start your permanent jewelry business
          </p>
          <p className="text-text-secondary text-sm mt-1">
            30 days free. No credit card required.
          </p>
        </div>

        {/* Referral attribution */}
        {referralName && (
          <div className="rounded-lg bg-[var(--accent-50)] border border-[var(--accent-200)] px-4 py-3 mb-4 text-center">
            <p className="text-sm text-[var(--accent-700)]">
              Referred by <strong>{referralName}</strong>
            </p>
          </div>
        )}

        {/* Form Card */}
        <div className="rounded-xl border border-border-default bg-surface-raised shadow-sm p-8">
          <form onSubmit={handleSignup} className="space-y-5">
            {error && (
              <div className="rounded-lg bg-error-50 border border-error-500/20 px-4 py-3 text-sm text-error-600">
                {error}
              </div>
            )}

            <Input
              label="Your Name"
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="First and Last"
              required
              autoFocus
            />

            <Input
              label="Business Name"
              type="text"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="My Jewelry Studio"
              required
            />

            <Input
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />

            <div className="relative">
              <Input
                label="Password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min 8 characters"
                helperText="Must be at least 8 characters with uppercase, lowercase, numbers, and a symbol. Common or leaked passwords will be rejected."
                minLength={8}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-[34px] text-text-tertiary hover:text-text-secondary transition-colors"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                )}
              </button>
            </div>

            <Button
              type="submit"
              variant="primary"
              loading={loading}
              className="w-full min-h-[48px]"
            >
              Start Your Free Trial
            </Button>
          </form>
        </div>

        {/* Footer link */}
        <p className="text-center text-sm text-text-secondary mt-6">
          Already have an account?{' '}
          <Link
            href="/auth/login"
            className="text-accent-600 hover:text-accent-700 font-medium"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
