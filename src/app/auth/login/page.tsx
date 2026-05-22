// src/app/auth/login/page.tsx
// Updated: Added "Forgot password?" link → /auth/reset-password

'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { isNativeApp } from '@/lib/native';
import { persistNativeSession } from '@/lib/supabase/native-session';
import { toast } from 'sonner';
import { Suspense } from 'react';

export default function LoginPage() {
  return (
    <Suspense>
      <LoginPageInner />
    </Suspense>
  );
}

function LoginPageInner() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [isNative, setIsNative] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  useEffect(() => { setIsNative(isNativeApp()); }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Login failed');
        return;
      }

      // Sync client-side auth state with the server session
      await supabase.auth.setSession({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
      });

      const redirectTo = searchParams.get('redirect');
      const dest = redirectTo && redirectTo.startsWith('/') ? redirectTo : '/';

      if (isNative) {
        // Persist tokens to native storage (UserDefaults / SharedPreferences)
        // so the session survives WKWebView cookie clearing on relaunch.
        await persistNativeSession(data.access_token, data.refresh_token);

        // Top-level navigation to /api/auth/set-session. The endpoint returns
        // a 302 to `dest` with Set-Cookie headers — WKWebView applies the
        // cookies before following the redirect, so the dashboard load is
        // authenticated. Set-Cookie headers from fetch() responses do not
        // reliably reach WKWebView's navigation cookie jar, which is why
        // earlier attempts (router.push / fetch-then-push) bounced back to
        // /auth/login on the first nav.
        const params = new URLSearchParams({
          access_token: data.access_token,
          refresh_token: data.refresh_token,
          redirect: dest,
        });
        window.location.href = `/api/auth/set-session?${params.toString()}`;
        return;
      }

      router.push(dest);
      router.refresh();
    } catch (err: any) {
      toast.error('An unexpected error occurred');
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
            Sunstone Studio
          </p>
        </div>

        {/* Account deleted confirmation */}
        {searchParams.get('deleted') === '1' && (
          <div className="mb-4 rounded-lg bg-green-50 border border-green-200 p-3 text-sm text-green-800 text-center">
            Your account has been deleted.
          </div>
        )}

        {/* Login Card */}
        <div className="bg-surface-raised border border-border-default rounded-xl p-8 shadow-sm">
          <form onSubmit={handleLogin} className="space-y-5">
            {/* Email */}
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-text-primary mb-1.5"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoComplete="email"
                className="w-full h-12 px-4 rounded-lg border border-border-default bg-surface-base text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent-500/30 focus:border-accent-500 transition-colors"
              />
            </div>

            {/* Password */}
            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-text-primary mb-1.5"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
                className="w-full h-12 px-4 rounded-lg border border-border-default bg-surface-base text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent-500/30 focus:border-accent-500 transition-colors"
              />
            </div>

            {/* Forgot password link */}
            <div className="flex justify-end">
              <Link
                href="/auth/reset-password"
                className="text-sm text-text-secondary hover:text-accent-600 transition-colors"
              >
                Forgot password?
              </Link>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full h-12 rounded-lg bg-accent-600 text-white font-medium hover:bg-accent-700 focus:outline-none focus:ring-2 focus:ring-accent-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          {/* Signup link — hidden on native to prevent external purchase path */}
          {!isNative && (
            <p className="mt-6 text-center text-sm text-text-secondary">
              Don&apos;t have an account?{' '}
              <Link
                href="/auth/signup"
                className="text-accent-600 hover:text-accent-700 font-medium transition-colors"
              >
                Sign up
              </Link>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}