// RevenueCat webhook: pays cores and credit packs on the server when a purchase goes through,
// and keeps every purchase in store_events (premium and the starter pack are
// owned by having a row there; the game reads its own rows).
// The app buys as the player's Supabase account id (appUserID), so the
// event's app_user_id is the account to pay.
//
// Set up (the database first: npm run db:apply, for 0014's purchase time,
// 0016's pass refunds and 0026's credit packs):
//   supabase secrets set REVENUECAT_WEBHOOK_SECRET=<any long random string>
//   supabase functions deploy revenuecat-webhook --no-verify-jwt
//   RevenueCat > Project > Integrations > Webhooks: the function's URL, with
//   the same secret as the Authorization header ("Bearer <secret>").

import { createClient } from 'npm:@supabase/supabase-js@2';

// Cores per product: keep in step with CONFIG.economy.store in src/config.ts.
const CORES: Record<string, number> = {
  cores_100: 100,
  cores_550: 550,
  cores_1200: 1200,
  cores_2500: 2500,
  starter_pack: 500,
};

// Credits per pack: keep in step with CONFIG.economy.store too.
const CREDITS: Record<string, number> = {
  credits_5000: 5000,
  credits_15000: 15000,
  credits_40000: 40000,
};

const PAID = new Set(['INITIAL_PURCHASE', 'NON_RENEWING_PURCHASE']);
// A refund of a one-off purchase arrives as a cancellation.
const REFUNDED = new Set(['CANCELLATION']);

interface RcEvent {
  id: string;
  type: string;
  app_user_id: string;
  product_id: string;
  transaction_id?: string;
  original_transaction_id?: string;
  /** When it was bought (ms): kept as the purchase's time, rather than when this arrived. */
  purchased_at_ms?: number;
}

/**
 * The Authorization header against the secret, in constant time: both are
 * hashed first, so the comparison takes as long whatever the header holds (a
 * plain !== stops at the first wrong character, which timing can give away).
 */
async function sameSecret(header: string | null, secret: string): Promise<boolean> {
  const hash = async (s: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
  const [a, b] = await Promise.all([hash(header ?? ''), hash(`Bearer ${secret}`)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

Deno.serve(async (req) => {
  const secret = Deno.env.get('REVENUECAT_WEBHOOK_SECRET');
  if (!secret || !(await sameSecret(req.headers.get('Authorization'), secret))) return new Response('no', { status: 401 });
  const { event } = (await req.json()) as { event: RcEvent };
  if (!PAID.has(event.type) && !REFUNDED.has(event.type)) return new Response('ignored');
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  // Anonymous RevenueCat ids ($RCAnonymousID:...) aren't accounts: nothing to pay on the server.
  const user = /^[0-9a-f-]{36}$/.test(event.app_user_id) ? event.app_user_id : null;
  const cores = CORES[event.product_id] ?? 0;
  const transaction = event.transaction_id ?? event.original_transaction_id ?? null;
  const at = typeof event.purchased_at_ms === 'number' && Number.isFinite(event.purchased_at_ms) ? new Date(event.purchased_at_ms).toISOString() : null;
  // One database call each: keeping the event and paying (or taking back) its
  // cores happen together, so an error leaves nothing half done and the retry
  // RevenueCat makes after a 500 does the whole thing (0011_store_purchases.sql, 0014).
  // A credit pack pays its credits in the same call, once (0026_credit_packs.sql).
  const credits = CREDITS[event.product_id];
  const { data, error } = credits
    ? PAID.has(event.type)
      ? await admin.rpc('store_credit_purchase', { p_id: event.id, p_user: user, p_product: event.product_id, p_type: event.type, p_transaction: transaction, p_credits: credits, p_at: at })
      : await admin.rpc('store_credit_refund', { p_id: event.id, p_user: user, p_product: event.product_id, p_transaction: transaction, p_credits: credits })
    : PAID.has(event.type)
      ? await admin.rpc('store_purchase_at', { p_id: event.id, p_user: user, p_product: event.product_id, p_type: event.type, p_transaction: transaction, p_cores: cores, p_at: at })
      : await admin.rpc('store_refund', { p_id: event.id, p_user: user, p_product: event.product_id, p_transaction: transaction, p_cores: cores });
  if (error) return new Response(error.message, { status: 500 });
  return new Response(String(data));
});
