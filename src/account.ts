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
  // A failed start is tried again next time, not kept.
  ready ??= SocialLogin.initialize({ google: { webClientId: CLIENT_ID, mode: 'online' } }).catch((e: unknown) => {
    ready = null;
    throw e;
  });
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

/** Why sign-in didn't give a token: 'cancelled' when the player backed out, else the plugin's message. */
export interface GoogleFailure {
  error: string;
}

/**
 * Ask the player to pick a Google account. No `scopes` option: the plugin
 * already asks for email, profile and openid (all the ID token needs), and on
 * Android it refuses any login that passes scopes unless the main activity is
 * replaced with its own.
 */
export async function googleSignIn(): Promise<GoogleToken | GoogleFailure> {
  if (!googleAvailable()) return { error: 'not available in this build' };
  try {
    const SocialLogin = await plugin();
    const nonce = await makeNonce();
    const res = await SocialLogin.login({ provider: 'google', options: { nonce: nonce.hashed } });
    const idToken = (res.result as { idToken?: string | null }).idToken;
    return idToken ? { idToken, nonce: nonce.raw } : { error: 'no ID token from Google' };
  } catch (e) {
    const err = e as { code?: string; message?: string };
    console.warn('google sign-in failed', err.code, err.message); // shows in Logcat (Capacitor/Console)
    if (err.code === 'USER_CANCELLED' || /cancelled by user/i.test(err.message ?? '')) return { error: 'cancelled' };
    // Google's own codes ([16], [28444]...) say what's wrong; keep the start of the message.
    return { error: (err.message || String(e)).replace(/^Google Sign-In failed: /, '').slice(0, 160) };
  }
}
