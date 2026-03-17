# Sunstone Studio — Project Status & Context Document
## Last Updated: March 15, 2026 (Evening)

---

## What This Document Is

This is the single source of truth for the Sunstone Studio project. It contains everything a new Claude thread needs to pick up where the last one left off. Keep this updated after every major session.

---

## 1. PROJECT OVERVIEW

**Product:** Sunstone Studio — a vertical SaaS platform for permanent jewelry artists
**URL:** https://sunstonepj.app (live on Vercel, not yet publicly launched)
**Company:** Sunstone Welders (permanentjewelry.sunstonewelders.com)
**Founder:** Tony Price
**Stack:** Next.js 15, TypeScript, Supabase (Postgres + Auth + RLS), Tailwind CSS, Vercel

**What it does:** All-in-one business platform for permanent jewelry artists — POS (Event Mode + Store Mode), smart inventory management with tier pricing, client CRM with two-way SMS, AI mentor (Sunny), AI admin intelligence (Atlas), event/queue management, digital waivers, gift cards, warranty protection system, financial reporting with transaction-level detail, automated workflows, Stripe payments, subscription billing, Artist Storefront (public profile page), private party booking engine, and a 9-theme design system.

**Business model:**
- Subscription tiers: Starter ($99/mo), Pro ($169/mo), Business ($279/mo)
- Platform fee: 3% / 1.5% / 0% deducted from artist's Stripe payouts (artist-absorbed, customer never sees it)
- CRM add-on: $69/mo (included free in 60-day Pro trial)
- 60-day Pro trial for all new signups, no credit card required
- Revenue streams: subscriptions + platform fees + CRM add-on + Sunstone product sales (driven by in-app reorder)

---

## 2. WHAT'S BUILT AND WORKING

### Core Platform
- Multi-tenant architecture with RLS, UUID primary keys, tenant_id isolation
- Auth: signup, login (server-side rate limited), password reset (rate limited, no email enumeration), email confirmation
- Onboarding: kit selection, pricing wizard (flat rate, per-product, or by tier), product type setup
- 9 theme variations (5 light, 4 dark), custom design system with CSS custom properties
- Staff permissions: Owner/Manager/Staff roles
- tenant_members RLS uses SECURITY DEFINER functions (no recursion)

### POS (Event Mode + Store Mode)
- Full-screen tablet-optimized product grid
- Progressive chain filter by material type
- Tier filter chips when pricing_mode = 'tier' (additive with material filter)
- Per-product flat pricing (customer never sees inch measurements)
- Tip screen with percentage presets (15/20/25%)
- Payment: "Charge Customer" (Stripe QR/text link) or "Record External Payment" (cash/Venmo/external card)
- Jump ring auto-deduction with confirmation step
- Discounts (per-item and cart-level)
- Warranty protection (per-item and per-invoice, editable amounts at sale time)
- Cash drawer (open/close/track)
- Party event tagging: sales at party events auto-tagged with party_request_id for revenue tracking
- **Tappable revenue display** — tap the revenue number in POS header to see all transactions for current event (Event Mode) or today's store sales (Store Mode) in a slide-up SalesPanel
- **Mobile navigation** — Tab order: Home → Messages → POS (raised center) → CRM → More. Bottom nav hidden inside POS sessions. POS raised button z-index fixed.
- **POS Event Mode header** — 2-row layout: Row 1 = back button + title + icon buttons; Row 2 = queue pill. Safe area inset padding for iPhone notch. Back button 44px touch target.

### Stripe Payment Flow (FULLY WORKING — March 15, 2026)
- **QR code payment** — customer scans and pays on their phone ✅ End-to-end working
- **Text-to-pay** — send payment link via SMS ✅ End-to-end working (was completely broken, fixed March 15)
- Stripe Connect: artist connects their own Stripe account, payments flow directly to them
- application_fee_amount: platform fee deducted from artist's payout automatically
- Payment link route authenticated, line items fetched from DB (not client-supplied)
- `/pay/[sessionId]` redirect page — avoids iOS SMS URL truncation of raw Stripe URLs with `#` characters
- `checkout_sessions` table (migration 052) — stores session→tenant mapping at creation so `/pay` page can resolve `stripe_account_id` before payment completes
- `/api/session-status` route is public (security via unguessable cs_live_xxx session ID) — previously had auth gate that blocked polling
- Session status polling: checks DB every 3s, Stripe API fallback every 9s, 10-minute timeout with retry button
- **Belt-and-suspenders sale status update:** Polling updates sale to `payment_status: 'completed'` immediately on detection (with `.eq('payment_status', 'pending')` guard). Webhook remains authoritative source — polling is the UX fast-path.
- Branded `/payment-success` page — customer sees checkmark + "Payment Complete!" instead of being redirected to login
- `success_url` uses Stripe template variable: `${baseUrl}/payment-success?session_id={CHECKOUT_SESSION_ID}`
- Pending sales excluded from reports until payment confirmed
- Inventory only deducted after payment confirmed

### Gift Cards
- Purchase via POS (preset or custom amounts)
- **Stripe payment support** — "Charge Customer" (QR + Text Link) in addition to "Record External Payment" (SHIPPED March 15)
- Gift card only activated/delivered AFTER Stripe payment confirmed (not on pending)
- Platform fee applies to gift card Stripe payments same as regular sales
- SMS phone pre-filled from recipient phone number in Stripe text link flow
- Form data stored in refs to avoid stale closure issues during polling
- Deliver via SMS, email, or print
- Redemption at POS with code lookup
- Partial redemptions supported, balance tracking

### Pricing Tiers (SHIPPED — March 14, 2026)
- Third pricing mode alongside Flat Rate and Per Product
- `pricing_tiers` table: tenant-scoped, named tiers (e.g., "Sterling Silver," "Gold Filled," "Premium/14k")
- Each tier stores default prices for all product types (bracelet, anklet, ring, necklace/inch, hand chain)
- `tenants.pricing_mode` column: 'flat', 'per_product', or 'tier'
- Settings → Default Pricing: pricing mode selector (3 visual cards), full tier CRUD (add/edit/delete/reorder)
- Inventory: chain edit shows tier dropdown when mode = tier, auto-fills product prices from tier defaults
- POS: tier filter chips in product picker (additive with material filter), both Event Mode and Store Mode
- Events: "Select by Tier" quick-select in event inventory setup, shows X/Y chain counts per tier
- Artist Storefront: optional "Show pricing by tier" toggle, renders tier cards with product prices on public page
- Onboarding: "By Tier" third option in pricing wizard
- Underlying data stays in chain_product_prices — tiers are a convenience layer that batch-sets and groups prices

