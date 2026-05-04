// ============================================================================
// Trial Expiration Emails Cron — GET /api/cron/trial-emails
// ============================================================================
// Vercel cron: runs daily at 3pm UTC (8am MST / 9am MDT).
// Sends 7-day, 1-day, and expired trial email notifications.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { sendTrialEmail, type TrialEmailParams } from '@/lib/emails/trial-emails';

const CRON_SECRET = process.env.CRON_SECRET;

// Demo tenant IDs to exclude
const DEMO_TENANT_IDS = [
  process.env.NEXT_PUBLIC_DEMO_NEWBIE_TENANT_ID,
  process.env.NEXT_PUBLIC_DEMO_MID_TENANT_ID,
  process.env.NEXT_PUBLIC_DEMO_PRO_TENANT_ID,
].filter(Boolean) as string[];

export async function GET(request: NextRequest) {
  // Verify cron secret (Vercel sends Authorization header)
  const authHeader = request.headers.get('authorization');
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  console.log('[Trial Emails] Starting daily trial email check...');

  const results = { sent_7day: 0, sent_1day: 0, sent_expired: 0, errors: [] as string[] };

  try {
    const supabase = await createServiceRoleClient();

    // Query tenants in trial (no subscription, trial_ends_at set, no admin override)
    let query = supabase
      .from('tenants')
      .select('id, name, trial_ends_at, trial_email_7day_sent_at, trial_email_1day_sent_at, trial_email_expired_sent_at')
      .not('trial_ends_at', 'is', null)
      .is('stripe_subscription_id', null)
      .not('subscription_status', 'eq', 'active')
      .not('subscription_status', 'eq', 'past_due')
      .or('admin_tier_override.is.null,admin_tier_override.eq.false');

    // Exclude demo tenants
    if (DEMO_TENANT_IDS.length > 0) {
      query = query.not('id', 'in', `(${DEMO_TENANT_IDS.join(',')})`);
    }

    const { data: tenants, error: tenantError } = await query;

    if (tenantError) {
      console.error('[Trial Emails] Tenant query error:', tenantError);
      return NextResponse.json({ error: 'Tenant query failed' }, { status: 500 });
    }

    if (!tenants || tenants.length === 0) {
      console.log('[Trial Emails] No tenants in trial window.');
      return NextResponse.json({ success: true, ...results });
    }

    const now = new Date();

    for (const tenant of tenants) {
      try {
        const trialEnd = new Date(tenant.trial_ends_at!);
        const daysRemaining = Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        // Determine which email to send (if any)
        let emailType: '7day' | '1day' | 'expired' | null = null;

        if (daysRemaining >= 6 && daysRemaining <= 8 && !tenant.trial_email_7day_sent_at) {
          emailType = '7day';
        } else if (daysRemaining >= 0 && daysRemaining <= 2 && !tenant.trial_email_1day_sent_at) {
          emailType = '1day';
        } else if (daysRemaining >= -3 && daysRemaining <= -1 && !tenant.trial_email_expired_sent_at) {
          emailType = 'expired';
        }

        if (!emailType) continue;

        // Look up owner email from auth.users via tenant_members
        const { data: memberData } = await supabase
          .from('tenant_members')
          .select('user_id')
          .eq('tenant_id', tenant.id)
          .eq('role', 'owner')
          .limit(1)
          .single();

        if (!memberData?.user_id) {
          results.errors.push(`${tenant.id}: No owner found`);
          continue;
        }

        // Service role can query auth.users via admin API
        const { data: userData, error: userError } = await supabase.auth.admin.getUserById(memberData.user_id);

        if (userError || !userData?.user?.email) {
          results.errors.push(`${tenant.id}: Could not fetch owner email`);
          continue;
        }

        const ownerEmail = userData.user.email;
        const ownerFirstName = (userData.user.user_metadata?.first_name as string) || null;

        const emailParams: TrialEmailParams = {
          businessName: tenant.name || 'your studio',
          ownerEmail,
          ownerFirstName,
          daysRemaining: Math.max(daysRemaining, 0),
          trialEndsAt: trialEnd,
        };

        // Send the email
        await sendTrialEmail(emailParams, emailType);

        // Mark as sent
        const sentColumn = emailType === '7day'
          ? 'trial_email_7day_sent_at'
          : emailType === '1day'
          ? 'trial_email_1day_sent_at'
          : 'trial_email_expired_sent_at';

        await supabase
          .from('tenants')
          .update({ [sentColumn]: new Date().toISOString() })
          .eq('id', tenant.id);

        // Increment counter
        if (emailType === '7day') results.sent_7day++;
        else if (emailType === '1day') results.sent_1day++;
        else results.sent_expired++;

        console.log(`[Trial Emails] Sent ${emailType} email to ${ownerEmail} (tenant: ${tenant.id})`);
      } catch (err: any) {
        results.errors.push(`${tenant.id}: ${err.message}`);
        console.error(`[Trial Emails] Error for tenant ${tenant.id}:`, err);
      }
    }

    const total = results.sent_7day + results.sent_1day + results.sent_expired;
    console.log(`[Trial Emails] Complete: ${total} sent (7day: ${results.sent_7day}, 1day: ${results.sent_1day}, expired: ${results.sent_expired}), ${results.errors.length} errors`);

    return NextResponse.json({ success: true, ...results });
  } catch (error: any) {
    console.error('[Trial Emails] Fatal error:', error);
    return NextResponse.json({ error: 'Trial email processing failed' }, { status: 500 });
  }
}
