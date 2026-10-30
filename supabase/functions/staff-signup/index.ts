// Kivu — staff sign-up (Supabase Edge Function)
//
// Staff sign in with phone number + 6-digit PIN. Behind the scenes their login is a placeholder
// address (staff.<phone>@auth.duka.local) that cannot receive email, so with "Confirm email"
// turned on they could never confirm and join. This function creates the staff login already
// confirmed — but only for someone holding a valid, unused, unexpired invite issued for that
// exact phone number. Owners keep normal email confirmation.
//
// After this succeeds the app signs the employee in, and claim_staff_invite() (database) does
// the rest: plan and business-type checks, profile, employee record and marking the invite used.
//
// Deploy (once):   supabase functions deploy staff-signup --no-verify-jwt
// (--no-verify-jwt because the person is not signed in yet; the invite itself is the credential.)

import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

function normalizeRwPhone(value: string): string {
  let p = String(value || '').replace(/[^0-9+]/g, '');
  if (p.startsWith('07')) p = `+250${p.slice(1)}`;
  else if (p.startsWith('250')) p = `+${p}`;
  return p;
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let body: { code?: string; full_name?: string; phone?: string; pin?: string };
  try { body = await req.json(); } catch { return json({ error: 'Invalid request' }, 400); }

  const code = String(body.code || '').trim().toUpperCase();
  const fullName = String(body.full_name || '').trim();
  const phone = normalizeRwPhone(String(body.phone || ''));
  const pin = String(body.pin || '');

  if (!code || !fullName) return json({ error: 'Enter your full name and the invite code from your manager.' }, 400);
  if (!/^\+2507\d{8}$/.test(phone)) return json({ error: 'Enter a valid Rwanda phone number, for example 0788 123 456.' }, 400);
  if (!/^\d{6}$/.test(pin)) return json({ error: 'Your PIN must be exactly 6 digits.' }, 400);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: invite, error: inviteError } = await admin
    .from('staff_invites')
    .select('id, phone, expires_at, used_at')
    .eq('code', code)
    .maybeSingle();
  // Same message for "no such code" and "wrong phone", so codes cannot be probed.
  const refused = 'This invite code is not valid for this phone number. Check both with your manager.';
  if (inviteError) return json({ error: 'Could not check the invite. Try again.' }, 500);
  if (!invite) return json({ error: refused }, 400);
  if (invite.used_at) return json({ error: 'This invite code has already been used.' }, 400);
  if (new Date(invite.expires_at).getTime() < Date.now()) return json({ error: 'This invite code has expired. Ask for a new one.' }, 400);
  if (invite.phone && normalizeRwPhone(invite.phone) !== phone) return json({ error: refused }, 400);

  const { error: createError } = await admin.auth.admin.createUser({
    email: `staff.${phone.replace(/\D/g, '')}@auth.duka.local`,
    password: pin,
    email_confirm: true,
    user_metadata: { full_name: fullName, staff_invite_code: code, staff_phone: phone, login_method: 'phone_pin' }
  });
  if (createError) {
    if (/already|registered|exists/i.test(createError.message)) return json({ error: 'This phone number already has a staff account. Sign in instead.' }, 409);
    return json({ error: createError.message }, 400);
  }
  return json({ ok: true });
});
