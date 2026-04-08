// ============================================================================
// Trial Expiration Email Templates — src/lib/emails/trial-emails.ts
// ============================================================================
// Three-stage email sequence for trial expiration: 7-day, 1-day, expired.
// Uses Resend with dynamic import (same pattern as ambassador-emails.ts).
// ============================================================================

const FROM = () => `Sunstone Studio <${process.env.RESEND_FROM_EMAIL || 'noreply@sunstonepj.app'}>`;
const CTA_URL = 'https://sunstonepj.app/dashboard/settings?tab=subscription';

export interface TrialEmailParams {
  businessName: string;
  ownerEmail: string;
  ownerFirstName: string | null;
  daysRemaining: number; // 7, 1, or 0 (expired)
  trialEndsAt: Date;
}

// ── Shared layout wrapper ───────────────────────────────────────────────────

function emailLayout(content: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sunstone Studio</title>
</head>
<body style="margin: 0; padding: 0; background-color: #FBEEEE; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #FBEEEE;">
    <tr>
      <td align="center" style="padding: 40px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 520px; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="padding: 32px 32px 0; text-align: center;">
              <h1 style="margin: 0; font-size: 24px; font-weight: 700; color: #852454; letter-spacing: -0.5px;">Sunstone Studio</h1>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding: 24px 32px 32px;">
              ${content}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 20px 32px; border-top: 1px solid #F3E8EE; text-align: center;">
              <p style="margin: 0; color: #999; font-size: 12px; line-height: 1.5;">
                Sunstone Studio &mdash; Built for permanent jewelry artists<br>
                You're receiving this because you signed up for a free trial.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function ctaButton(label: string, color: string = '#852454'): string {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center" style="padding: 24px 0 8px;">
          <a href="${CTA_URL}" style="display: inline-block; background: ${color}; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; padding: 14px 32px; border-radius: 10px; letter-spacing: 0.2px;">${label}</a>
        </td>
      </tr>
    </table>`;
}

// ── Email 1: 7 Days Remaining ───────────────────────────────────────────────

export function trialEmail7Day(params: TrialEmailParams): { subject: string; html: string } {
  const firstName = params.ownerFirstName || 'there';
  const endDate = params.trialEndsAt.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  return {
    subject: 'Your Sunstone Studio trial ends in 7 days',
    html: emailLayout(`
      <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 0 0 16px;">Hi ${firstName},</p>
      <p style="color: #555; font-size: 15px; line-height: 1.6; margin: 0 0 16px;">
        Your free Pro trial for <strong>${params.businessName}</strong> wraps up on <strong>${endDate}</strong>.
        We hope you've had a chance to explore your POS, manage your client list, and start tracking your inventory.
      </p>
      <p style="color: #555; font-size: 15px; line-height: 1.6; margin: 0 0 16px;">
        When you subscribe, everything you've built stays exactly where it is &mdash; your clients, sales history, events, and settings all carry over seamlessly.
      </p>
      <div style="background: #FDF8FA; border-radius: 10px; padding: 16px 20px; margin: 20px 0;">
        <p style="color: #852454; font-size: 14px; font-weight: 600; margin: 0 0 8px;">Plans start at just $99/month:</p>
        <p style="color: #666; font-size: 13px; line-height: 1.6; margin: 0;">
          <strong>Starter</strong> $99/mo &bull; <strong>Pro</strong> $169/mo &bull; <strong>Business</strong> $279/mo
        </p>
      </div>
      ${ctaButton('Choose Your Plan')}
      <p style="color: #999; font-size: 13px; text-align: center; margin: 16px 0 0;">
        Questions? Just reply to this email &mdash; we're here to help.
      </p>
    `),
  };
}

// ── Email 2: 1 Day Remaining ────────────────────────────────────────────────

export function trialEmail1Day(params: TrialEmailParams): { subject: string; html: string } {
  const firstName = params.ownerFirstName || 'there';

  return {
    subject: 'Last day of your Sunstone Studio trial',
    html: emailLayout(`
      <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 0 0 16px;">Hi ${firstName},</p>
      <p style="color: #555; font-size: 15px; line-height: 1.6; margin: 0 0 16px;">
        Your free trial for <strong>${params.businessName}</strong> ends tomorrow. After that, your POS, reports, and CRM tools will be paused until you choose a plan.
      </p>
      <div style="background: #FEF3F2; border-left: 4px solid #B1275E; border-radius: 0 10px 10px 0; padding: 16px 20px; margin: 20px 0;">
        <p style="color: #852454; font-size: 14px; font-weight: 600; margin: 0 0 4px;">Your data is 100% safe.</p>
        <p style="color: #666; font-size: 13px; line-height: 1.5; margin: 0;">
          Nothing gets deleted. Your clients, inventory, sales &mdash; everything is waiting for you.
        </p>
      </div>
      <p style="color: #555; font-size: 15px; line-height: 1.6; margin: 0 0 16px;">
        One tap and you're back in business &mdash; no setup, no starting over.
      </p>
      ${ctaButton('Keep My Studio Running', '#B1275E')}
    `),
  };
}

// ── Email 3: Trial Expired ──────────────────────────────────────────────────

export function trialEmailExpired(params: TrialEmailParams): { subject: string; html: string } {
  const firstName = params.ownerFirstName || 'there';

  return {
    subject: 'Your Sunstone Studio trial has ended — your data is safe',
    html: emailLayout(`
      <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 0 0 16px;">Hi ${firstName},</p>
      <p style="color: #555; font-size: 15px; line-height: 1.6; margin: 0 0 16px;">
        Your free trial for <strong>${params.businessName}</strong> has ended. But don't worry &mdash; nothing is lost.
      </p>
      <div style="background: #F0FDF4; border-radius: 10px; padding: 16px 20px; margin: 20px 0;">
        <p style="color: #15803D; font-size: 14px; font-weight: 600; margin: 0 0 8px;">Everything is exactly how you left it:</p>
        <p style="color: #666; font-size: 13px; line-height: 1.8; margin: 0;">
          &#10003; Your clients and contact info<br>
          &#10003; Inventory and pricing<br>
          &#10003; Sales history and reports<br>
          &#10003; Events and waiver data
        </p>
      </div>
      <p style="color: #555; font-size: 15px; line-height: 1.6; margin: 0 0 16px;">
        Whenever you're ready, you can pick up right where you left off. Your studio is waiting for you.
      </p>
      ${ctaButton('Reactivate My Studio', '#852454')}
      <p style="color: #999; font-size: 13px; text-align: center; margin: 16px 0 0;">
        No pressure, no rush. We'll keep your data safe.
      </p>
    `),
  };
}

// ── Send helper (shared by cron route) ──────────────────────────────────────

export async function sendTrialEmail(
  params: TrialEmailParams,
  type: '7day' | '1day' | 'expired'
): Promise<void> {
  if (!process.env.RESEND_API_KEY) return;

  const emailFn = type === '7day' ? trialEmail7Day
    : type === '1day' ? trialEmail1Day
    : trialEmailExpired;

  const { subject, html } = emailFn(params);

  const { Resend } = await import('resend');
  const resend = new Resend(process.env.RESEND_API_KEY);

  await resend.emails.send({
    from: FROM(),
    to: params.ownerEmail,
    subject,
    html,
  });
}
