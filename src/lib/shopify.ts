// ============================================================================
// Shopify Admin API Client — src/lib/shopify.ts
// ============================================================================
// Connects to the Sunstone Shopify store (Admin API) via GraphQL.
// Auth: OAuth access token stored in Supabase `platform_settings` table.
// Powers: dashboard product cards, Sunny product knowledge, admin spotlight.
// ============================================================================

import { createServiceRoleClient } from '@/lib/supabase/server';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface SunstoneProduct {
  id: string;
  title: string;
  description: string;
  handle: string;
  productType: string;
  tags: string[];
  status: string;
  imageUrl: string | null;
  imageAlt: string | null;
  variants: {
    title: string;
    price: string;
    compareAtPrice: string | null;
    sku: string | null;
    inventoryQuantity: number | null;
  }[];
  url: string;
}

export interface CachedCatalog {
  products: SunstoneProduct[];
  discounts: any[];
  syncedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// OAuth Token Retrieval
// ─────────────────────────────────────────────────────────────────────────────

export async function getShopifyAccessToken(): Promise<string> {
  const db = await createServiceRoleClient();
  const { data, error } = await db
    .from('platform_settings')
    .select('value')
    .eq('key', 'shopify_access_token')
    .single();

  if (error || !data?.value) {
    throw new Error('Shopify access token not found. Complete OAuth flow at /api/shopify/auth');
  }
  return data.value;
}

// ─────────────────────────────────────────────────────────────────────────────
// GraphQL Helper
// ─────────────────────────────────────────────────────────────────────────────

const SHOPIFY_API_VERSION = '2026-01';

export async function shopifyAdminQuery(query: string, variables?: Record<string, any>) {
  const domain = process.env.SHOPIFY_STORE_DOMAIN;

  if (!domain) {
    throw new Error('SHOPIFY_STORE_DOMAIN environment variable not configured');
  }

  const token = await getShopifyAccessToken();

  const url = `https://${domain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;
  console.log('[Shopify] Request URL:', url);
  console.log('[Shopify] Query preview:', query.slice(0, 120).replace(/\s+/g, ' ').trim() + '...');

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token,
      },
      body: JSON.stringify({ query, variables }),
    });
  } catch (fetchErr: any) {
    console.error('[Shopify] Fetch failed (network/DNS):', fetchErr.message);
    throw new Error(`Shopify fetch failed: ${fetchErr.message}`);
  }

  console.log('[Shopify] Response status:', response.status, response.statusText);

  if (!response.ok) {
    let errorBody = '';
    try {
      errorBody = await response.text();
    } catch {
      errorBody = '(could not read response body)';
    }
    console.error('[Shopify] Non-OK response body:', errorBody.slice(0, 500));
    throw new Error(`Shopify API error ${response.status}: ${errorBody.slice(0, 200)}`);
  }

  const json = await response.json();

  if (json.errors) {
    console.error('[Shopify] GraphQL errors:', JSON.stringify(json.errors, null, 2));
    throw new Error(`Shopify GraphQL error: ${json.errors.map((e: any) => e.message).join('; ')}`);
  }

  console.log('[Shopify] Query succeeded, top-level keys:', Object.keys(json.data || {}));
  return json.data;
}

// ─────────────────────────────────────────────────────────────────────────────
// Fetch All Products (Admin API)
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchAllProducts(): Promise<SunstoneProduct[]> {
  const domain = process.env.SHOPIFY_STORE_DOMAIN;
  const products: SunstoneProduct[] = [];
  let cursor: string | null = null;
  let hasNextPage = true;
  let page = 0;

  while (hasNextPage) {
    page++;
    const afterClause = cursor ? `, after: "${cursor}"` : '';
    const query = `{
      products(first: 50${afterClause}) {
        pageInfo { hasNextPage }
        edges {
          cursor
          node {
            id
            title
            description
            handle
            productType
            tags
            status
            images(first: 3) {
              edges {
                node {
                  url
                  altText
                }
              }
            }
            variants(first: 10) {
              edges {
                node {
                  id
                  title
                  sku
                  price
                  compareAtPrice
                  inventoryQuantity
                }
              }
            }
          }
        }
      }
    }`;

    console.log(`[Shopify] Fetching products page ${page}${cursor ? ` (cursor: ${cursor.slice(0, 20)}...)` : ''}`);
    const data = await shopifyAdminQuery(query);
    const edges = data.products.edges;
    console.log(`[Shopify] Page ${page}: ${edges.length} products returned`);

    for (const edge of edges) {
      const node = edge.node;
      const firstImage = node.images?.edges?.[0]?.node;

      products.push({
        id: node.id,
        title: node.title,
        description: node.description || '',
        handle: node.handle,
        productType: node.productType || '',
        tags: node.tags || [],
        status: node.status || 'ACTIVE',
        imageUrl: firstImage?.url || null,
        imageAlt: firstImage?.altText || null,
        variants: (node.variants?.edges || []).map((v: any) => ({
          title: v.node.title,
          price: v.node.price || '0',
          compareAtPrice: v.node.compareAtPrice || null,
          sku: v.node.sku || null,
          inventoryQuantity: v.node.inventoryQuantity ?? null,
        })),
        url: `https://${domain}/products/${node.handle}`,
      });
    }

    hasNextPage = data.products.pageInfo.hasNextPage;
    if (edges.length > 0) {
      cursor = edges[edges.length - 1].cursor;
    } else {
      hasNextPage = false;
    }
  }

  console.log(`[Shopify] Total products fetched: ${products.length}`);
  return products;
}

