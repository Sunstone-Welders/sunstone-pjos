// ============================================================================
// Stripe Webhook Route — src/app/api/stripe/webhook/route.ts
// ============================================================================
// Handles Stripe subscription lifecycle events AND POS payment link events
// from connected accounts. No auth — verified by Stripe webhook signature.
// Uses service role to bypass RLS.
//
// Events handled:
//   - checkout.session.completed (subscription + POS payment links)
//   - checkout.session.expired (POS payment link timeout)
//   - customer.subscription.created
//   - customer.subscription.updated
//   - customer.subscription.deleted
//   - invoice.payment_succeeded
//   - invoice.payment_failed
// ============================================================================

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getPlatformFeePercent, type SubscriptionTier } from '@/lib/subscription';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-02-24.acacia' as any,
});

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

// Map Stripe price IDs to our tier names
function getTierFromPriceId(priceId: string): SubscriptionTier {
  if (priceId === process.env.STRIPE_PRICE_STARTER) return 'starter';
  if (priceId === process.env.STRIPE_PRICE_PRO) return 'pro';
  if (priceId === process.env.STRIPE_PRICE_BUSINESS) return 'business';
  return 'starter';
}

// Get tier from a Stripe subscription object
function getTierFromSubscription(subscription: Stripe.Subscription): SubscriptionTier {
  const priceId = subscription.items.data[0]?.price?.id;
  if (!priceId) return 'starter';
  return getTierFromPriceId(priceId);
}

// Map Stripe subscription status to our status
function mapSubscriptionStatus(stripeStatus: string): string {
  switch (stripeStatus) {
    case 'active': return 'active';
    case 'trialing': return 'trialing';
    case 'past_due': return 'past_due';
    case 'canceled': return 'canceled';
    case 'unpaid': return 'unpaid';
    case 'incomplete': return 'past_due';
    case 'incomplete_expired': return 'canceled';
    default: return 'none';
  }
}

