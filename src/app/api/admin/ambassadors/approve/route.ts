// ============================================================================
// Admin Approve Ambassador — POST /api/admin/ambassadors/approve
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { verifyPlatformAdmin, AdminAuthError } from '@/lib/admin/verify-platform-admin';
import { getReferralLink } from '@/lib/ambassador-utils';

export async function POST(request: NextRequest) {
  try {
    const admin = await verifyPlatformAdmin();
    const { ambassadorId } = await request.json();

    if (!ambassadorId) {
      return NextResponse.json({ error: 'ambassadorId required' }, { status: 400 });
    }

    const supabase = await createServiceRoleClient();

    const { data: ambassador, error } = await supabase
      .from('ambassadors')
      .update({
        status: 'active',
        approved_at: new Date().toISOString(),
        approved_by: admin.id,
      })
      .eq('id', ambassadorId)
      .select('*')
      .single();

    if (error) {
      console.error('[Admin Approve] Update error:', error);
      return NextResponse.json({ error: 'Failed to approve' }, { status: 500 });
    }

    // Send approval email via Resend (non-blocking)
    if (ambassador?.email && process.env.RESEND_API_KEY) {
      try {
        const link = getReferralLink(ambassador.referral_code);
        const { Resend } = await import('resend');
        const resend = new Resend(process.env.RESEND_API_KEY);
        await resend.emails.send({
          from: `Sunstone <${process.env.RESEND_FROM_EMAIL || 'noreply@sunstonepj.app'}>`,
          to: ambassador.email,
          subject: 'Welcome to the Sunstone Ambassador Program!',
          html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
              <h2 style="color: #1a1a1a;">You've been approved!</h2>
              <p style="color: #555; line-height: 1.6;">Hi ${ambassador.name},</p>
              <p style="color: #555; line-height: 1.6;">Your Sunstone Ambassador application has been approved. Start sharing your referral link:</p>
              <p style="margin: 20px 0;"><a href="${link}" style="background: #B1275E; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">${link}</a></p>
              <h3 style="color: #1a1a1a; margin-top: 28px;">Your Commission Details</h3>
              <p style="color: #555; line-height: 1.6;">You'll earn <strong>20% of every referred artist's monthly subscription</strong> for 8 months per referral:</p>
              <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
                <tr style="border-bottom: 1px solid #eee;">
                  <td style="padding: 8px 0; color: #555;">Starter ($99/mo)</td>
                  <td style="padding: 8px 0; text-align: right; color: #B1275E; font-weight: 600;">$19.80/mo</td>
                </tr>
                <tr style="border-bottom: 1px solid #eee;">
                  <td style="padding: 8px 0; color: #555;">Pro ($169/mo)</td>
                  <td style="padding: 8px 0; text-align: right; color: #B1275E; font-weight: 600;">$33.80/mo</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #555;">Business ($279/mo)</td>
                  <td style="padding: 8px 0; text-align: right; color: #B1275E; font-weight: 600;">$55.80/mo</td>
                </tr>
              </table>
              <p style="color: #555; line-height: 1.6; font-size: 14px;">Commissions are calculated monthly and paid out via direct deposit. Each referral earns commission for 8 months from their subscription start date.</p>
              <p style="color: #999; margin-top: 32px;">— The Sunstone Team</p>
            </div>
          `,
        });
      } catch (emailErr) {
        console.warn('[Admin Approve] Email send failed:', emailErr);
      }
    }

    return NextResponse.json({ ambassador });
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[Admin Approve] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
