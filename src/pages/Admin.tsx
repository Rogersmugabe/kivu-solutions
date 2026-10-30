import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Ban, CheckCircle2, CreditCard } from 'lucide-react';
import { useAction } from '@/data/hooks';
import { useFeedback } from '@/components/feedback';
import { Badge, Button, Card, Dialog, EmptyState, Field, Input, MoneyInput, Notice, PageHeader, SearchInput, Select, Spinner, Stat } from '@/components/ui';
import { PLANS, planFor } from '@/lib/access';
import { businessDay, formatDateTime, money } from '@/lib/format';
import { rpc } from '@/lib/supabase';

interface AdminShop { id: string; name: string; province?: string; district?: string; plan?: string; subscription_status?: string; platform_suspended?: boolean; onboarding_status?: string }
interface Overview { total_shops?: number; active_shops?: number; inactive_shops?: number; needs_assistance?: number; estimated_mrr?: number }
interface SupportView { shop?: AdminShop & { app_version?: string }; sales_today?: number; transactions_today?: number; low_stock?: number; supplier_debt?: number; pending_approvals?: number; staff?: { name: string; role?: string; active?: boolean }[]; payments?: { amount: number; plan: string; payment_method?: string; created_at: string; status?: string }[]; recent_audit?: { action: string; user_name?: string; created_at: string }[] }

