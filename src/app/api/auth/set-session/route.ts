// ============================================================================
// Auth Set-Session API — /api/auth/set-session
// ============================================================================
// Server-side cookie establishment for the native (Capacitor / WKWebView) shell.
//
// WKWebView's JS cookie store (document.cookie writes) syncs asynchronously
// into the HTTP cookie store, and Set-Cookie headers on fetch() responses do
// not reliably propagate into WKWebView's navigation cookie jar. The only
// reliable path to get session cookies in place before the next page load is
// a top-level navigation to an endpoint that returns a 302 with Set-Cookie
// headers — WKWebView applies those cookies before following the redirect.
//
// Two surfaces:
//   GET  — top-level navigation. Tokens come in via query string; the response
//          is a 302 to `redirect` (or /dashboard) with sb-* cookies attached.
//   POST — fetch()-friendly version, kept for parity / potential web callers.
//
// Tokens are validated against the Supabase auth server before any cookies
// are written, so this endpoint cannot be used to mint a session out of
// forged JWTs.
// ============================================================================

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

function safeRedirectPath(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/dashboard';
  return raw;
}

async function establishSession(
  request: NextRequest,
  access_token: string,
  refresh_token: string,
  successResponse: NextResponse,
): Promise<{ ok: true; response: NextResponse } | { ok: false }> {
  let response = successResponse;

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: any }[]) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { error: setError } = await supabase.auth.setSession({
    access_token,
    refresh_token,
  });
  if (setError) return { ok: false };

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return { ok: false };

  return { ok: true, response };
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const access_token = url.searchParams.get('access_token');
  const refresh_token = url.searchParams.get('refresh_token');
  const dest = safeRedirectPath(url.searchParams.get('redirect'));
  const isRecovery = url.searchParams.get('recovery') === '1';

  // When the login page calls us as a silent recovery attempt, signal failure
  // back via ?recovery=failed so the page can clear the stale tokens and
  // surface the login form instead of looping.
  const failureUrl = new URL('/auth/login', request.url);
  if (isRecovery) failureUrl.searchParams.set('recovery', 'failed');

  if (!access_token || !refresh_token) {
    return NextResponse.redirect(failureUrl);
  }

  const result = await establishSession(
    request,
    access_token,
    refresh_token,
    NextResponse.redirect(new URL(dest, request.url)),
  );

  if (!result.ok) {
    return NextResponse.redirect(failureUrl);
  }
  return result.response;
}

export async function POST(request: NextRequest) {
  let access_token: string;
  let refresh_token: string;
  try {
    const body = await request.json();
    access_token = body.access_token;
    refresh_token = body.refresh_token;
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  if (!access_token || !refresh_token) {
    return NextResponse.json(
      { error: 'access_token and refresh_token required' },
      { status: 400 }
    );
  }

  const result = await establishSession(
    request,
    access_token,
    refresh_token,
    NextResponse.json({ success: true }),
  );

  if (!result.ok) {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
  }
  return result.response;
}
