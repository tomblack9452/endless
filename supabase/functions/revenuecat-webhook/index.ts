// RevenueCat webhook: credits cores on the server when a purchase goes through,
// and keeps every purchase in store_events (premium and the starter pack are
// owned by having a row there; the game reads its own rows).
// The app buys as the player's Supabase account id (appUserID), so the
// event's app_user_id is the account to pay.
//
// Set up:
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

Deno.serve(async (req) => {
  const secret = Deno.env.get('REVENUECAT_WEBHOOK_SECRET');
  if (!secret || req.headers.get('Authorization') !== `Bearer ${secret}`) return new Response('no', { status: 401 });
  const { event } = (await req.json()) as { event: { id: string; type: string; app_user_id: string; product_id: string } };
  if (!PAID.has(event.type)) return new Response('ignored');
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  // Anonymous RevenueCat ids ($RCAnonymousID:...) aren't accounts: nothing to pay on the server.
  const user = /^[0-9a-f-]{36}$/.test(event.app_user_id) ? event.app_user_id : null;
  const { error: seen } = await admin.from('store_events').insert({ id: event.id, user_id: user, product: event.product_id, type: event.type });
  if (seen) return new Response('already handled'); // duplicate id: paid before
  const cores = CORES[event.product_id] ?? 0;
  if (user && cores > 0) {
    const { error } = await admin.rpc('grant_cores', { player: user, amount: cores, reason: `purchase:${event.product_id}` });
    if (error) return new Response(error.message, { status: 500 });
  }
  return new Response('ok');
});
