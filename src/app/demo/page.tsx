// src/app/demo/page.tsx
// Branded kiosk launcher — 3 persona cards with one-click login + auto-reset

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';
import { PERSONAS, type PersonaKey } from '@/lib/demo/personas';
import { toast } from 'sonner';
import '../marketing-fonts.css';

interface Credentials {
  key: PersonaKey;
  email: string;
  password: string;
  tenantId: string;
}

const BRAND = {
  cream: '#FAF7F0',
  deepRose: '#7A234A',
  deepRoseHover: '#631A3B',
  text: '#1D1D1D',
  textSoft: '#85625D',
  taupe: '#BF9F9A',
  white: '#FFFFFF',
  petal: '#FBEEEE',
  border: '#EBD9D5',
};

const FONT = {
  display: "'The Picnic Club', Georgia, serif",
  body: "'Montserrat', -apple-system, BlinkMacSystemFont, sans-serif",
};

const PLAN_LABELS: Record<PersonaKey, string> = {
  newbie: 'Pro Trial',
  mid: 'Pro Plan',
  pro: 'Business Plan',
};

const DESCRIPTIONS: Record<PersonaKey, string> = {
  newbie:
    'Just getting started \u2014 first events, building a client list, finding her pricing confidence.',
  mid:
    'Hitting her stride \u2014 steady events, growing client base, adding gift cards and party bookings.',
  pro:
    'Running a full business \u2014 tier pricing, warranties, 200+ clients, multiple events per week.',
};

