// src/lib/supabase/native-session.ts
// Persist Supabase auth sessions to Capacitor native storage (UserDefaults / SharedPreferences).
// This bridges the gap where WKWebView / Android WebView may not reliably persist
// cookies set via document.cookie across app launches.
//
// The default @supabase/ssr cookie-based storage remains unchanged — this module
// is a secondary persistence layer used only in native Capacitor shells.

'use client';

const SESSION_KEY = 'sunstone_auth_session';

/**
 * Persist access + refresh tokens to native storage.
 * No-op on web (Capacitor.isNativePlatform() guard is in the caller).
 */
export async function persistNativeSession(
  accessToken: string,
  refreshToken: string
): Promise<void> {
  try {
    const { Preferences } = await import('@capacitor/preferences');
    await Preferences.set({
      key: SESSION_KEY,
      value: JSON.stringify({ access_token: accessToken, refresh_token: refreshToken }),
    });
  } catch {
    // Plugin not available — ignore
  }
}

/**
 * Read a previously persisted session from native storage.
 * Returns null if nothing is stored or if the stored value is invalid.
 */
export async function getPersistedNativeSession(): Promise<{
  access_token: string;
  refresh_token: string;
} | null> {
  try {
    const { Preferences } = await import('@capacitor/preferences');
    const { value } = await Preferences.get({ key: SESSION_KEY });
    if (!value) return null;
    const parsed = JSON.parse(value);
    if (parsed?.access_token && parsed?.refresh_token) return parsed;
    return null;
  } catch {
    return null;
  }
}

/**
 * Clear the persisted session (called on sign-out).
 */
export async function clearPersistedNativeSession(): Promise<void> {
  try {
    const { Preferences } = await import('@capacitor/preferences');
    await Preferences.remove({ key: SESSION_KEY });
  } catch {
    // Plugin not available — ignore
  }
}
