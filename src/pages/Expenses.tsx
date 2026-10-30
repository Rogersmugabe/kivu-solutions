import { useMemo, useState, type FormEvent } from 'react';
import { Plus, Wallet, Download } from 'lucide-react';
import { useShop } from '@/auth/AuthProvider';
import { useAction, useExpenses } from '@/data/hooks';
import { ShareBars } from '@/components/charts';
import { Button, Card, Dialog, EmptyState, Field, Input, MoneyInput, PageHeader, Select, Spinner, Stat } from '@/components/ui';
import { businessDay, formatDateTime, money } from '@/lib/format';
import { downloadCsv } from '@/lib/csv';
import { rpc } from '@/lib/supabase';

export const EXPENSE_CATEGORIES = ['Rent', 'Salaries', 'Utilities', 'Transport', 'Supplies', 'Repairs', 'Taxes & fees', 'Marketing', 'Petty cash', 'Other'];
const COLORS = ['#0b0d12', '#3b6cf6', '#10b981', '#f5b400', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#64748b', '#a1a1aa'];

export default function Expenses() {
  const { can } = useShop();
  const [days, setDays] = useState(30);
  const [category, setCategory] = useState('all');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ description: '', amount: 0, category: 'Supplies' });
  const expenses = useExpenses(days);

  const list = (expenses.data ?? []).filter(e => e.approval_status !== 'rejected');
  const filtered = list.filter(e => category === 'all' || (e.category || 'Other') === category);
  const total = list.reduce((a, e) => a + Number(e.amount || 0), 0);
  const today = businessDay(new Date());
  const todayTotal = list.filter(e => businessDay(e.created_at) === today).reduce((a, e) => a + Number(e.amount || 0), 0);
  const byCategory = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of list) m.set(e.category || 'Other', (m.get(e.category || 'Other') || 0) + Number(e.amount || 0));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [list]);

  const add = useAction(async () => {
    if (!form.description.trim()) throw new Error('Describe what the money was spent on.');
    if (!(form.amount > 0)) throw new Error('Enter an amount above zero.');
    await rpc('record_expense', { p_description: form.description.trim(), p_amount: form.amount, p_category: form.category });
  }, { invalidate: ['expenses'], success: 'Expense recorded' });

  return (
    <>
      <PageHeader
        title="Expenses"
        description="Money spent running the business. Each entry records who added it."
        actions={<>
          <Button icon={<Download />} disabled={!list.length} onClick={() => downloadCsv(`kivu-expenses-${today}.csv`, list.map(e => ({ date: formatDateTime(e.created_at), description: e.description, category: e.category, amount: e.amount })))}>Export CSV</Button>
          {can('record_expense') && <Button variant="primary" icon={<Plus />} onClick={() => { setForm({ description: '', amount: 0, category: 'Supplies' }); setOpen(true); }}>Add expense</Button>}
        </>}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label="Today" value={money(todayTotal)} />
        <Stat label={`Last ${days} days`} value={money(total)} />
        <Stat label="Biggest category" value={byCategory[0]?.[0] ?? '—'} hint={byCategory[0] ? money(byCategory[0][1]) : undefined} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card bodyClassName="p-0" className="lg:col-span-2">
          <div className="flex flex-wrap items-center gap-2 border-b border-zinc-100 p-4">
            <Select aria-label="Period" value={days} onChange={e => setDays(Number(e.target.value))} className="w-auto"><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option></Select>
            <Select aria-label="Category" value={category} onChange={e => setCategory(e.target.value)} className="w-auto"><option value="all">All categories</option>{byCategory.map(([c]) => <option key={c}>{c}</option>)}</Select>
          </div>
          {expenses.isLoading ? <Spinner /> : !filtered.length ? <EmptyState icon={<Wallet />} title="No expenses in this period" /> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px]">
                <thead><tr><th className="th">Date</th><th className="th">Description</th><th className="th">Category</th><th className="th text-right">Amount</th></tr></thead>
                <tbody>{filtered.map(e => (
                  <tr key={e.id}><td className="td whitespace-nowrap text-zinc-600">{formatDateTime(e.created_at)}</td><td className="td font-medium">{e.description}</td><td className="td text-zinc-600">{e.category || 'Other'}</td><td className="td text-right font-medium tabular">{money(e.amount)}</td></tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </Card>
        <Card title="By category" description={`Last ${days} days`}>
          {byCategory.length ? <ShareBars items={byCategory.slice(0, 8).map(([label, value], i) => ({ label, value, color: COLORS[i % COLORS.length] }))} /> : <EmptyState title="Nothing spent yet" />}
        </Card>
      </div>

      <Dialog open={open} onClose={() => setOpen(false)} title="Add expense"
        footer={<><Button onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" type="submit" form="expense-form" loading={add.isPending}>Save expense</Button></>}>
        <form id="expense-form" className="grid gap-4" onSubmit={(e: FormEvent) => { e.preventDefault(); add.mutate(undefined as never, { onSuccess: () => setOpen(false) }); }}>
          <Field label="Description"><Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="e.g. Electricity token" autoFocus required /></Field>
          <Field label="Amount"><MoneyInput value={form.amount || ''} onChange={v => setForm(f => ({ ...f, amount: v }))} placeholder="0" /></Field>
          <Field label="Category"><Select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>{EXPENSE_CATEGORIES.map(c => <option key={c}>{c}</option>)}</Select></Field>
        </form>
      </Dialog>
    </>
  );
}
