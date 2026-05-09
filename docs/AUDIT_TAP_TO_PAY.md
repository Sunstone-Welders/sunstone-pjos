# Tap to Pay Architecture Discovery Audit

**Date:** May 9, 2026
**Purpose:** Pre-implementation audit for in-app Tap to Pay via Capacitor on iOS and Android
**Processors:** Square Mobile Payments SDK (~80% of users) + Stripe Terminal SDK (~20%)

---

## Table of Contents

1. [Existing POS Payment Flow](#section-1-existing-pos-payment-flow)
2. [Stripe Integration](#section-2-stripe-integration)
3. [Square Integration](#section-3-square-integration)
4. [Native App Setup](#section-4-native-app-setup)
5. [Database Schema](#section-5-database-schema)
6. [Plugin Evaluation](#section-6-plugin-evaluation)
7. [Risks, Dependencies, and Open Questions](#section-7-risks-dependencies-and-open-questions)

---

## Section 1: Existing POS Payment Flow

### 1.1 Architecture Overview

The POS operates in two modes — **Store Mode** (`src/app/dashboard/pos/page.tsx`) and **Event Mode** (`src/app/dashboard/events/event-mode/page.tsx`). Both share the same checkout components in `src/components/pos/checkout/`.

The checkout flow is orchestrated by `CheckoutFlow.tsx`, which renders steps in sequence: **TipScreen → PaymentScreen → JumpRingStep (event only) → ReceiptScreen**.

### 1.2 Payment Method Selection

**File:** `src/components/pos/checkout/PaymentScreen.tsx` (lines 603–993)

The PaymentScreen presents three main payment paths:

1. **"Charge Customer"** (Stripe/Square) — Lines 721–780
   - Routes to QR code or text link sub-options
   - Processor determined by `defaultProcessor` tenant setting (line 387–390)

2. **"Send Venmo Link"** — Lines 783–869
   - Visible when `venmoUsername` is configured on tenant
   - Uses Venmo deep linking via SMS

3. **"Record External Payment"** — Lines 912–979
   - Cash, Venmo/Zelle (manual), External Card

### 1.3 Complete Payment Method List

```typescript
// src/types/index.ts, line 15
export type PaymentMethod = 'stripe_link' | 'square_link' | 'cash' | 'venmo' | 'card_external' | 'gift_card';
```

| Method | Description | Flow Type |
|--------|-------------|-----------|
| `stripe_link` | Stripe Checkout Session via QR/SMS | Online (webhook-driven) |
| `square_link` | Square Checkout via QR/SMS | Online (polling-driven) |
| `cash` | Cash payment | Offline (immediate) |
| `venmo` | Venmo deep link or manual | Offline (immediate) |
| `card_external` | External card reader | Offline (immediate) |
| `gift_card` | Full gift card coverage | Offline (immediate) |

### 1.4 Handler Functions

| Action | Handler | File:Line |
|--------|---------|-----------|
| Stripe/Square QR | `startChargePayment('qr')` | PaymentScreen.tsx:745 |
| Stripe/Square Text | `startChargePayment('text')` | PaymentScreen.tsx:754 |
| Venmo Link | `sendVenmoLink()` | PaymentScreen.tsx:342 |
| Venmo Confirm | `confirmVenmoPayment()` | PaymentScreen.tsx:370 |
| Cash/Venmo/Card | `onSelectMethod(method)` | PaymentScreen.tsx:938 |
| Complete Sale CTA | `onCompleteSale()` | PaymentScreen.tsx:961 |

#### `startChargePayment(method: 'qr' | 'text')` — Lines 171–240

```typescript
const startChargePayment = useCallback(async (method: 'qr' | 'text') => {
  // 1. Creates pending sale if needed (via onCreatePendingSale)
  // 2. Routes to /api/stripe/payment-link or /api/square/payment-link
  // 3. Generates QR code from returned URL
  // 4. Starts polling for payment completion
```

#### `startPolling(saleId, sessionId, orderId)` — Lines 244–305

Polls every 3 seconds for up to 10 minutes. Checks DB first, then falls back to processor API every 3rd poll. On `payment_status='completed'`, calls `onPaymentCompleted(saleId)`.

### 1.5 Processor Routing Logic

**File:** `PaymentScreen.tsx` lines 154–160

```typescript
const chargeProcessor: 'stripe' | 'square' = (() => {
  if (defaultProcessor === 'square' && squareConnected) return 'square';
  if (defaultProcessor === 'stripe' && stripeConnected) return 'stripe';
  if (stripeConnected) return 'stripe';
  if (squareConnected) return 'square';
  return 'stripe';
})();
```

### 1.6 Sale Recording

All sales are recorded via the `create_sale_transaction()` RPC function (`supabase/migrations/060_variant_sale_deductions.sql`, lines 94–240). This PL/pgSQL function atomically:

1. Inserts `sales` record
2. Inserts `sale_items` records
3. Handles inventory deductions (variant-aware)
4. Updates `queue_entries` status if applicable

#### Store Mode — `src/app/dashboard/pos/page.tsx`

- **Pending sale** (Stripe/Square): `createPendingSale()` at line 269 → RPC at line 308 with `payment_status: 'pending'`, empty `p_inventory_deductions: []`
- **Complete sale** (Cash/Venmo/Card): `completeSale()` at line 422 → RPC at line 471 with `payment_status: 'completed'`, populated `p_inventory_deductions`

#### Event Mode — `src/app/dashboard/events/event-mode/page.tsx`

- `completeSale(resolutions)` at line 537 → RPC at line 606 with `event_id` set, `log_movement: true`

### 1.7 Inventory Deduction — Two Strategies

**Strategy A: Deferred (Stripe/Square Payment Links)**
- Inventory NOT deducted at sale creation
- Deducted by webhook (`src/app/api/stripe/webhook/route.ts`, lines 125–189) after `checkout.session.completed`
- Variant-aware: deducts from `inventory_item_variants` then recalcs parent

**Strategy B: Immediate (Cash/Venmo/Card External)**
- Deducted atomically inside `create_sale_transaction()` RPC
- For chains: deducts by `inches_used`, not quantity

### 1.8 Receipt Sending

- **Email:** `sendEmailReceipt()` → `POST /api/receipts/email` (Store: line 552, Event: line 746)
- **SMS:** `sendSMSReceipt()` → `POST /api/receipts/sms` (Store: line 574, Event: line 763)
- Both update `sales.receipt_sent_at` on success

### 1.9 Complete Data Flow — Online Payment

```
[Cart items ready] → [Checkout initiated] → [TipScreen] → [PaymentScreen]
    ↓
[Select "Charge Customer" → QR or Text]
    ↓
startChargePayment() → onCreatePendingSale() → create_sale_transaction() RPC
                                                (payment_status='pending', no inventory deduction)
    ↓
POST /api/{stripe|square}/payment-link → Returns checkout URL + session/order ID
    ↓
[Generate QR code / Send SMS to customer]
    ↓
startPolling() — every 3s checks DB, every 9s checks processor API
    ↓
[Customer pays via external Stripe/Square checkout page]
    ↓
Stripe: webhook checkout.session.completed → UPDATE sales SET payment_status='completed' + deduct inventory
Square: polling detects order state='COMPLETED' → UPDATE sales SET payment_status='completed'
    ↓
onPaymentCompleted(saleId) → [Show ReceiptScreen, reset cart]
```

### 1.10 Complete Data Flow — Offline Payment

```
[Cart items ready] → [Checkout initiated] → [TipScreen] → [PaymentScreen]
    ↓
[Select "Record External Payment" → Cash/Venmo/Card]
    ↓
onSelectMethod(method) → [Press "Record Sale"] → onCompleteSale()
    ↓
completeSale() → create_sale_transaction() RPC
                 (payment_status='completed', WITH inventory deductions)
    ↓
[Sale + items + inventory all atomic]
    ↓
createWarrantyRecords() if applicable → Gift card redemption if applicable
    ↓
[Show ReceiptScreen, reset cart, send email/SMS receipts]
```

### 1.11 Key Props Interface

```typescript
// PaymentScreen.tsx
interface PaymentScreenProps {
  selectedMethod: PaymentMethod | null;
  onSelectMethod: (method: PaymentMethod) => void;
  onCompleteSale: () => void;
  processing: boolean;
  total: number;
  items: Array<{ name: string; quantity: number; unitPrice: number; lineTotal: number }>;
  subtotal: number;
  taxAmount: number;
  tipAmount: number;
  platformFeeAmount: number;
  stripeConnected: boolean;
  squareConnected?: boolean;
  venmoUsername?: string;
  defaultProcessor?: string | null;
  tenantId: string;
  saleId: string | null;
  onCreatePendingSale: () => Promise<string | null>;
  onPaymentCompleted: (saleId: string) => void;
  receiptPhone?: string;
  mode?: 'event' | 'store';
  onGiftCardApplied?: (data: GiftCardData | null) => void;
}
```

### 1.12 Cart Store

**File:** `src/hooks/use-cart.ts` (Zustand store)

```typescript
export interface CartState {
  items: CartItem[];
  subtotal: number;
  discount_amount: number;
  warranty_amount: number;
  tax_rate: number;
  tax_amount: number;
  tip_amount: number;
  platform_fee_amount: number;  // Always 0 as of May 2026
  total: number;
  payment_method: PaymentMethod | null;
  client_id: string | null;
  notes: string;
}
```

---

## Section 2: Stripe Integration

### 2.1 Client Initialization

All Stripe API routes use the same pattern:

```typescript
import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-02-24.acacia' as any,
});
```

**Environment variables:**
- `STRIPE_SECRET_KEY` — Platform's secret key
- `STRIPE_CLIENT_ID` — OAuth client ID for Connect onboarding
- `STRIPE_WEBHOOK_SECRET` — Webhook signature verification
- `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_BUSINESS` — Subscription price IDs
- `STRIPE_PRICE_CRM` — CRM add-on price ID

### 2.2 Connected Account Pattern

All POS payments go through Stripe Connect with `stripeAccount` option:

```typescript
stripe.checkout.sessions.create(
  sessionParams,
  { stripeAccount: tenant.stripe_account_id }
);
```

**Tenant resolution flow:**
1. Auth check → `user.id` via `createServerSupabase()`
2. Tenant lookup → `tenant_members` table → `tenant_id`
3. Fetch `stripe_account_id` from `tenants` table
4. Validate account is connected (not null)
5. Pass as `stripeAccount` to all API calls

**Files using stripeAccount header:**

| File | Method | Context |
|------|--------|---------|
| `stripe/payment-link/route.ts:167` | `checkout.sessions.create()` | POS payment link |
| `stripe/session-status/route.ts:48` | `checkout.sessions.retrieve()` | Payment status polling |
| `stripe/webhook/route.ts:106` | `paymentIntents.retrieve()` | Fee collection |
| `gift-cards/checkout/route.ts:135` | `checkout.sessions.create()` | Gift card sale |
| `party-requests/[id]/deposit/route.ts:111` | `checkout.sessions.create()` | Party deposit |

### 2.3 Application Fee Handling

**All platform fees removed (May 2026).** All tiers charge 0%:

```typescript
// src/lib/subscription.ts, lines 49-61
const FEE_RATES: Record<SubscriptionTier, number> = {
  starter: 0, pro: 0, business: 0,
};
```

In payment-link creation:
```typescript
// stripe/payment-link/route.ts, lines 133-134
const platformFeeCents = 0;
payment_intent_data: {
  application_fee_amount: platformFeeCents,  // = 0
}
```

### 2.4 PaymentIntent Creation Patterns

#### Pattern 1: Direct Card Payment (`/api/payments`)
```typescript
const paymentIntent = await stripe.paymentIntents.create({
  amount: totalCents,
  currency: 'usd',
  payment_method: source_id,
  confirm: true,
  transfer_data: { destination: tenant.stripe_account_id },
  application_fee_amount: 0,
}, { idempotencyKey: `pi_${sale_id}` });
```

#### Pattern 2: Checkout Session (`/api/stripe/payment-link`)
```typescript
const session = await stripe.checkout.sessions.create({
  mode: 'payment',
  payment_method_types: ['card'],
  line_items: stripeLineItems,
  payment_intent_data: {
    application_fee_amount: 0,
    metadata: { sale_id: saleId, tenant_id: tenantId },
  },
  success_url: `${baseUrl}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
  cancel_url: `${baseUrl}${returnPath}?payment_cancelled=${saleId}`,
  expires_at: Math.floor(Date.now() / 1000) + (30 * 60),
  metadata: { sale_id: saleId, tenant_id: tenantId },
}, { stripeAccount: tenant.stripe_account_id });
```

### 2.5 Webhook Events Handled

**File:** `src/app/api/stripe/webhook/route.ts`

| Event | Lines | Actions |
|-------|-------|---------|
| `checkout.session.completed` | 90–337 | POS: mark sale completed + deduct inventory; Party deposit: mark paid + SMS notify; CRM addon: enable CRM; Subscription: update tier/status |
| `checkout.session.expired` | 343–366 | Mark sale as failed/voided |
| `customer.subscription.created` | 372–422 | Update tenant tier + status |
| `customer.subscription.updated` | 372–422 | Update tier, status, renewal date |
| `customer.subscription.deleted` | 428–488 | Downgrade to starter, deactivate CRM |
| `invoice.payment_succeeded` | 520–563 | Recover from past_due, create commissions |
| `invoice.payment_failed` | 494–514 | Mark tenant as past_due |
| `account.updated` | 569–587 | Mark ambassador Connect as onboarded |

### 2.6 POS Webhook Handler Detail

When `checkout.session.completed` fires with `mode='payment'` and `metadata.sale_id`:

```typescript
// Lines 116-123: Mark sale completed
await serviceRole.from('sales').update({
  payment_status: 'completed',
  stripe_payment_intent_id: paymentIntentId,
  platform_fee_collected: feeCollected,
}).eq('id', saleId);

// Lines 127-189: Deduct inventory (variant-aware)
for (const si of saleItems) {
  if (!si.inventory_item_id) continue;
  const deductAmount = si.inches_used ? Number(si.inches_used) : Number(si.quantity);
  // Variant deduction → recalc parent
}
```

### 2.7 OAuth Flow

- **Authorize:** `GET /api/stripe/authorize` → Redirects to `connect.stripe.com/oauth/authorize` with `scope: 'read_write'`
- **Callback:** `GET /api/stripe/callback` → Exchanges code, stores `stripe_account_id` on tenant
- **Disconnect:** `POST /api/stripe/disconnect` → Deauthorizes, clears `stripe_account_id`

### 2.8 All Stripe API Route Files

| File | Lines | Purpose | Stripe Methods |
|------|-------|---------|----------------|
| `/api/stripe/payment-link/route.ts` | 207 | POS checkout link | `checkout.sessions.create()` |
| `/api/stripe/webhook/route.ts` | 600 | Webhook handler | `paymentIntents.retrieve()`, `subscriptions.retrieve()` |
| `/api/stripe/checkout/route.ts` | 160 | Subscription signup | `customers.create()`, `checkout.sessions.create()` |
| `/api/stripe/crm-checkout/route.ts` | 198 | CRM add-on | `customers.create()`, `checkout.sessions.create()` |
| `/api/stripe/authorize/route.ts` | 54 | OAuth start | Redirect URL |
| `/api/stripe/callback/route.ts` | 77 | OAuth complete | `oauth.token()` |
| `/api/stripe/disconnect/route.ts` | 59 | Disconnect | `oauth.deauthorize()` |
| `/api/stripe/portal/route.ts` | 72 | Billing portal | `billingPortal.sessions.create()` |
| `/api/stripe/session-status/route.ts` | 64 | Poll payment | `checkout.sessions.retrieve()` |
| `/api/stripe/send-payment-sms/route.ts` | 57 | SMS link | (No Stripe API, Twilio only) |
| `/api/payments/route.ts` | 177 | Direct card charge | `paymentIntents.create()` |
| `/api/sales/[id]/refund/route.ts` | 214 | Refund | `refunds.create()` |

---

## Section 3: Square Integration

### 3.1 OAuth Flow & Credential Storage

**Authorize:** `GET /api/square/authorize/route.ts` (lines 1–85)

```typescript
const scopes = [
  'MERCHANT_PROFILE_READ',
  'PAYMENTS_WRITE',
  'PAYMENTS_READ',
  'ORDERS_WRITE',
  'ORDERS_READ',
].join('+');
```

Redirects to `connect.squareup.com/oauth2/authorize` (production) or `connect.squareupsandbox.com/oauth2/authorize` (sandbox).

**Callback:** `GET /api/square/callback/route.ts` (lines 1–164)

Exchanges authorization code, auto-detects first ACTIVE location, stores credentials:

```typescript
await serviceClient.from('tenants').update({
  square_merchant_id: merchant_id,
  square_access_token: access_token,
  square_refresh_token: refresh_token || null,
  square_location_id: locationId,
}).eq('id', state.tenant_id);
```

**Disconnect:** `POST /api/square/disconnect/route.ts` — Revokes token, clears all Square fields.

### 3.2 Database Columns for Square (on `tenants`)

| Column | Type | Purpose |
|--------|------|---------|
| `square_merchant_id` | string \| null | Merchant ID from OAuth |
| `square_access_token` | string \| null | Bearer token for API calls |
| `square_refresh_token` | string \| null | Token refresh |
| `square_location_id` | string \| null | Primary active location ID |
| `default_payment_processor` | string \| null | 'stripe' \| 'square' |

### 3.3 Checkout Link Creation

**File:** `POST /api/square/payment-link/route.ts` (lines 1–122)

```typescript
const { result } = await squareClient.checkoutApi.createPaymentLink({
  idempotencyKey: `sq_link_${saleId}_${Date.now()}`,
  quickPay: {
    name: `Payment to ${businessName}`,
    priceMoney: { amount: BigInt(totalCents), currency: 'USD' },
    locationId: tenant.square_location_id,
  },
  paymentNote: `Sale ${saleId.slice(0, 8)}`,
});
```

Returns `{ url, orderId, paymentLinkId }`. Updates sale with `payment_provider: 'square'`, `payment_provider_id: orderId`.

### 3.4 Payment Status Polling

**File:** `GET /api/square/check-payment/route.ts` (lines 1–89)

Polls every 3s from PaymentScreen. Retrieves order via `squareClient.ordersApi.retrieveOrder(orderId)`. When `order.state === 'COMPLETED'`, updates sale to `payment_status: 'completed'`.

**Note:** Square does NOT use webhooks for POS payments — it's purely polling-based. Stripe uses webhooks for the same flow.

### 3.5 Processor Toggle in Settings

**File:** `src/app/dashboard/settings/page.tsx` (lines 1502–1559)

- Connect/Disconnect buttons for Square
- Default processor toggle only visible when BOTH Stripe AND Square are connected
- Saves `default_payment_processor` to tenant record

### 3.6 Refund via Square

**File:** `src/app/api/sales/[id]/refund/route.ts` (lines 121–159)

```typescript
const { result } = await squareClient.refundsApi.refundPayment({
  idempotencyKey: `refund-${saleId}-${Date.now()}`,
  paymentId: providerId,
  amountMoney: { amount: BigInt(Math.round(refundAmount * 100)), currency: 'USD' },
  reason: reason || 'Customer refund',
});
```

### 3.7 Environment Variables

| Variable | Purpose |
|----------|---------|
| `SQUARE_APP_ID` | OAuth client ID |
| `SQUARE_APP_SECRET` | OAuth client secret |
| `SQUARE_ENVIRONMENT` | 'production' or 'sandbox' |

---

## Section 4: Native App Setup

### 4.1 Capacitor Configuration

**File:** `capacitor.config.ts`

```typescript
{
  appId: 'com.sunstoneengineering.studio',  // Android; iOS uses Xcode setting
  appName: 'Sunstone Studio',
  server: { url: 'https://sunstonepj.app', cleartext: false },
  // Allowed navigation domains:
  // sunstonepj.app, *.supabase.co, *.stripe.com, checkout.stripe.com,
  // js.stripe.com, accounts.google.com
}
```

### 4.2 Capacitor Version & Plugins

**From `package.json`:**

```
@capacitor/core:                ^8.3.0
@capacitor/cli:                 ^8.3.0
@capacitor/android:             ^8.3.0
@capacitor/ios:                 ^8.3.0

Installed plugins:
  @capacitor/camera:              ^8.0.2
  @capacitor/haptics:             ^8.0.2
  @capacitor/push-notifications:  ^8.0.3
  @capacitor/splash-screen:       ^8.0.1
  @capacitor/status-bar:          ^8.0.2
```

### 4.3 Bundle IDs

| Platform | Bundle ID | Source |
|----------|-----------|--------|
| Android | `com.sunstoneengineering.studio` | `android/app/build.gradle:15` |
| iOS | `com.sunstoneengineering.studio` | Xcode project (PRODUCT_BUNDLE_IDENTIFIER) |

### 4.4 iOS Entitlements

**File:** `ios/App/App/App.entitlements`

- `aps-environment: development` — Push notifications capability
- **NO NFC entitlements**
- **NO Tap to Pay entitlements**
- **NO Apple Pay entitlements**

### 4.5 iOS Permissions (Info.plist)

- `NSCameraUsageDescription` — QR code scanning
- `NSPhotoLibraryUsageDescription` — Business logo/profile uploads
- `UIBackgroundModes: remote-notification` — Push notifications
- `UIRequiredDeviceCapabilities: armv7`
- Supports all orientations (Portrait, Landscape) on both iPhone and iPad
- `ITSAppUsesNonExemptEncryption: false`

### 4.6 Android Configuration

**SDK Versions (from `variables.gradle`):**

```
minSdkVersion:     24 (Android 7.0)
compileSdkVersion: 36 (Android 15)
targetSdkVersion:  36 (Android 15)
```

**Android Permissions (`AndroidManifest.xml`):**

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
```

- **NO NFC permission** (`android.permission.NFC` not present)
- **NO fine location permission**

**Key Gradle Dependencies:**
- Gradle: 8.13.0
- Google Services: 4.4.4
- Firebase Messaging: 24.0.0
- AndroidX AppCompat: 1.7.1

### 4.7 Native Detection Logic

**Client-Side:** `src/lib/native.ts`

```typescript
export const isNativeApp = (): boolean => Capacitor.isNativePlatform();
export const getPlatform = (): 'ios' | 'android' | 'web' => Capacitor.getPlatform();
export const isPluginAvailable = (name: string): boolean => Capacitor.isPluginAvailable(name);
export const ensureNativeCookie = (): void => {
  // Sets sunstone_native=1 cookie (1-year TTL) for server-side detection
};
```

**Server-Side:** `src/lib/native-server.ts`

```typescript
export function isNativeRequest(opts: { userAgent: string; cookieValue?: string }): boolean {
  // Checks: sunstone_native=1 cookie, bundle ID in UA, CapacitorWebView UA,
  //         Android WebView pattern, iOS WebView pattern
}
```

### 4.8 Billing UI Gating

**File:** `src/lib/billing-gate.ts`

```typescript
export const canShowBillingUI = (): boolean => !isNativeApp();
```

Used in:
- **Settings page** (line 1609): Hides subscription management accordion
- **UpgradePrompt** (line 32): Returns null on native
- **DashboardClientLayout** (lines 875, 958): Hides trial/billing overlays

### 4.9 Middleware Native Handling

**File:** `src/lib/supabase/middleware.ts`

- Native unauthenticated → redirect to `/auth/login` (blocks signup, landing)
- Native authenticated → redirect to `/dashboard` (skips landing/onboarding)
- Native expired subscription → **silent session destruction** (no billing UI messaging)

### 4.10 Push Notifications

**File:** `src/lib/push-notifications.ts`

- Dynamic import of `@capacitor/push-notifications`
- Registers device token with APNs/FCM → `POST /api/push/register`
- Stores in `push_device_tokens` table
- Handles foreground notifications (toast) and tapped notifications (deep-link)

### 4.11 NFC / Contactless Current State

**Result: NO NFC SUPPORT CONFIGURED**

- No iOS entitlements for NFC
- No Android `NFC` permission
- No NFC plugin dependencies
- Zero references to NFC, contactless, or near-field-communication in codebase

---

## Section 5: Database Schema

### 5.1 Tenant Payment Columns

| Column | Type | Nullable | Default | Migration |
|--------|------|----------|---------|-----------|
| `stripe_account_id` | text | YES | null | 001_initial_schema.sql:41 |
| `stripe_onboarding_complete` | boolean | NO | false | 001_initial_schema.sql:42 |
| `stripe_customer_id` | text | YES | null | (types only) |
| `stripe_subscription_id` | text | YES | null | (types only) |
| `stripe_reorder_customer_id` | text | YES | null | 055_salesforce_reorder.sql:23 |
| `square_merchant_id` | text | YES | null | 001_initial_schema.sql:37 |
| `square_access_token` | text | YES | null | 001_initial_schema.sql:38 |
| `square_refresh_token` | text | YES | null | 001_initial_schema.sql:39 |
| `square_location_id` | text | YES | null | 001_initial_schema.sql:40 |
| `default_payment_processor` | text | YES | null | 020_refunds_expenses_coexistence.sql:93 |
| `venmo_username` | text | YES | null | (types only) |
| `subscription_tier` | enum | NO | 'starter' | 001_initial_schema.sql:34 |
| `subscription_status` | enum | NO | varies | (types only) |
| `subscription_period_end` | timestamptz | YES | null | (types only) |
| `trial_ends_at` | timestamptz | YES | null | (types only) |
| `fee_handling` | enum | NO | 'absorb' | 001:35, 033:10 |
| `platform_fee_percent` | numeric | NO | 0 | (types only) |
| `crm_subscription_id` | text | YES | null | 032_crm_trial.sql:8 |
| `crm_enabled` | boolean | NO | false | 015_crm_enabled.sql |

### 5.2 Sales Payment Columns

| Column | Type | Nullable | Default | Migration |
|--------|------|----------|---------|-----------|
| `subtotal` | numeric(10,2) | NO | 0 | 001:219 |
| `discount_amount` | numeric(10,2) | NO | 0 | 001:220 |
| `tax_amount` | numeric(10,2) | NO | 0 | 001:221 |
| `tip_amount` | numeric(10,2) | NO | 0 | 001:222 |
| `platform_fee_amount` | numeric(10,2) | NO | 0 | 001:223 |
| `total` | numeric(10,2) | NO | 0 | 001:224 |
| `payment_method` | payment_method enum | NO | required | 001:226 |
| `payment_status` | payment_status enum | NO | 'pending' | 001:227 |
| `payment_provider` | text | YES | null | 001:228 |
| `payment_provider_id` | text | YES | null | 001:229 |
| `platform_fee_rate` | numeric | YES | null | 001:231 |
| `fee_handling` | text | YES | null | 001:232 |
| `stripe_checkout_session_id` | text | YES | null | 028:9 |
| `stripe_payment_intent_id` | text | YES | null | 028:10 |
| `platform_fee_collected` | numeric(10,2) | NO | 0 | 028:13 |
| `warranty_amount` | numeric(10,2) | NO | 0 | 051:74 |
| `refund_status` | text | NO | 'none' | 020:10 |
| `refund_amount` | numeric(10,2) | NO | 0 | 020:11 |
| `refunded_at` | timestamptz | YES | null | 020:12 |
| `refunded_by` | uuid | YES | null | 020:13 |
| `receipt_email` | text | YES | null | 001:236 |
| `receipt_phone` | text | YES | null | 001:237 |
| `receipt_sent_at` | timestamptz | YES | null | 001:238 |
| `status` | text | NO | 'completed' | 001:234 |
| `completed_by` | uuid | YES | null | 001:241 |

### 5.3 Payment Method Enum

```sql
-- Current values (from TypeScript + migrations):
'stripe_link' | 'square_link' | 'cash' | 'venmo' | 'card_external' | 'gift_card'
```

**Evolution:**
- Original (001): `card_present`, `card_not_present`, `cash`, `venmo`, `other`
- Migration 028: Added `stripe_link`
- Migration 077: Added `square_link`
- Current: `stripe_link`, `square_link`, `cash`, `venmo`, `card_external`, `gift_card`

### 5.4 Other Payment-Related Tables

#### `checkout_sessions` (052_checkout_sessions.sql)
Maps Stripe session IDs to tenant/account for public polling.

| Column | Type |
|--------|------|
| `session_id` | text (UNIQUE) |
| `tenant_id` | uuid |
| `stripe_account_id` | text |
| `amount_cents` | integer |
| `status` | text (default 'pending') |

#### `refunds` (020_refunds_expenses_coexistence.sql)

| Column | Type |
|--------|------|
| `sale_id` | uuid |
| `amount` | decimal(10,2) |
| `payment_method` | text |
| `stripe_refund_id` | text |
| `square_refund_id` | text |

#### `gift_cards` (029_gift_cards.sql)
Full gift card lifecycle with `remaining_balance`, `payment_method`, `sale_id`.

#### `gift_card_redemptions` (029_gift_cards.sql)
Links redemptions to sales with amount tracking.

#### `cash_drawers` + `cash_drawer_transactions` (034_cash_drawers.sql)
Cash drawer sessions with open/close/over-short tracking. Transactions: sale, tip, pay_in, pay_out, adjustment.

---

## Section 6: Plugin Evaluation

### 6a. @capacitor-community/stripe-terminal

**Repository:** [github.com/capacitor-community/stripe](https://github.com/capacitor-community/stripe)
**npm:** `@capacitor-community/stripe-terminal`

| Attribute | Value |
|-----------|-------|
| **Latest version** | 7.2.2 (Capacitor 7) / 8.0.1 (Capacitor 8, pre-release) |
| **Last published** | ~March 2026 |
| **Minimum Capacitor** | v7 (7.x line) / v8 (8.x line) |
| **Stripe Terminal SDK** | v3.x (7.x line) / v4 (8.x line) |
| **Tap to Pay support** | **YES** — `TerminalConnectTypes.TapToPay` discovery method |
| **Connect platform** | **YES** — Uses `tokenProviderEndpoint` URL; backend creates ConnectionToken with `Stripe-Account` header |
| **Maintenance** | Active, community-maintained with regular releases |

**Key usage pattern:**
```typescript
// 1. Discover local reader
await StripeTerminal.discoverReaders({ type: TerminalConnectTypes.TapToPay });
// 2. Connect
await StripeTerminal.connectReader();
// 3. Collect payment
await StripeTerminal.collectPaymentMethod({ paymentIntent: clientSecret });
// 4. Confirm
await StripeTerminal.confirmPaymentIntent();
```

**Connection token flow:** The plugin calls your backend endpoint automatically. Your backend creates a `ConnectionToken` via Stripe API with `Stripe-Account` header for the connected account. Standard Connect pattern.

**Known issues:**
- **Issue #367:** "Expired API Key" error after hours of continuous use. May need reader reconnection logic.
- **Issue #348:** `client_secret` mismatch errors. May affect PaymentIntent collection.
- Plugin still labeled "RC" but confirmed working in production by multiple users.

**Assessment:** PRIMARY CHOICE for Stripe. Actively maintained, Tap to Pay built in, Connect-compatible.

### 6b. Square Mobile Payments SDK — Capacitor Plugins

#### @capawesome/capacitor-square-mobile-payments (RECOMMENDED)

**Website:** [capawesome.io/plugins/square-mobile-payments](https://capawesome.io/plugins/square-mobile-payments/)

| Attribute | Value |
|-----------|-------|
| **Latest version** | 0.1.3 |
| **Last published** | February 4, 2026 |
| **License** | MIT (free, open source) |
| **Square SDK version** | 2.3.4 (configurable via variables.gradle) |
| **Tap to Pay iPhone** | **YES** — v0.1.3 added Tap to Pay account linking methods |
| **Tap to Pay Android** | **YES** — via underlying Square SDK (Android 9+, NFC required) |
| **Maintenance** | Active — Capawesome team (70+ Capacitor plugins) |

**Features:** Flexible UI (Square's default or custom), real-time reader status, multiple payment methods (contactless, chip, swipe, manual entry), online and offline payment processing.

**Assessment:** The only viable Capacitor plugin for Square Mobile Payments SDK. Early version (0.1.3) but from a reputable team. No custom plugin needed.

#### Other Square Plugins (NOT recommended)

- **@dolaned/capacitor-square** — Capacitor 5 only, wraps older SDK
- **capacitor-square-payments (jbrown0824)** — v0.0.2, last updated Feb 2021, abandoned, iOS only

### 6c. eventOneHQ/capacitor-stripe-terminal

| Attribute | Value |
|-----------|-------|
| **Latest version** | 2.1.0 |
| **Last published** | ~Mid 2022 (~4 years ago) |
| **Capacitor version** | 3–4 era |
| **Stripe Terminal SDK** | v1.x–2.x era |
| **Tap to Pay** | **NO** — predates local mobile discovery |
| **Maintenance** | Abandoned. Open issues unanswered since 2023. |

**Recommendation: IGNORE ENTIRELY.** Use `@capacitor-community/stripe-terminal` instead.

### Plugin Comparison Matrix

| Feature | @capacitor-community/stripe-terminal | @capawesome/capacitor-square-mobile-payments | eventOneHQ/capacitor-stripe-terminal |
|---------|--------------------------------------|----------------------------------------------|--------------------------------------|
| Latest Version | 8.0.1 (Cap 8) | 0.1.3 | 2.1.0 |
| Last Published | Mar 2026 | Feb 2026 | Mid 2022 |
| Actively Maintained | Yes | Yes | No |
| Tap to Pay iPhone | Yes | Yes (v0.1.3+) | No |
| Tap to Pay Android | Yes | Yes (via SDK) | No |
| Stripe Connect | Yes (backend token) | N/A | N/A |
| **Recommendation** | **PRIMARY for Stripe** | **PRIMARY for Square** | **DO NOT USE** |

### Apple Tap to Pay Requirements

**Entitlements required:**
1. **Tap to Pay on iPhone Entitlement** — Must request from Apple (managed entitlement)
   - Development entitlement: Auto-approved in 1–2 business days
   - Publishing entitlement (App Store): Reviewed by Apple, 1–2 weeks
2. **App Attest capability** — Must add in Xcode
3. **NFC Tag Reading capability** — Must add in Xcode

**Account requirements:**
- Organization-level Apple Developer account (NOT individual)
- Account Holder role required for entitlement requests

**PSP requirement:** Must use an approved PSP (both Stripe and Square are approved). The SDK handles ProximityReader API — you don't call it directly.

**Device requirements:**
- iPhone XS or later
- iOS 16.7+
- NOT available on iPad

### Android Tap to Pay Requirements

**No entitlement process needed** — significant advantage over iOS.

**Stripe Terminal Android requirements:**
- Min API level 26 (Android 8.0)
- NFC sensor required
- ARM processor
- Device not rooted, bootloader locked
- Security update within past 12 months
- Google Mobile Services with Play Store
- `compileSdkVersion` 34+

**Square Mobile Payments SDK Android requirements:**
- Android 9+ with NFC
- Accepts: Apple Pay, Google Pay, Samsung Pay, NFC cards
- Transaction limit: $50,000 contactless, $10,000 physical card

---

## Section 7: Risks, Dependencies, and Open Questions

### 7.1 Riskiest Assumptions

1. **`@capawesome/capacitor-square-mobile-payments` maturity** — At v0.1.3, this is the riskiest dependency. It wraps the Square Mobile Payments SDK but is very new. Thorough testing on real devices is essential before shipping. If it fails, the fallback is building a custom Capacitor plugin from scratch wrapping the native Square iOS/Android SDKs.

2. **`@capacitor-community/stripe-terminal` v8.0.1 stability** — The v8 line is a pre-release wrapping Stripe Terminal SDK v4, which had breaking changes. We're on Capacitor 8, so we need the v8 plugin. If v8 is unstable, we may need to pin to a specific build.

3. **Apple Tap to Pay entitlement timing** — The App Store publishing entitlement takes 1–2 weeks to approve. This is a blocking dependency for production deployment. Must be requested early.

4. **Remote-loaded app architecture** — The Capacitor shell loads from `https://sunstonepj.app` (not bundled). Capacitor plugins run natively but the web code calls them from the remote URL. This should work fine for plugin APIs but needs verification that the Stripe/Square Terminal SDKs can be initialized from a remote-loaded web context.

5. **No Square webhooks** — Square POS payments currently use polling (every 3s for 10 minutes). Tap to Pay would complete locally and synchronously — no polling needed. But the existing architecture doesn't have a "local payment completed" code path; it always creates a pending sale first, then waits for external confirmation. This flow needs adaptation.

### 7.2 Fragile Code Paths

1. **`PaymentScreen.tsx`** — This is already the most complex checkout component (~1000 lines). Adding Tap to Pay as a payment method will increase complexity. The `startChargePayment()` function specifically assumes the payment happens externally (QR/SMS → customer pays elsewhere → polling). Tap to Pay happens locally and synchronously, which is fundamentally different.

2. **Inventory deduction split** — Online payments defer inventory deduction to webhook/polling; offline payments deduct immediately. Tap to Pay is technically "online" (Stripe/Square processed) but happens synchronously like "offline". Which pattern to use? Recommend: immediate deduction (offline pattern) since payment is confirmed instantly.

3. **`payment_method` enum** — Currently has `stripe_link` and `square_link` for Stripe/Square. Tap to Pay needs new enum values (e.g., `stripe_tap`, `square_tap`, or `tap_to_pay`). This requires a database migration.

4. **Event mode jump ring flow** — The checkout flow in event mode has a JumpRingStep between payment and receipt. With Tap to Pay's instant confirmation, the UX timing changes. The jump ring step currently expects to run after `onPaymentCompleted(saleId)` for online payments.

5. **`create_sale_transaction()` RPC** — This 150-line PL/pgSQL function is the single point for all sale creation. Any new payment method must flow through it, which is good (centralized) but fragile (complex function with variant-aware deductions).

### 7.3 Open Questions

#### Apple / iOS
1. **Is the Sunstone Apple Developer account organization-level?** Individual accounts cannot request Tap to Pay entitlements.
2. **Who is the Account Holder?** Only the Account Holder can request managed entitlements.
3. **Can Tap to Pay work with remote-loaded Capacitor apps?** The native plugin runs locally, but we need to confirm the web → native bridge works correctly when the web layer is served from a remote URL.

#### Stripe
4. **Connection Token endpoint for Terminal:** We need a new API route (`/api/stripe/connection-token`) that creates `ConnectionToken` objects with the `Stripe-Account` header for the connected artist's account. Does our current Stripe API version (`2025-02-24.acacia`) support Terminal ConnectionToken creation?
5. **Do we need `PAYMENTS_WRITE_DIRECT` scope for Terminal?** Current OAuth scopes are `read_write`. Terminal may require additional capabilities on the connected account.
6. **PaymentIntent vs Terminal collect flow:** For Tap to Pay, the app creates a PaymentIntent server-side, then the Terminal SDK collects payment client-side. This is different from the current Checkout Session flow. How do we handle the server-side PaymentIntent creation for connected accounts?

#### Square
7. **Square authorization code for Mobile Payments SDK:** The Mobile Payments SDK requires a separate "authorization code" (not OAuth access token) for initializing the SDK on-device. How does this interact with our existing OAuth flow? Can we generate this code from the existing `square_access_token`?
8. **Square location_id requirement:** The Mobile Payments SDK requires a `location_id` for initialization. We already store `square_location_id` on tenant — does this work directly?
9. **Square offline payment handling:** The Mobile Payments SDK supports offline payments. Should we enable this? If so, how do we handle inventory deduction and sale recording when the device is offline?

#### General
10. **New payment method enum values:** What should the new enum values be? Options:
    - `stripe_tap` + `square_tap` (processor-specific)
    - `tap_to_pay` (generic, with `payment_provider` distinguishing processor)
    - `card_present` (reuse old deprecated value for in-person card payments)
11. **Refund flow for Tap to Pay:** Current refund logic checks `payment_provider` and `payment_provider_id`. Tap to Pay via Stripe Terminal uses PaymentIntents (not Checkout Sessions). The refund route already handles PaymentIntent-based refunds — does it need changes?
12. **Should Tap to Pay be available on web?** Tap to Pay only works on native iOS/Android. The PaymentScreen should only show the Tap to Pay option when `isNativeApp()` returns true AND the device supports it.

### 7.4 Recommended Build Sequencing

#### Phase 0: Prerequisites (Non-Code)
**Duration: 1–2 weeks (Apple entitlement lead time)**
1. Request Apple Tap to Pay development entitlement
2. Request Apple Tap to Pay publishing entitlement
3. Verify Apple Developer account is organization-level
4. Confirm Stripe Terminal is enabled on the platform account
5. Confirm Square Mobile Payments SDK is available for the application

#### Phase 1: Database & API Foundation
**Rationale: Schema changes must land first; everything else depends on them.**
1. Add new `payment_method` enum values (migration)
2. Create `POST /api/stripe/connection-token` endpoint (for Stripe Terminal SDK initialization)
3. Create `POST /api/stripe/terminal-payment-intent` endpoint (creates PaymentIntent for Terminal, not Checkout Session)
4. Create Square authorization code endpoint if needed for Mobile Payments SDK initialization

#### Phase 2: Stripe Tap to Pay (iOS + Android)
**Rationale: Stripe has the more mature plugin and simpler initialization. Start here for faster iteration.**
1. Install `@capacitor-community/stripe-terminal` (v8.x for Capacitor 8)
2. Add iOS entitlements: NFC Tag Reading, App Attest, Tap to Pay
3. Add Android permissions: NFC
4. Create `src/lib/stripe-terminal.ts` wrapper (initialize, discover, connect, collect, confirm)
5. Add Tap to Pay button to `PaymentScreen.tsx` (conditional on `isNativeApp()` + Stripe connected + device support)
6. Implement sale creation flow: Create PaymentIntent server-side → collect locally → confirm → record sale
7. Inventory deduction: Use immediate (offline) pattern since payment confirms locally
8. Test on physical iPhone and Android device

#### Phase 3: Square Tap to Pay (iOS + Android)
**Rationale: Depends on Phase 1 schema + Phase 2 patterns established.**
1. Install `@capawesome/capacitor-square-mobile-payments`
2. Create `src/lib/square-terminal.ts` wrapper
3. Add Square Tap to Pay option to `PaymentScreen.tsx`
4. Implement Square-specific initialization (authorization code, location ID)
5. Test on physical iPhone and Android device
6. **Fallback plan:** If the Capawesome plugin doesn't work reliably, build a custom Capacitor plugin wrapping Square's native SDKs directly

#### Phase 4: Polish & Edge Cases
1. Refund handling for Tap to Pay sales
2. Receipt sending (already works — just email/SMS after sale)
3. Cash drawer integration (Tap to Pay sales don't affect cash drawer)
4. Reports integration (ensure Tap to Pay sales show correctly in P&L, transaction lists)
5. Mentor knowledge update (Sunny knowledge for Tap to Pay)
6. Settings page: Show Tap to Pay status/configuration

#### Phase 5: App Store Submission
1. Update iOS entitlements from development to publishing
2. Build release candidates
3. TestFlight / internal testing
4. Submit to App Store and Play Store
5. Apple review (may take longer due to Tap to Pay payment functionality)

---

## Appendix: File Reference

| File | Purpose |
|------|---------|
| `src/app/dashboard/pos/page.tsx` | Store Mode POS |
| `src/app/dashboard/events/event-mode/page.tsx` | Event Mode POS |
| `src/components/pos/checkout/CheckoutFlow.tsx` | Checkout step orchestrator |
| `src/components/pos/checkout/PaymentScreen.tsx` | Payment method selection + processing |
| `src/components/pos/checkout/ReceiptScreen.tsx` | Post-sale receipt display |
| `src/components/pos/checkout/TipScreen.tsx` | Tip selection |
| `src/components/pos/checkout/JumpRingStep.tsx` | Jump ring resolution (event only) |
| `src/hooks/use-cart.ts` | Cart state (Zustand) |
| `src/types/index.ts` | TypeScript type definitions |
| `src/lib/stripe.ts` | Stripe utilities |
| `src/lib/native.ts` | Client-side native detection |
| `src/lib/native-server.ts` | Server-side native detection |
| `src/lib/billing-gate.ts` | Billing UI gating |
| `src/lib/push-notifications.ts` | Push notification setup |
| `src/lib/subscription.ts` | Subscription/fee logic |
| `src/lib/supabase/middleware.ts` | Auth + native redirect middleware |
| `src/app/api/stripe/payment-link/route.ts` | Stripe Checkout creation |
| `src/app/api/stripe/webhook/route.ts` | Stripe webhook handler |
| `src/app/api/stripe/authorize/route.ts` | Stripe OAuth start |
| `src/app/api/stripe/callback/route.ts` | Stripe OAuth callback |
| `src/app/api/stripe/disconnect/route.ts` | Stripe disconnect |
| `src/app/api/stripe/session-status/route.ts` | Payment status polling |
| `src/app/api/square/payment-link/route.ts` | Square Checkout creation |
| `src/app/api/square/check-payment/route.ts` | Square payment polling |
| `src/app/api/square/authorize/route.ts` | Square OAuth start |
| `src/app/api/square/callback/route.ts` | Square OAuth callback |
| `src/app/api/square/disconnect/route.ts` | Square disconnect |
| `src/app/api/payments/route.ts` | Direct card charge |
| `src/app/api/sales/[id]/refund/route.ts` | Refund processing |
| `capacitor.config.ts` | Capacitor configuration |
| `ios/App/App/Info.plist` | iOS permissions/config |
| `ios/App/App/App.entitlements` | iOS entitlements |
| `android/app/build.gradle` | Android build config |
| `android/app/src/main/AndroidManifest.xml` | Android permissions |
| `supabase/migrations/001_initial_schema.sql` | Base schema |
| `supabase/migrations/020_refunds_expenses_coexistence.sql` | Refunds + default_payment_processor |
| `supabase/migrations/028_payment_links.sql` | Stripe checkout session tracking |
| `supabase/migrations/029_gift_cards.sql` | Gift card system |
| `supabase/migrations/034_cash_drawers.sql` | Cash drawer system |
| `supabase/migrations/051_warranty_system.sql` | Warranty tracking |
| `supabase/migrations/052_checkout_sessions.sql` | Session→tenant mapping |
| `supabase/migrations/060_variant_sale_deductions.sql` | create_sale_transaction() RPC |
| `supabase/migrations/077_add_square_link_payment_method.sql` | square_link enum value |
