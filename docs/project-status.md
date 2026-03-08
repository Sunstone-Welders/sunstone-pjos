# Sunstone Studio — Project Status & Context Document
## Last Updated: March 7, 2026

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
- Auth: signup, login, password reset, email confirmation (Supabase Auth)
- Onboarding: kit selection, pricing wizard (flat rate or per-product), product type setup
- 9 theme variations (5 light, 4 dark), custom design system with CSS custom properties
- Staff permissions: Admin/Manager/Staff roles

### POS (Event Mode + Store Mode)
- Full-screen tablet-optimized product grid
- Progressive chain filter by material type
- Per-product flat pricing (customer never sees inch measurements)
- Tip screen with percentage presets (15/20/25%)
- Payment: "Charge Customer" (Stripe QR/text link) or "Record External Payment" (cash/Venmo/external card)
- Jump ring auto-deduction with confirmation step
- Discounts (per-item and cart-level)
- Auto-scroll to product type selector on product tap
- Cash drawer (open/close/track)

### Stripe Payment Links
- QR code payment — customer scans and pays on their phone
- Text-to-pay — send payment link via SMS
- Stripe Connect: artist connects their own Stripe account, payments flow to them
- application_fee_amount: platform fee deducted from artist's payout automatically
- Pending sales excluded from reports until payment confirmed
- Inventory only deducted after payment webhook confirms

### Gift Cards
- Purchase via POS (preset or custom amounts)
- Deliver via SMS, email, or print
- Redemption at POS with code lookup
- Partial redemptions supported (remaining balance tracked)
- Full coverage auto-completes sale with payment_method 'gift_card'
- Management page with status, balance, redemption history

### CRM & Messaging
- Dedicated phone numbers via Twilio (auto-provisioned on signup)
- Two-way SMS conversations stored in conversations table
- Inbound SMS webhook routes to correct tenant by phone number
- Sunny AI text responder: Auto/Suggest/Off modes
- Event mode auto-reply toggle
- Voice call handling: text-only greeting, call forwarding, custom greeting, mute during events
- Broadcast messaging to client segments
- Automated workflows with tag-based enrollment
- Client tags (auto-tagged from events)
- Quick reply toast notifications
- Messages page with inbox, compose new message, unknown number handling

### AI Features
- Sunny (AI Mentor): subsection-level keyword matching, 43+ knowledge chunks
- Sunny tools: add/edit inventory, send messages, look up clients
- Sunny text responder: answers client texts based on tenant's actual data
- Atlas (Admin AI): platform-level intelligence chat
- AI business insights on dashboard
- Landing page Sunny demo with rate limiting

### Inventory
- Chain management (inches-based tracking, sold as finished products)
- Product types with configurable defaults (inches, jump rings per type)
- Jump ring tracking with auto-deduction
- Material/supplier fields, inventory movements
- Low stock alerts
- Product type defaults configurable via gear icon on inventory page

### Events & Queue
- Event CRUD with QR code generation
- Digital waiver with signature capture, PDF generation, SMS consent checkbox
- Queue management with position notifications
- Store Mode queue (waiver check-in gate)

### Clients
- Client management with activity timeline
- Notes, tags, segments
- Conversation history (two-way SMS)
- Unread message badges on client cards

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

### Admin Portal
- Platform admin at /admin
- Tenant management, revenue dashboard
- Admin cost tracker (Anthropic API, Twilio SMS, Resend email costs per tenant)
- Admin AI (Atlas)
- CRM toggle per tenant

### Marketing & Public Pages
- Landing page at sunstonepj.app (Playfair Display headlines, Inter body)
- CRM dedicated marketing page at /crm with Sunny text responder demos
- Privacy policy at /privacy (SMS-specific sections for A2P compliance)
- Terms of service at /terms
- Waiver demo at /waiver (with SMS consent checkbox for Twilio reviewer)

---

## 3. KNOWN BUGS & ACTIVE ISSUES

### Cash Drawer 500 Error ✅ RESOLVED
- Root cause: PATCH handler referenced 'actual_amount' column instead of 'closing_amount'. One-line fix deployed March 7, 2026.
- Also fixed 'variance' → 'difference' and removed nonexistent 'closed_by' column
- React render loop and retry logic fixed in prior commits

