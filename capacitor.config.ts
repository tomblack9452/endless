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
};

export default config;
