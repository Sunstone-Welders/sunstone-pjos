// src/lib/demo/seed-mid.ts
// Spark Studio — mid-tier persona seed data
// 38 products, 95 clients, 11 events, ~375 sales, gift cards, warranties, party

import {
  uuid, pick, pickN, randomAmount, randomInt, randomPhone, randomEmail,
  uniqueName, daysAgo, daysFromNow, randomTimeOnDay, eventTime, randomBirthday,
  resetNameTracker, weightedPick,
  CHAIN_NAMES_GOLD, CHAIN_NAMES_SILVER, CHAIN_NAMES_ROSE, CHARM_NAMES,
  PRODUCT_TYPE_NAMES, VENUE_NAMES, CITIES,
  type SeedData, type TenantOverrides,
} from './seed-helpers';

export function generateMidSeed(tenantId: string): { data: SeedData; tenantOverrides: TenantOverrides } {
  resetNameTracker();

  // ── Tax Profiles ────────────────────────────────────────────────────────
  const taxProfile = {
    id: uuid(), tenant_id: tenantId, name: 'Default Tax', rate: 0.0775,
    is_default: true, created_at: daysAgo(240), updated_at: daysAgo(240),
  };

  // ── Product Types ───────────────────────────────────────────────────────
  const productTypes = PRODUCT_TYPE_NAMES.map((name, i) => ({
    id: uuid(), tenant_id: tenantId, name,
    default_inches: name === 'Bracelet' ? 7 : name === 'Anklet' ? 10 : name === 'Ring' ? 3 : name === 'Necklace' ? 18 : 12,
    jump_rings_required: name === 'Hand Chain' ? 3 : 2,
    sort_order: i, is_active: true, is_default: true,
    created_at: daysAgo(240), updated_at: daysAgo(240),
  }));

  // ── Inventory Items (38: 24 chains + 14 charms) ────────────────────────
  const chains = [
    ...CHAIN_NAMES_GOLD.slice(0, 10).map((name) => ({
      name, material: '14K Gold Fill', costRange: [4.00, 6.50] as [number, number],
    })),
    ...CHAIN_NAMES_SILVER.slice(0, 8).map((name) => ({
      name, material: 'Sterling Silver', costRange: [2.00, 4.00] as [number, number],
    })),
    ...CHAIN_NAMES_ROSE.slice(0, 6).map((name) => ({
      name, material: '14K Rose Gold Fill', costRange: [4.50, 7.00] as [number, number],
    })),
  ];

  const inventoryItems = [
    ...chains.map((c) => ({
      id: uuid(), tenant_id: tenantId, name: c.name, type: 'chain' as const,
      material: c.material, supplier: 'Sunstone Supply', supplier_id: null, sku: null,
      unit: 'ft', cost_per_unit: randomAmount(...c.costRange),
      sell_price: null, // per_product pricing uses chain_product_prices
      quantity_on_hand: randomAmount(20, 60), reorder_threshold: 8,
      is_active: true, notes: null, pricing_mode: 'per_product', pricing_tier_id: null,
      created_at: daysAgo(240), updated_at: daysAgo(randomInt(1, 60)),
    })),
    ...CHARM_NAMES.slice(0, 14).map((name) => ({
      id: uuid(), tenant_id: tenantId, name, type: 'charm' as const,
      material: pick(['14K Gold Fill', 'Sterling Silver', '14K Rose Gold Fill']),
      supplier: 'Sunstone Supply', supplier_id: null, sku: null,
      unit: 'each', cost_per_unit: randomAmount(2.00, 8.00),
      sell_price: randomAmount(15, 35), quantity_on_hand: randomInt(10, 40),
      reorder_threshold: 5, is_active: true, notes: null,
      pricing_mode: null, pricing_tier_id: null,
      created_at: daysAgo(240), updated_at: daysAgo(randomInt(1, 60)),
    })),
  ];

  const chainItems = inventoryItems.filter((i) => i.type === 'chain');
  const charmItems = inventoryItems.filter((i) => i.type === 'charm');

  // ── Chain Product Prices (per-product pricing) ──────────────────────────
  const chainProductPrices: any[] = [];
  for (const chain of chainItems) {
    for (const pt of productTypes) {
      const basePrice = chain.material.includes('Gold')
        ? (pt.name === 'Necklace' ? randomAmount(5.50, 8.00) : randomAmount(45, 85))
        : (pt.name === 'Necklace' ? randomAmount(4.00, 6.00) : randomAmount(35, 65));
      chainProductPrices.push({
        id: uuid(), inventory_item_id: chain.id, product_type_id: pt.id,
        tenant_id: tenantId, sell_price: basePrice,
        default_inches: pt.default_inches, is_active: true,
        created_at: daysAgo(240), updated_at: daysAgo(randomInt(1, 60)),
      });
    }
  }

  // ── Clients (95 over 8 months) ─────────────────────────────────────────
  const clients = Array.from({ length: 95 }, () => {
    const { first, last } = uniqueName();
    const createdDaysAgo = randomInt(5, 240);
    return {
      id: uuid(), tenant_id: tenantId,
      first_name: first, last_name: last,
      email: Math.random() > 0.2 ? randomEmail(first, last) : null,
      phone: randomPhone(),
      notes: Math.random() > 0.7 ? pick([
        'Loves dainty chains', 'Prefers gold', 'Birthday party host',
        'Referred by friend', 'VIP repeat customer', 'Allergic to nickel',
      ]) : null,
      birthday: Math.random() > 0.5 ? randomBirthday() : null,
      last_visit_at: daysAgo(randomInt(1, createdDaysAgo)),
      unread_messages: 0, last_message_at: null,
      created_at: daysAgo(createdDaysAgo), updated_at: daysAgo(randomInt(0, createdDaysAgo)),
    };
  });

  const clientPhoneNumbers = clients.map((c) => ({
    id: uuid(), tenant_id: tenantId, client_id: c.id,
    phone: c.phone, phone_normalized: c.phone,
    label: 'mobile', is_primary: true, created_at: c.created_at,
  }));

  // ── Client Tags ─────────────────────────────────────────────────────────
  const tagNames = ['VIP', 'Birthday Month', 'Party Host', 'Gold Lover'];
  const clientTagAssignments: any[] = [];
  const vipClients = pickN(clients, 15);
  for (const c of vipClients) {
    clientTagAssignments.push({
      id: uuid(), client_id: c.id, tag_id: null, // tags table not seeded here, but tag_id will be set
      assigned_at: c.created_at,
    });
  }
  // Note: We won't seed client_tags table since we're doing tag_assignments
  // The real system uses tag_id FK — we'll skip tag assignments for simplicity
  // and just populate the clients with rich notes instead

  // ── Events (10 past, 1 upcoming) ───────────────────────────────────────
  const eventDays = [220, 195, 170, 145, 120, 95, 75, 55, 30, 10];
  const pastEvents = eventDays.map((d) => ({
    id: uuid(), tenant_id: tenantId, name: pick(VENUE_NAMES),
    description: null, location: pick(CITIES),
    start_time: eventTime(d, randomInt(9, 12)),
    end_time: eventTime(d, randomInt(15, 19)),
    booth_fee: randomAmount(75, 300), tax_profile_id: taxProfile.id,
    is_active: false, notes: null, selected_chain_ids: null,
    created_at: daysAgo(d + 14), updated_at: daysAgo(d),
  }));

  const upcomingEvent = {
    id: uuid(), tenant_id: tenantId, name: pick(VENUE_NAMES),
    description: null, location: pick(CITIES),
    start_time: daysFromNow(8), end_time: daysFromNow(8),
    booth_fee: 200, tax_profile_id: taxProfile.id,
    is_active: true, notes: null, selected_chain_ids: null,
    created_at: daysAgo(21), updated_at: daysAgo(3),
  };

  const events = [...pastEvents, upcomingEvent];

  // ── Sales (~375 across 10 past events, growing over time) ──────────────
  const sales: any[] = [];
  const saleItems: any[] = [];
  const payMethods = ['stripe_link', 'cash', 'venmo', 'card_external'] as const;
  const payWeights = [55, 20, 15, 10];

  for (let ei = 0; ei < pastEvents.length; ei++) {
    const event = pastEvents[ei];
    // Growth: earlier events have fewer sales, later events have more
    const baseSales = 25 + Math.floor(ei * 2.5);
    const salesCount = randomInt(baseSales, baseSales + 10);
    const eventClients = pickN(clients, Math.min(salesCount, clients.length));

    for (let s = 0; s < salesCount; s++) {
      const client = eventClients[s % eventClients.length];
      const chain = pick(chainItems);
      const pt = pick(productTypes);
      const cpp = chainProductPrices.find(
        (p) => p.inventory_item_id === chain.id && p.product_type_id === pt.id
      );
      const isNecklace = pt.name === 'Necklace';
      const inches = isNecklace ? randomInt(16, 22) : pt.default_inches;
      const basePrice = isNecklace && cpp ? cpp.sell_price * inches : (cpp?.sell_price || randomAmount(40, 70));

      const hasCharm = Math.random() > 0.7;
      const charm = hasCharm ? pick(charmItems) : null;

      let subtotal = basePrice;
      const items: any[] = [{
        id: uuid(), sale_id: '', tenant_id: tenantId,
        inventory_item_id: chain.id, name: chain.name,
        quantity: 1, unit_price: basePrice, discount_type: null,
        discount_value: 0, line_total: basePrice,
        warranty_amount: 0, product_type_id: pt.id,
        chain_inches: inches, cost_snapshot: chain.cost_per_unit * (inches / 12),
        created_at: randomTimeOnDay(eventDays[ei]),
      }];

      if (charm) {
        subtotal += charm.sell_price!;
        items.push({
          id: uuid(), sale_id: '', tenant_id: tenantId,
          inventory_item_id: charm.id, name: charm.name,
          quantity: 1, unit_price: charm.sell_price, discount_type: null,
          discount_value: 0, line_total: charm.sell_price,
          warranty_amount: 0, product_type_id: null,
          chain_inches: null, cost_snapshot: charm.cost_per_unit,
          created_at: randomTimeOnDay(eventDays[ei]),
        });
      }

      // Warranty add-on (10% of sales)
      const hasWarranty = Math.random() > 0.9;
      const warrantyAmt = hasWarranty ? 15 : 0;
      subtotal += warrantyAmt;

      const taxAmt = Math.round(subtotal * taxProfile.rate * 100) / 100;
      const tipAmt = Math.random() > 0.4 ? Math.round(subtotal * randomAmount(0.10, 0.25) * 100) / 100 : 0;
      const feeRate = 0.015;
      const feeAmt = Math.round(subtotal * feeRate * 100) / 100;
      const total = Math.round((subtotal + taxAmt + tipAmt) * 100) / 100;

      const saleId = uuid();
      items.forEach((item) => { item.sale_id = saleId; });

      const pmIdx = weightedIdx(payWeights);
      const pm = payMethods[pmIdx];

      sales.push({
        id: saleId, tenant_id: tenantId, event_id: event.id,
        client_id: client.id, subtotal, discount_amount: 0,
        tax_amount: taxAmt, tip_amount: tipAmt,
        platform_fee_amount: feeAmt, total,
        payment_method: pm,
        payment_status: 'completed', payment_provider: pm === 'stripe_link' ? 'stripe' : null,
        payment_provider_id: null, platform_fee_rate: feeRate, fee_handling: 'absorb',
        warranty_amount: warrantyAmt, refund_status: 'none', refund_amount: 0,
        refunded_at: null, refunded_by: null,
        stripe_checkout_session_id: null, stripe_payment_intent_id: null,
        platform_fee_collected: pm === 'stripe_link' ? feeAmt : 0,
        gift_card_id: null, gift_card_amount_applied: 0,
        party_request_id: null, party_rsvp_id: null,
        status: 'completed', receipt_email: client.email,
        receipt_phone: client.phone, receipt_sent_at: null,
        notes: null, completed_by: null,
        created_at: randomTimeOnDay(eventDays[ei]),
        updated_at: randomTimeOnDay(eventDays[ei]),
      });

      saleItems.push(...items);
    }
  }

  // ── Gift Cards (4) ─────────────────────────────────────────────────────
  const giftCards = Array.from({ length: 4 }, (_, i) => {
    const amount = pick([25, 50, 75, 100]);
    const used = i < 2 ? randomAmount(10, amount) : 0;
    const purchaser = pick(clients);
    return {
      id: uuid(), tenant_id: tenantId,
      code: `SPARK${String(1000 + i)}`,
      amount, remaining_balance: Math.round((amount - used) * 100) / 100,
      status: used >= amount ? 'fully_redeemed' : 'active',
      purchaser_name: `${purchaser.first_name} ${purchaser.last_name}`,
      purchaser_email: purchaser.email, purchaser_phone: purchaser.phone,
      recipient_name: null, recipient_email: null, recipient_phone: null,
      personal_message: null, delivery_method: 'print', delivered_at: null,
      payment_method: 'stripe_link', sale_id: null,
      purchased_at: daysAgo(randomInt(30, 120)), expires_at: daysFromNow(365),
      cancelled_at: null, created_at: daysAgo(randomInt(30, 120)),
      updated_at: daysAgo(randomInt(1, 30)),
    };
  });

  const giftCardRedemptions = giftCards
    .filter((gc) => gc.remaining_balance < gc.amount)
    .map((gc) => ({
      id: uuid(), gift_card_id: gc.id, sale_id: sales[randomInt(0, sales.length - 1)]?.id || null,
      tenant_id: tenantId, amount: gc.amount - gc.remaining_balance,
      redeemed_at: daysAgo(randomInt(5, 30)), redeemed_by: null,
      created_at: daysAgo(randomInt(5, 30)),
    }));

  // ── Warranties (8) ─────────────────────────────────────────────────────
  const warrantySales = pickN(sales.filter(s => s.warranty_amount > 0), 8);
  const warranties = warrantySales.map((sale) => ({
    id: uuid(), tenant_id: tenantId, sale_id: sale.id,
    sale_item_id: saleItems.find(si => si.sale_id === sale.id)?.id || null,
    client_id: sale.client_id,
    scope: 'per_invoice' as const, amount: 15,
    coverage_terms: '1-year warranty against breakage for permanent jewelry welds',
    status: 'active' as const,
    purchased_at: sale.created_at, expires_at: daysFromNow(randomInt(180, 365)),
    photo_url: null, notes: null,
    created_at: sale.created_at, updated_at: sale.created_at,
  }));

  // 2 warranty claims
  const warrantyClaims = warranties.slice(0, 2).map((w) => ({
    id: uuid(), warranty_id: w.id, tenant_id: tenantId,
    claim_date: daysAgo(randomInt(5, 30)),
    description: pick(['Chain broke at weld point', 'Clasp came undone', 'Chain snapped during activity']),
    repair_details: pick(['Re-welded at original join', 'Replaced broken segment', null]),
    status: pick(['completed', 'submitted']) as string,
    resolved_at: Math.random() > 0.5 ? daysAgo(randomInt(1, 5)) : null,
    resolved_by: null, notes: null,
    created_at: daysAgo(randomInt(5, 30)), updated_at: daysAgo(randomInt(0, 5)),
  }));

  // ── Party Request (1 confirmed) ────────────────────────────────────────
  const partyHost = pick(clients);
  const partyRequests = [{
    id: uuid(), tenant_id: tenantId, client_id: partyHost.id,
    status: 'confirmed',
    host_name: `${partyHost.first_name} ${partyHost.last_name}`,
    host_email: partyHost.email, host_phone: partyHost.phone,
    preferred_date: daysFromNow(12), preferred_time: '6:00 PM',
    location: 'Host Home', estimated_guests: 8,
    occasion: 'Girls Night', message: 'So excited for this!', notes: null,
    event_id: null,
    deposit_amount: 50, deposit_status: 'paid', deposit_paid_at: daysAgo(7),
    stripe_checkout_session_id: null, stripe_payment_intent_id: null,
    minimum_guarantee: 400, total_revenue: 0, total_sales: 0,
    host_reward_amount: 0, host_reward_redeemed: false, host_reward_redeemed_at: null,
    created_at: daysAgo(14), updated_at: daysAgo(3),
  }];

  return {
    data: {
      taxProfiles: [taxProfile],
      productTypes,
      pricingTiers: [],
      inventoryItems,
      chainProductPrices,
      clients,
      clientPhoneNumbers,
      clientTagAssignments: [], // Skipping tag assignments to avoid FK issues
      events,
      sales,
      saleItems,
      giftCards,
      giftCardRedemptions,
      warranties,
      warrantyClaims,
      partyRequests,
    },
    tenantOverrides: {
      pricing_mode: 'per_product',
      subscription_tier: 'pro',
      subscription_status: 'active',
      trial_ends_at: null,
      default_tax_rate: 0.0775,
      warranty_enabled: true,
      warranty_per_item_default: 0,
      warranty_per_invoice_default: 15,
      warranty_duration_days: 365,
      platform_fee_percent: 1.5,
      fee_handling: 'absorb',
    },
  };
}

function weightedIdx(weights: number[]): number {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return i;
  }
  return weights.length - 1;
}
