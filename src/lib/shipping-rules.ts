// ============================================================================
// Shipping Rules — src/lib/shipping-rules.ts
// ============================================================================
// Pure utility for dynamic shipping options in the reorder flow.
// No Supabase imports — works client + server.
// ============================================================================

// ── Types ─────────────────────────────────────────────────────────────────

export type CartCategory = 'standard' | 'hazmat' | 'heavy' | 'hazmat_heavy';

export interface ShippingOption {
  value: string;
  label: string;
  note?: string;
  estimatedCost: number;
}

export interface ShippingRatesConfig {
  standard: {
    usps_priority: number;
    ups_ground: number;
    ups_2day: number;
    ups_next_day: number;
    will_call: number;
  };
  welder: {
    west: number;
    midwest: number;
    east: number;
    will_call: number;
  };
  argon_surcharge: number;
}

export type WelderZone = 'west' | 'midwest' | 'east';

// ── Default rates (fallback — matches migration seed) ─────────────────────

export const DEFAULT_RATES: ShippingRatesConfig = {
  standard: {
    usps_priority: 9.99,
    ups_ground: 15.84,
    ups_2day: 21.77,
    ups_next_day: 31.52,
    will_call: 0,
  },
  welder: {
    west: 25.00,
    midwest: 40.00,
    east: 60.00,
    will_call: 0,
  },
  argon_surcharge: 10.00,
};

// ── Zone map ──────────────────────────────────────────────────────────────

const WEST_STATES = new Set([
  'WA', 'OR', 'CA', 'NV', 'AZ', 'UT', 'ID', 'MT', 'WY', 'CO', 'NM', 'HI', 'AK',
]);

const MIDWEST_STATES = new Set([
  'ND', 'SD', 'NE', 'KS', 'MN', 'IA', 'MO', 'WI', 'IL', 'MI', 'IN', 'OH',
  'OK', 'TX', 'AR', 'LA',
]);

// East = everything else

// ── Cart category detection ───────────────────────────────────────────────

export function detectCartCategory(itemNames: string[]): CartCategory {
  const combined = itemNames.join(' ').toLowerCase();
  const hasHazmat = combined.includes('argon');
  const hasHeavy = combined.includes('welder') || combined.includes('zapp') || combined.includes('mpulse');

  if (hasHazmat && hasHeavy) return 'hazmat_heavy';
  if (hasHazmat) return 'hazmat';
  if (hasHeavy) return 'heavy';
  return 'standard';
}

// ── Zone lookup ───────────────────────────────────────────────────────────

export function getWelderZone(state: string): WelderZone {
  const s = state.toUpperCase().trim();
  if (WEST_STATES.has(s)) return 'west';
  if (MIDWEST_STATES.has(s)) return 'midwest';
  return 'east';
}

// ── Next-day cutoff check ─────────────────────────────────────────────────

export function isPastNextDayCutoff(): boolean {
  // 11:00 AM MST = 18:00 UTC (MST is UTC-7)
  const now = new Date();
  const utcHour = now.getUTCHours();
  return utcHour >= 18;
}

// ── Build shipping options ────────────────────────────────────────────────

export function getShippingOptions(
  category: CartCategory,
  state: string,
  rates?: ShippingRatesConfig | null,
): ShippingOption[] {
  const r = rates ?? DEFAULT_RATES;
  const zone = getWelderZone(state);

  if (category === 'standard') {
    const options: ShippingOption[] = [
      { value: 'USPS Priority Mail', label: 'USPS Priority Mail', estimatedCost: r.standard.usps_priority },
      { value: 'UPS Ground', label: 'UPS Ground', estimatedCost: r.standard.ups_ground },
      { value: 'UPS 2nd Day Air', label: 'UPS 2nd Day Air', estimatedCost: r.standard.ups_2day },
    ];

    // Next Day Air with cutoff note
    const nextDayOption: ShippingOption = {
      value: 'UPS Next Day Air',
      label: 'UPS Next Day Air',
      estimatedCost: r.standard.ups_next_day,
    };
    if (isPastNextDayCutoff()) {
      nextDayOption.note = 'Past 11 AM MST cutoff — ships next business day';
    }
    options.push(nextDayOption);

    options.push({ value: 'Will Call / Pickup', label: 'Will Call / Pickup', estimatedCost: r.standard.will_call });
    return options;
  }

  // Heavy, hazmat, or both — UPS Ground + Will Call only
  let groundCost: number;
  if (category === 'heavy') {
    groundCost = r.welder[zone];
  } else if (category === 'hazmat') {
    groundCost = r.standard.ups_ground + r.argon_surcharge;
  } else {
    // hazmat_heavy
    groundCost = r.welder[zone] + r.argon_surcharge;
  }

  const restrictionNote =
    category === 'hazmat' || category === 'hazmat_heavy'
      ? 'Argon is classified as hazardous — ground shipping only'
      : 'Heavy equipment requires ground freight shipping';

  return [
    {
      value: 'UPS Ground',
      label: 'UPS Ground',
      estimatedCost: Math.round(groundCost * 100) / 100,
      note: restrictionNote,
    },
    {
      value: 'Will Call / Pickup',
      label: 'Will Call / Pickup',
      estimatedCost: r.welder.will_call,
    },
  ];
}

// ── Processing disclaimer ─────────────────────────────────────────────────

export function getProcessingDisclaimer(shippingMethod: string): string {
  switch (shippingMethod) {
    case 'UPS Next Day Air':
      return 'Orders placed before 11 AM MST ship same day. After 11 AM ships next business day.';
    case 'UPS 2nd Day Air':
      return 'Orders typically ship within 1 business day.';
    case 'Will Call / Pickup':
      return 'Pick up at Sunstone HQ in Lehi, UT. We\u2019ll notify you when ready.';
    default:
      return 'Orders typically ship within 1\u20132 business days.';
  }
}
