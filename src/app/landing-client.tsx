'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Image from 'next/image'

/* ═══════════════════════════════════════════════════════════════
   SUNSTONE STUDIO — LANDING PAGE CLIENT
   Dark Wine (#6b2942) + Gold (#c8a55c) + White
   ═══════════════════════════════════════════════════════════════ */

/* ─── PALETTE ─── */
const C = {
  bg: '#ffffff',
  bgSoft: '#fdfbfa',
  bgDeep: '#f8f5f3',
  text: '#1c1917',
  textSec: '#57534e',
  textMuted: '#a8a29e',
  wine: '#6b2942',
  wineDeep: '#4e1d30',
  wineLight: '#8a3d5a',
  wineBg: 'rgba(107,41,66,0.05)',
  wineBorder: 'rgba(107,41,66,0.12)',
  gold: '#c8a55c',
  goldDeep: '#a8873e',
  goldLight: '#dfc088',
  goldBg: 'rgba(200,165,92,0.08)',
  dark: '#140e12',
  darkCard: '#1e1620',
  darkText: '#f5f0ed',
  darkMuted: '#9a9490',
  card: '#ffffff',
  border: '#e7e0dc',
  borderLight: '#f2ede9',
}

/* ─── DATA ─── */
const PRICING = [
  {
    name: 'Starter',
    price: '$99',
    period: '/mo',
    fee: '3% platform fee',
    tagline: 'Everything you need to launch',
    popular: false,
    features: [
      'Full POS — Event & Store Mode',
      'Integrated Stripe payments (QR + text link)',
      'Smart Inventory management',
      'Client database',
      'Digital waivers & QR check-in',
      'Artist Storefront (public booking page)',
      'Private party booking requests',
      'Basic reports',
      'Sunny AI — 5 questions/mo',
      '60-day Pro trial with full CRM',
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
      '60-day Pro trial with full CRM',
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
      'Zero platform fee — you keep 100% of every sale',
      'Unlimited team members',
      'Artist Storefront & party booking',
      'White-glove onboarding',
      'Dedicated support',
      '60-day Pro trial with full CRM',
    ],
  },
]

const FAQS = [
  {
    q: 'How do customers pay?',
    a: "You build the order in the POS, then tap 'Charge Customer' and choose QR Code or Text Link. A secure Stripe checkout page is created instantly. Your customer scans the QR code with their phone camera or receives a text message with a payment link — they pay on their own phone. No card reader needed. The POS updates in real time when payment is received.",
  },
  {
    q: 'How does the platform fee work?',
    a: "A small platform fee is deducted from your Stripe payouts — your customers never see it. They pay exactly what you quote with a clean, professional checkout. On Starter it's 3%, Pro is 1.5%, and the Business plan has zero fee — you keep 100% of every sale. For example, on a $100 sale with the Starter plan, your customer pays $100 and you receive $97 after the platform fee. The fee covers secure payment processing, instant digital receipts, and automatic transaction tracking.",
  },
  {
    q: 'Can I still use my Square reader?',
    a: "Yes! You can record external payments (cash, Venmo, Square, or any card reader) anytime — they're logged for bookkeeping with no checkout fee. The built-in Stripe integration just gives you automatic tracking, a professional checkout experience, and no extra hardware to carry.",
  },
  {
    q: 'Do I need a Sunstone welder to use Studio?',
    a: "Sunstone Studio works beautifully for any permanent jewelry artist, regardless of equipment. That said, artists using Sunstone welders get the deepest integration — Sunny knows your exact equipment inside and out, and our supply catalog is built right in.",
  },
  {
    q: 'Can I use this at events and pop-ups?',
    a: "Event Mode was designed specifically for pop-ups, markets, and festivals. QR code check-in, real-time queue management, digital waivers, and fast checkout — everything you need to handle a packed event without breaking a sweat.",
  },
  {
    q: 'Is my data secure?',
    a: 'Bank-level security with complete tenant isolation. Your data is encrypted, never shared with third parties, and completely separated from every other business on the platform.',
  },
  {
    q: 'Can my team use it too?',
    a: 'Absolutely. Add team members with custom permission levels — control who can run the POS, view reports, manage inventory, access client data, and more.',
  },
  {
    q: 'What makes Sunny different from ChatGPT?',
    a: "Sunny isn't a general chatbot — she's trained specifically on permanent jewelry expertise and connected to YOUR business data. She sees your inventory, knows your clients, remembers your events, and can actually take action — like sending a text to your clients or planning your next event.",
  },
  {
    q: 'Why not just use Square POS and a spreadsheet?',
    a: "You absolutely can — most artists start there. But Square doesn't know what a jump ring is, can't track chain by the inch, won't auto-deduct inventory when you sell, can't manage an event queue, and definitely can't give you AI-powered business coaching at 2am. Studio replaces 5+ tools with one purpose-built platform — and with built-in Stripe payments, you don't even need a card reader.",
  },
  {
    q: 'What happens after my 60-day trial?',
    a: 'You pick your plan (Starter $99, Pro $169, or Business $279). CRM features (workflows, broadcasts, dedicated number, aftercare) become a $69/mo add-on. Your client data and conversation history are preserved indefinitely — just reactivate CRM to pick up where you left off.',
  },
  {
    q: "What's included in the CRM?",
    a: 'Your own dedicated business phone number, two-way SMS conversations, automated aftercare sequences, broadcast messaging, client workflows, birthday automations, message templates, advanced party booking (deposits, RSVP tracking, automated reminders, host rewards), and client intelligence. $69/mo add-on to any plan — all included free during your 60-day Pro trial. Basic party booking and your artist storefront are included free on every plan.',
  },
]

