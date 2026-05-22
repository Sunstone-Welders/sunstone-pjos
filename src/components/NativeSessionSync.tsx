// ============================================================================
// NativeSessionSync — src/components/NativeSessionSync.tsx
// ============================================================================
// After /api/auth/set-session redirects with ?session_ready=1, force one
// top-level reload. WKWebView's fetch() cookie jar isn't populated by the
// Set-Cookie on the 302 — only the navigation jar is. A full reload syncs
// the jar permanently so subsequent RSC fetches carry the session cookies.
// ============================================================================

'use client';

import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

export default function NativeSessionSync() {
  const searchParams = useSearchParams();
  const pathname = usePathname();

  useEffect(() => {
    if (searchParams.get('session_ready') !== '1') return;

    const clean = new URL(window.location.href);
    clean.searchParams.delete('session_ready');
    window.location.replace(clean.toString());
  }, [searchParams, pathname]);

  return null;
}
