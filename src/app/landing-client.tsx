'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Image from 'next/image'
import './marketing-fonts.css'

/* ═══════════════════════════════════════════════════════════════
   SUNSTONE STUDIO — LANDING PAGE
   Brand: The Picnic Club + Montserrat, official Sunstone palette
   ═══════════════════════════════════════════════════════════════ */

/* ─── BRAND PALETTE ─── */
const B = {
  petal: '#FBEEEE',
  blackBrown: '#31241B',
  softBrown: '#85625D',
  deepWine: '#7A234A',
  redrock: '#7A234A',
  raspberry: '#B1275E',
  forest: '#1B4F3A',
  taupe: '#BF9F9A',
  cloudyBlue: '#D2E1F0',
  sage: '#DFE0B0',
  pjRose: '#E1598F',
  white: '#ffffff',
}

const FONT = {
  display: "'The Picnic Club', Georgia, serif",
  body: "'Montserrat', -apple-system, BlinkMacSystemFont, sans-serif",
}

/* ─── PRICING DATA (preserved exactly) ─── */
const PRICING = [
  {
    name: 'Starter',
    price: '$99',
    period: '/mo',
    fee: '3% platform fee',
    tagline: 'Everything your team needs to launch',
    popular: false,
    features: [
      'Up to 2 team members',
      'Full POS \u2014 Event & Store Mode',
      'Integrated Stripe payments (QR + text link)',
      'Smart Inventory management',
      'Client database',
      'Digital waivers & QR check-in',
      'Artist Storefront (public booking page)',
      'Private party booking requests',
      'Basic reports',
      'Sunny AI \u2014 5 questions/mo',
      '30-day Pro trial with full CRM',
    ],
  },
  {
    name: 'Pro',
    price: '$169',
    period: '/mo',
    fee: '1.5% platform fee',
    tagline: 'For growing businesses',
    popular: true,
    features: [
      'Everything in Starter, plus:',
      'Unlimited Sunny AI access',
      'Advanced reports & insights',
      'Up to 3 team members',
      'Custom brand themes',
      'Artist Storefront & party booking',
      'Priority support',
      '30-day Pro trial with full CRM',
    ],
  },
  {
    name: 'Business',
    price: '$279',
    period: '/mo',
    fee: 'Zero platform fee',
    tagline: 'For serious operators',
    popular: false,
    features: [
      'Everything in Pro, plus:',
      'Zero platform fee \u2014 you keep 100% of every sale',
      'Unlimited team members',
      'Artist Storefront & party booking',
      'White-glove onboarding',
      'Dedicated support',
      '30-day Pro trial with full CRM',
    ],
  },
]

/* ─── FAQ DATA (preserved exactly) ─── */
const FAQS = [
  {
    q: 'How do customers pay?',
    a: "You build the order in the POS, then tap 'Charge Customer' and choose QR Code or Text Link. A secure Stripe checkout page is created instantly. Your customer scans the QR code with their phone camera or receives a text message with a payment link \u2014 they pay on their own phone. No card reader needed. The POS updates in real time when payment is received.",
  },
  {
    q: 'How does the platform fee work?',
    a: "A small platform fee is deducted from your Stripe payouts \u2014 your customers never see it. They pay exactly what you quote with a clean, professional checkout. On Starter it's 3%, Pro is 1.5%, and the Business plan has zero fee \u2014 you keep 100% of every sale. For example, on a $100 sale with the Starter plan, your customer pays $100 and you receive $97 after the platform fee. The fee covers secure payment processing, instant digital receipts, and automatic transaction tracking.",
  },
  {
    q: 'Can I still use my Square reader?',
    a: "Yes! You can record external payments (cash, Venmo, Square, or any card reader) anytime \u2014 they're logged for bookkeeping with no checkout fee. The built-in Stripe integration just gives you automatic tracking, a professional checkout experience, and no extra hardware to carry.",
  },
  {
    q: 'Do I need a Sunstone welder to use Studio?',
    a: "Sunstone Studio works beautifully for any permanent jewelry artist, regardless of equipment. That said, artists using Sunstone welders get the deepest integration \u2014 Sunny knows your exact equipment inside and out, and our supply catalog is built right in.",
  },
  {
    q: 'Can I use this at events and pop-ups?',
    a: "Event Mode was designed specifically for pop-ups, markets, and festivals. QR code check-in, real-time queue management, digital waivers, and fast checkout \u2014 everything you need to handle a packed event without breaking a sweat.",
  },
  {
    q: 'Is my data secure?',
    a: 'Bank-level security with complete tenant isolation. Your data is encrypted, never shared with third parties, and completely separated from every other business on the platform.',
  },
  {
    q: 'Can my team use it too?',
    a: 'Absolutely. Add team members with custom permission levels \u2014 control who can run the POS, view reports, manage inventory, access client data, and more.',
  },
  {
    q: 'What makes Sunny different from ChatGPT?',
    a: "Sunny isn't a general chatbot \u2014 she's trained specifically on permanent jewelry expertise and connected to YOUR business data. She sees your inventory, knows your clients, remembers your events, and can actually take action \u2014 like sending a text to your clients or planning your next event.",
  },
  {
    q: 'Why not just use Square POS and a spreadsheet?',
    a: "You absolutely can \u2014 most artists start there. But Square doesn't know what a jump ring is, can't track chain by the inch, won't auto-deduct inventory when you sell, can't manage an event queue, and definitely can't give you AI-powered business coaching at 2am. Studio replaces 5+ tools with one purpose-built platform \u2014 and with built-in Stripe payments, you don't even need a card reader.",
  },
  {
    q: 'What happens after my 30-day trial?',
    a: 'You pick your plan (Starter $99, Pro $169, or Business $279). CRM features (workflows, broadcasts, dedicated number, aftercare) become a $69/mo add-on. Your client data and conversation history are preserved indefinitely \u2014 just reactivate CRM to pick up where you left off.',
  },
  {
    q: "What's included in the CRM?",
    a: 'Your own dedicated business phone number, two-way SMS conversations, automated aftercare sequences, broadcast messaging, client workflows, birthday automations, message templates, advanced party booking (deposits, RSVP tracking, automated reminders, host rewards), and client intelligence. $69/mo add-on to any plan \u2014 all included free during your 30-day Pro trial. Basic party booking and your artist storefront are included free on every plan.',
  },
]

