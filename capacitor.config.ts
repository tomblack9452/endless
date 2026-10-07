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
    // Keeping an account (src/account.ts): Google on Android, Google and Apple on iOS.
    SocialLogin: {
      providers: { google: true, apple: true, facebook: false, twitter: false },
      logLevel: 1,
    },
  },
};

export default config;
