// Creates an MTN MoMo *sandbox* API user and key for the momo-pay Edge Function.
// Run once, on your own computer, after subscribing to "Collections" on momodeveloper.mtn.com:
//
//   MOMO_SUBSCRIPTION_KEY=<your Collections primary key> node scripts/momo-sandbox-user.mjs
//
// (PowerShell:  $env:MOMO_SUBSCRIPTION_KEY="<key>"; node scripts/momo-sandbox-user.mjs)
//
// It prints the `supabase secrets set` command to run next. Nothing is saved to this project.
// Live (production) credentials are not made this way: MTN issues them after go-live.

const key = process.env.MOMO_SUBSCRIPTION_KEY;
const callbackHost = process.env.MOMO_CALLBACK_HOST || 'frduolsneevyndnebxvy.supabase.co';
const base = 'https://sandbox.momodeveloper.mtn.com';

if (!key) {
  console.error('Set MOMO_SUBSCRIPTION_KEY to your Collections primary key first.');
  process.exit(1);
}

const user = crypto.randomUUID();
const headers = { 'Ocp-Apim-Subscription-Key': key, 'Content-Type': 'application/json' };

const created = await fetch(`${base}/v1_0/apiuser`, {
  method: 'POST',
  headers: { ...headers, 'X-Reference-Id': user },
  body: JSON.stringify({ providerCallbackHost: callbackHost })
});
if (created.status !== 201) {
  console.error(`Could not create the API user (${created.status}): ${await created.text()}`);
  process.exit(1);
}

const keyRes = await fetch(`${base}/v1_0/apiuser/${user}/apikey`, { method: 'POST', headers });
if (keyRes.status !== 201) {
  console.error(`Could not create the API key (${keyRes.status}): ${await keyRes.text()}`);
  process.exit(1);
}
const { apiKey } = await keyRes.json();

console.log('Sandbox API user created. Store the secrets in Supabase (not in the app):\n');
console.log(`npx supabase secrets set --project-ref frduolsneevyndnebxvy MOMO_SUBSCRIPTION_KEY=${key} MOMO_API_USER=${user} MOMO_API_KEY=${apiKey} MOMO_TARGET_ENV=sandbox`);
