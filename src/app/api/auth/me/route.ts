// ============================================================================
// Auth Check API — GET /api/auth/me
// ============================================================================
// Lightweight endpoint that reads the auth cookies via @supabase/ssr and
// reports whether the server can currently see a session.
//
// Used by the native login flow to confirm WKWebView has finished syncing
// freshly-set sb-* cookies into its cookie store before navigating — without
// this, the first post-login navigation can race ahead of the cookie write
// and the middleware redirects back to /auth/login.
// ============================================================================

export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return NextResponse.json(
    { authenticated: !!user },
    {
      headers: {
        // Never cache — the answer depends on per-request cookies
        'Cache-Control': 'no-store, max-age=0',
      },
    }
  );
}
