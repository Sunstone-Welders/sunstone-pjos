// ============================================================================
// Onboarding Drip Email Templates - src/lib/emails/onboarding-emails.ts
// ============================================================================
// Eight behavior-triggered emails for days 0–15 of the trial onboarding
// journey. Uses the same brand styling as trial-emails.ts.
// ============================================================================

const FROM = () => `Sunstone Studio <${process.env.RESEND_FROM_EMAIL || 'noreply@sunstonepj.app'}>`;

export interface OnboardingEmailParams {
  businessName: string;
  ownerEmail: string;
  ownerFirstName: string | null;
  tenantCreatedAt: Date;
}

export type OnboardingEmailType =
  | 'welcome'
  | 'inventory_nudge'
  | 'first_sale_nudge'
  | 'week1_active'
  | 'week1_inactive'
  | 'stripe_nudge'
  | 'week2_active'
  | 'week2_inactive';

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
                Sunstone Studio | You're receiving this because you signed up<br>for a free trial at sunstonepj.app
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

function ctaButton(label: string, url: string, color: string = '#852454'): string {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center" style="padding: 24px 0 8px;">
          <a href="${url}" style="display: inline-block; background: ${color}; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; padding: 14px 32px; border-radius: 10px; letter-spacing: 0.2px;">${label}</a>
        </td>
      </tr>
    </table>`;
}

// ── Email 1: Welcome (Day 0) ────────────────────────────────────────────────

export function onboardingWelcome(params: OnboardingEmailParams): { subject: string; html: string } {
  const firstName = params.ownerFirstName || 'there';

  return {
    subject: "Welcome to Sunstone Studio - let's set up your business",
    html: emailLayout(`
      <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 0 0 16px;">Hi ${firstName},</p>
      <p style="color: #555; font-size: 15px; line-height: 1.6; margin: 0 0 16px;">
        Welcome to Sunstone Studio! We're so glad you're here. Sunstone Studio is your all-in-one business platform for permanent jewelry - POS, inventory, clients, events, and more, all in one place.
      </p>
      <p style="color: #555; font-size: 15px; line-height: 1.6; margin: 0 0 16px;">
        Your first step? <strong>Add your first chain to inventory.</strong> Once your chains are in, everything else clicks into place - your POS auto-populates, prices are set, and you're ready to sell.
      </p>
      <p style="color: #555; font-size: 15px; line-height: 1.6; margin: 0 0 16px;">
        And if you ever have a question, just tap the <strong>Ask Sunny</strong> button - she knows permanent jewelry inside and out.
      </p>
      ${ctaButton('Set Up My Studio', 'https://sunstonepj.app/dashboard/inventory')}
      <p style="color: #999; font-size: 13px; text-align: center; margin: 16px 0 0;">
        Welcome aboard - The Sunstone Team
      </p>
    `),
  };
}

// ── Email 2: Inventory Nudge (Day 2-3) ──────────────────────────────────────

export function onboardingInventoryNudge(params: OnboardingEmailParams): { subject: string; html: string } {
  const firstName = params.ownerFirstName || 'there';

  return {
    subject: "Quick tip: add your chains and we'll handle the rest",
    html: emailLayout(`
      <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 0 0 16px;">Hi ${firstName},</p>
      <p style="color: #555; font-size: 15px; line-height: 1.6; margin: 0 0 16px;">
        Just a quick tip - once you add your chains to inventory, everything clicks into place. Your POS auto-populates with your products, prices are set, and your reports start tracking costs automatically.
      </p>
      <p style="color: #555; font-size: 15px; line-height: 1.6; margin: 0 0 16px;">
        It takes about 2 minutes. If you purchased a Sunstone starter kit, you can browse the Sunstone catalog right inside the app to add your chains even faster.
      </p>
      ${ctaButton('Add My Inventory', 'https://sunstonepj.app/dashboard/inventory')}
      <p style="color: #999; font-size: 13px; text-align: center; margin: 16px 0 0;">
        Need help? Just reply to this email - we're here for you.
      </p>
    `),
  };
}

// ── Email 3: First Sale Nudge (Day 4-5) ─────────────────────────────────────

export function onboardingFirstSaleNudge(params: OnboardingEmailParams): { subject: string; html: string } {
  const firstName = params.ownerFirstName || 'there';

  return {
    subject: 'Your POS is ready - try a test sale',
    html: emailLayout(`
      <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 0 0 16px;">Hi ${firstName},</p>
      <p style="color: #555; font-size: 15px; line-height: 1.6; margin: 0 0 16px;">
        Your inventory is looking great! Now that your chains are set up, your POS is ready to go.
      </p>
      <p style="color: #555; font-size: 15px; line-height: 1.6; margin: 0 0 16px;">
        Try running a quick test sale - even to yourself. It takes about 30 seconds:
      </p>
      <div style="background: #FDF8FA; border-radius: 10px; padding: 16px 20px; margin: 20px 0;">
        <p style="color: #852454; font-size: 14px; line-height: 1.8; margin: 0;">
          1. Tap <strong>POS</strong> &rarr; Store Mode<br>
          2. Pick a chain<br>
          3. Record an external payment to complete<br>
          <span style="color: #999; font-size: 12px;">You can void it after - this is just to build confidence.</span>
        </p>
      </div>
      ${ctaButton('Try My First Sale', 'https://sunstonepj.app/dashboard/pos')}
    `),
  };
}

// ── Email 4: Week 1 Active (Day 6-8) ────────────────────────────────────────

export function onboardingWeek1Active(params: OnboardingEmailParams): { subject: string; html: string } {
  const firstName = params.ownerFirstName || 'there';

  return {
    subject: "You're setting up like a pro - here's what to try next",
    html: emailLayout(`
      <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 0 0 16px;">Hi ${firstName},</p>
      <p style="color: #555; font-size: 15px; line-height: 1.6; margin: 0 0 16px;">
        You're crushing it! Your studio is really taking shape.
      </p>
      <p style="color: #555; font-size: 15px; line-height: 1.6; margin: 0 0 8px;">
        Here are a few features you might not have explored yet:
      </p>
      <div style="background: #FDF8FA; border-radius: 10px; padding: 16px 20px; margin: 16px 0;">
        <p style="color: #555; font-size: 14px; line-height: 1.8; margin: 0;">
          <strong style="color: #852454;">Ask Sunny</strong> - Your AI mentor knows weld settings, troubleshooting, pricing, and more<br>
          <strong style="color: #852454;">Client Management</strong> - Track your regulars, their purchase history, and birthdays<br>
          <strong style="color: #852454;">Event Mode</strong> - QR check-in, queue management, and waivers for pop-ups
        </p>
      </div>
      ${ctaButton('Explore More Features', 'https://sunstonepj.app/dashboard')}
    `),
  };
}

// ── Email 5: Week 1 Inactive (Day 6-8) ──────────────────────────────────────

export function onboardingWeek1Inactive(params: OnboardingEmailParams): { subject: string; html: string } {
  const firstName = params.ownerFirstName || 'there';

  return {
    subject: 'Your studio is ready when you are',
    html: emailLayout(`
      <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 0 0 16px;">Hi ${firstName},</p>
      <p style="color: #555; font-size: 15px; line-height: 1.6; margin: 0 0 16px;">
        Life gets busy - we totally get it. Just wanted you to know your Sunstone Studio is all set up and waiting for you.
      </p>
      <p style="color: #555; font-size: 15px; line-height: 1.6; margin: 0 0 16px;">
        When you're ready, it takes about 2 minutes to add your first chain and start selling. And if you ever have a question about welding, pricing, or running your business - just ask Sunny. She knows permanent jewelry inside and out.
      </p>
      ${ctaButton('Open My Studio', 'https://sunstonepj.app/dashboard')}
      <p style="color: #999; font-size: 13px; text-align: center; margin: 16px 0 0;">
        No pressure - your studio isn't going anywhere.
      </p>
    `),
  };
}

// ── Email 6: Stripe Nudge (Day 9-11) ────────────────────────────────────────

export function onboardingStripeNudge(params: OnboardingEmailParams): { subject: string; html: string } {
  const firstName = params.ownerFirstName || 'there';

  return {
    subject: 'Start getting paid - connect your payment account',
    html: emailLayout(`
      <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 0 0 16px;">Hi ${firstName},</p>
      <p style="color: #555; font-size: 15px; line-height: 1.6; margin: 0 0 16px;">
        You've been making sales - that's awesome! To start accepting card payments from customers through the app, connect your Stripe account. It takes about 5 minutes.
      </p>
      <div style="background: #FDF8FA; border-radius: 10px; padding: 16px 20px; margin: 20px 0;">
        <p style="color: #555; font-size: 14px; line-height: 1.8; margin: 0;">
          &#10003; No monthly fees from Stripe<br>
          &#10003; Payments go directly to your bank account<br>
          &#10003; Works with QR code and text-to-pay checkout
        </p>
      </div>
      ${ctaButton('Connect Stripe', 'https://sunstonepj.app/dashboard/settings?tab=payments', '#B1275E')}
    `),
  };
}

// ── Email 7: Week 2 Active (Day 13-15) ──────────────────────────────────────

export function onboardingWeek2Active(params: OnboardingEmailParams): { subject: string; html: string } {
  const firstName = params.ownerFirstName || 'there';

  return {
    subject: "Two weeks in - here's what artists like you do next",
    html: emailLayout(`
      <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 0 0 16px;">Hi ${firstName},</p>
      <p style="color: #555; font-size: 15px; line-height: 1.6; margin: 0 0 16px;">
        Two weeks in and you're in the groove! Here's what other artists are doing at this stage:
      </p>
      <div style="background: #FDF8FA; border-radius: 10px; padding: 16px 20px; margin: 20px 0;">
        <p style="color: #555; font-size: 14px; line-height: 1.8; margin: 0;">
          <strong style="color: #852454;">Book an event</strong> - Pop-ups, markets, and private parties with QR check-in<br>
          <strong style="color: #852454;">Set up your storefront</strong> - A free public page where clients can book you<br>
          <strong style="color: #852454;">Invite a team member</strong> - Add staff for busy events
        </p>
      </div>
      <p style="color: #555; font-size: 15px; line-height: 1.6; margin: 0 0 16px;">
        Your Pro trial includes everything - now's the time to explore and make it yours.
      </p>
      ${ctaButton('Keep Building', 'https://sunstonepj.app/dashboard')}
    `),
  };
}

// ── Email 8: Week 2 Inactive (Day 13-15) ────────────────────────────────────

export function onboardingWeek2Inactive(params: OnboardingEmailParams): { subject: string; html: string } {
  const firstName = params.ownerFirstName || 'there';

  return {
    subject: 'We built Sunstone Studio for artists like you',
    html: emailLayout(`
      <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 0 0 16px;">Hi ${firstName},</p>
      <p style="color: #555; font-size: 15px; line-height: 1.6; margin: 0 0 16px;">
        Sunstone has been in the permanent jewelry world for over 20 years. We built Studio because we saw artists juggling Square, spreadsheets, text messages, and a dozen other tools just to run their business.
      </p>
      <p style="color: #555; font-size: 15px; line-height: 1.6; margin: 0 0 16px;">
        Sunstone Studio puts it all in one place - POS, inventory, clients, events, waivers, messaging, and an AI mentor who actually knows permanent jewelry. Built by artists, for artists.
      </p>
      <p style="color: #555; font-size: 15px; line-height: 1.6; margin: 0 0 16px;">
        We'd love for you to come back and see what's possible.
      </p>
      ${ctaButton('See What\u2019s Possible', 'https://sunstonepj.app/dashboard')}
      <p style="color: #999; font-size: 13px; text-align: center; margin: 16px 0 0;">
        We're here whenever you're ready.
      </p>
    `),
  };
}

// ── Send helper (shared by cron route + signup) ─────────────────────────────

const EMAIL_FNS: Record<OnboardingEmailType, (params: OnboardingEmailParams) => { subject: string; html: string }> = {
  welcome: onboardingWelcome,
  inventory_nudge: onboardingInventoryNudge,
  first_sale_nudge: onboardingFirstSaleNudge,
  week1_active: onboardingWeek1Active,
  week1_inactive: onboardingWeek1Inactive,
  stripe_nudge: onboardingStripeNudge,
  week2_active: onboardingWeek2Active,
  week2_inactive: onboardingWeek2Inactive,
};

export async function sendOnboardingEmail(
  params: OnboardingEmailParams,
  type: OnboardingEmailType
): Promise<void> {
  if (!process.env.RESEND_API_KEY) return;

  const emailFn = EMAIL_FNS[type];
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