export default function DemoPage() {
  const router = useRouter();
  const [credentials, setCredentials] = useState<Credentials[]>([]);
  const [loading, setLoading] = useState<PersonaKey | null>(null);
  const [loadingPhase, setLoadingPhase] = useState<'reset' | 'auth'>('reset');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    fetch('/api/demo/credentials')
      .then((r) => {
        if (!r.ok) throw new Error('Demo not enabled');
        return r.json();
      })
      .then((data) => {
        setCredentials(data.personas || []);
        setReady(true);
      })
      .catch(() => {
        setReady(true);
      });
  }, []);

  async function handleLogin(personaKey: PersonaKey) {
    const cred = credentials.find((c) => c.key === personaKey);
    if (!cred || !cred.email || !cred.password) {
      toast.error('Demo accounts not configured yet.');
      return;
    }

    setLoading(personaKey);
    setLoadingPhase('reset');
    try {
      // Auto-reset demo data first so the account is fully populated
      try {
        const res = await fetch('/api/demo/reset', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tenantId: cred.tenantId }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          console.warn('Demo reset warning:', body.error || res.statusText);
        }
      } catch (resetErr) {
        console.warn('Demo reset failed, continuing with login:', resetErr);
      }

      // Then sign in
      setLoadingPhase('auth');
      const supabase = createClient();
      await supabase.auth.signOut();

      const { error } = await supabase.auth.signInWithPassword({
        email: cred.email,
        password: cred.password,
      });

      if (error) throw error;

      router.push('/dashboard');
      router.refresh();
    } catch (err: any) {
      console.error('Demo login failed:', err);
      toast.error(err.message || 'Demo login failed. Check account configuration.');
      setLoading(null);
    }
  }

  const personaOrder: PersonaKey[] = ['newbie', 'mid', 'pro'];

  return (
    <div
      style={{
        minHeight: '100vh',
        background: BRAND.cream,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        fontFamily: FONT.body,
        color: BRAND.text,
      }}
    >
      {/* ── Header ── */}
      <header
        style={{
          width: '100%',
          padding: '32px 24px 0',
          textAlign: 'center',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 24 }}>
          <Image
            src="/landing/sunstone-logo.webp"
            alt="Sunstone"
            width={40}
            height={40}
            style={{ borderRadius: 8 }}
          />
          <span
            style={{
              fontFamily: FONT.display,
              fontWeight: 700,
              fontSize: 20,
              color: BRAND.text,
            }}
          >
            Sunstone Studio
          </span>
        </div>

        <h1
          style={{
            fontFamily: FONT.display,
            fontWeight: 700,
            fontSize: 'clamp(32px, 5vw, 48px)',
            color: BRAND.text,
            lineHeight: 1.15,
            marginBottom: 16,
          }}
        >
          Experience Sunstone Studio
        </h1>

        <p
          style={{
            fontFamily: FONT.body,
            fontSize: 'clamp(15px, 2vw, 18px)',
            color: BRAND.textSoft,
            maxWidth: 560,
            margin: '0 auto',
            lineHeight: 1.6,
          }}
        >
          See how permanent jewelry artists at every stage use Sunstone Studio to run their business.
        </p>
      </header>

      {/* ── Persona cards ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 24,
          maxWidth: 960,
          width: '100%',
          padding: '48px 24px 0',
          flex: 1,
        }}
      >
        {personaOrder.map((key) => {
          const persona = PERSONAS[key];
          const isLoading = loading === key;
          const isDisabled = loading !== null;

          return (
            <button
              key={key}
              onClick={() => handleLogin(key)}
              disabled={isDisabled || !ready}
              style={{
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                textAlign: 'left',
                background: BRAND.white,
                borderRadius: 16,
                padding: 32,
                border: `1px solid ${BRAND.border}`,
                boxShadow: '0 1px 4px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.03)',
                cursor: isDisabled ? 'not-allowed' : 'pointer',
                opacity: isDisabled && !isLoading ? 0.55 : 1,
                transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                minHeight: 320,
              }}
              onMouseEnter={(e) => {
                if (!isDisabled) {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.06)';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.03)';
              }}
            >
              {/* Loading overlay */}
              {isLoading && (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'rgba(255,255,255,0.92)',
                    borderRadius: 16,
                    zIndex: 10,
                  }}
                >
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      border: `3px solid ${BRAND.border}`,
                      borderTopColor: BRAND.deepRose,
                      borderRadius: '50%',
                      animation: 'spin 0.8s linear infinite',
                    }}
                  />
                  <p
                    style={{
                      marginTop: 14,
                      fontSize: 14,
                      fontWeight: 500,
                      color: BRAND.textSoft,
                      fontFamily: FONT.body,
                    }}
                  >
                    {loadingPhase === 'reset'
                      ? `Setting up ${persona.name}...`
                      : 'Signing in...'}
                  </p>
                </div>
              )}

              {/* Plan badge */}
              <span
                style={{
                  display: 'inline-block',
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  padding: '5px 12px',
                  borderRadius: 100,
                  background: BRAND.petal,
                  color: BRAND.deepRose,
                  marginBottom: 20,
                  alignSelf: 'flex-start',
                }}
              >
                {PLAN_LABELS[key]}
              </span>

              {/* Business name */}
              <h2
                style={{
                  fontFamily: FONT.display,
                  fontWeight: 700,
                  fontSize: 24,
                  color: BRAND.text,
                  marginBottom: 10,
                  lineHeight: 1.2,
                }}
              >
                {persona.name}
              </h2>

              {/* Description */}
              <p
                style={{
                  fontSize: 15,
                  lineHeight: 1.65,
                  color: BRAND.textSoft,
                  flex: 1,
                  marginBottom: 24,
                }}
              >
                {DESCRIPTIONS[key]}
              </p>

              {/* CTA button */}
              <div
                style={{
                  width: '100%',
                  padding: '14px 0',
                  borderRadius: 10,
                  textAlign: 'center',
                  fontSize: 15,
                  fontWeight: 600,
                  fontFamily: FONT.body,
                  color: BRAND.white,
                  background: BRAND.deepRose,
                  transition: 'background 0.15s ease',
                  minHeight: 48,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                onMouseEnter={(e) => {
                  if (!isDisabled) e.currentTarget.style.background = BRAND.deepRoseHover;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = BRAND.deepRose;
                }}
              >
                Explore This Studio
              </div>
            </button>
          );
        })}
      </div>

      {/* ── Footer ── */}
      <footer
        style={{
          width: '100%',
          padding: '48px 24px 32px',
          textAlign: 'center',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 8 }}>
          <Image
            src="/landing/sunstone-logo.webp"
            alt="Sunstone"
            width={20}
            height={20}
            style={{ borderRadius: 4, opacity: 0.7 }}
          />
          <span style={{ fontSize: 13, color: BRAND.taupe, fontWeight: 500 }}>
            Powered by Sunstone Permanent Jewelry
          </span>
        </div>
      </footer>

      {/* Spin animation for loading spinner */}
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
