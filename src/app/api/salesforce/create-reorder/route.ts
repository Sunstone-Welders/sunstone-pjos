// ============================================================================
// SF Create Reorder — src/app/api/salesforce/create-reorder/route.ts
// ============================================================================
// POST: Creates SF Opportunity (Quote Sent) + Quote + QuoteLineItems, syncs
//       the Quote, waits for Avalara tax calc, returns totals for charging.
//       Does NOT create Orders — SF handles that when Opp moves to Closed Won.
// PATCH: Finalize — moves Opportunity to Closed Won after payment succeeds.
//        SF's native sync pipeline creates the Order automatically.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase, createServiceRoleClient } from '@/lib/supabase/server';
import { sfQuery, sfCreate, sfUpdate, sfGet } from '@/lib/salesforce';
import { buildSfSkuFromItemName, extractChainNameFromItemName } from '@/lib/sf-product-match';

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Audit field helpers ─────────────────────────────────────────────────────
// Studio_Created__c / Studio_Modified__c are custom checkboxes on SF objects.
// If they don't exist or aren't writable, we retry without them.

async function sfCreateWithAudit(objectType: string, fields: Record<string, any>): Promise<string> {
  try {
    return await sfCreate(objectType, { ...fields, Studio_Created__c: true, Studio_Modified__c: true });
  } catch (err: any) {
    if (err.message?.includes('Studio_')) {
      console.warn(`[SF Audit] Studio fields not available on ${objectType} — creating without them`);
      return await sfCreate(objectType, fields);
    }
    throw err;
  }
}

