import { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { useShop } from '@/auth/AuthProvider';
import { useBillPayments, useExpenses, useSales } from '@/data/hooks';
import { BarChart, ShareBars } from '@/components/charts';
import { Button, Card, EmptyState, Notice, PageHeader, Segmented, Spinner, Stat } from '@/components/ui';
import { businessDay, daysAgo, formatDateTime, money } from '@/lib/format';
import { paymentBreakdown } from '@/lib/sales';
import { downloadCsv } from '@/lib/csv';
import type { Sale } from '@/lib/types';

type Period = '1' | '7' | '30' | '90';

export default function Reports() {
  const { shop, hasFeature } = useShop();
  const [period, setPeriod] = useState<Period>('30');
  const days = Number(period);
  const sales = useSales(days);
  const bills = useBillPayments();
  const expenses = useExpenses(days, hasFeature('expenses'));

  const r = useMemo(() => {
    const cutoff = days === 1 ? businessDay(new Date()) : daysAgo(days - 1);
    const s = (sales.data ?? []).filter(x => x.status !== 'voided' && businessDay(x.created_at) >= cutoff);
    const e = (expenses.data ?? []).filter(x => x.approval_status !== 'rejected' && businessDay(x.created_at) >= cutoff);
    const revenue = s.reduce((a, x) => a + Number(x.total || 0), 0);
    const cogs = s.reduce((a, x) => a + Number(x.cost || 0), 0);
    const exp = e.reduce((a, x) => a + Number(x.amount || 0), 0);
    const receipts = new Set(s.map(x => x.receipt_no || x.id)).size;
    const discounts = s.reduce((a, x) => a + Number(x.discount || 0), 0);

    const groups = new Map<string, Sale[]>();
    for (const x of s) { const k = x.receipt_no || x.id; groups.set(k, [...(groups.get(k) ?? []), x]); }
    const pay = { cash: 0, momo: 0, bank: 0, other: 0 };
    for (const x of s) { const b = paymentBreakdown(x, groups.get(x.receipt_no || x.id), bills); pay.cash += b.cash; pay.momo += b.momo; pay.bank += b.bank; pay.other += b.other; }

    const products = new Map<string, { name: string; qty: number; revenue: number; cost: number }>();
    const staff = new Map<string, { name: string; receipts: Set<string>; revenue: number }>();
    for (const x of s) {
      const p = products.get(x.product_id || x.product_name) ?? { name: x.product_name, qty: 0, revenue: 0, cost: 0 };
      p.qty += Number(x.qty || 0); p.revenue += Number(x.total || 0); p.cost += Number(x.cost || 0);
      products.set(x.product_id || x.product_name, p);
      const who = x.employee_name || 'Unknown';
      const st = staff.get(who) ?? { name: who, receipts: new Set<string>(), revenue: 0 };
      st.receipts.add(x.receipt_no || x.id); st.revenue += Number(x.total || 0);
      staff.set(who, st);
    }

    const buckets = days <= 30 ? days : 13;
    const chart = days === 1 ? [] : Array.from({ length: buckets }, (_, i) => {
      if (days <= 30) {
        const d = daysAgo(buckets - 1 - i);
        return { label: new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', days <= 7 ? { weekday: 'short' } : { day: 'numeric' }), value: s.filter(x => businessDay(x.created_at) === d).reduce((a, x) => a + Number(x.total || 0), 0) };
      }
      const from = daysAgo((buckets - i) * 7 - 1), to = daysAgo((buckets - 1 - i) * 7);
      return { label: new Date(`${to}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }), value: s.filter(x => { const d = businessDay(x.created_at); return d >= from && d <= to; }).reduce((a, x) => a + Number(x.total || 0), 0) };
    });

    return {
      s, revenue, cogs, gross: revenue - cogs, exp, net: revenue - cogs - exp, receipts, discounts, pay, chart,
      margin: revenue ? Math.round(((revenue - cogs) / revenue) * 100) : 0,
      basket: receipts ? Math.round(revenue / receipts) : 0,
      products: [...products.values()].sort((a, b) => b.revenue - a.revenue),
      staff: [...staff.values()].sort((a, b) => b.revenue - a.revenue)
    };
  }, [sales.data, expenses.data, days, bills]);

  function exportAccountant() {
    const rate = Math.max(0, Number(shop.tax_rate || 0));
    downloadCsv(`kivu-report-${period}d-${businessDay(new Date())}.csv`, r.s.map(x => {
      const net = Number(x.total || 0);
      return { date: formatDateTime(x.created_at), receipt: x.receipt_no, product: x.product_name, quantity: x.qty, sales: net, discount: x.discount || 0, cost: x.cost || 0, gross_profit: net - Number(x.cost || 0), tax_included: rate ? Math.round((net * rate) / (100 + rate)) : 0, payment: x.payment, staff: x.employee_name };
    }));
  }

  if (sales.isLoading) return <Spinner />;
  const capped = (sales.data?.length ?? 0) >= 5000;

  return (
    <>
      <PageHeader
        title="Reports"
        description="Takings, profit and what sells — voided sales excluded."
        actions={<>
          <Segmented label="Period" value={period} onChange={setPeriod} options={[{ value: '1', label: 'Today' }, { value: '7', label: '7 days' }, { value: '30', label: '30 days' }, { value: '90', label: '90 days' }]} />
          <Button icon={<Download />} disabled={!r.s.length} onClick={exportAccountant}>Export for accountant</Button>
        </>}
      />
      {capped && <Notice tone="warn" className="mb-4">This period has more than 5,000 sale lines; figures cover the latest 5,000. Choose a shorter period for exact totals.</Notice>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Sales" value={money(r.revenue)} hint={`${r.receipts} receipts · avg ${money(r.basket)}`} />
        <Stat label="Gross profit" value={money(r.gross)} hint={`${r.margin}% margin after cost of goods`} tone={r.gross < 0 ? 'bad' : 'good'} />
        <Stat label="Expenses" value={money(r.exp)} />
        <Stat label="Net profit" value={money(r.net)} hint="Gross profit − expenses" tone={r.net < 0 ? 'bad' : 'good'} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card title="Sales over time" className="lg:col-span-2">
          {r.chart.length ? <BarChart data={r.chart} /> : <p className="text-sm text-zinc-500">Choose 7 days or longer to see a trend.</p>}
        </Card>
        <Card title="How customers paid">
          {r.revenue ? <ShareBars items={[{ label: 'Cash', value: r.pay.cash, color: '#0b0d12' }, { label: 'Mobile Money', value: r.pay.momo, color: '#f5b400' }, { label: 'Bank', value: r.pay.bank, color: '#3b6cf6' }, ...(r.pay.other ? [{ label: 'Credit / other', value: r.pay.other, color: '#a1a1aa' }] : [])]} /> : <EmptyState title="No sales in this period" />}
          {r.discounts > 0 && <p className="mt-4 text-xs text-zinc-500">Discounts given: {money(r.discounts)}</p>}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card title="Products" description="By revenue" className="lg:col-span-2" bodyClassName="p-0">
          {!r.products.length ? <EmptyState title="No sales in this period" /> : (
            <div className="max-h-[480px] overflow-auto">
              <table className="w-full min-w-[560px]">
                <thead className="sticky top-0"><tr><th className="th">Product</th><th className="th text-right">Units</th><th className="th text-right">Sales</th><th className="th text-right">Profit</th></tr></thead>
                <tbody>{r.products.map(p => (
                  <tr key={p.name}><td className="td font-medium">{p.name}</td><td className="td text-right tabular">{p.qty}</td><td className="td text-right tabular">{money(p.revenue)}</td><td className={`td text-right tabular ${p.revenue - p.cost < 0 ? 'text-red-600' : ''}`}>{money(p.revenue - p.cost)}</td></tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </Card>
        <Card title="Staff" description="Sales by who served" bodyClassName="p-0">
          {!r.staff.length ? <EmptyState title="No sales in this period" /> : (
            <ul className="divide-y divide-zinc-100">
              {r.staff.map(st => <li key={st.name} className="flex items-center justify-between gap-3 px-5 py-3"><div><p className="text-sm font-medium">{st.name}</p><p className="text-xs text-zinc-500">{st.receipts.size} receipts</p></div><span className="text-sm font-semibold tabular">{money(st.revenue)}</span></li>)}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
