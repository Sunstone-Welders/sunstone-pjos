import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

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
      .select('id, square_access_token')
      .eq('owner_id', user.id)
      .single();

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    // Optionally revoke the token with Square
    if (tenant.square_access_token) {
      try {
        const environment = process.env.SQUARE_ENVIRONMENT || 'sandbox';
        const squareBaseUrl = environment === 'production'
          ? 'https://connect.squareup.com'
          : 'https://connect.squareupsandbox.com';

        await fetch(`${squareBaseUrl}/oauth2/revoke`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Client ${process.env.SQUARE_APPLICATION_SECRET}`,
          },
          body: JSON.stringify({
            client_id: process.env.SQUARE_APPLICATION_ID,
            access_token: tenant.square_access_token,
          }),
        });
      } catch {
        // Non-critical — proceed with local cleanup
      }
    }

    // Clear Square fields
    const { error } = await supabase
      .from('tenants')
      .update({
        square_merchant_id: null,
        square_access_token: null,
        square_refresh_token: null,
        square_location_id: null,
      })
      .eq('id', tenant.id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Square disconnect error:', err);
    return NextResponse.json({ error: 'Failed to disconnect Square' }, { status: 500 });
  }
}