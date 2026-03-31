// src/lib/supabase/middleware.ts
// Simplified: no service role client in Edge Runtime (was causing MIDDLEWARE_INVOCATION_FAILED)
// Admin redirect is handled by the root page (src/app/page.tsx) instead

import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: any }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Redirect unauthenticated users to login (except public routes)
  const isPublicRoute =
    request.nextUrl.pathname.startsWith('/auth') ||
    request.nextUrl.pathname.startsWith('/waiver') ||
    request.nextUrl.pathname.startsWith('/api/') ||
    request.nextUrl.pathname.startsWith('/crm') ||
    request.nextUrl.pathname.startsWith('/privacy') ||
    request.nextUrl.pathname.startsWith('/terms') ||
    request.nextUrl.pathname.startsWith('/sms-consent') ||
    request.nextUrl.pathname.startsWith('/studio') ||
    request.nextUrl.pathname.startsWith('/demo') ||
    request.nextUrl.pathname.startsWith('/pay') ||
    request.nextUrl.pathname.startsWith('/payment-success') ||
    request.nextUrl.pathname.startsWith('/ambassador') ||
    request.nextUrl.pathname.startsWith('/join') ||
    request.nextUrl.pathname === '/';

  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/auth/login';
    return NextResponse.redirect(url);
  }

  // Redirect authenticated users away from auth pages
  // EXCEPT /auth/update-password (password reset flow needs this)
  const isPasswordResetPage =
    request.nextUrl.pathname === '/auth/update-password';

  if (user && request.nextUrl.pathname.startsWith('/auth') && !isPasswordResetPage) {
    const url = request.nextUrl.clone();
    // Send to root page which handles admin vs dashboard redirect
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}