// ============================================================================
// Auth Set-Session API — POST /api/auth/set-session
// ============================================================================
// Server-side cookie establishment for the native (Capacitor / WKWebView) shell.
//
// WKWebView's JS cookie store (document.cookie writes) syncs asynchronously
// into the HTTP cookie store, so the first navigation after login can race
// ahead of that sync and bounce the user back to /auth/login. Cookies set via
// HTTP Set-Cookie response headers, however, are available to subsequent
// requests immediately. This endpoint takes a (already-issued) access /
// refresh token pair and writes the Supabase session cookies via Set-Cookie
// so the next request — including RSC fetches — sees an authenticated user.
//
// Tokens are validated against the Supabase auth server before any cookies
// are written, so this endpoint cannot be used to mint a session out of
// forged JWTs.
// ============================================================================

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

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

  // Build a response we can attach Set-Cookie headers to.
  let response = NextResponse.json({ success: true });

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

  // Hand the tokens to Supabase. This populates the in-memory session and,
  // via the setAll() callback above, writes the sb-* cookies onto `response`.
  const { error: setError } = await supabase.auth.setSession({
    access_token,
    refresh_token,
  });

  if (setError) {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
  }

  // Verify the access token resolves to a real user (round-trips to the
  // Supabase auth server). This prevents accepting forged or expired JWTs.
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
  }

  return response;
}
