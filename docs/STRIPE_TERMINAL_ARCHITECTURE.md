# Stripe Terminal + Tap to Pay — Architecture Document

## Last Updated: May 8, 2026

---

## Overview

Sunstone Studio will support in-person card payments via Stripe Terminal, using both Tap to Pay (phone-as-reader) and Bluetooth readers (Stripe M2). This is built as a custom Capacitor plugin bridging the native Stripe Terminal SDK on iOS (Swift) and Android (Kotlin).

**Key details:**
- Custom Capacitor plugin bridging native Stripe Terminal SDK
- iOS: Tap to Pay on iPhone + Bluetooth M2 reader
- Android: Tap to Pay + Bluetooth M2 reader
- Payment flow integrated with existing POS checkout
- Reader management in Settings
- Card-present rate: 2.7% + $0.05 (vs online 2.9% + $0.30)

**Dependencies:**
- Capacitor shell (TASK-5) — must be built and deployed first
- Apple Tap to Pay entitlement — approval takes weeks, request immediately during Capacitor setup
- Stripe Terminal SDK (iOS + Android native)

---

## Payment Flow — Card Present

1. Artist builds cart in POS (Event Mode or Store Mode)
2. Artist taps "Pay with Card" → selects "Tap to Pay" or "Reader"
3. Capacitor plugin calls native Stripe Terminal SDK
4. SDK prompts "Hold card near device" (Tap to Pay) or "Insert/Tap card" (M2 reader)
5. Customer taps card/phone → SDK collects + encrypts card data
6. SDK creates PaymentIntent via Stripe API
7. On success: PJOS creates sale record, deducts inventory, sends receipt
8. Webhook confirms payment (belt-and-suspenders with SDK callback)

---

## Connection Tokens

Stripe Terminal requires a connection token to initialize the SDK. PJOS provides these via an API route:

