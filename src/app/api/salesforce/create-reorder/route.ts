// ============================================================================
// SF Create Reorder — src/app/api/salesforce/create-reorder/route.ts
// ============================================================================
// POST: Creates SF Opportunity (Quote Sent stage) + Quote + QuoteLineItems,
// syncs the Quote. Called BEFORE payment — Opp is moved to Closed Won
// only after payment succeeds via the /finalize endpoint.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase, createServiceRoleClient } from '@/lib/supabase/server';
import { sfQuery, sfCreate, sfUpdate, sfGet } from '@/lib/salesforce';
import { buildSfSkuFromItemName, extractChainNameFromItemName } from '@/lib/sf-product-match';

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
    const { reorderId, contactId: requestContactId, shippingMethod } = body;

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

    // Build a map of item index → matched SF Product2
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
          console.log(`[SF Reorder] SKU match: "${item.name}" → ${sfSku} → ${sfProd.Id}`);
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
            // If we have the built SKU, try partial match
            if (sfSku) {
              const partial = fuzzy.find((p: any) => sfSku.startsWith(p.Name) || p.Name.startsWith(sfSku));
              sfProd = partial || fuzzy[0];
            } else {
              sfProd = fuzzy[0];
            }
            console.log(`[SF Reorder] Fuzzy match: "${item.name}" → ${sfProd.Name} (${sfProd.Id})`);
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
          console.log(`[SF Reorder] ProductCode match: "${item.name}" → ${sfProd.Name}`);
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
            console.log(`[SF Reorder] Broad name match: "${item.name}" → ${sfProd.Name}`);
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

    // Create Opportunity (Quote Sent — NOT Closed Won until payment succeeds)
    const today = new Date().toISOString().split('T')[0];
    const oppName = `Studio Reorder — ${tenant?.name || 'Artist'} — ${today}`;

    const oppId = await sfCreate('Opportunity', {
      Pricebook2Id: standardPricebookId,
      Name: oppName,
      AccountId: sfAccountId,
      StageName: 'Quote Sent',
      CloseDate: today,
      Amount: reorder.total_amount,
      Direct_Order__c: true,
      LeadSource: 'Sunstone Studio',
      Industry__c: 'Permanent Jewelry',
      Description: `Sunstone Studio App Order — placed by ${tenant?.name || 'Artist'}`,
    });

    // Parse shipping from notes
    const noteParts = (reorder.notes || '').replace('Shipping to: ', '').split(', ');
    const shippingStreet = noteParts[0] || '';
    const shippingCity = noteParts[1] || '';
    const stateZip = (noteParts[2] || '').split(' ');
    const shippingState = stateZip[0] || '';
    const shippingPostalCode = stateZip[1] || '';

    // Map display shipping labels → valid SF picklist values
    const SF_SHIPPING_MAP: Record<string, string> = {
      'UPS Ground': 'UPS Ground',
      'UPS Next Day Air': 'UPS Next Day Air',
      'Will Call / Pickup': 'Ship On Customer Account',
    };
    const sfShippingValue = shippingMethod ? SF_SHIPPING_MAP[shippingMethod] || null : null;
    // Methods not in the SF picklist go into Description instead
    const shippingNote = shippingMethod && !sfShippingValue
      ? `\nShipping method requested: ${shippingMethod}`
      : '';

    // Create Quote (Accepted) — include ContactId for validation rules
    const quoteFields: Record<string, any> = {
      Name: `Q-${oppName}`,
      OpportunityId: oppId,
      Pricebook2Id: standardPricebookId,
      Status: 'Accepted',
      Direct_Order__c: true,
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

    // Add ContactId if provided (required for Closed Won validation)
    if (contactId) {
      quoteFields.ContactId = contactId;
    }

    // Try creating Quote — if Shipping_Method__c is rejected, retry without it
    let quoteId: string;
    try {
      quoteId = await sfCreate('Quote', quoteFields);
    } catch (quoteErr: any) {
      if (sfShippingValue && quoteErr.message?.includes('Shipping_Method__c')) {
        console.warn(`[SF Reorder] Shipping_Method__c "${sfShippingValue}" rejected — retrying without it`);
        delete quoteFields.Shipping_Method__c;
        quoteFields.Description = `Auto-created from Sunstone Studio reorder\nShipping method requested: ${shippingMethod}`;
        quoteId = await sfCreate('Quote', quoteFields);
      } else {
        throw quoteErr;
      }
    }

    // Create QuoteLineItems
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const sfProd = sfProductByItem.get(i);

      if (sfProd && pbeByProductId.has(sfProd.Id)) {
        const pbe = pbeByProductId.get(sfProd.Id);
        await sfCreate('QuoteLineItem', {
          QuoteId: quoteId,
          PricebookEntryId: pbe.Id,
          Quantity: item.quantity,
          UnitPrice: item.unit_price,
        });
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
    await sfUpdate('Opportunity', oppId, { Amount: lineItemTotal });

    // Sync Quote → Opportunity via SyncedQuoteId (standard API approach)
    try {
      await sfUpdate('Opportunity', oppId, { SyncedQuoteId: quoteId });
      console.log('[SF Reorder] Set SyncedQuoteId on Opportunity');
    } catch (syncErr: any) {
      console.warn('[SF Reorder] SyncedQuoteId failed — trying IsSyncing fallback:', syncErr.message);
      // Fallback: set IsSyncing directly on the Quote
      try {
        await sfUpdate('Quote', quoteId, { IsSyncing: true });
      } catch (isSyncErr: any) {
        console.warn('[SF Reorder] IsSyncing also failed (permission issue) — continuing without sync:', isSyncErr.message);
      }
    }

    // Wait for sync (or fallback read), then read back tax/shipping
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

    // ── Create Order explicitly (IsSyncing workaround) ──────────────────
    // If IsSyncing fails, SF won't auto-create the Order from the Quote.
    // We create it directly so fulfillment can proceed.
    let sfOrderId: string | null = null;
    try {
      const orderId = await sfCreate('Order', {
        OpportunityId: oppId,
        AccountId: sfAccountId,
        Status: 'Draft',
        EffectiveDate: today,
        Pricebook2Id: standardPricebookId,
        ShippingStreet: shippingStreet,
        ShippingCity: shippingCity,
        ShippingState: shippingState,
        ShippingPostalCode: shippingPostalCode,
        ShippingCountry: 'US',
        Direct_Order__c: true,
        ...(sfShippingValue ? { Shipping_Method__c: sfShippingValue } : {}),
        Description: `Sunstone Studio App Order${shippingNote}`,
      });

      sfOrderId = orderId;
      console.log(`[SF Reorder] Created Order: ${orderId}`);

      // Create OrderItems from matched line items
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const sfProd = sfProductByItem.get(i);
        if (sfProd && pbeByProductId.has(sfProd.Id)) {
          const pbe = pbeByProductId.get(sfProd.Id);
          await sfCreate('OrderItem', {
            OrderId: orderId,
            Product2Id: sfProd.Id,
            PricebookEntryId: pbe.Id,
            Quantity: item.quantity,
            UnitPrice: item.unit_price,
          });
        }
      }

      console.log(`[SF Reorder] Created OrderItems for Order ${orderId}`);
    } catch (orderErr: any) {
      // Non-critical — the Opp + Quote already exist. Log and continue.
      console.warn('[SF Reorder] Could not create Order (non-critical):', orderErr.message);
    }

    // Update reorder_history with SF IDs (status stays pending_payment until charged)
    await serviceClient
      .from('reorder_history')
      .update({
        sf_opportunity_id: oppId,
        sf_quote_id: quoteId,
        ...(sfOrderId ? { sf_order_id: sfOrderId } : {}),
        tax_amount: sfTax,
        shipping_amount: sfShipping,
        total_amount: sfGrandTotal,
      })
      .eq('id', reorderId);

    return NextResponse.json({
      success: true,
      opportunityId: oppId,
      quoteId,
      orderId: sfOrderId,
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

// ── PATCH: Finalize — move Opportunity to Closed Won after payment ──────

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
      .select('sf_opportunity_id, sf_order_id')
      .eq('id', reorderId)
      .eq('tenant_id', member.tenant_id)
      .single();

    if (!reorder?.sf_opportunity_id) {
      return NextResponse.json({ error: 'No SF Opportunity to finalize' }, { status: 400 });
    }

    // Move Opportunity to Closed Won
    await sfUpdate('Opportunity', reorder.sf_opportunity_id, {
      StageName: 'Closed Won',
    });

    // Try to activate the Order (Draft → Activated)
    if (reorder.sf_order_id) {
      try {
        await sfUpdate('Order', reorder.sf_order_id, { Status: 'Activated' });
        console.log(`[SF Finalize] Activated Order: ${reorder.sf_order_id}`);
      } catch (orderErr: any) {
        console.warn('[SF Finalize] Could not activate Order (non-critical):', orderErr.message);
      }
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[SF Finalize] Error:', err);
    // Non-critical — Opp can be finalized manually
    return NextResponse.json({ success: true, warning: 'Could not move Opportunity to Closed Won' });
  }
}
