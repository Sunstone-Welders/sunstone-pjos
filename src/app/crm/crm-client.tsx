'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { toast } from 'sonner'
import '../marketing-fonts.css'

/* ═══════════════════════════════════════════════════════════════
   SUNSTONE CRM — DEDICATED MARKETING PAGE
   Brand: The Picnic Club + Montserrat, official Sunstone palette
   ═══════════════════════════════════════════════════════════════ */

const C = {
  bg: '#ffffff',
  bgSoft: '#FDF6F6',
  bgDeep: '#FBEEEE',
  text: '#31241B',
  textSec: '#85625D',
  textMuted: '#BF9F9A',
  wine: '#7A234A',
  wineDeep: '#651D3E',
  wineLight: '#B1275E',
  wineBg: 'rgba(122,35,74,0.05)',
  wineBorder: 'rgba(122,35,74,0.12)',
  gold: '#E1598F',
  goldDeep: '#B1275E',
  goldLight: '#E1598F',
  goldBg: 'rgba(225,89,143,0.08)',
  dark: '#31241B',
  darkCard: '#3d2e23',
  darkText: '#FBEEEE',
  darkMuted: '#BF9F9A',
  card: '#ffffff',
  border: '#e7e0dc',
  borderLight: '#f2ede9',
}

const FONT = {
  display: "'The Picnic Club', Georgia, serif",
  body: "'Montserrat', -apple-system, BlinkMacSystemFont, sans-serif",
}

/* ─── Reveal animation hook ─── */
function useReveal(threshold = 0.12) {
  const ref = useRef<HTMLDivElement>(null)
  const [vis, setVis] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const o = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVis(true); o.disconnect() } },
      { threshold, rootMargin: '0px 0px -30px 0px' }
    )
    o.observe(el)
    return () => o.disconnect()
  }, [threshold])
  return [ref, vis] as const
}

function Reveal({ children, delay = 0, y = 36, style = {} }: {
  children: React.ReactNode; delay?: number; y?: number; style?: React.CSSProperties
}) {
  const [ref, vis] = useReveal()
  return (
    <div ref={ref} style={{
      ...style,
      opacity: vis ? 1 : 0,
      transform: vis ? 'none' : `translateY(${y}px)`,
      transition: `opacity 0.75s ease ${delay}s, transform 0.75s ease ${delay}s`,
    }}>
      {children}
    </div>
  )
}

/* ─── Conversation mockup ─── */
function ChatBubble({ from, text, sunny, delay = 0 }: {
  from: 'client' | 'artist'; text: string; sunny?: boolean; delay?: number
}) {
  const isClient = from === 'client'
  return (
    <div style={{
      display: 'flex',
      justifyContent: isClient ? 'flex-start' : 'flex-end',
      marginBottom: 10,
      animationDelay: `${delay}s`,
    }}>
      <div style={{
        maxWidth: '82%',
        padding: '10px 14px',
        borderRadius: isClient ? '16px 16px 16px 4px' : '16px 16px 4px 16px',
        background: isClient ? '#f3f0ed' : C.wine,
        color: isClient ? C.text : '#fff',
        fontSize: 14,
        lineHeight: 1.55,
      }}>
        {sunny && (
          <span style={{ fontSize: 11, opacity: 0.8, display: 'block', marginBottom: 2 }}>
            Sunny
          </span>
        )}
        {text}
      </div>
    </div>
  )
}