const FEATURES = [
  {
    num: '01',
    name: 'Sunny — Your AI Business Mentor',
    desc: "Like having a permanent jewelry expert and assistant on call 24/7. Sunny helps with weld settings, pricing, event planning, and inventory — but she doesn't just advise. She takes action. Ask her to text your clients, plan your next event, or recommend new chains to stock.",
    highlight: 'She knows YOUR business — your inventory, clients, and sales data',
    img: '/landing/sunny-texting.webp',
    imgAlt: 'Sunny AI drafting a personalized text message to 10 clients about an upcoming Saturday pop-up event',
  },
  {
    num: '02',
    name: 'Get Paid Instantly — No Card Reader Needed',
    desc: "Build the order, tap charge, and your customer pays on their own phone. QR code payments at your table or text-to-pay when they're across the room. Every transaction tracked automatically with a professional Stripe-hosted checkout page. Real-time payment notifications right in your POS.",
    highlight: 'Customers see a clean checkout with no extra fees — a small platform fee is deducted from your payouts',
    img: '/landing/pos-store.webp',
    imgAlt: 'POS payment screen showing QR code and text link checkout options with Stripe integration',
  },
  {
    num: '03',
    name: 'Point of Sale — Built for How You Sell',
    desc: 'Lightning-fast checkout designed for pop-ups, salons, and markets. Tap a chain, pick the product type, charge the customer. Automatic jump ring deduction, tip screen, receipt delivery — one fluid motion from selection to sale.',
    highlight: 'Event Mode + Store Mode — works everywhere you do',
    img: '/landing/pos-store.webp',
    imgAlt: 'Store Mode POS showing chain product grid with metal type filters, cart panel with items, and checkout total',
  },
  {
    num: '04',
    name: 'Reports That Actually Help',
    desc: "Know your numbers without a finance degree. Revenue, COGS, profit margins, event comparisons, average sale value — all calculated automatically from your real sales data. Sunny even analyzes the trends and tells you what to do next.",
    highlight: 'AI-powered insights included — not just charts',
    img: '/landing/reports.webp',
    imgAlt: 'Year-to-date financial reports showing $22K revenue, $8.9K net profit, 46 sales with detailed cost breakdown',
  },
  {
    num: '05',
    name: 'Client Relationships, Not Transactions',
    desc: "Every client gets a profile — purchase history, preferences, birthday, notes, tags. Smart suggestions tell you when to reach out. Automated follow-up workflows handle aftercare, review requests, and re-engagement while you focus on creating.",
    highlight: 'Included in your 60-day Pro trial · Add-on after trial',
    img: '/landing/client-profile.webp',
    imgAlt: 'Client profile for Maddy Carty showing contact actions, suggested outreach, and activity timeline',
  },
  {
    num: '06',
    name: 'Events, Queue & Digital Waivers',
    desc: "Print a QR code. Customers scan, sign the waiver, and join the queue — all from their phone. You see the real-time queue, manage who's next, and never lose track of a customer. No more clipboards. No more chaos.",
    highlight: "Your customers feel VIP. You stay completely organized.",
    img: '/landing/waiver-checkin.webp',
    imgAlt: 'Digital waiver and check-in form showing customer sign-up with name, email, phone, and event selection',
  },
  {
    num: '07',
    name: 'Smart Inventory — By the Inch',
    desc: "Track every inch of every chain. Cost per inch, sale price, stock levels, low-stock alerts, reorder points — all automatic. Price by the product or by the inch. Jump rings auto-deduct on every sale. You always know exactly where you stand.",
    highlight: 'Automatic COGS tracking · Jump ring auto-deduction',
    img: '/landing/inventory.webp',
    imgAlt: 'Inventory management table showing chains with cost, price, stock levels, and material types',
  },
  {
    num: '08',
    name: 'Your Artist Storefront',
    desc: "A beautiful, always-updated page your clients can book from. Your services, pricing, upcoming events, and a private party booking form — all in one link. Share it in your Instagram bio, text it to clients, or print it on a card. No website builder. No monthly fee. Just your business, looking polished.",
    highlight: 'One link for everything · Included free on every plan',
    img: '/landing/storefront-mobile.png',
    imgAlt: 'Public artist storefront page showing services, upcoming events, and party booking form',
  },
]

const THEME_DATA = [
  { name: 'Rose Gold & Cream', img: '/landing/themes/rose-gold.webp' },
  { name: 'Soft Blush & Ivory', img: '/landing/themes/soft-blush.webp' },
  { name: 'Sage & Linen', img: '/landing/themes/sage-linen.webp' },
  { name: 'French Blue & Linen', img: '/landing/themes/french-blue.webp' },
  { name: 'Midnight & Gold', img: '/landing/themes/midnight-gold.webp' },
  { name: 'Deep Plum & Champagne', img: '/landing/themes/deep-plum.webp' },
  { name: 'Forest & Gold', img: '/landing/themes/forest-gold.webp' },
  { name: 'Deep Ocean & Pearl', img: '/landing/themes/deep-ocean.webp' },
  { name: 'Warm Slate & Pearl', img: '/landing/themes/warm-slate.webp' },
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

/* ─── SMALL COMPONENTS ─── */
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

function DeviceFrame({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={className}
      style={{
        borderRadius: 16,
        overflow: 'hidden',
        boxShadow: '0 24px 80px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.04)',
        background: '#fff',
      }}
    >
      <div
        style={{
          height: 36,
          background: '#f6f4f2',
          display: 'flex',
          alignItems: 'center',
          padding: '0 14px',
          gap: 6,
        }}
      >
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ff5f56' }} />
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ffbd2e' }} />
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#27c93f' }} />
        <div style={{ flex: 1, textAlign: 'center', fontSize: 11, color: '#aaa', fontWeight: 500 }}>
          sunstonepj.app
        </div>
      </div>
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
      text: "Hey! 👋 I'm Sunny, your PJ business mentor. Ask me anything about Sunstone Studio — or test me with a real business question!",
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

  // Listen for suggested question clicks from the landing page
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

  // Auto-send pending question after chat panel opens
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
        .catch(() => setMsgs((prev) => [...prev, { role: 'assistant', text: 'Oops — something went wrong. Try again in a moment!' }]))
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
        { role: 'assistant', text: 'Oops — something went wrong. Try again in a moment!' },
      ])
    }
    setLoading(false)
  }, [input, loading, msgs])

  return (
    <>
      {/* Floating Button */}
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
          background: `linear-gradient(135deg, ${C.wine}, ${C.wineDeep})`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          border: 'none',
          boxShadow: '0 8px 32px rgba(107,41,66,0.4)',
          transition: 'transform 0.25s',
          transform: open ? 'rotate(45deg) scale(0.9)' : 'scale(1)',
        }}
      >
        <span style={{ fontSize: 26, color: '#fff' }}>{open ? '+' : '✦'}</span>
      </button>

      {/* Label */}
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
            color: C.text,
            border: `1px solid ${C.border}`,
            fontFamily: 'inherit',
          }}
        >
          Ask Sunny ✦
        </button>
      )}

      {/* Chat Panel */}
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
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '18px 22px',
              borderBottom: `1px solid ${C.border}`,
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              background: C.bgSoft,
            }}
          >
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: '50%',
                background: `linear-gradient(135deg, ${C.gold}, ${C.goldDeep})`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 22,
                color: '#fff',
                fontWeight: 700,
              }}
            >
              ✦
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, color: C.text }}>Sunny</div>
              <div style={{ fontSize: 11.5, color: C.textMuted }}>Your PJ Business Mentor · Try me!</div>
            </div>
          </div>

          {/* Messages */}
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
                          background: `linear-gradient(135deg, ${C.wine}, ${C.wineDeep})`,
                          color: '#fff',
                          borderBottomRightRadius: 4,
                        }
                      : {
                          background: C.bgDeep,
                          color: C.text,
                          border: `1px solid ${C.border}`,
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
                    background: C.bgDeep,
                    border: `1px solid ${C.border}`,
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

          {/* Input */}
          <div style={{ padding: '14px 16px', borderTop: `1px solid ${C.border}`, display: 'flex', gap: 10 }}>
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
                border: `1.5px solid ${C.border}`,
                fontSize: 14,
                outline: 'none',
                fontFamily: 'inherit',
                background: C.bgSoft,
              }}
            />
            <button
              onClick={send}
              disabled={loading || !input.trim()}
              style={{
                padding: '11px 18px',
                borderRadius: 12,
                border: 'none',
                background: input.trim() ? `linear-gradient(135deg, ${C.wine}, ${C.wineDeep})` : C.borderLight,
                color: input.trim() ? '#fff' : C.textMuted,
                fontWeight: 700,
                fontSize: 16,
                cursor: input.trim() ? 'pointer' : 'default',
                transition: 'all 0.25s',
                fontFamily: 'inherit',
              }}
            >
              →
            </button>
          </div>
        </div>
      )}
    </>
  )
}

