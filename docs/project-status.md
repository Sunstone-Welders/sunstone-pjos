# Sunstone Studio — Project Status & Context Document
## Last Updated: March 7, 2026 (Evening)

---

## What This Document Is

This is the single source of truth for the Sunstone Studio project. It contains everything a new Claude thread needs to pick up where the last one left off. Keep this updated after every major session.

---

## 1. PROJECT OVERVIEW

**Product:** Sunstone Studio — a vertical SaaS platform for permanent jewelry artists
**URL:** https://sunstonepj.app (live on Vercel)
**Company:** Sunstone Welders (permanentjewelry.sunstonewelders.com)
**Founder:** Tony Price
**Stack:** Next.js 15, TypeScript, Supabase (Postgres + Auth + RLS), Tailwind CSS, Vercel

**What it does:** All-in-one business platform for permanent jewelry artists — POS, inventory management, client CRM, AI mentor (Sunny), event/queue management, digital waivers, gift cards, financial reporting, two-way SMS messaging, automated workflows, and integrated Stripe payments.

**Business model:**
- Subscription tiers: Starter ($99/mo), Pro ($169/mo), Business ($279/mo)
- Platform fee: 3% / 1.5% / 0% deducted from artist's Stripe payouts (artist-absorbed, customer never sees it)
- CRM add-on: $69/mo (included free in 60-day Pro trial)
- 60-day Pro trial for all new signups, no credit card required
- Revenue streams: subscriptions + platform fees + CRM add-on + Sunstone product sales

---

## 2. WHAT'S BUILT AND WORKING

### Core Platform
- Multi-tenant architecture with RLS, UUID primary keys, tenant_id isolation
- Auth: signup, login (server-side rate limited), password reset (rate limited, no email enumeration), email confirmation (Supabase Auth)
- Onboarding: kit selection, pricing wizard (flat rate or per-product), product type setup
- 9 theme variations (5 light, 4 dark), custom design system with CSS custom properties
- Staff permissions: Admin/Manager/Staff roles
- tenant_members RLS uses SECURITY DEFINER functions (no recursion)

### POS (Event Mode + Store Mode)
- Full-screen tablet-optimized product grid
- Progressive chain filter by material type
- Per-product flat pricing (customer never sees inch measurements)
- Tip screen with percentage presets (15/20/25%)
- Payment: "Charge Customer" (Stripe QR/text link) or "Record External Payment" (cash/Venmo/external card)
- Jump ring auto-deduction with confirmation step
- Discounts (per-item and cart-level)
- Auto-scroll to product type selector on product tap
- Cash drawer (open/close/track) — working

### Stripe Payment Links
- QR code payment — customer scans and pays on their phone
- Text-to-pay — send payment link via SMS
- Stripe Connect: artist connects their own Stripe account, payments flow to them
- application_fee_amount: platform fee deducted from artist's payout automatically
- Payment link route authenticated, line items fetched from DB (not client-supplied)
- Pending sales excluded from reports until payment confirmed
- Inventory only deducted after payment webhook confirms

### Gift Cards
- Purchase via POS (preset or custom amounts)
- Deliver via SMS, email, or print
- Redemption at POS with code lookup
- Partial redemptions supported, balance tracking

### Clients & CRM
- Client management with activity timeline, notes, tags, segments
- Conversation history (two-way SMS)
- Unread message badges on client cards
- Message templates with variable support ({{first_name}}, {{business_name}})
- SMS/email broadcasts with recipient targeting and tenant ownership checks
- Automated workflows with step builder (trigger → delay → send template)
- Workflow enrollment from client profiles (mobile-friendly)
- Follow-up queuing

### Events & Queue
- Event CRUD with booth fee, tax profiles
- QR codes for public waiver access
- Digital waiver with signature capture, PDF generation, SMS consent checkbox
- Queue management with position notifications
- Store Mode queue (waiver check-in gate)

### Reports & Financial
- Event P&L with COGS breakdown (chain costs + jump ring costs)
- Business-wide reports with date/source filters
- CSV export
- Platform fee tracking (platform_fee_collected on sales)
- Cash drawer summary in event reports
- Gift card metrics
- Payment method breakdown (stripe_link, cash, venmo, card_external, gift_card)

