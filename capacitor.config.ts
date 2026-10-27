import type { CapacitorConfig } from '@capacitor/cli';

// The iOS and Android apps wrap the web build (dist/). Build the web first
// (npm run build), then `npx cap sync` copies it and the plugins into the
// native projects. See docs/store.md, "Building the apps".
const config: CapacitorConfig = {
  appId: 'com.tomblack.endlessspace',
  appName: 'Endless Space',
  webDir: 'dist',
  android: {
    // The launch splash's night sky (index.html), the same as Android's own
    // splash colour (styles.xml): no flash between them.
    backgroundColor: '#1d2031',
  },
  plugins: {
    // Edge to edge on Android (MainActivity): the safe-area insets reach the CSS
    // (env() on newer WebViews, --safe-area-inset-* on older ones; style.css).
    // Light icons to start with, over the launch splash's night sky; the game
    // sets them after that from what's behind them (src/ui/systemBars.ts), not the phone's theme.
    SystemBars: {
      insetsHandling: 'css',
      initialViewportFitValueHint: 'cover', // index.html's viewport-fit, known up front: no jump
      style: 'DARK',
    },
    // Reminders (src/platform/reminders.ts): the dart ship in the status bar, in the store art's amber.
    LocalNotifications: {
      smallIcon: 'ic_stat_endless',
      iconColor: '#e8a265',
    },
    // Keeping an account (src/account.ts): Google on Android, Google and Apple on iOS.
    SocialLogin: {
      providers: { google: true, apple: true, facebook: false, twitter: false },
      logLevel: 1,
    },
  },
};

export default config;
