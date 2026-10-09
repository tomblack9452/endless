import type { CapacitorConfig } from '@capacitor/cli';

// The iOS and Android apps wrap the web build (dist/). Build the web first
// (npm run build), then `npx cap sync` copies it and the plugins into the
// native projects. See docs/store.md, "Building the apps".
const config: CapacitorConfig = {
  appId: 'com.tomblack.endlessspace',
  appName: 'Endless Space',
  webDir: 'dist',
  android: {
    // The game draws its own background; no white flash behind the webview.
    backgroundColor: '#f1ede4',
  },
  plugins: {
    // Edge to edge on Android (MainActivity): the safe-area insets reach the CSS
    // (env() on newer WebViews, --safe-area-inset-* on older ones; style.css).
    // Dark icons to start with, over the light sky; the game sets them after
    // that from what's behind them (src/systemBars.ts), not the phone's theme.
    SystemBars: {
      insetsHandling: 'css',
      initialViewportFitValueHint: 'cover', // index.html's viewport-fit, known up front: no jump
      style: 'LIGHT',
    },
    // Keeping an account (src/account.ts): Google on Android, Google and Apple on iOS.
    SocialLogin: {
      providers: { google: true, apple: true, facebook: false, twitter: false },
      logLevel: 1,
    },
  },
};

export default config;
