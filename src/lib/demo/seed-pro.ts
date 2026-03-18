// src/lib/demo/seed-pro.ts
// Golden Thread Co — power user persona seed data
// 72 products, 215 clients, 30 events, ~1300 sales, pricing tiers, full features

import {
  uuid, pick, pickN, randomAmount, randomInt, randomPhone, randomEmail,
  uniqueName, daysAgo, daysFromNow, randomTimeOnDay, eventTime, randomBirthday,
  resetNameTracker, weightedPick,
  CHAIN_NAMES_GOLD, CHAIN_NAMES_SILVER, CHAIN_NAMES_ROSE, CHARM_NAMES,
  PRODUCT_TYPE_NAMES, VENUE_NAMES, CITIES,
  type SeedData, type TenantOverrides,
} from './seed-helpers';

export function generateProSeed(tenantId: string): { data: SeedData; tenantOverrides: TenantOverrides } {
  resetNameTracker();

  // ── Tax Profiles ────────────────────────────────────────────────────────
  const taxDefault = {
    id: uuid(), tenant_id: tenantId, name: 'Default Tax', rate: 0.08,
    is_default: true, created_at: daysAgo(730), updated_at: daysAgo(730),
  };
  const taxEvent = {
    id: uuid(), tenant_id: tenantId, name: 'Event Tax (Out of State)', rate: 0.065,
    is_default: false, created_at: daysAgo(400), updated_at: daysAgo(400),
  };

  // ── Pricing Tiers (3) ──────────────────────────────────────────────────
  const pricingTiers = [
    {
      id: uuid(), tenant_id: tenantId, name: 'Standard',
      bracelet_price: 25, anklet_price: 28, ring_price: 15,
      necklace_price_per_inch: 2.00, hand_chain_price: 32,
      sort_order: 0, is_active: true,
      created_at: daysAgo(730), updated_at: daysAgo(60),
    },
    {
      id: uuid(), tenant_id: tenantId, name: 'Premium',
      bracelet_price: 30, anklet_price: 35, ring_price: 18,
      necklace_price_per_inch: 2.75, hand_chain_price: 40,
      sort_order: 1, is_active: true,
      created_at: daysAgo(730), updated_at: daysAgo(60),
    },
    {
      id: uuid(), tenant_id: tenantId, name: 'Luxe',
      bracelet_price: 40, anklet_price: 46, ring_price: 25,
      necklace_price_per_inch: 3.75, hand_chain_price: 52,
      sort_order: 2, is_active: true,
      created_at: daysAgo(730), updated_at: daysAgo(60),
    },
  ];

  // ── Product Types ───────────────────────────────────────────────────────
  const productTypes = PRODUCT_TYPE_NAMES.map((name, i) => ({
    id: uuid(), tenant_id: tenantId, name,
    default_inches: name === 'Bracelet' ? 7 : name === 'Anklet' ? 10 : name === 'Ring' ? 3 : name === 'Necklace' ? 18 : 12,
    jump_rings_required: name === 'Hand Chain' ? 3 : 2,
    sort_order: i, is_active: true, is_default: true,
    created_at: daysAgo(730), updated_at: daysAgo(730),
  }));

  // ── Inventory Items (72: 12 gold + 13 silver + 11 rose + 8 luxe chains + 8 jump rings + 20 charms)
  const allGold = CHAIN_NAMES_GOLD.map((name) => ({
    name, material: '14K Gold Fill', costRange: [4.00, 7.00] as [number, number],
    tier: pricingTiers[1], // Premium
  }));
  const allSilver = CHAIN_NAMES_SILVER.map((name) => ({
    name, material: 'Sterling Silver', costRange: [2.00, 4.50] as [number, number],
    tier: pricingTiers[0], // Standard
  }));
  const allRose = CHAIN_NAMES_ROSE.map((name) => ({
    name, material: '14K Rose Gold Fill', costRange: [4.50, 7.50] as [number, number],
    tier: pricingTiers[1], // Premium
  }));

  // Add some "Luxe" variants
  const luxeChains = [
    { name: 'Diamond Cut Cable 14K Gold Fill', material: '14K Gold Fill', costRange: [8.00, 12.00] as [number, number], tier: pricingTiers[2] },
    { name: 'Miami Cuban 14K Gold Fill', material: '14K Gold Fill', costRange: [9.00, 14.00] as [number, number], tier: pricingTiers[2] },
    { name: 'Diamond Cut Rope 14K Gold Fill', material: '14K Gold Fill', costRange: [7.50, 11.00] as [number, number], tier: pricingTiers[2] },
    { name: 'Flat Herringbone 14K Gold Fill', material: '14K Gold Fill', costRange: [8.50, 13.00] as [number, number], tier: pricingTiers[2] },
    { name: 'Diamond Cut Cable Sterling Silver', material: 'Sterling Silver', costRange: [5.00, 8.00] as [number, number], tier: pricingTiers[2] },
    { name: 'Miami Cuban Sterling Silver', material: 'Sterling Silver', costRange: [5.50, 9.00] as [number, number], tier: pricingTiers[2] },
    { name: 'Diamond Cut Cable 14K Rose Gold Fill', material: '14K Rose Gold Fill', costRange: [8.00, 12.00] as [number, number], tier: pricingTiers[2] },
    { name: 'Miami Cuban 14K Rose Gold Fill', material: '14K Rose Gold Fill', costRange: [9.00, 14.00] as [number, number], tier: pricingTiers[2] },
  ];

  const chainDefs = [...allGold, ...allSilver, ...allRose, ...luxeChains];

  const chainInventory = chainDefs.map((c) => ({
    id: uuid(), tenant_id: tenantId, name: c.name, type: 'chain' as const,
    material: c.material, supplier: 'Sunstone Supply', supplier_id: null, sku: null,
    unit: 'ft', cost_per_unit: randomAmount(...c.costRange),
    sell_price: 0, quantity_on_hand: randomAmount(25, 80), reorder_threshold: 10,
    is_active: true, notes: null, pricing_mode: 'per_product', pricing_tier_id: c.tier.id,
    created_at: daysAgo(730), updated_at: daysAgo(randomInt(1, 90)),
  }));

  const charmInventory = CHARM_NAMES.map((name) => ({
    id: uuid(), tenant_id: tenantId, name, type: 'charm' as const,
    material: pick(['14K Gold Fill', 'Sterling Silver', '14K Rose Gold Fill']),
    supplier: 'Sunstone Supply', supplier_id: null, sku: null,
    unit: 'each', cost_per_unit: randomAmount(2.00, 10.00),
    sell_price: randomAmount(18, 45), quantity_on_hand: randomInt(15, 50),
    reorder_threshold: 5, is_active: true, notes: null,
    pricing_mode: 'per_product', pricing_tier_id: null,
    created_at: daysAgo(730), updated_at: daysAgo(randomInt(1, 90)),
  }));

  const jumpRings = ['Jump Ring 14K Gold Fill', 'Jump Ring Sterling Silver',
    'Jump Ring 14K Rose Gold Fill', 'Jump Ring 20ga Gold', 'Jump Ring 20ga Silver',
    'Jump Ring 18ga Gold', 'Jump Ring 18ga Silver', 'Jump Ring 22ga Gold'].map((name) => ({
    id: uuid(), tenant_id: tenantId, name, type: 'jump_ring' as const,
    material: name.includes('Gold') ? '14K Gold Fill' : name.includes('Rose') ? '14K Rose Gold Fill' : 'Sterling Silver',
    supplier: 'Sunstone Supply', supplier_id: null, sku: null,
    unit: 'each', cost_per_unit: randomAmount(0.15, 0.50),
    sell_price: 0, quantity_on_hand: randomInt(200, 500), reorder_threshold: 50,
    is_active: true, notes: null, pricing_mode: 'per_product', pricing_tier_id: null,
    created_at: daysAgo(730), updated_at: daysAgo(randomInt(1, 90)),
  }));

  const inventoryItems = [...chainInventory, ...charmInventory, ...jumpRings];
  const chainItems = chainInventory;
  const charmItems = charmInventory;

  // ── Clients (215 over 2 years) ─────────────────────────────────────────
  const clients = Array.from({ length: 215 }, () => {
    const { first, last } = uniqueName();
    const createdDaysAgo = randomInt(3, 730);
    return {
      id: uuid(), tenant_id: tenantId,
      first_name: first, last_name: last,
      email: Math.random() > 0.1 ? randomEmail(first, last) : null,
      phone: randomPhone(),
      notes: Math.random() > 0.6 ? pick([
        'Loves dainty chains', 'Prefers gold over silver', 'Birthday party host',
        'Repeat customer — always brings friends', 'VIP — 5+ purchases',
        'Allergic to nickel', 'Prefers chunky styles', 'Rose gold fan',
        'Teacher — school event referral', 'Salon owner partnership',
        'Bride-to-be — wedding party booked', 'Instagram influencer',
        'First-time customer, very nervous', 'Corporate event planner',
      ]) : null,
      birthday: Math.random() > 0.4 ? randomBirthday() : null,
      last_visit_at: daysAgo(randomInt(1, Math.min(createdDaysAgo, 180))),
      unread_messages: 0, last_message_at: null,
      created_at: daysAgo(createdDaysAgo), updated_at: daysAgo(randomInt(0, Math.min(createdDaysAgo, 60))),
    };
  });

  const clientPhoneNumbers = clients.map((c) => ({
    id: uuid(), tenant_id: tenantId, client_id: c.id,
    phone: c.phone, phone_normalized: c.phone,
    label: 'mobile', is_primary: true, created_at: c.created_at,
  }));

  // ── Events (28 past, 2 upcoming) over 2 years ─────────────────────────
  const eventDaysAgo = [
    700, 670, 640, 610, 580, 550, 520, 490, 460, 430,
    400, 370, 340, 310, 280, 250, 220, 195, 170, 145,
    120, 100, 80, 60, 42, 25, 14, 5,
  ];

  const pastEvents = eventDaysAgo.map((d) => ({
    id: uuid(), tenant_id: tenantId, name: pick(VENUE_NAMES),
    description: null, location: pick(CITIES),
    start_time: eventTime(d, randomInt(9, 12)),
    end_time: eventTime(d, randomInt(15, 20)),
    booth_fee: randomAmount(100, 500), tax_profile_id: Math.random() > 0.8 ? taxEvent.id : taxDefault.id,
    is_active: false, notes: null, selected_chain_ids: null,
    created_at: daysAgo(d + 21), updated_at: daysAgo(d),
  }));

  const upcomingEvents = [
    {
      id: uuid(), tenant_id: tenantId, name: pick(VENUE_NAMES),
      description: null, location: pick(CITIES),
      start_time: daysFromNow(6), end_time: daysFromNow(6),
      booth_fee: 350, tax_profile_id: taxDefault.id,
      is_active: true, notes: null, selected_chain_ids: null,
      created_at: daysAgo(30), updated_at: daysAgo(5),
    },
    {
      id: uuid(), tenant_id: tenantId, name: pick(VENUE_NAMES),
      description: null, location: pick(CITIES),
      start_time: daysFromNow(20), end_time: daysFromNow(20),
      booth_fee: 250, tax_profile_id: taxDefault.id,
      is_active: true, notes: null, selected_chain_ids: null,
      created_at: daysAgo(14), updated_at: daysAgo(2),
    },
  ];

  const events = [...pastEvents, ...upcomingEvents];

  // ── Sales (~1300 across 28 past events with growth curve) ──────────────
  const sales: any[] = [];
  const saleItems: any[] = [];
  const payMethods = ['stripe_link', 'cash', 'venmo', 'card_external'] as const;
  const payWeights = [65, 15, 12, 8];

  for (let ei = 0; ei < pastEvents.length; ei++) {
    const event = pastEvents[ei];
    const daysAgoN = eventDaysAgo[ei];
    // Growth curve: starts at ~30, grows to ~60 per event
    const growthFactor = 30 + Math.floor((ei / pastEvents.length) * 35);
    const salesCount = randomInt(growthFactor, growthFactor + 12);
    const eventClients = pickN(clients, Math.min(salesCount + 10, clients.length));

    for (let s = 0; s < salesCount; s++) {
      const client = eventClients[s % eventClients.length];
      const chain = pick(chainItems);
      const pt = pick(productTypes);
      const tier = pricingTiers.find((t) => t.id === chain.pricing_tier_id) || pricingTiers[0];

      const isNecklace = pt.name === 'Necklace';
      const inches = isNecklace ? randomInt(16, 24) : pt.default_inches;

      // Calculate price from tier
      let basePrice: number;
      if (isNecklace) {
        basePrice = tier.necklace_price_per_inch * inches;
      } else if (pt.name === 'Bracelet') {
        basePrice = tier.bracelet_price;
      } else if (pt.name === 'Anklet') {
        basePrice = tier.anklet_price;
      } else if (pt.name === 'Ring') {
        basePrice = tier.ring_price;
      } else {
        basePrice = tier.hand_chain_price;
      }

      const hasCharm = Math.random() > 0.65;
      const charm = hasCharm ? pick(charmItems) : null;
      const hasSecondPiece = Math.random() > 0.85;

      let subtotal = basePrice;
      const items: any[] = [{
        id: uuid(), sale_id: '', tenant_id: tenantId,
        inventory_item_id: chain.id, name: chain.name,
        quantity: 1, unit_price: basePrice, discount_type: null,
        discount_value: 0, line_total: basePrice,
        warranty_amount: 0, product_type_id: pt.id,
        chain_inches: inches, cost_snapshot: chain.cost_per_unit * (inches / 12),
        created_at: randomTimeOnDay(daysAgoN),
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
          created_at: randomTimeOnDay(daysAgoN),
        });
      }

      if (hasSecondPiece) {
        const chain2 = pick(chainItems);
        const pt2 = pick(productTypes);
        const tier2 = pricingTiers.find((t) => t.id === chain2.pricing_tier_id) || pricingTiers[0];
        const isNecklace2 = pt2.name === 'Necklace';
        const inches2 = isNecklace2 ? randomInt(16, 22) : pt2.default_inches;
        let price2: number;
        if (isNecklace2) price2 = tier2.necklace_price_per_inch * inches2;
        else if (pt2.name === 'Bracelet') price2 = tier2.bracelet_price;
        else if (pt2.name === 'Anklet') price2 = tier2.anklet_price;
        else if (pt2.name === 'Ring') price2 = tier2.ring_price;
        else price2 = tier2.hand_chain_price;

        subtotal += price2;
        items.push({
          id: uuid(), sale_id: '', tenant_id: tenantId,
          inventory_item_id: chain2.id, name: chain2.name,
          quantity: 1, unit_price: price2, discount_type: null,
          discount_value: 0, line_total: price2,
          warranty_amount: 0, product_type_id: pt2.id,
          chain_inches: inches2, cost_snapshot: chain2.cost_per_unit * (inches2 / 12),
          created_at: randomTimeOnDay(daysAgoN),
        });
      }

      // Warranty (15% of sales for pro)
      const hasWarranty = Math.random() > 0.85;
      const warrantyAmt = hasWarranty ? 15 : 0;
      subtotal += warrantyAmt;

      const taxRate = event.tax_profile_id === taxEvent.id ? taxEvent.rate : taxDefault.rate;
      const taxAmt = Math.round(subtotal * taxRate * 100) / 100;
      const tipAmt = Math.random() > 0.35 ? Math.round(subtotal * randomAmount(0.10, 0.25) * 100) / 100 : 0;
      const feeRate = 0; // Business plan = 0%
      const total = Math.round((subtotal + taxAmt + tipAmt) * 100) / 100;

      const saleId = uuid();
      items.forEach((item) => { item.sale_id = saleId; });

      const pmIdx = weightedIdx(payWeights);
      const pm = payMethods[pmIdx];

      sales.push({
        id: saleId, tenant_id: tenantId, event_id: event.id,
        client_id: client.id, subtotal, discount_amount: 0,
        tax_amount: taxAmt, tip_amount: tipAmt,
        platform_fee_amount: 0, total,
        payment_method: pm,
        payment_status: 'completed', payment_provider: pm === 'stripe_link' ? 'stripe' : null,
        payment_provider_id: null, platform_fee_rate: feeRate, fee_handling: 'absorb',
        warranty_amount: warrantyAmt, refund_status: 'none', refund_amount: 0,
        refunded_at: null, refunded_by: null,
        stripe_checkout_session_id: null, stripe_payment_intent_id: null,
        platform_fee_collected: 0,
        gift_card_id: null, gift_card_amount_applied: 0,
        party_request_id: null, party_rsvp_id: null,
        status: 'completed', receipt_email: client.email,
        receipt_phone: client.phone, receipt_sent_at: null,
        notes: null, completed_by: null,
        created_at: randomTimeOnDay(daysAgoN),
        updated_at: randomTimeOnDay(daysAgoN),
      });

      saleItems.push(...items);
    }
  }

  // ── Gift Cards (12) ────────────────────────────────────────────────────
  const giftCards = Array.from({ length: 12 }, (_, i) => {
    const amount = pick([25, 50, 75, 100, 150]);
    const used = i < 5 ? randomAmount(10, amount) : i < 8 ? amount : 0;
    const purchaser = pick(clients);
    return {
      id: uuid(), tenant_id: tenantId,
      code: `GOLD${String(1000 + i)}`,
      amount, remaining_balance: Math.max(0, Math.round((amount - used) * 100) / 100),
      status: used >= amount ? 'fully_redeemed' : 'active',
      purchaser_name: `${purchaser.first_name} ${purchaser.last_name}`,
      purchaser_email: purchaser.email, purchaser_phone: purchaser.phone,
      recipient_name: null, recipient_email: null, recipient_phone: null,
      personal_message: null, delivery_method: pick(['sms', 'email', 'print']),
      delivered_at: null, payment_method: 'stripe_link', sale_id: null,
      purchased_at: daysAgo(randomInt(10, 300)), expires_at: daysFromNow(365),
      cancelled_at: null, created_at: daysAgo(randomInt(10, 300)),
      updated_at: daysAgo(randomInt(1, 60)),
    };
  });

  const giftCardRedemptions = giftCards
    .filter((gc) => gc.remaining_balance < gc.amount)
    .map((gc) => ({
      id: uuid(), gift_card_id: gc.id,
      sale_id: sales[randomInt(0, Math.min(sales.length - 1, 100))]?.id || null,
      tenant_id: tenantId, amount: gc.amount - gc.remaining_balance,
      redeemed_at: daysAgo(randomInt(3, 60)), redeemed_by: null,
      created_at: daysAgo(randomInt(3, 60)),
    }));

  // ── Warranties (35) ────────────────────────────────────────────────────
  const warrantySales = pickN(sales.filter(s => s.warranty_amount > 0), 35);
  const warranties = warrantySales.map((sale) => {
    const isExpired = Math.random() > 0.85;
    return {
      id: uuid(), tenant_id: tenantId, sale_id: sale.id,
      sale_item_id: saleItems.find(si => si.sale_id === sale.id)?.id || null,
      client_id: sale.client_id,
      scope: 'per_invoice' as const, amount: 15,
      coverage_terms: '1-year warranty against breakage for permanent jewelry welds',
      status: isExpired ? 'expired' : 'active' as string,
      purchased_at: sale.created_at,
      expires_at: isExpired ? daysAgo(randomInt(1, 60)) : daysFromNow(randomInt(30, 365)),
      photo_url: null, notes: null,
      created_at: sale.created_at, updated_at: sale.created_at,
    };
  });

  // 8 warranty claims
  const claimableWarranties = pickN(warranties, 8);
  const warrantyClaims = claimableWarranties.map((w) => {
    const status = pick(['submitted', 'in_progress', 'completed', 'completed', 'completed', 'denied']);
    return {
      id: uuid(), warranty_id: w.id, tenant_id: tenantId,
      claim_date: daysAgo(randomInt(3, 60)),
      description: pick([
        'Chain broke at weld point during exercise',
        'Clasp came undone — needs re-weld',
        'Chain snapped while sleeping',
        'Caught on clothing and broke',
        'Weld point separated after shower',
        'Link broke near the clasp',
      ]),
      repair_details: status === 'completed' ? pick([
        'Re-welded at original join point',
        'Replaced broken segment — rewelded',
        'Shortened and re-welded',
      ]) : null,
      status,
      resolved_at: status === 'completed' || status === 'denied' ? daysAgo(randomInt(1, 10)) : null,
      resolved_by: null, notes: null,
      created_at: daysAgo(randomInt(3, 60)), updated_at: daysAgo(randomInt(0, 10)),
    };
  });

  // ── Party Requests (3: 1 completed, 1 confirmed, 1 new) ───────────────
  const partyHosts = pickN(clients, 3);
  const partyRequests = [
    {
      id: uuid(), tenant_id: tenantId, client_id: partyHosts[0].id,
      status: 'completed',
      host_name: `${partyHosts[0].first_name} ${partyHosts[0].last_name}`,
      host_email: partyHosts[0].email, host_phone: partyHosts[0].phone,
      preferred_date: daysAgo(30), preferred_time: '7:00 PM',
      location: 'Host Home', estimated_guests: 12,
      occasion: 'Birthday Party', message: null, notes: 'Great group!',
      event_id: null,
      deposit_amount: 75, deposit_status: 'paid', deposit_paid_at: daysAgo(45),
      stripe_checkout_session_id: null, stripe_payment_intent_id: null,
      minimum_guarantee: 600, total_revenue: 840, total_sales: 12,
      host_reward_amount: 84, host_reward_redeemed: true, host_reward_redeemed_at: daysAgo(20),
      created_at: daysAgo(60), updated_at: daysAgo(25),
    },
    {
      id: uuid(), tenant_id: tenantId, client_id: partyHosts[1].id,
      status: 'confirmed',
      host_name: `${partyHosts[1].first_name} ${partyHosts[1].last_name}`,
      host_email: partyHosts[1].email, host_phone: partyHosts[1].phone,
      preferred_date: daysFromNow(14), preferred_time: '6:00 PM',
      location: 'Wine Bar Downtown', estimated_guests: 10,
      occasion: 'Bachelorette Party', message: 'Can we add champagne toast?', notes: null,
      event_id: null,
      deposit_amount: 100, deposit_status: 'paid', deposit_paid_at: daysAgo(10),
      stripe_checkout_session_id: null, stripe_payment_intent_id: null,
      minimum_guarantee: 500, total_revenue: 0, total_sales: 0,
      host_reward_amount: 0, host_reward_redeemed: false, host_reward_redeemed_at: null,
      created_at: daysAgo(21), updated_at: daysAgo(5),
    },
    {
      id: uuid(), tenant_id: tenantId, client_id: partyHosts[2].id,
      status: 'new',
      host_name: `${partyHosts[2].first_name} ${partyHosts[2].last_name}`,
      host_email: partyHosts[2].email, host_phone: partyHosts[2].phone,
      preferred_date: daysFromNow(30), preferred_time: '2:00 PM',
      location: 'Country Club', estimated_guests: 20,
      occasion: 'Corporate Team Building', message: 'Looking for a fun team activity!', notes: null,
      event_id: null,
      deposit_amount: 0, deposit_status: 'none', deposit_paid_at: null,
      stripe_checkout_session_id: null, stripe_payment_intent_id: null,
      minimum_guarantee: 0, total_revenue: 0, total_sales: 0,
      host_reward_amount: 0, host_reward_redeemed: false, host_reward_redeemed_at: null,
      created_at: daysAgo(3), updated_at: daysAgo(3),
    },
  ];

  return {
    data: {
      taxProfiles: [taxDefault, taxEvent],
      productTypes,
      pricingTiers,
      inventoryItems,
      chainProductPrices: [], // tier pricing, not per-product
      clients,
      clientPhoneNumbers,
      clientTagAssignments: [],
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
      pricing_mode: 'tier',
      subscription_tier: 'business',
      subscription_status: 'active',
      trial_ends_at: null,
      default_tax_rate: 0.08,
      warranty_enabled: true,
      warranty_per_item_default: 0,
      warranty_per_invoice_default: 15,
      warranty_duration_days: 365,
      platform_fee_percent: 0,
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
