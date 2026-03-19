// ============================================================================
// SF Product SKU Builder — src/lib/sf-product-match.ts
// ============================================================================
// Derives Salesforce Product2.Name SKUs from Shopify product + variant titles.
// SF SKU pattern: pj{chainName}{material}-{feet}
// Example: "Aspen Chain, 14/20 Gold Filled Yellow" + "5 Feet" → "pjaspen1420y-5"
// ============================================================================

/**
 * Material keyword → SF code mapping.
 * Order matters — more specific patterns checked first.
 */
const MATERIAL_MAP: [RegExp, string][] = [
  [/14\/?20\s*gold\s*filled?\s*rose/i, '1420r'],
  [/14k?\s*gold\s*filled?\s*rose/i, '1420r'],
  [/gold\s*filled?\s*rose/i, '1420r'],
  [/rose\s*gold/i, '1420r'],
  [/14\/?20\s*gold\s*filled?\s*yellow/i, '1420y'],
  [/14k?\s*gold\s*filled?\s*yellow/i, '1420y'],
  [/gold\s*filled?\s*yellow/i, '1420y'],
  [/14\/?20\s*gold\s*fill/i, '1420y'], // default gold filled = yellow
  [/14k?\s*gold\s*fill/i, '1420y'],
  [/gold\s*fill/i, '1420y'],
  [/sterling\s*silver/i, 'ss'],
];

/**
 * Extract feet count from a variant title string.
 * "5 Feet (60 inches)" → "5"
 * "15 Feet (180 inches)" → "15"
 * "50 Feet (600 inches)" → "50"
 * "1 Inch" or "Per Inch" → "inch"
 */
function extractFeet(variantTitle: string): string | null {
  // Match "X Feet" or "X Foot"
  const feetMatch = variantTitle.match(/(\d+)\s*(?:feet|foot|ft)/i);
  if (feetMatch) return feetMatch[1];

  // Per-inch products
  if (/per\s*inch|1\s*inch/i.test(variantTitle)) return 'inch';

  return null;
}

/**
 * Extract the chain name from a product title.
 * "Aspen Chain, 14/20 Gold Filled Yellow" → "aspen"
 * "Bryce Permanent Jewelry Chain, Sterling Silver" → "bryce"
 * "Brittany Chain, Gold Filled Rose" → "brittany"
 */
function extractChainName(productTitle: string): string | null {
  // Take the first word before "Chain", "Permanent", or a comma
  const match = productTitle.match(/^(\w+)\s*(?:chain|permanent|,)/i);
  if (match) return match[1].toLowerCase();

  // Fallback: just take the first word
  const firstWord = productTitle.split(/\s+/)[0];
  if (firstWord && firstWord.length > 1) return firstWord.toLowerCase();

  return null;
}

/**
 * Extract material code from the combined text (product title + variant title).
 */
function extractMaterial(text: string): string | null {
  for (const [pattern, code] of MATERIAL_MAP) {
    if (pattern.test(text)) return code;
  }
  return null;
}

/**
 * Build a Salesforce Product2 SKU from Shopify product + variant info.
 *
 * @param productTitle - Shopify product title (e.g. "Aspen Chain, 14/20 Gold Filled Yellow")
 * @param variantTitle - Shopify variant title (e.g. "5 Feet (60 inches)")
 * @returns SF SKU like "pjaspen1420y-5", or null if not a chain product
 */
export function buildSfSku(productTitle: string, variantTitle: string): string | null {
  const chainName = extractChainName(productTitle);
  if (!chainName) return null;

  // Combine both titles for material detection (material may be in either)
  const combinedText = `${productTitle} ${variantTitle}`;
  const material = extractMaterial(combinedText);
  if (!material) return null;

  const feet = extractFeet(variantTitle);
  if (!feet) return null;

  return `pj${chainName}${material}-${feet}`;
}

/**
 * Extract just the chain name from the item name for fuzzy matching.
 * "Aspen Chain, 14/20 Gold Filled Yellow — 5 Feet" → "aspen"
 */
export function extractChainNameFromItemName(itemName: string): string | null {
  // Item name format: "Product Title — Variant Title" or just "Product Title"
  const productTitle = itemName.split(' — ')[0];
  return extractChainName(productTitle);
}

/**
 * Build a SF SKU from the combined item name stored in reorder_history.
 * Item name format: "Aspen Chain, 14/20 Gold Filled Yellow — 5 Feet (60 inches)"
 */
export function buildSfSkuFromItemName(itemName: string): string | null {
  const parts = itemName.split(' — ');
  const productTitle = parts[0] || '';
  const variantTitle = parts[1] || parts[0] || '';
  return buildSfSku(productTitle, variantTitle);
}
