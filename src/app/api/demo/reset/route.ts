// src/app/api/demo/reset/route.ts
// POST endpoint — deletes all tenant data, re-inserts seed data

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getPersonaKey } from '@/lib/demo/personas';
import { generateNewbieSeed } from '@/lib/demo/seed-newbie';
import { generateMidSeed } from '@/lib/demo/seed-mid';
import { generateProSeed } from '@/lib/demo/seed-pro';

export async function POST(request: NextRequest) {
  // ── Security checks ─────────────────────────────────────────────────────
  if (process.env.DEMO_RESET_ENABLED !== 'true') {
    return NextResponse.json({ error: 'Demo system not enabled' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const tenantId = body.tenantId as string;

  if (!tenantId) {
    return NextResponse.json({ error: 'Missing tenantId' }, { status: 400 });
  }

  const personaKey = getPersonaKey(tenantId);
  if (!personaKey) {
    return NextResponse.json({ error: 'Not a demo tenant' }, { status: 403 });
  }

  const supabase = await createServiceRoleClient();

  try {
    // ── DELETE phase (FK order — children first) ────────────────────────────
    // Required: tables we seed — must succeed or throw
    const deleteTable = async (table: string) => {
      const { error } = await supabase
        .from(table)
        .delete()
        .eq('tenant_id', tenantId);
      if (error) {
        console.error(`[demo-reset] delete ${table}:`, error.message);
        throw new Error(`Failed to delete ${table}: ${error.message}`);
      }
    };

    // Best-effort: tables that may hold user-session data but aren't seeded
    // and may not exist in PostgREST schema cache — warn only
    const tryDeleteTable = async (table: string) => {
      const { error } = await supabase
        .from(table)
        .delete()
        .eq('tenant_id', tenantId);
      if (error) console.warn(`[demo-reset] skip ${table}:`, error.message);
    };

    // -- Children of sales (must delete before sales)
    await deleteTable('warranty_claims');
    await deleteTable('warranties');
    await deleteTable('gift_card_redemptions');
    await deleteTable('sale_items');
    await deleteTable('sales');
    // -- Other seeded tables' children / session data
    await tryDeleteTable('checkout_sessions');
    await deleteTable('gift_cards');
    await tryDeleteTable('waivers');
    await tryDeleteTable('queue_entries');
    await deleteTable('party_rsvps');
    await deleteTable('party_scheduled_messages');
    await deleteTable('party_requests');
    await tryDeleteTable('conversations');
    await deleteTable('client_phone_numbers');
    await tryDeleteTable('client_tag_assignments');
    await deleteTable('clients');
    await deleteTable('events');
    await tryDeleteTable('chain_product_prices');
    await tryDeleteTable('inventory_movements');
    await deleteTable('inventory_items');
    await deleteTable('pricing_tiers');
    await deleteTable('product_types');
    await deleteTable('tax_profiles');

    // ── GENERATE seed data ──────────────────────────────────────────────────
    const generator = personaKey === 'newbie'
      ? generateNewbieSeed
      : personaKey === 'mid'
        ? generateMidSeed
        : generateProSeed;

    const { data, tenantOverrides } = generator(tenantId);

    // ── INSERT phase (parents first) ────────────────────────────────────────
    const insertBatch = async (table: string, rows: any[]) => {
      if (!rows.length) return;
      // Insert in chunks of 500 for safety
      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500);
        const { error } = await supabase.from(table).insert(chunk);
        if (error) {
          console.error(`[demo-reset] insert ${table} (chunk ${i}):`, error.message);
          throw new Error(`Failed to insert ${table}: ${error.message}`);
        }
      }
    };

    const upsertBatch = async (table: string, rows: any[], onConflict: string) => {
      if (!rows.length) return;
      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500);
        const { error } = await supabase.from(table).upsert(chunk, { onConflict, ignoreDuplicates: true });
        if (error) {
          console.error(`[demo-reset] upsert ${table} (chunk ${i}):`, error.message);
          throw new Error(`Failed to upsert ${table}: ${error.message}`);
        }
      }
    };

    await insertBatch('tax_profiles', data.taxProfiles);
    // Upsert product_types — belt-and-suspenders against tenant_id+name unique constraint
    await upsertBatch('product_types', data.productTypes, 'tenant_id,name');
    await insertBatch('pricing_tiers', data.pricingTiers);
    await insertBatch('inventory_items', data.inventoryItems);
    await insertBatch('chain_product_prices', data.chainProductPrices);
    await insertBatch('clients', data.clients);
    await insertBatch('client_phone_numbers', data.clientPhoneNumbers);
    await insertBatch('client_tag_assignments', data.clientTagAssignments);
    await insertBatch('events', data.events);
    await insertBatch('sales', data.sales);
    await insertBatch('sale_items', data.saleItems);
    await insertBatch('gift_cards', data.giftCards);
    await insertBatch('gift_card_redemptions', data.giftCardRedemptions);
    await insertBatch('warranties', data.warranties);
    await insertBatch('warranty_claims', data.warrantyClaims);
    await insertBatch('party_requests', data.partyRequests);

    // ── UPDATE tenant settings ──────────────────────────────────────────────
    const { error: tenantError } = await supabase
      .from('tenants')
      .update({
        pricing_mode: tenantOverrides.pricing_mode,
        subscription_tier: tenantOverrides.subscription_tier,
        subscription_status: tenantOverrides.subscription_status,
        trial_ends_at: tenantOverrides.trial_ends_at,
        default_tax_rate: tenantOverrides.default_tax_rate,
        warranty_enabled: tenantOverrides.warranty_enabled,
        warranty_per_item_default: tenantOverrides.warranty_per_item_default,
        warranty_per_invoice_default: tenantOverrides.warranty_per_invoice_default,
        warranty_duration_days: tenantOverrides.warranty_duration_days,
        platform_fee_percent: tenantOverrides.platform_fee_percent,
        fee_handling: tenantOverrides.fee_handling,
      })
      .eq('id', tenantId);

    if (tenantError) {
      console.error('[demo-reset] tenant update:', tenantError.message);
    }

    return NextResponse.json({
      success: true,
      persona: personaKey,
      counts: {
        clients: data.clients.length,
        events: data.events.length,
        sales: data.sales.length,
        saleItems: data.saleItems.length,
        inventoryItems: data.inventoryItems.length,
        giftCards: data.giftCards.length,
        warranties: data.warranties.length,
        partyRequests: data.partyRequests.length,
      },
    });
  } catch (err: any) {
    console.error('[demo-reset] error:', err);
    return NextResponse.json(
      { error: err.message || 'Reset failed' },
      { status: 500 }
    );
  }
}
