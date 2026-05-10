'use client';

import { useEffect } from 'react';
import { ensureNativeCookie, isNativeApp } from '@/lib/native';
import { createClient } from '@/lib/supabase/client';
import {
  persistNativeSession,
  getPersistedNativeSession,
  clearPersistedNativeSession,
} from '@/lib/supabase/native-session';

export default function NativeBoot() {
  useEffect(() => {
    ensureNativeCookie();

    if (!isNativeApp()) return;

    const supabase = createClient();

    // ── Persist session to native storage on auth state changes ──
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (
        session &&
        (event === 'SIGNED_IN' ||
          event === 'TOKEN_REFRESHED' ||
          event === 'INITIAL_SESSION')
      ) {
        await persistNativeSession(session.access_token, session.refresh_token);
      } else if (event === 'SIGNED_OUT') {
        await clearPersistedNativeSession();
      }
    });

    // ── Restore session from native storage on app launch ──
    // If WKWebView / WebView cleared cookies, this re-establishes the session
    // through the default @supabase/ssr cookie adapter so middleware can read it.
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session) return; // Cookies survived — nothing to do

      const persisted = await getPersistedNativeSession();
      if (!persisted) return; // No saved session — user must log in

      const { error } = await supabase.auth.setSession(persisted);
      if (error) {
        // Tokens expired or revoked — clear stale data
        await clearPersistedNativeSession();
        return;
      }

      // Session restored + cookies set by createBrowserClient.
      // Full-page navigate to /dashboard so middleware processes the new cookies.
      window.location.href = '/dashboard';
    })();

    return () => subscription.unsubscribe();
  }, []);

  return null;
}
