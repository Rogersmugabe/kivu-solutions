import { useEffect, useState, type FormEvent } from 'react';
import { Eye, EyeOff, Store, UserRound, BarChart3, ShieldCheck, Boxes } from 'lucide-react';
import { supabase, staffAuthEmail, friendlyError } from '@/lib/supabase';
import { isValidRwPhone, normalizeRwPhone } from '@/lib/format';
import { Button, Field, Input, Notice, Segmented, cx } from '@/components/ui';

type Mode = 'signin' | 'signup';
type Who = 'owner' | 'staff';

function PasswordInput({ value, onChange, placeholder, autoComplete, numeric }: { value: string; onChange: (v: string) => void; placeholder?: string; autoComplete?: string; numeric?: boolean }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={e => onChange(numeric ? e.target.value.replace(/\D/g, '').slice(0, 6) : e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        inputMode={numeric ? 'numeric' : undefined}
        className="pr-10"
        required
      />
      <button type="button" onClick={() => setShow(s => !s)} aria-label={show ? 'Hide' : 'Show'} className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded text-zinc-400 hover:text-zinc-700">
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

export function AuthScreen({ blockedMessage }: { blockedMessage?: string }) {
  const [mode, setMode] = useState<Mode>(() => (window.location.hash.includes('signup') ? 'signup' : 'signin'));
  const [who, setWho] = useState<Who>('owner');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(blockedMessage ?? null);
  const [info, setInfo] = useState<string | null>(null);
  const [recovery, setRecovery] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [shopName, setShopName] = useState('');
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [inviteCode, setInviteCode] = useState('');

  useEffect(() => { setError(blockedMessage ?? null); }, [blockedMessage]);
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange(event => { if (event === 'PASSWORD_RECOVERY') setRecovery(true); });
    return () => data.subscription.unsubscribe();
  }, []);

  const reset = () => { setError(null); setInfo(null); };

  async function submit(e: FormEvent) {
    e.preventDefault();
    reset();
    setBusy(true);
    try {
      if (recovery) {
        if (password.length < 8) throw new Error('Use at least 8 characters for your new password.');
        const { error: err } = await supabase.auth.updateUser({ password });
        if (err) throw err;
        setRecovery(false);
        setInfo('Password changed. You are signed in.');
        return;
      }
      if (who === 'staff') {
        const p = normalizeRwPhone(phone);
        if (!isValidRwPhone(p)) throw new Error('Enter a valid Rwanda phone number, for example 0788 123 456.');
        if (!/^\d{6}$/.test(pin)) throw new Error('Your PIN must be exactly 6 digits.');
        if (mode === 'signin') {
          const { error: err } = await supabase.auth.signInWithPassword({ email: staffAuthEmail(p), password: pin });
          if (err) throw new Error(/invalid login/i.test(err.message) ? 'Phone number or PIN is incorrect.' : err.message);
        } else {
          if (!fullName.trim() || !inviteCode.trim()) throw new Error('Enter your full name and the invite code from your manager.');
          const { data, error: err } = await supabase.auth.signUp({
            email: staffAuthEmail(p),
            password: pin,
            options: { data: { full_name: fullName.trim(), staff_invite_code: inviteCode.trim().toUpperCase(), staff_phone: p, login_method: 'phone_pin' } }
          });
          if (err) throw new Error(/already/i.test(err.message) ? 'This phone number already has a staff account. Sign in instead.' : err.message);
          if (!data.session) setInfo('Account created, but this Supabase project requires email confirmation. Ask the owner to turn off "Confirm email" for staff sign-up.');
        }
      } else if (mode === 'signin') {
        const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (err) throw new Error(/invalid login/i.test(err.message) ? 'Email or password is incorrect.' : err.message);
      } else {
        if (!fullName.trim() || !shopName.trim()) throw new Error('Enter your name and your business name.');
        if (password.length < 8) throw new Error('Use at least 8 characters for your password.');
        const { data, error: err } = await supabase.auth.signUp({ email: email.trim(), password, options: { data: { full_name: fullName.trim(), shop_name: shopName.trim() } } });
        if (err) throw err;
        if (!data.session) setInfo('Account created. Check your email to confirm it, then sign in.');
      }
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  async function forgotPassword() {
    reset();
    if (!email.trim()) { setError('Enter your email first, then choose "Forgot password".'); return; }
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.href.split('#')[0] });
    if (err) setError(friendlyError(err)); else setInfo('Password reset link sent. Check your email.');
  }

  const features = [
    { icon: Store, text: 'Fast counter checkout with barcode scanning and cash, MoMo or bank payments.' },
    { icon: Boxes, text: 'Every stock movement recorded — sales, deliveries, adjustments and losses.' },
    { icon: ShieldCheck, text: 'Staff sign in with their own role. Voids and adjustments need approval.' },
    { icon: BarChart3, text: 'Know your takings, profit and cash drawer at any moment.' }
  ];

  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <div className="flex flex-col px-6 py-8 sm:px-12">
        <div className="flex items-center gap-2.5">
          <div className="grid size-9 place-items-center rounded-xl bg-ink text-base font-bold text-white">K</div>
          <span className="text-lg font-semibold tracking-tight">Kivu POS</span>
        </div>

        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">
          <h1 className="text-[28px] font-semibold tracking-tight">{recovery ? 'Choose a new password' : mode === 'signin' ? 'Welcome back' : who === 'owner' ? 'Create your business' : 'Join your team'}</h1>
          <p className="mt-1.5 text-sm text-zinc-500">
            {recovery ? 'Enter a new password for your owner account.' : mode === 'signin' ? 'Sign in to your shop.' : who === 'owner' ? 'Start selling and tracking stock in minutes.' : 'Use the invite code your manager gave you.'}
          </p>

          {!recovery && (
            <div className="mt-6 flex flex-col gap-3">
              <Segmented label="Sign in or sign up" value={mode} onChange={v => { setMode(v); reset(); }} options={[{ value: 'signin', label: 'Sign in' }, { value: 'signup', label: 'Create account' }]} />
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Account type">
                {([['owner', 'Owner', Store], ['staff', 'Staff', UserRound]] as const).map(([value, label, Icon]) => (
                  <button key={value} type="button" role="radio" aria-checked={who === value} onClick={() => { setWho(value); reset(); }}
                    className={cx('flex h-11 items-center justify-center gap-2 rounded-lg border text-sm font-medium transition', who === value ? 'border-ink bg-ink text-white' : 'border-zinc-300 bg-white text-zinc-700 hover:border-zinc-400')}>
                    <Icon className="size-4" /> {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <form onSubmit={submit} className="mt-6 flex flex-col gap-4" noValidate>
            {recovery ? (
              <Field label="New password"><PasswordInput value={password} onChange={setPassword} autoComplete="new-password" placeholder="At least 8 characters" /></Field>
            ) : who === 'owner' ? (
              <>
                {mode === 'signup' && (
                  <>
                    <Field label="Your full name"><Input value={fullName} onChange={e => setFullName(e.target.value)} autoComplete="name" required /></Field>
                    <Field label="Business name"><Input value={shopName} onChange={e => setShopName(e.target.value)} placeholder="e.g. Kigali Mini Market" required /></Field>
                  </>
                )}
                <Field label="Email"><Input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" placeholder="you@business.com" required /></Field>
                <Field label="Password"><PasswordInput value={password} onChange={setPassword} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} placeholder={mode === 'signup' ? 'At least 8 characters' : undefined} /></Field>
              </>
            ) : (
              <>
                {mode === 'signup' && (
                  <>
                    <Field label="Invite code" hint="6 characters, from the owner or manager."><Input value={inviteCode} onChange={e => setInviteCode(e.target.value.toUpperCase().slice(0, 12))} className="font-mono tracking-widest" required /></Field>
                    <Field label="Your full name"><Input value={fullName} onChange={e => setFullName(e.target.value)} autoComplete="name" required /></Field>
                  </>
                )}
                <Field label="Phone number"><Input type="tel" value={phone} onChange={e => setPhone(e.target.value)} autoComplete="tel" placeholder="0788 123 456" required /></Field>
                <Field label={mode === 'signup' ? 'Choose a 6-digit PIN' : 'PIN'} hint={mode === 'signup' ? 'You will use this PIN to sign in.' : undefined}>
                  <PasswordInput value={pin} onChange={setPin} numeric autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} placeholder="••••••" />
                </Field>
              </>
            )}

            {error && <Notice tone="bad">{error}</Notice>}
            {info && <Notice tone="good">{info}</Notice>}

            <Button type="submit" variant="primary" size="lg" loading={busy} className="mt-1 w-full">
              {recovery ? 'Save password' : mode === 'signin' ? 'Sign in' : who === 'owner' ? 'Create business' : 'Join team'}
            </Button>
            {!recovery && mode === 'signin' && who === 'owner' && (
              <button type="button" onClick={forgotPassword} className="text-sm font-medium text-zinc-600 hover:text-zinc-900">Forgot password?</button>
            )}
            {!recovery && mode === 'signin' && who === 'staff' && (
              <p className="text-center text-[13px] text-zinc-500">Forgot your PIN? Ask the owner to reset your staff account.</p>
            )}
          </form>
        </div>

        <p className="text-xs text-zinc-400">
          <a className="hover:text-zinc-600" href="./legal/terms.html">Terms</a> · <a className="hover:text-zinc-600" href="./legal/privacy.html">Privacy</a> · Platinum Tech
        </p>
      </div>

      <div className="relative hidden overflow-hidden bg-ink p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-24 -top-24 size-96 rounded-full bg-brand-600/30 blur-3xl" aria-hidden />
        <div className="absolute -bottom-32 -left-16 size-96 rounded-full bg-money-600/20 blur-3xl" aria-hidden />
        <div className="relative">
          <p className="text-sm font-medium text-zinc-400">For shops, bars and restaurants in Rwanda</p>
          <h2 className="mt-3 max-w-md text-4xl font-semibold leading-tight tracking-tight">Every franc and every item, accounted for.</h2>
        </div>
        <ul className="relative space-y-5">
          {features.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-start gap-3.5">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-white/10"><Icon className="size-4" /></span>
              <span className="pt-1.5 text-[15px] leading-relaxed text-zinc-300">{text}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
