import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.sunstonepj.studio',
  appName: 'Sunstone Studio',

  // Remote URL — the app loads from Vercel, not bundled assets
  server: {
    url: 'https://sunstonepj.app',
    cleartext: false, // HTTPS only
    allowNavigation: [
      'sunstonepj.app',
      '*.supabase.co',
      '*.stripe.com',
      'checkout.stripe.com',
      'js.stripe.com',
      'accounts.google.com', // if OAuth
    ],
  },

  // Plugins
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 2000,
      backgroundColor: '#FFFFFF',
      showSpinner: false,
      androidSplashResourceName: 'splash',
      splashFullScreen: false,
      splashImmersive: false,
    },
    StatusBar: {
      style: 'LIGHT', // dark text on light background
      backgroundColor: '#FFFFFF',
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },

  // Android-specific
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false, // set true for dev
  },

  // iOS-specific
  ios: {
    contentInset: 'automatic',
    allowsLinkPreview: false,
    scrollEnabled: true,
  },
};

export default config;
