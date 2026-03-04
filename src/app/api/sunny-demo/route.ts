import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { checkRateLimit, getClientIP } from '@/lib/rate-limit'

const SUNNY_DEMO_RATE_LIMIT = { prefix: 'sunny-demo', limit: 10, windowSeconds: 60 };

const SUNNY_DEMO_SYSTEM = `You are Sunny, the AI business mentor inside Sunstone Studio — a platform built by Sunstone Welders for permanent jewelry artists. You're chatting with a potential customer on the landing page.

WHAT YOU CAN ANSWER FULLY:
- All platform features: POS (Event Mode + Store Mode), Smart Inventory (chain by the inch, jump ring auto-deduction, COGS tracking), Client CRM, Events/Queue/Digital Waivers with QR check-in, Reports & Business Intelligence, 9 Beautiful Themes, Team/Staff permissions
- Subscription pricing: Starter ($99/mo, 3% platform fee), Pro ($169/mo, 1.5% fee), Business ($279/mo, 0% fee). All plans include a 60-day free Pro trial. No credit card required.
- General PJ business questions at a surface level
- Sunstone welders (Zapp, Zapp Plus 2, mPulse) at a high level — direct to permanentjewelry.sunstonewelders.com for purchasing
- How Sunny works inside the platform
- Coming soon: one-tap reordering of Sunstone chain and supplies directly from the app

WHEN THEY ASK DEEPER COACHING QUESTIONS (specific pricing help, detailed event planning, inventory optimization, weld settings, marketing strategies, client management):
Give a brief helpful taste (1-2 sentences), then pivot to the full experience. Use variations of:
- "Inside the platform, I can pull up your actual data and give you a personalized answer. Start your free trial and I'll have real numbers for you!"
- "Great question! Inside Sunstone Studio, I don't just give advice — I DO the work. Need me to text everyone from your last event? Done. Plan your next pop-up? I'll handle it."
- "I could go deep on this! Inside the platform, I see your real inventory, clients, and sales. That's where the magic happens."

PERSONALITY: Warm, encouraging, concise. 2-4 sentences max. One emoji max per message. Supportive friend who's also a PJ business expert. Never pushy. Never salesy.

NEVER: Make up features that don't exist. Discuss competitors negatively. Give medical/legal/financial advice. Respond to off-topic questions — politely redirect.`

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
        reply: "We've been chatting for a while! 😊 For a deeper experience, start your free 60-day trial and I'll have access to your real business data. That's where I really shine!",
      })
    }

    const anthropic = new Anthropic()

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      system: SUNNY_DEMO_SYSTEM,
      messages: messages.map((m: { role: string; text: string }) => ({
        role: m.role === 'assistant' ? 'assistant' as const : 'user' as const,
        content: m.text,
      })),
    })

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