### Subscription & Billing
- Stripe Checkout for base subscriptions with deferred billing during trial
- CRM add-on checkout ($69/mo) with deferred billing
- Trial warnings at 14/7/3/1 days
- Post-trial lockout overlay (can see data, can't use features)
- CRM gating: features lock when trial expires without CRM subscription

### AI — Sunny (Mentor)
- 1,457+ line knowledge base from 45+ official Sunstone documents
- Streaming chat with subsection-level keyword matching (43 chunks)
- Agentic tool execution (27+ tools)
- Prompt caching for ~70% cost reduction
- Dedicated --mentor-bubble-* CSS variables for readable contrast on all 9 themes
- Rate limited (5 questions/month on Starter to protect PJ University content)

### AI — Atlas (Admin)
- 11 tools for platform management
- Tenant management, platform stats, revenue queries, knowledge gap review

### Admin Portal
- Platform admin at /admin
- Tenant management, revenue dashboard
- Admin cost tracker (Anthropic API, Twilio SMS, Resend email costs per tenant)
- Admin AI (Atlas)
- CRM toggle per tenant
- Tenant detail returns explicit safe column list (no payment credentials exposed)

### Marketing & Public Pages
- Landing page at sunstonepj.app (Playfair Display headlines, Inter body)
- Screenshots converted to WebP, analytics tracking added
- CRM dedicated marketing page at /crm with Sunny text responder demos
- Privacy policy at /privacy (SMS-specific sections for A2P compliance)
- Terms of service at /terms
- Waiver demo at /waiver (with SMS consent checkbox)
- Sunny demo widget on landing page

---

## 3. KNOWN BUGS & ACTIVE ISSUES

### All Previously Known Bugs — RESOLVED
- Cash drawer 500 error — ✅ Column name mismatch fixed (actual_amount → closing_amount). March 7.
- Sunny contrast on light themes — ✅ Dedicated CSS variables, 12:1+ contrast all themes. March 7.
- Platform fee misleading copy — ✅ Removed "$98.50" example, added standard processing fee language. March 7.
- Workflow enrollment mobile — ✅ Fixed in prior session.
- SMS consent on waiver — ✅ Checkbox with carrier language, sms_consent column.
- Duplicate Sunstone supplier — ✅ Data cleanup complete.
- Getting Started cards disappearing — ✅ Caching issue fixed.

### No Active Bugs as of March 7, 2026
Manual QA testing (180 tests) pending — may surface new issues.

---

## 4. EXTERNAL BLOCKERS

### Stripe Account — ✅ RESOLVED
- Identity verification complete. API keys working. Connect OAuth working. CRM checkout working.
- Payouts should now be unblocked.

### Shopify Catalog — ✅ PARTIALLY RESOLVED
- Read-only Storefront API sync working. Products syncing.
- **Next step:** Upgrade to API with write access for one-touch reorder feature (not launch-blocking).

### Twilio A2P 10DLC — STILL WAITING
- Resubmitted with corrected opt-in information and waiver demo with SMS consent checkbox.
- Impact: Until approved, SMS messages may be filtered/blocked by carriers. Not launch-blocking — app works without SMS, just less reliable delivery.

### Apple Developer Account
- Signup in progress. $99/year. Needed for Capacitor iOS app.

### Google Play Developer Account
- Signup in progress. $25 one-time. Needed for Capacitor Android app.

### Mac Computer
- Tony getting access to one. Needed for Xcode/iOS builds.

---

## 5. SUBSCRIPTION & PRICING (FINALIZED)

| | Starter | Pro | Business |
|---|---|---|---|
| Monthly Price | $99 | $169 | $279 |
| Platform Fee | 3% | 1.5% | 0% |
| Fee Model | Deducted from artist's Stripe payout | Same | No fee |
| Sunny AI | 5/month | Unlimited | Unlimited |
| Team Members | 1 | 3 | Unlimited |
| AI Insights | No | Yes | Yes |
| Full Reports | Basic | Full + CSV | Full + CSV |

**CRM Add-On:** $69/month, single tier
- Included free during 60-day Pro trial
- Dedicated phone number, two-way SMS, workflows, broadcasts, Sunny text responder, voice call handling

**Trial:** 60 days Pro + CRM, no credit card required

---

## 6. KEY BUSINESS RULES

- **Chain model:** Chain is raw material in inches. Customers see finished products (bracelet, anklet, etc.), never inch measurements.
- **Jump rings:** 1 per item, 2 for hand chains. Material matching by material_id.
- **Platform fee:** Deducted from artist's Stripe payout via application_fee_amount. Customer never sees a fee. Called "platform fee" internally, never "credit card fee" or "surcharge."
- **Payment recording:** "Charge Customer" = Stripe processes payment. "Record External Payment" = just bookkeeping, no charge processed.
- **Pending sales:** Sales created when payment link is generated have payment_status='pending'. They don't appear in reports and inventory isn't deducted until webhook confirms payment.
- **Sunny rules:** Only 3 Sunstone welders exist (Zapp, Zapp Plus 2, mPulse). Never hallucinate products. Answer only what was asked. 2-3 sentences by default.
- **CRM requires base plan:** Can't purchase CRM standalone after trial.

---

## 7. SECURITY AUDIT — COMPLETED MARCH 7, 2026

Full pre-launch security audit performed. All Critical and High issues fixed.

### Critical Fixes (7/7 — ALL RESOLVED)
- C1: Payment link route — added auth, line items fetched from DB not client body
- C2: Send payment SMS — added auth + session-derived tenant
- C3: Receipt SMS — added auth (matching email receipt pattern)
- C4: Signup route — getUser() verification, caller must match userId
- C5: platform_costs — dropped blanket USING(true) RLS policy
- C6: Deleted debug-tools endpoint (exposed stack traces)
- C7: Enabled RLS on platform_config, sunstone_product_catalog, sunstone_catalog_cache

### High Fixes (6/6 — ALL RESOLVED)
- H1: 15 routes (22 handlers) — tenant_id now derived from session, not client input
- H2: Broadcast routes — added tenant_id ownership checks to detail/send/preview
- H3: Login rate limiting — server-side API, 5 attempts/5 min/IP. Password reset: 3/15 min. No email enumeration.
- H4: tenant_members RLS recursion — replaced with SECURITY DEFINER function (get_user_tenant_role)
- H5: RLS enabled on 6 untracked tables via migration 038
- H6: Admin tenant detail — explicit safe column list (no payment credentials)

### Remaining (not launch-blocking)
- 11 Medium issues (error message sanitization, OAuth state signing, gift card rate limiting, etc.)
- 8 Low issues (input validation library, missing DELETE policies on append-only tables, etc.)
- Will address in first 2 weeks post-launch.

### Migrations Applied
- 036: Fix platform_costs RLS
- 037: Enable RLS on platform_config, sunstone_product_catalog, sunstone_catalog_cache
- 038: Enable RLS on product_types, suppliers, chain_product_prices, materials, event_product_types, platform_admins
- 039: Fix tenant_members recursion with SECURITY DEFINER functions

---

## 8. TECHNICAL ARCHITECTURE

### Database (Supabase/Postgres)
- RLS on ALL tables, verified via security audit
- SECURITY DEFINER functions: get_user_tenant_ids(), get_user_tenant_role()
- Custom function: create_sale_transaction (handles sale creation, sale items, inventory deduction, queue updates)
- Migrations numbered 001-039 in supabase/migrations/

### API Routes (Next.js App Router)
- All at src/app/api/
- ALL routes authenticated (verified in security audit)
- ALL routes derive tenant_id from session via tenant_members lookup (verified in security audit)
- Stripe webhooks: signature-verified, public endpoint
- Login/password reset: server-side rate limiting

### Key Libraries
- Stripe (payments, subscriptions, Connect)
- Twilio (SMS, phone numbers, voice)
- Resend (email)
- Anthropic API (Sunny, Atlas, insights, text responder)
- qrcode (QR generation for payment links)

### Environment Variables (Vercel)
- STRIPE_SECRET_KEY, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY, STRIPE_CLIENT_ID, STRIPE_WEBHOOK_SECRET
- STRIPE_PRICE_STARTER, STRIPE_PRICE_PRO, STRIPE_PRICE_BUSINESS, STRIPE_PRICE_CRM
- TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER
- ANTHROPIC_API_KEY
- RESEND_API_KEY
- NEXT_PUBLIC_APP_URL=https://sunstonepj.app
- NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY

---

## 9. QUEUED FEATURES (Priority Order)

1. **Manual QA Gauntlet** — 180-test checklist across 15 categories. LAST GATE BEFORE LAUNCH.
2. **Referral tracking** — unique codes per client, revenue attribution, configurable rewards
3. **Phone/SMS authentication** — Supabase phone OTP (after Twilio A2P approved)
4. **Capacitor shell + app stores** — wrap Next.js in native iOS/Android shell (after Apple/Google accounts + Mac)
5. **Stripe Terminal + Tap to Pay** — native SDK via Capacitor plugin (after Capacitor shell)
6. **Push notifications** — queue alerts, low stock, event reminders (after Capacitor)
7. **Shopify catalog write access** — upgrade from read-only to support one-touch reorder
8. **Ambassador Program** — paid affiliate program (20% / 8 months). Two ambassador types (artist + external influencer). Stripe Connect Express payouts. See AMBASSADOR_PROGRAM_ROADMAP.md for full spec.
9. **Predictive reorder intelligence** — sales velocity modeling, depletion forecasts
10. **Number porting** — Twilio port-in with LOA for artists with existing business numbers
11. **Multi-location phone numbers** — multiple numbers per tenant for salons
12. **Private party booking engine** — shareable booking page, RSVP, deposits, host rewards
13. **Lead capture tools** — VIP signup QR, branded landing page, Instagram bio link
14. **Offline payments** — store transactions locally, forward when internet restored
15. **Photo capture + watermark** — take photos of finished jewelry with branding

---

## 10. KEY PROJECT DOCUMENTS

**In Project Knowledge:**
- CONTROL_THREAD_PROMPT_V4.md — control thread instructions and full task list
- SUNSTONE_STUDIO_ROADMAP.md — master roadmap with all tasks detailed
- AMBASSADOR_PROGRAM_ROADMAP.md — affiliate program spec (20%/8mo, two types, Stripe Connect)
- STRIPE_TERMINAL_ARCHITECTURE.md — Capacitor + Terminal research and plan
- DESIGN_SYSTEM.md — design philosophy and tokens
- DEPLOYMENT_GUIDE.md — deployment instructions
- KB_DOCUMENT_*.docx — Sunny's knowledge base (critical, do not remove)
- PJUniversity_Courses_and_segment_names.docx
- The_Permanent_Jewelry_Customer_Experience.docx

**In Repo:**
- docs/PROJECT_STATUS.md — this document (also update the repo copy)
- CLAUDE.md — project-level instructions for Claude Code

---

*This document was last updated March 7, 2026 after a full security audit, 7 critical + 6 high vulnerability fixes, multiple bug fixes, and Ambassador Program planning. The platform is ready for manual QA testing — the final step before launch.*
README.md                    ← Repo setup instructions
```

---

## 10. HOW TO START A NEW THREAD

Paste this at the beginning of a new Claude conversation:

"I'm Tony Price, founder of Sunstone Studio (sunstonepj.app). This is a vertical SaaS platform for permanent jewelry artists built with Next.js 15, TypeScript, Supabase, and deployed on Vercel. Please read the PROJECT_STATUS.md file in the project knowledge base for full context on what's built, what's in progress, and what's next. I use Claude Code for implementation — give me prompts to paste, not direct file edits."

---

## 11. WORKFLOW PATTERN

Tony's development workflow:
1. **Plan in Claude chat** (this conversation) — discuss strategy, make decisions
2. **Claude writes the prompt** — detailed, specific instructions for Claude Code
3. **Tony pastes prompt into Claude Code** (VS Code terminal) — Claude Code executes
4. **Tony reports results** — completion report, errors, screenshots
5. **Debug in Claude chat** — fix issues, iterate
6. **Push to Vercel** — git push triggers automatic deployment

Key rules:
- Always output complete Claude Code prompts, not raw code to paste into files
- Run `npm run build` before pushing to catch errors locally
- Run SQL migrations in Supabase SQL Editor manually
- Check Vercel logs for production-specific errors
- Fire-and-forget for non-critical operations (cost logging, analytics)