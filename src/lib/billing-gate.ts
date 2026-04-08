import { isNativeApp } from './native';

/**
 * Returns true if the user can access subscription management UI.
 * On native (iOS/Android), subscription management is hidden —
 * all billing goes through the web app at sunstonepj.app.
 * This avoids Apple's 15-30% IAP requirement.
 */
export const canShowBillingUI = (): boolean => {
  return !isNativeApp();
};

/**
 * URL to redirect native users to for billing management.
 * Opens in the device's default browser (outside the app).
 */
export const BILLING_WEB_URL = 'https://sunstonepj.app/settings/billing';
