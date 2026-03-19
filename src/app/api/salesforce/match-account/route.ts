// ============================================================================
// SF Account Resolution — src/app/api/salesforce/match-account/route.ts
// ============================================================================
// GET:  Multi-strategy account search (email → business name → person name).
//       Returns matches with confidence level, shipping address, payment methods.
// POST: Create a new SF Account + Contact for first-time customers.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase, createServiceRoleClient } from '@/lib/supabase/server';
import {
  sfSearchAccounts,
  sfGetPaymentMethods,
  sfCreateAccount,
} from '@/lib/salesforce';

// ── Normalize SF payment method fields to consistent frontend format ─────

function normalizePaymentMethods(raw: any[]): any[] {
  return raw.map((card: any) => ({
    id: card.id || card.Id || card.cardId || '',
    brand: card.brand || card.Brand__c || card.cardType || 'Card',
    last4: card.last4 || card.Last_4__c || card.lastFour || '',
    expirationMonth: card.expirationMonth || card.Expiration_Month__c || card.expMonth || '',
    expirationYear: card.expirationYear || card.Expiration_Year__c || card.expYear || '',
  }));
}

// ── GET: Search / resolve account ────────────────────────────────────────

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

    // Check if tenant already has a cached sf_account_id
    const { data: tenant } = await serviceClient
      .from('tenants')
      .select('sf_account_id, name, phone')
      .eq('id', member.tenant_id)
      .single();

    if (tenant?.sf_account_id) {
      // Already linked — fetch payment methods and return
      let paymentMethods: any[] = [];
      try {
        const pmResult = await sfGetPaymentMethods(tenant.sf_account_id);
        paymentMethods = normalizePaymentMethods(pmResult?.paymentMethods || pmResult?.cards || []);
      } catch (err) {
        console.warn('[SF Match] getPaymentMethods error:', err);
      }

      return NextResponse.json({
        resolved: true,
        accountId: tenant.sf_account_id,
        paymentMethods,
      });
    }

    // Not cached — run multi-strategy search
    const email = user.email || '';
    const businessName = tenant?.name || '';

    // Try to parse artist name from user metadata or email
    const meta = user.user_metadata || {};
    let firstName = meta.first_name || meta.firstName || '';
    let lastName = meta.last_name || meta.lastName || '';
    if (!firstName && meta.full_name) {
      const parts = (meta.full_name as string).split(' ');
      firstName = parts[0] || '';
      lastName = parts.slice(1).join(' ') || '';
    }

    let searchResult: any;
    try {
      searchResult = await sfSearchAccounts(email, businessName, firstName, lastName);
    } catch (err: any) {
      console.error('[SF Match] searchAccounts error:', err);
      return NextResponse.json({
        resolved: false,
        confidence: 'error',
        error: 'Failed to search Salesforce accounts',
      });
    }

    const matches = searchResult?.matches || [];
    const confidence = searchResult?.confidence || 'none';

    // If exact email match with a single result, auto-link
    if (confidence === 'exact_email' && matches.length === 1) {
      const match = matches[0];

      // Cache on tenant
      await serviceClient
        .from('tenants')
        .update({ sf_account_id: match.accountId })
        .eq('id', member.tenant_id);

      // Fetch payment methods
      let paymentMethods: any[] = [];
      try {
        const pmResult = await sfGetPaymentMethods(match.accountId);
        paymentMethods = normalizePaymentMethods(pmResult?.paymentMethods || pmResult?.cards || []);
      } catch (err) {
        console.warn('[SF Match] getPaymentMethods error:', err);
      }

      return NextResponse.json({
        resolved: true,
        accountId: match.accountId,
        accountName: match.accountName,
        shippingAddress: {
          street: match.shippingStreet || '',
          city: match.city || '',
          state: match.state || '',
          postalCode: match.shippingPostalCode || '',
          country: match.shippingCountry || 'US',
        },
        paymentMethods,
        confidence: 'exact_email',
      });
    }

    // Multiple matches or fuzzy match — return for user confirmation
    if (matches.length > 0) {
      return NextResponse.json({
        resolved: false,
        confidence,
        matches,
      });
    }

    // No matches at all — return prefill data for account creation form
    return NextResponse.json({
      resolved: false,
      confidence: 'none',
      matches: [],
      prefill: {
        businessName,
        firstName,
        lastName,
        email,
        phone: tenant?.phone || '',
      },
    });
  } catch (err: any) {
    console.error('[SF Match Account] Error:', err);
    return NextResponse.json({ error: 'Failed to match account' }, { status: 500 });
  }
}

// ── POST: Create new account OR confirm a match ──────────────────────────

export async function POST(request: NextRequest) {
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

    const body = await request.json();
    const { action } = body;

    const serviceClient = await createServiceRoleClient();

    // ── Confirm an existing match ──────────────────────────────────────
    if (action === 'confirm') {
      const { accountId } = body;
      if (!accountId) {
        return NextResponse.json({ error: 'Missing accountId' }, { status: 400 });
      }

      // Cache on tenant
      await serviceClient
        .from('tenants')
        .update({ sf_account_id: accountId })
        .eq('id', member.tenant_id);

      // Fetch payment methods
      let paymentMethods: any[] = [];
      try {
        const pmResult = await sfGetPaymentMethods(accountId);
        paymentMethods = normalizePaymentMethods(pmResult?.paymentMethods || pmResult?.cards || []);
      } catch (err) {
        console.warn('[SF Match] getPaymentMethods error:', err);
      }

      return NextResponse.json({
        success: true,
        accountId,
        paymentMethods,
      });
    }

    // ── Create a new account ───────────────────────────────────────────
    if (action === 'create') {
      const {
        accountName, firstName, lastName, email, phone,
        shippingStreet, shippingCity, shippingState, shippingPostalCode, shippingCountry,
      } = body;

      if (!accountName) {
        return NextResponse.json({ error: 'Business name is required' }, { status: 400 });
      }

      let result: any;
      try {
        result = await sfCreateAccount({
          accountName,
          firstName: firstName || '',
          lastName: lastName || accountName,
          email: email || user.email || '',
          phone: phone || '',
          shippingStreet: shippingStreet || '',
          shippingCity: shippingCity || '',
          shippingState: shippingState || '',
          shippingPostalCode: shippingPostalCode || '',
          shippingCountry: shippingCountry || 'US',
        });
      } catch (err: any) {
        console.error('[SF Match] createAccount error:', err);
        return NextResponse.json({
          success: false,
          error: 'Failed to create Sunstone account',
        }, { status: 500 });
      }

      if (result.success === false || result.error) {
        return NextResponse.json({
          success: false,
          error: result.error || 'Account creation failed',
        }, { status: 400 });
      }

      // Cache on tenant
      await serviceClient
        .from('tenants')
        .update({ sf_account_id: result.accountId })
        .eq('id', member.tenant_id);

      return NextResponse.json({
        success: true,
        accountId: result.accountId,
        contactId: result.contactId,
        paymentMethods: [], // New account — no saved cards yet
      });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err: any) {
    console.error('[SF Match Account POST] Error:', err);
    return NextResponse.json({ error: 'Request failed' }, { status: 500 });
  }
}
