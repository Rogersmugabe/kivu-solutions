// Kivu — plan payments with Mobile Money (Supabase Edge Function)
//
// The owner chooses a plan on the Plans page and enters their Mobile Money number. This function:
//   config → tells the Plans page whether payments are set up and which networks work.
//   start  → works out the price on the server (kivu_plan_price), records a 'pending' payment and
//            asks the provider to send the payment prompt to that phone.
//   status → asks the provider how the payment went. Only when the provider itself reports success is
//            the payment confirmed and the plan extended (kivu_confirm_momo_payment, database).
//   callback (?callback=relworx | ?callback=1 for MTN) → never trusted on its own: it only triggers
//            the same check with the provider, so a fake "paid" message cannot unlock a plan.
//
// Providers (the first one whose secrets are set is used):
//   Relworx (MTN + Airtel Rwanda)
//     RELWORX_API_KEY        API key from the Relworx dashboard
//     RELWORX_ACCOUNT_NO     business account number (REL…)
//     RELWORX_WEBHOOK_KEY    optional; webhook signing key, to check notifications come from Relworx
//     RELWORX_WEBHOOK_URL    optional; the Request Payment Webhook exactly as saved in Relworx
//   MTN MoMo direct (MTN only)
//     MOMO_SUBSCRIPTION_KEY  Collections primary key from the MoMo developer portal
//     MOMO_API_USER          API user id   (sandbox: create with scripts/momo-sandbox-user.mjs)
//     MOMO_API_KEY           API key for that user
//     MOMO_TARGET_ENV        'sandbox' while testing; the live value MTN gives you (e.g. 'mtnrwanda')
//     MOMO_BASE_URL          optional; defaults to https://sandbox.momodeveloper.mtn.com. Set the live URL from MTN.
//     MOMO_CURRENCY          optional; 'EUR' in the sandbox (MTN's sandbox only accepts EUR), 'RWF' live
//     MOMO_CALLBACK_URL      optional; https://<project>.supabase.co/functions/v1/momo-pay?callback=1
//
// Deploy:  supabase functions deploy momo-pay --no-verify-jwt
// (--no-verify-jwt so provider callbacks can reach it; start/status check the owner's login themselves.)

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
const has = (...names: string[]) => names.every(n => !!Deno.env.get(n));

const PLANS = ['basic', 'one_time', 'business', 'control', 'pro'];
const MONTHS = [1, 3, 6, 12];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });

type Outcome = { status: 'confirmed' | 'failed' | 'pending'; reason?: string; txnId?: string | null };

interface Provider {
  id: string;
  networks: string[];
  /** Normalised payer number, or null if the number cannot be used with this provider. */
  payer(value: string): string | null;
  /** Sends the prompt. Returns the provider's reference for later status checks. */
  request(p: { paymentId: string; phone: string; amount: number; plan: string; shopName: string }): Promise<string>;
  check(providerRef: string): Promise<Outcome>;
}

/* ------------------------------- Relworx -------------------------------- */

const RELWORX = 'https://payments.relworx.com/api';
const relworxHeaders = () => ({
  'Content-Type': 'application/json',
  Accept: 'application/vnd.relworx.v2',
  Authorization: `Bearer ${env('RELWORX_API_KEY')}`
});

