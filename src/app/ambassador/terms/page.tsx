// ============================================================================
// Ambassador Terms of Service — src/app/ambassador/terms/page.tsx
// ============================================================================
// Public legal page. Linked from the ambassador application form.
// ============================================================================

import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';

export const metadata: Metadata = {
  title: 'Ambassador Terms of Service — Sunstone Studio',
  description: 'Terms governing participation in the Sunstone Studio Ambassador Program.',
};

export default function AmbassadorTermsPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#fafaf9' }}>
      {/* Header */}
      <header style={{ padding: '20px 24px', borderBottom: '1px solid #e7e5e4', background: '#fff' }}>
        <div style={{ maxWidth: 800, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: '#1c1917' }}>
            <Image src="/landing/sunstone-logo.webp" alt="Sunstone Studio" width={32} height={32} style={{ borderRadius: 6 }} />
            <span style={{ fontFamily: "'Playfair Display', serif", fontWeight: 600, fontSize: 16 }}>Sunstone Studio</span>
          </Link>
          <div style={{ display: 'flex', gap: 16 }}>
            <Link href="/ambassador" style={{ fontSize: 14, color: '#78716c', textDecoration: 'none' }}>Apply</Link>
            <Link href="/terms" style={{ fontSize: 14, color: '#78716c', textDecoration: 'none' }}>Terms</Link>
            <Link href="/auth/login" style={{ fontSize: 14, color: '#78716c', textDecoration: 'none' }}>Log In</Link>
          </div>
        </div>
      </header>

      {/* Content */}
      <main style={{ maxWidth: 800, margin: '0 auto', padding: '48px 24px 80px' }}>
        <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 36, fontWeight: 700, color: '#1c1917', marginBottom: 8 }}>
          Ambassador Program Terms of Service
        </h1>
        <p style={{ fontSize: 14, color: '#a8a29e', marginBottom: 40 }}>Last updated: April 2026</p>

        <div style={{ fontSize: 15.5, lineHeight: 1.75, color: '#44403c' }}>

          {/* 1. Program Overview */}
          <Section title="1. Program Overview">
            <p>
              The Sunstone Ambassador Program (&ldquo;the Program&rdquo;) allows approved participants
              (&ldquo;Ambassadors&rdquo;) to earn recurring commission by referring new permanent jewelry
              artists to Sunstone Studio (&ldquo;the Platform&rdquo;), operated by Sunstone Permanent Jewelry
              (&ldquo;Sunstone,&rdquo; &ldquo;we,&rdquo; &ldquo;us&rdquo;).
            </p>
            <p>
              Participation in the Program is voluntary and subject to these Terms of Service. By enrolling
              in or applying to the Program, you agree to be bound by these terms.
            </p>
            <p>
              The Program is a single-level referral program. There are no downlines, tiers, or multi-level
              structures. Ambassadors earn commission only on their own direct referrals.
            </p>
          </Section>

          {/* 2. Eligibility */}
          <Section title="2. Eligibility">
            <ul>
              <li>You must be at least 18 years old and a legal resident of the United States.</li>
              <li>
                <strong>Artist Ambassadors</strong> must maintain an active paid Sunstone Studio subscription
                (Starter, Pro, or Business plan) for the duration of their participation.
              </li>
              <li>
                <strong>External Ambassadors</strong> (influencers, educators, community leaders) must submit
                an application and be approved by Sunstone before receiving a referral link.
              </li>
              <li>
                Sunstone reserves the right to accept, reject, or revoke any application or ambassador
                status at its sole discretion.
              </li>
            </ul>
          </Section>

          {/* 3. Commission Structure */}
          <Section title="3. Commission Structure">
            <ul>
              <li>
                Ambassadors earn <strong>20% of each referred artist&apos;s monthly subscription billing</strong> for
                a period of <strong>8 months</strong> from the referred artist&apos;s first paid invoice.
              </li>
              <li>
                Commission applies to base subscription fees and CRM add-on fees billed through
                the Platform.
              </li>
              <li>
                Commission does <strong>not</strong> apply to hardware purchases, one-time setup fees,
                physical product orders, supply reorders, or any charges processed outside
                the Platform&apos;s subscription billing system.
              </li>
              <li>
                Commission rates and duration are subject to change. Active ambassadors will be
                notified of any changes to the commission structure.
              </li>
            </ul>
          </Section>

          {/* 4. Payouts */}
          <Section title="4. Payouts">
            <ul>
              <li>
                Commission payouts are processed monthly, on or around the 15th of each month,
                for commissions earned during the prior billing cycle.
              </li>
              <li>
                The minimum payout threshold is <strong>$25.00</strong>. Commission balances below this
                amount will roll over to the following month until the threshold is met.
              </li>
              <li>
                Payouts are delivered via Stripe Connect to the bank account linked during
                onboarding. Ambassadors must complete Stripe Connect setup to receive payouts.
              </li>
              <li>
                Ambassadors are solely responsible for reporting commission income to applicable
                tax authorities. Sunstone does not withhold taxes on commission payments.
              </li>
              <li>
                For US-based ambassadors earning $600 or more in a calendar year, Stripe will
                issue a 1099-K or 1099-MISC form as required by the IRS.
              </li>
            </ul>
          </Section>

          {/* 5. Referral Attribution */}
          <Section title="5. Referral Attribution">
            <ul>
              <li>
                Attribution is tracked via unique referral links and referral codes assigned
                to each ambassador.
              </li>
              <li>
                Link-based attribution uses a <strong>30-day cookie window</strong>. If a referred
                artist clicks your link and signs up within 30 days, the referral is attributed
                to you.
              </li>
              <li>
                <strong>First-touch attribution</strong>: If multiple ambassadors refer the same
                artist, the first referral link or code used receives credit.
              </li>
              <li>
                <strong>Self-referrals are strictly prohibited</strong> and will result in immediate
                termination from the Program. This includes referring your own accounts, businesses
                you own or control, or accounts created for the purpose of generating commission.
              </li>
            </ul>
          </Section>

          {/* 6. Promotional Guidelines */}
          <Section title="6. Promotional Guidelines">
            <ul>
              <li>
                Ambassadors must accurately represent Sunstone Studio and its features. Do not
                make claims about features that do not exist or exaggerate the Platform&apos;s
                capabilities.
              </li>
              <li>
                <strong>No false claims, fake reviews, or misleading marketing.</strong> All
                testimonials and endorsements must reflect your genuine experience.
              </li>
              <li>
                <strong>FTC Disclosure Requirement:</strong> Ambassadors must disclose their
                financial relationship with Sunstone in any promotional content, per Federal Trade
                Commission guidelines. Use clear disclosures such as &ldquo;#ad,&rdquo;
                &ldquo;#sponsored,&rdquo; &ldquo;#partner,&rdquo; or &ldquo;I earn a commission
                for referrals&rdquo; in social media posts, videos, blog posts, and other content.
              </li>
              <li>
                <strong>No paid keyword bidding</strong> on &ldquo;Sunstone,&rdquo; &ldquo;Sunstone
                Studio,&rdquo; &ldquo;Sunstone Permanent Jewelry,&rdquo; or any related branded terms
                in paid advertising platforms (Google Ads, Meta Ads, TikTok Ads, etc.).
              </li>
              <li>
                Ambassadors may not send unsolicited bulk email, bulk SMS, or spam of any kind
                to promote their referral link.
              </li>
            </ul>
          </Section>

          {/* 7. Termination */}
          <Section title="7. Termination">
            <ul>
              <li>
                Sunstone may suspend or terminate any ambassador&apos;s participation at any time,
                with or without cause, at its sole discretion.
              </li>
              <li>
                Grounds for termination include, but are not limited to: self-referral, fraud,
                misleading promotional activities, violation of these terms, brand damage, or
                abuse of the referral system.
              </li>
              <li>
                Upon termination for fraud or abuse, all pending and unpaid commissions may
                be forfeited.
              </li>
              <li>
                Ambassadors may voluntarily withdraw from the Program at any time by
                contacting Sunstone.
              </li>
              <li>
                Upon termination or withdrawal, referral links are deactivated. However,
                existing commission windows for previously converted referrals will continue
                to their natural expiration date.
              </li>
            </ul>
          </Section>

          {/* 8. Modifications */}
          <Section title="8. Modifications to the Program">
            <ul>
              <li>
                Sunstone reserves the right to modify these terms, commission rates, payout
                schedules, or the overall structure of the Program at any time.
              </li>
              <li>
                Active ambassadors will be notified of material changes via email to the
                address on file.
              </li>
              <li>
                Continued participation in the Program after notification of changes constitutes
                acceptance of the updated terms.
              </li>
            </ul>
          </Section>

          {/* 9. Limitation of Liability */}
          <Section title="9. Limitation of Liability">
            <p>
              The Program is provided &ldquo;as is&rdquo; without warranty of any kind, express or
              implied. Sunstone is not liable for:
            </p>
            <ul>
              <li>Technical issues, platform downtime, or service interruptions that may affect referral tracking or commission calculations.</li>
              <li>Delays in payout processing due to Stripe, banking systems, or other third-party service providers.</li>
              <li>Changes in referred artists&apos; subscription status, including downgrades, cancellations, or payment failures.</li>
              <li>Tax obligations arising from commission income.</li>
            </ul>
            <p>
              In no event shall Sunstone&apos;s total liability to any ambassador exceed the total
              commissions actually paid to that ambassador in the 12 months preceding the claim.
            </p>
          </Section>

          {/* Contact */}
          <Section title="10. Contact">
            <p>
              Questions about the Ambassador Program or these terms may be directed to:
            </p>
            <p>
              <strong>Sunstone Permanent Jewelry</strong><br />
              588 S 2000 W, Ste 400, Springville, UT 84663<br />
              Email: support@sunstonepj.app
            </p>
          </Section>

        </div>
      </main>

      {/* Footer */}
      <footer style={{ borderTop: '1px solid #e7e5e4', padding: '24px', textAlign: 'center' }}>
        <p style={{ fontSize: 13, color: '#a8a29e' }}>
          &copy; {new Date().getFullYear()} Sunstone Studio &middot;{' '}
          <Link href="/privacy" style={{ color: '#a8a29e', textDecoration: 'underline' }}>Privacy Policy</Link>
          {' '}&middot;{' '}
          <Link href="/terms" style={{ color: '#a8a29e', textDecoration: 'underline' }}>Terms of Service</Link>
          {' '}&middot;{' '}
          <Link href="/" style={{ color: '#a8a29e', textDecoration: 'underline' }}>Home</Link>
        </p>
      </footer>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 32 }}>
      <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, fontWeight: 600, color: '#1c1917', marginBottom: 12 }}>
        {title}
      </h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{children}</div>
    </section>
  );
}
