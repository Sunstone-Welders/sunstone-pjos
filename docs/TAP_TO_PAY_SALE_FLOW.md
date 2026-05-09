# Tap to Pay — Sale Recording Flow

How Tap to Pay sales flow through the existing `create_sale_transaction()` RPC.

## Key Difference from Online Payments

Tap to Pay follows the **offline/synchronous** payment pattern — NOT the online/deferred pattern:

| Aspect | Online (Stripe/Square Links) | Tap to Pay |
|--------|------------------------------|------------|
| Payment confirmation | Async (webhook/polling) | Synchronous (on-device) |
| `payment_status` at creation | `pending` | `completed` |
| Inventory deduction | Deferred to webhook | Immediate (inside RPC) |
| Payment method | `stripe_link` / `square_link` | `stripe_tap` / `square_tap` |

## Sale Creation Parameters

When calling `create_sale_transaction()` for a Tap to Pay sale:

```typescript
{
  // Standard sale fields (same as cash/venmo/card_external)
  p_tenant_id: tenantId,
  p_payment_method: 'stripe_tap',  // or 'square_tap'
  p_payment_status: 'completed',   // NOT 'pending' — confirmation is synchronous
  p_payment_provider: 'stripe',    // or 'square'
  p_payment_provider_id: paymentIntentId,  // Stripe PI ID or Square Payment ID
  // ... other standard fields (items, client, event, tip, tax, etc.)
}
```

## Field Mapping

| Field | Stripe Tap to Pay | Square Tap to Pay |
|-------|-------------------|-------------------|
| `payment_method` | `stripe_tap` | `square_tap` |
| `payment_provider` | `stripe` | `square` |
| `payment_provider_id` | Stripe PaymentIntent ID (`pi_xxx`) | Square Payment ID |
| `payment_status` | `completed` | `completed` |
| `stripe_payment_intent_id` | Set to PI ID (mirrors Checkout flow) | `null` |
| `platform_fee_collected` | `0` (fees removed) | `0` (fees removed) |

## Inventory Deduction

Because `payment_status = 'completed'`, the `create_sale_transaction()` RPC will:
1. Create the sale record
2. Create sale_items records
3. **Immediately deduct inventory** (chain by `inches_used`, other items by quantity)
4. Log inventory movements

This is the same behavior as cash, venmo, and card_external payments.

## Flow Sequence

### Stripe Tap to Pay
```
1. Cart finalized → TipScreen → PaymentScreen
2. User selects "Tap to Pay" (only visible in native app)
3. POST /api/stripe/connection-token → { secret }
4. Initialize Stripe Terminal SDK with connection token
5. POST /api/stripe/terminal-payment-intent → { clientSecret, paymentIntentId }
6. Terminal SDK collects payment (customer taps card/phone)
7. SDK confirms payment succeeded
8. Call create_sale_transaction() with payment_status='completed'
9. Inventory deducted, sale recorded atomically
10. Show ReceiptScreen, send receipts
```

### Square Tap to Pay
```
1. Cart finalized → TipScreen → PaymentScreen
2. User selects "Tap to Pay" (only visible in native app)
3. POST /api/square/mobile-payments-auth → { accessToken, locationId }
4. Initialize Square Mobile Payments SDK with credentials
5. SDK creates and collects payment (customer taps card/phone)
6. SDK returns Square Payment ID on success
7. Call create_sale_transaction() with payment_status='completed'
8. Inventory deducted, sale recorded atomically
9. Show ReceiptScreen, send receipts
```

## Refund Handling

Tap to Pay sales use standard PaymentIntents (Stripe) or Payments (Square), so existing refund flows apply without modification:
- Stripe: `stripe.refunds.create({ payment_intent: pi_xxx })` on the connected account
- Square: `squareClient.refundsApi.refundPayment()` with the payment ID

## Offline Considerations

If the device loses network connectivity after payment collection but before sale recording:
- The payment has already been collected by the processor
- The sale should be queued locally and retried when connectivity returns
- This will be handled by the Capacitor offline queue (Phase 3)
