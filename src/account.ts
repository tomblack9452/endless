import { Capacitor } from '@capacitor/core';

// Keeping an account: every player starts on an anonymous account, kept only
// by a session on the device. Signing in with Google links a Google login to
// it (Supabase identity linking), so a new phone gets it back by signing in
// with the same Google account. In the Android app only (and iOS, with Apple
// alongside, once there's an iOS build); the web keeps the anonymous account.
//
// The plugin (@capgo/capacitor-social-login) shows Android's own account
// picker and returns Google's ID token. A nonce ties that token to this
// request: Google gets its hash, the server the original, and checks they match.

const CLIENT_ID = import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID;

/** A Google ID token for the server, and the nonce it was asked for with. */
export interface GoogleToken {
  idToken: string;
  nonce: string;
}

/** True where Google sign-in is offered: the Android app, with the client id set. */
export function googleAvailable(): boolean {
  return !!CLIENT_ID && Capacitor.getPlatform() === 'android';
}

let ready: Promise<void> | null = null;

async function plugin() {
  const { SocialLogin } = await import('@capgo/capacitor-social-login');
  ready ??= SocialLogin.initialize({ google: { webClientId: CLIENT_ID, mode: 'online' } });
  await ready;
  return SocialLogin;
}

/** A random nonce (hex), and its SHA-256 (hex) for Google. */
export async function makeNonce(): Promise<{ raw: string; hashed: string }> {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const raw = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw)));
  return { raw, hashed: Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('') };
}

/** Ask the player to pick a Google account. Null if they backed out or it failed. */
export async function googleSignIn(): Promise<GoogleToken | null> {
  if (!googleAvailable()) return null;
  try {
    const SocialLogin = await plugin();
    const nonce = await makeNonce();
    const res = await SocialLogin.login({ provider: 'google', options: { scopes: ['email', 'profile'], nonce: nonce.hashed } });
    const idToken = (res.result as { idToken?: string | null }).idToken;
    return idToken ? { idToken, nonce: nonce.raw } : null;
  } catch {
    return null;
  }
}
