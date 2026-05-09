// ============================================================================
// Stripe Terminal Connection Token — POST /api/stripe/connection-token
// ============================================================================
// Mints a Stripe Terminal ConnectionToken for the artist's connected account.
// Called by the Stripe Terminal SDK client-side to authenticate with Stripe
// servers for Tap to Pay.
//
// SECURITY: Auth required. Token is scoped to the connected account.
// ============================================================================

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createServerSupabase, createServiceRoleClient } from '@/lib/supabase/server';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-02-24.acacia' as any,
});

export async function POST(_req: NextRequest) {
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

    // ── Get tenant's Stripe connected account ───────────────────────────
    const db = await createServiceRoleClient();

    const { data: tenant } = await db
      .from('tenants')
      .select('stripe_account_id')
      .eq('id', tenantId)
      .single();

    if (!tenant?.stripe_account_id) {
      return NextResponse.json(
        { error: 'Stripe not connected. Go to Settings → Payments to connect.' },
        { status: 403 }
      );
    }

    // ── Create Terminal ConnectionToken on the connected account ─────────
    const connectionToken = await stripe.terminal.connectionTokens.create(
      {},
      { stripeAccount: tenant.stripe_account_id }
    );

    return NextResponse.json({ secret: connectionToken.secret });
  } catch (error: any) {
    console.error('[Connection Token] Error:', error);
    const message = error?.type?.startsWith('Stripe')
      ? error.message
      : 'Failed to create connection token. Please try again.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
