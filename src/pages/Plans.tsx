import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Check, CheckCircle2, Smartphone, XCircle } from 'lucide-react';
import { useShop } from '@/auth/AuthProvider';
import { useAction, useSubscriptionPayments } from '@/data/hooks';
import { useFeedback } from '@/components/feedback';
import { Badge, Button, Card, Dialog, Field, Input, Notice, PageHeader, Segmented, Spinner, cx } from '@/components/ui';
import { PLANS, planFor, subscriptionStatus, type Feature, type Plan } from '@/lib/access';
import { formatDate, formatDateTime, money } from '@/lib/format';
import { callFunction, rpc } from '@/lib/supabase';

const FEATURE_TEXT: Record<Feature, string> = {
  expenses: 'Expense tracking', suppliers: 'Suppliers, purchases and supplier debts', staff: 'Staff accounts with roles',
  shifts: 'Cash shifts and Z-reports', tables: 'Tables, bills and kitchen queue', approvals: 'Approvals for voids and stock changes', audit: 'Full audit log'
};
const CORE = ['Point of sale with receipts', 'Products and stock movements', 'Reports and CSV export', 'Works offline'];
const STATUS_TONE = { active: 'good', trial: 'info', grace: 'warn', expired: 'bad', suspended: 'bad', cancelled: 'bad' } as const;
const PAY_TONE = { pending: 'warn', confirmed: 'good', failed: 'bad', rejected: 'bad', refunded: 'neutral' } as const;
const MONTH_OPTIONS = ['1', '3', '6', '12'] as const;
const POLL_MS = 4000;
const POLL_LIMIT = 45; // about 3 minutes, longer than MTN keeps a prompt open

type PayStep = { kind: 'form' } | { kind: 'waiting'; id: string; amount: number } | { kind: 'done' } | { kind: 'failed'; reason: string };

/** 0788 123 456 from +250788123456, for the phone field. */
const localPhone = (p?: string | null) => (p ? p.replace(/^\+?250/, '0') : '');

