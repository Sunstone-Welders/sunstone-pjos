import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { checkRateLimit, getClientIP } from '@/lib/rate-limit'
import { logAnthropicCost } from '@/lib/cost-tracker'

const SUNNY_DEMO_RATE_LIMIT = { prefix: 'sunny-demo', limit: 10, windowSeconds: 60 };

const SUNNY_DEMO_SYSTEM = `You are Sunny, the AI business mentor inside Sunstone Studio — a platform built by Sunstone Welders for permanent jewelry artists. You're chatting with a potential customer on the landing page.

⚠️ THE #1 RULE — BE EXTREMELY CONCISE:
You are on a landing page. Visitors are browsing, not reading essays. Every response MUST be 1-2 sentences max. No exceptions. No bullet lists. No headers. No numbered steps. Just a short, warm, conversational answer. If you catch yourself writing more than 2 sentences, stop and cut it down. Brevity is everything here.

WHAT YOU KNOW:
- Platform features: POS (Event Mode + Store Mode), Smart Inventory (chain by the inch, COGS tracking), Client CRM, Events/Queue/Digital Waivers with QR check-in, Reports, 9 Themes, Team permissions
- Payments: Built-in Stripe payments — customers pay by scanning a QR code or tapping a text link. No card reader needed. Customers see a clean checkout with no extra fees.
- Pricing: Starter ($99/mo, 3% platform fee deducted from your payouts), Pro ($169/mo, 1.5%), Business ($279/mo, 0%). 30-day free Pro trial, no credit card required.
- CRM add-on: $69/mo — your own dedicated phone number, two-way SMS, automated aftercare, broadcast messaging, party booking, client intelligence. Free during 30-day Pro trial.
- Sunstone welders (Zapp, Zapp Plus 2, mPulse) at a high level
- Coming soon: one-tap reordering of Sunstone chain and supplies from the app

DEEPER QUESTIONS (pricing strategy, event planning, weld settings, etc.):
Give one helpful sentence, then tease the full experience. Example: "Most artists do 3-4x markup on gold fill — inside the platform I can calculate exact prices from your real inventory."

TONE: Warm, casual, confident. Like texting a knowledgeable friend. One emoji max. Never pushy or salesy. Never start with "Great question!" — just answer.

NEVER: Make up features. Trash competitors. Give medical/legal/financial advice. Go off-topic.`

export async function POST(request: NextRequest) {
  try {
    // Rate limit: 10 requests per minute per IP
    const ip = getClientIP(request);
    const rl = checkRateLimit(ip, SUNNY_DEMO_RATE_LIMIT);
    if (!rl.allowed) {
      return NextResponse.json({
        reply: "I'm getting a lot of questions right now! Give me a moment and try again shortly.",
      }, { status: 429 });
    }

    const { messages } = await request.json()

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: 'Messages required' }, { status: 400 })
    }

    // Limit conversation length to prevent abuse
    if (messages.length > 20) {
      return NextResponse.json({
        reply: "We've been chatting for a while! 😊 For a deeper experience, start your free 30-day trial and I'll have access to your real business data. That's where I really shine!",
      })
    }

    const anthropic = new Anthropic()

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      system: SUNNY_DEMO_SYSTEM,
      messages: messages.map((m: { role: string; text: string }) => ({
        role: m.role === 'assistant' ? 'assistant' as const : 'user' as const,
        content: m.text,
      })),
    })

    // Log Anthropic cost (fire-and-forget)
    logAnthropicCost({
      tenantId: null,
      operation: 'sunny_demo',
      model: 'claude-sonnet-4-20250514',
      usage: response.usage,
    });

    const reply = response.content
      .map((block) => (block.type === 'text' ? block.text : ''))
      .filter(Boolean)
      .join('')

    return NextResponse.json({ reply })
  } catch (error) {
    console.error('Sunny demo error:', error)
    return NextResponse.json({
      reply: "Oops — I had a little hiccup! Try asking again in a moment. 😊",
    })
  }
}
