// src/app/api/mentor/products/route.ts
// POST endpoint to search Sunstone's Shopify catalog via Admin API
// Used by the Sunny chat to display product cards inline

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { shopifyAdminQuery } from '@/lib/shopify';

const SEARCH_QUERY = `
  query searchProducts($query: String!) {
    products(first: 6, query: $query) {
      edges {
        node {
          id
          title
          description
          handle
          productType
          tags
          images(first: 1) {
            edges {
              node { url altText }
            }
          }
          variants(first: 5) {
            edges {
              node {
                id
                title
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
`;

export async function POST(request: NextRequest) {
  try {
    // Auth check
    const supabase = await createServerSupabase();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { query } = await request.json();
    if (!query || typeof query !== 'string') {
      return NextResponse.json({ error: 'Query required' }, { status: 400 });
    }

    const domain = process.env.SHOPIFY_STORE_DOMAIN;

    // Search via Admin API using shared client
    let data;
    try {
      data = await shopifyAdminQuery(SEARCH_QUERY, { query: query.trim() });
    } catch (err) {
      console.error('[Mentor Products] Shopify API error:', err);
      return NextResponse.json({
        products: [],
        fallback: true,
        message: 'Visit sunstonesupply.com for our full catalog',
      });
    }

    const edges = data?.products?.edges || [];

    const products = edges.map((edge: any) => {
      const node = edge.node;
      const image = node.images?.edges?.[0]?.node;
      const variants = node.variants?.edges || [];

      // Get price range from variants (Admin API returns price as simple string)
      const prices = variants.map((v: any) => parseFloat(v.node.price || '0'));
      const minPrice = Math.min(...prices);
      const maxPrice = Math.max(...prices);

      const priceDisplay = minPrice === maxPrice
        ? `$${minPrice.toFixed(2)}`
        : `$${minPrice.toFixed(2)} – $${maxPrice.toFixed(2)}`;

      return {
        id: node.id,
        title: node.title,
        handle: node.handle,
        description: node.description?.slice(0, 120) || '',
        price: priceDisplay,
        imageUrl: image?.url || null,
        imageAlt: image?.altText || node.title,
        url: `https://${domain}/products/${node.handle}`,
        available: variants.some((v: any) => (v.node.inventoryQuantity ?? 1) > 0),
      };
    });

    return NextResponse.json({ products, fallback: false });
  } catch (error) {
    console.error('[Mentor Products] Error:', error);
    return NextResponse.json({
      products: [],
      fallback: true,
      message: 'Visit sunstonesupply.com for our full catalog',
    });
  }
}
