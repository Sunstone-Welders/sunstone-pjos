'use client';

import { Capacitor } from '@capacitor/core';

/**
 * Detect whether the app is running inside the Capacitor native shell
 * vs in a regular browser. Used for conditional native feature access.
 */
export const isNativeApp = (): boolean => {
  return Capacitor.isNativePlatform();
};

export const getPlatform = (): 'ios' | 'android' | 'web' => {
  return Capacitor.getPlatform() as 'ios' | 'android' | 'web';
};

/**
 * Check if a specific Capacitor plugin is available.
 * Returns false on web, true in native shell.
 */
export const isPluginAvailable = (name: string): boolean => {
  return Capacitor.isPluginAvailable(name);
};

/**
 * Sets a cookie flagging this client as a native Capacitor shell.
 * Called once on app boot from a client component.
 * The cookie lets server components and middleware detect native requests.
 */
export const ensureNativeCookie = (): void => {
  if (typeof document === 'undefined') return;
  if (!Capacitor.isNativePlatform()) return;
  // Persist for 1 year, secure, same-site lax so it rides with all requests
  document.cookie = 'sunstone_native=1; path=/; max-age=31536000; samesite=lax; secure';
};
