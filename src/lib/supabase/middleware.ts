// src/lib/supabase/middleware.ts
// Simplified: no service role client in Edge Runtime (was causing MIDDLEWARE_INVOCATION_FAILED)
// Admin redirect is handled by the root page (src/app/page.tsx) instead

import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { isNativeRequest } from '@/lib/native-server';

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

  // ---------------------------------------------------------------------------
  // Native shell detection — block marketing/pricing pages in iOS/Android shell
  // UA check fires on the very first request (no cookie needed); cookie is fallback.
  // ---------------------------------------------------------------------------
  const isNative = isNativeRequest({
    userAgent: request.headers.get('user-agent') || '',
    cookieValue: request.cookies.get('sunstone_native')?.value,
  });
  const path = request.nextUrl.pathname;

  // On native, unauthenticated users must land on /auth/login
  // Block: landing page, signup, terms (contains pricing)
  if (isNative && !user) {
    const nativeBlockedForAnon =
      path === '/' ||
      path.startsWith('/auth/signup') ||
      path === '/terms';
    if (nativeBlockedForAnon) {
      const url = request.nextUrl.clone();
      url.pathname = '/auth/login';
      url.search = '';
      return NextResponse.redirect(url);
    }
  }

  // On native, authenticated users should never see the landing page or onboarding
  if (isNative && user && (path === '/' || path.startsWith('/onboarding'))) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    url.search = '';
    return NextResponse.redirect(url);
  }

  // ---------------------------------------------------------------------------
  // Native subscription lockout — silently destroy session for expired users.
  // Apple Build 4: The app must be completely subscription-blind. If the user's
  // subscription is expired on native, we wipe their session so they land on a
  // clean login screen with zero billing/subscription messaging.
  // Only applies to native + authenticated + dashboard routes.
  // Fails open: if the DB query errors, let the user through.
  // ---------------------------------------------------------------------------
  if (isNative && user && path.startsWith('/dashboard')) {
    try {
      const { data: member } = await supabase
        .from('tenant_members')
        .select('tenant_id, tenants(subscription_status, trial_ends_at, stripe_subscription_id, admin_tier_override)')
        .eq('user_id', user.id)
        .limit(1)
        .single();

      const tenant = (member as any)?.tenants;

      if (tenant) {
        const hasActiveSubscription =
          tenant.subscription_status === 'active' ||
          tenant.subscription_status === 'past_due';
        const hasStripeSubscription = !!tenant.stripe_subscription_id;
        const isTrialing =
          tenant.subscription_status === 'trialing' &&
          tenant.trial_ends_at &&
          new Date(tenant.trial_ends_at) > new Date();
        const hasAdminOverride = !!tenant.admin_tier_override;

        // If none of the "allow" conditions are met, lock them out
        if (!hasActiveSubscription && !hasStripeSubscription && !isTrialing && !hasAdminOverride) {
          // Destroy auth session by clearing Supabase cookies
          const url = request.nextUrl.clone();
          url.pathname = '/auth/login';
          url.search = '';
          const redirectResponse = NextResponse.redirect(url);

          // Delete all Supabase auth cookies to destroy the session
          for (const cookie of request.cookies.getAll()) {
            if (cookie.name.startsWith('sb-')) {
              redirectResponse.cookies.delete(cookie.name);
            }
          }

          return redirectResponse;
        }
      }
      // If no tenant found (e.g. still in onboarding), let them through
    } catch {
      // Fail open — don't lock out paying customers due to a DB error
    }
  }

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