### Warranty Protection System (SHIPPED — March 14, 2026)
- Warranty sales: per-item (shield icon on each cart line) and per-invoice (cart summary button)
- Default amounts configurable in Settings, editable at POS during each sale
- Tax handling: taxable by default with toggle to exempt (most US states tax warranties)
- Coverage terms: editable text in Settings, snapshotted on each warranty at time of sale
- Duration options: Lifetime (default), 6 months, 1 year, 2 years, or custom days
- `warranties` table: linked to sale, sale_item (per-item), client; tracks status, coverage terms, expiration, photo_url (future)
- `warranty_claims` table: full claim workflow with description, repair details, status (submitted → in_progress → completed/denied)
- Dashboard → Warranties tab: list view with stat cards (total, active, claimed, value), status badges, search/filter, detail modal
- Claim filing from warranty detail: description, status, repair details, notes
- Claim management: edit claims, "Mark Completed" quick action, resolution timestamps
- Void warranty with confirmation dialog
- Receipts: per-item warranty shows beneath warranted item, per-invoice warranty in summary, coverage terms block at bottom
- All receipt channels updated: in-app ReceiptScreen, email (Resend HTML), SMS
- `photo_url` field ready for future camera/watermark feature (TASK-21)
- Future: when photo capture ships, warranty purchases will include a photo on file

### Inventory
- Chain management (inches-based with cost_per_inch)
- Per-product-type pricing: bracelet_price, anklet_price, ring_price, necklace_price_per_inch
- Material and supplier fields
- Jump ring tracking
- Inventory movements (sale, restock, waste, adjustment)
- Low stock alerts via reorder_threshold
- Product types with configurable default lengths
- **Scroll position preserved** when editing items — saves scrollTop before modal, restores via requestAnimationFrame after save/cancel
- **Cost entry per-inch/per-foot toggle** for chains — artist can enter supplier's per-foot price, auto-converts to per-inch (÷12) with live preview
- Gear icon navigates to Settings → Default Pricing (shortcut, not separate modal)
- UTF-8 encoding fixed on search placeholder

### Clients & CRM
- Client management with activity timeline, notes, tags, segments
- Conversation history (two-way SMS) with phone normalization
- Secondary phone numbers per client (client_phone_numbers table)
- Phone number matching uses normalized 10-digit comparison (catches all format variations)
- Orphaned conversations retroactively linked when client is matched
- "Link to Client" action for unknown number conversations
- Unread message badges on client cards
- Message templates with variable support ({{first_name}}, {{business_name}}, plus party-specific vars)
- SMS/email broadcasts with recipient targeting and tenant ownership checks
- Automated workflows with step builder (trigger → delay → send template)
- Workflow enrollment from client profiles (mobile-friendly)
- Follow-up queuing
- "Send Party Booking Link" from client profile (sends SMS with storefront booking link)

### SMS & Twilio (FULLY LIVE — March 12, 2026)
- **A2P 10DLC campaign approved and connected to Messaging Service**
- All outbound SMS sent via Messaging Service SID (A2P compliant)
- Phone number provisioning via app: auto-buys number, sets webhook, adds to Messaging Service sender pool
- Phone number release: removes from Messaging Service, releases in Twilio
- Inbound SMS webhook at /api/twilio/inbound — routes by dedicated_phone_number to correct tenant
- Two-way SMS conversations working (inbound + outbound)
- Auto-reply support (configurable per tenant)
- Sunny AI text mode: auto (sends AI reply) or suggest (stores suggestion for artist to review)
- SMS consent checkbox on waiver page with carrier-required language
- Env vars: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER, TWILIO_MESSAGING_SERVICE_SID

