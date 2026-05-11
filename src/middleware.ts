// src/middleware.ts
import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

// ── Custom domain hostname cache (in-memory, 5-minute TTL) ──────────────────
// This runs on every request, so the DB lookup must be cached.
// Edge Runtime forbids the full Supabase service-role client, so we use a
// direct PostgREST fetch with the service-role key.

interface CacheEntry {
  slug: string | null; // null = hostname not found
  ts: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const domainCache = new Map<string, CacheEntry>();

/** Known hostnames that belong to the platform itself (never custom domains) */
function isPlatformHost(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname.startsWith('localhost:') ||
    hostname === 'sunstonepj.app' ||
    hostname.endsWith('.sunstonepj.app') ||
    hostname.endsWith('.vercel.app') ||
    hostname === '127.0.0.1' ||
    hostname.startsWith('127.0.0.1:')
  );
}

/** Look up slug for a custom domain. Uses PostgREST REST API directly (Edge-safe). */
async function lookupCustomDomain(hostname: string): Promise<string | null> {
  // Check cache first
  const cached = domainCache.get(hostname);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.slug;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return null; // Can't look up — fall through to normal routing
  }

  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/tenants?custom_domain=eq.${encodeURIComponent(hostname)}&custom_domain_status=eq.active&select=slug&limit=1`,
      {
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
        },
      }
    );

    if (!res.ok) {
      // Don't cache errors — retry next time
      return null;
    }

    const rows = await res.json();
    const slug = rows?.[0]?.slug ?? null;

    // Cache the result (even negative lookups, to avoid repeated DB hits)
    domainCache.set(hostname, { slug, ts: Date.now() });
    return slug;
  } catch {
    // Network error — fail open (don't block the request)
    return null;
  }
}

// ── Middleware ────────────────────────────────────────────────────────────────

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (pathname.startsWith('/styleguide')) {
    return;
  }

  // ── Custom domain routing ────────────────────────────────────────────────
  // If the hostname isn't a platform host, check if it's a custom storefront
  // domain. If so, rewrite the root path to /studio/[slug] so the visitor
  // sees the storefront content under their own domain.
  const hostname = request.headers.get('host')?.split(':')[0] || '';
  if (hostname && !isPlatformHost(request.headers.get('host') || '')) {
    const slug = await lookupCustomDomain(hostname);
    if (slug) {
      // Root path → serve the storefront page
      if (pathname === '/' || pathname === '') {
        const url = request.nextUrl.clone();
        url.pathname = `/studio/${slug}`;
        return NextResponse.rewrite(url);
      }
      // All other paths pass through normally — API routes, waiver pages,
      // static assets, etc. still need to work on the custom domain.
    } else {
      // Unknown hostname — redirect to main site
      return NextResponse.redirect(new URL('https://sunstonepj.app', request.url));
    }
  }

  return await updateSession(request);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