/* ─── HOOKS ─── */
function useReveal(threshold = 0.12) {
  const ref = useRef<HTMLDivElement>(null)
  const [vis, setVis] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const o = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setVis(true)
          o.disconnect()
        }
      },
      { threshold, rootMargin: '0px 0px -30px 0px' }
    )
    o.observe(el)
    return () => o.disconnect()
  }, [threshold])
  return [ref, vis] as const
}

function Reveal({
  children,
  delay = 0,
  y = 36,
  style = {},
}: {
  children: React.ReactNode
  delay?: number
  y?: number
  style?: React.CSSProperties
}) {
  const [ref, vis] = useReveal()
  return (
    <div
      ref={ref}
      style={{
        ...style,
        opacity: vis ? 1 : 0,
        transform: vis ? 'none' : `translateY(${y}px)`,
        transition: `opacity 0.75s ease ${delay}s, transform 0.75s ease ${delay}s`,
      }}
    >
      {children}
    </div>
  )
}

/* ─── SUNNY CHAT WIDGET ─── */
function SunnyChat() {
  const [open, setOpen] = useState(false)
  const [msgs, setMsgs] = useState([
    {
      role: 'assistant',
      text: "Hey! \uD83D\uDC4B I'm Sunny, your PJ business mentor. Ask me anything about Sunstone Studio \u2014 or test me with a real business question!",
    },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null)
  const sendingPendingRef = useRef(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [msgs, loading])

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus()
  }, [open])

  useEffect(() => {
    const handler = (e: Event) => {
      const question = (e as CustomEvent).detail
      if (question) {
        setOpen(true)
        setPendingQuestion(question)
      }
    }
    window.addEventListener('sunny-ask', handler)
    return () => window.removeEventListener('sunny-ask', handler)
  }, [])

  useEffect(() => {
    if (open && pendingQuestion && !loading && !sendingPendingRef.current) {
      sendingPendingRef.current = true
      const q = pendingQuestion
      setPendingQuestion(null)
      setInput('')
      const newMsgs = [...msgs, { role: 'user', text: q }]
      setMsgs(newMsgs)
      setLoading(true)
      fetch('/api/sunny-demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMsgs }),
      })
        .then((res) => res.json())
        .then((data) => setMsgs((prev) => [...prev, { role: 'assistant', text: data.reply }]))
        .catch(() => setMsgs((prev) => [...prev, { role: 'assistant', text: 'Oops \u2014 something went wrong. Try again in a moment!' }]))
        .finally(() => {
          setLoading(false)
          sendingPendingRef.current = false
        })
    }
  }, [open, pendingQuestion, loading, msgs])

  const send = useCallback(async () => {
    if (!input.trim() || loading) return
    const userMsg = input.trim()
    setInput('')
    const newMsgs = [...msgs, { role: 'user', text: userMsg }]
    setMsgs(newMsgs)
    setLoading(true)

    try {
      const res = await fetch('/api/sunny-demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMsgs }),
      })
      const data = await res.json()
      setMsgs((prev) => [...prev, { role: 'assistant', text: data.reply }])
    } catch {
      setMsgs((prev) => [
        ...prev,
        { role: 'assistant', text: 'Oops \u2014 something went wrong. Try again in a moment!' },
      ])
    }
    setLoading(false)
  }, [input, loading, msgs])

  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        aria-label={open ? 'Close Sunny chat' : 'Open Sunny chat'}
        style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          zIndex: 1000,
          width: 60,
          height: 60,
          borderRadius: '50%',
          background: `linear-gradient(135deg, ${B.deepWine}, ${B.raspberry})`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          border: 'none',
          boxShadow: '0 8px 32px rgba(122,35,74,0.4)',
          transition: 'transform 0.25s',
          transform: open ? 'rotate(45deg) scale(0.9)' : 'scale(1)',
        }}
      >
        <span style={{ fontSize: 26, color: '#fff' }}>{open ? '+' : '\u2726'}</span>
      </button>

      {!open && (
        <button
          onClick={() => setOpen(true)}
          style={{
            position: 'fixed',
            bottom: 36,
            right: 96,
            zIndex: 1000,
            background: '#fff',
            padding: '8px 18px',
            borderRadius: 12,
            boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
            cursor: 'pointer',
            fontSize: 13.5,
            fontWeight: 600,
            color: B.blackBrown,
            border: `1px solid ${B.taupe}`,
            fontFamily: FONT.body,
          }}
        >
          Ask Sunny {'\u2726'}
        </button>
      )}

      {open && (
        <div
          style={{
            position: 'fixed',
            bottom: 96,
            right: 24,
            zIndex: 1000,
            width: 390,
            maxWidth: 'calc(100vw - 48px)',
            height: 520,
            maxHeight: 'calc(100vh - 140px)',
            background: '#fff',
            borderRadius: 22,
            boxShadow: '0 24px 80px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.05)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            animation: 'sunnySlideUp 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)',
            fontFamily: FONT.body,
          }}
        >
          <div
            style={{
              padding: '18px 22px',
              borderBottom: `1px solid ${B.taupe}40`,
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              background: B.petal,
            }}
          >
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: '50%',
                background: `linear-gradient(135deg, ${B.redrock}, ${B.raspberry})`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 22,
                color: '#fff',
                fontWeight: 700,
              }}
            >
              {'\u2726'}
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, color: B.blackBrown }}>Sunny</div>
              <div style={{ fontSize: 11.5, color: B.softBrown }}>Your PJ Business Mentor</div>
            </div>
          </div>

          <div
            ref={scrollRef}
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '18px 16px 10px',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
            }}
          >
            {msgs.map((m, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div
                  style={{
                    maxWidth: '84%',
                    padding: '11px 15px',
                    borderRadius: 16,
                    fontSize: 13.5,
                    lineHeight: 1.6,
                    ...(m.role === 'user'
                      ? {
                          background: `linear-gradient(135deg, ${B.deepWine}, ${B.raspberry})`,
                          color: '#fff',
                          borderBottomRightRadius: 4,
                        }
                      : {
                          background: B.petal,
                          color: B.blackBrown,
                          border: `1px solid ${B.taupe}40`,
                          borderBottomLeftRadius: 4,
                        }),
                  }}
                >
                  {m.text}
                </div>
              </div>
            ))}
            {loading && (
              <div style={{ display: 'flex' }}>
                <div
                  style={{
                    padding: '11px 20px',
                    borderRadius: 16,
                    borderBottomLeftRadius: 4,
                    background: B.petal,
                    border: `1px solid ${B.taupe}40`,
                    display: 'flex',
                    gap: 5,
                  }}
                >
                  <span className="sunny-dot" style={{ animationDelay: '0s' }} />
                  <span className="sunny-dot" style={{ animationDelay: '0.15s' }} />
                  <span className="sunny-dot" style={{ animationDelay: '0.3s' }} />
                </div>
              </div>
            )}
          </div>

          <div style={{ padding: '14px 16px', borderTop: `1px solid ${B.taupe}40`, display: 'flex', gap: 10 }}>
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && send()}
              placeholder="Ask about Sunstone Studio..."
              style={{
                flex: 1,
                padding: '11px 16px',
                borderRadius: 12,
                border: `1.5px solid ${B.taupe}40`,
                fontSize: 14,
                outline: 'none',
                fontFamily: 'inherit',
                background: B.petal,
              }}
            />
            <button
              onClick={send}
              disabled={loading || !input.trim()}
              style={{
                padding: '11px 18px',
                borderRadius: 12,
                border: 'none',
                background: input.trim() ? `linear-gradient(135deg, ${B.deepWine}, ${B.raspberry})` : `${B.taupe}30`,
                color: input.trim() ? '#fff' : B.softBrown,
                fontWeight: 700,
                fontSize: 16,
                cursor: input.trim() ? 'pointer' : 'default',
                transition: 'all 0.25s',
                fontFamily: 'inherit',
              }}
            >
              {'\u2192'}
            </button>
          </div>
        </div>
      )}
    </>
  )
}

