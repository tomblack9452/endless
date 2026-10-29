/// <reference types="vite/client" />

// Keys from .env (never committed; see .env.example). Without them the game
// runs entirely on the device.
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_REVENUECAT_APPLE_KEY?: string;
  readonly VITE_REVENUECAT_GOOGLE_KEY?: string;
  readonly VITE_GOOGLE_WEB_CLIENT_ID?: string;
  /** "1" in a build with Firebase set up (google-services.json in android/app): see docs/analytics.md. */
  readonly VITE_ANALYTICS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Which build this is: the commit and the day (see vite.config.ts). */
declare const __BUILD__: string;

/** The game's version (package.json; the Android app reports its own through App.getInfo). */
declare const __APP_VERSION__: string;
