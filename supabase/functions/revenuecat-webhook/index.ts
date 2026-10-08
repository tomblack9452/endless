// RevenueCat webhook: credits cores on the server when a purchase goes through,
// and keeps every purchase in store_events (premium and the starter pack are
// owned by having a row there; the game reads its own rows).
// The app buys as the player's Supabase account id (appUserID), so the
// event's app_user_id is the account to pay.
//
// Set up (the database first: npm run db:apply, for 0014's purchase time):
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

Deno.serve(async (req) => {
  const secret = Deno.env.get('REVENUECAT_WEBHOOK_SECRET');
  if (!secret || req.headers.get('Authorization') !== `Bearer ${secret}`) return new Response('no', { status: 401 });
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
  const { data, error } = PAID.has(event.type)
    ? await admin.rpc('store_purchase_at', { p_id: event.id, p_user: user, p_product: event.product_id, p_type: event.type, p_transaction: transaction, p_cores: cores, p_at: at })
    : await admin.rpc('store_refund', { p_id: event.id, p_user: user, p_product: event.product_id, p_transaction: transaction, p_cores: cores });
  if (error) return new Response(error.message, { status: 500 });
  return new Response(String(data));
});
