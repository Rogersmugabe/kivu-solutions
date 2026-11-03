// Kivu — plan payments with MTN MoMo (Supabase Edge Function)
//
// The owner chooses a plan on the Plans page and enters their MoMo number. This function:
//   start  → works out the price on the server (kivu_plan_price), records a 'pending' payment and
//            asks MTN (Collections "request to pay") to send the payment prompt to that phone.
//   status → asks MTN how the payment went. Only when MTN itself says SUCCESSFUL is the payment
//            confirmed and the plan extended (kivu_confirm_momo_payment, database).
//   callback (MTN calls ?callback=1) → never trusted on its own: it only triggers the same check
//            with MTN, so a fake "paid" message cannot unlock a plan.
//
// Secrets (Supabase → Edge Functions → Secrets; never in the app):
//   MOMO_SUBSCRIPTION_KEY   Collections primary key from the MoMo developer portal
//   MOMO_API_USER           API user id   (sandbox: create with scripts/momo-sandbox-user.mjs)
//   MOMO_API_KEY            API key for that user
//   MOMO_TARGET_ENV         'sandbox' while testing; the live value MTN gives you (e.g. 'mtnrwanda')
//   MOMO_BASE_URL           optional; defaults to https://sandbox.momodeveloper.mtn.com. Set the live URL from MTN.
//   MOMO_CURRENCY           optional; 'EUR' in the sandbox (MTN's sandbox only accepts EUR), 'RWF' live
//   MOMO_CALLBACK_URL       optional; https://<project>.supabase.co/functions/v1/momo-pay?callback=1
//
// Deploy:  supabase functions deploy momo-pay --no-verify-jwt
// (--no-verify-jwt so MTN's callback can reach it; start/status check the owner's login themselves.)

import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, PUT, OPTIONS'
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const env = (name: string, fallback?: string) => {
  const v = Deno.env.get(name) ?? fallback;
  if (!v) throw new Error(`Missing secret ${name}`);
  return v;
};
const BASE = () => env('MOMO_BASE_URL', 'https://sandbox.momodeveloper.mtn.com').replace(/\/$/, '');
const TARGET = () => env('MOMO_TARGET_ENV', 'sandbox');
const SANDBOX = () => TARGET() === 'sandbox';

const PLANS = ['basic', 'one_time', 'business', 'control', 'pro'];
const MONTHS = [1, 3, 6, 12];

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });

/** MTN expects the number without '+': 2507XXXXXXXX in Rwanda. The sandbox accepts its own test numbers. */
function payerNumber(value: string): string | null {
  let p = String(value || '').replace(/\D/g, '');
  if (p.startsWith('07')) p = `250${p.slice(1)}`;
  if (/^2507\d{8}$/.test(p)) return p;
  if (SANDBOX() && /^\d{8,15}$/.test(p)) return p;
  return null;
}

let cachedToken: { value: string; expires: number } | null = null;
async function momoToken(): Promise<string> {
  if (cachedToken && cachedToken.expires > Date.now() + 60_000) return cachedToken.value;
  const res = await fetch(`${BASE()}/collection/token/`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${env('MOMO_API_USER')}:${env('MOMO_API_KEY')}`)}`,
      'Ocp-Apim-Subscription-Key': env('MOMO_SUBSCRIPTION_KEY')
    }
  });
  if (!res.ok) throw new Error(`MTN sign-in failed (${res.status})`);
  const body = await res.json();
  cachedToken = { value: body.access_token, expires: Date.now() + Number(body.expires_in || 3600) * 1000 };
  return cachedToken.value;
}

async function momoHeaders(extra: Record<string, string> = {}) {
  return {
    Authorization: `Bearer ${await momoToken()}`,
    'X-Target-Environment': TARGET(),
    'Ocp-Apim-Subscription-Key': env('MOMO_SUBSCRIPTION_KEY'),
    ...extra
  };
}

/** Asks MTN for the payment's real status and settles the row. Returns the row's new status. */
async function settle(paymentId: string): Promise<{ status: string; reason?: string | null }> {
  const { data: pay } = await admin.from('subscription_payments').select('id, status, provider_ref, failure_reason').eq('id', paymentId).maybeSingle();
  if (!pay) return { status: 'not_found' };
  if (pay.status !== 'pending') return { status: pay.status, reason: pay.failure_reason };

  const res = await fetch(`${BASE()}/collection/v1_0/requesttopay/${pay.provider_ref}`, { headers: await momoHeaders() });
  if (res.status === 404) return { status: 'pending' }; // MTN has not registered it yet
  if (!res.ok) throw new Error(`MTN status check failed (${res.status})`);
  const mtn = await res.json();

  if (mtn.status === 'SUCCESSFUL') {
    const { error } = await admin.rpc('kivu_confirm_momo_payment', { p_payment_id: pay.id, p_provider_txn_id: mtn.financialTransactionId ?? null });
    if (error) throw new Error(error.message);
    return { status: 'confirmed' };
  }
  if (mtn.status === 'FAILED' || mtn.status === 'REJECTED' || mtn.status === 'TIMEOUT') {
    const reason = typeof mtn.reason === 'string' ? mtn.reason : mtn.reason?.message || mtn.reason?.code || mtn.status;
    await admin.rpc('kivu_fail_momo_payment', { p_payment_id: pay.id, p_reason: friendlyReason(reason) });
    return { status: 'failed', reason: friendlyReason(reason) };
  }
  return { status: 'pending' };
}

