// ============================================================================
// Commission Engine — src/lib/commission-engine.ts
// ============================================================================
// Core business logic for ambassador commission calculations and payouts.
// Pure functions that operate via service role Supabase client.
// ============================================================================

import Stripe from 'stripe';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { sendReferralConvertedEmail, sendPayoutProcessedEmail } from '@/lib/ambassador-emails';

const DEFAULT_COMMISSION_RATE = 0.20; // 20%
const DEFAULT_COMMISSION_DURATION_MONTHS = 8;
const MINIMUM_PAYOUT = 25; // $25 minimum

/**
 * Check if a tenant was referred by an ambassador.
 * Returns the ambassador and referral data if active commission window exists.
 */
export async function getActiveReferral(tenantId: string): Promise<{
  ambassador: any;
  referral: any;
} | null> {
  const supabase = await createServiceRoleClient();

  // 1. Check if tenant has a referring ambassador
  const { data: tenant } = await supabase
    .from('tenants')
    .select('referred_by_ambassador_id')
    .eq('id', tenantId)
    .single();

  if (!tenant?.referred_by_ambassador_id) return null;

  // 2. Get the referral record for this tenant
  const { data: referral } = await supabase
    .from('referrals')
    .select('*')
    .eq('referred_tenant_id', tenantId)
    .eq('status', 'converted')
    .single();

  if (!referral) return null;

  // 3. Check commission window hasn't expired
  if (referral.commission_expires_at && new Date(referral.commission_expires_at) <= new Date()) {
    return null;
  }

  // 4. Get ambassador, check they're active
  const { data: ambassador } = await supabase
    .from('ambassadors')
    .select('*')
    .eq('id', referral.ambassador_id)
    .eq('status', 'active')
    .single();

  if (!ambassador) return null;

  return { ambassador, referral };
}

/**
 * Create a commission entry for a paid invoice.
 * Called by the Stripe webhook when invoice.payment_succeeded fires.
 *
 * IMPORTANT: Idempotent — if a commission entry already exists for
 * this stripe_invoice_id, it returns without creating a duplicate.
 */
export async function createCommissionEntry(params: {
  tenantId: string;
  stripeInvoiceId: string;
  invoiceAmount: number; // amount in dollars (not cents)
  billingPeriodStart: string; // ISO date
  billingPeriodEnd: string; // ISO date
}): Promise<{ created: boolean; commissionId?: string; error?: string }> {
  const supabase = await createServiceRoleClient();

  // 1. Idempotency check — skip if commission already exists for this invoice
  const { data: existing } = await supabase
    .from('commission_entries')
    .select('id')
    .eq('stripe_invoice_id', params.stripeInvoiceId)
    .single();

  if (existing) {
    return { created: false, commissionId: existing.id };
  }

  // 2. Get active referral for this tenant
  const active = await getActiveReferral(params.tenantId);
  if (!active) {
    return { created: false };
  }

  // 3. Calculate commission using per-ambassador rate (fallback to default)
  const rate = Number(active.ambassador.commission_rate) || DEFAULT_COMMISSION_RATE;
  const commissionAmount = params.invoiceAmount * rate;

  // 4. Insert commission entry
  const { data: entry, error: insertError } = await supabase
    .from('commission_entries')
    .insert({
      ambassador_id: active.ambassador.id,
      referral_id: active.referral.id,
      tenant_id: params.tenantId,
      stripe_invoice_id: params.stripeInvoiceId,
      invoice_amount: params.invoiceAmount,
      commission_rate: rate,
      commission_amount: commissionAmount,
      billing_period_start: params.billingPeriodStart,
      billing_period_end: params.billingPeriodEnd,
      status: 'pending',
    })
    .select('id')
    .single();

  if (insertError) {
    console.error('[Commission] Insert failed:', insertError);
    return { created: false, error: insertError.message };
  }

  // 5. Increment total_commission_earned on the referral
  const newTotal = Number(active.referral.total_commission_earned || 0) + commissionAmount;
  await supabase
    .from('referrals')
    .update({ total_commission_earned: newTotal, updated_at: new Date().toISOString() })
    .eq('id', active.referral.id);

  console.log(`[Commission] Created entry ${entry.id}: $${commissionAmount.toFixed(2)} for ambassador ${active.ambassador.id}`);

  return { created: true, commissionId: entry.id };
}

