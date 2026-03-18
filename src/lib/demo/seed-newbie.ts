// src/lib/demo/seed-newbie.ts
// Luna's Jewelry — newbie persona seed data
// 14 products, 28 clients, 4 events, ~90 sales, flat pricing

import {
  uuid, pick, pickN, randomAmount, randomInt, randomPhone, randomEmail,
  uniqueName, daysAgo, daysFromNow, randomTimeOnDay, eventTime, randomBirthday,
  resetNameTracker, CHAIN_NAMES_GOLD, CHAIN_NAMES_SILVER, PRODUCT_TYPE_NAMES,
  VENUE_NAMES, CITIES,
  type SeedData, type TenantOverrides,
} from './seed-helpers';

export function generateNewbieSeed(tenantId: string): { data: SeedData; tenantOverrides: TenantOverrides } {
  resetNameTracker();

  // ── Tax Profiles ────────────────────────────────────────────────────────
  const taxProfile = {
    id: uuid(), tenant_id: tenantId, name: 'Default Tax', rate: 0.0825,
    is_default: true, created_at: daysAgo(90), updated_at: daysAgo(90),
  };

  // ── Product Types ───────────────────────────────────────────────────────
  const productTypes = PRODUCT_TYPE_NAMES.map((name, i) => ({
    id: uuid(), tenant_id: tenantId, name,
    default_inches: name === 'Bracelet' ? 7 : name === 'Anklet' ? 10 : name === 'Ring' ? 3 : name === 'Necklace' ? 18 : 12,
    jump_rings_required: name === 'Hand Chain' ? 3 : 2,
    sort_order: i, is_active: true, is_default: true,
    created_at: daysAgo(90), updated_at: daysAgo(90),
  }));

  // ── Inventory Items (14 chains — flat pricing via sell_price) ──────────
  const goldChains = CHAIN_NAMES_GOLD.slice(0, 8).map((name) => ({
    id: uuid(), tenant_id: tenantId, name, type: 'chain',
    material: '14K Gold Fill', supplier: 'Sunstone Supply', supplier_id: null,
    sku: null, unit: 'ft', cost_per_unit: randomAmount(3.50, 6.00),
    sell_price: randomAmount(25, 45), quantity_on_hand: randomAmount(15, 40),
    reorder_threshold: 5, is_active: true, notes: null,
    pricing_mode: 'per_product', pricing_tier_id: null,
    created_at: daysAgo(90), updated_at: daysAgo(randomInt(1, 30)),
  }));

  const silverChains = CHAIN_NAMES_SILVER.slice(0, 6).map((name) => ({
    id: uuid(), tenant_id: tenantId, name, type: 'chain',
    material: 'Sterling Silver', supplier: 'Sunstone Supply', supplier_id: null,
    sku: null, unit: 'ft', cost_per_unit: randomAmount(2.00, 4.00),
    sell_price: randomAmount(20, 35), quantity_on_hand: randomAmount(15, 40),
    reorder_threshold: 5, is_active: true, notes: null,
    pricing_mode: 'per_product', pricing_tier_id: null,
    created_at: daysAgo(90), updated_at: daysAgo(randomInt(1, 30)),
  }));

  const inventoryItems = [...goldChains, ...silverChains];

  // ── Clients (28 over 90 days) ──────────────────────────────────────────
  const clients = Array.from({ length: 28 }, (_, i) => {
    const { first, last } = uniqueName();
    const createdDaysAgo = randomInt(5, 90);
    return {
      id: uuid(), tenant_id: tenantId,
      first_name: first, last_name: last,
      email: Math.random() > 0.3 ? randomEmail(first, last) : null,
      phone: randomPhone(),
      notes: null, birthday: Math.random() > 0.6 ? randomBirthday() : null,
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

  // ── Events (3 past, 1 upcoming) ────────────────────────────────────────
  const pastEventDefs = [
    { dayOffset: 75, name: pick(VENUE_NAMES), hours: 4 },
    { dayOffset: 45, name: pick(VENUE_NAMES), hours: 5 },
    { dayOffset: 14, name: pick(VENUE_NAMES), hours: 6 },
  ];

  const pastEvents = pastEventDefs.map((e) => ({
    id: uuid(), tenant_id: tenantId, name: e.name,
    description: null, location: pick(CITIES),
    start_time: eventTime(e.dayOffset, 10), end_time: eventTime(e.dayOffset, 10 + e.hours),
    booth_fee: randomAmount(50, 200), tax_profile_id: taxProfile.id,
    is_active: false, notes: null, selected_chain_ids: null,
    created_at: daysAgo(e.dayOffset + 7), updated_at: daysAgo(e.dayOffset),
  }));

  const upcomingEvent = {
    id: uuid(), tenant_id: tenantId, name: pick(VENUE_NAMES),
    description: null, location: pick(CITIES),
    start_time: daysFromNow(5), end_time: daysFromNow(5),
    booth_fee: 150, tax_profile_id: taxProfile.id,
    is_active: true, notes: null, selected_chain_ids: null,
    created_at: daysAgo(10), updated_at: daysAgo(2),
  };

  const events = [...pastEvents, upcomingEvent];

  // ── Sales (~90 across 3 past events, 1-2 items each) ──────────────────
  const sales: any[] = [];
  const saleItems: any[] = [];
  const payMethods = ['stripe_link', 'cash', 'venmo'] as const;
  const payWeights = [60, 25, 15];

  // Distribute ~30 sales per past event
  for (let ei = 0; ei < pastEvents.length; ei++) {
    const event = pastEvents[ei];
    const dayOffset = pastEventDefs[ei].dayOffset;
    const eventClients = pickN(clients, randomInt(22, 28));
    const salesCount = randomInt(25, 35);

    for (let s = 0; s < salesCount; s++) {
      const client = eventClients[s % eventClients.length];
      const chain = pick(inventoryItems);
      const pt = pick(productTypes);
      const isNecklace = pt.name === 'Necklace';
      const inches = isNecklace ? randomInt(16, 22) : pt.default_inches;

      const itemCount = Math.random() > 0.75 ? 2 : 1;
      let subtotal = 0;
      const items: any[] = [];

      for (let idx = 0; idx < itemCount; idx++) {
        const itemChain = idx === 0 ? chain : pick(inventoryItems);
        const itemPt = idx === 0 ? pt : pick(productTypes);
        const itemInches = itemPt.name === 'Necklace' ? randomInt(16, 22) : itemPt.default_inches;
        const lineTotal = itemChain.sell_price;
        subtotal += lineTotal;

        items.push({
          id: uuid(), sale_id: '', tenant_id: tenantId,
          inventory_item_id: itemChain.id, name: itemChain.name,
          quantity: 1, unit_price: lineTotal, discount_type: null,
          discount_value: 0, line_total: lineTotal,
          warranty_amount: 0, product_type_id: itemPt.id,
          chain_inches: itemInches, cost_snapshot: itemChain.cost_per_unit * (itemInches / 12),
          created_at: randomTimeOnDay(dayOffset),
        });
      }

      const taxAmt = Math.round(subtotal * taxProfile.rate * 100) / 100;
      const tipAmt = Math.random() > 0.5 ? Math.round(subtotal * randomAmount(0.10, 0.25) * 100) / 100 : 0;
      const feeRate = 0.015; // Pro trial = 1.5%
      const feeAmt = Math.round(subtotal * feeRate * 100) / 100;
      const total = Math.round((subtotal + taxAmt + tipAmt) * 100) / 100;

      const saleId = uuid();
      items.forEach((item) => { item.sale_id = saleId; });

      const pm = payMethods[weightedIdx(payWeights)];

      sales.push({
        id: saleId, tenant_id: tenantId, event_id: event.id,
        client_id: client.id, subtotal, discount_amount: 0,
        tax_amount: taxAmt, tip_amount: tipAmt,
        platform_fee_amount: feeAmt, total,
        payment_method: pm,
        payment_status: 'completed', payment_provider: pm === 'stripe_link' ? 'stripe' : null,
        payment_provider_id: null, platform_fee_rate: feeRate, fee_handling: 'absorb',
        warranty_amount: 0, refund_status: 'none', refund_amount: 0,
        refunded_at: null, refunded_by: null,
        stripe_checkout_session_id: null, stripe_payment_intent_id: null,
        platform_fee_collected: pm === 'stripe_link' ? feeAmt : 0,
        gift_card_id: null, gift_card_amount_applied: 0,
        party_request_id: null, party_rsvp_id: null,
        status: 'completed', receipt_email: client.email,
        receipt_phone: client.phone, receipt_sent_at: null,
        notes: null, completed_by: null,
        created_at: randomTimeOnDay(dayOffset),
        updated_at: randomTimeOnDay(dayOffset),
      });

      saleItems.push(...items);
    }
  }

  return {
    data: {
      taxProfiles: [taxProfile],
      productTypes,
      pricingTiers: [],
      inventoryItems,
      chainProductPrices: [],
      clients,
      clientPhoneNumbers,
      clientTagAssignments: [],
      events,
      sales,
      saleItems,
      giftCards: [],
      giftCardRedemptions: [],
      warranties: [],
      warrantyClaims: [],
      partyRequests: [],
    },
    tenantOverrides: {
      pricing_mode: 'flat',
      subscription_tier: 'pro',
      subscription_status: 'trialing',
      trial_ends_at: daysFromNow(20),
      default_tax_rate: 0.0825,
      warranty_enabled: false,
      warranty_per_item_default: 0,
      warranty_per_invoice_default: 0,
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
