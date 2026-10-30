import { Check } from 'lucide-react';
import { useShop } from '@/auth/AuthProvider';
import { useAction } from '@/data/hooks';
import { useFeedback } from '@/components/feedback';
import { Badge, Button, Card, Notice, PageHeader, cx } from '@/components/ui';
import { PLANS, planFor, subscriptionStatus, type Feature } from '@/lib/access';
import { formatDate, money } from '@/lib/format';
import { rpc } from '@/lib/supabase';

const FEATURE_TEXT: Record<Feature, string> = {
  expenses: 'Expense tracking', suppliers: 'Suppliers, purchases and supplier debts', staff: 'Staff accounts with roles',
  shifts: 'Cash shifts and Z-reports', tables: 'Tables, bills and kitchen queue', approvals: 'Approvals for voids and stock changes', audit: 'Full audit log'
};
const CORE = ['Point of sale with receipts', 'Products and stock movements', 'Reports and CSV export', 'Works offline'];
const STATUS_TONE = { active: 'good', trial: 'info', grace: 'warn', expired: 'bad', suspended: 'bad', cancelled: 'bad' } as const;

export default function Plans() {
  const { shop } = useShop();
  const { confirm } = useFeedback();
  const status = subscriptionStatus(shop);
  const current = planFor(shop.plan);

  const request = useAction(async (plan: string) => rpc('request_plan_change', { p_plan: plan }),
    { success: 'Request sent. Platinum Tech will confirm payment and switch your plan.' });

  return (
    <>
      <PageHeader title="Plan & billing" description="Choose the plan that fits your business. Prices are in Rwandan Francs." />

      <Card className="mb-6">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
          <div><p className="text-xs text-zinc-500">Current plan</p><p className="text-lg font-semibold">{current.label}</p></div>
          <div><p className="text-xs text-zinc-500">Status</p><Badge tone={STATUS_TONE[status]}>{status.charAt(0).toUpperCase() + status.slice(1)}</Badge></div>
          <div><p className="text-xs text-zinc-500">{status === 'trial' ? 'Trial ends' : 'Renews / expires'}</p><p className="font-medium">{shop.plan === 'one_time' ? 'Never — paid once' : formatDate(status === 'trial' ? shop.trial_ends_at : shop.current_period_end)}</p></div>
        </div>
        <Notice className="mt-4">Pay with MTN Mobile Money or Airtel Money, then request the plan below. Your current plan stays active until Platinum Tech confirms the payment.</Notice>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {PLANS.map(p => {
          const isCurrent = p.key === current.key;
          const popular = p.key === 'business';
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
              <Button className="mt-5 w-full" variant={popular ? 'primary' : 'secondary'} disabled={isCurrent && status !== 'expired'} loading={request.isPending && request.variables === p.key}
                onClick={async () => { if (await confirm({ title: `Request ${p.label}?`, message: `${money(p.price)}${p.oneTime ? ' once' : ' per month'}. Your plan changes after payment is confirmed.`, confirmLabel: 'Send request' })) request.mutate(p.key); }}>
                {isCurrent ? (status === 'expired' ? 'Renew' : 'Your plan') : 'Request this plan'}
              </Button>
            </div>
          );
        })}
      </div>
    </>
  );
}
