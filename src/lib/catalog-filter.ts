// ============================================================================
// Catalog Filter — src/lib/catalog-filter.ts
// ============================================================================
// Shared filter logic for Sunstone Shopify catalog products. Used by:
//   - ShopSunstoneCatalog.tsx (browse tab)
//   - inventory/page.tsx (product linking dropdown)
// Matches the ACTUAL Shopify productType values from the catalog.
// ============================================================================

// ── Included productType values (exact match, case-insensitive) ──────────

const INVENTORY_PRODUCT_TYPES = new Set([
  'permanent jewelry chain',
  'permanent jewelry connector',
  'permanent jewelry accessory',
  'jewelry supplies',
]);

// ── Excluded productType values (anything not in the inclusion set) ──────
// These are explicitly excluded even if they slip through title/tag checks.

const EXCLUDED_PRODUCT_TYPES = new Set([
  'permanent jewelry starter kit',
  'permanent jewelry welder',
  'permanent jewelry training',
  'argon gas',
  'laser engraving',
  'membership',
  'course',
  'jewelry welder',
  'starter kit',
  'power supply',
  'pulse arc welder',
  'rental welder',
  'zapp plus permanent jewelry welder',
  'elitecart - shipping insurance',
]);

// ── Excluded keywords in title ───────────────────────────────────────────

const EXCLUDED_TITLE_KEYWORDS = [
  'welder', 'equipment', 'training', 'course', 'class', 'starter kit',
  'kit', 'vinyl', 'covering', 'book', 'guide', 'gift card', 'apparel',
  'clothing', 'zapp', 'mpulse', 'orion', 'argon', 'gas tank', 'membership',
  'laser engrav', 'insurance', 'power supply', 'rental',
];

// ── Fallback keywords for blank-productType items (tags/title check) ─────

const INVENTORY_KEYWORDS = [
  'chain', 'connector', 'charm', 'jump ring', 'clasp', 'finding',
  'bead', 'pendant', 'wire', 'earring', 'bracelet', 'anklet',
  'necklace', 'ring', 'component', 'accessory', 'supply',
];

// ── Display names for collection pills ───────────────────────────────────

const DISPLAY_NAMES: Record<string, string> = {
  'Permanent Jewelry Chain': 'Chain',
  'Permanent Jewelry Connector': 'Connectors',
  'Permanent Jewelry Accessory': 'Accessories',
  'Jewelry Supplies': 'Supplies',
};

// ── Public API ───────────────────────────────────────────────────────────

/**
 * Returns true if the product is an inventory-relevant item
 * (chains, connectors, accessories, supplies, or blank-type with relevant tags).
 */
export function isInventoryProduct(product: {
  productType?: string | null;
  title?: string | null;
  tags?: string[];
}): boolean {
  const pType = (product.productType || '').trim();
  const pTypeLower = pType.toLowerCase();
  const title = (product.title || '').toLowerCase();

  // Reject by title keywords
  if (EXCLUDED_TITLE_KEYWORDS.some((kw) => title.includes(kw))) return false;

  // Reject by excluded productType
  if (pTypeLower && EXCLUDED_PRODUCT_TYPES.has(pTypeLower)) return false;

  // Accept by included productType
  if (INVENTORY_PRODUCT_TYPES.has(pTypeLower)) return true;

  // Blank productType — check tags and title for inventory keywords
  if (!pTypeLower || pTypeLower === 'other') {
    const tags = (product.tags || []).map((t) => t.toLowerCase());
    const allText = [...tags, title].join(' ');
    return INVENTORY_KEYWORDS.some((kw) => allText.includes(kw));
  }

  // Unknown productType — reject
  return false;
}

/**
 * Returns a short display name for collection pills.
 * e.g., "Permanent Jewelry Chain" → "Chain"
 */
export function getDisplayType(productType: string | null | undefined): string {
  if (!productType) return '';
  const display = DISPLAY_NAMES[productType];
  if (display) return display;

  // Fallback: capitalize first letter of each word
  return productType
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}