### Duplicate Sunstone Supplier
- Default suppliers list sometimes shows "Sunstone" twice
- POST handler now checks for duplicates, but existing data may need cleanup per tenant

### Getting Started Cards
- Onboarding checklist cards disappeared for one tester
- May be a caching issue with the refreshGettingStarted function

---

## 4. EXTERNAL BLOCKERS

### Stripe Account
- **Status:** API keys rotated and working. Connect OAuth working. CRM checkout working.
- **Issue:** "Payouts paused" banner still showing — Stripe reviewing after leaked key incident
- **Action:** Email thread with Lucas at Stripe. Old keys expired. New secret key created and working.
- **Impact:** Payment links, subscription checkout, CRM checkout all work. Payouts to bank may be delayed.

### Twilio A2P 10DLC
- **Status:** Resubmitted with corrected opt-in information
- **Issue:** Previously rejected 3 times for CTA verification issues
- **What was fixed:** Privacy/terms pages created on sunstonepj.app, waiver demo with SMS consent checkbox, opt-in description rewritten
- **Impact:** Until approved, SMS messages may be filtered/blocked by carriers. Phone number provisioning may fail.

### Apple Developer Account
- **Status:** Signup in progress
- **Cost:** $99/year
- **Needed for:** Capacitor iOS app, App Store submission, Tap to Pay entitlement

### Google Play Developer Account
- **Status:** Signup in progress
- **Cost:** $25 one-time
- **Needed for:** Capacitor Android app, Play Store submission

### Mac Computer
- **Status:** Tony getting access to one
- **Needed for:** Xcode, iOS builds (hard Apple requirement)

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

**CRM Add-On:** $69/month, single tier (no Essentials/Pro split)
- Included free during 60-day Pro trial
- Dedicated phone number, two-way SMS, workflows, broadcasts, Sunny text responder, voice call handling

**Trial:** 60 days Pro + CRM, no credit card required
- Can select a plan during trial (deferred billing)
- Warnings at 14/7/3/1 days
- Post-trial: features locked, data preserved, overlay prompts plan selection

---

## 6. KEY BUSINESS RULES

- **Chain model:** Chain is raw material in inches. Customers see finished products (bracelet, anklet, etc.), never inch measurements.
- **Jump rings:** 1 per item, 2 for hand chains. Material matching by material_id.
- **Platform fee:** Deducted from artist's Stripe payout via application_fee_amount. Customer never sees a fee. Called "platform fee" internally, never "credit card fee" or "surcharge."
- **Payment recording:** "Charge Customer" = Stripe processes payment. "Record External Payment" = just bookkeeping, no charge processed.
- **Pending sales:** Sales created when payment link is generated have payment_status='pending'. They don't appear in reports and inventory isn't deducted until webhook confirms payment.
- **Sunny rules:** Only 3 Sunstone welders exist (Zapp, Zapp Plus 2, mPulse). Never hallucinate products. Answer only what was asked. 2-3 sentences by default. Brevity is respect.
- **CRM requires base plan:** Can't purchase CRM standalone after trial.

---

## 7. TECHNICAL ARCHITECTURE

### Database (Supabase/Postgres)
- RLS on all tables, verified by Supabase Security Advisor
- Key enums: payment_method (stripe_link, cash, venmo, card_external, gift_card), sale_status, payment_status, fee_handling
- Custom function: create_sale_transaction (handles sale creation, sale items, inventory deduction, queue updates)
- Migrations numbered 001-035 in supabase/migrations/

### API Routes (Next.js App Router)
- All at src/app/api/
- Key patterns: createServerSupabase() for user-session queries, createServiceRoleClient() for admin/webhook operations
- Stripe webhooks at /api/stripe/webhook
- Twilio inbound SMS at /api/twilio/inbound
- Twilio voice at /api/voice/inbound

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

## 8. QUEUED FEATURES (Priority Order)

