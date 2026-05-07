'use client';

import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import { Button } from '@/components/ui';

export default function VerifyPage() {
  return (
    <Suspense>
      <VerifyForm />
    </Suspense>
  );
}

const CODE_LENGTH = 6;
const RESEND_COOLDOWN = 30; // seconds

function VerifyForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const uid = searchParams.get('uid') || '';
  const maskedPhone = searchParams.get('phone') || '';

  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const [error, setError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(RESEND_COOLDOWN);
  const [resending, setResending] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Start resend cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  // Focus first input on mount
  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  // Auto-submit when all digits entered
  const submitCode = useCallback(async (code: string) => {
    if (verifying) return;
    setVerifying(true);
    setError('');

    try {
      // Look up the actual phone from the user's tenant (not from URL)
      const res = await fetch('/api/auth/verify-phone/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: uid, phone: '_from_tenant_', code }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Verification failed.');
        setDigits(Array(CODE_LENGTH).fill(''));
        setTimeout(() => inputRefs.current[0]?.focus(), 50);
        return;
      }

      // Success — check if we have a session and redirect to onboarding
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        router.push('/onboarding');
      } else {
        // Try to get session (user may need to re-authenticate)
        router.push('/auth/login?verified=true');
      }
    } catch {
      setError('Something went wrong. Please try again.');
      setDigits(Array(CODE_LENGTH).fill(''));
    } finally {
      setVerifying(false);
    }
  }, [uid, verifying, router, supabase]);

  const handleDigitChange = (index: number, value: string) => {
    // Only accept single digits
    const digit = value.replace(/\D/g, '').slice(-1);
    const newDigits = [...digits];
    newDigits[index] = digit;
    setDigits(newDigits);
    setError('');

    if (digit && index < CODE_LENGTH - 1) {
      // Auto-advance to next input
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all digits filled
    if (digit && index === CODE_LENGTH - 1) {
      const code = newDigits.join('');
      if (code.length === CODE_LENGTH) {
        submitCode(code);
      }
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      // Move back on backspace when current field is empty
      inputRefs.current[index - 1]?.focus();
      const newDigits = [...digits];
      newDigits[index - 1] = '';
      setDigits(newDigits);
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, CODE_LENGTH);
    if (!pasted) return;

    const newDigits = Array(CODE_LENGTH).fill('');
    for (let i = 0; i < pasted.length; i++) {
      newDigits[i] = pasted[i];
    }
    setDigits(newDigits);

    // Focus the next empty slot or the last slot
    const nextEmpty = pasted.length < CODE_LENGTH ? pasted.length : CODE_LENGTH - 1;
    inputRefs.current[nextEmpty]?.focus();

    // Auto-submit if full code pasted
    if (pasted.length === CODE_LENGTH) {
      submitCode(pasted);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0 || resending) return;
    setResending(true);
    setError('');

    try {
      const res = await fetch('/api/auth/verify-phone/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: uid, phone: '_from_tenant_' }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to resend code.');
      } else {
        setResendCooldown(RESEND_COOLDOWN);
        setDigits(Array(CODE_LENGTH).fill(''));
        inputRefs.current[0]?.focus();
      }
    } catch {
      setError('Failed to resend code. Please try again.');
    } finally {
      setResending(false);
    }
  };

  // If no uid, redirect to signup
  if (!uid) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-surface-base">
        <div className="w-full max-w-[420px] text-center">
          <p className="text-text-secondary mb-4">No verification in progress.</p>
          <Link
            href="/auth/signup"
            className="text-accent-600 hover:text-accent-700 font-medium"
          >
            Go to Sign Up
          </Link>
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
        </div>

        {/* Verification Card */}
        <div className="rounded-xl border border-border-default bg-surface-raised shadow-sm p-8">
          <div className="text-center space-y-3 mb-8">
            {/* Phone icon */}
            <div className="w-16 h-16 rounded-full bg-[var(--accent-50)] flex items-center justify-center mx-auto">
              <svg className="w-8 h-8 text-[var(--accent-600)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-text-primary">
              Verify your phone
            </h2>
            <p className="text-sm text-text-secondary">
              We sent a 6-digit code to{' '}
              <span className="font-medium text-text-primary">
                {decodeURIComponent(maskedPhone) || 'your phone'}
              </span>
            </p>
          </div>

          {/* Error message */}
          {error && (
            <div className="rounded-lg bg-error-50 border border-error-500/20 px-4 py-3 text-sm text-error-600 mb-6 text-center">
              {error}
            </div>
          )}

          {/* 6-digit code input */}
          <div className="flex justify-center gap-3 mb-8" onPaste={handlePaste}>
            {digits.map((digit, i) => (
              <input
                key={i}
                ref={(el) => { inputRefs.current[i] = el; }}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={1}
                value={digit}
                onChange={(e) => handleDigitChange(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                disabled={verifying}
                className={`
                  w-12 h-14 text-center text-xl font-semibold rounded-lg border
                  bg-surface-base text-text-primary
                  focus:outline-none focus:ring-2 focus:ring-[var(--accent-500)] focus:border-[var(--accent-500)]
                  transition-colors
                  ${verifying ? 'opacity-50 cursor-not-allowed' : 'border-border-default hover:border-[var(--accent-300)]'}
                `}
              />
            ))}
          </div>

          {/* Verifying indicator */}
          {verifying && (
            <div className="text-center text-sm text-text-secondary mb-4">
              Verifying...
            </div>
          )}

          {/* Resend button */}
          <div className="text-center space-y-3">
            <button
              type="button"
              onClick={handleResend}
              disabled={resendCooldown > 0 || resending}
              className={`text-sm font-medium transition-colors ${
                resendCooldown > 0 || resending
                  ? 'text-text-tertiary cursor-not-allowed'
                  : 'text-accent-600 hover:text-accent-700 cursor-pointer'
              }`}
            >
              {resending
                ? 'Sending...'
                : resendCooldown > 0
                  ? `Resend code in ${resendCooldown}s`
                  : 'Resend Code'
              }
            </button>

            <div>
              <Link
                href="/auth/signup"
                className="text-sm text-text-tertiary hover:text-text-secondary transition-colors"
              >
                Wrong number? Go back
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
