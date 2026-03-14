// ============================================================================
// Stripe Session Status — GET /api/stripe/session-status
// ============================================================================
// Polls a Stripe Checkout Session's payment_status directly from Stripe.
// Used by the POS to detect payment completion without relying solely on
// webhooks. Auth required.
// ============================================================================

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createServerSupabase, createServiceRoleClient } from '@/lib/supabase/server';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-02-24.acacia' as any,
});

export async function GET(request: NextRequest) {
  try {
    // ── Auth check ──────────────────────────────────────────────────────
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: member } = await supabase
      .from('tenant_members')
      .select('tenant_id')
      .eq('user_id', user.id)
      .limit(1)
      .single();
    if (!member) return NextResponse.json({ error: 'No tenant membership' }, { status: 403 });

    const tenantId = member.tenant_id;

    // ── Get sessionId from query params ─────────────────────────────────
    const sessionId = request.nextUrl.searchParams.get('sessionId');
    if (!sessionId) {
      return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 });
    }

    // ── Get tenant's Stripe account ─────────────────────────────────────
    const db = await createServiceRoleClient();
    const { data: tenant } = await db
      .from('tenants')
      .select('stripe_account_id')
      .eq('id', tenantId)
      .single();

    if (!tenant?.stripe_account_id) {
      return NextResponse.json({ error: 'Stripe not connected' }, { status: 400 });
    }

    // ── Retrieve session from connected account ─────────────────────────
    const session = await stripe.checkout.sessions.retrieve(
      sessionId,
      {},
      { stripeAccount: tenant.stripe_account_id }
    );

    return NextResponse.json({
      status: session.payment_status,
      sessionStatus: session.status,
      sessionId: session.id,
    });
  } catch (error: any) {
    console.error('[Session Status] Error:', error);
    return NextResponse.json(
      { error: 'Failed to check payment status' },
      { status: 500 }
    );
  }
}