/* ─── THEME CAROUSEL ─── */
function ThemeCarousel() {
  const [active, setActive] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => setActive((p) => (p + 1) % 9), 3500)
    return () => clearInterval(timer)
  }, [])

  return (
    <div>
      {/* Theme pills */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 28, flexWrap: 'wrap' }}>
        {THEME_DATA.map((theme, i) => (
          <button
            key={i}
            onClick={() => setActive(i)}
            style={{
              padding: '6px 14px',
              borderRadius: 100,
              border: `1.5px solid ${active === i ? C.wine : C.border}`,
              background: active === i ? C.wineBg : 'transparent',
              cursor: 'pointer',
              fontSize: 11.5,
              fontWeight: 600,
              color: active === i ? C.wine : C.textMuted,
              transition: 'all 0.3s',
              whiteSpace: 'nowrap',
              fontFamily: 'inherit',
            }}
          >
            {theme.name}
          </button>
        ))}
      </div>

      {/* Screenshot */}
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <DeviceFrame>
          <div style={{ position: 'relative', width: '100%', maxWidth: 800 }}>
            {THEME_DATA.map((theme, i) => (
              <div
                key={i}
                style={{
                  position: i === active ? 'relative' : 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  opacity: i === active ? 1 : 0,
                  transition: 'opacity 0.5s ease',
                  pointerEvents: i === active ? 'auto' : 'none',
                }}
              >
                <Image
                  src={theme.img}
                  alt={`Sunstone Studio dashboard in ${theme.name} theme`}
                  width={800}
                  height={500}
                  style={{ width: '100%', height: 'auto', display: 'block' }}
                  priority={i === 0}
                />
              </div>
            ))}
          </div>
        </DeviceFrame>
      </div>

      <div style={{ textAlign: 'center', marginTop: 20, fontSize: 15, fontWeight: 600, color: C.textSec }}>
        {THEME_DATA[active].name}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   MAIN LANDING PAGE
   ═══════════════════════════════════════════════════════════════ */