1. **Referral tracking** — unique codes per client, revenue attribution, configurable rewards
3. **Phone/SMS authentication** — Supabase phone OTP (after Twilio A2P approved)
4. **Capacitor shell + app stores** — wrap Next.js in native iOS/Android shell (after Apple/Google accounts + Mac)
5. **Stripe Terminal + Tap to Pay** — native SDK via Capacitor plugin (after Capacitor shell)
6. **Push notifications** — queue alerts, low stock, event reminders (after Capacitor)
7. **Shopify catalog integration** — browse + reorder supplies in-app
8. **Predictive reorder intelligence** — sales velocity modeling, depletion forecasts
9. **Number porting** — Twilio port-in with LOA for artists with existing business numbers
10. **Multi-location phone numbers** — multiple numbers per tenant for salons
11. **Private party booking engine** — shareable booking page, RSVP, deposits, host rewards
12. **Lead capture tools** — VIP signup QR, branded landing page, Instagram bio link
13. **Offline payments** — store transactions locally, forward when internet restored
14. **Photo capture + watermark** — take photos of finished jewelry with branding

---

## 9. DOCUMENT CLEANUP RECOMMENDATIONS

### KEEP (Still relevant)
- **SUNSTONE_STUDIO_ROADMAP.md** — Master roadmap, update with current status
- **STRIPE_TERMINAL_ARCHITECTURE.md** — Capacitor + Terminal research, still the plan
- **DESIGN_SYSTEM.md** — Design philosophy and tokens, still accurate
- **README.md** — Update with current setup instructions

### ARCHIVE (Move to docs/archive/)
These are historical completion reports. Useful for reference but clutter the root:
- All TASK_*_COMPLETION_REPORT.md files (13 files)
- WORKER_THREAD_*.md files (2 files)
- CONTROL_THREAD_PROMPT.md, V2, V3 (keep V4 only)
- POST_DEPLOY_FIXES_COMPLETION_REPORT_v2.md
- DEPLOYMENT_COMPLETION_REPORT.md
- ADMIN_INSIGHTS_COMPLETION_REPORT.md
- TASK_SUNNY_PERFORMANCE_COMPLETION_REPORT.md
- TASK_CHAIN_PRODUCTS.md, v2, v3 (superseded)
- TASK_CHAIN_QUEUE_POS_INTEGRATION.md, V2 (superseded)
- TASK_GROUP_B_INVENTORY_FORM_UX.md (completed)
- TASK_FINANCIAL_ACCURACY.md, COMPLETION.md (completed)
- TASK_C_WORKER_PROMPT.md (completed)

### DELETE or MERGE
- **GAP_ANALYSIS.md** — Outdated, references free tier, old pricing. Delete.
- **IMPLEMENTATION_SUMMARY.md** — Phase 0 summary, very old. Delete.
- **REFACTORING_GUIDE.md** — Old refactoring plan, completed. Delete.
- **INTEGRATION_GUIDE.md** — Old integration notes. Delete.
- **CHAIN_PRODUCTS_INTEGRATION_GUIDE.md** — Completed, merged into codebase. Delete.
- **QUICK_START.md** — May be outdated. Review and update or delete.
- **SQUARE_DEBUG_CHECKLIST.md** — Square removed from product. Delete.
- **CONTROL_THREAD_FEEDBACK_TWILIO_QUEUE.md** — Outdated feedback. Delete.
- **PJOS_DESIGN_SPEC_V2.md** — Old design spec. Review, merge useful parts into DESIGN_SYSTEM.md, delete.
- **PROJECT_STATUS_REPORT.md** — February 2026 version, superseded by this document. Delete.

### UPDATE
- **CONTROL_THREAD_PROMPT_V4.md** — Update pricing ($49→$69 CRM, fee model change), add new features
- **SUNSTONE_STUDIO_ROADMAP.md** — Update completed items, reorder priorities

### Recommended Final Structure:
```
docs/
  PROJECT_STATUS.md          ← This document (single source of truth)
  SUNSTONE_STUDIO_ROADMAP.md ← Feature roadmap
  DESIGN_SYSTEM.md           ← Design tokens and philosophy
  STRIPE_TERMINAL_ARCHITECTURE.md ← Capacitor + Terminal plan
  archive/                   ← All old completion reports
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