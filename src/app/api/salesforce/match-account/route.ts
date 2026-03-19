// ============================================================================
// SF Account Match — src/app/api/salesforce/match-account/route.ts
// ============================================================================
// GET: Match the authenticated artist's email to a Salesforce Account
// via Contact.Email lookup. Caches sf_account_id on the tenant record.
// ============================================================================

import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceRoleClient } from '@/lib/supabase/server';
import { sfQuery } from '@/lib/salesforce';

export async function GET() {
  try {
    const supabase = await createServerSupabase();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { data: member } = await supabase
      .from('tenant_members')
      .select('tenant_id')
      .eq('user_id', user.id)
      .limit(1)
      .single();

    if (!member) {
      return NextResponse.json({ error: 'No tenant membership' }, { status: 403 });
    }

    const serviceClient = await createServiceRoleClient();

    // Check cached sf_account_id first
    const { data: tenant } = await serviceClient
      .from('tenants')
      .select('sf_account_id')
      .eq('id', member.tenant_id)
      .single();

    if (tenant?.sf_account_id) {
      // Fetch shipping address from cached account
      const accounts = await sfQuery<any>(
        `SELECT Id, Name, ShippingStreet, ShippingCity, ShippingState, ShippingPostalCode, ShippingCountry FROM Account WHERE Id = '${tenant.sf_account_id}'`
      );

      if (accounts.length > 0) {
        const acct = accounts[0];
        return NextResponse.json({
          matched: true,
          accountId: acct.Id,
          accountName: acct.Name,
          shippingAddress: {
            street: acct.ShippingStreet || '',
            city: acct.ShippingCity || '',
            state: acct.ShippingState || '',
            postalCode: acct.ShippingPostalCode || '',
            country: acct.ShippingCountry || 'US',
          },
        });
      }
    }

    // Look up by email
    const email = user.email;
    if (!email) {
      return NextResponse.json({ matched: false, reason: 'No email on account' });
    }

    const accounts = await sfQuery<any>(
      `SELECT Id, Name, ShippingStreet, ShippingCity, ShippingState, ShippingPostalCode, ShippingCountry FROM Account WHERE Id IN (SELECT AccountId FROM Contact WHERE Email = '${email.replace(/'/g, "\\'")}')`
    );

    if (accounts.length === 0) {
      return NextResponse.json({ matched: false });
    }

    const acct = accounts[0];

    // Cache sf_account_id on tenant
    await serviceClient
      .from('tenants')
      .update({ sf_account_id: acct.Id })
      .eq('id', member.tenant_id);

    return NextResponse.json({
      matched: true,
      accountId: acct.Id,
      accountName: acct.Name,
      shippingAddress: {
        street: acct.ShippingStreet || '',
        city: acct.ShippingCity || '',
        state: acct.ShippingState || '',
        postalCode: acct.ShippingPostalCode || '',
        country: acct.ShippingCountry || 'US',
      },
    });
  } catch (err: any) {
    console.error('[SF Match Account] Error:', err);
    return NextResponse.json({ error: 'Failed to match account' }, { status: 500 });
  }
}