- `POST /api/stripe/terminal/connection-token` — returns a client_secret
- Token is tenant-scoped (uses tenant's Stripe Connect account)
- SDK requests a new token on initialization and periodically
- **Critical for offline:** SDK must obtain a token while online before going offline

---

## Offline Payments — Architecture & Artist Experience

### How Offline Works (Stripe Terminal Native SDK)

The Stripe Terminal SDK handles ALL offline logic natively — PJOS does not build custom offline storage. Here's what happens under the hood:

- When the device has no internet, the SDK still collects card data via Tap to Pay or Bluetooth reader
- Card data is encrypted at the point of capture using Stripe's end-to-end encryption and stored on-device
- When connectivity is restored, the SDK automatically forwards stored payments to Stripe for processing
- PJOS receives webhook confirmations once payments are processed
- No developer intervention needed for the store-and-forward mechanism — it's built into the SDK
- The Capacitor plugin simply passes through the SDK's status callbacks to the PJOS React layer

### Artist Experience — Step by Step

1. Artist opens PJOS app while online — SDK caches a connection token
2. Artist goes to an event with poor/no connectivity
3. Artist builds cart, taps "Pay with Card" — works normally
4. Device shows "Hold card near device" — customer taps — SDK shows success
5. Artist sees a local **"payment pending"** indicator (not yet confirmed by Stripe)
6. PJOS records a provisional sale locally with status `offline_pending`
7. When internet returns, SDK auto-forwards payments — no artist action needed
8. Stripe processes and sends webhooks
9. PJOS webhook handler updates sale status from `offline_pending` to `completed`
10. If a card is declined during processing, sale status moves to `offline_declined`

The artist's workflow is identical online and offline. The only visible difference is a "pending sync" indicator.

### PJOS Backend Requirements for Offline

#### 1. Provisional Sale Recording

When a Terminal payment completes offline, the native SDK returns a local confirmation (the payment hasn't actually been authorized yet). PJOS should create a sale record immediately:

- **status:** `offline_pending`
- **payment_status:** `pending`
- **payment_method:** `card_present`
- All cart data saved immediately — items, quantities, prices, tax, tip
- **Inventory deducted immediately** — the item is physically gone (the chain was cut and welded)
- **Receipt NOT sent** — no internet means no SMS/email delivery
- Store the SDK's local PaymentIntent ID on the sale record for later reconciliation

#### 2. Webhook Reconciliation

When Stripe processes the forwarded payment, standard webhook events fire:

| Webhook Event | PJOS Action |
|---|---|
| `payment_intent.succeeded` | Update sale to `completed`, send receipt (SMS + email), clear "pending" indicator |
| `payment_intent.payment_failed` | Update sale to `offline_declined`, notify artist via dashboard + push notification |

Match via the PaymentIntent ID stored on the provisional sale record. This is the same belt-and-suspenders pattern used for Stripe Payment Links today.

#### 3. Declined Payment Handling

When an offline payment is declined after the fact:

- **Dashboard alert:** "1 offline payment declined — $75.00 from [date]"
- **The sale already happened.** The chain is cut, the customer left. The artist absorbs this loss.
- This is industry-standard behavior — every card reader (Square, Clover, SumUp) works this way
- The declined sale record remains in the system for reporting/tracking purposes
- No automatic inventory reversal — the chain was physically consumed

**Future configuration options (post Tap to Pay launch):**
- "Maximum offline transaction amount" setting (e.g., $200 cap) to limit risk exposure
- "Require online for payments over $X" mode for risk-averse artists

#### 4. Offline Queue Visibility

Show the artist how many payments are queued and pending sync:

- **Badge or indicator in POS header:** "3 payments pending sync"
- When all synced: indicator disappears
- This is a native-layer concern — the Capacitor plugin needs to expose the pending payment count from the SDK
- The React layer polls or subscribes to this count and renders the badge
- Also visible in the dashboard: "All payments synced" or "X payments waiting to sync"

### Offline Limitations

| Limitation | Details |
|---|---|
| **Connection token caching** | SDK needs to obtain a connection token while online before going offline. Token is valid for a limited time. Artist should open the app before heading to an event to ensure a fresh token is cached. |
| **Maximum offline duration** | Stripe recommends processing offline payments within 72 hours. After that, decline risk increases significantly as cards may be cancelled, over-limit, or flagged. |
| **Maximum offline amount** | Stripe may impose per-transaction and aggregate offline limits. Check current SDK documentation during implementation — these limits can change. |
| **No receipts offline** | SMS/email receipts require internet. Receipts are queued and sent when payments sync. The artist can show the POS confirmation screen as a temporary "receipt" to the customer. |
| **No refunds offline** | Refunds require an API call to Stripe. Must be done when online. |
| **Decline risk** | Artist bears 100% of decline risk on offline transactions. This is industry standard, not Sunstone-specific. Every card reader works this way. |
| **Inventory is final** | Even if payment later declines, the item (chain) was physically used. Inventory cannot be "returned" automatically on decline — the chain is welded onto the customer. |

### Square Mobile Payments SDK — Offline (Future, Phase 2)

When Square Tap to Pay is added as Phase 2 of the tap-to-pay roadmap:

- Square's Reader SDK also supports offline payments with similar store-and-forward behavior
- Same decline risk model — artist absorbs declined offline payments
- Same provisional sale → webhook confirmation pattern as Stripe
- PJOS offline handling logic should be **processor-agnostic** — the same `offline_pending` → reconciliation flow works for both Stripe and Square
- The only difference is the native SDK bridge (Stripe Terminal SDK vs Square Reader SDK)
- Payment method would be `card_present` for both, with a `processor` field distinguishing Stripe vs Square

### Configuration Options (Future — Post Tap to Pay Launch)

Consider adding to Settings → Payments:

| Setting | Default | Description |
|---|---|---|
| Allow offline payments | On | Toggle offline payment capability on/off |
| Maximum offline transaction | No limit | Cap per-transaction amount for offline (suggest $200-$500 range) |
| Offline payments pending | — | Dashboard notification showing count + total of unsynced payments |

These are **not needed for launch** — they're quality-of-life additions for artists who want more control over their risk exposure.

### Risk Messaging for Artists

**Sunny should be able to explain offline payments when asked.** Suggested knowledge chunk:

> "Offline payments work automatically when you lose internet at an event. Your customer taps their card like normal — the payment is encrypted and stored on your phone. When you're back online, it processes automatically. In rare cases, a card could be declined after the fact — maybe 1-2% of the time. Keep individual offline transactions reasonable (under a few hundred dollars) and you'll be fine. This is the same way every card reader handles it — Square, Clover, all of them."

**Key framing principles:**
- Never scare artists about offline risk — it's rare and manageable
- Frame it as: "the same way every card reader handles it"
- Emphasize the convenience: "you never have to turn away a customer because of bad wifi"
- Practical advice: open the app before heading to an event, keep individual transactions reasonable

---

## Reader Management

Artists manage their Terminal readers in Settings → Payments:

- **Tap to Pay:** No setup needed — uses the phone's NFC hardware
- **Bluetooth readers (M2):** Pair via Settings, auto-reconnect
- **Reader status:** Connected / Disconnected / Battery level
- **Multiple readers:** Support for artists with multiple devices

---

## Testing Strategy

- **Stripe Terminal test mode:** Use Stripe's simulated reader for development
- **Offline testing:** Airplane mode + test card to verify provisional sale creation
- **Webhook testing:** Stripe CLI `stripe listen --forward-to` for local development
- **Decline simulation:** Stripe test cards that always decline to verify `offline_declined` flow

---

*This document covers the architecture for Stripe Terminal + Tap to Pay integration in Sunstone Studio. For the current payment system (Stripe Payment Links via QR/SMS), see the POS Payment System section in project-status.md.*