function friendlyReason(code: string): string {
  const c = String(code || '').toUpperCase();
  if (c.includes('NOT_ENOUGH') || c.includes('INSUFFICIENT')) return 'Not enough balance on the MoMo account.';
  if (c.includes('REJECT') || c.includes('NOT_ALLOWED') || c.includes('DECLIN')) return 'The payment was declined on the phone.';
  if (c.includes('EXPIRED') || c.includes('TIMEOUT')) return 'The payment prompt was not approved in time.';
  if (c.includes('PAYER_NOT_FOUND') || c.includes('NOT_FOUND')) return 'This number has no MoMo account.';
  return 'The payment did not go through.';
}

/** The signed-in owner and their shop, from the app's login token. */
async function ownerShop(req: Request) {
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data: { user } } = await admin.auth.getUser(token);
  if (!user) return null;
  const { data: shop } = await admin.from('shops').select('id, name').eq('owner_id', user.id).order('created_at').limit(1).maybeSingle();
  return shop ? { user, shop } : null;
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const url = new URL(req.url);

  try {
    // MTN's notification: look up the payment by its reference and verify with MTN.
    if (url.searchParams.has('callback')) {
      const body = await req.json().catch(() => ({}));
      // externalId is our payment id; referenceId is the X-Reference-Id we sent. Both are UUIDs.
      const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const byId = uuid.test(String(body.externalId || '')) ? String(body.externalId) : null;
      const byRef = uuid.test(String(body.referenceId || '')) ? String(body.referenceId) : null;
      const { data: pay } = byId
        ? await admin.from('subscription_payments').select('id').eq('id', byId).eq('provider', 'mtn_momo').maybeSingle()
        : byRef
          ? await admin.from('subscription_payments').select('id').eq('provider_ref', byRef).eq('provider', 'mtn_momo').maybeSingle()
          : { data: null };
      if (pay) await settle(pay.id);
      return json({ ok: true });
    }

    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
    const who = await ownerShop(req);
    if (!who) return json({ error: 'Only the shop owner can pay for the plan. Sign in again.' }, 401);
    const body = await req.json().catch(() => ({}));

    if (body.action === 'status') {
      const id = String(body.id || '');
      const { data: pay } = await admin.from('subscription_payments').select('id').eq('id', id).eq('shop_id', who.shop.id).maybeSingle();
      if (!pay) return json({ error: 'Payment not found.' }, 404);
      return json(await settle(pay.id));
    }

    if (body.action !== 'start') return json({ error: 'Unknown action' }, 400);

    const plan = String(body.plan || '');
    const months = plan === 'one_time' ? 1 : Number(body.months || 1);
    const phone = payerNumber(String(body.phone || ''));
    if (!PLANS.includes(plan)) return json({ error: 'Choose a plan.' }, 400);
    if (!MONTHS.includes(months)) return json({ error: 'Choose 1, 3, 6 or 12 months.' }, 400);
    if (!phone) return json({ error: 'Enter a valid MTN number, for example 0788 123 456.' }, 400);

    // One payment at a time per shop, so a double tap cannot charge twice.
    const recent = new Date(Date.now() - 5 * 60_000).toISOString();
    const { data: open } = await admin.from('subscription_payments').select('id').eq('shop_id', who.shop.id).eq('status', 'pending').eq('provider', 'mtn_momo').gte('created_at', recent).limit(1);
    if (open?.length) return json({ error: 'A payment is already waiting for approval on your phone. Approve it or wait a few minutes.', id: open[0].id }, 409);

    const { data: price, error: priceError } = await admin.rpc('kivu_plan_price', { p_plan: plan });
    if (priceError || !price) return json({ error: 'Could not price this plan.' }, 500);
    const amount = Number(price) * months;
    const ref = crypto.randomUUID();

    const { data: pay, error: insertError } = await admin.from('subscription_payments').insert({
      shop_id: who.shop.id, plan, months, amount, status: 'pending', payment_method: 'Mobile Money',
      provider: 'mtn_momo', provider_ref: ref, reference: ref, payer_phone: phone, requested_by: who.user.id,
      note: `MTN MoMo · ${months} month${months === 1 ? '' : 's'}`
    }).select('id').single();
    if (insertError) return json({ error: 'Could not start the payment. Try again.' }, 500);

    const callback = Deno.env.get('MOMO_CALLBACK_URL');
    const res = await fetch(`${BASE()}/collection/v1_0/requesttopay`, {
      method: 'POST',
      headers: await momoHeaders({ 'X-Reference-Id': ref, 'Content-Type': 'application/json', ...(callback ? { 'X-Callback-Url': callback } : {}) }),
      body: JSON.stringify({
        amount: String(amount),
        currency: Deno.env.get('MOMO_CURRENCY') || (SANDBOX() ? 'EUR' : 'RWF'),
        externalId: pay.id,
        payer: { partyIdType: 'MSISDN', partyId: phone },
        payerMessage: `Kivu POS ${plan} plan`.slice(0, 160),
        payeeNote: `${who.shop.name}`.slice(0, 160)
      })
    });
    if (res.status !== 202) {
      await admin.rpc('kivu_fail_momo_payment', { p_payment_id: pay.id, p_reason: `MTN refused the request (${res.status})` });
      return json({ error: 'MTN could not send the payment prompt. Check the number and try again.' }, 502);
    }
    return json({ id: pay.id, amount, status: 'pending' });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Payment service error' }, 500);
  }
});