export async function POST(request: NextRequest) {
  let event: Stripe.Event;

  try {
    // 1. Read raw body for signature verification
    const rawBody = await request.text();
    const signature = request.headers.get('stripe-signature');

    if (!signature) {
      console.error('Missing stripe-signature header');
      return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
    }

    // 2. Verify webhook signature
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const serviceRole = await createServiceRoleClient();

  try {
    switch (event.type) {
      // ================================================================
      // Checkout completed — subscription OR POS payment link
      // ================================================================
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const saleId = session.metadata?.sale_id;

        // ── POS Payment Link completed (from connected account) ──
        if (session.mode === 'payment' && saleId) {
          const paymentIntentId = typeof session.payment_intent === 'string'
            ? session.payment_intent : null;

          // Retrieve the application fee from the payment intent
          let feeCollected = 0;
          if (paymentIntentId && event.account) {
            try {
              const pi = await stripe.paymentIntents.retrieve(
                paymentIntentId,
                { expand: ['application_fee'] },
                { stripeAccount: event.account }
              );
              feeCollected = (pi as any).application_fee?.amount
                ? (pi as any).application_fee.amount / 100
                : 0;
            } catch {
              // Non-critical — fee tracking won't block sale completion
            }
          }

          await serviceRole
            .from('sales')
            .update({
              payment_status: 'completed',
              stripe_payment_intent_id: paymentIntentId,
              platform_fee_collected: feeCollected,
            })
            .eq('id', saleId);

          console.log(`[Webhook] POS payment completed — sale ${saleId}, fee collected: $${feeCollected}`);
          break;
        }

        // ── CRM add-on checkout completed ──
        if (session.mode === 'subscription' && session.metadata?.type === 'crm_addon') {
          const crmTenantId = session.metadata?.tenant_id;
          const crmSubId = session.subscription as string;
          const crmCustomerId = session.customer as string;

          if (crmTenantId) {
            await serviceRole
              .from('tenants')
              .update({
                crm_enabled: true,
                crm_subscription_id: crmSubId,
                crm_activated_at: new Date().toISOString(),
                crm_deactivated_at: null,
                stripe_customer_id: crmCustomerId,
              })
              .eq('id', crmTenantId);

            console.log(`[Webhook] CRM add-on activated — tenant ${crmTenantId}`);
          }
          break;
        }

        // ── Subscription checkout completed ──
        if (session.mode !== 'subscription') break;

        const customerId = session.customer as string;
        const subscriptionId = session.subscription as string;
        const tenantId = session.metadata?.tenant_id;
        const tier = (session.metadata?.tier as SubscriptionTier) || 'pro';

        // Determine actual subscription status (may be 'trialing' if deferred billing)
        let subStatus: string = 'active';
        if (subscriptionId) {
          try {
            const sub = await stripe.subscriptions.retrieve(subscriptionId);
            subStatus = mapSubscriptionStatus(sub.status);
          } catch {
            // Fall back to 'active' if we can't retrieve
          }
        }

        if (!tenantId) {
          // Fallback: look up tenant by stripe_customer_id
          const { data: tenant } = await serviceRole
            .from('tenants')
            .select('id')
            .eq('stripe_customer_id', customerId)
            .single();

          if (!tenant) {
            console.error('No tenant found for customer:', customerId);
            break;
          }

          await serviceRole
            .from('tenants')
            .update({
              subscription_tier: tier,
              stripe_subscription_id: subscriptionId,
              subscription_status: subStatus,
              platform_fee_percent: getPlatformFeePercent(tier),
            })
            .eq('id', tenant.id);
        } else {
          await serviceRole
            .from('tenants')
            .update({
              stripe_customer_id: customerId,
              subscription_tier: tier,
              stripe_subscription_id: subscriptionId,
              subscription_status: subStatus,
              platform_fee_percent: getPlatformFeePercent(tier),
            })
            .eq('id', tenantId);
        }

        console.log(`[Webhook] checkout.session.completed — tenant ${tenantId}, tier ${tier}, status ${subStatus}`);
        break;
      }

      // ================================================================
      // Checkout expired — POS payment link timed out
      // ================================================================
      case 'checkout.session.expired': {
        const session = event.data.object as Stripe.Checkout.Session;
        const saleId = session.metadata?.sale_id;

        if (saleId) {
          await serviceRole
            .from('sales')
            .update({ payment_status: 'expired' })
            .eq('id', saleId);

          console.log(`[Webhook] POS payment expired — sale ${saleId}`);
        }
        break;
      }

      // ================================================================
      // Subscription updated — tier change, status change, renewal
      // ================================================================
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;
        const tier = getTierFromSubscription(subscription);
        const status = mapSubscriptionStatus(subscription.status);
        const periodEnd = subscription.current_period_end
          ? new Date(subscription.current_period_end * 1000).toISOString()
          : null;

        // Look up tenant by stripe_customer_id
        const { data: tenant } = await serviceRole
          .from('tenants')
          .select('id')
          .eq('stripe_customer_id', customerId)
          .single();

        if (!tenant) {
          // Try metadata
          const tenantId = subscription.metadata?.tenant_id;
          if (tenantId) {
            await serviceRole
              .from('tenants')
              .update({
                stripe_customer_id: customerId,
                stripe_subscription_id: subscription.id,
                subscription_tier: tier,
                subscription_status: status,
                subscription_period_end: periodEnd,
                platform_fee_percent: getPlatformFeePercent(tier),
              })
              .eq('id', tenantId);
          } else {
            console.error('No tenant found for customer:', customerId);
          }
          break;
        }

        await serviceRole
          .from('tenants')
          .update({
            stripe_subscription_id: subscription.id,
            subscription_tier: tier,
            subscription_status: status,
            subscription_period_end: periodEnd,
            platform_fee_percent: getPlatformFeePercent(tier),
          })
          .eq('id', tenant.id);

        console.log(`[Webhook] ${event.type} — tenant ${tenant.id}, tier ${tier}, status ${status}`);
        break;
      }

      // ================================================================
      // Subscription deleted — downgrade to starter or deactivate CRM
      // ================================================================
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        const { data: tenant } = await serviceRole
          .from('tenants')
          .select('id, crm_subscription_id, stripe_subscription_id')
          .eq('stripe_customer_id', customerId)
          .single();

        if (!tenant) {
          console.error('No tenant found for deleted subscription, customer:', customerId);
          break;
        }

        // Check if this is the CRM add-on subscription being canceled
        if (tenant.crm_subscription_id === subscription.id) {
          await serviceRole
            .from('tenants')
            .update({
              crm_enabled: false,
              crm_subscription_id: null,
              crm_deactivated_at: new Date().toISOString(),
            })
            .eq('id', tenant.id);

          console.log(`[Webhook] CRM subscription.deleted — tenant ${tenant.id} → CRM deactivated`);
          break;
        }

        // Main platform subscription canceled
        await serviceRole
          .from('tenants')
          .update({
            subscription_tier: 'starter',
            subscription_status: 'canceled',
            stripe_subscription_id: null,
            subscription_period_end: null,
            platform_fee_percent: getPlatformFeePercent('starter'),
          })
          .eq('id', tenant.id);

        console.log(`[Webhook] subscription.deleted — tenant ${tenant.id} → starter`);
        break;
      }

      // ================================================================
      // Payment failed — mark as past_due
      // ================================================================
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;

        if (!invoice.subscription) break; // Not a subscription invoice

        const { data: tenant } = await serviceRole
          .from('tenants')
          .select('id')
          .eq('stripe_customer_id', customerId)
          .single();

        if (tenant) {
          await serviceRole
            .from('tenants')
            .update({ subscription_status: 'past_due' })
            .eq('id', tenant.id);

          console.log(`[Webhook] invoice.payment_failed — tenant ${tenant.id} → past_due`);
        }
        break;
      }

      // ================================================================
      // Payment succeeded — recover from past_due
      // ================================================================
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;

        if (!invoice.subscription) break; // Not a subscription invoice

        const { data: tenant } = await serviceRole
          .from('tenants')
          .select('id, subscription_status')
          .eq('stripe_customer_id', customerId)
          .single();

        if (tenant && tenant.subscription_status === 'past_due') {
          await serviceRole
            .from('tenants')
            .update({ subscription_status: 'active' })
            .eq('id', tenant.id);

          console.log(`[Webhook] invoice.payment_succeeded — tenant ${tenant.id} → active (recovered)`);
        }
        break;
      }

      default:
        // Unhandled event type — that's fine, return 200
        break;
    }
  } catch (error: any) {
    console.error(`[Webhook] Error handling ${event.type}:`, error);
    // Still return 200 — Stripe retries on non-2xx, and we don't want infinite retries for DB errors
  }

  return NextResponse.json({ received: true });
}