const relworx: Provider = {
  id: 'relworx',
  networks: ['MTN', 'Airtel'],
  payer(value) {
    let p = String(value || '').replace(/\D/g, '');
    if (p.startsWith('07')) p = `250${p.slice(1)}`;
    return /^2507[2389]\d{7}$/.test(p) ? `+${p}` : null;
  },
  async request({ paymentId, phone, amount, plan }) {
    const res = await fetch(`${RELWORX}/mobile-money/request-payment`, {
      method: 'POST',
      headers: relworxHeaders(),
      body: JSON.stringify({
        account_no: env('RELWORX_ACCOUNT_NO'), reference: paymentId, msisdn: phone,
        currency: 'RWF', amount, description: `Kivu POS ${plan} plan`
      })
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.success || !body.internal_reference) throw new Error(body.message || `Relworx refused the request (${res.status})`);
    return String(body.internal_reference);
  },
  async check(ref) {
    const q = new URLSearchParams({ internal_reference: ref, account_no: env('RELWORX_ACCOUNT_NO') });
    const res = await fetch(`${RELWORX}/mobile-money/check-request-status?${q}`, { headers: relworxHeaders() });
    if (res.status === 404) return { status: 'pending' };
    const body = await res.json().catch(() => ({}));
    const st = String(body.request_status || body.status || '').toLowerCase();
    if (st === 'success' || st === 'successful') return { status: 'confirmed', txnId: body.provider_transaction_id ?? null };
    if (st === 'failed' || st === 'failure' || st === 'cancelled') return { status: 'failed', reason: friendlyReason(body.message) };
    return { status: 'pending' };
  }
};

/** Relworx-Signature: "t=<timestamp>,v=<HMAC-SHA256 of url + t + sorted key/value pairs>". */
async function relworxSignatureOk(header: string | null, body: Record<string, unknown>): Promise<boolean> {
  const key = Deno.env.get('RELWORX_WEBHOOK_KEY');
  if (!key || !header) return false;
  const parts = Object.fromEntries(header.split(',').map(p => p.trim().split('=', 2) as [string, string]));
  const t = parts.t, v = header.slice(header.indexOf('v=') + 2).trim();
  if (!t || !v) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > 60 * 60) return false; // reject old replays
  const url = Deno.env.get('RELWORX_WEBHOOK_URL') || `${Deno.env.get('SUPABASE_URL')}/functions/v1/momo-pay?callback=relworx`;
  const signed = url + t + ['customer_reference', 'internal_reference', 'status'].map(k => k + String(body[k] ?? '')).join('');
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']), new TextEncoder().encode(signed)));
  const hex = [...mac].map(b => b.toString(16).padStart(2, '0')).join('');
  const b64 = btoa(String.fromCharCode(...mac));
  return v === hex || v === b64; // the docs say hex; their example looks like base64
}

/* ------------------------------ MTN direct ------------------------------ */

const MTN_BASE = () => env('MOMO_BASE_URL', 'https://sandbox.momodeveloper.mtn.com').replace(/\/$/, '');
const MTN_TARGET = () => env('MOMO_TARGET_ENV', 'sandbox');
const MTN_SANDBOX = () => MTN_TARGET() === 'sandbox';

