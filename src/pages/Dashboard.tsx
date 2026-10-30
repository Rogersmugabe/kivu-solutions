import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { TrendingUp, TrendingDown, ReceiptText, Wallet, Coins, AlertTriangle, ShieldCheck, Package } from 'lucide-react';
import { useShop } from '@/auth/AuthProvider';
import { useApprovals, useBillPayments, useExpenses, useProducts, useSales } from '@/data/hooks';
import { BarChart, ShareBars } from '@/components/charts';
import { Badge, Card, EmptyState, PageHeader, Spinner, cx } from '@/components/ui';
import { businessDay, daysAgo, formatTime, minuteOfDay, money } from '@/lib/format';
import { baseUnit, groupReceipts, paymentBreakdown, stockStatus } from '@/lib/sales';
import type { Sale } from '@/lib/types';

/** Change against yesterday at the same time of day. Percentages only make sense when both
 *  days are positive; otherwise the plain difference is shown (e.g. profit going from negative). */
function Delta({ today, yesterday, goodWhenUp = true, format = money }: { today: number; yesterday: number; goodWhenUp?: boolean; format?: (n: number) => string }) {
  if (!today && !yesterday) return <span className="text-xs text-zinc-400">No activity yet</span>;
  const diff = today - yesterday;
  if (diff === 0) return <span className="text-xs text-zinc-500">Same as this time yesterday</span>;
  const up = diff > 0;
  const good = up === goodWhenUp;
  const label = today > 0 && yesterday > 0 ? `${Math.abs(Math.round((diff / yesterday) * 100))}%` : `${up ? '+' : '−'}${format(Math.abs(diff))}`;
  return (
    <span className={cx('inline-flex items-center gap-1 text-xs font-medium', good ? 'text-emerald-600' : 'text-red-600')}>
      {up ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}{label} vs this time yesterday
    </span>
  );
}

function Kpi({ label, value, icon, footer }: { label: string; value: string; icon: React.ReactNode; footer: React.ReactNode }) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium text-zinc-500">{label}</span>
        <span className="grid size-8 place-items-center rounded-lg bg-zinc-100 text-zinc-600 [&_svg]:size-4">{icon}</span>
      </div>
      <div className="mt-3 text-2xl font-semibold tracking-tight tabular">{value}</div>
      <div className="mt-1.5">{footer}</div>
    </div>
  );
}

