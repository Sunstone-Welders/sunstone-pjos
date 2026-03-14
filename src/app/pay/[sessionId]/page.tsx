// ============================================================================
// Payment Redirect — /pay/[sessionId]
// ============================================================================
// Clean redirect URL for SMS payment links. iOS Messages truncates URLs at #
// fragments, and Stripe Checkout URLs contain #. This page provides a clean
// /pay/cs_live_xxx URL that redirects to the full Stripe Checkout URL.
//
// PUBLIC — no auth required. The sessionId is opaque and short-lived.
// ============================================================================

import { redirect } from 'next/navigation';
import Stripe from 'stripe';
import { createServiceRoleClient } from '@/lib/supabase/server';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-02-24.acacia' as any,
});

export default async function PayRedirectPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;

  try {
    // Look up the tenant that owns this checkout session.
    // Check both sales and party_requests (deposit payments).
    const db = await createServiceRoleClient();

    let tenantId: string | null = null;

    const { data: sale } = await db
      .from('sales')
      .select('tenant_id')
      .eq('stripe_checkout_session_id', sessionId)
      .single();

    if (sale) {
      tenantId = sale.tenant_id;
    } else {
      const { data: partyReq } = await db
        .from('party_requests')
        .select('tenant_id')
        .eq('stripe_checkout_session_id', sessionId)
        .single();
      if (partyReq) tenantId = partyReq.tenant_id;
    }

    if (!tenantId) {
      return <ExpiredPage />;
    }

    const { data: tenant } = await db
      .from('tenants')
      .select('stripe_account_id')
      .eq('id', tenantId)
      .single();

    if (!tenant?.stripe_account_id) {
      return <ExpiredPage />;
    }

    // Retrieve the session from the connected account
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: [],
    }, {
      stripeAccount: tenant.stripe_account_id,
    });

    // Only redirect if the session is still open
    if (session.status === 'open' && session.url) {
      redirect(session.url);
    }

    return <ExpiredPage />;
  } catch {
    return <ExpiredPage />;
  }
}

function ExpiredPage() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#ffffff',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      padding: '24px',
    }}>
      <div style={{ textAlign: 'center', maxWidth: '400px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 600, color: '#1f2937', marginBottom: '12px' }}>
          Link Expired
        </h1>
        <p style={{ fontSize: '16px', color: '#6b7280', lineHeight: 1.5 }}>
          This payment link has expired. Please ask your artist to send a new one.
        </p>
      </div>
    </div>
  );
}
