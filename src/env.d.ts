/// <reference types="vite/client" />

// Keys from .env (never committed; see .env.example). Without them the game
// runs entirely on the device.
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_REVENUECAT_APPLE_KEY?: string;
  readonly VITE_REVENUECAT_GOOGLE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Which build this is: the commit and the day (see vite.config.ts). */
declare const __BUILD__: string;