let cachedToken: { value: string; expires: number } | null = null;
async function momoToken(): Promise<string> {
  if (cachedToken && cachedToken.expires > Date.now() + 60_000) return cachedToken.value;
  const res = await fetch(`${MTN_BASE()}/collection/token/`, {
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
    'X-Target-Environment': MTN_TARGET(),
    'Ocp-Apim-Subscription-Key': env('MOMO_SUBSCRIPTION_KEY'),
    ...extra
  };
}

const mtn: Provider = {
  id: 'mtn_momo',
  networks: ['MTN'],
  payer(value) {
    // MTN expects the number without '+': 2507XXXXXXXX. The sandbox accepts its own test numbers.
    let p = String(value || '').replace(/\D/g, '');
    if (p.startsWith('07')) p = `250${p.slice(1)}`;
    if (/^2507[89]\d{7}$/.test(p)) return p;
    if (MTN_SANDBOX() && /^\d{8,15}$/.test(p)) return p;
    return null;
  },
  async request({ paymentId, phone, amount, plan, shopName }) {
    const ref = crypto.randomUUID();
    const callback = Deno.env.get('MOMO_CALLBACK_URL');
    const res = await fetch(`${MTN_BASE()}/collection/v1_0/requesttopay`, {
      method: 'POST',
      headers: await momoHeaders({ 'X-Reference-Id': ref, 'Content-Type': 'application/json', ...(callback ? { 'X-Callback-Url': callback } : {}) }),
      body: JSON.stringify({
        amount: String(amount),
        currency: Deno.env.get('MOMO_CURRENCY') || (MTN_SANDBOX() ? 'EUR' : 'RWF'),
        externalId: paymentId,
        payer: { partyIdType: 'MSISDN', partyId: phone },
        payerMessage: `Kivu POS ${plan} plan`.slice(0, 160),
        payeeNote: shopName.slice(0, 160)
      })
    });
    if (res.status !== 202) throw new Error(`MTN refused the request (${res.status})`);
    return ref;
  },
  async check(ref) {
    const res = await fetch(`${MTN_BASE()}/collection/v1_0/requesttopay/${ref}`, { headers: await momoHeaders() });
    if (res.status === 404) return { status: 'pending' }; // MTN has not registered it yet
    if (!res.ok) throw new Error(`MTN status check failed (${res.status})`);
    const body = await res.json();
    if (body.status === 'SUCCESSFUL') return { status: 'confirmed', txnId: body.financialTransactionId ?? null };
    if (['FAILED', 'REJECTED', 'TIMEOUT'].includes(body.status)) {
      const reason = typeof body.reason === 'string' ? body.reason : body.reason?.message || body.reason?.code || body.status;
      return { status: 'failed', reason: friendlyReason(reason) };
    }
    return { status: 'pending' };
  }
};

/* ------------------------------- Shared --------------------------------- */

const PROVIDERS: Record<string, Provider> = { relworx, mtn_momo: mtn };

function activeProvider(): Provider | null {
  if (has('RELWORX_API_KEY', 'RELWORX_ACCOUNT_NO')) return relworx;
  if (has('MOMO_SUBSCRIPTION_KEY', 'MOMO_API_USER', 'MOMO_API_KEY')) return mtn;
  return null;
}

function friendlyReason(code: unknown): string {
  const c = String(code || '').toUpperCase();
  if (c.includes('NOT_ENOUGH') || c.includes('INSUFFICIENT') || c.includes('BALANCE')) return 'Not enough balance on the Mobile Money account.';
  if (c.includes('REJECT') || c.includes('NOT_ALLOWED') || c.includes('DECLIN') || c.includes('CANCEL')) return 'The payment was declined on the phone.';
  if (c.includes('EXPIRED') || c.includes('TIMEOUT') || c.includes('TIME OUT')) return 'The payment prompt was not approved in time.';
  if (c.includes('PAYER_NOT_FOUND') || c.includes('NOT FOUND') || c.includes('NOT_FOUND') || c.includes('INVALID')) return 'This number has no Mobile Money account.';
  return 'The payment did not go through.';
}

/** Asks the payment's provider for its real status and settles the row. */
async function settle(paymentId: string): Promise<{ status: string; reason?: string | null }> {
  const { data: pay } = await admin.from('subscription_payments').select('id, status, provider, provider_ref, failure_reason').eq('id', paymentId).maybeSingle();
  if (!pay) return { status: 'not_found' };
  if (pay.status !== 'pending') return { status: pay.status, reason: pay.failure_reason };
  const provider = PROVIDERS[pay.provider];
  if (!provider || !pay.provider_ref) return { status: 'pending' };

  const out = await provider.check(pay.provider_ref);
  if (out.status === 'confirmed') {
    const { error } = await admin.rpc('kivu_confirm_momo_payment', { p_payment_id: pay.id, p_provider_txn_id: out.txnId ?? null });
    if (error) throw new Error(error.message);
    return { status: 'confirmed' };
  }
  if (out.status === 'failed') {
    await admin.rpc('kivu_fail_momo_payment', { p_payment_id: pay.id, p_reason: out.reason });
    return { status: 'failed', reason: out.reason };
  }
  return { status: 'pending' };
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
    // Provider notifications: find our payment, then verify with the provider itself.
    const callback = url.searchParams.get('callback');
    if (callback !== null) {
      const body = await req.json().catch(() => ({}));
      let paymentId: string | null = null;
      if (callback === 'relworx') {
        if (!(await relworxSignatureOk(req.headers.get('Relworx-Signature'), body))) console.warn('Relworx webhook signature not verified; checking status with Relworx anyway.');
        paymentId = UUID.test(String(body.customer_reference || '')) ? String(body.customer_reference) : null;
      } else {
        // MTN: externalId is our payment id; referenceId is the X-Reference-Id we sent.
        const byRef = UUID.test(String(body.referenceId || '')) ? String(body.referenceId) : null;
        paymentId = UUID.test(String(body.externalId || '')) ? String(body.externalId) : null;
        if (!paymentId && byRef) {
          const { data } = await admin.from('subscription_payments').select('id').eq('provider', 'mtn_momo').eq('provider_ref', byRef).maybeSingle();
          paymentId = data?.id ?? null;
        }
      }
      if (paymentId) await settle(paymentId);
      return json({ ok: true });
    }

    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
    const body = await req.json().catch(() => ({}));
    const provider = activeProvider();

    // Lets the Plans page offer Mobile Money only when a provider is set up.
    if (body.action === 'config') return json({ enabled: !!provider, provider: provider?.id ?? null, networks: provider?.networks ?? [] });

    const who = await ownerShop(req);
    if (!who) return json({ error: 'Only the shop owner can pay for the plan. Sign in again.' }, 401);

    if (body.action === 'status') {
      const id = String(body.id || '');
      if (!UUID.test(id)) return json({ error: 'Payment not found.' }, 404);
      const { data: pay } = await admin.from('subscription_payments').select('id').eq('id', id).eq('shop_id', who.shop.id).maybeSingle();
      if (!pay) return json({ error: 'Payment not found.' }, 404);
      return json(await settle(pay.id));
    }

    if (body.action !== 'start') return json({ error: 'Unknown action' }, 400);
    if (!provider) return json({ error: 'Mobile Money payments are not set up yet. Use "Request instead".' }, 503);

    const plan = String(body.plan || '');
    const months = plan === 'one_time' ? 1 : Number(body.months || 1);
    const phone = provider.payer(String(body.phone || ''));
    if (!PLANS.includes(plan)) return json({ error: 'Choose a plan.' }, 400);
    if (!MONTHS.includes(months)) return json({ error: 'Choose 1, 3, 6 or 12 months.' }, 400);
    if (!phone) return json({ error: `Enter a valid ${provider.networks.join(' or ')} number, for example 0788 123 456.` }, 400);

    // One payment at a time per shop, so a double tap cannot charge twice.
    const recent = new Date(Date.now() - 5 * 60_000).toISOString();
    const { data: open } = await admin.from('subscription_payments').select('id').eq('shop_id', who.shop.id).eq('status', 'pending').not('provider', 'is', null).gte('created_at', recent).limit(1);
    if (open?.length) return json({ error: 'A payment is already waiting for approval on your phone. Approve it or wait a few minutes.', id: open[0].id }, 409);

    const { data: price, error: priceError } = await admin.rpc('kivu_plan_price', { p_plan: plan });
    if (priceError || !price) return json({ error: 'Could not price this plan.' }, 500);
    const amount = Number(price) * months;

    const { data: pay, error: insertError } = await admin.from('subscription_payments').insert({
      shop_id: who.shop.id, plan, months, amount, status: 'pending', payment_method: 'Mobile Money',
      provider: provider.id, payer_phone: phone, requested_by: who.user.id,
      note: `Mobile Money · ${months} month${months === 1 ? '' : 's'}`
    }).select('id').single();
    if (insertError) return json({ error: 'Could not start the payment. Try again.' }, 500);

    let ref: string;
    try {
      ref = await provider.request({ paymentId: pay.id, phone, amount, plan, shopName: who.shop.name || 'Kivu POS' });
    } catch (e) {
      await admin.rpc('kivu_fail_momo_payment', { p_payment_id: pay.id, p_reason: e instanceof Error ? e.message : 'Request refused' });
      return json({ error: 'The payment prompt could not be sent. Check the number and try again.' }, 502);
    }
    await admin.from('subscription_payments').update({ provider_ref: ref, reference: ref, updated_at: new Date().toISOString() }).eq('id', pay.id);
    return json({ id: pay.id, amount, status: 'pending' });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Payment service error' }, 500);
  }
});
