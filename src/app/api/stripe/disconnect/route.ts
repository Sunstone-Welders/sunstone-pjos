import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-02-24.acacia',
});

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get tenant owned by this user
    const { data: tenant } = await supabase
      .from('tenants')
      .select('id, stripe_account_id')
      .eq('owner_id', user.id)
      .single();

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    // Deauthorize the connected account with Stripe
    if (tenant.stripe_account_id) {
      try {
        const clientId = process.env.STRIPE_CLIENT_ID;
        if (clientId) {
          await stripe.oauth.deauthorize({
            client_id: clientId,
            stripe_user_id: tenant.stripe_account_id,
          });
        }
      } catch (deauthErr) {
        // Non-critical — proceed with local cleanup
        console.warn('Stripe deauthorize warning:', deauthErr);
      }
    }

    // Clear Stripe account ID
    const { error } = await supabase
      .from('tenants')
      .update({ stripe_account_id: null })
      .eq('id', tenant.id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Stripe disconnect error:', err);
    return NextResponse.json({ error: 'Failed to disconnect Stripe' }, { status: 500 });
  }
}
