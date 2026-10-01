// Async key/value wrapper so the backing store can be swapped for
// Capacitor Preferences later without touching callers.

export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}

class LocalStore implements KeyValueStore {
  async get(key: string): Promise<string | null> {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  async set(key: string, value: string): Promise<void> {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Storage blocked (private mode etc). Nothing to do.
    }
  }
}

export const storage: KeyValueStore = new LocalStore();

export async function loadNumber(key: string, fallback: number): Promise<number> {
  const raw = await storage.get(key);
  const n = raw === null ? NaN : Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export function saveNumber(key: string, value: number): Promise<void> {
  return storage.set(key, String(value));
}