export default function Admin() {
  const qc = useQueryClient();
  const { prompt } = useFeedback();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const today = businessDay(new Date());
  const [pay, setPay] = useState({ amount: 0, plan: 'business', method: 'Mobile Money', reference: '', from: today, to: today, note: '' });

  const overview = useQuery({ queryKey: ['admin_overview'], queryFn: () => rpc<Overview>('duka_admin_overview_v41') });
  const shops = useQuery({ queryKey: ['admin_shops'], queryFn: () => rpc<AdminShop[]>('duka_admin_shops_v41') });
  const status = useQuery({ queryKey: ['app_status'], queryFn: () => rpc<{ maintenance_mode?: boolean; maintenance_message?: string; current_version?: string; minimum_version?: string }>('duka_app_status') });
  const support = useQuery({ queryKey: ['admin_support', selected], queryFn: () => rpc<SupportView>('duka_shop_support_view', { p_shop_id: selected }), enabled: !!selected });

  const refresh = () => { void qc.invalidateQueries({ queryKey: ['admin_shops'] }); void qc.invalidateQueries({ queryKey: ['admin_support'] }); void qc.invalidateQueries({ queryKey: ['admin_overview'] }); };
  const suspend = useAction(async ({ flag, reason }: { flag: boolean; reason: string }) => { await rpc('duka_set_shop_suspension', { p_shop_id: selected, p_suspended: flag, p_reason: reason }); refresh(); }, { success: 'Shop status updated' });
  const confirmPayment = useAction(async () => {
    if (!(pay.amount > 0)) throw new Error('Enter the amount received.');
    await rpc('duka_confirm_subscription_payment', { p_shop_id: selected, p_amount: pay.amount, p_plan: pay.plan, p_payment_method: pay.method, p_reference: pay.reference || null, p_covered_from: pay.from, p_covered_to: pay.to, p_note: pay.note || null });
    refresh();
  }, { success: 'Payment confirmed and plan activated' });

  const list = (shops.data ?? []).filter(s => !search || [s.name, s.province, s.district, s.plan, s.subscription_status].some(v => String(v || '').toLowerCase().includes(search.toLowerCase())));
  const o = overview.data ?? {};
  const d = support.data;

  return (
    <>
      <PageHeader title="Platform admin" description="All Kivu shops: subscriptions, suspensions and support." />
      {status.data?.maintenance_mode && <Notice tone="warn" className="mb-4">Maintenance mode is ON: {status.data.maintenance_message}</Notice>}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Shops" value={o.total_shops ?? '—'} />
        <Stat label="Active" value={o.active_shops ?? '—'} />
        <Stat label="Inactive" value={o.inactive_shops ?? '—'} />
        <Stat label="Estimated monthly revenue" value={money(o.estimated_mrr)} />
      </div>
      <Card bodyClassName="p-0">
        <div className="border-b border-zinc-100 p-4"><SearchInput value={search} onChange={setSearch} placeholder="Shop, district, plan or status" /></div>
        {shops.isLoading ? <Spinner /> : shops.error ? <div className="p-5"><Notice tone="bad">{(shops.error as Error).message}</Notice></div> : !list.length ? <EmptyState icon={<Building2 />} title="No shops found" /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead><tr><th className="th">Shop</th><th className="th">Location</th><th className="th">Plan</th><th className="th">Status</th><th className="th" /></tr></thead>
              <tbody>{list.map(s => (
                <tr key={s.id} className="hover:bg-zinc-50/70">
                  <td className="td font-medium">{s.name}{s.platform_suspended && <Badge tone="bad" className="ml-2">Suspended</Badge>}</td>
                  <td className="td text-zinc-600">{[s.district, s.province].filter(Boolean).join(', ') || '—'}</td>
                  <td className="td">{planFor(s.plan).label}</td>
                  <td className="td"><Badge tone={s.subscription_status === 'active' ? 'good' : s.subscription_status === 'trial' ? 'info' : 'warn'}>{s.subscription_status || 'active'}</Badge></td>
                  <td className="td text-right"><Button size="sm" variant="ghost" onClick={() => setSelected(s.id)}>Open</Button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Card>

      <Dialog open={!!selected} onClose={() => setSelected(null)} title={d?.shop?.name ?? 'Shop'} description={d?.shop ? [d.shop.district, planFor(d.shop.plan).label, d.shop.subscription_status, d.shop.app_version && `App ${d.shop.app_version}`].filter(Boolean).join(' · ') : undefined} size="lg"
        footer={d?.shop && <>
          {d.shop.platform_suspended
            ? <Button icon={<CheckCircle2 />} onClick={async () => { const r = await prompt({ title: 'Reactivate shop', label: 'Reason', required: true }); if (r) suspend.mutate({ flag: false, reason: r }); }}>Reactivate</Button>
            : <Button variant="subtle-danger" icon={<Ban />} onClick={async () => { const r = await prompt({ title: 'Suspend shop', label: 'Reason', required: true, confirmLabel: 'Suspend' }); if (r) suspend.mutate({ flag: true, reason: r }); }}>Suspend</Button>}
          <Button variant="primary" icon={<CreditCard />} onClick={() => setPayOpen(true)}>Confirm payment</Button>
        </>}>
        {support.isLoading ? <Spinner /> : support.error ? <Notice tone="bad">{(support.error as Error).message}</Notice> : d && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Sales today" value={money(d.sales_today)} /><Stat label="Transactions" value={d.transactions_today ?? 0} /><Stat label="Low stock" value={d.low_stock ?? 0} /><Stat label="Pending approvals" value={d.pending_approvals ?? 0} />
            </div>
            <section><h3 className="mb-2 text-sm font-semibold">Staff</h3>{(d.staff ?? []).length ? <ul className="space-y-1 text-sm">{d.staff!.map((s, i) => <li key={i} className="flex justify-between"><span>{s.name} · {s.role}</span><Badge tone={s.active ? 'good' : 'neutral'}>{s.active ? 'Active' : 'Disabled'}</Badge></li>)}</ul> : <p className="text-sm text-zinc-500">No staff.</p>}</section>
            <section><h3 className="mb-2 text-sm font-semibold">Subscription payments</h3>{(d.payments ?? []).length ? <ul className="space-y-1 text-sm">{d.payments!.map((p, i) => <li key={i} className="flex justify-between gap-3"><span>{money(p.amount)} · {p.plan} · {p.payment_method}</span><span className="text-zinc-500">{formatDateTime(p.created_at)}</span></li>)}</ul> : <p className="text-sm text-zinc-500">None recorded.</p>}</section>
            <section><h3 className="mb-2 text-sm font-semibold">Recent activity</h3>{(d.recent_audit ?? []).length ? <ul className="space-y-1 text-sm">{d.recent_audit!.slice(0, 12).map((a, i) => <li key={i}>{a.user_name || 'System'} {a.action} <span className="text-zinc-500">· {formatDateTime(a.created_at)}</span></li>)}</ul> : <p className="text-sm text-zinc-500">No recent activity.</p>}</section>
          </div>
        )}
      </Dialog>

      <Dialog open={payOpen} onClose={() => setPayOpen(false)} title="Confirm subscription payment"
        footer={<><Button onClick={() => setPayOpen(false)}>Cancel</Button><Button variant="primary" type="submit" form="pay-confirm" loading={confirmPayment.isPending}>Confirm & activate</Button></>}>
        <form id="pay-confirm" className="grid gap-4 sm:grid-cols-2" onSubmit={(e: FormEvent) => { e.preventDefault(); confirmPayment.mutate(undefined as never, { onSuccess: () => setPayOpen(false) }); }}>
          <Field label="Amount received"><MoneyInput value={pay.amount || ''} onChange={v => setPay(p => ({ ...p, amount: v }))} /></Field>
          <Field label="Plan"><Select value={pay.plan} onChange={e => setPay(p => ({ ...p, plan: e.target.value }))}>{PLANS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}</Select></Field>
          <Field label="Method"><Select value={pay.method} onChange={e => setPay(p => ({ ...p, method: e.target.value }))}><option>Mobile Money</option><option>Bank</option><option>Cash</option></Select></Field>
          <Field label="Reference"><Input value={pay.reference} onChange={e => setPay(p => ({ ...p, reference: e.target.value }))} placeholder="MoMo transaction ID" /></Field>
          <Field label="Covers from"><Input type="date" value={pay.from} onChange={e => setPay(p => ({ ...p, from: e.target.value }))} /></Field>
          <Field label="Covers to"><Input type="date" value={pay.to} onChange={e => setPay(p => ({ ...p, to: e.target.value }))} /></Field>
          <Field label="Note" className="sm:col-span-2"><Input value={pay.note} onChange={e => setPay(p => ({ ...p, note: e.target.value }))} /></Field>
        </form>
      </Dialog>
    </>
  );
}