export default function LandingPageClient() {
  const [navSolid, setNavSolid] = useState(false)
  const [openFaq, setOpenFaq] = useState<number | null>(null)
  const [struck, setStruck] = useState(false)
  const painRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const fn = () => setNavSolid(window.scrollY > 60)
    window.addEventListener('scroll', fn, { passive: true })
    return () => window.removeEventListener('scroll', fn)
  }, [])

  useEffect(() => {
    const el = painRef.current
    if (!el) return
    const o = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setStruck(true)
          o.disconnect()
        }
      },
      { threshold: 0.25 }
    )
    o.observe(el)
    return () => o.disconnect()
  }, [])

  const pains = [
    'Tracking inventory on spreadsheets',
    'Doing price math with a calculator every sale',
    'Managing your event queue with sticky notes',
    'Losing client info after every pop-up',
    'No idea if you\'re actually profitable',
  ]

  return (
    <div style={{ fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif", color: C.text, background: C.bg }}>
      {/* ─── GLOBAL STYLES ─── */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;1,400;1,600&family=Inter:wght@400;500;600;700&display=swap');
        html { scroll-behavior: smooth; }
        ::selection { background: ${C.wineBg}; color: ${C.wine}; }
        @keyframes sunnySlideUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        .sunny-dot { width: 7px; height: 7px; border-radius: 50%; background: ${C.textMuted}; animation: dotPulse 1.2s ease infinite; }
        @keyframes dotPulse { 0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; } 40% { transform: scale(1); opacity: 1; } }
        @keyframes heroSlide { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: translateY(0); } }
        .hero-anim { animation: heroSlide 0.7s ease both; }
        .hero-anim-1 { animation-delay: 0s; }
        .hero-anim-2 { animation-delay: 0.1s; }
        .hero-anim-3 { animation-delay: 0.2s; }
        .hero-anim-4 { animation-delay: 0.3s; }
        .hero-anim-5 { animation-delay: 0.4s; }
        .landing-container { max-width: 1120px; margin: 0 auto; padding: 0 24px; }
        .serif { font-family: 'Playfair Display', Georgia, serif; }
        @media (max-width: 900px) {
          .grid-2 { grid-template-columns: 1fr !important; }
          .grid-3 { grid-template-columns: 1fr !important; max-width: 420px !important; margin-left: auto !important; margin-right: auto !important; }
          .nav-links { display: none !important; }
          .hero-title { font-size: 2.4rem !important; }
          .feature-row { direction: ltr !important; }
          .theme-pills { gap: 4px !important; }
          .theme-pills button { font-size: 10px !important; padding: 4px 10px !important; }
        }
      `}</style>

      {/* ═══════ NAV ═══════ */}
      <nav
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 100,
          padding: '16px 0',
          background: navSolid ? 'rgba(255,255,255,0.94)' : 'transparent',
          backdropFilter: navSolid ? 'blur(24px)' : 'none',
          WebkitBackdropFilter: navSolid ? 'blur(24px)' : 'none',
          borderBottom: navSolid ? `1px solid ${C.border}` : '1px solid transparent',
          transition: 'all 0.35s',
        }}
      >
        <div className="landing-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 11, textDecoration: 'none' }}>
            <SunstoneLogo size={34} />
            <span className="serif" style={{ fontWeight: 600, fontSize: 17, color: C.text }}>
              Sunstone Studio
            </span>
          </a>
          <div className="nav-links" style={{ display: 'flex', alignItems: 'center', gap: 30 }}>
            {[
              ['Features', '#features'],
              ['Pricing', '#pricing'],
              ['FAQ', '#faq'],
            ].map(([label, href]) => (
              <a key={label} href={href} style={{ fontSize: 14.5, fontWeight: 500, color: C.textSec, textDecoration: 'none' }}>
                {label}
              </a>
            ))}
            <a href="/login" style={{ fontSize: 14.5, fontWeight: 500, color: C.textSec, textDecoration: 'none' }}>
              Log In
            </a>
            <a
              href="/signup"
              style={{
                padding: '10px 24px',
                borderRadius: 10,
                fontSize: 14,
                fontWeight: 700,
                background: C.text,
                color: '#fff',
                textDecoration: 'none',
              }}
            >
              Start Free
            </a>
          </div>
        </div>
      </nav>

      {/* ═══════ HERO ═══════ */}
      <section
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          padding: '130px 24px 80px',
          position: 'relative',
          background: `radial-gradient(ellipse 60% 45% at 50% 0%, ${C.wineBg} 0%, transparent 55%), radial-gradient(ellipse 45% 35% at 80% 15%, ${C.goldBg} 0%, transparent 45%)`,
        }}
      >
        <div style={{ maxWidth: 800, position: 'relative', zIndex: 2 }}>
          <div
            className="hero-anim hero-anim-1"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 20px',
              borderRadius: 100,
              background: C.wineBg,
              border: `1px solid ${C.wineBorder}`,
              fontSize: 13.5,
              fontWeight: 600,
              color: C.wine,
              marginBottom: 30,
            }}
          >
            ✦ From the Pioneers of Permanent Jewelry
          </div>

          <h1
            className="serif hero-anim hero-anim-2 hero-title"
            style={{
              fontWeight: 400,
              fontSize: 'clamp(2.8rem, 5.5vw, 4.4rem)',
              lineHeight: 1.08,
              letterSpacing: '-0.02em',
              marginBottom: 24,
            }}
          >
            Your Entire PJ Business.
            <br />
            <em style={{ fontStyle: 'italic', color: C.wine }}>One Beautiful Platform.</em>
          </h1>

          <p
            className="hero-anim hero-anim-3"
            style={{
              fontSize: 'clamp(1.05rem, 2vw, 1.2rem)',
              lineHeight: 1.75,
              color: C.textSec,
              maxWidth: 620,
              margin: '0 auto 38px',
            }}
          >
            POS. Inventory. Clients. AI mentor. Queue management. Waivers. Reports. Everything a permanent jewelry artist
            needs — built by the people who know this industry best.
          </p>

          <div
            className="hero-anim hero-anim-4"
            style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 48 }}
          >
            <a
              href="/signup"
              style={{
                padding: '16px 38px',
                borderRadius: 12,
                fontSize: 16.5,
                fontWeight: 700,
                background: `linear-gradient(135deg, ${C.wine}, ${C.wineDeep})`,
                color: '#fff',
                boxShadow: `0 6px 24px rgba(107,41,66,0.3)`,
                textDecoration: 'none',
              }}
            >
              Start Your Free Trial
            </a>
            <a
              href="#features"
              style={{
                padding: '16px 38px',
                borderRadius: 12,
                fontSize: 16.5,
                fontWeight: 600,
                background: 'transparent',
                color: C.text,
                border: `2px solid ${C.border}`,
                textDecoration: 'none',
              }}
            >
              See It In Action
            </a>
          </div>

          <div
            className="hero-anim hero-anim-5"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 28, flexWrap: 'wrap' }}
          >
            {['60-Day Free Pro Trial', 'No Credit Card Required', 'Cancel Anytime'].map((t) => (
              <span key={t} style={{ fontSize: 13.5, color: C.textMuted, fontWeight: 500 }}>
                <span style={{ color: C.gold, marginRight: 7 }}>◆</span>
                {t}
              </span>
            ))}
          </div>
        </div>

        {/* Hero Screenshot */}
        <Reveal delay={0.4} style={{ maxWidth: 880, width: '100%', marginTop: 60 }}>
          <DeviceFrame>
            <Image
              src="/landing/hero-dashboard.webp"
              alt="Sunstone Studio dashboard with AI-powered Sunny's Take, revenue tracking, upcoming event, and inventory alerts"
              width={880}
              height={550}
              style={{ width: '100%', height: 'auto', display: 'block' }}
              priority
            />
          </DeviceFrame>
        </Reveal>
      </section>

      {/* ═══════ SOCIAL PROOF ═══════ */}
      <section style={{ padding: '32px 24px', background: C.bgDeep, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}` }}>
        <div className="landing-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 32, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14, color: C.textMuted }}>
            Built by <strong style={{ color: C.text }}>Sunstone Welders</strong> — makers of the #1 PJ welder
          </span>
          <span style={{ color: C.border }}>|</span>
          <span style={{ fontSize: 14, color: C.textMuted }}>
            Training from <strong style={{ color: C.text }}>PJ University</strong> — the industry standard
          </span>
          <span style={{ color: C.border }}>|</span>
          <span style={{ fontSize: 14, color: C.textMuted }}>
            Precision tools. <strong style={{ color: C.text }}>Now in software.</strong>
          </span>
        </div>
      </section>

      {/* ═══════ PROBLEM / SOLUTION ═══════ */}
      <section style={{ padding: '110px 24px' }}>
        <div className="landing-container grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 80, alignItems: 'start' }}>
          <Reveal>
            <div style={{ fontSize: 12.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: C.textMuted, marginBottom: 16 }}>Sound familiar?</div>
            <h2 className="serif" style={{ fontSize: 34, fontWeight: 400, lineHeight: 1.2, marginBottom: 36 }}>
              Running a PJ business<br />shouldn&apos;t feel this hard.
            </h2>
            <div ref={painRef} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {pains.map((p, i) => (
                <div
                  key={i}
                  style={{
                    fontSize: 15.5,
                    lineHeight: 1.55,
                    color: struck ? C.textMuted : C.textSec,
                    padding: '14px 18px',
                    borderRadius: 10,
                    background: 'rgba(0,0,0,0.02)',
                    border: `1px solid ${C.border}`,
                    position: 'relative',
                    transition: `color 0.5s ease ${0.4 + i * 0.2}s`,
                  }}
                >
                  {p}
                  <div
                    style={{
                      position: 'absolute',
                      left: 14,
                      top: '50%',
                      height: 2,
                      background: C.wine,
                      opacity: 0.55,
                      width: struck ? 'calc(100% - 28px)' : 0,
                      transition: `width 0.7s ease ${0.4 + i * 0.2}s`,
                    }}
                  />
                </div>
              ))}
            </div>
          </Reveal>

          <Reveal delay={0.2}>
            <div style={{ fontSize: 12.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: C.textMuted, marginBottom: 16 }}>There&apos;s a better way</div>
            <h2 className="serif" style={{ fontSize: 34, fontWeight: 400, lineHeight: 1.2, marginBottom: 28 }}>
              Meet <em style={{ color: C.wine }}>Sunstone Studio</em>
            </h2>
            <p style={{ fontSize: 16.5, lineHeight: 1.85, color: C.textSec, marginBottom: 22 }}>
              One platform that replaces the patchwork of tools, spreadsheets, and sticky notes holding your business together.
              Every feature was designed specifically for permanent jewelry artists — by the team that built the welders you trust.
            </p>
            <p style={{ fontSize: 16.5, lineHeight: 1.85, color: C.textSec, marginBottom: 28 }}>
              Whether you&apos;re running pop-ups, managing a salon station, hosting private parties, or building something bigger —
              Studio grows with you.
            </p>
            <div
              style={{
                padding: 22,
                borderRadius: 14,
                background: C.goldBg,
                borderLeft: `3px solid ${C.gold}`,
                fontSize: 15,
                fontWeight: 500,
                color: C.text,
                lineHeight: 1.55,
              }}
            >
              ✦ 60-day free Pro trial — no credit card required. Experience everything before you commit.
            </div>
          </Reveal>
        </div>
      </section>

      {/* ═══════ HOW IT WORKS ═══════ */}
      <section style={{ padding: '100px 24px', background: C.bgDeep }}>
        <div className="landing-container">
          <Reveal style={{ textAlign: 'center', maxWidth: 600, margin: '0 auto 64px' }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: C.wine, marginBottom: 14 }}>Get Started in Minutes</div>
            <h2 className="serif" style={{ fontSize: 34, fontWeight: 400 }}>Three Steps to Running Like a Pro</h2>
          </Reveal>

          <div className="grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 28 }}>
            {[
              { num: '1', title: 'Sign Up Free', desc: 'Create your account in 30 seconds. No credit card. Your 60-day Pro trial starts immediately.' },
              { num: '2', title: 'Set Up Your Business', desc: 'Import your chain inventory, customize your theme, upload your logo. Sunny walks you through every step.' },
              { num: '3', title: 'Start Selling', desc: 'Open POS at your next event or salon session. Check in customers, ring up sales, track everything automatically.' },
            ].map((step, i) => (
              <Reveal key={i} delay={i * 0.12}>
                <div style={{ padding: '36px 28px', borderRadius: 16, background: C.card, border: `1px solid ${C.border}`, textAlign: 'center' }}>
                  <div
                    style={{
                      width: 52,
                      height: 52,
                      borderRadius: 14,
                      margin: '0 auto 20px',
                      background:
                        i === 0
                          ? `linear-gradient(135deg, ${C.wine}, ${C.wineDeep})`
                          : i === 1
                          ? `linear-gradient(135deg, ${C.gold}, ${C.goldDeep})`
                          : C.text,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#fff',
                      fontSize: 20,
                      fontWeight: 700,
                    }}
                  >
                    {step.num}
                  </div>
                  <h3 className="serif" style={{ fontSize: 20, fontWeight: 600, marginBottom: 12 }}>
                    {step.title}
                  </h3>
                  <p style={{ fontSize: 14.5, color: C.textSec, lineHeight: 1.7 }}>{step.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════ FEATURES ═══════ */}
      <section id="features" style={{ padding: '110px 24px' }}>
        <div className="landing-container">
          <Reveal style={{ textAlign: 'center', maxWidth: 680, margin: '0 auto 80px' }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: C.wine, marginBottom: 14 }}>Everything You Need</div>
            <h2 className="serif" style={{ fontSize: 'clamp(2rem, 3.5vw, 2.8rem)', fontWeight: 400, lineHeight: 1.2, marginBottom: 18 }}>
              Built for creative entrepreneurs.
              <br />
              <em style={{ fontStyle: 'italic', color: C.wine }}>Perfected for permanent jewelry.</em>
            </h2>
            <p style={{ fontSize: 16.5, color: C.textSec, lineHeight: 1.75 }}>
              Every feature designed around how artists actually work — at events, in salons, on the road, and everywhere in between.
            </p>
          </Reveal>

          {FEATURES.map((f, i) => (
            <div
              key={i}
              className="grid-2 feature-row"
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 64,
                alignItems: 'center',
                marginBottom: i < FEATURES.length - 1 ? 100 : 0,
                direction: i % 2 === 1 ? 'rtl' : 'ltr',
              }}
            >
              <Reveal y={30} style={{ direction: 'ltr' }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: C.gold, marginBottom: 10, letterSpacing: '0.04em' }}>
                  {f.num}
                </div>
                <h3 className="serif" style={{ fontSize: 28, fontWeight: 400, lineHeight: 1.25, marginBottom: 18 }}>
                  {f.name}
                </h3>
                <p style={{ fontSize: 16, lineHeight: 1.85, color: C.textSec, marginBottom: 24 }}>{f.desc}</p>
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '10px 18px',
                    borderRadius: 10,
                    background: C.goldBg,
                    fontSize: 13.5,
                    fontWeight: 600,
                    color: C.goldDeep,
                  }}
                >
                  ✦ {f.highlight}
                </div>
              </Reveal>
              <Reveal delay={0.15} style={{ direction: 'ltr' }}>
                <DeviceFrame>
                  <Image
                    src={f.img}
                    alt={f.imgAlt}
                    width={600}
                    height={400}
                    style={{ width: '100%', height: 'auto', display: 'block' }}
                  />
                </DeviceFrame>
              </Reveal>
            </div>
          ))}
        </div>
      </section>

      {/* ═══════ INLINE SUNNY DEMO ═══════ */}
      <section style={{ padding: '100px 24px', background: C.bgDeep }}>
        <div className="landing-container">
          <Reveal style={{ textAlign: 'center', maxWidth: 650, margin: '0 auto 48px' }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: C.wine, marginBottom: 14 }}>Meet Your AI Mentor</div>
            <h2 className="serif" style={{ fontSize: 34, fontWeight: 400, marginBottom: 16 }}>
              Don&apos;t Take Our Word For It.
              <br />
              <em style={{ color: C.wine }}>Ask Sunny Yourself.</em>
            </h2>
            <p style={{ fontSize: 16.5, color: C.textSec, lineHeight: 1.75 }}>
              She&apos;s right here, right now. Try one of these — or ask anything you want.
            </p>
          </Reveal>

          <Reveal>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 14, flexWrap: 'wrap' }}>
              {[
                'What does Sunstone Studio do?',
                'How do customers pay?',
                "What's included in the free trial?",
                'Do I need a card reader?',
              ].map((q) => (
                <button
                  key={q}
                  onClick={() => window.dispatchEvent(new CustomEvent('sunny-ask', { detail: q }))}
                  style={{
                    padding: '12px 22px',
                    borderRadius: 12,
                    border: `1.5px solid ${C.wineBorder}`,
                    background: C.card,
                    cursor: 'pointer',
                    fontSize: 14,
                    fontWeight: 500,
                    color: C.wine,
                    transition: 'all 0.25s',
                    fontFamily: 'inherit',
                  }}
                >
                  {q}
                </button>
              ))}
            </div>
            <p style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: C.textMuted }}>
              Click any question above to start a live conversation with Sunny.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ═══════ CRM TEASER ═══════ */}
      <section id="crm" style={{ padding: '110px 24px', background: C.bgDeep }}>
        <div className="landing-container">
          <Reveal style={{ textAlign: 'center', maxWidth: 680, margin: '0 auto 56px' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 20px', borderRadius: 100, background: C.wineBg, border: `1px solid ${C.wineBorder}`, fontSize: 13, fontWeight: 700, color: C.wine, marginBottom: 20 }}>
              Included In Your Trial
            </div>
            <h2 className="serif" style={{ fontSize: 'clamp(2rem, 3.5vw, 2.8rem)', fontWeight: 400, lineHeight: 1.2, marginBottom: 18 }}>
              Your Personal <em style={{ fontStyle: 'italic', color: C.wine }}>CRM</em>
            </h2>
            <p style={{ fontSize: 17, color: C.textSec, lineHeight: 1.75 }}>
              Included free in your 60-day Pro trial. Turn one-time customers into lifelong clients.
            </p>
          </Reveal>

          <div className="grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24, maxWidth: 980, margin: '0 auto 48px' }}>
            {[
              { icon: '📱', title: 'Your Own Phone Number', desc: 'Get a dedicated business number. Clients text you, you respond from the app. Keep your personal number private.' },
              { icon: '💛', title: 'Automated Aftercare', desc: 'Post-purchase care instructions, re-weld reminders, and birthday messages — all on autopilot.' },
              { icon: '🔄', title: 'Smart Follow-ups', desc: 'Automated sequences that nurture new clients into regulars without you lifting a finger.' },
              { icon: '📣', title: 'Broadcast Messaging', desc: 'One tap to message your VIP list about your next event or promotion.' },
              { icon: '🎉', title: 'Advanced Party Booking', desc: 'Deposits, RSVP tracking, guest management, automated reminders, and host rewards.' },
              { icon: '📊', title: 'Client Intelligence', desc: "Know who your top spenders are, who hasn't visited in 60 days, and who's referring friends." },
            ].map((item, i) => (
              <Reveal key={i} delay={i * 0.08}>
                <div style={{
                  padding: '32px 24px',
                  borderRadius: 16,
                  background: C.card,
                  border: `1px solid ${C.border}`,
                  height: '100%',
                }}>
                  <div style={{ fontSize: 28, marginBottom: 16 }}>{item.icon}</div>
                  <h3 style={{ fontSize: 16.5, fontWeight: 700, color: C.text, marginBottom: 10 }}>{item.title}</h3>
                  <p style={{ fontSize: 14.5, color: C.textSec, lineHeight: 1.7 }}>{item.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>

          <Reveal style={{ textAlign: 'center' }}>
            <div style={{
              display: 'inline-block',
              padding: '20px 40px',
              borderRadius: 16,
              background: C.card,
              border: `1px solid ${C.border}`,
              boxShadow: '0 4px 24px rgba(0,0,0,0.04)',
              marginBottom: 20,
            }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>
                Keep CRM after your trial for just <span className="serif" style={{ fontSize: 24, color: C.wine }}>$69</span>/month add-on to any plan
              </div>
            </div>
            <div>
              <a href="/crm" style={{
                fontSize: 15, fontWeight: 600, color: C.wine, textDecoration: 'none',
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}>
                See Everything CRM Can Do
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M5 12h14m-7-7l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </a>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ═══════ REORDER TEASER ═══════ */}
      <section style={{ padding: '48px 24px' }}>
        <div className="landing-container" style={{ maxWidth: 880 }}>
          <Reveal>
            <div
              style={{
                padding: '32px 40px',
                borderRadius: 16,
                background: `linear-gradient(135deg, ${C.goldBg}, rgba(200,165,92,0.14))`,
                border: '1px solid rgba(200,165,92,0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 28,
                flexWrap: 'wrap',
              }}
            >
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: C.goldDeep, marginBottom: 8 }}>Coming Soon</div>
                <div className="serif" style={{ fontSize: 22, color: C.text, marginBottom: 6 }}>Reorder Sunstone Supplies — One Tap</div>
                <div style={{ fontSize: 15, color: C.textSec, lineHeight: 1.6 }}>
                  Chain, jump rings, connectors — reorder directly from your dashboard. Your supply chain, built right in.
                </div>
              </div>
              <div style={{ fontSize: 40, opacity: 0.25, flexShrink: 0 }}>📦</div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ═══════ THEMES ═══════ */}
      <section style={{ padding: '110px 24px' }}>
        <div className="landing-container">
          <Reveal style={{ textAlign: 'center', maxWidth: 620, margin: '0 auto 48px' }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: C.wine, marginBottom: 14 }}>Make It Yours</div>
            <h2 className="serif" style={{ fontSize: 34, fontWeight: 400, marginBottom: 16 }}>9 Beautiful Themes</h2>
            <p style={{ fontSize: 16.5, color: C.textSec, lineHeight: 1.75 }}>
              Your app, your aesthetic. From warm Rose Gold to sleek Midnight — every screen, every button, even your waiver page
              matches your brand.
            </p>
          </Reveal>
          <Reveal>
            <ThemeCarousel />
          </Reveal>
        </div>
      </section>

      {/* ═══════ SUNSTONE DIFFERENCE ═══════ */}
      <section style={{ padding: '110px 24px', background: C.dark, color: C.darkText, position: 'relative' }}>
        <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse 45% 50% at 20% 50%, rgba(200,165,92,0.05) 0%, transparent 55%)`, pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, transparent 10%, ${C.gold} 50%, transparent 90%)` }} />
        <Reveal style={{ maxWidth: 820, margin: '0 auto', textAlign: 'center', position: 'relative', zIndex: 2, padding: '0 24px' }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', color: C.gold, marginBottom: 16 }}>The Sunstone Difference</div>
          <h2 className="serif" style={{ fontSize: 'clamp(2rem, 3.5vw, 2.8rem)', fontWeight: 400, lineHeight: 1.25, marginBottom: 28 }}>
            Built by the People Who
            <br />
            Built This Industry
          </h2>
          <p style={{ fontSize: 17, lineHeight: 1.9, color: C.darkMuted, marginBottom: 20 }}>
            Sunstone Welders didn&apos;t enter the permanent jewelry space — we helped create it. Our welders are trusted by
            thousands of artists worldwide. Sunstone Studio is the natural evolution: the same obsessive attention to craft, now
            applied to every aspect of your business.
          </p>
          <p style={{ fontSize: 17, lineHeight: 1.9, color: C.darkMuted, marginBottom: 52 }}>
            This isn&apos;t a generic app retrofitted for jewelry. Every screen, every feature, every AI response was designed by
            people who understand the craft, the hustle, and the dream.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 60, flexWrap: 'wrap' }}>
            {[
              { n: '20+', l: 'Years of Welding Expertise' },
              { n: '1000s', l: 'Artists Trained' },
              { n: '3', l: 'Precision Welders' },
              { n: '50+', l: 'American Workers' },
            ].map((s) => (
              <div key={s.l} style={{ textAlign: 'center' }}>
                <div className="serif" style={{ fontSize: 40, color: C.gold, marginBottom: 8 }}>{s.n}</div>
                <div style={{ fontSize: 11.5, color: C.darkMuted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', maxWidth: 120 }}>{s.l}</div>
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      {/* ═══════ PRICING ═══════ */}
      <section id="pricing" style={{ padding: '110px 24px' }}>
        <div className="landing-container">
          <Reveal style={{ textAlign: 'center', maxWidth: 600, margin: '0 auto 56px' }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: C.wine, marginBottom: 14 }}>Simple Pricing</div>
            <h2 className="serif" style={{ fontSize: 34, fontWeight: 400, marginBottom: 16 }}>Plans That Grow With You</h2>
            <p style={{ fontSize: 16.5, color: C.textSec, lineHeight: 1.75 }}>
              Start free. Upgrade when you&apos;re ready. Every plan includes a 60-day Pro trial with full access.
            </p>
          </Reveal>

          <div className="grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24, maxWidth: 980, margin: '0 auto' }}>
            {PRICING.map((plan, i) => (
              <Reveal key={plan.name} delay={i * 0.1}>
                <div
                  style={{
                    padding: '40px 30px',
                    borderRadius: 18,
                    background: C.card,
                    position: 'relative',
                    border: plan.popular ? `2.5px solid ${C.wine}` : `1px solid ${C.border}`,
                    boxShadow: plan.popular ? `0 0 0 1px ${C.wine}, 0 20px 60px rgba(107,41,66,0.1)` : '0 4px 24px rgba(0,0,0,0.04)',
                  }}
                >
                  {plan.popular && (
                    <div
                      style={{
                        position: 'absolute',
                        top: -13,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        padding: '6px 20px',
                        borderRadius: 100,
                        background: `linear-gradient(135deg, ${C.wine}, ${C.wineDeep})`,
                        color: '#fff',
                        fontSize: 11.5,
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.1em',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      Most Popular
                    </div>
                  )}
                  <div className="serif" style={{ fontSize: 24, fontWeight: 600, marginBottom: 6 }}>{plan.name}</div>
                  <div style={{ fontSize: 14.5, color: C.textSec, marginBottom: 24 }}>{plan.tagline}</div>
                  <div className="serif" style={{ fontSize: 44, fontWeight: 400, marginBottom: 4 }}>
                    {plan.price}
                    <span style={{ fontSize: 16, color: C.textMuted, fontFamily: "'Inter', sans-serif" }}>{plan.period}</span>
                  </div>
                  <div style={{ fontSize: 13.5, color: C.textMuted, marginBottom: 30 }}>{plan.fee}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', marginBottom: 30 }}>
                    {plan.features.map((f) => (
                      <div
                        key={f}
                        style={{
                          padding: '11px 0',
                          fontSize: 14.5,
                          color: f.includes('Everything') ? C.text : C.textSec,
                          fontWeight: f.includes('Everything') ? 600 : 400,
                          borderBottom: `1px solid ${C.borderLight}`,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                        }}
                      >
                        {!f.includes('Everything') && <span style={{ color: C.gold, fontWeight: 700, fontSize: 12 }}>✓</span>}
                        {f}
                      </div>
                    ))}
                  </div>
                  <a
                    href="/signup"
                    style={{
                      display: 'block',
                      width: '100%',
                      padding: 15,
                      borderRadius: 12,
                      textAlign: 'center',
                      fontWeight: 700,
                      fontSize: 15.5,
                      textDecoration: 'none',
                      ...(plan.popular
                        ? { background: `linear-gradient(135deg, ${C.wine}, ${C.wineDeep})`, color: '#fff' }
                        : { background: 'transparent', border: `2px solid ${C.border}`, color: C.text }),
                    }}
                  >
                    {plan.price === 'Free' ? 'Get Started' : 'Start Free Trial'}
                  </a>
                </div>
              </Reveal>
            ))}
          </div>

          <Reveal style={{ textAlign: 'center', marginTop: 32 }}>
            <div style={{
              maxWidth: 700,
              margin: '0 auto',
              padding: '20px 28px',
              borderRadius: 14,
              background: C.goldBg,
              borderLeft: `3px solid ${C.gold}`,
            }}>
              <p style={{ fontSize: 15, color: C.text, lineHeight: 1.65, fontWeight: 500 }}>
                A small platform fee is deducted from your Stripe payouts — <strong>your customers see a clean checkout with no extra fees.</strong> Want to keep 100%? The Business plan has zero platform fee.
              </p>
            </div>
            <p style={{ fontSize: 14.5, color: C.textMuted, marginTop: 20 }}>
              All plans include a 60-day free Pro trial — including CRM. No credit card required.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ═══════ FAQ ═══════ */}
      <section id="faq" style={{ padding: '110px 24px', background: C.bgDeep }}>
        <div className="landing-container">
          <Reveal style={{ textAlign: 'center', maxWidth: 600, margin: '0 auto 56px' }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: C.wine, marginBottom: 14 }}>Questions?</div>
            <h2 className="serif" style={{ fontSize: 34, fontWeight: 400 }}>We&apos;ve Got Answers</h2>
          </Reveal>

          <div style={{ maxWidth: 740, margin: '0 auto' }}>
            {FAQS.map((faq, i) => (
              <div key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  style={{
                    width: '100%',
                    background: 'none',
                    border: 'none',
                    textAlign: 'left',
                    padding: '24px 0',
                    fontSize: 16.5,
                    fontWeight: 600,
                    color: C.text,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 20,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  {faq.q}
                  <span
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      flexShrink: 0,
                      border: `2px solid ${openFaq === i ? C.wine : C.border}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 18,
                      color: openFaq === i ? C.wine : C.textMuted,
                      transition: 'all 0.35s',
                      transform: openFaq === i ? 'rotate(45deg)' : 'none',
                    }}
                  >
                    +
                  </span>
                </button>
                <div
                  style={{
                    maxHeight: openFaq === i ? 300 : 0,
                    overflow: 'hidden',
                    transition: 'max-height 0.45s ease, padding 0.45s ease',
                    paddingBottom: openFaq === i ? 24 : 0,
                  }}
                >
                  <p style={{ fontSize: 15.5, lineHeight: 1.85, color: C.textSec }}>{faq.a}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════ FINAL CTA ═══════ */}
      <section style={{ padding: '110px 24px', background: C.dark, textAlign: 'center', color: C.darkText, position: 'relative' }}>
        <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse 50% 70% at 50% 100%, rgba(200,165,92,0.06) 0%, transparent 55%)`, pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, transparent 10%, ${C.gold} 50%, transparent 90%)` }} />
        <Reveal style={{ position: 'relative', zIndex: 2 }}>
          <h2 className="serif" style={{ fontSize: 'clamp(2rem, 3.5vw, 2.8rem)', fontWeight: 400, lineHeight: 1.25, marginBottom: 20 }}>
            Ready to Run Your Business
            <br />
            Like a Pro?
          </h2>
          <p style={{ fontSize: 17.5, color: C.darkMuted, maxWidth: 540, margin: '0 auto 40px', lineHeight: 1.7 }}>
            Join the permanent jewelry artists who&apos;ve upgraded from spreadsheets, sticky notes, and guesswork.
          </p>
          <a
            href="/signup"
            style={{
              display: 'inline-block',
              padding: '18px 48px',
              borderRadius: 14,
              fontSize: 18,
              fontWeight: 700,
              background: `linear-gradient(135deg, ${C.gold}, ${C.goldDeep})`,
              color: '#fff',
              boxShadow: '0 6px 28px rgba(200,165,92,0.35)',
              textDecoration: 'none',
            }}
          >
            Start Your Free 60-Day Trial
          </a>
          <div style={{ marginTop: 16, fontSize: 13.5, color: C.darkMuted }}>No credit card required · Cancel anytime</div>
        </Reveal>
      </section>

      {/* ═══════ FOOTER ═══════ */}
      <footer style={{ padding: '60px 24px 40px', borderTop: `1px solid ${C.border}` }}>
        <div className="landing-container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', flexWrap: 'wrap', gap: 40 }}>
          <div style={{ maxWidth: 280 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <SunstoneLogo size={30} />
              <span className="serif" style={{ fontWeight: 600, fontSize: 16 }}>Sunstone Studio</span>
            </div>
            <p style={{ fontSize: 13.5, color: C.textMuted, lineHeight: 1.65 }}>
              The operating system for permanent jewelry artists. Built by Sunstone Welders — the pioneers of PJ.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 56, flexWrap: 'wrap' }}>
            {[
              { title: 'Product', links: [['Features', '#features'], ['Pricing', '#pricing'], ['FAQ', '#faq']] },
              { title: 'Account', links: [['Log In', '/login'], ['Sign Up', '/signup']] },
              {
                title: 'Company',
                links: [
                  ['Sunstone Welders', 'https://permanentjewelry.sunstonewelders.com'],
                  ['PJ University', 'https://permanentjewelry-sunstonewelders.thinkific.com/users/sign_in'],
                  ['Privacy Policy', '/privacy'],
                  ['Terms', '/terms'],
                ],
              },
            ].map((col) => (
              <div key={col.title}>
                <div style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: C.textMuted, marginBottom: 16 }}>{col.title}</div>
                {col.links.map(([label, href]) => (
                  <a key={label} href={href} style={{ display: 'block', fontSize: 14.5, color: C.textSec, padding: '6px 0', textDecoration: 'none' }}>
                    {label}
                  </a>
                ))}
              </div>
            ))}
          </div>
        </div>
        <div
          className="landing-container"
          style={{
            marginTop: 44,
            paddingTop: 22,
            borderTop: `1px solid ${C.border}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: 12.5,
            color: C.textMuted,
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <span>© 2026 Sunstone Welders. All rights reserved.</span>
          <span>Made with ✦ in Spanish Fork, Utah</span>
        </div>
      </footer>

      {/* ═══════ SUNNY CHAT ═══════ */}
      <SunnyChat />
    </div>
  )
}