/* ─── FAQ ACCORDION ─── */
function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ borderBottom: `1px solid ${B.taupe}40` }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: '100%',
          padding: '20px 0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
          fontFamily: FONT.body,
        }}
      >
        <span style={{ fontSize: 15, fontWeight: 600, color: B.blackBrown }}>{q}</span>
        <span
          style={{
            fontSize: 20,
            color: B.softBrown,
            transform: open ? 'rotate(45deg)' : 'none',
            transition: 'transform 0.3s',
            flexShrink: 0,
          }}
        >
          +
        </span>
      </button>
      <div
        style={{
          maxHeight: open ? 500 : 0,
          overflow: 'hidden',
          transition: 'max-height 0.4s ease',
        }}
      >
        <p style={{ fontSize: 14, lineHeight: 1.7, color: B.softBrown, paddingBottom: 20 }}>{a}</p>
      </div>
    </div>
  )
}

/* ─── MAIN LANDING PAGE ─── */
export default function LandingPageClient() {
  const [navSolid, setNavSolid] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setNavSolid(window.scrollY > 40)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const scrollTo = (id: string) => {
    const el = document.getElementById(id)
    if (!el) return
    const y = el.getBoundingClientRect().top + window.scrollY - 72
    window.scrollTo({ top: y, behavior: 'smooth' })
  }

  const ctaStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '14px 32px',
    borderRadius: 10,
    fontSize: 15,
    fontWeight: 600,
    fontFamily: FONT.body,
    cursor: 'pointer',
    transition: 'all 0.25s',
    border: 'none',
    minHeight: 48,
    textDecoration: 'none',
  }

  const wrap: React.CSSProperties = {
    maxWidth: 1200,
    margin: '0 auto',
    padding: '0 24px',
  }

  return (
    <div style={{ fontFamily: FONT.body, color: B.blackBrown, background: B.white }}>
      <style>{`
        @keyframes sunnySlideUp {
          from { opacity: 0; transform: translateY(24px) scale(0.95); }
          to { opacity: 1; transform: none; }
        }
        .sunny-dot {
          width: 7px; height: 7px; border-radius: 50%;
          background: ${B.softBrown};
          animation: sunnyBounce 1.2s ease-in-out infinite;
        }
        @keyframes sunnyBounce {
          0%, 80%, 100% { transform: translateY(0); }
          40% { transform: translateY(-6px); }
        }
        html { scroll-behavior: smooth; }
      `}</style>

      {/* ═══════ STICKY NAV ═══════ */}
      <nav
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 100,
          padding: '14px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: navSolid ? 'rgba(250,247,240,0.95)' : 'transparent',
          backdropFilter: navSolid ? 'blur(12px)' : 'none',
          borderBottom: navSolid ? `1px solid ${B.taupe}30` : 'none',
          transition: 'all 0.3s',
        }}
      >
        <div style={{ ...wrap, display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Image src="/landing/sunstone-logo.webp" alt="Sunstone Studio" width={34} height={34} style={{ borderRadius: 8 }} />
            <span style={{ fontFamily: FONT.display, fontWeight: 700, fontSize: 18, color: B.blackBrown }}>Sunstone Studio</span>
          </div>
          {/* Desktop nav */}
          <div className="nav-links nav-desktop" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <button onClick={() => scrollTo('features')} className="nav-link" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500, color: B.softBrown, fontFamily: FONT.body, padding: 0 }}>Features</button>
            <button onClick={() => scrollTo('pricing')} className="nav-link" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500, color: B.softBrown, fontFamily: FONT.body, padding: 0 }}>Pricing</button>
            <button onClick={() => scrollTo('faq')} className="nav-link" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500, color: B.softBrown, fontFamily: FONT.body, padding: 0 }}>FAQ</button>
            <a href="/auth/login" style={{ fontSize: 13, fontWeight: 500, color: B.softBrown, textDecoration: 'none', fontFamily: FONT.body }}>Log In</a>
            <a href="/auth/signup" className="nav-cta" style={{ ...ctaStyle, padding: '10px 22px', fontSize: 13, background: B.redrock, color: '#fff' }}>Start Free</a>
          </div>
          {/* Mobile hamburger */}
          <button
            className="nav-hamburger"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 8, display: 'none' }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={B.blackBrown} strokeWidth={2} strokeLinecap="round">
              {mobileMenuOpen
                ? <><line x1="6" y1="6" x2="18" y2="18" /><line x1="6" y1="18" x2="18" y2="6" /></>
                : <><line x1="3" y1="7" x2="21" y2="7" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="17" x2="21" y2="17" /></>
              }
            </svg>
          </button>
        </div>
      </nav>

      <style>{`
        .nav-desktop { display: none !important; }
        .nav-hamburger { display: flex !important; }
        @media (min-width: 768px) {
          .nav-desktop { display: flex !important; gap: 24px !important; }
          .nav-hamburger { display: none !important; }
          .nav-link { font-size: 13px !important; }
          .nav-cta { padding: 10px 22px !important; font-size: 13px !important; }
        }
      `}</style>

      {/* ═══════ MOBILE MENU ═══════ */}
      {mobileMenuOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 99,
          background: 'rgba(250,247,240,0.98)', backdropFilter: 'blur(12px)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 28,
          fontFamily: FONT.body,
        }}>
          <button
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Close menu"
            style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', cursor: 'pointer', padding: 8 }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={B.blackBrown} strokeWidth={2} strokeLinecap="round">
              <line x1="6" y1="6" x2="18" y2="18" /><line x1="6" y1="18" x2="18" y2="6" />
            </svg>
          </button>
          {[
            { label: 'Features', action: () => { scrollTo('features'); setMobileMenuOpen(false); } },
            { label: 'Pricing', action: () => { scrollTo('pricing'); setMobileMenuOpen(false); } },
            { label: 'FAQ', action: () => { scrollTo('faq'); setMobileMenuOpen(false); } },
          ].map((item) => (
            <button
              key={item.label}
              onClick={item.action}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, fontWeight: 500, color: B.blackBrown, fontFamily: FONT.body }}
            >
              {item.label}
            </button>
          ))}
          <a href="/auth/login" style={{ fontSize: 20, fontWeight: 500, color: B.softBrown, textDecoration: 'none', fontFamily: FONT.body }}>Log In</a>
          <a href="/auth/signup" style={{ ...ctaStyle, padding: '14px 40px', fontSize: 16, background: B.redrock, color: '#fff' }}>Start Free</a>
        </div>
      )}

      {/* ═══════ SECTION 1: HERO ═══════ */}
      <section style={{ background: '#FFFFFF', paddingTop: 120, paddingBottom: 60 }}>
        <div style={wrap}>
          <style>{`
            .hero-layout { display: flex; flex-direction: column; align-items: center; text-align: center; }
            .hero-text { max-width: 560px; }
            .hero-images { width: 95%; margin-top: 40px; }
            .hero-dashboard-wrap { border-radius: 12px; overflow: hidden; box-shadow: 0 24px 80px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.04); }
            .hero-trust { justify-content: center; }
            @media (min-width: 1024px) {
              .hero-layout { flex-direction: row; text-align: left; gap: 48px; align-items: center; }
              .hero-text { flex: 0 0 42%; min-width: 0; max-width: none; }
              .hero-images { flex: 0 0 56%; min-width: 0; width: auto; margin-top: 0; }
              .hero-ctas { justify-content: flex-start !important; }
              .hero-subline { margin-left: 0 !important; margin-right: 0 !important; }
              .hero-trust { justify-content: flex-start; }
            }
          `}</style>

          {/* ─── Pill: centered above the split layout ─── */}
          <Reveal>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 32 }}>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '8px 18px',
                  borderRadius: 100,
                  background: B.sage,
                }}
              >
                <span style={{ color: B.pjRose, fontSize: 12 }}>{'\u2726'}</span>
                <span style={{ fontSize: 12, fontWeight: 500, color: B.blackBrown, fontFamily: FONT.body }}>
                  From the Pioneers of Permanent Jewelry
                </span>
              </div>
            </div>
          </Reveal>

          <div className="hero-layout">
            <div className="hero-text">
              <Reveal delay={0.1}>
                <h1 style={{ fontFamily: FONT.display, margin: 0, lineHeight: 1.15 }}>
                  <span style={{ display: 'block', fontSize: 'clamp(1.875rem, 4.5vw, 3.375rem)', fontWeight: 700, color: B.blackBrown }}>
                    Grow Your PJ Business
                  </span>
                  <span style={{ display: 'block', fontSize: 'clamp(1.875rem, 4.5vw, 3.375rem)', fontWeight: 700, color: B.blackBrown }}>
                    with Confidence.
                  </span>
                </h1>
              </Reveal>

              <Reveal delay={0.2}>
                <p className="hero-subline" style={{ fontSize: 16, fontWeight: 500, color: B.softBrown, maxWidth: 520, margin: '24px auto 0', lineHeight: 1.6, fontFamily: FONT.body }}>
                  The all-in-one app for POS, inventory, clients, and AI-powered business intelligence &mdash; built by Sunstone for permanent jewelry artists.
                </p>
              </Reveal>

              <Reveal delay={0.3}>
                <div className="hero-ctas" style={{ display: 'flex', gap: 14, justifyContent: 'center', marginTop: 32, flexWrap: 'wrap' }}>
                  <a href="/auth/signup" style={{ ...ctaStyle, background: B.redrock, color: '#fff' }}>
                    Start Your Free Trial
                  </a>
                  <button onClick={() => scrollTo('features')} style={{ ...ctaStyle, background: 'transparent', color: B.blackBrown, border: `2px solid ${B.blackBrown}` }}>
                    See All Features
                  </button>
                </div>
              </Reveal>

              <Reveal delay={0.35}>
                <div className="hero-trust" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 16px', marginTop: 20, fontFamily: FONT.body }}>
                  {['30-Day Free Pro Trial', 'No Credit Card Required', 'Cancel Anytime'].map((text) => (
                    <span key={text} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: B.softBrown }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 13l4 4L19 7" />
                      </svg>
                      {text}
                    </span>
                  ))}
                </div>
              </Reveal>
            </div>

            <Reveal delay={0.4}>
              <div className="hero-images">
                <div className="hero-dashboard-wrap">
                  <Image
                    src="/landing/hero-dashboard.webp"
                    alt="Sunstone Studio dashboard showing AI-powered business insights and revenue overview"
                    width={2160}
                    height={1419}
                    priority
                    style={{ width: '100%', height: 'auto', display: 'block' }}
                  />
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ─── PHOTO BREAK: Hero Human Photo ─── */}
      <section style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px' }}>
          <Reveal>
            <style>{`
              .hero-photo-break { height: 350px; }
              @media (min-width: 768px) { .hero-photo-break { height: 550px; } }
            `}</style>
            <div className="hero-photo-break" style={{ borderRadius: 12, overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
              <Image
                src="/landing/hero-lifestyle-landscape.webp"
                alt="Permanent jewelry artist managing her business with Sunstone Studio"
                width={4200}
                height={2800}
                style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center center', display: 'block' }}
              />
            </div>
          </Reveal>
        </div>
      </section>

      {/* ═══════ SECTION 2: TRUST BAR ═══════ */}
      <section style={{ background: B.white, borderTop: `1px solid ${B.taupe}40`, borderBottom: `1px solid ${B.taupe}40`, padding: '18px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          <Image src="/landing/sunstone-logo.webp" alt="Sunstone" width={22} height={22} style={{ borderRadius: 4 }} />
          <span style={{ fontSize: 13, color: B.softBrown, fontFamily: FONT.body }}>
            Trusted by PJ artists nationwide &middot; Powered by Sunstone Permanent Jewelry
          </span>
        </div>
      </section>

      {/* ═══════ SECTION 3: THE TRANSFORMATION ═══════ */}
      <section style={{ background: B.white, padding: '80px 0' }}>
        <div style={wrap}>
          <Reveal>
            <h2 style={{ fontFamily: FONT.display, fontWeight: 400, fontSize: 'clamp(1.8rem, 4vw, 2.8rem)', color: B.deepWine, textAlign: 'center', marginBottom: 56 }}>
              What changes when you have the right platform?
            </h2>
          </Reveal>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 40 }}>
            {[
              {
                icon: (
                  <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke={B.deepWine} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                  </svg>
                ),
                title: 'You make more money',
                body: 'See your real profits, track every sale, and spot the upsells you\u2019re missing. Artists using Sunstone Studio consistently grow their average ticket.',
              },
              {
                icon: (
                  <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke={B.deepWine} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                ),
                title: 'You stop scrambling',
                body: 'Inventory, waivers, queue, payments \u2014 it\u2019s all handled. Show up to your next event calm and prepared instead of stressed and guessing.',
              },
              {
                icon: (
                  <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke={B.deepWine} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                  </svg>
                ),
                title: 'You look like a pro',
                body: 'Your own branded storefront, polished receipts, and a seamless client experience. Customers remember how you made them feel.',
              },
            ].map((item, i) => (
              <Reveal key={i} delay={i * 0.12}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
                    <div style={{ width: 72, height: 72, borderRadius: '50%', background: `rgba(122,35,74,0.08)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {item.icon}
                    </div>
                  </div>
                  <h3 style={{ fontFamily: FONT.display, fontWeight: 400, fontSize: 22, color: B.blackBrown, marginBottom: 12 }}>{item.title}</h3>
                  <p style={{ fontSize: 15, lineHeight: 1.7, color: B.softBrown }}>{item.body}</p>
                </div>
              </Reveal>
            ))}
          </div>

          <Reveal delay={0.4}>
            <div style={{ textAlign: 'center', marginTop: 48 }}>
              <a href="/auth/signup" style={{ ...ctaStyle, background: B.redrock, color: '#fff' }}>
                Start Free
              </a>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ═══════ SECTION 4: FEATURE SHOWCASE ═══════ */}
      <section id="features" style={{ background: B.petal, padding: '80px 0' }}>
        <div style={wrap}>
          <Reveal>
            <div style={{ textAlign: 'center', marginBottom: 48 }}>
              <h2 style={{ fontFamily: FONT.display, fontSize: 'clamp(1.8rem, 4vw, 2.8rem)', margin: 0, lineHeight: 1.2 }}>
                <span style={{ fontWeight: 400, color: B.blackBrown }}>Everything you need,</span>{' '}
                <span style={{ fontWeight: 400, fontStyle: 'italic', color: B.deepWine }}>nothing you don&rsquo;t.</span>
              </h2>
              <p style={{ fontSize: 16, fontWeight: 500, color: B.softBrown, marginTop: 14, fontFamily: FONT.body }}>
                Built specifically for permanent jewelry &mdash; not adapted from something else.
              </p>
            </div>
          </Reveal>

          <style>{`
            .feature-grid { display: grid; grid-template-columns: 1fr; gap: 20px; }
            @media (min-width: 768px) { .feature-grid { grid-template-columns: repeat(2, 1fr); } }
            @media (min-width: 1100px) { .feature-grid { grid-template-columns: repeat(3, 1fr); } }
          `}</style>
          <div className="feature-grid">
            {[
              {
                img: '/landing/pos-event.webp',
                imgAlt: 'Sunstone Studio POS interface on tablet showing event mode with product selection and cart',
                title: 'Sell anywhere, stress-free',
                body: 'Tap-friendly POS for events and your studio. Tips, discounts, warranties, and multiple payment methods \u2014 without breaking your flow.',
                icon: (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={B.forest} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                    <rect x="4" y="2" width="16" height="20" rx="2" ry="2" /><line x1="12" y1="18" x2="12.01" y2="18" />
                  </svg>
                ),
              },
              {
                img: '/landing/inventory.webp',
                imgAlt: 'Inventory management showing chains tracked by the inch with stock levels and reorder thresholds',
                title: 'Always know what you have',
                body: 'Track every chain by the inch. See what\u2019s selling, what\u2019s low, and when to reorder \u2014 before you run out at an event.',
                icon: (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={B.forest} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                  </svg>
                ),
              },
              {
                img: '/landing/crm-workflows.webp',
                imgAlt: 'Client profile showing purchase history, automated follow-ups, and CRM workflow configuration',
                title: 'Turn one-time buyers into regulars',
                body: 'Every customer remembered. Automated follow-ups, birthday texts, and win-back campaigns that run while you sleep.',
                icon: (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={B.forest} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                  </svg>
                ),
              },
              {
                img: '/landing/sunny-chains.webp',
                imgAlt: 'Sunny AI mentor showing detailed chain knowledge and weld setting recommendations',
                title: 'Your smartest business partner',
                body: 'Ask Sunny anything \u2014 weld settings, pricing strategy, what to bring to your next event. A mentor in your pocket, trained on real Sunstone expertise.',
                icon: (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={B.forest} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                  </svg>
                ),
              },
              {
                img: '/landing/client-profile.webp',
                imgAlt: 'Client profile showing booking history and party RSVPs',
                title: 'Fill your calendar with private parties',
                body: 'Your own booking page with deposits, RSVPs, and guest marketing \u2014 more revenue per hour than any farmers market.',
                icon: (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={B.forest} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /><path d="M21 21v-2a4 4 0 0 0-3-3.87" />
                  </svg>
                ),
              },
              {
                img: '/landing/reports.webp',
                imgAlt: 'Financial reports showing revenue, profit margins, cost breakdown, and event performance comparison',
                title: 'See your real numbers',
                body: 'Revenue, profit, expenses, and cost of goods \u2014 not just what you made, but what you kept. Finally understand your business.',
                icon: (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={B.forest} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
                  </svg>
                ),
              },
            ].map((card, i) => (
              <Reveal key={i} delay={i * 0.08}>
                <div
                  style={{
                    background: B.white,
                    borderRadius: 16,
                    overflow: 'hidden',
                    border: `1px solid ${B.taupe}30`,
                    boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
                    transition: 'box-shadow 0.3s',
                  }}
                >
                  <div style={{ position: 'relative', width: '100%', aspectRatio: '16/10', overflow: 'hidden', background: '#F9F7F4', borderBottom: `1px solid rgba(0,0,0,0.06)`, borderRadius: '16px 16px 0 0' }}>
                    <Image
                      src={card.img}
                      alt={card.imgAlt}
                      fill
                      sizes="(max-width: 768px) 100vw, (max-width: 1100px) 50vw, 400px"
                      style={{ objectFit: 'cover', objectPosition: 'top center' }}
                    />
                  </div>
                  <div style={{ padding: '20px 22px 24px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                      {card.icon}
                      <h3 style={{ fontFamily: FONT.display, fontWeight: 400, fontSize: 18, color: B.blackBrown, margin: 0 }}>{card.title}</h3>
                    </div>
                    <p style={{ fontSize: 14, lineHeight: 1.7, color: B.softBrown, margin: 0 }}>{card.body}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ─── PHOTO BREAK: Welding Scene ─── */}
      <section style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px' }}>
          <Reveal>
            <style>{`
              .weld-scene-break { height: 350px; }
              @media (min-width: 768px) { .weld-scene-break { height: 500px; } }
            `}</style>
            <div className="weld-scene-break" style={{ borderRadius: 12, overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
              <Image
                src="/landing/hero-artist-clients.jpg"
                alt="Permanent jewelry artist welding a bracelet for a client"
                width={4200}
                height={2800}
                loading="lazy"
                style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center center', display: 'block' }}
              />
            </div>
          </Reveal>
        </div>
      </section>

      {/* ═══════ SECTION 5: ARTIST STOREFRONT ═══════ */}
      <section style={{ background: B.white, padding: '80px 0' }}>
        <div style={{ ...wrap, display: 'grid', gridTemplateColumns: '1fr', gap: 48, alignItems: 'center' }}>
          <style>{`@media (min-width: 768px) { .storefront-grid { grid-template-columns: 1fr 1fr !important; } }`}</style>
          <div className="storefront-grid" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 48, alignItems: 'center' }}>
            <Reveal>
              <div>
                <h2 style={{ fontFamily: FONT.display, fontSize: 'clamp(1.8rem, 4vw, 2.5rem)', margin: 0, lineHeight: 1.2 }}>
                  <span style={{ fontWeight: 400, color: B.deepWine }}>Your Own Artist Storefront</span>{' '}
                  <span style={{ fontWeight: 400, fontStyle: 'italic', color: '#1D1D1D' }}>&mdash; included on every plan.</span>
                </h2>
                <p style={{ fontSize: 16, lineHeight: 1.7, color: B.softBrown, marginTop: 20 }}>
                  A beautiful, branded page that shows off your services, pricing, upcoming events, and party booking &mdash; shareable on Instagram, in your email signature, anywhere.
                </p>
                <p style={{ fontSize: 15, fontWeight: 500, color: B.blackBrown, marginTop: 16 }}>
                  No website builder. No monthly hosting fee. Just you, looking like a pro.
                </p>
              </div>
            </Reveal>
            <Reveal delay={0.15}>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <div style={{ maxWidth: 360, borderRadius: 24, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.12)' }}>
                  <Image
                    src="/landing/storefront-mobile.webp"
                    alt="Mobile artist storefront showing services, upcoming events, and party booking form"
                    width={645}
                    height={1577}
                    style={{ width: '100%', height: 'auto', display: 'block' }}
                  />
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ═══════ SECTION 6: SUNNY AI SPOTLIGHT ═══════ */}
      <section style={{ background: B.cloudyBlue, padding: '80px 0' }}>
        <div style={wrap}>
          <Reveal>
            <div style={{ textAlign: 'center', marginBottom: 40 }}>
              <h2 style={{ fontFamily: FONT.display, fontSize: 'clamp(1.8rem, 4vw, 2.8rem)', margin: 0, lineHeight: 1.2 }}>
                <span style={{ fontWeight: 700, color: B.blackBrown }}>Meet Sunny</span>
              </h2>
              <p style={{ fontFamily: FONT.display, fontSize: 'clamp(1.3rem, 3vw, 1.8rem)', fontWeight: 400, fontStyle: 'italic', color: B.deepWine, marginTop: 8 }}>
                Your AI mentor who actually knows permanent jewelry.
              </p>
            </div>
          </Reveal>

          <Reveal delay={0.1}>
            <p style={{ fontSize: 16, lineHeight: 1.7, color: B.blackBrown, textAlign: 'center', maxWidth: 700, margin: '0 auto 36px' }}>
              Other tools give you generic AI. Sunny was trained on 45+ official Sunstone documents &mdash; weld settings, chain science, pricing strategy, customer psychology. She doesn&rsquo;t guess.
            </p>
          </Reveal>

          {/* ─── Phone Mockup Demos ─── */}
          <style>{`
            .sunny-phones { display: flex; flex-direction: column; gap: 24px; align-items: center; margin-bottom: 48px; padding: 8px 0; }
            .sunny-phone { width: 100%; max-width: 380px; }
            @media (min-width: 1024px) { .sunny-phones { flex-direction: row; justify-content: center; } .sunny-phone { flex: 1; min-width: 0; max-width: 320px; } }
          `}</style>
          <Reveal delay={0.2}>
            <div className="sunny-phones">
              {[
                {
                  label: 'Your AI Writing Partner',
                  user: 'A customer asked about pricing. Can you write a quick reply for me?',
                  sunny: "Here's a reply you can send:\n\n\"Hi! Our bracelets start at $75 depending on the style you choose. Everything is custom-fit and permanently welded, with free repairs for life. Want to pick a time to come in?\"\n\nFeel free to adjust the price to match your menu!",
                },
                {
                  label: 'Always Professional',
                  user: "How do I respond if someone wants to book but I'm fully booked this week?",
                  sunny: "Here's a reply:\n\n\"I'm fully booked this week, but I'd love to get you scheduled. I have Tuesday at 3pm or Thursday at 6pm \u2014 which works best for you?\"",
                },
                {
                  label: 'Takes Action For You',
                  user: 'Send a message to all my VIP clients offering 20% off this weekend if they bring a friend.',
                  sunny: "Done! I sent a personalized message to 24 VIP clients with your 20% referral offer for this weekend. \uD83D\uDCAC",
                },
              ].map((demo, i) => (
                <div key={i} className="sunny-phone">
                  <div style={{ textAlign: 'center', marginBottom: 12 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: B.deepWine, fontFamily: FONT.body }}>{demo.label}</span>
                  </div>
                  <div style={{
                    background: '#F9F7F4',
                    borderRadius: 24,
                    border: '1px solid #E5E0D8',
                    boxShadow: '0 8px 30px rgba(0,0,0,0.08)',
                    overflow: 'hidden',
                    padding: '20px 16px 20px',
                  }}>
                    {/* Phone notch */}
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
                      <div style={{ width: 60, height: 6, borderRadius: 3, background: B.deepWine, opacity: 0.3 }} />
                    </div>
                    {/* User message — right aligned */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                      <div style={{
                        maxWidth: '85%',
                        padding: '10px 14px',
                        borderRadius: '14px 14px 4px 14px',
                        background: '#fff',
                        fontSize: 14,
                        lineHeight: 1.55,
                        color: B.blackBrown,
                        fontFamily: FONT.body,
                      }}>
                        {demo.user}
                      </div>
                    </div>
                    {/* Sunny message — left aligned */}
                    <div style={{ display: 'flex', justifyContent: 'flex-start', gap: 8, alignItems: 'flex-start' }}>
                      <div style={{ width: 24, height: 24, borderRadius: '50%', background: B.deepWine, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#fff', flexShrink: 0, marginTop: 4 }}>
                        {'\u2726'}
                      </div>
                      <div style={{
                        maxWidth: '85%',
                        padding: '10px 14px',
                        borderRadius: '14px 14px 14px 4px',
                        background: '#F0EDE8',
                        fontSize: 14,
                        lineHeight: 1.55,
                        color: B.blackBrown,
                        fontFamily: FONT.body,
                        whiteSpace: 'pre-line',
                      }}>
                        {demo.sunny}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Reveal>

          {/* ─── Pre-populated question buttons ─── */}
          <Reveal delay={0.3}>
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: B.deepWine, fontFamily: FONT.body }}>
                Try asking Sunny anything {'\u2192'}
              </span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, justifyContent: 'center', marginBottom: 40 }}>
              {[
                'What joules should I use for 14k gold on the Zapp Plus 2?',
                'Help me price my sterling silver bracelet.',
                'What should I bring to my first market event?',
              ].map((q, i) => (
                <button
                  key={i}
                  onClick={() => window.dispatchEvent(new CustomEvent('sunny-ask', { detail: q }))}
                  style={{
                    padding: '16px 24px',
                    borderRadius: 14,
                    background: B.white,
                    border: `2px solid ${B.deepWine}20`,
                    cursor: 'pointer',
                    fontSize: 15,
                    fontWeight: 500,
                    color: B.deepWine,
                    fontFamily: FONT.body,
                    textAlign: 'left',
                    maxWidth: 380,
                    lineHeight: 1.5,
                    boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                    transition: 'box-shadow 0.2s, transform 0.2s, border-color 0.2s',
                    minHeight: 56,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.08)'; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.borderColor = B.deepWine }}
                  onMouseLeave={(e) => { e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.04)'; e.currentTarget.style.transform = 'none'; e.currentTarget.style.borderColor = `${B.deepWine}20` }}
                >
                  &ldquo;{q}&rdquo;
                </button>
              ))}
            </div>
          </Reveal>

          <Reveal delay={0.35}>
            <div style={{ textAlign: 'center' }}>
              <a href="/auth/signup" style={{ ...ctaStyle, background: B.redrock, color: '#fff' }}>
                Try Sunny &mdash; Start Your Free Trial
              </a>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ═══════ SECTION 7: PRICING ═══════ */}
      <section id="pricing" style={{ background: B.white, padding: '80px 0' }}>
        <div style={wrap}>
          <Reveal>
            <div style={{ textAlign: 'center', marginBottom: 48 }}>
              <h2 style={{ fontFamily: FONT.display, fontWeight: 400, fontSize: 'clamp(1.8rem, 4vw, 2.8rem)', color: B.blackBrown }}>
                Simple, Transparent Pricing
              </h2>
              <p style={{ fontSize: 16, fontWeight: 500, color: B.softBrown, marginTop: 12 }}>
                Start with a 30-day free Pro trial. No credit card required.
              </p>
            </div>
          </Reveal>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20, maxWidth: 1000, margin: '0 auto' }}>
            {PRICING.map((tier, i) => (
              <Reveal key={tier.name} delay={i * 0.1}>
                <div
                  style={{
                    background: B.white,
                    borderRadius: 16,
                    padding: '32px 28px',
                    border: tier.popular ? `2px solid ${B.deepWine}` : `1px solid ${B.taupe}40`,
                    boxShadow: tier.popular ? `0 8px 32px rgba(122,35,74,0.12)` : '0 2px 12px rgba(0,0,0,0.04)',
                    position: 'relative',
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  {tier.popular && (
                    <div
                      style={{
                        position: 'absolute',
                        top: -12,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        background: B.deepWine,
                        color: '#fff',
                        padding: '4px 16px',
                        borderRadius: 100,
                        fontSize: 11,
                        fontWeight: 600,
                        fontFamily: FONT.body,
                      }}
                    >
                      Most Popular
                    </div>
                  )}
                  <h3 style={{ fontFamily: FONT.display, fontWeight: 700, fontSize: 22, color: B.blackBrown, margin: 0 }}>{tier.name}</h3>
                  <p style={{ fontSize: 13, color: B.softBrown, marginTop: 4 }}>{tier.tagline}</p>
                  <div style={{ marginTop: 20, marginBottom: 8 }}>
                    <span style={{ fontFamily: FONT.display, fontWeight: 700, fontSize: 42, color: B.blackBrown }}>{tier.price}</span>
                    <span style={{ fontSize: 15, color: B.softBrown }}>{tier.period}</span>
                  </div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: B.deepWine, marginBottom: 20 }}>{tier.fee}</p>
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0, flex: 1 }}>
                    {tier.features.map((f, fi) => (
                      <li key={fi} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '6px 0', fontSize: 13.5, color: B.blackBrown }}>
                        <span style={{ color: B.forest, fontSize: 14, marginTop: 2, flexShrink: 0 }}>{'\u2713'}</span>
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                  {tier.name === 'Starter' ? (
                    <p style={{ textAlign: 'center', fontSize: 13, color: B.softBrown, marginTop: 24, fontStyle: 'italic' }}>
                      Available after your free Pro trial
                    </p>
                  ) : (
                    <a
                      href="/auth/signup"
                      style={{
                        ...ctaStyle,
                        width: '100%',
                        marginTop: 24,
                        background: tier.popular ? B.redrock : 'transparent',
                        color: tier.popular ? '#fff' : B.redrock,
                        border: tier.popular ? 'none' : `2px solid ${B.redrock}`,
                        textAlign: 'center',
                      }}
                    >
                      Start Free Trial
                    </a>
                  )}
                </div>
              </Reveal>
            ))}
          </div>

          <Reveal delay={0.3}>
            <p style={{ textAlign: 'center', fontSize: 14, color: B.softBrown, marginTop: 32 }}>
              Add CRM tools for $69/mo &mdash; included free during your 30-day trial.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ═══════ FAQ ═══════ */}
      <section id="faq" style={{ background: B.petal, padding: '80px 0' }}>
        <div style={{ ...wrap, maxWidth: 740 }}>
          <Reveal>
            <h2 style={{ fontFamily: FONT.display, fontWeight: 400, fontSize: 'clamp(1.8rem, 4vw, 2.5rem)', color: B.blackBrown, textAlign: 'center', marginBottom: 40 }}>
              Frequently Asked Questions
            </h2>
          </Reveal>
          {FAQS.map((faq, i) => (
            <FaqItem key={i} q={faq.q} a={faq.a} />
          ))}
        </div>
      </section>

      {/* ═══════ STILL HAVE QUESTIONS? ═══════ */}
      <section style={{ background: '#FFFFFF', padding: '64px 0' }}>
        <div style={{ ...wrap, textAlign: 'center' }}>
          <Reveal>
            <h2 style={{ fontFamily: FONT.display, fontWeight: 700, fontSize: 'clamp(1.6rem, 3.5vw, 2.4rem)', color: B.blackBrown, marginBottom: 12 }}>
              Still have questions?
            </h2>
            <p style={{ fontSize: 16, lineHeight: 1.6, color: B.softBrown, maxWidth: 520, margin: '0 auto 32px', fontFamily: FONT.body }}>
              Start your free trial and explore the platform yourself &mdash; or let Sunny walk you through it.
            </p>
            <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
              <a href="/auth/signup" style={{ ...ctaStyle, background: B.redrock, color: '#fff' }}>
                Start Your Free Trial
              </a>
              <button
                onClick={() => window.dispatchEvent(new CustomEvent('sunny-ask', { detail: 'Tell me about Sunstone Studio' }))}
                style={{ ...ctaStyle, background: 'transparent', color: B.deepWine, border: `2px solid ${B.deepWine}` }}
              >
                Chat with Sunny
              </button>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ═══════ SECTION 8: FINAL CTA ═══════ */}
      <section style={{ background: B.deepWine, padding: '80px 0' }}>
        <div style={wrap}>
          <style>{`
            .final-cta-layout { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 40px; }
            @media (min-width: 768px) { .final-cta-layout { flex-direction: row; text-align: left; } .final-cta-text { flex: 1; } .final-cta-photo { flex: 0 0 320px; } }
          `}</style>
          <div className="final-cta-layout">
            <div className="final-cta-text">
              <Reveal>
                <h2 style={{ fontFamily: FONT.display, fontWeight: 700, fontSize: 'clamp(2rem, 5vw, 3.2rem)', color: '#fff', marginBottom: 20 }}>
                  Ready to Build Your World?
                </h2>
              </Reveal>
              <Reveal delay={0.1}>
                <p style={{ fontSize: 17, color: 'rgba(255,255,255,0.9)', maxWidth: 560, margin: '0 0 32px', lineHeight: 1.6 }}>
                  Start your 30-day free trial today. No credit card. No commitment. Just a better way to run your PJ business.
                </p>
              </Reveal>
              <Reveal delay={0.2}>
                <a
                  href="/auth/signup"
                  style={{
                    ...ctaStyle,
                    background: '#fff',
                    color: B.deepWine,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = B.petal }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = '#fff' }}
                >
                  Start Your Free Trial
                </a>
              </Reveal>
            </div>
            <Reveal delay={0.15}>
              <div className="final-cta-photo" style={{ borderRadius: 12, overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
                <Image
                  src="/landing/party-celebration.jpg"
                  alt="Friends celebrating with permanent jewelry at a private party"
                  width={400}
                  height={300}
                  style={{ width: '100%', height: 'auto', display: 'block' }}
                />
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ═══════ SECTION 9: FOOTER ═══════ */}
      <footer style={{ background: '#FAF7F0', padding: '48px 0 32px' }}>
        <div style={{ ...wrap, textAlign: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 20 }}>
            <Image src="/landing/sunstone-logo.webp" alt="Sunstone" width={28} height={28} style={{ borderRadius: 6 }} />
            <span style={{ fontFamily: FONT.display, fontWeight: 700, fontSize: 16, color: '#1F1F1F' }}>Sunstone Permanent Jewelry</span>
          </div>
          <p style={{ fontSize: 13, color: '#1F1F1F', lineHeight: 1.7, marginBottom: 16, opacity: 0.7 }}>
            588 S 2000 W, Ste 400, Springville, UT 84663 &nbsp;|&nbsp; 385-999-5240
          </p>
          <div style={{ display: 'flex', gap: 20, justifyContent: 'center', marginBottom: 24 }}>
            <a href="/privacy" style={{ fontSize: 13, color: '#1F1F1F', textDecoration: 'none', opacity: 0.7 }}>Privacy Policy</a>
            <a href="/terms" style={{ fontSize: 13, color: '#1F1F1F', textDecoration: 'none', opacity: 0.7 }}>Terms of Service</a>
            <a href="/ambassador" style={{ fontSize: 13, color: '#1F1F1F', textDecoration: 'none', opacity: 0.7 }}>Ambassador Program</a>
          </div>
          <p style={{ fontSize: 12, color: '#1F1F1F', opacity: 0.5 }}>
            &copy; 2026 Sunstone Permanent Jewelry. All rights reserved.
          </p>
        </div>
      </footer>

      {/* ═══════ SUNNY CHAT WIDGET ═══════ */}
      <SunnyChat />
    </div>
  )
}