async function sfUpdateWithAudit(objectType: string, id: string, fields: Record<string, any>): Promise<void> {
  try {
    await sfUpdate(objectType, id, { ...fields, Studio_Modified__c: true });
  } catch (err: any) {
    if (err.message?.includes('Studio_')) {
      console.warn(`[SF Audit] Studio_Modified__c not available on ${objectType} — updating without it`);
      await sfUpdate(objectType, id, fields);
    } else {
      throw err;
    }
  }
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
    const { reorderId, contactId: requestContactId, shippingMethod, estimatedTax, estimatedShipping } = body;

    if (!reorderId) {
      return NextResponse.json({ error: 'Missing reorderId' }, { status: 400 });
    }

    const serviceClient = await createServiceRoleClient();

    // Load reorder + tenant
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

    const sfAccountId = tenant?.sf_account_id;

    if (!sfAccountId) {
      return NextResponse.json({ error: 'No Salesforce account linked. Match your account first.' }, { status: 400 });
    }

    // ── Resolve ContactId — query by email if missing/wrong ─────────────
    let contactId = requestContactId || null;
    if (!contactId && user.email) {
      try {
        const emailClean = (user.email || '').replace(/'/g, "\\'");
        const acctClean = sfAccountId.replace(/'/g, "\\'");
        const contacts = await sfQuery(
          `SELECT Id FROM Contact WHERE Email = '${emailClean}' AND AccountId = '${acctClean}' LIMIT 1`
        );
        if (contacts.length > 0) {
          contactId = (contacts[0] as any).Id;
          console.log(`[SF Reorder] Resolved contactId by email: ${contactId}`);
        } else {
          // Fall back to first Contact on Account
          const fallback = await sfQuery(
            `SELECT Id FROM Contact WHERE AccountId = '${acctClean}' LIMIT 1`
          );
          if (fallback.length > 0) {
            contactId = (fallback[0] as any).Id;
            console.log(`[SF Reorder] Fell back to first contact: ${contactId}`);
          }
        }
      } catch (err) {
        console.warn('[SF Reorder] Contact lookup failed:', err);
      }
    }

    // ── Match SF Product2 records ──────────────────────────────────────
    const items = reorder.items as any[];

    // Build a map of item index -> matched SF Product2
    const sfProductByItem = new Map<number, any>();

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      let sfProd: any = null;

      // Strategy 1: Build SF SKU from product+variant title
      const sfSku = buildSfSkuFromItemName(item.name || '');
      if (sfSku) {
        const skuClean = sfSku.replace(/'/g, "\\'");
        const byName = await sfQuery(
          `SELECT Id, Name, ProductCode FROM Product2 WHERE Name = '${skuClean}' LIMIT 1`
        );
        if (byName.length > 0) {
          sfProd = byName[0];
          console.log(`[SF Reorder] SKU match: "${item.name}" -> ${sfSku} -> ${sfProd.Id}`);
        }
      }

      // Strategy 2: Fuzzy match on Product2.Name using chain name + material keywords
      if (!sfProd) {
        const chainName = extractChainNameFromItemName(item.name || '');
        if (chainName) {
          const chainClean = chainName.replace(/'/g, "\\'");
          const fuzzy = await sfQuery(
            `SELECT Id, Name, ProductCode FROM Product2 WHERE Name LIKE 'pj${chainClean}%' LIMIT 10`
          );
          if (fuzzy.length > 0) {
            if (sfSku) {
              const partial = fuzzy.find((p: any) => sfSku.startsWith(p.Name) || p.Name.startsWith(sfSku));
              sfProd = partial || fuzzy[0];
            } else {
              sfProd = fuzzy[0];
            }
            console.log(`[SF Reorder] Fuzzy match: "${item.name}" -> ${sfProd.Name} (${sfProd.Id})`);
          }
        }
      }

      // Strategy 3: Fall back to ProductCode match (Shopify numeric SKU)
      if (!sfProd && item.variant_id) {
        const varIdClean = (item.variant_id as string).replace(/'/g, "\\'");
        const byCode = await sfQuery(
          `SELECT Id, Name, ProductCode FROM Product2 WHERE ProductCode = '${varIdClean}' LIMIT 1`
        );
        if (byCode.length > 0) {
          sfProd = byCode[0];
          console.log(`[SF Reorder] ProductCode match: "${item.name}" -> ${sfProd.Name}`);
        }
      }

      // Strategy 4: Broad name search as last resort
      if (!sfProd) {
        const nameClean = (item.name || '').replace(/'/g, "\\'").split(' — ')[0].split(',')[0].trim();
        if (nameClean) {
          const broad = await sfQuery(
            `SELECT Id, Name, ProductCode FROM Product2 WHERE Name LIKE '%${nameClean}%' LIMIT 1`
          );
          if (broad.length > 0) {
            sfProd = broad[0];
            console.log(`[SF Reorder] Broad name match: "${item.name}" -> ${sfProd.Name}`);
          }
        }
      }

      if (sfProd) {
        sfProductByItem.set(i, sfProd);
      } else {
        console.warn(`[SF Reorder] No SF product match for: "${item.name}" (tried SKU: ${sfSku})`);
      }
    }

    // Get PricebookEntry IDs for all matched products
    const uniqueProductIds = [...new Set([...sfProductByItem.values()].map((p: any) => p.Id))];
    const pbeByProductId = new Map<string, any>();

    if (uniqueProductIds.length > 0) {
      const productIdList = uniqueProductIds.map((id) => `'${id}'`).join(',');
      const pricebookEntries = await sfQuery(
        `SELECT Id, Product2Id, UnitPrice FROM PricebookEntry WHERE Product2Id IN (${productIdList}) AND Pricebook2.IsStandard = true AND IsActive = true`
      );
      for (const pbe of pricebookEntries) {
        pbeByProductId.set((pbe as any).Product2Id, pbe);
      }
    }

    // Look up Standard Pricebook (required for Quote + Opportunity line items)
    const pricebooks = await sfQuery(
      `SELECT Id FROM Pricebook2 WHERE IsStandard = true LIMIT 1`
    );
    if (pricebooks.length === 0) {
      return NextResponse.json({ error: 'No Standard Pricebook found in Salesforce.' }, { status: 500 });
    }
    const standardPricebookId = (pricebooks[0] as any).Id;

    // ── Step 1: Create Opportunity (Quote Sent — NOT Closed Won until payment) ──
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Denver' });
    const oppName = `Studio Reorder — ${tenant?.name || 'Artist'} — ${today} — ${timeStr}`;

    const oppId = await sfCreateWithAudit('Opportunity', {
      Pricebook2Id: standardPricebookId,
      Name: oppName,
      AccountId: sfAccountId,
      StageName: 'Quote Sent',
      CloseDate: today,
      Amount: reorder.total_amount,
      LeadSource: 'Sunstone Studio',
      Industry__c: 'Permanent Jewelry',
      Description: `Sunstone Studio App Order — placed by ${tenant?.name || 'Artist'}`,
    });

    // ── Persist sf_opportunity_id immediately so the charge route can find it ──
    // The comprehensive update (tax, shipping, total, quote) happens at the end,
    // but this early write ensures the charge route never sees a null Opp ID.
    await serviceClient
      .from('reorder_history')
      .update({ sf_opportunity_id: oppId })
      .eq('id', reorderId);

    // Parse shipping from notes
    const noteParts = (reorder.notes || '').replace('Shipping to: ', '').split(', ');
    const shippingStreet = noteParts[0] || '';
    const shippingCity = noteParts[1] || '';
    const stateZip = (noteParts[2] || '').split(' ');
    const shippingState = stateZip[0] || '';
    const shippingPostalCode = stateZip[1] || '';

    // Map display shipping labels -> valid SF picklist values
    const SF_SHIPPING_MAP: Record<string, string> = {
      'UPS Ground': 'UPS Ground',
      'UPS Next Day Air': 'UPS Next Day Air',
      'Will Call / Pickup': 'Ship On Customer Account',
    };
    const sfShippingValue = shippingMethod ? SF_SHIPPING_MAP[shippingMethod] || null : null;
    const shippingNote = shippingMethod && !sfShippingValue
      ? `\nShipping method requested: ${shippingMethod}`
      : '';

    // ── Step 2: Create Quote (Accepted) ─────────────────────────────────────
    const quoteFields: Record<string, any> = {
      Name: `Q-${oppName}`,
      OpportunityId: oppId,
      Pricebook2Id: standardPricebookId,
      Status: 'Accepted',
      ShippingName: tenant?.name || '',
      ShippingStreet: shippingStreet,
      ShippingCity: shippingCity,
      ShippingState: shippingState,
      ShippingPostalCode: shippingPostalCode,
      ShippingCountry: 'US',
      BillingStreet: shippingStreet,
      BillingCity: shippingCity,
      BillingState: shippingState,
      BillingPostalCode: shippingPostalCode,
      BillingCountry: 'US',
      Description: `Auto-created from Sunstone Studio reorder${shippingNote}`,
      ...(sfShippingValue ? { Shipping_Method__c: sfShippingValue } : {}),
    };

    if (contactId) {
      quoteFields.ContactId = contactId;
    }

    // Try creating Quote — if Shipping_Method__c is rejected, retry without it
    let quoteId: string;
    try {
      quoteId = await sfCreateWithAudit('Quote', quoteFields);
    } catch (quoteErr: any) {
      if (sfShippingValue && quoteErr.message?.includes('Shipping_Method__c')) {
        console.warn(`[SF Reorder] Shipping_Method__c "${sfShippingValue}" rejected — retrying without it`);
        delete quoteFields.Shipping_Method__c;
        quoteFields.Description = `Auto-created from Sunstone Studio reorder\nShipping method requested: ${shippingMethod}`;
        quoteId = await sfCreateWithAudit('Quote', quoteFields);
      } else {
        throw quoteErr;
      }
    }

    // ── Step 3: Set ShippingHandling on Quote BEFORE line items + tax calc ──
    if (estimatedShipping > 0) {
      try {
        await sfUpdate('Quote', quoteId, { ShippingHandling: estimatedShipping });
        console.log(`[SF Reorder] Set Quote ShippingHandling=${estimatedShipping} (before tax calc)`);
      } catch (shErr: any) {
        console.warn('[SF Reorder] Could not set ShippingHandling on Quote:', shErr.message);
      }
    }

    // ── Step 4: Create QuoteLineItems ───────────────────────────────────────
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const sfProd = sfProductByItem.get(i);

      if (sfProd && pbeByProductId.has(sfProd.Id)) {
        const pbe = pbeByProductId.get(sfProd.Id);
        try {
          await sfCreateWithAudit('QuoteLineItem', {
            QuoteId: quoteId,
            PricebookEntryId: pbe.Id,
            Quantity: item.quantity,
            UnitPrice: item.unit_price,
          });
        } catch (qliErr: any) {
          // If audit fields fail on QuoteLineItem, sfCreateWithAudit already retries
          console.warn(`[SF Reorder] QuoteLineItem create issue: ${qliErr.message}`);
        }
      } else {
        console.warn(`[SF Reorder] Skipping line item — no PBE for: ${item.name} (Product2: ${sfProd?.Id || 'none'})`);
      }
    }

    // Update Opportunity Amount to match line item totals
    const lineItemTotal = items.reduce((sum, item, i) => {
      const sfProd = sfProductByItem.get(i);
      if (sfProd && pbeByProductId.has(sfProd.Id)) {
        return sum + (item.quantity * item.unit_price);
      }
      return sum;
    }, 0);
    await sfUpdateWithAudit('Opportunity', oppId, { Amount: lineItemTotal });

    // ── Step 5: Sync Quote -> Opportunity via SyncedQuoteId ─────────────────
    try {
      await sfUpdateWithAudit('Opportunity', oppId, { SyncedQuoteId: quoteId });
      console.log('[SF Reorder] Set SyncedQuoteId on Opportunity');
    } catch (syncErr: any) {
      console.warn('[SF Reorder] SyncedQuoteId failed — trying IsSyncing fallback:', syncErr.message);
      try {
        await sfUpdate('Quote', quoteId, { IsSyncing: true });
      } catch (isSyncErr: any) {
        console.warn('[SF Reorder] IsSyncing also failed — continuing without sync:', isSyncErr.message);
      }
    }

    // ── Step 6: Trigger tax recalculation ───────────────────────────────────
    try {
      await sfUpdate('Quote', quoteId, { Calculate_Tax__c: true });
      console.log('[SF Reorder] Triggered Calculate_Tax__c on Quote');
    } catch (taxTriggerErr: any) {
      // Calculate_Tax__c may not exist — Avalara may recalc on sync/address change
      console.warn('[SF Reorder] Calculate_Tax__c not available — Avalara may recalc via sync:', taxTriggerErr.message);
    }

    // ── Step 7: Wait for Avalara + sync ─────────────────────────────────────
    await sleep(5000);

    // ── Step 8: Read back Quote for final tax/shipping/total ────────────────
    let sfTax = Math.max(reorder.tax_amount || 0, estimatedTax || 0);
    let sfShipping = Math.max(reorder.shipping_amount || 0, estimatedShipping || 0);
    let sfGrandTotal = reorder.total_amount || 0;
    let sfQuoteNumber: string | null = null;

    try {
      const quote = await sfGet<any>('Quote', quoteId, [
        'Name', 'Tax', 'ShippingHandling', 'New_Grand_Total__c',
      ]);
      if (quote.Name) sfQuoteNumber = quote.Name;
      if (quote.Tax != null) sfTax = Math.max(sfTax, Number(quote.Tax));
      if (quote.ShippingHandling != null) sfShipping = Math.max(sfShipping, Number(quote.ShippingHandling));
      if (quote.New_Grand_Total__c != null) sfGrandTotal = Math.max(sfGrandTotal, Number(quote.New_Grand_Total__c));
    } catch (err) {
      console.warn('[SF Reorder] Could not re-read quote after sync:', err);
    }

    // Ensure grandTotal includes tax + shipping (SF may return subtotal-only)
    const computedTotal = lineItemTotal + sfTax + sfShipping;
    sfGrandTotal = Math.max(sfGrandTotal, computedTotal);

    // ── Update reorder_history with final totals (sf_opportunity_id was already written above) ──
    const { error: updateErr } = await serviceClient
      .from('reorder_history')
      .update({
        sf_opportunity_id: oppId,
        sf_quote_id: quoteId,
        sf_quote_number: sfQuoteNumber,
        tax_amount: sfTax,
        shipping_amount: sfShipping,
        total_amount: sfGrandTotal,
      })
      .eq('id', reorderId);

    if (updateErr) {
      console.error('[SF Reorder] Failed to update reorder_history with totals:', updateErr.message);
    }

    return NextResponse.json({
      success: true,
      opportunityId: oppId,
      quoteId,
      opportunityName: oppName,
      tax: sfTax,
      shipping: sfShipping,
      grandTotal: sfGrandTotal,
    });
  } catch (err: any) {
    console.error('[SF Create Reorder] Error:', err.message);
    console.error('[SF Create Reorder] Error data:', JSON.stringify(err.data || err));
    return NextResponse.json({
      error: 'Salesforce order creation failed.',
      sfError: err.message,
    }, { status: 500 });
  }
}

// ── PATCH: Finalize — move Opportunity to Closed Won after payment ──────────
// SF's native Opp -> Order sync pipeline creates the Order automatically.

export async function PATCH(request: NextRequest) {
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
    const { reorderId } = body;

    if (!reorderId) {
      return NextResponse.json({ error: 'Missing reorderId' }, { status: 400 });
    }

    const serviceClient = await createServiceRoleClient();

    const { data: reorder } = await serviceClient
      .from('reorder_history')
      .select('sf_opportunity_id')
      .eq('id', reorderId)
      .eq('tenant_id', member.tenant_id)
      .single();

    if (!reorder?.sf_opportunity_id) {
      return NextResponse.json({ error: 'No SF Opportunity to finalize' }, { status: 400 });
    }

    // Move Opportunity to Closed Won — SF handles Order creation automatically
    await sfUpdateWithAudit('Opportunity', reorder.sf_opportunity_id, {
      StageName: 'Closed Won',
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[SF Finalize] Error:', err);
    // Non-critical — Opp can be finalized manually
    return NextResponse.json({ success: true, warning: 'Could not move Opportunity to Closed Won' });
  }
}