export default function Dashboard() {
  const { shop, profile, hasFeature } = useShop();
  const sales = useSales(8);
  const expenses = useExpenses(8, hasFeature('expenses'));
  const products = useProducts();
  const approvals = useApprovals(hasFeature('approvals'));
  const bills = useBillPayments();

  const data = useMemo(() => {
    const s = (sales.data ?? []).filter(x => x.status !== 'voided');
    const e = (expenses.data ?? []).filter(x => x.approval_status !== 'rejected');
    const today = businessDay(new Date());
    const yesterday = daysAgo(1);
    const nowMin = minuteOfDay(new Date());
    const byDay = <T extends { created_at: string }>(rows: T[], d: string, uptoNow = false): T[] => rows.filter(r => businessDay(r.created_at) === d && (!uptoNow || minuteOfDay(r.created_at) <= nowMin));
    const sum = (rows: Sale[]) => rows.reduce((a, r) => a + Number(r.total || 0), 0);
    const cost = (rows: Sale[]) => rows.reduce((a, r) => a + Number(r.cost || 0), 0);
    const todaySales = byDay(s, today);
    const ySales = byDay(s, yesterday, true);
    const expToday = byDay(e, today).reduce((a, r) => a + Number(r.amount || 0), 0);
    const expY = byDay(e, yesterday, true).reduce((a, r) => a + Number(r.amount || 0), 0);
    const receiptsToday = new Set(todaySales.map(r => r.receipt_no || r.id)).size;
    const receiptsY = new Set(ySales.map(r => r.receipt_no || r.id)).size;

    const channels = { cash: 0, momo: 0, bank: 0, other: 0 };
    const groups = new Map<string, Sale[]>();
    for (const r of todaySales) { const k = r.receipt_no || r.id; groups.set(k, [...(groups.get(k) ?? []), r]); }
    for (const r of todaySales) { const b = paymentBreakdown(r, groups.get(r.receipt_no || r.id), bills); channels.cash += b.cash; channels.momo += b.momo; channels.bank += b.bank; channels.other += b.other; }

    const week = Array.from({ length: 7 }, (_, i) => {
      const d = daysAgo(6 - i);
      const label = i === 6 ? 'Today' : new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short' });
      return { label, value: sum(byDay(s, d)) };
    });

    const top = new Map<string, { name: string; qty: number; total: number }>();
    for (const r of s) {
      const t = top.get(r.product_id || r.product_name) ?? { name: r.product_name, qty: 0, total: 0 };
      t.qty += Number(r.qty || 0); t.total += Number(r.total || 0);
      top.set(r.product_id || r.product_name, t);
    }

    return {
      salesToday: sum(todaySales), salesY: sum(ySales),
      profitToday: sum(todaySales) - cost(todaySales) - expToday, profitY: sum(ySales) - cost(ySales) - expY,
      expToday, expY, receiptsToday, receiptsY, channels, week,
      top: [...top.values()].sort((a, b) => b.total - a.total).slice(0, 5),
      recent: groupReceipts(sales.data ?? []).slice(0, 6)
    };
  }, [sales.data, expenses.data, bills]);

  const lowStock = (products.data ?? []).filter(p => stockStatus(p) !== 'ok').sort((a, b) => Number(a.qty) - Number(b.qty));
  const stockValue = (products.data ?? []).reduce((a, p) => a + Math.max(0, Number(p.qty)) * Number(p.cost || 0), 0);
  const pending = (approvals.data ?? []).filter(a => a.status === 'pending');
  const firstName = (profile.full_name || '').split(' ')[0];

  if (sales.isLoading) return <Spinner />;

  return (
    <>
      <PageHeader
        title={firstName ? `Hello, ${firstName}` : shop.name}
        description={new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Africa/Kigali' })}
      />

      {pending.length > 0 && (
        <Link to="/approvals" className="mb-4 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 hover:bg-amber-100">
          <ShieldCheck className="size-4 shrink-0" /> <span className="flex-1"><b>{pending.length}</b> request{pending.length === 1 ? '' : 's'} waiting for your approval</span><span className="font-medium">Review →</span>
        </Link>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Sales today" value={money(data.salesToday)} icon={<Coins />} footer={<Delta today={data.salesToday} yesterday={data.salesY} />} />
        <Kpi label="Gross profit today" value={money(data.profitToday)} icon={<TrendingUp />} footer={<Delta today={data.profitToday} yesterday={data.profitY} />} />
        <Kpi label="Expenses today" value={money(data.expToday)} icon={<Wallet />} footer={<Delta today={data.expToday} yesterday={data.expY} goodWhenUp={false} />} />
        <Kpi label="Receipts today" value={String(data.receiptsToday)} icon={<ReceiptText />} footer={<Delta today={data.receiptsToday} yesterday={data.receiptsY} format={n => String(n)} />} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card title="Last 7 days" description="Sales per day, voids excluded" className="lg:col-span-2">
          <BarChart data={data.week} />
        </Card>
        <Card title="Payment channels" description="Today">
          {data.salesToday ? (
            <ShareBars items={[
              { label: 'Cash', value: data.channels.cash, color: '#0b0d12' },
              { label: 'Mobile Money', value: data.channels.momo, color: '#f5b400' },
              { label: 'Bank', value: data.channels.bank, color: '#3b6cf6' },
              ...(data.channels.other ? [{ label: 'Credit / other', value: data.channels.other, color: '#a1a1aa' }] : [])
            ]} />
          ) : <EmptyState title="No sales yet today" />}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card title="Recent receipts" actions={<Link to="/sales" className="text-[13px] font-medium text-zinc-600 hover:text-zinc-900">All sales →</Link>} bodyClassName="p-0" className="lg:col-span-2">
          {data.recent.length ? (
            <ul className="divide-y divide-zinc-100">
              {data.recent.map(r => (
                <li key={r.key} className="flex items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{r.rows[0].product_name}{r.rows.length > 1 ? ` + ${r.rows.length - 1} more` : ''}</p>
                    <p className="text-xs text-zinc-500">{r.rows[0].receipt_no || '—'} · {formatTime(r.createdAt)} · {r.rows[0].payment || 'Cash'} · {r.rows[0].employee_name || ''}</p>
                  </div>
                  {r.voided ? <Badge tone="bad">Voided</Badge> : <span className="text-sm font-semibold tabular">{money(r.total)}</span>}
                </li>
              ))}
            </ul>
          ) : <EmptyState icon={<ReceiptText />} title="No sales in the last week" />}
        </Card>

        <Card title="Stock alerts" description={`Stock value at cost: ${money(stockValue)}`} actions={<Link to="/stock" className="text-[13px] font-medium text-zinc-600 hover:text-zinc-900">Receive stock →</Link>} bodyClassName="p-0">
          {lowStock.length ? (
            <ul className="divide-y divide-zinc-100">
              {lowStock.slice(0, 6).map(p => (
                <li key={p.id} className="flex items-center gap-3 px-5 py-3">
                  <AlertTriangle className={cx('size-4 shrink-0', stockStatus(p) === 'out' ? 'text-red-500' : 'text-amber-500')} />
                  <span className="min-w-0 flex-1 truncate text-sm">{p.name}</span>
                  <Badge tone={stockStatus(p) === 'out' ? 'bad' : 'warn'}>{Number(p.qty)} {baseUnit(p).toLowerCase()}</Badge>
                </li>
              ))}
            </ul>
          ) : <EmptyState icon={<Package />} title="Stock levels are healthy" description="Everything is above its low-stock level." />}
        </Card>
      </div>

      <Card title="Best sellers" description="Last 7 days by revenue" className="mt-4" bodyClassName="p-0">
        {data.top.length ? (
          <table className="w-full">
            <thead><tr><th className="th">Product</th><th className="th text-right">Units</th><th className="th text-right">Revenue</th></tr></thead>
            <tbody>{data.top.map(t => <tr key={t.name}><td className="td font-medium">{t.name}</td><td className="td text-right tabular">{t.qty}</td><td className="td text-right font-medium tabular">{money(t.total)}</td></tr>)}</tbody>
          </table>
        ) : <EmptyState title="No sales yet" />}
      </Card>
    </>
  );
}
