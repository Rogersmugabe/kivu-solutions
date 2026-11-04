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

const headers = { 'Ocp-Apim-Subscription-Key': key, 'Content-Type': 'application/json' };
const wait = ms => new Promise(r => setTimeout(r, ms));

// MTN's sandbox sometimes answers 500 even when the user was created, so check before retrying.
async function createUser() {
  for (let attempt = 1; attempt <= 4; attempt++) {
    const user = crypto.randomUUID();
    const created = await fetch(`${base}/v1_0/apiuser`, {
      method: 'POST',
      headers: { ...headers, 'X-Reference-Id': user },
      body: JSON.stringify({ providerCallbackHost: callbackHost })
    });
    if (created.status === 201) return user;
    const detail = await created.text();
    await wait(2000);
    const check = await fetch(`${base}/v1_0/apiuser/${user}`, { headers });
    if (check.status === 200) return user;
    console.error(`Attempt ${attempt}: MTN could not create the API user (${created.status}): ${detail}`);
    if (created.status < 500) break; // a 4xx will not fix itself
    await wait(attempt * 3000);
  }
  return null;
}

const user = await createUser();
if (!user) {
  console.error('\nNo API user was created. A 401 means the key is wrong or not subscribed to Collections; a 500 is a problem on MTN\'s side: try again later, or send MTN support the activityId above.');
  process.exit(1);
}

let apiKey = null;
for (let attempt = 1; attempt <= 3 && !apiKey; attempt++) {
  const keyRes = await fetch(`${base}/v1_0/apiuser/${user}/apikey`, { method: 'POST', headers });
  if (keyRes.status === 201) apiKey = (await keyRes.json()).apiKey;
  else { console.error(`Attempt ${attempt}: could not create the API key (${keyRes.status}): ${await keyRes.text()}`); await wait(3000); }
}
if (!apiKey) process.exit(1);

console.log('Sandbox API user created. Store the secrets in Supabase (not in the app):\n');
console.log(`npx supabase secrets set --project-ref frduolsneevyndnebxvy MOMO_SUBSCRIPTION_KEY=${key} MOMO_API_USER=${user} MOMO_API_KEY=${apiKey} MOMO_TARGET_ENV=sandbox`);
