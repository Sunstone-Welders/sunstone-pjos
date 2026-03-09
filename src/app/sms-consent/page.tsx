// ============================================================================
// SMS Consent & Opt-In Disclosure — src/app/sms-consent/page.tsx
// ============================================================================
// Static, server-rendered page for Twilio A2P 10DLC campaign verification.
// Shows TCR reviewers how customers opt in to SMS via the digital waiver form.
// NO "use client" — entire page is in the initial HTML response.
// ============================================================================

import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';

export const metadata: Metadata = {
  title: 'SMS Consent & Opt-In Disclosure — Sunstone Studio',
  description:
    'Learn how customers opt in to receive text messages through Sunstone Studio, including consent process, message types, and opt-out instructions.',
};

export default function SmsConsentPage() {
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
            <Link href="/terms" style={{ fontSize: 14, color: '#78716c', textDecoration: 'none' }}>Terms</Link>
            <Link href="/auth/login" style={{ fontSize: 14, color: '#78716c', textDecoration: 'none' }}>Log In</Link>
          </div>
        </div>
      </header>

      {/* Content */}
      <main style={{ maxWidth: 800, margin: '0 auto', padding: '48px 24px 80px' }}>
        <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 36, fontWeight: 700, color: '#1c1917', marginBottom: 8 }}>
          SMS Consent &amp; Opt-In Disclosure
        </h1>
        <p style={{ fontSize: 15, color: '#78716c', marginBottom: 40, lineHeight: 1.6 }}>
          How customers opt in to receive text messages through Sunstone Studio
        </p>

        <div style={{ fontSize: 15.5, lineHeight: 1.75, color: '#44403c' }}>

          {/* Section 1: Opt-In Process Overview */}
          <Section title="1. Opt-In Process Overview">
            <p>
              Sunstone Studio is a business management platform used by permanent jewelry service providers.
              Before receiving service, each customer completes a digital waiver and check-in form on the
              service provider&rsquo;s device or via a QR code link.
            </p>
            <p>The opt-in flow works as follows:</p>
            <ol style={{ paddingLeft: 20, listStyleType: 'decimal' }}>
              <li>The customer visits a permanent jewelry service provider who uses Sunstone Studio.</li>
              <li>The customer is presented with a digital waiver and check-in form.</li>
              <li>The form collects their name, email address, and phone number.</li>
              <li>
                Below the phone number field, a <strong>separate, clearly labeled SMS consent checkbox</strong> is
                displayed. This checkbox is <strong>not pre-checked</strong> &mdash; the customer must actively
                select it.
              </li>
              <li>
                The SMS consent checkbox is <strong>optional</strong> &mdash; customers can decline SMS
                and still receive permanent jewelry services.
              </li>
              <li>
                Checking the box and submitting the form constitutes express written consent to receive
                text messages.
              </li>
            </ol>
          </Section>

          {/* Section 2: Visual Demonstration */}
          <Section title="2. Visual Demonstration of the Opt-In Form">
            <p style={{ marginBottom: 16 }}>
              Below is a static representation of the actual waiver and check-in form that customers
              complete. The SMS consent checkbox and disclosure language are highlighted.
            </p>

            {/* Form Mockup */}
            <div style={{ position: 'relative', maxWidth: 420, margin: '0 auto 24px' }}>
              {/* SAMPLE badge */}
              <div style={{
                position: 'absolute',
                top: 12,
                right: 12,
                background: '#c8a55c',
                color: '#fff',
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: 1,
                padding: '3px 10px',
                borderRadius: 20,
                zIndex: 1,
                textTransform: 'uppercase',
              }}>
                Sample
              </div>

              <div style={{
                background: '#fffbf5',
                border: '1px solid #e7e5e4',
                borderRadius: 16,
                padding: '32px 24px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
              }}>
                {/* Mock header */}
                <div style={{ textAlign: 'center', marginBottom: 24 }}>
                  <div style={{
                    width: 48,
                    height: 48,
                    borderRadius: 14,
                    background: '#6b2942',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 20,
                    fontWeight: 700,
                    margin: '0 auto 8px',
                  }}>
                    S
                  </div>
                  <div style={{ fontFamily: "'Playfair Display', serif", fontWeight: 600, fontSize: 18, color: '#1c1917' }}>
                    Sample Business
                  </div>
                  <div style={{ fontSize: 13, color: '#a8a29e' }}>Waiver &amp; Check-in</div>
                </div>

                {/* Name field */}
                <FormField label="Full Name *" value="Jane Smith" />

                {/* Email field */}
                <FormField label="Email" value="jane@email.com" />

                {/* Phone field */}
                <FormField label="Phone" value="(555) 123-4567" />

                {/* SMS Consent Checkbox — THE CRITICAL ELEMENT */}
                <div style={{
                  border: '2px solid #c8a55c',
                  borderRadius: 10,
                  padding: 16,
                  background: '#fffef9',
                  marginBottom: 16,
                  position: 'relative',
                }}>
                  {/* Highlight label */}
                  <div style={{
                    position: 'absolute',
                    top: -10,
                    left: 12,
                    background: '#c8a55c',
                    color: '#fff',
                    fontSize: 10,
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: 4,
                    letterSpacing: 0.5,
                    textTransform: 'uppercase',
                  }}>
                    SMS Consent Checkbox
                  </div>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <div style={{
                      width: 22,
                      height: 22,
                      borderRadius: 4,
                      border: '2px solid #6b2942',
                      background: '#6b2942',
                      flexShrink: 0,
                      marginTop: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </div>
                    <div style={{ fontSize: 12, lineHeight: 1.7, color: '#57534e' }}>
                      By providing my phone number, I consent to receive text messages from
                      this business via Sunstone Studio. Messages may include queue position
                      updates, service notifications, appointment reminders, receipts, and
                      aftercare instructions. Message frequency varies, typically 1&ndash;3 messages
                      per visit. Message and data rates may apply. Reply STOP to unsubscribe
                      at any time. Reply HELP for help.
                    </div>
                  </div>
                  <div style={{ fontSize: 11, marginTop: 8, marginLeft: 34, color: '#a8a29e' }}>
                    <span style={{ textDecoration: 'underline' }}>Privacy Policy</span>
                    <span style={{ margin: '0 6px' }}>&middot;</span>
                    <span style={{ textDecoration: 'underline' }}>Terms of Service</span>
                  </div>
                </div>

                {/* Waiver text */}
                <div style={{
                  background: '#faf9f7',
                  borderRadius: 8,
                  padding: 14,
                  marginBottom: 16,
                  maxHeight: 80,
                  overflow: 'hidden',
                }}>
                  <p style={{ fontSize: 13, color: '#78716c', margin: 0 }}>
                    I acknowledge the risks associated with permanent jewelry services, including
                    but not limited to minor skin irritation. I confirm that I have no metal
                    allergies that would prevent this service. I agree to follow all aftercare
                    instructions provided.
                  </p>
                </div>

                {/* Continue button */}
                <div style={{
                  background: '#6b2942',
                  color: '#fff',
                  textAlign: 'center',
                  padding: '14px 0',
                  borderRadius: 10,
                  fontWeight: 600,
                  fontSize: 15,
                }}>
                  Continue to Sign
                </div>
              </div>
            </div>

            <p style={{ fontSize: 14, color: '#78716c', textAlign: 'center', fontStyle: 'italic' }}>
              The above is a static visual representation of the live form at{' '}
              <a href="/waiver" style={{ color: '#6b2942' }}>sunstonepj.app/waiver</a>.
              The SMS consent checkbox is separate from the waiver agreement and is not pre-checked.
            </p>
          </Section>

          {/* Section 3: Consent Details */}
          <Section title="3. Consent Details">
            <p><strong>Message Types</strong></p>
            <ul>
              <li>Queue position updates (e.g., &ldquo;You&rsquo;re #3 in line&rdquo;)</li>
              <li>Service-ready alerts (e.g., &ldquo;You&rsquo;re next! Please head to the service area&rdquo;)</li>
              <li>Digital receipts with purchase summary</li>
              <li>Aftercare instructions for permanent jewelry</li>
              <li>Appointment reminders</li>
              <li>Follow-up communications from the service provider</li>
            </ul>

            <p><strong>Message Frequency</strong></p>
            <p>
              Typically 1&ndash;5 messages per customer visit. Follow-up messages may be sent at the
              service provider&rsquo;s discretion. Message frequency varies based on the services
              used and the customer&rsquo;s interaction with the business.
            </p>

            <p><strong>Opt-Out</strong></p>
            <p>
              Reply <strong>STOP</strong> to any message to unsubscribe immediately. A confirmation
              message will be sent, and no further messages will be delivered. Customers can also
              request removal by contacting{' '}
              <a href="mailto:support@sunstonepj.app" style={{ color: '#6b2942' }}>support@sunstonepj.app</a>.
            </p>

            <p><strong>Help</strong></p>
            <p>
              Reply <strong>HELP</strong> to any message for assistance, or email{' '}
              <a href="mailto:support@sunstonepj.app" style={{ color: '#6b2942' }}>support@sunstonepj.app</a>.
            </p>

            <p><strong>Cost</strong></p>
            <p>
              Message and data rates may apply depending on your mobile carrier and plan.
              Sunstone Studio does not charge customers for receiving text messages.
            </p>

            <p><strong>Not Required for Service</strong></p>
            <p>
              SMS consent is <strong>not required</strong> as a condition of purchasing permanent
              jewelry services or any other goods. Customers may decline the SMS checkbox and
              still complete the waiver and receive service.
            </p>

            <p><strong>No Sharing</strong></p>
            <p>
              Phone numbers and SMS consent data are never sold, rented, or shared with third
              parties for marketing purposes. Data is used solely to facilitate communications
              between the service provider and their customer through the Sunstone Studio platform.
            </p>
          </Section>

          {/* Section 4: Sample Messages */}
          <Section title="4. Sample Messages">
            <p style={{ marginBottom: 16 }}>
              Below are examples of the types of text messages customers may receive after opting in:
            </p>

            <div style={{ maxWidth: 400, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <SmsBubble
                label="Queue Confirmation"
                message="Hi Sarah! Your waiver has been received and you've been added to the queue. You're currently #3 in line. We'll text you when it's your turn!"
              />
              <SmsBubble
                label="Service Ready"
                message="You're next! Please head to the service area. Your artist is ready for you."
              />
              <SmsBubble
                label="Digital Receipt"
                message="Your receipt from Sparkle & Co: Gold-Fill Bracelet — $45.00. Thank you for your visit! ✨"
              />
              <SmsBubble
                label="Aftercare"
                message="Thank you for your visit! Quick care tip: avoid chlorine or saltwater for the first 24 hours. Reply STOP to opt out."
              />
            </div>
          </Section>

          {/* Section 5: Technical Implementation */}
          <Section title="5. Platform Information">
            <p>
              <strong>Platform name:</strong> Sunstone Studio<br />
              <strong>Website:</strong>{' '}
              <a href="https://sunstonepj.app" style={{ color: '#6b2942' }}>sunstonepj.app</a><br />
              <strong>Opt-in page:</strong>{' '}
              <a href="/waiver" style={{ color: '#6b2942' }}>sunstonepj.app/waiver</a><br />
              <strong>Privacy policy:</strong>{' '}
              <a href="/privacy" style={{ color: '#6b2942' }}>sunstonepj.app/privacy</a><br />
              <strong>Terms of service:</strong>{' '}
              <a href="/terms" style={{ color: '#6b2942' }}>sunstonepj.app/terms</a><br />
              <strong>Support email:</strong>{' '}
              <a href="mailto:support@sunstonepj.app" style={{ color: '#6b2942' }}>support@sunstonepj.app</a>
            </p>
            <p>
              Sunstone Studio uses Twilio for SMS delivery. Each service provider business on our
              platform is assigned a dedicated local phone number for customer communications.
              All messages are sent from these dedicated numbers, not shared short codes.
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
          <Link href="/terms" style={{ color: '#a8a29e', textDecoration: 'underline' }}>Terms of Service</Link>
          {' '}&middot;{' '}
          <Link href="/" style={{ color: '#a8a29e', textDecoration: 'underline' }}>Home</Link>
        </p>
      </footer>
    </div>
  );
}

/* ── Helper Components ──────────────────────────────────────────────────── */

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

function FormField({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 500, color: '#57534e', marginBottom: 6 }}>{label}</div>
      <div style={{
        background: '#fff',
        border: '1px solid #d6d3d1',
        borderRadius: 8,
        padding: '12px 14px',
        fontSize: 15,
        color: '#1c1917',
      }}>
        {value}
      </div>
    </div>
  );
}

function SmsBubble({ label, message }: { label: string; message: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#a8a29e', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
        {label}
      </div>
      <div style={{
        background: '#e8e6e3',
        borderRadius: '18px 18px 18px 4px',
        padding: '12px 16px',
        fontSize: 14,
        lineHeight: 1.55,
        color: '#1c1917',
        maxWidth: '85%',
      }}>
        {message}
      </div>
    </div>
  );
}