function PhoneMockup({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{
        display: 'inline-block',
        width: '100%',
        maxWidth: 320,
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 24,
        padding: '20px 16px 16px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.06)',
      }}>
        {/* Status bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, padding: '0 4px' }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: C.textMuted }}>Your Business</span>
          <span style={{ fontSize: 11, color: C.textMuted }}>SMS</span>
        </div>
        {children}
      </div>
      <p style={{ fontSize: 13, color: C.textSec, marginTop: 12, fontWeight: 500 }}>{label}</p>
    </div>
  )
}

/* ─── Sunstone Logo (matches landing page) ─── */
function SunstoneLogo({ size = 34 }: { size?: number }) {
  return (
    <Image
      src="/landing/sunstone-logo.webp"
      alt="Sunstone Studio"
      width={size}
      height={size}
      style={{ borderRadius: 8 }}
    />
  )
}

/* ═══════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════ */

type AuthState = 'anonymous' | 'trial' | 'has_base_no_crm' | 'has_crm' | 'expired_no_base'

export default function CRMPageClient({ authState, trialEndDate }: { authState: AuthState; trialEndDate: string | null }) {
  const [checkingOut, setCheckingOut] = useState(false)

  // CTA label and behavior depends on auth state
  const ctaConfig = (() => {
    switch (authState) {
      case 'anonymous':
        return { label: 'Start Your Free Trial', action: 'signup' as const }
      case 'trial': {
        const endStr = trialEndDate ? new Date(trialEndDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''
        return { label: `Add CRM to My Plan — Free until ${endStr}`, action: 'checkout' as const }
      }
      case 'has_base_no_crm':
        return { label: 'Add CRM — $69/mo', action: 'checkout' as const }
      case 'has_crm':
        return { label: 'You have CRM — Go to Dashboard', action: 'dashboard' as const }
      case 'expired_no_base':
        return { label: 'Choose a Plan First', action: 'settings' as const }
    }
  })()

  const handleCta = async () => {
    switch (ctaConfig.action) {
      case 'signup':
        window.location.href = '/auth/signup'
        return
      case 'dashboard':
        window.location.href = '/dashboard/messages'
        return
      case 'settings':
        window.location.href = '/dashboard/settings?tab=subscription'
        return
      case 'checkout':
        if (checkingOut) return
        setCheckingOut(true)
        try {
          const res = await fetch('/api/stripe/crm-checkout', { method: 'POST' })
          const data = await res.json()
          if (!res.ok) {
            toast.error(data.error || 'Failed to start checkout')
            setCheckingOut(false)
            return
          }
          if (data.url) {
            window.location.href = data.url
          }
        } catch {
          toast.error('Something went wrong. Please try again.')
          setCheckingOut(false)
        }
        return
    }
  }

  return (
    <div style={{ fontFamily: FONT.body, color: C.text, background: C.bg }}>
      <style>{`
        html { scroll-behavior: smooth; }
        ::selection { background: ${C.wineBg}; color: ${C.wine}; }
        .crm-container { max-width: 1120px; margin: 0 auto; padding: 0 24px; }
        .serif { font-family: ${FONT.display}; }
        @media (max-width: 900px) {
          .crm-grid-2 { grid-template-columns: 1fr !important; }
          .crm-grid-3 { grid-template-columns: 1fr !important; max-width: 420px !important; margin-left: auto !important; margin-right: auto !important; }
          .crm-grid-4 { grid-template-columns: repeat(2, 1fr) !important; }
          .crm-convo-grid { grid-template-columns: 1fr !important; max-width: 360px !important; margin-left: auto !important; margin-right: auto !important; }
        }
        @media (max-width: 600px) {
          .crm-grid-4 { grid-template-columns: 1fr !important; max-width: 360px !important; margin-left: auto !important; margin-right: auto !important; }
        }
      `}</style>

      {/* ═══════ NAV ═══════ */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 100, padding: '14px 0',
        background: 'rgba(255,255,255,0.94)', backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)', borderBottom: `1px solid ${C.border}`,
      }}>
        <div className="crm-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 11, textDecoration: 'none' }}>
            <SunstoneLogo size={32} />
            <span className="serif" style={{ fontWeight: 600, fontSize: 16, color: C.text }}>Sunstone Studio</span>
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <a href="#pricing" style={{ fontSize: 14, fontWeight: 500, color: C.textSec, textDecoration: 'none' }}>Pricing</a>
            <a href="#faq" style={{ fontSize: 14, fontWeight: 500, color: C.textSec, textDecoration: 'none' }}>FAQ</a>
            <button onClick={handleCta} disabled={checkingOut} style={{
              padding: '9px 20px', borderRadius: 10, background: C.wine, color: '#fff',
              fontSize: 14, fontWeight: 600, border: 'none', cursor: checkingOut ? 'wait' : 'pointer',
              opacity: checkingOut ? 0.7 : 1,
            }}>
              {checkingOut ? 'Loading...' : ctaConfig.label}
            </button>
          </div>
        </div>
      </nav>

      {/* ═══════ HERO ═══════ */}
      <section style={{ padding: '100px 24px 80px', background: `linear-gradient(180deg, ${C.bgSoft} 0%, ${C.bg} 100%)` }}>
        <div className="crm-container" style={{ textAlign: 'center', maxWidth: 780, margin: '0 auto' }}>
          <Reveal>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 20px', borderRadius: 100, background: C.goldBg, border: `1px solid rgba(200,165,92,0.2)`, fontSize: 13, fontWeight: 700, color: C.goldDeep, marginBottom: 24 }}>
              Included in your 60-day trial
            </div>
          </Reveal>
          <Reveal delay={0.08}>
            <h1 className="serif" style={{ fontSize: 'clamp(2.2rem, 5vw, 3.4rem)', fontWeight: 400, lineHeight: 1.15, marginBottom: 20 }}>
              Your <em style={{ fontStyle: 'italic', color: C.wine }}>AI-Powered</em> Business Phone
            </h1>
          </Reveal>
          <Reveal delay={0.16}>
            <p style={{ fontSize: 19, color: C.textSec, lineHeight: 1.7, maxWidth: 620, margin: '0 auto 36px' }}>
              A dedicated phone number, automated marketing, and an AI assistant that texts your clients for you — all for $69/month.
            </p>
          </Reveal>
          <Reveal delay={0.24}>
            <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button onClick={handleCta} disabled={checkingOut} style={{
                padding: '14px 32px', borderRadius: 12, background: C.wine, color: '#fff',
                fontSize: 16, fontWeight: 600, border: 'none', cursor: checkingOut ? 'wait' : 'pointer',
                boxShadow: `0 4px 20px ${C.wineBg}`,
                opacity: checkingOut ? 0.7 : 1,
              }}>
                {checkingOut ? 'Loading...' : ctaConfig.label}
              </button>
              <a href="#sunny" style={{
                padding: '14px 28px', borderRadius: 12, background: 'transparent',
                border: `1.5px solid ${C.border}`, color: C.text,
                fontSize: 16, fontWeight: 500, textDecoration: 'none',
              }}>
                See How It Works
              </a>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ═══════ SECTION 1: YOUR OWN BUSINESS NUMBER ═══════ */}
      <section style={{ padding: '100px 24px', background: C.bg }}>
        <div className="crm-container crm-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 64, alignItems: 'center' }}>
          <Reveal>
            <div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 14px', borderRadius: 100, background: C.wineBg, border: `1px solid ${C.wineBorder}`, fontSize: 12, fontWeight: 700, color: C.wine, marginBottom: 20, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                Dedicated Number
              </div>
              <h2 className="serif" style={{ fontSize: 'clamp(1.8rem, 3vw, 2.4rem)', fontWeight: 400, lineHeight: 1.2, marginBottom: 18 }}>
                Your Own <em style={{ fontStyle: 'italic', color: C.wine }}>Business Number</em>
              </h2>
              <p style={{ fontSize: 16.5, color: C.textSec, lineHeight: 1.75, marginBottom: 24 }}>
                Stop giving out your personal number. Get a dedicated business line that your clients can text anytime — and you respond right from the app.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[
                  'Your clients text one number. You respond from the app.',
                  'Your personal number stays completely private.',
                  'Forward calls to your phone, or set a text-only greeting.',
                  'Mute during events — auto-reply handles it.',
                ].map((item, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <span style={{ color: C.wine, fontSize: 16, lineHeight: 1.5, flexShrink: 0 }}>&#10003;</span>
                    <span style={{ fontSize: 15, color: C.textSec, lineHeight: 1.6 }}>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
          <Reveal delay={0.12}>
            <PhoneMockup label="Your dedicated business line">
              <ChatBubble from="client" text="Hey! Do you have any availability this weekend?" />
              <ChatBubble from="artist" text="Hi Sarah! I'll be at the Farmer's Market Saturday 10-4. Would love to see you there!" sunny />
              <ChatBubble from="client" text="Perfect! I'll bring my friend too" />
              <ChatBubble from="artist" text="Amazing! I'll save a spot for both of you. See you Saturday!" sunny />
            </PhoneMockup>
          </Reveal>
        </div>
      </section>

      {/* ═══════ SECTION 2: SUNNY ANSWERS YOUR TEXTS (THE BIG ONE) ═══════ */}
      <section id="sunny" style={{ padding: '100px 24px', background: C.bgDeep }}>
        <div className="crm-container">
          <Reveal style={{ textAlign: 'center', maxWidth: 720, margin: '0 auto 60px' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 14px', borderRadius: 100, background: C.goldBg, border: `1px solid rgba(200,165,92,0.2)`, fontSize: 12, fontWeight: 700, color: C.goldDeep, marginBottom: 20, letterSpacing: 0.5, textTransform: 'uppercase' }}>
              The Killer Feature
            </div>
            <h2 className="serif" style={{ fontSize: 'clamp(1.8rem, 3.5vw, 2.6rem)', fontWeight: 400, lineHeight: 1.2, marginBottom: 18 }}>
              An AI Assistant That <em style={{ fontStyle: 'italic', color: C.wine }}>Knows Your Business</em>
            </h2>
            <p style={{ fontSize: 17, color: C.textSec, lineHeight: 1.75 }}>
              Sunny reads your inventory, knows your schedule, remembers your clients — and texts them back for you.
            </p>
          </Reveal>

          {/* Conversation examples */}
          <div className="crm-convo-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 28, maxWidth: 720, margin: '0 auto 56px' }}>
            <Reveal delay={0}>
              <PhoneMockup label="Event Schedule">
                <ChatBubble from="client" text="When's your next event?" />
                <ChatBubble from="artist" text="Hey! I'll be at the Downtown Market this Saturday, 10am-4pm. Want me to save you a spot?" sunny />
              </PhoneMockup>
            </Reveal>
            <Reveal delay={0.1}>
              <PhoneMockup label="Pricing Questions">
                <ChatBubble from="client" text="How much for a gold fill bracelet?" />
                <ChatBubble from="artist" text="Gold fill bracelets start at $75! I have some gorgeous new chains in stock. Want to come see them at my next event?" sunny />
              </PhoneMockup>
            </Reveal>
            <Reveal delay={0.2}>
              <PhoneMockup label="Queue Position">
                <ChatBubble from="client" text="What's my position in line?" />
                <ChatBubble from="artist" text="You're #3! Should be about 15 minutes. I'll text you when you're up!" sunny />
              </PhoneMockup>
            </Reveal>
            <Reveal delay={0.3}>
              <PhoneMockup label="Smart Escalation">
                <ChatBubble from="client" text="My bracelet broke and I'm really upset" />
                <div style={{
                  margin: '8px 0', padding: '10px 14px', borderRadius: 12,
                  background: 'rgba(200,165,92,0.12)', border: `1px solid rgba(200,165,92,0.25)`,
                  fontSize: 13, color: C.goldDeep, lineHeight: 1.5,
                }}>
                  Sunny &rarr; You: &ldquo;Sarah seems upset about a broken bracelet. I&rsquo;d recommend handling this personally.&rdquo;
                </div>
                <ChatBubble from="artist" text="Oh no Sarah! I'm so sorry. Let's get that fixed — can you come by Saturday? No charge." />
              </PhoneMockup>
            </Reveal>
          </div>

          {/* Three modes */}
          <Reveal>
            <h3 className="serif" style={{ textAlign: 'center', fontSize: 'clamp(1.4rem, 2.5vw, 1.8rem)', fontWeight: 400, marginBottom: 32 }}>
              Three Modes. <em style={{ fontStyle: 'italic', color: C.wine }}>Total Control.</em>
            </h3>
          </Reveal>

          <div className="crm-grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20, maxWidth: 880, margin: '0 auto 48px' }}>
            {[
              { mode: 'Auto', icon: '&#10024;', desc: 'Sunny handles routine questions automatically. Escalates anything emotional or complex to you.', tag: 'Set it & forget it' },
              { mode: 'Suggest', icon: '&#128172;', desc: 'Sunny drafts responses for you to review. Tap to send, edit, or dismiss. Perfect for learning her style.', tag: 'Recommended to start' },
              { mode: 'Off', icon: '&#9995;', desc: 'Handle everything yourself. Your dedicated number still works — just no AI assistance.', tag: 'Full manual control' },
            ].map((m, i) => (
              <Reveal key={i} delay={i * 0.08}>
                <div style={{
                  padding: '28px 24px', borderRadius: 16, background: C.card,
                  border: `1px solid ${C.border}`, height: '100%',
                }}>
                  <div dangerouslySetInnerHTML={{ __html: m.icon }} style={{ fontSize: 28, marginBottom: 14 }} />
                  <h4 style={{ fontSize: 17, fontWeight: 700, color: C.text, marginBottom: 6 }}>{m.mode} Mode</h4>
                  <span style={{ display: 'inline-block', fontSize: 11, fontWeight: 600, color: C.wine, background: C.wineBg, padding: '3px 10px', borderRadius: 100, marginBottom: 12 }}>{m.tag}</span>
                  <p style={{ fontSize: 14.5, color: C.textSec, lineHeight: 1.65 }}>{m.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>

          {/* Trust callout */}
          <Reveal>
            <div style={{
              maxWidth: 680, margin: '0 auto', padding: '24px 28px', borderRadius: 16,
              background: C.card, border: `1px solid ${C.border}`,
              boxShadow: '0 4px 24px rgba(0,0,0,0.03)',
            }}>
              <p style={{ fontSize: 15, color: C.textSec, lineHeight: 1.7, textAlign: 'center' }}>
                <strong style={{ color: C.text }}>Sunny only answers what she&rsquo;s confident about.</strong> She checks your actual inventory, real event schedule, and live queue — never makes things up. And she always escalates sensitive conversations to you.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ═══════ SECTION 3: MARKETING ON AUTOPILOT ═══════ */}
      <section style={{ padding: '100px 24px', background: C.bg }}>
        <div className="crm-container">
          <Reveal style={{ textAlign: 'center', maxWidth: 680, margin: '0 auto 56px' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 14px', borderRadius: 100, background: C.wineBg, border: `1px solid ${C.wineBorder}`, fontSize: 12, fontWeight: 700, color: C.wine, marginBottom: 20, letterSpacing: 0.5, textTransform: 'uppercase' }}>
              Automation
            </div>
            <h2 className="serif" style={{ fontSize: 'clamp(1.8rem, 3vw, 2.4rem)', fontWeight: 400, lineHeight: 1.2, marginBottom: 18 }}>
              Marketing on <em style={{ fontStyle: 'italic', color: C.wine }}>Autopilot</em>
            </h2>
            <p style={{ fontSize: 17, color: C.textSec, lineHeight: 1.75 }}>
              Set it up once. Watch your client relationships grow while you focus on making beautiful jewelry.
            </p>
          </Reveal>

          <div className="crm-grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20, maxWidth: 880, margin: '0 auto' }}>
            {[
              { icon: '&#128140;', title: 'Aftercare Sequences', desc: 'Automatic care instructions, then a check-in, then a rebooking nudge. The perfect follow-up, every time.' },
              { icon: '&#127874;', title: 'Birthday Messages', desc: 'Happy birthday texts that send themselves — with an optional special offer to get them back in your chair.' },
              { icon: '&#128276;', title: 'Win-Back Campaigns', desc: 'Automatically re-engage clients who haven\'t visited in 60, 90, or 120 days with personalized outreach.' },
              { icon: '&#127793;', title: 'New Client Nurture', desc: 'Welcome sequences that turn first-timers into regulars with perfectly timed touchpoints.' },
              { icon: '&#128227;', title: 'One-Tap Broadcasts', desc: 'Message your VIP list, all event attendees, or a custom segment — in one tap.' },
              { icon: '&#9201;', title: 'Event Mode Auto-Reply', desc: 'Hands full at an event? Turn on auto-reply and Sunny handles incoming texts until you\'re done.' },
            ].map((item, i) => (
              <Reveal key={i} delay={i * 0.06}>
                <div style={{
                  padding: '28px 24px', borderRadius: 16, background: C.card,
                  border: `1px solid ${C.border}`, height: '100%',
                }}>
                  <div dangerouslySetInnerHTML={{ __html: item.icon }} style={{ fontSize: 28, marginBottom: 14 }} />
                  <h3 style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 8 }}>{item.title}</h3>
                  <p style={{ fontSize: 14.5, color: C.textSec, lineHeight: 1.65 }}>{item.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════ SECTION 4: EVERYTHING YOU NEED ═══════ */}
      <section style={{ padding: '100px 24px', background: C.bgDeep }}>
        <div className="crm-container">
          <Reveal style={{ textAlign: 'center', maxWidth: 680, margin: '0 auto 56px' }}>
            <h2 className="serif" style={{ fontSize: 'clamp(1.8rem, 3vw, 2.4rem)', fontWeight: 400, lineHeight: 1.2, marginBottom: 18 }}>
              Everything You Need. <em style={{ fontStyle: 'italic', color: C.wine }}>Nothing You Don&rsquo;t.</em>
            </h2>
          </Reveal>

          <div className="crm-grid-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, maxWidth: 880, margin: '0 auto' }}>
            {[
              'Dedicated business phone number',
              'Two-way SMS conversations',
              'Full conversation history',
              'Automated workflows',
              'Broadcast messaging to segments',
              'Birthday & anniversary automations',
              'Aftercare sequences',
              'Win-back campaigns',
              'AI text responder (Sunny)',
              'Event mode auto-reply',
              'Client insights & tagging',
              'Message templates',
              'Advanced party booking & deposits',
              'Automated party reminders',
              'RSVP tracking & guest management',
              'Host rewards program',
            ].map((feature, i) => (
              <Reveal key={i} delay={i * 0.03}>
                <div style={{
                  padding: '16px 18px', borderRadius: 12, background: C.card,
                  border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 10,
                }}>
                  <span style={{ color: C.wine, fontSize: 15, flexShrink: 0 }}>&#10003;</span>
                  <span style={{ fontSize: 14, color: C.text, fontWeight: 500 }}>{feature}</span>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════ SECTION 5: WHAT THIS REPLACES ═══════ */}
      <section style={{ padding: '100px 24px', background: C.bg }}>
        <div className="crm-container" style={{ maxWidth: 780, margin: '0 auto' }}>
          <Reveal style={{ textAlign: 'center', marginBottom: 48 }}>
            <h2 className="serif" style={{ fontSize: 'clamp(1.8rem, 3vw, 2.4rem)', fontWeight: 400, lineHeight: 1.2, marginBottom: 18 }}>
              What This <em style={{ fontStyle: 'italic', color: C.wine }}>Replaces</em>
            </h2>
            <p style={{ fontSize: 17, color: C.textSec, lineHeight: 1.75 }}>
              One platform instead of six. Built specifically for permanent jewelry artists.
            </p>
          </Reveal>

          <Reveal>
            <div style={{ borderRadius: 16, overflow: 'hidden', border: `1px solid ${C.border}` }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 15 }}>
                <thead>
                  <tr style={{ background: C.bgDeep }}>
                    <th style={{ padding: '14px 20px', textAlign: 'left', fontWeight: 600, color: C.text }}>Tool</th>
                    <th style={{ padding: '14px 20px', textAlign: 'center', fontWeight: 600, color: C.textSec }}>Separate Cost</th>
                    <th style={{ padding: '14px 20px', textAlign: 'center', fontWeight: 600, color: C.wine }}>Sunstone CRM</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['Business phone (Google Voice, Grasshopper)', '$10–30/mo'],
                    ['SMS marketing (SimpleTexting, SlickText)', '$39–249/mo'],
                    ['CRM (HubSpot, Podium)', '$50–399/mo'],
                    ['Marketing automation (GoHighLevel)', '$97–297/mo'],
                    ['Party booking & RSVP tools', '$30–100/mo'],
                    ['AI assistant', '$$'],
                  ].map(([tool, cost], i) => (
                    <tr key={i} style={{ borderTop: `1px solid ${C.borderLight}` }}>
                      <td style={{ padding: '12px 20px', color: C.textSec }}>{tool}</td>
                      <td style={{ padding: '12px 20px', textAlign: 'center', color: C.textMuted, textDecoration: 'line-through' }}>{cost}</td>
                      <td style={{ padding: '12px 20px', textAlign: 'center', color: C.wine, fontWeight: 600 }}>Included</td>
                    </tr>
                  ))}
                  <tr style={{ borderTop: `2px solid ${C.border}`, background: C.bgDeep }}>
                    <td style={{ padding: '14px 20px', fontWeight: 700, color: C.text }}>Total if bought separately</td>
                    <td style={{ padding: '14px 20px', textAlign: 'center', fontWeight: 700, color: C.textSec }}>$230–1,000/mo</td>
                    <td style={{ padding: '14px 20px', textAlign: 'center' }}>
                      <span className="serif" style={{ fontSize: 22, fontWeight: 600, color: C.wine }}>$69</span>
                      <span style={{ color: C.textSec, fontSize: 14 }}>/mo</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ═══════ SECTION 6: PRICING ═══════ */}
      <section id="pricing" style={{ padding: '100px 24px', background: C.dark }}>
        <div className="crm-container" style={{ textAlign: 'center', maxWidth: 680, margin: '0 auto' }}>
          <Reveal>
            <h2 className="serif" style={{ fontSize: 'clamp(1.8rem, 3.5vw, 2.6rem)', fontWeight: 400, lineHeight: 1.2, color: C.darkText, marginBottom: 16 }}>
              <span style={{ color: C.gold }}>$69</span>/month
            </h2>
            <p style={{ fontSize: 18, color: C.darkMuted, lineHeight: 1.7, marginBottom: 12 }}>
              Add to any Sunstone Studio plan.
            </p>
            <p style={{ fontSize: 15, color: C.darkMuted, lineHeight: 1.7, marginBottom: 40 }}>
              Included free in your 60-day trial. Most artists never turn it off.
            </p>
          </Reveal>
          <Reveal delay={0.12}>
            <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button onClick={handleCta} disabled={checkingOut} style={{
                padding: '16px 36px', borderRadius: 12, background: C.wine, color: '#fff',
                fontSize: 17, fontWeight: 600, border: 'none', cursor: checkingOut ? 'wait' : 'pointer',
                boxShadow: '0 4px 24px rgba(107,41,66,0.3)',
                opacity: checkingOut ? 0.7 : 1,
              }}>
                {checkingOut ? 'Loading...' : ctaConfig.label}
              </button>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ═══════ SECTION 7: FAQ ═══════ */}
      <section id="faq" style={{ padding: '100px 24px', background: C.bg }}>
        <div className="crm-container" style={{ maxWidth: 720, margin: '0 auto' }}>
          <Reveal style={{ textAlign: 'center', marginBottom: 48 }}>
            <h2 className="serif" style={{ fontSize: 'clamp(1.8rem, 3vw, 2.4rem)', fontWeight: 400, lineHeight: 1.2 }}>
              Frequently Asked <em style={{ fontStyle: 'italic', color: C.wine }}>Questions</em>
            </h2>
          </Reveal>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {[
              {
                q: 'What if Sunny says something wrong?',
                a: 'She only answers from your real data — your actual inventory, real event schedule, and live queue positions. If she\'s unsure about something, she escalates it to you instead of guessing. You can review every message she sends in your conversation history.',
              },
              {
                q: 'Can I see what Sunny texted?',
                a: 'Every AI-generated message is clearly marked in your conversation history. Full transparency — you always know exactly what was sent.',
              },
              {
                q: 'What happens to my number if I cancel?',
                a: 'Your number is held for 30 days. Reactivate and pick up exactly where you left off. Your full conversation history is never deleted.',
              },
              {
                q: 'Do my clients know they\'re texting AI?',
                a: 'Messages come from your business number. Sunny\'s tone matches a friendly business owner — warm, professional, and helpful. You can add a disclosure in your greeting if you prefer full transparency.',
              },
              {
                q: 'What if I want to handle a conversation myself?',
                a: 'Jump in anytime. Just start typing and Sunny steps back. You\'re always in control. You can also switch between Auto, Suggest, and Off modes with one tap from the Messages page.',
              },
              {
                q: 'Is there a contract?',
                a: 'No contracts, no commitments. Cancel anytime. Your CRM trial is included free for 60 days, and after that it\'s a simple $69/month add-on that you can turn on or off whenever you want.',
              },
            ].map((faq, i) => (
              <Reveal key={i} delay={i * 0.05}>
                <FAQItem question={faq.q} answer={faq.a} />
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════ FINAL CTA ═══════ */}
      <section style={{ padding: '80px 24px', background: C.bgDeep, borderTop: `1px solid ${C.border}` }}>
        <div className="crm-container" style={{ textAlign: 'center' }}>
          <Reveal>
            <h2 className="serif" style={{ fontSize: 'clamp(1.6rem, 3vw, 2.2rem)', fontWeight: 400, lineHeight: 1.25, marginBottom: 16 }}>
              Ready to let <em style={{ fontStyle: 'italic', color: C.wine }}>Sunny</em> handle your texts?
            </h2>
            <p style={{ fontSize: 16, color: C.textSec, marginBottom: 32 }}>
              Try the full CRM free for 60 days. No credit card required to start.
            </p>
            <button onClick={handleCta} disabled={checkingOut} style={{
              display: 'inline-block', padding: '16px 36px', borderRadius: 12,
              background: C.wine, color: '#fff', fontSize: 17, fontWeight: 600,
              border: 'none', cursor: checkingOut ? 'wait' : 'pointer',
              boxShadow: `0 4px 20px ${C.wineBg}`,
              opacity: checkingOut ? 0.7 : 1,
            }}>
              {checkingOut ? 'Loading...' : ctaConfig.label}
            </button>
          </Reveal>
        </div>
      </section>

      {/* ═══════ FOOTER ═══════ */}
      <footer style={{ padding: '32px 24px', borderTop: `1px solid ${C.border}`, textAlign: 'center' }}>
        <p style={{ fontSize: 13, color: C.textMuted }}>
          &copy; {new Date().getFullYear()} Sunstone Studio &middot; <Link href="/" style={{ color: C.textMuted, textDecoration: 'underline' }}>Home</Link> &middot; <Link href="/privacy" style={{ color: C.textMuted, textDecoration: 'underline' }}>Privacy</Link> &middot; <Link href="/terms" style={{ color: C.textMuted, textDecoration: 'underline' }}>Terms</Link>
        </p>
      </footer>
    </div>
  )
}

/* ─── FAQ Accordion ─── */
function FAQItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{
      borderRadius: 14, border: `1px solid ${C.border}`, background: C.card, overflow: 'hidden',
      transition: 'box-shadow 0.2s',
      boxShadow: open ? '0 4px 20px rgba(0,0,0,0.04)' : 'none',
    }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 22px', background: 'none', border: 'none', cursor: 'pointer',
          textAlign: 'left', gap: 16, minHeight: 56,
        }}
      >
        <span style={{ fontSize: 15.5, fontWeight: 600, color: C.text, lineHeight: 1.4 }}>{question}</span>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{
          flexShrink: 0, transition: 'transform 0.25s',
          transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
        }}>
          <path d="M6 9l6 6 6-6" stroke={C.textMuted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <div style={{
        maxHeight: open ? 300 : 0, overflow: 'hidden',
        transition: 'max-height 0.3s ease, padding 0.3s ease',
        padding: open ? '0 22px 18px' : '0 22px',
      }}>
        <p style={{ fontSize: 14.5, color: C.textSec, lineHeight: 1.7 }}>{answer}</p>
      </div>
    </div>
  )
}
