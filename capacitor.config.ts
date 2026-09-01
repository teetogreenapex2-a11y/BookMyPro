import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // This is the app's unique identifier with Apple and Google - once
  // submitted to either store, this cannot be changed without publishing
  // as a brand new, separate app. Reverse-domain style is the convention;
  // change this now if you'd prefer something different before it's ever
  // submitted anywhere.
  appId: 'com.bookmypro.app',
  appName: 'BookMyPro',

  // This directory isn't actually used to render the app's content - see
  // server.url below - but Capacitor requires a webDir to be set. It
  // points at a folder that doesn't need to exist with real content.
  webDir: 'public',

  server: {
    // This is the entire reason wrapping works the way it does: instead
    // of bundling a local copy of the site inside the app, this tells
    // the native shell to load the real, live website directly. Every
    // future update to the site - new features, bug fixes, anything we
    // build - shows up automatically for everyone using the app, with
    // no new App Store or Play Store submission needed for most changes.
    url: 'https://bookmypro.app',
    cleartext: false,
  },

  ios: {
    contentInset: 'automatic',
  },

  // A real native splash screen using the app's actual brand green,
  // instead of the plain white/blank flash Android shows by default
  // before anything loads. launchAutoHide is intentionally false here -
  // the app itself calls SplashScreen.hide() once the real page has
  // actually finished loading, rather than hiding on a fixed timer that
  // might reveal a still-loading blank page underneath on a slow
  // connection.
  plugins: {
    SplashScreen: {
      launchShowDuration: 0,
      launchAutoHide: false,
      backgroundColor: '#1B3A2F',
      androidScaleType: 'CENTER_CROP',
      showSpinner: true,
      androidSpinnerStyle: 'large',
      spinnerColor: '#B8862B',
      splashFullScreen: true,
      splashImmersive: true,
    },
    // Google for native Android/iOS sign-in, Apple for native iOS
    // sign-in (see handleAppleSignIn in app/login/page.tsx) - excluding
    // the rest keeps their SDKs (and app size) out of the build.
    SocialLogin: {
      providers: {
        google: true,
        facebook: false,
        apple: true,
        twitter: false,
      },
    },
  },
};

export default config;
