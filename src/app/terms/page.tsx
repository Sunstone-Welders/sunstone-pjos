// ============================================================================
// Terms of Service — src/app/terms/page.tsx
// ============================================================================
// Public page. Includes SMS messaging terms for A2P 10DLC compliance.
// ============================================================================

import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';

export const metadata: Metadata = {
  title: 'Terms of Service — Sunstone Studio',
  description: 'Terms governing your use of the Sunstone Studio platform, including SMS messaging terms.',
};

export default function TermsOfServicePage() {
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
            <Link href="/privacy" style={{ fontSize: 14, color: '#78716c', textDecoration: 'none' }}>Privacy</Link>
            <Link href="/auth/login" style={{ fontSize: 14, color: '#78716c', textDecoration: 'none' }}>Log In</Link>
          </div>
        </div>
      </header>

      {/* Content */}
      <main style={{ maxWidth: 800, margin: '0 auto', padding: '48px 24px 80px' }}>
        <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 36, fontWeight: 700, color: '#1c1917', marginBottom: 8 }}>
          Terms of Service
        </h1>
        <p style={{ fontSize: 14, color: '#a8a29e', marginBottom: 40 }}>Last updated: March 2026</p>

        <div style={{ fontSize: 15.5, lineHeight: 1.75, color: '#44403c' }}>

          {/* 1. Service Description */}
          <Section title="1. Service Description">
            <p>
              Sunstone Studio (&ldquo;we,&rdquo; &ldquo;us,&rdquo; &ldquo;our&rdquo;) provides a cloud-based business
              management platform at sunstonepj.app designed for permanent jewelry service providers. Our services include
              point-of-sale (POS), inventory management, event management, client management, customer relationship
              management (CRM), communication tools, queue management, digital waivers, and AI-powered business assistance.
            </p>
            <p>
              By creating an account or using our platform, you agree to these Terms of Service. If you do not agree,
              do not use the platform.
            </p>
          </Section>

          {/* 2. Account Terms */}
          <Section title="2. Account Terms">
            <ul>
              <li>You must be at least 18 years old to create an account.</li>
              <li>You are responsible for maintaining the security of your account credentials.</li>
              <li>You are responsible for all activity that occurs under your account.</li>
              <li>You must provide accurate and complete registration information.</li>
              <li>One person or business may not maintain more than one free trial.</li>
            </ul>
          </Section>

          {/* 3. SMS/Text Messaging Terms */}
          <Section title="3. SMS/Text Messaging Terms">
            <p>
              Sunstone Studio facilitates SMS/text message communications between service providers and their customers.
              The following terms apply:
            </p>

            <p><strong>For end consumers (customers):</strong></p>
            <ul>
              <li>
                By providing your phone number and checking the SMS consent checkbox on a digital waiver or check-in form,
                you agree to receive text messages from the service provider using Sunstone Studio.
              </li>
              <li>
                <strong>Message types:</strong> Queue position updates, service-ready notifications, digital receipts,
                aftercare instructions, appointment reminders, and follow-up communications.
              </li>
              <li>
                <strong>Message frequency:</strong> Varies by interaction. Transactional messages are typically 1&ndash;5
                messages per service visit. Follow-up messages may be sent at the service provider&rsquo;s discretion.
              </li>
              <li>
                <strong>Message and data rates may apply</strong> depending on your mobile carrier and plan.
              </li>
              <li>
                You may <strong>opt out</strong> at any time by replying <strong>STOP</strong> to any message. You will
                receive a confirmation and no further messages will be sent.
              </li>
              <li>
                For <strong>help</strong>, reply <strong>HELP</strong> to any message or contact{' '}
                <a href="mailto:support@sunstonepj.app" style={{ color: '#c2185b' }}>support@sunstonepj.app</a>.
              </li>
              <li>
                <strong>SMS consent is not a condition</strong> of purchasing any goods or services. You may decline SMS
                consent and still receive services.
              </li>
              <li>
                Carriers are not liable for delayed or undelivered messages.
              </li>
            </ul>

            <p><strong>For service providers (account holders):</strong></p>
            <ul>
              <li>
                You are responsible for ensuring you have proper consent before sending messages to your customers through
                our platform.
              </li>
              <li>
                You agree not to use our messaging features for spam, unsolicited messages, or any purpose that violates
                applicable laws or regulations, including the Telephone Consumer Protection Act (TCPA) and CAN-SPAM Act.
              </li>
              <li>
                You agree to honor opt-out requests promptly and maintain accurate consent records.
              </li>
            </ul>
          </Section>

          {/* 4. Subscription Terms */}
          <Section title="4. Subscription Terms">
            <ul>
              <li>
                <strong>Free trial:</strong> New accounts receive a 30-day free trial with access to all Pro-level features,
                including CRM. No credit card is required to start a trial.
              </li>
              <li>
                <strong>Billing:</strong> Subscriptions are billed monthly. If you select a plan during your trial,
                billing begins when your trial ends. You may cancel at any time.
              </li>
              <li>
                <strong>Plans:</strong> Starter ($99/month), Pro ($169/month), and Business ($279/month). CRM is an optional
                add-on at $69/month, available with any base plan. Pricing is as displayed at the time of purchase.
              </li>
              <li>
                <strong>Cancellation:</strong> You may cancel your subscription at any time. Cancellation takes effect at
                the end of the current billing period. No refunds are provided for partial billing periods.
              </li>
              <li>
                <strong>Data retention:</strong> Upon cancellation or trial expiration, your data is retained and accessible
                in read-only mode. You may reactivate your account at any time to regain full access.
              </li>
            </ul>
          </Section>

          {/* 5. Payment Processing */}
          <Section title="5. Payment Processing">
            <p>
              Payments for subscriptions and point-of-sale transactions are processed by Stripe, Inc. By using our payment
              features, you also agree to{' '}
              <a href="https://stripe.com/legal" target="_blank" rel="noopener noreferrer" style={{ color: '#c2185b' }}>
                Stripe&rsquo;s Terms of Service
              </a>.
            </p>
            <p>
              A platform fee is deducted from service provider payouts based on their subscription tier
              (Starter: 3%, Pro: 1.5%, Business: 0%). Customers are not charged any additional processing fees.
            </p>
          </Section>

          {/* 6. Acceptable Use */}
          <Section title="6. Acceptable Use">
            <p>You agree not to:</p>
            <ul>
              <li>Use the platform for any unlawful purpose or in violation of any applicable laws</li>
              <li>Send spam, unsolicited messages, or bulk messages that violate anti-spam regulations</li>
              <li>Abuse the messaging system to harass, threaten, or defraud any person</li>
              <li>Attempt to gain unauthorized access to other users&rsquo; accounts or data</li>
              <li>Interfere with or disrupt the platform&rsquo;s infrastructure or services</li>
              <li>Use the platform to transmit malware, viruses, or harmful code</li>
              <li>Resell, sublicense, or redistribute access to the platform without our written consent</li>
            </ul>
            <p>
              We reserve the right to suspend or terminate accounts that violate these terms.
            </p>
          </Section>

          {/* 7. Intellectual Property */}
          <Section title="7. Intellectual Property">
            <p>
              The Sunstone Studio platform, including its design, features, code, and content, is owned by Sunstone
              Welders and protected by intellectual property laws. You retain ownership of the data you upload to the
              platform (inventory, client information, etc.).
            </p>
          </Section>

          {/* 8. Limitation of Liability */}
          <Section title="8. Limitation of Liability">
            <p>
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, SUNSTONE STUDIO AND ITS AFFILIATES SHALL NOT BE LIABLE FOR ANY
              INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS OR REVENUES,
              WHETHER INCURRED DIRECTLY OR INDIRECTLY, OR ANY LOSS OF DATA, USE, GOODWILL, OR OTHER INTANGIBLE LOSSES.
            </p>
            <p>
              OUR TOTAL LIABILITY FOR ANY CLAIMS ARISING FROM OR RELATING TO THESE TERMS OR YOUR USE OF THE PLATFORM
              SHALL NOT EXCEED THE AMOUNT YOU PAID US IN THE TWELVE (12) MONTHS PRECEDING THE CLAIM.
            </p>
            <p>
              THE PLATFORM IS PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE&rdquo; WITHOUT WARRANTIES OF ANY
              KIND, EITHER EXPRESS OR IMPLIED.
            </p>
          </Section>

          {/* 9. Indemnification */}
          <Section title="9. Indemnification">
            <p>
              You agree to indemnify, defend, and hold harmless Sunstone Studio and its officers, directors, employees,
              and affiliates from any claims, damages, losses, or expenses (including reasonable attorney&rsquo;s fees)
              arising from your use of the platform, violation of these terms, or infringement of any third-party rights.
            </p>
          </Section>

          {/* 10. Governing Law */}
          <Section title="10. Governing Law">
            <p>
              These Terms shall be governed by and construed in accordance with the laws of the State of Utah,
              without regard to its conflict-of-law provisions.
            </p>
          </Section>

          {/* 11. Changes */}
          <Section title="11. Changes to These Terms">
            <p>
              We may update these Terms from time to time. We will notify registered users of material changes
              via email or through the platform. Your continued use of the platform after changes constitutes acceptance.
            </p>
          </Section>

          {/* 12. Contact */}
          <Section title="12. Contact Us">
            <p>
              If you have questions about these Terms of Service, contact us at:
            </p>
            <p>
              <strong>Sunstone Studio</strong><br />
              Email: <a href="mailto:support@sunstonepj.app" style={{ color: '#c2185b' }}>support@sunstonepj.app</a><br />
              Website: <a href="https://sunstonepj.app" style={{ color: '#c2185b' }}>sunstonepj.app</a>
            </p>
          </Section>
        </div>
      </main>

      {/* Footer */}
      <footer style={{ padding: '24px', borderTop: '1px solid #e7e5e4', textAlign: 'center' }}>
        <p style={{ fontSize: 13, color: '#a8a29e' }}>
          &copy; {new Date().getFullYear()} Sunstone Studio &middot;{' '}
          <Link href="/privacy" style={{ color: '#a8a29e', textDecoration: 'underline' }}>Privacy Policy</Link>
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