### Artist Storefront (SHIPPED — March 12, 2026)
- Public profile page at /studio/[slug] — no auth required
- Auto-populated from existing tenant data (zero setup)
- Sections: hero (name, bio, location, logo), services & pricing menu, upcoming events with waiver links, party booking form, contact & social links
- Optional tier pricing display (when pricing_mode = tier and toggle enabled)
- Uses tenant's accent color for brand consistency
- "Powered by Sunstone Studio" footer (brand growth engine)
- SEO meta tags with dynamic content (Open Graph, title, description)
- Profile settings in dashboard: enable/disable, section visibility toggles, bio, social URLs, city/state, show tier pricing toggle
- Default: enabled for all tenants
- Middleware exclusion: /studio/ routes are public
- Available on ALL tiers (competitive differentiator vs Vault's $300/mo website hosting)

### Party Booking Engine (SHIPPED — March 12, 2026)
**Basic (ALL tiers):**
- Booking request form on Artist Storefront (inline, not modal)
- Party request fields: host name, email, phone, date, time, guests, occasion, message
- Dashboard → Parties page with list view and detail panel
- Status management: New → Contacted → Confirmed → Deposit Paid → Completed → Cancelled
- RSVP page at /studio/[slug]/party/[partyId] — shareable link for guests
- RSVP with attendance toggle, plus-ones
- Waiver option on RSVP: "Sign My Waiver Now" or "I'll Sign at the Party"
- Booking confirmation SMS auto-sends to host on submission
- Rate-limited public submissions (5/hour/IP)
- Create event from party request (pre-fills event details)

**Advanced (CRM add-on):**
- Stripe deposit collection: "Send Deposit Link" → Stripe Checkout on artist's Connect account, no platform fee (FIXED March 15 — was silently failing due to useEffect dependency resetting deposit amount)
- Deposit webhook updates party status and notifies artist + host
- Enhanced RSVP management: waiver status tracking, guest count with plus-ones, CSV export
- Minimum sales guarantee: editable per party, visual progress bar, post-party tracking
- Host rewards system: configurable threshold and reward, auto-calculates on completion, "Mark Redeemed"
- Post-party revenue breakdown: total revenue, per-guest spending, top products, sales linked via party_request_id
- Party reward settings in tenant settings (CRM-gated)

**Automated Host Sequences (CRM-gated except booking confirmation):**
- 9 host templates: booking confirmation, confirmed, 1-week reminder, day-before, morning-of, post-party thank you, host reward earned, guest RSVP reminder, cancellation
- Trigger on status changes: new → confirmation, confirmed → schedules reminders, completed → thank you + reward, cancelled → cancels pending + notifies host
- Scheduled messages with individual cancel capability
- Messages tab in party detail shows sent + scheduled messages
- Settings: auto-reminders toggle, template customization

**Automated Guest Sequences (SHIPPED — March 12, 2026, CRM-gated except aftercare):**
- Two-track system: Track A (waiver signers, full consent) = 4 messages, Track B (RSVP-only) = 2 messages
- Track A messages: Day 0 aftercare, Day 3 social share ask, Day 10 "book your own party," Day 21 stack/collection nudge
- Track B messages: Day 0 aftercare, Day 3 opt-in invite (no further marketing)
- Auto-creates clients from Track A guests with "Party Guest" tag
- Smart exit conditions: Day 10 and Day 21 messages skipped if guest has booked a party or made a purchase
- Skipped messages logged with reason
- Guest messages visible in party detail Messages tab (grouped by recipient)
- Settings: guest sequences toggle, template customization

### Events & Queue
- Event CRUD with booth fee, tax profiles
- **Event chain selection** — selected_chain_ids on events table, tier-based quick-select in event setup
- QR codes for public waiver access
- Digital waiver with signature capture, PDF generation, SMS consent checkbox
- Queue management with position notifications
- Store Mode queue (waiver check-in gate)

### Reports & Financial (ENHANCED — March 15, 2026)
- **Transactions tab** — new tab alongside Overview and Events showing individual sale detail (SHIPPED March 15)
- Each transaction row: time, client name (or "Walk-in"), items summary, total amount, payment method icon/label, payment status badge
- Expandable rows: full line items with individual prices, tip, tax, warranty, discount, platform fee
- **Shared TransactionList component** — used in both Reports and POS SalesPanel
- CSV export includes transaction-level detail
- Event P&L with COGS breakdown (chain costs + jump ring costs)
- Business-wide reports with date/source filters
- **Date picker timezone fix** — dates parsed as local timezone (appends T00:00:00) instead of UTC, preventing off-by-one day shift (FIXED March 15)
- Platform fee tracking (platform_fee_collected on sales)
- Cash drawer summary in event reports
- Gift card metrics
- Payment method breakdown (stripe_link, cash, venmo, card_external, gift_card)
- Manual expense tracking with categories and recurring expenses
- Full P&L with expense breakdown and refund support
- Warranty revenue included in sale totals

### Subscription & Billing
- Stripe Checkout for base subscriptions with deferred billing during trial
- CRM add-on checkout ($69/mo) with deferred billing
- Trial warnings at 14/7/3/1 days
- Post-trial lockout overlay (can see data, can't use features)
- CRM gating: features lock when trial expires without CRM subscription

### AI — Sunny (Mentor)
- 1,457+ line knowledge base from 45+ official Sunstone documents
- Streaming chat with subsection-level keyword matching (43 chunks, 28 keywords for weld settings)
- Agentic tool execution (35 tools — added `list_pricing_tiers` and `assign_pricing_tier` on March 15)
- Anti-narration instruction — Sunny acts first, doesn't list data before acting
- Prompt caching for ~70% cost reduction
- Dedicated --mentor-bubble-* CSS variables for readable contrast on all 9 themes
- Rate limited (5 questions/month on Starter to protect PJ University content)
- **Official weld settings chart** embedded in knowledge base — all 4 gauge categories × 6 materials × 3 welders with guardrails preventing Sunny from guessing joule settings
- **Aftercare policy unified** — "free repairs for life as long as you still have the chain" across all knowledge sections, templates, and messages
- Knowledge gap detection: logs unanswerable questions to mentor_knowledge_gaps table
- **User-reported error flagging:** thumbs-down button on every assistant message + text detection for correction phrases (e.g., "that's wrong")
- Learning system: Admin reviews gaps → approves/dismisses → approved answers stored in mentor_knowledge_additions. Source badges distinguish auto-detected gaps from artist-flagged errors.
- **Sunny personality presets** for customer-facing messages (SMS/email): 5 tones (Warm & Bubbly, Polished & Professional, Luxe & Elegant, Fun & Playful, Short & Sweet) + custom flavor text. Does NOT affect in-app mentor chat personality.
- **Chat input UX** — starts as single line, auto-expands to 120px max. Bottom safe-area padding. Stray border on send button removed.

### AI — Atlas (Admin)
- 11 tools for platform management
- Tenant management, platform stats, revenue queries
- Knowledge gap tools: list pending gaps, approve/dismiss
- Streaming chat with slate/amber styling

### Admin Portal
- Platform admin at /admin
- Tenant management, revenue dashboard
- Admin cost tracker (Anthropic API, Twilio SMS, Resend email costs per tenant)
- Sunny's Learning tab: review pending knowledge gaps, approve/dismiss, manual additions. **Filter by source:** auto-detected gaps vs artist-flagged errors (thumbs-down) vs artist text corrections. Artist-flagged items sort to top. Shows flagged message, correction note, and conversation context.
- CRM toggle per tenant
- Tenant detail returns explicit safe column list (no payment credentials exposed)

### Marketing & Public Pages
- Landing page at sunstonepj.app with "Your Artist Storefront" feature section (screenshot + copy)
- Pricing tier comparison: Artist Storefront + basic party booking on all tiers
- CRM section: advanced party booking features (deposits, RSVP, reminders, host rewards)
- CRM marketing page at /crm with updated party booking features
- Privacy policy at /privacy (SMS-specific sections for A2P compliance)
- Terms of service at /terms
- Static server-rendered SMS consent page at /sms-consent
- Sunny demo widget on landing page

### Shopify Catalog (Partial)
- Read-only Storefront API sync working — products syncing into app
- Sunny references real Sunstone products and prices
- Cost data auto-populates inventory items
- Credentials: Client ID + Client Secret (read-only scope currently)
- **Next step:** Admin updating Shopify app to add write_products + write_draft_orders scopes → will generate shpat_ Admin API token. Add as SHOPIFY_ADMIN_TOKEN in Vercel to unblock one-touch reorder (TASK-7).

---

## 3. CURRENT STATUS — MARCH 17, 2026

**Platform is in final pre-launch state.** Security audit complete. All critical/high vulnerabilities fixed. SMS pipeline fully live. Artist Storefront and Party Booking shipped. Tier Pricing and Warranty systems shipped. Stripe payment flow fully working end-to-end (QR + Text Link). Manual QA (180-test checklist) is the remaining gate before launch.

**Completed March 16-17 — Dashboard, Landing Page, Sunny KB, Bug Fixes:**

Dashboard UX:
- ✅ Getting Started card: dismiss button + theme step auto-complete on click-through
- ✅ Getting Started: 3-second "You're all set!" congrats then auto-dismiss (no more 7-day timer)
- ✅ Today's Priorities card: data-driven action items (upcoming events, low stock, unread messages, party requests, warranty claims)
- ✅ Growth Tip card: rules-based, stage-aware (new/growth/established), daily rotation, Sunny branding

Landing Page (3 full overhaul passes):
- ✅ Complete rewrite with Sunstone brand fonts (The Picnic Club Bold/Regular/Italic/Script via woff2)
- ✅ Montserrat for body text (Google Fonts)
- ✅ Marketing-fonts.css isolated from app UI — dashboard fonts unchanged
- ✅ Benefits-first copy: "Grow Your PJ Business with Confidence"
- ✅ Color palette: #7A234A primary, #FAF7F0 header/footer, #1D1D1D text, #FFFFFF backgrounds
- ✅ 3 rendered Sunny phone mockup demos (HTML/CSS, not screenshots): "Your AI Writing Partner", "Always Professional", "Takes Action For You"
- ✅ Mobile Sunny demos: vertical stack (not horizontal carousel)
- ✅ 4 professional human photos placed throughout page
- ✅ "Start Free" CTA after benefits section
- ✅ "Still have questions?" section before final CTA
- ✅ Footer updated to #FAF7F0 warm cream
- ✅ Hero: dashboard screenshot only on desktop, human photo as separate divider
- ✅ Feature card screenshots with contain styling + border treatment
- ✅ Mobile nav links restored (Features, Pricing, FAQ)
- ✅ CRM page colors updated to match

Bug Fixes:
- ✅ Migration 053: auto_email_receipt + receipt columns on tenants table
- ✅ Duplicate Sunstone supplier: dropdown dedup by name (case-insensitive)
- ✅ "Clasp" added as inventory item type
- ✅ "Lavinia" spelling fixed in 4 code files + SQL data fix for existing tenants
- ✅ Sunny chat widget ✦ sparkle rendering fixed
- ✅ Sunny chat widget send button → arrow rendering fixed

Sunny Knowledge Base Overhaul:
- ✅ Full 18-finding audit across all KB documents (contradictions, gaps, misspellings, missing docs)
- ✅ Consolidated SUNNY_KNOWLEDGE_BASE.md (730 lines, 18 sections) — single source of truth
- ✅ Synced to mentor-knowledge.ts: 9 content updates + 8 new chunks (ring welding, removal, stainless steel, jump rings, yield math, chain universality, customer journey, objection handling, shipping/policies)
- ✅ System prompt updated (secondary phone number, communication style)
- ✅ 249-test retrieval suite — 100% passing (scripts/test-sunny-knowledge.ts)
- ✅ 50-test response quality suite ready for manual runs (scripts/test-sunny-responses.ts)
- ✅ 20 subsection keyword expansions to fix retrieval gaps
- ✅ npm run test:sunny:retrieval / test:sunny:responses / test:sunny scripts added

Key KB decisions locked:
- Aftercare: free repairs for life with chain. No 24-hour lotion rule. No 60-day/$20.
- Repairs: free for your customers, charge walk-ins $25-35
- Power settings: simplified ranges as default, chart when machine/material specified, MUST ask gauge if material given without gauge
- Removal: cut jump ring not chain link
- Ring welding: off-hand, measure snug, great upsell opportunity
- Stainless: weldable, no judgment, hard-wire cutters required, SS/GF jump rings for safety break point
- Enamel: fine to use, distinguish from plated by metal quality
- Chain naming: Sunstone names first, style descriptions secondary
- Jump rings: thickest gauge that fits, 3mm ID standard, match visual weight
- Never precut chains
- KB17 brevity default everywhere, full answers only when asked
- Emoji toggle: no in mentor chat, artist-controlled for customer-facing (feature backlogged)
- KB18 replaced by Shopify catalog
- Both phone numbers active (385-999-5240 default, 801-658-0015 main)

**Completed March 15 — Payment Flow, Transaction Visibility, Bug Fixes:**

Payment Flow (was completely broken, now fully working):
- ✅ Silent error handling replaced with real error surfacing via toast across PaymentScreen and API routes
- ✅ `expires_after` → `expires_at` (Unix timestamp) fixed in payment-link and party deposit routes
- ✅ iOS SMS URL truncation at `#` fixed — new `/pay/[sessionId]` redirect page, SMS sends `sunstonepj.app/pay/cs_live_xxx`
- ✅ Next.js `redirect()` swallowed by bare `catch{}` — moved outside try/catch
- ✅ `checkout_sessions` table (migration 052) — session→tenant mapping for `/pay` page
- ✅ `/pay` and `/payment-success` added to public middleware routes
- ✅ Auth gate removed from `/api/session-status` route — was blocking all polling (security via unguessable session ID)
- ✅ Stale closure bug fixed — `startPolling(saleId)` → `startPolling(saleId, sessionId)`, session ID passed as parameter instead of read from stale closure
- ✅ Belt-and-suspenders: polling now updates `payment_status: 'completed'` in DB on detection (with pending guard)
- ✅ `credentials: 'include'` added to all 5 authenticated fetch calls in PaymentScreen + PendingPayments
- ✅ Branded `/payment-success` page with checkmark + "Payment Complete!" for customers
- ✅ `success_url` uses Stripe template variable for session ID

Gift Card Stripe Payments:
- ✅ New `/api/gift-cards/checkout` route — creates sale record, Stripe Checkout Session, stores checkout_sessions mapping
- ✅ GiftCardModal rewritten: "Charge Customer" (QR + Text Link) + "Record External Payment"
- ✅ Gift card activated/delivered only after Stripe payment confirmed
- ✅ Form data stored in refs to avoid stale closure issues
- ✅ SMS phone pre-filled from recipient phone number

Reports & Transaction Visibility:
- ✅ New Transactions tab in Reports with shared TransactionList component
- ✅ Expandable transaction rows with full line item detail
- ✅ Tappable revenue in POS — SalesPanel shows all transactions for event/store session
- ✅ Date picker timezone fix (UTC → local, prevents off-by-one)
- ✅ Belt-and-suspenders sale status update ensures sales appear in reports immediately

Party Deposit:
- ✅ "Send Link" button fixed — useEffect dependency was resetting deposit amount on unrelated state changes
- ✅ Silent guard replaced with toast.error('Enter a deposit amount')
- ✅ `credentials: 'include'` added

Data Consistency:
- ✅ `payment_status` enum audit: `pending`, `completed`, `failed`, `refunded` — all consistent
- ✅ `'expired'` was used in 3 places but isn't a valid enum value — changed to `'failed'` in webhook, PendingPayments, and party revenue route

Mobile & UX:
- ✅ Mobile nav tab order fixed (Home → Messages → POS → CRM → More)
- ✅ POS raised button z-index fixed
- ✅ Bottom nav hidden inside POS sessions
- ✅ POS Event Mode header reorganized (2-row layout with safe area insets)
- ✅ Sunny chat input: single line → auto-expand to 120px max, safe-area padding, border fix
- ✅ Inventory search placeholder UTF-8 encoding fixed

Sunny AI:
- ✅ `list_pricing_tiers` and `assign_pricing_tier` tools added (tools 34-35)
- ✅ Anti-narration instruction added to system prompt

**Completed March 14:**
- ✅ Inventory scroll position fix
- ✅ Tier Pricing: full system (DB, Settings, Inventory assignment, POS filter, Event selection, Storefront display, Onboarding option)
- ✅ Warranty Protection: full system (DB, Settings, POS per-item + per-invoice, sale recording, Tracking tab with claims workflow, Receipt integration across all channels)
- ✅ Settings consolidation — Product Type Defaults moved into Settings → Default Pricing
- ✅ Cost entry per-inch/per-foot toggle for chains

**Completed March 13:**
- ✅ Weld settings chart added to Sunny knowledge base
- ✅ Thumbs-down flagging + text detection for wrong answers
- ✅ Admin Learning tab upgraded with source badges and filters
- ✅ Settings Communications reorganized into 3 accordion cards
- ✅ Sunny personality presets (5 tones + custom)
- ✅ Aftercare content unified ("free repairs for life with the chain")
- ✅ MentorChat focus bug fixed
- ✅ Thumbs-down icon fixed

**Completed March 12:**
- ✅ Twilio A2P 10DLC campaign connected to Messaging Service
- ✅ Two-way SMS fully operational
- ✅ Artist Storefront (public profile page)
- ✅ Full party booking engine (basic all tiers + advanced CRM-gated)
- ✅ Host + Guest automated sequences
- ✅ Landing page, pricing table, CRM page copy updated

**Migrations applied:** 001-053
- 047: knowledge gap user flags
- 048: sunny personality columns
- 049: pricing_tiers table, tenants.pricing_mode, inventory_items.pricing_tier_id
- 050: events.selected_chain_ids for event chain selection
- 051: warranty system (warranties table, warranty_claims table, tenant warranty settings, sales/sale_items warranty_amount)
- 052: checkout_sessions table (session→tenant mapping for /pay redirect page)
- 053: auto_email_receipt + receipt columns on tenants table

**Primary remaining work:**
- Manual QA Gauntlet (180 tests) — final launch gate (now includes tier pricing + warranty + payment flow testing)
- Apple Developer Account setup (in progress — needed for Capacitor/App Store)
- TASK-7: Shopify one-touch reorder (pending shpat_ Admin API token from Shopify admin)
- TASK-4/5/6: Push notifications, Capacitor shell, Stripe Terminal (post-launch)

---

## 4. KNOWN BUGS & ACTIVE ISSUES

### All Previously Known Bugs — RESOLVED
- Cash drawer 500 error — ✅ Fixed
- Sunny contrast on light themes — ✅ Fixed
- Platform fee misleading copy — ✅ Fixed
- Workflow enrollment mobile — ✅ Fixed
- SMS consent on waiver — ✅ Fixed
- Duplicate Sunstone supplier — ✅ Fixed
- Getting Started cards disappearing — ✅ Fixed
- Sunny knowledge gap learning system — ✅ Fixed (migration 040)
- Duplicate SMS conversations — ✅ Fixed (migration 045, phone normalization)
- "Send Party Booking Link" 400 error — ✅ Fixed (property name mismatch: body → message)
- "Create Event from Party" crash — ✅ Fixed (Suspense boundary + useSearchParams + Link component)
- Sunny giving wrong weld settings — ✅ Fixed (quickRuleOfThumb shortcuts + narrow keywords)
- MentorChat input losing focus — ✅ Fixed
- Thumbs-down icon rendering as yellow blob — ✅ Fixed (lucide-react)
- Aftercare content inconsistent — ✅ Unified
- Inventory scroll jumping to top after save — ✅ Fixed (scroll position preserved)
- Stripe QR payment not working — ✅ Fixed (multiple issues, March 15)
- Stripe Text Link payment not detected — ✅ Fixed (auth gate + stale closure, March 15)
- Party deposit "Send Link" not working — ✅ Fixed (useEffect dependency reset, March 15)
- Reports date picker off by one day — ✅ Fixed (UTC→local timezone, March 15)
- Sales not appearing in reports — ✅ Fixed (belt-and-suspenders status update + enum consistency, March 15)
- `'expired'` status not in DB enum — ✅ Fixed (changed to 'failed' in 3 places, March 15)

### No Active Bugs as of March 15, 2026 (evening)

Comprehensive QA testing of all features pending (180-test checklist).

---

## 5. TWILIO / SMS STATUS — FULLY LIVE

- ✅ A2P 10DLC campaign approved
- ✅ Campaign connected to "Sunstone Studio" Messaging Service (MGb67a7737a07801aa79c211...)
- ✅ Outbound SMS via Messaging Service SID (A2P compliant)
- ✅ Inbound SMS webhook at /api/twilio/inbound — routing by dedicated_phone_number
- ✅ Phone provisioning via app — auto-buys, sets webhook, adds to Messaging Service
- ✅ Phone release — removes from Messaging Service, releases in Twilio
- ✅ Two-way conversations working
- ✅ Auto-reply and Sunny AI text modes functional
- ✅ Phone number matching normalized (10-digit comparison)
- ✅ Secondary phone numbers supported

**Twilio Console Cleanup (optional):** Two legacy messaging services with red warning icons ("Sunstone PJ" and "Low Volume Mixed A2P") can be deleted. Only "Sunstone Studio" is active.

**Env vars required:** TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER, TWILIO_MESSAGING_SERVICE_SID

---

## 6. SUBSCRIPTION & PRICING (FINALIZED)

| | Starter | Pro | Business |
|---|---|---|---|
| Monthly Price | $99 | $169 | $279 |
| Platform Fee | 3% | 1.5% | 0% |
| Fee Model | Deducted from artist's Stripe payout | Same | No fee |
| Sunny AI | 5/month | Unlimited | Unlimited |
| Team Members | 1 (owner only) | Up to 3 | Unlimited |
| AI Insights | No | Yes | Yes |
| Full Reports | Basic only | Full + CSV | Full + CSV |
| Sunstone Catalog Reorder | ✅ All tiers | ✅ | ✅ |
| Artist Storefront | ✅ All tiers | ✅ | ✅ |
| Basic Party Booking | ✅ All tiers | ✅ | ✅ |

**CRM Add-On:** $69/month, single tier
- Included free during 60-day Pro trial
- Dedicated phone number, two-way SMS, workflows, broadcasts, Sunny text responder
- Advanced party booking: deposits, RSVP tracking, automated reminders, host rewards, guest marketing sequences
- Automated aftercare sequences

**Trial:** 60 days Pro + CRM, no credit card required

---

## 7. KEY BUSINESS RULES

- **Chain model:** Chain is raw material tracked in inches. Customers see finished products (bracelet, anklet, etc.), never inch measurements.
- **Chain cost entry:** Artists can enter cost per inch OR per foot in the inventory form. Per-foot divides by 12 and stores as cost_per_inch. Toggle is UI-only, not persisted.
- **Pricing modes:** Three options — Flat Rate (all chains same price), Per Product (individual prices per chain), By Tier (chains grouped into named pricing tiers with tier-level default prices). Underlying storage is always per-chain in chain_product_prices.
- **Jump rings:** 1 per item, 2 for hand chains. Material matching by material_id.
- **Platform fee:** Deducted from artist's Stripe payout via application_fee_amount. Customer never sees a fee. Only counts as cost in P&L when fee_handling = 'absorb'.
- **Payment recording:** "Charge Customer" = Stripe processes payment. "Record External Payment" = just bookkeeping.
- **Pending sales:** Sales with payment_status='pending' don't appear in reports; inventory not deducted until payment confirmed.
- **Payment status values:** `pending` → `completed` → `failed` → `refunded`. Stripe's `'paid'` maps to `'completed'`. Expired sessions map to `'failed'`. No `'expired'` in DB enum.
- **Revenue calculation:** Uses subtotal + tax + tip (not sale.total).
- **COGS:** Pulls snapshotted chain_material_cost and jump_ring_cost from sale_items, not real-time inventory lookups.
- **Warranty:** Sold per-item or per-invoice. Taxable by default (most US states require it), with toggle to exempt. Coverage terms snapshotted at time of sale. Duration configurable (lifetime default). Warranty revenue is part of gross revenue. Platform fee applies to warranty amounts.
- **Party deposit:** No platform fee on deposits (artist's money). Deposits go to artist's Stripe Connect account.
- **Guest sequences:** Track A (waiver signers) get full marketing sequence. Track B (RSVP-only) get aftercare + opt-in invite only.
- **Sunny rules:** Only 3 Sunstone welders exist (Zapp, Zapp Plus 2, mPulse). Never hallucinate products. Always reference the official weld settings chart for joule recommendations — never guess.
- **Aftercare policy:** Free repairs for life as long as the customer still has the chain. No time limits, no fees. Care instructions: soap/water/toothbrush, avoid harsh chemicals and prolonged pool time, pat dry.
- **CRM requires base plan:** Can't purchase CRM standalone after trial.
- **App Store subscriptions:** Subscription purchase/upgrade UI is NOT in the native app — billing at sunstonepj.app only.

---

## 8. SECURITY AUDIT — COMPLETED MARCH 7, 2026

Full pre-launch security audit performed. All Critical and High issues fixed.

### Critical Fixes (7/7 — ALL RESOLVED)
- C1-C7: Payment links, SMS, receipts, signup, RLS, debug tools, catalog tables

### High Fixes (6/6 — ALL RESOLVED)
- H1-H6: Tenant ID derivation, broadcast ownership, rate limiting, RLS recursion, untracked tables, admin exposure

### Remaining (not launch-blocking)
- 11 Medium issues (error message sanitization, OAuth state signing, gift card rate limiting, etc.)
- 8 Low issues (input validation library, missing DELETE policies on append-only tables, etc.)
- Will address in first 2 weeks post-launch

---

## 9. TECHNICAL ARCHITECTURE

### Database (Supabase/Postgres)
- RLS on ALL tables, verified via security audit
- SECURITY DEFINER functions: get_user_tenant_ids(), get_user_tenant_role(), find_client_by_phone(), link_orphaned_conversations()
- Custom function: create_sale_transaction (handles sale creation, sale items, inventory deduction, queue updates)
- Migrations numbered 001-052 in supabase/migrations/
- Key new tables (March 12): party_requests, party_rsvps, party_scheduled_messages, client_phone_numbers
- Key new tables (March 14): pricing_tiers, warranties, warranty_claims
- Key new table (March 15): checkout_sessions (session→tenant mapping for /pay redirect)
- Key new columns (March 13): mentor_knowledge_gaps.source/flagged_message/user_correction_note/conversation_context, tenants.sunny_tone_preset/sunny_tone_custom
- Key new columns (March 14): tenants.pricing_mode, tenants.warranty_enabled/warranty_per_item_default/warranty_per_invoice_default/warranty_taxable/warranty_coverage_terms/warranty_duration_days, inventory_items.pricing_tier_id, events.selected_chain_ids, sales.warranty_amount, sale_items.warranty_amount

### API Routes (Next.js App Router)
- All at src/app/api/
- ALL routes authenticated (verified in security audit) except public endpoints:
  - /api/party-requests POST (public submission, rate-limited)
  - /api/party-rsvps POST (public RSVP)
  - /api/public/profile GET (returns tier pricing data when enabled)
  - /api/public/party GET
  - /api/twilio/inbound POST (Twilio webhook, signature-verified)
  - /api/session-status GET (public — security via unguessable cs_live_xxx session ID)
  - /api/gift-cards/checkout POST (authenticated — creates Stripe session for gift card)
- ALL authenticated routes derive tenant_id from session via tenant_members lookup
- Public routes added to middleware: /pay/[sessionId], /payment-success

### Key Components (March 15 additions)
- `src/components/reports/TransactionList.tsx` — shared expandable transaction table, supports compact mode for POS
- `src/components/pos/SalesPanel.tsx` — slide-up modal for POS revenue tap, shows event/store transactions
- `src/components/pos/GiftCardModal.tsx` — rewritten with Stripe QR/Text Link payment support
- `src/app/pay/[sessionId]/page.tsx` — redirect page for iOS-safe Stripe payment links
- `src/app/payment-success/page.tsx` — branded customer-facing payment confirmation

### Key Components (March 14)
- `src/components/inventory/ChainPricingConfig.tsx` — tier dropdown + auto-fill for inventory edit
- `src/components/pos/ProductSelector.tsx` — tier filter chips in POS
- `src/lib/warranty.ts` — shared createWarrantyRecords() utility for sale creation
- `src/app/dashboard/warranties/page.tsx` — warranty tracking dashboard with claims workflow

### Environment Variables (Vercel)
- STRIPE_SECRET_KEY, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY, STRIPE_CLIENT_ID, STRIPE_WEBHOOK_SECRET
- STRIPE_PRICE_STARTER, STRIPE_PRICE_PRO, STRIPE_PRICE_BUSINESS, STRIPE_PRICE_CRM
- SQUARE_APP_ID, SQUARE_APP_SECRET, SQUARE_ENVIRONMENT
- TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER, TWILIO_MESSAGING_SERVICE_SID
- ANTHROPIC_API_KEY
- RESEND_API_KEY
- NEXT_PUBLIC_APP_URL=https://sunstonepj.app
- NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY

---

## 10. UPCOMING FEATURE ROADMAP (Priority Order)

### RIGHT NOW — Pre-Launch Gate
1. **Landing page screenshots** — retake without sidebar for inventory/CRM, then final review with marketing team
2. **Emoji toggle** in Sunny personality Settings (small feature, backlogged)
3. **Run 50 Sunny response quality tests** against live API
4. **Manual QA Gauntlet** — 180-test checklist + tier pricing + warranty + payment flow testing. LAST GATE BEFORE LAUNCH.

### FIRST 2 WEEKS POST-LAUNCH
2. **Push notifications** (TASK-4) — queue alerts, low stock, event reminders via Capacitor
3. **Capacitor shell + App Store** (TASK-5) — iOS/Android native wrapper (waiting on Apple Developer Account)
4. **Stripe Terminal + Tap to Pay** (TASK-6) — card-present payments, $0 hardware
5. **One-Touch Sunstone Reorder** (TASK-7) — Shopify Admin API, two-path reorder UX (waiting on shpat_ token)
6. **Predictive Reorder Intelligence** (TASK-8) — sales velocity modeling, depletion forecasts
7. **Promotional Control Layer** (TASK-9) — admin pushes announcements to all artists
8. **Admin cost tracking dashboard** (TASK-23)
9. **Admin team member management** (TASK-24)

### FIRST 30 DAYS POST-LAUNCH
10. ~~**Advanced Inventory — Pricing Tiers & Bundles** (TASK-10)~~ — **DONE (March 14, 2026). Tier pricing shipped. Bundles TBD.**
11. **Weld Activity Modeling** (TASK-11)
12. **Referral Tracking** (TASK-12)
13. **AI Business Coach v2** (TASK-17)

### MONTH 2
14. **Aftercare Sequences** (TASK-15)
15. **Lead Capture Tools** (TASK-16)
16. **Event Performance Benchmarking** (TASK-18)
17. **Sunny Learning System** (TASK-19)

### MONTH 3-4
18. **Offline Payments** (TASK-20)
19. **Photo Capture + Watermark** (TASK-21) — will integrate with warranty system (photo attached to warranty file)
20. **Multi-Vertical Expansion** (TASK-22)

### ONGOING
21. **Ambassador Program** — 20%/8 months, Stripe Connect Express. Full spec in AMBASSADOR_PROGRAM_ROADMAP.md.

---

## 11. KEY DECISIONS LOG

| Decision | Choice | Rationale |
|---|---|---|
| App name | Sunstone Studio | Approachable, not techy, resonates with artists |
| Cash/Venmo platform fee | Don't collect | Industry standard, incentivizes card payments |
| Square coexistence | Keep as option | Some artists are used to Square |
| Capacitor over React Native | Capacitor | Web-first, simpler toolchain |
| Stripe over Square for Terminal | Stripe | Native platform fee support, Tap to Pay |
| AI architecture | Single agent (Sunny) | Multi-agent adds latency |
| Ambassador commission | 20% / 8 months | Beats competitor's 15%, lower total payout |
| Ambassador payouts | Cash via Stripe Connect | Influencers need cash, not subscription credit |
| IAP strategy | No in-app subscription UI | Avoids Apple's 15-30% cut |
| Public profile branding | "Artist Storefront" | Sounds better than "website hosting," positions artist as business |
| Profile page gating | All tiers | Growth tool — every page drives Sunstone brand awareness |
| Party booking gating | Basic all tiers, advanced CRM | Booking form free, deposits/RSVP/rewards gated |
| Guest sequence tracks | Track A (waiver) + Track B (RSVP) | Respects consent levels while maximizing reach |
| Stack nudge timing | Day 21 with exit conditions | Late enough for identity attachment, smart enough to skip if converted |
| Party booking nudge | Day 10 | While party energy is still high |
| Review ask format | Social share + IG tag | Artists care about social proof more than Google reviews |
| Aftercare repair policy | Free for life with chain | Simpler, more generous, better selling point than 60-day/$20 |
| Sunny error detection | Thumbs-down + text detection | Gap detection only caught uncertainty, not confident errors |
| Sunny personality scope | Customer-facing SMS/email only | Mentor chat stays expert/knowledgeable; personality for customer tone |
| Settings communications layout | 3 accordion cards | Business Number / Text Messaging / Sunny Personality — each answers a different question |
| Pricing config location | All in Settings → Default Pricing | Single source of truth; inventory gear icon is a shortcut |
| Tier pricing data model | Tiers as a convenience layer | Underlying per-chain prices in chain_product_prices unchanged; tiers batch-set and group |
| Warranty tax default | Taxable, with toggle to exempt | Most US states tax warranties; artist can override if their state exempts |
| Warranty duration default | Lifetime | Generous default, artist can set 6mo/1yr/2yr/custom |
| Warranty claim workflow | Full (submitted → in_progress → completed/denied) | Artists need repair tracking, not just yes/no |
| Cost entry convenience | Per-inch/per-foot toggle (UI only) | Suppliers list per-foot; stored value always per-inch |
| Session status auth | Public route, unguessable session ID | Auth gate was blocking polling; cs_live_xxx is sufficiently unguessable |
| Payment link URL format | /pay/[sessionId] redirect | Raw Stripe URLs with # get truncated by iOS SMS |
| Sale status update | Belt-and-suspenders (polling + webhook) | Polling updates immediately for UX; webhook is authoritative |
| Transaction visibility | Shared TransactionList component | Used in Reports tab and POS SalesPanel — single component, two contexts |

---

## 12. KEY TECHNICAL LEARNINGS

- **Client-side rendering is invisible to automated reviewers:** Any compliance or public-facing page must be server-rendered or static.
- **Vercel function logs are the critical debug tool:** Browser console shows only status codes; Vercel logs expose exact error strings.
- **Audit before fix:** Claude Code prompts with explicit audit phases before fix phases produce better results.
- **RLS recursive policies:** tenant_members required SECURITY DEFINER functions.
- **Financial accuracy:** Platform fees only count as costs when fee_handling = 'absorb'. Revenue = subtotal + tax + tip.
- **Phone normalization:** Strip to 10 digits for matching. Check both clients.phone and client_phone_numbers.
- **Twilio Messaging Service:** Numbers MUST be in the Messaging Service sender pool for A2P compliant sending. Provisioning auto-adds, but manually purchased numbers need manual config.
- **Property name mismatches:** The "Send Party Booking Link" bug was `{ body }` vs `{ message }` — always check both sides of the API contract.
- **React hydration errors:** Next.js 15 requires Suspense boundaries around useSearchParams(). Full page reloads via `<a>` tags cause hydration mismatches — use `<Link>` instead.
- **Knowledge base retrieval matters as much as content:** The weld chart data was already in mentor-knowledge.ts, but Sunny ignored it because quickRuleOfThumb was easier to match and keywords were too narrow (10→28 fixed it).
- **Confident AI errors are invisible to gap detection:** Auto-detection only catches expressed uncertainty. User flagging (thumbs-down + text detection) is required to catch confidently wrong answers.
- **requestAnimationFrame for focus management:** When React re-renders add new interactive elements (e.g., thumbs-down button appearing after streaming), use rAF to refocus the input after the render cycle completes. tabIndex={-1} on non-input interactive elements prevents tab-stealing.
- **requestAnimationFrame for scroll restoration:** After a data refetch re-renders a list, use rAF to restore scrollTop — direct assignment after setState won't work because the DOM hasn't updated yet.
- **Config consolidation prevents user confusion:** When pricing/settings are split across multiple locations, artists will miss one. Single source of truth in Settings with shortcut links from relevant pages.
- **Migration numbering with multiple prompts:** When a multi-prompt build session creates unexpected intermediate migrations (e.g., 050 for event_chain_selections), subsequent prompts must be renumbered. Always verify the last migration number before pasting a prompt.
- **React stale closures in polling:** `setState` schedules an update but the enclosing closure captures the old value. When a `useCallback` reads state that was just set, it reads `null`. Fix: pass the value as a direct parameter to the function instead of reading from state. This bit us twice on March 15 (payment polling + gift card form data).
- **useEffect dependency arrays cause silent resets:** An effect with `[selectedId, requests]` that resets form fields will fire every time `requests` gets a new array reference (e.g., from unrelated saves). Narrowing to `[selectedId]` fixed the party deposit amount being silently wiped.
- **Silent guards hide real bugs:** `if (!value) return` with no error feedback means the user clicks a button and nothing happens. Always surface a toast or error message so the failure is visible.
- **JavaScript date parsing timezone trap:** `new Date('2026-03-15')` parses as midnight UTC = previous evening in US timezones. Fix: append `'T00:00:00'` to force local timezone interpretation.
- **Stripe Checkout session status values:** Stripe returns `'paid'` but the DB enum uses `'completed'`. The session-status route correctly maps between them. Expired sessions map to `'failed'`, not a nonexistent `'expired'` enum value.
- **iOS SMS URL truncation:** URLs containing `#` characters get truncated when sent via SMS on iOS. Solution: create a redirect page (`/pay/[sessionId]`) that sends a clean URL and redirects to the full Stripe URL server-side.

---

## 13. KEY PROJECT DOCUMENTS

**In Project Knowledge (upload updated versions here):**
- PROJECT_STATUS_MARCH_2026.md — this document
- SUNSTONE_STUDIO_ROADMAP_MARCH_2026.md — master roadmap with all tasks detailed
- AMBASSADOR_PROGRAM_ROADMAP.md — affiliate program spec
- STRIPE_TERMINAL_ARCHITECTURE.md — Capacitor + Terminal research and plan
- CONTROL_THREAD_PROMPT_V4.md — control thread instructions
- DESIGN_SYSTEM.md — design philosophy and tokens
- KB_DOCUMENT_*.docx — Sunny's knowledge base (critical, do not remove)

**In Repo:**
- docs/PROJECT_STATUS.md — copy of this document
- CLAUDE.md — project-level instructions for Claude Code
- supabase/migrations/ — 001 through 052

---

*Last updated March 15, 2026 (evening). Session included: Complete Stripe payment flow fix (QR + Text Link end-to-end), gift card Stripe payments, transaction list in Reports + tappable revenue in POS (shared TransactionList component), party deposit Send Link fix, reports date picker timezone fix, belt-and-suspenders sale status updates, payment_status enum consistency audit ('expired' → 'failed'), Sunny pricing tier tools, mobile nav/POS header/Sunny chat UX fixes. One migration (052). Core POS payment experience is now complete.*