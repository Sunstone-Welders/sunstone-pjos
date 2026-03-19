// ============================================================================
// SF Create Reorder — src/app/api/salesforce/create-reorder/route.ts
// ============================================================================
// POST: Called AFTER Stripe payment succeeds. Verifies the PaymentIntent,
// creates SF Opportunity + Quote + QuoteLineItems, syncs the Quote.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createServerSupabase, createServiceRoleClient } from '@/lib/supabase/server';
import { sfQuery, sfCreate, sfUpdate, sfGet } from '@/lib/salesforce';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-02-24.acacia' as any,
});

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
    const { reorderId, stripePaymentIntentId } = body;

    if (!reorderId || !stripePaymentIntentId) {
      return NextResponse.json({ error: 'Missing reorderId or stripePaymentIntentId' }, { status: 400 });
    }

    // Step 1: Verify PaymentIntent status
    const paymentIntent = await stripe.paymentIntents.retrieve(stripePaymentIntentId);
    if (paymentIntent.status !== 'succeeded') {
      return NextResponse.json({ error: `Payment not yet succeeded (status: ${paymentIntent.status})` }, { status: 400 });
    }

    const serviceClient = await createServiceRoleClient();

    // Step 2: Load reorder + tenant
    const { data: reorder } = await serviceClient
      .from('reorder_history')
      .select('*')
      .eq('id', reorderId)
      .eq('tenant_id', member.tenant_id)
      .single();

    if (!reorder) {
      return NextResponse.json({ error: 'Reorder not found' }, { status: 404 });
    }

    const { data: tenant } = await serviceClient
      .from('tenants')
      .select('sf_account_id, name')
      .eq('id', member.tenant_id)
      .single();

    // Step 3: Find SF Account
    let sfAccountId = tenant?.sf_account_id;

    if (!sfAccountId && user.email) {
      const accounts = await sfQuery<any>(
        `SELECT Id FROM Account WHERE Id IN (SELECT AccountId FROM Contact WHERE Email = '${user.email.replace(/'/g, "\\'")}')`
      );
      if (accounts.length > 0) {
        sfAccountId = accounts[0].Id;
        await serviceClient
          .from('tenants')
          .update({ sf_account_id: sfAccountId })
          .eq('id', member.tenant_id);
      }
    }

    if (!sfAccountId) {
      // Can't create SF records without an account — mark for manual reconciliation
      await serviceClient
        .from('reorder_history')
        .update({ status: 'sf_pending' })
        .eq('id', reorderId);

      return NextResponse.json({
        success: true,
        warning: 'Payment succeeded but no Salesforce account found. Order will be reconciled manually.',
        reorderId,
      });
    }

    // Step 4: Match SF Product2 records
    const items = reorder.items as any[];
    const skus = items.map((i: any) => i.variant_id).filter(Boolean);
    const names = items.map((i: any) => i.name);

    // Try SKU match first
    let sfProducts: any[] = [];
    if (skus.length > 0) {
      const skuList = skus.map((s: string) => `'${s}'`).join(',');
      sfProducts = await sfQuery<any>(
        `SELECT Id, Name, ProductCode FROM Product2 WHERE ProductCode IN (${skuList})`
      );
    }

    // Fall back to name match for unmatched items
    const matchedSkus = new Set(sfProducts.map((p: any) => p.ProductCode));
    const unmatchedItems = items.filter((i: any) => !matchedSkus.has(i.variant_id));

    if (unmatchedItems.length > 0) {
      for (const item of unmatchedItems) {
        const nameClean = item.name.replace(/'/g, "\\'");
        const nameMatches = await sfQuery<any>(
          `SELECT Id, Name, ProductCode FROM Product2 WHERE Name LIKE '%${nameClean}%' LIMIT 1`
        );
        if (nameMatches.length > 0) {
          sfProducts.push(nameMatches[0]);
        }
      }
    }

    // Step 5: Get PricebookEntry IDs
    const sfProductIds = sfProducts.map((p: any) => `'${p.Id}'`).join(',');
    let pricebookEntries: any[] = [];
    if (sfProductIds) {
      pricebookEntries = await sfQuery<any>(
        `SELECT Id, Product2Id, UnitPrice FROM PricebookEntry WHERE Product2Id IN (${sfProductIds}) AND Pricebook2.IsStandard = true`
      );
    }

    const pbeByProductId = new Map(pricebookEntries.map((e: any) => [e.Product2Id, e]));

    // Step 6: Create Opportunity (Closed Won)
    const today = new Date().toISOString().split('T')[0];
    const oppName = `Studio Reorder — ${tenant?.name || 'Artist'} — ${today}`;

    const oppId = await sfCreate('Opportunity', {
      Name: oppName,
      AccountId: sfAccountId,
      StageName: 'Closed Won',
      CloseDate: today,
      Amount: reorder.total_amount,
      Direct_Order__c: true,
      LeadSource: 'Sunstone Studio',
      Description: `Supply reorder via Sunstone Studio. Stripe PI: ${stripePaymentIntentId}`,
    });

    // Step 7: Parse shipping from notes
    const noteParts = (reorder.notes || '').replace('Shipping to: ', '').split(', ');
    const shippingStreet = noteParts[0] || '';
    const shippingCity = noteParts[1] || '';
    const stateZip = (noteParts[2] || '').split(' ');
    const shippingState = stateZip[0] || '';
    const shippingPostalCode = stateZip[1] || '';

    // Step 8: Create Quote (Accepted)
    const quoteId = await sfCreate('Quote', {
      Name: `Q-${oppName}`,
      OpportunityId: oppId,
      Status: 'Accepted',
      Direct_Order__c: true,
      ShippingStreet: shippingStreet,
      ShippingCity: shippingCity,
      ShippingState: shippingState,
      ShippingPostalCode: shippingPostalCode,
      ShippingCountry: 'US',
      Description: `Auto-created from Sunstone Studio reorder`,
    });

    // Step 9: Create QuoteLineItems
    for (const item of items) {
      // Find the matching SF product
      const sfProd = sfProducts.find(
        (p: any) => p.ProductCode === item.variant_id || p.Name.includes(item.name.split(' — ')[0])
      );

      if (sfProd && pbeByProductId.has(sfProd.Id)) {
        const pbe = pbeByProductId.get(sfProd.Id);
        await sfCreate('QuoteLineItem', {
          QuoteId: quoteId,
          PricebookEntryId: pbe.Id,
          Quantity: item.quantity,
          UnitPrice: item.unit_price,
        });
      } else {
        // No SF product match — log but don't fail
        console.warn(`[SF Reorder] No SF product match for item: ${item.name}`);
      }
    }

    // Step 10: Sync Quote
    await sfUpdate('Quote', quoteId, { IsSyncing: true });

    // Wait for sync to propagate, then read back tax/shipping
    await sleep(3000);

    let sfTax = reorder.tax_amount;
    let sfShipping = reorder.shipping_amount;
    let sfGrandTotal = reorder.total_amount;

    try {
      const quote = await sfGet<any>('Quote', quoteId, [
        'Tax', 'ShippingHandling', 'New_Grand_Total__c',
      ]);
      if (quote.Tax != null) sfTax = Number(quote.Tax);
      if (quote.ShippingHandling != null) sfShipping = Number(quote.ShippingHandling);
      if (quote.New_Grand_Total__c != null) sfGrandTotal = Number(quote.New_Grand_Total__c);
    } catch (err) {
      console.warn('[SF Reorder] Could not re-read quote after sync:', err);
    }

    // Step 11: Update reorder_history
    await serviceClient
      .from('reorder_history')
      .update({
        sf_opportunity_id: oppId,
        sf_quote_id: quoteId,
        status: 'confirmed',
        tax_amount: sfTax,
        shipping_amount: sfShipping,
        total_amount: sfGrandTotal,
      })
      .eq('id', reorderId);

    return NextResponse.json({
      success: true,
      opportunityId: oppId,
      quoteId: quoteId,
      opportunityName: oppName,
      tax: sfTax,
      shipping: sfShipping,
      grandTotal: sfGrandTotal,
    });
  } catch (err: any) {
    console.error('[SF Create Reorder] Error:', err);

    // If SF fails after payment, mark for manual reconciliation
    try {
      const serviceClient = await createServiceRoleClient();
      const body = await request.clone().json().catch(() => ({}));
      if (body.reorderId) {
        await serviceClient
          .from('reorder_history')
          .update({ status: 'sf_pending' })
          .eq('id', body.reorderId);
      }
    } catch { /* best effort */ }

    return NextResponse.json({
      error: 'Salesforce order creation failed. Payment was successful — order will be reconciled manually.',
      sfError: err.message,
    }, { status: 500 });
  }
}