export default function Plans() {
  const { shop, reloadShop } = useShop();
  const { confirm } = useFeedback();
  const status = subscriptionStatus(shop);
  const current = planFor(shop.plan);
  const payments = useSubscriptionPayments();
  const refetchPayments = payments.refetch;

  const [plan, setPlan] = useState<Plan | null>(null);
  const [months, setMonths] = useState<(typeof MONTH_OPTIONS)[number]>('1');
  const [phone, setPhone] = useState(localPhone(shop.phone));
  const [step, setStep] = useState<PayStep>({ kind: 'form' });
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const polls = useRef(0);

  const request = useAction(async (key: string) => rpc('request_plan_change', { p_plan: key }),
    { success: 'Request sent. Platinum Tech will confirm your payment and switch your plan.' });

  const total = plan ? plan.price * (plan.oneTime ? 1 : Number(months)) : 0;

  function openPay(p: Plan) {
    setPlan(p); setMonths('1'); setStep({ kind: 'form' }); setStartError(null);
  }

  async function startPayment(e: FormEvent) {
    e.preventDefault();
    if (!plan) return;
    setStarting(true); setStartError(null);
    try {
      const res = await callFunction<{ id: string; amount: number }>('momo-pay', { action: 'start', plan: plan.key, months: Number(months), phone });
      polls.current = 0;
      setStep({ kind: 'waiting', id: res.id, amount: res.amount });
    } catch (err) {
      setStartError(err instanceof Error ? err.message : 'Could not start the payment.');
    } finally {
      setStarting(false);
    }
  }

  // While waiting, ask the server (which asks MTN) until the payment is settled.
  useEffect(() => {
    if (step.kind !== 'waiting') return;
    let cancelled = false;
    const timer = window.setInterval(async () => {
      polls.current += 1;
      try {
        const res = await callFunction<{ status: string; reason?: string | null }>('momo-pay', { action: 'status', id: step.id });
        if (cancelled) return;
        if (res.status === 'confirmed') {
          setStep({ kind: 'done' });
          await reloadShop();
          void refetchPayments();
        } else if (res.status === 'failed' || res.status === 'rejected') {
          setStep({ kind: 'failed', reason: res.reason || 'The payment did not go through.' });
          void refetchPayments();
        } else if (polls.current >= POLL_LIMIT) {
          setStep({ kind: 'failed', reason: 'No answer from MTN yet. If you approved it, your plan updates when MTN confirms. Check the payment history below.' });
          void refetchPayments();
        }
      } catch { /* network blip: keep waiting */ }
    }, POLL_MS);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [step, reloadShop, refetchPayments]);

  async function checkPending(id: string) {
    try {
      const res = await callFunction<{ status: string }>('momo-pay', { action: 'status', id });
      if (res.status === 'confirmed') await reloadShop();
    } finally {
      void refetchPayments();
    }
  }

  const closePay = () => { if (step.kind !== 'waiting') setPlan(null); };
  const pending = (payments.data ?? []).find(p => p.status === 'pending' && p.provider === 'mtn_momo');

  return (
    <>
      <PageHeader title="Plan & billing" description="Choose the plan that fits your business. Prices are in Rwandan Francs." />

      <Card className="mb-6">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
          <div><p className="text-xs text-zinc-500">Current plan</p><p className="text-lg font-semibold">{current.label}</p></div>
          <div><p className="text-xs text-zinc-500">Status</p><Badge tone={STATUS_TONE[status]}>{status.charAt(0).toUpperCase() + status.slice(1)}</Badge></div>
          <div><p className="text-xs text-zinc-500">{status === 'trial' ? 'Trial ends' : 'Renews / expires'}</p><p className="font-medium">{shop.plan === 'one_time' ? 'Never — paid once' : formatDate(status === 'trial' ? shop.trial_ends_at : shop.current_period_end)}</p></div>
        </div>
        <Notice className="mt-4">Pay with MTN MoMo and your plan switches on as soon as you approve the payment on your phone. Paying for the plan you already have adds the months after your current end date.</Notice>
        {pending && (
          <Notice tone="warn" className="mt-3">
            A MoMo payment of {money(pending.amount)} from {formatDateTime(pending.created_at)} is waiting for approval.{' '}
            <button type="button" className="font-semibold underline" onClick={() => void checkPending(pending.id)}>Check status</button>
          </Notice>
        )}
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {PLANS.map(p => {
          const isCurrent = p.key === current.key;
          const popular = p.key === 'business';
          const oneTimeOwned = isCurrent && p.oneTime;
          return (
            <div key={p.key} className={cx('card flex flex-col p-5', popular && 'ring-2 ring-ink', isCurrent && 'bg-zinc-50')}>
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-semibold">{p.label}</h2>
                {isCurrent ? <Badge tone="good">Current</Badge> : popular ? <Badge tone="info">Popular</Badge> : null}
              </div>
              <p className="mt-1 min-h-10 text-[13px] text-zinc-500">{p.tagline}</p>
              <p className="mt-4 text-2xl font-semibold tracking-tight tabular">{money(p.price)}<span className="text-sm font-normal text-zinc-500">{p.oneTime ? ' once' : ' / month'}</span></p>
              <ul className="mt-4 flex-1 space-y-2 text-[13px] text-zinc-700">
                {[...CORE, ...p.features.map(f => FEATURE_TEXT[f])].map(t => (
                  <li key={t} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-emerald-600" />{t}</li>
                ))}
              </ul>
              <Button className="mt-5 w-full" variant={popular ? 'primary' : 'secondary'} icon={<Smartphone />} disabled={oneTimeOwned} onClick={() => openPay(p)}>
                {oneTimeOwned ? 'Paid' : isCurrent ? 'Renew with MoMo' : 'Pay with MoMo'}
              </Button>
              {!oneTimeOwned && (
                <button type="button" className="mt-2 text-xs text-zinc-500 hover:text-zinc-800 disabled:opacity-50" disabled={request.isPending}
                  onClick={async () => { if (await confirm({ title: `Request ${p.label}?`, message: 'For Airtel Money or bank payments. Platinum Tech confirms your payment, then switches your plan.', confirmLabel: 'Send request' })) request.mutate(p.key); }}>
                  Airtel Money or bank? Request instead
                </button>
              )}
            </div>
          );
        })}
      </div>

      <Card title="Payment history" className="mt-6" bodyClassName="p-0">
        {payments.isLoading ? <Spinner /> : !(payments.data ?? []).length ? (
          <p className="px-5 py-6 text-sm text-zinc-500">No payments yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr><th className="th">Date</th><th className="th">Plan</th><th className="th text-right">Amount</th><th className="th">Method</th><th className="th">Covers</th><th className="th">Status</th></tr></thead>
              <tbody>
                {(payments.data ?? []).map(p => (
                  <tr key={p.id}>
                    <td className="td whitespace-nowrap">{formatDateTime(p.created_at)}</td>
                    <td className="td">{planFor(p.plan).label}{p.months && p.months > 1 ? ` · ${p.months} months` : ''}</td>
                    <td className="td text-right tabular">{money(p.amount)}</td>
                    <td className="td">{p.provider === 'mtn_momo' ? 'MTN MoMo' : p.payment_method}</td>
                    <td className="td whitespace-nowrap">{p.covered_from ? `${formatDate(p.covered_from)} – ${p.covered_to ? formatDate(p.covered_to) : 'forever'}` : '—'}</td>
                    <td className="td"><Badge tone={PAY_TONE[p.status] ?? 'neutral'}>{p.status.charAt(0).toUpperCase() + p.status.slice(1)}</Badge>{p.failure_reason && <p className="mt-1 text-xs text-zinc-500">{p.failure_reason}</p>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Dialog open={!!plan} onClose={closePay} title={plan ? `Pay for ${plan.label}` : 'Pay'} size="sm"
        footer={step.kind === 'form' ? <>
          <Button onClick={closePay}>Cancel</Button>
          <Button variant="money" type="submit" form="momo-form" loading={starting}>Pay {money(total)}</Button>
        </> : step.kind === 'waiting' ? undefined : <Button variant="primary" onClick={() => setPlan(null)}>{step.kind === 'done' ? 'Done' : 'Close'}</Button>}>
        {plan && step.kind === 'form' && (
          <form id="momo-form" className="grid gap-4" onSubmit={startPayment}>
            {!plan.oneTime && (
              <Field label="How many months?">
                <Segmented label="Months" value={months} onChange={setMonths} options={MONTH_OPTIONS.map(m => ({ value: m, label: m }))} />
              </Field>
            )}
            <Field label="MTN MoMo number" hint="You will get a prompt on this phone. Approve it with your MoMo PIN.">
              <Input value={phone} onChange={e => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" placeholder="0788 123 456" required data-autofocus />
            </Field>
            <div className="flex items-center justify-between rounded-lg bg-zinc-50 px-4 py-3 text-sm">
              <span className="text-zinc-600">{plan.label}{plan.oneTime ? ' · once' : ` · ${months} month${months === '1' ? '' : 's'}`}</span>
              <span className="text-base font-semibold tabular">{money(total)}</span>
            </div>
            {startError && <Notice tone="bad">{startError}</Notice>}
          </form>
        )}
        {step.kind === 'waiting' && (
          <div className="flex flex-col items-center gap-3 py-4 text-center" role="status" aria-live="polite">
            <Spinner />
            <p className="font-medium">Approve {money(step.amount)} on your phone</p>
            <p className="text-sm text-zinc-500">Enter your MoMo PIN in the prompt. If no prompt appears, check pending approvals in your MoMo menu. This page updates by itself.</p>
          </div>
        )}
        {step.kind === 'done' && (
          <div className="flex flex-col items-center gap-2 py-4 text-center" role="status">
            <CheckCircle2 className="size-10 text-emerald-600" />
            <p className="font-medium">Payment received</p>
            <p className="text-sm text-zinc-500">Your plan is now {plan?.label}. Thank you!</p>
          </div>
        )}
        {step.kind === 'failed' && (
          <div className="flex flex-col items-center gap-2 py-4 text-center" role="status">
            <XCircle className="size-10 text-red-600" />
            <p className="font-medium">Payment not completed</p>
            <p className="text-sm text-zinc-500">{step.reason}</p>
            <Button className="mt-2" onClick={() => setStep({ kind: 'form' })}>Try again</Button>
          </div>
        )}
      </Dialog>
    </>
  );
}