// ─────────────────────────────────────────────────────────────────────────────
// Fetch Products by Collection (Admin API)
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchProductsByCollection(collectionHandle: string): Promise<SunstoneProduct[]> {
  const domain = process.env.SHOPIFY_STORE_DOMAIN;

  const query = `{
    collectionByHandle(handle: "${collectionHandle}") {
      products(first: 100) {
        edges {
          node {
            id
            title
            description
            handle
            productType
            tags
            status
            images(first: 3) {
              edges {
                node {
                  url
                  altText
                }
              }
            }
            variants(first: 10) {
              edges {
                node {
                  id
                  title
                  sku
                  price
                  compareAtPrice
                  inventoryQuantity
                }
              }
            }
          }
        }
      }
    }
  }`;

  const data = await shopifyAdminQuery(query);
  const edges = data.collectionByHandle?.products?.edges || [];

  return edges.map((edge: any) => {
    const node = edge.node;
    const firstImage = node.images?.edges?.[0]?.node;
    return {
      id: node.id,
      title: node.title,
      description: node.description || '',
      handle: node.handle,
      productType: node.productType || '',
      tags: node.tags || [],
      status: node.status || 'ACTIVE',
      imageUrl: firstImage?.url || null,
      imageAlt: firstImage?.altText || null,
      variants: (node.variants?.edges || []).map((v: any) => ({
        title: v.node.title,
        price: v.node.price || '0',
        compareAtPrice: v.node.compareAtPrice || null,
        sku: v.node.sku || null,
        inventoryQuantity: v.node.inventoryQuantity ?? null,
      })),
      url: `https://${domain}/products/${node.handle}`,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Get Cached Catalog (reads from sunstone_catalog_cache)
// ─────────────────────────────────────────────────────────────────────────────

export async function getCachedCatalog(): Promise<CachedCatalog | null> {
  try {
    const db = await createServiceRoleClient();

    const { data: cache } = await db
      .from('sunstone_catalog_cache')
      .select('products, discounts, synced_at, expires_at')
      .limit(1)
      .single();

    if (!cache) return null;

    const isExpired = new Date(cache.expires_at) <= new Date();

    // If expired, trigger a background sync (fire-and-forget)
    if (isExpired) {
      fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL ? '' : ''}/api/shopify/sync`, {
        method: 'GET',
      }).catch(() => {});
    }

    // Return cached data even if stale — better than nothing
    return {
      products: (cache.products as SunstoneProduct[]) || [],
      discounts: (cache.discounts as any[]) || [],
      syncedAt: cache.synced_at,
    };
  } catch {
    // Table may not exist yet
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Format Catalog for AI Prompt (used by Sunny mentor)
// ─────────────────────────────────────────────────────────────────────────────

export function formatCatalogForPrompt(catalog: CachedCatalog): string {
  const { products } = catalog;
  if (products.length === 0) return '';

  // Group products by type
  const groups: Record<string, SunstoneProduct[]> = {};
  for (const p of products) {
    const type = p.productType || 'Other';
    if (!groups[type]) groups[type] = [];
    groups[type].push(p);
  }

  const lines: string[] = ['## Sunstone Product Catalog (Current)\n'];
  let tokenEstimate = 0;
  const TOKEN_LIMIT = 2000;

  // Collect sale items (compareAtPrice > price)
  const saleItems: { product: SunstoneProduct; salePrice: string; originalPrice: string }[] = [];

  for (const [type, prods] of Object.entries(groups)) {
    lines.push(`### ${type}`);
    for (const p of prods) {
      const price = p.variants[0]?.price ? `$${p.variants[0].price}` : '';
      const desc = p.description
        ? p.description.split(/[.!?]/)[0].trim().slice(0, 80)
        : '';
      const line = `- ${p.title}${price ? ` — ${price}` : ''}${desc ? ` — ${desc}` : ''}\n  URL: ${p.url}`;
      const lineTokens = Math.ceil(line.length / 4);

      if (tokenEstimate + lineTokens > TOKEN_LIMIT) {
        lines.push('  (... additional products available)');
        break;
      }

      lines.push(line);
      tokenEstimate += lineTokens;

      // Check if any variant is on sale
      for (const v of p.variants) {
        if (v.compareAtPrice && parseFloat(v.compareAtPrice) > parseFloat(v.price)) {
          saleItems.push({ product: p, salePrice: v.price, originalPrice: v.compareAtPrice });
          break;
        }
      }
    }
    lines.push('');

    if (tokenEstimate > TOKEN_LIMIT) break;
  }

  // Sale items detected via compareAtPrice
  if (saleItems.length > 0) {
    lines.push('### Items Currently On Sale');
    for (const { product, salePrice, originalPrice } of saleItems) {
      lines.push(`- ${product.title} — $${salePrice} (was $${originalPrice})`);
    }
    lines.push('');
  }

  lines.push('When recommending products, always include the specific product name, price, and URL so the artist can order directly.');

  return lines.join('\n');
}
