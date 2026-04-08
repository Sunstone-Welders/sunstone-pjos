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