/**
 * Transition a referral from 'signed_up' to 'converted' when
 * the referred artist pays their first invoice.
 * Sets converted_at and commission_expires_at (+ 8 months).
 */
export async function markReferralConverted(tenantId: string): Promise<void> {
  const supabase = await createServiceRoleClient();

  // Find the referral with status 'signed_up' for this tenant
  const { data: referral } = await supabase
    .from('referrals')
    .select('id, status, ambassador_id')
    .eq('referred_tenant_id', tenantId)
    .eq('status', 'signed_up')
    .single();

  if (!referral) return; // Already converted or no referral

  // Get ambassador's custom duration (fallback to default)
  const { data: amb } = await supabase
    .from('ambassadors')
    .select('commission_rate, commission_duration_months')
    .eq('id', referral.ambassador_id)
    .single();

  const durationMonths = Number(amb?.commission_duration_months) || DEFAULT_COMMISSION_DURATION_MONTHS;
  const ambassadorRate = Number(amb?.commission_rate) || DEFAULT_COMMISSION_RATE;

  // Calculate commission expiry using per-ambassador duration
  const expiresAt = new Date();
  expiresAt.setMonth(expiresAt.getMonth() + durationMonths);

  await supabase
    .from('referrals')
    .update({
      status: 'converted',
      converted_at: new Date().toISOString(),
      commission_expires_at: expiresAt.toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', referral.id);

  console.log(`[Commission] Referral ${referral.id} converted — commission window: ${durationMonths} months`);

  // Notify ambassador of conversion (fire-and-forget)
  try {
    const { data: amb } = await supabase
      .from('ambassadors')
      .select('name, email')
      .eq('id', referral.ambassador_id)
      .single();

    if (amb?.email) {
      // Get tenant plan to calculate first commission amount
      const { data: t } = await supabase
        .from('tenants')
        .select('subscription_tier')
        .eq('id', tenantId)
        .single();

      const tierPrices: Record<string, number> = { starter: 99, pro: 169, business: 279 };
      const monthlyPrice = tierPrices[t?.subscription_tier || 'starter'] || 99;
      const commissionAmount = monthlyPrice * ambassadorRate;

      sendReferralConvertedEmail({
        ambassadorEmail: amb.email,
        ambassadorName: amb.name || 'Ambassador',
        commissionAmount,
      }).catch(() => {});
    }
  } catch {
    // Non-fatal
  }
}

/**
 * Mark a referral as churned when the referred artist cancels.
 * Called by subscription cancellation webhook.
 */
export async function markReferralChurned(tenantId: string): Promise<void> {
  const supabase = await createServiceRoleClient();

  // Find active (converted) referral for this tenant
  const { data: referral } = await supabase
    .from('referrals')
    .select('id')
    .eq('referred_tenant_id', tenantId)
    .eq('status', 'converted')
    .single();

  if (!referral) return;

  await supabase
    .from('referrals')
    .update({
      status: 'churned',
      churned_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', referral.id);

  console.log(`[Commission] Referral ${referral.id} churned — no future commissions`);
}

/**
 * Process monthly payouts for all ambassadors.
 * Called by the Vercel cron job on the 14th of each month.
 *
 * For each ambassador with pending commissions >= $25:
 * 1. Aggregate pending commission amounts
 * 2. Create an ambassador_payouts record
 * 3. Execute Stripe Transfer to their Connect account
 * 4. Update commission entries to 'paid'
 */
export async function processMonthlyPayouts(): Promise<{
  processed: number;
  failed: number;
  totalPaid: number;
  errors: string[];
}> {
  const results = { processed: 0, failed: 0, totalPaid: 0, errors: [] as string[] };
  const supabase = await createServiceRoleClient();

  // Step 0: Mark expired referrals (commission window closed)
  await supabase
    .from('referrals')
    .update({ status: 'expired', updated_at: new Date().toISOString() })
    .eq('status', 'converted')
    .lt('commission_expires_at', new Date().toISOString());

  // Step 1: Get all active ambassadors with Stripe Connect onboarded
  const { data: ambassadors } = await supabase
    .from('ambassadors')
    .select('id, name, email, stripe_connect_account_id')
    .eq('status', 'active')
    .eq('stripe_connect_onboarded', true)
    .not('stripe_connect_account_id', 'is', null);

  if (!ambassadors || ambassadors.length === 0) {
    console.log('[Payouts] No eligible ambassadors found');
    return results;
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  const payoutDate = new Date().toISOString().split('T')[0];

  for (const ambassador of ambassadors) {
    try {
      // Step 2: Sum pending commissions for this ambassador
      const { data: pendingEntries } = await supabase
        .from('commission_entries')
        .select('id, commission_amount')
        .eq('ambassador_id', ambassador.id)
        .eq('status', 'pending');

      if (!pendingEntries || pendingEntries.length === 0) continue;

      const totalAmount = pendingEntries.reduce(
        (sum, e) => sum + Number(e.commission_amount), 0
      );

      // Step 3: Skip if below minimum payout threshold
      if (totalAmount < MINIMUM_PAYOUT) {
        console.log(`[Payouts] ${ambassador.name}: $${totalAmount.toFixed(2)} below minimum ($${MINIMUM_PAYOUT}), skipping`);
        continue;
      }

      // Step 4: Create payout record
      const { data: payout, error: payoutError } = await supabase
        .from('ambassador_payouts')
        .insert({
          ambassador_id: ambassador.id,
          amount: totalAmount,
          commission_count: pendingEntries.length,
          stripe_connect_account_id: ambassador.stripe_connect_account_id,
          status: 'processing',
          scheduled_for: payoutDate,
        })
        .select('id')
        .single();

      if (payoutError || !payout) {
        results.failed++;
        results.errors.push(`${ambassador.name}: Failed to create payout record`);
        continue;
      }

      // Step 5: Execute Stripe Transfer
      const monthLabel = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      const transfer = await stripe.transfers.create({
        amount: Math.round(totalAmount * 100), // Stripe uses cents
        currency: 'usd',
        destination: ambassador.stripe_connect_account_id!,
        description: `Sunstone Ambassador Payout — ${monthLabel}`,
        metadata: {
          ambassador_id: ambassador.id,
          payout_id: payout.id,
        },
      });

      // Step 6: Update payout to 'paid'
      await supabase
        .from('ambassador_payouts')
        .update({
          status: 'paid',
          processed_at: new Date().toISOString(),
          stripe_transfer_id: transfer.id,
        })
        .eq('id', payout.id);

      // Step 7: Mark all included commission entries as 'paid'
      const entryIds = pendingEntries.map((e) => e.id);
      await supabase
        .from('commission_entries')
        .update({
          status: 'paid',
          paid_at: new Date().toISOString(),
          payout_id: payout.id,
        })
        .in('id', entryIds);

      results.processed++;
      results.totalPaid += totalAmount;
      console.log(`[Payouts] ${ambassador.name}: $${totalAmount.toFixed(2)} transferred (${transfer.id})`);

      // Notify ambassador of payout (fire-and-forget)
      if (ambassador.email) {
        sendPayoutProcessedEmail({
          ambassadorEmail: ambassador.email,
          ambassadorName: ambassador.name || 'Ambassador',
          payoutAmount: totalAmount,
          commissionCount: pendingEntries.length,
        }).catch(() => {});
      }
    } catch (err: any) {
      results.failed++;
      results.errors.push(`${ambassador.name}: ${err.message}`);

      // Mark payout as failed if we created one
      // (the payout record may not exist if the error was before insertion)
      console.error(`[Payouts] ${ambassador.name} failed:`, err.message);
    }
  }

  return results;
}

/**
 * Get pending (unpaid) commission total for an ambassador.
 */
export async function getPendingCommissions(ambassadorId: string): Promise<{
  total: number;
  count: number;
}> {
  const supabase = await createServiceRoleClient();

  const { data: entries } = await supabase
    .from('commission_entries')
    .select('commission_amount')
    .eq('ambassador_id', ambassadorId)
    .eq('status', 'pending');

  if (!entries || entries.length === 0) return { total: 0, count: 0 };

  return {
    total: entries.reduce((sum, e) => sum + Number(e.commission_amount), 0),
    count: entries.length,
  };
}
