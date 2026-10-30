import { useState, type FormEvent } from 'react';
import { Clock, Printer, LogIn, LogOut, HandCoins } from 'lucide-react';
import { useShop } from '@/auth/AuthProvider';
import { useAction, useExpenses, useSales, useShifts, writeAudit } from '@/data/hooks';
import { usePrint, ZReport } from '@/components/print';
import { Badge, Button, Card, Dialog, EmptyState, Field, Input, MoneyInput, Notice, PageHeader, Spinner, Stat } from '@/components/ui';
import { formatDateTime, money } from '@/lib/format';
import { shiftTotals } from '@/lib/shifts';
import { rpc, supabase } from '@/lib/supabase';
import type { Shift } from '@/lib/types';

const PETTY_CASH_LIMIT = 20000;

export default function Shifts() {
  const { shop, session, profile, role, can } = useShop();
  const print = usePrint();
  const shifts = useShifts();
  const sales = useSales(35);
  const expenses = useExpenses(35);
  const [dialog, setDialog] = useState<'open' | 'close' | 'payout' | null>(null);
  const [opening, setOpening] = useState(0);
  const [counted, setCounted] = useState(0);
  const [reason, setReason] = useState('');
  const [payout, setPayout] = useState({ amount: 0, description: '' });

  const mine = (shifts.data ?? []).find(s => s.status === 'open' && s.user_id === session.user.id) ?? null;
  const seeExpected = can('see_money');
  const totals = (s: Shift) => shiftTotals(s, sales.data ?? [], expenses.data ?? []);
  const current = mine ? totals(mine) : null;
  const history = (shifts.data ?? []).filter(s => seeExpected || s.user_id === session.user.id);

  const openShift = useAction(async () => {
    const { error } = await supabase.from('shifts').insert({ shop_id: shop.id, user_id: session.user.id, employee_name: profile.full_name || role, opening_cash: Math.max(0, opening), status: 'open' });
    if (error) throw new Error(error.message);
    await writeAudit(shop.id, session.user.id, profile.full_name || role, 'opened shift', 'shift', { opening_cash: opening });
  }, { invalidate: ['shifts'], success: 'Shift opened' });

  const closeShift = useAction(async () => {
    if (!mine || !current) return null;
    const diff = counted - current.expected;
    // Cashiers count blind, so the reason is only required when a manager can see the difference.
    if (seeExpected && diff !== 0 && !reason.trim()) throw new Error('Explain the cash difference before closing.');
    await rpc('close_shift_controlled', { p_shift_id: mine.id, p_actual_cash: counted, p_variance_reason: reason.trim() || null });
    const { data } = await supabase.from('shifts').select('*').eq('id', mine.id).single();
    return (data as Shift) ?? null;
  }, { invalidate: ['shifts'], success: 'Shift closed' });

  const payOut = useAction(async () => {
    if (!(payout.amount > 0) || !payout.description.trim()) throw new Error('Enter the amount and what it was for.');
    if (payout.amount > PETTY_CASH_LIMIT && !can('record_expense')) throw new Error(`Pay-outs above ${money(PETTY_CASH_LIMIT)} must be recorded by a manager.`);
    await rpc('record_expense', { p_description: `Paid out from drawer: ${payout.description.trim()}`, p_amount: payout.amount, p_category: 'Petty cash' });
  }, { invalidate: ['expenses'], success: 'Pay-out recorded' });

  const printZ = (s: Shift) => print(<ZReport shop={shop} shift={s} totals={totals(s)} />);

  if (shifts.isLoading) return <Spinner />;

  return (
    <>
      <PageHeader
        title="Cash shifts"
        description="Open a shift with your float, sell, then count the drawer when you close."
        actions={mine ? <>
          <Button icon={<HandCoins />} onClick={() => { setPayout({ amount: 0, description: '' }); setDialog('payout'); }}>Pay out cash</Button>
          <Button icon={<Printer />} onClick={() => printZ(mine)}>Print X-report</Button>
          <Button variant="primary" icon={<LogOut />} onClick={() => { setCounted(0); setReason(''); setDialog('close'); }}>Close shift</Button>
        </> : <Button variant="primary" icon={<LogIn />} onClick={() => { setOpening(0); setDialog('open'); }}>Open shift</Button>}
      />

      {mine && current ? (
        <>
          <Notice tone="good" className="mb-4">Your shift is open since {formatDateTime(mine.opened_at)} with a float of <b>{money(mine.opening_cash)}</b>.</Notice>
          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Sales this shift" value={money(current.sales)} hint={`${current.count} receipt${current.count === 1 ? '' : 's'}`} />
            <Stat label="Cash" value={money(current.cash)} />
            <Stat label="Mobile Money + Bank" value={money(current.momo + current.bank)} />
            {seeExpected ? <Stat label="Expected in drawer" value={money(current.expected)} hint={current.expenses ? `after ${money(current.expenses)} paid out` : 'float + cash sales'} /> : <Stat label="Paid out" value={money(current.expenses)} />}
          </div>
        </>
      ) : (
        <div className="card mb-6"><EmptyState icon={<Clock />} title="You have no open shift" description="Open a shift before selling so your sales and cash are counted against your drawer." action={<Button variant="primary" icon={<LogIn />} onClick={() => { setOpening(0); setDialog('open'); }}>Open shift</Button>} /></div>
      )}

      <Card title={seeExpected ? 'Shift history' : 'Your shifts'} bodyClassName="p-0">
        {!history.length ? <EmptyState title="No shifts yet" /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead><tr><th className="th">Opened</th><th className="th">Staff</th><th className="th text-right">Sales</th>{seeExpected && <th className="th text-right">Expected cash</th>}<th className="th text-right">Counted</th>{seeExpected && <th className="th text-right">Difference</th>}<th className="th" /></tr></thead>
              <tbody>
                {history.map(s => {
                  const t = totals(s);
                  const diff = s.actual_cash != null ? Number(s.actual_cash) - (s.expected_cash ?? t.expected) : null;
                  return (
                    <tr key={s.id}>
                      <td className="td whitespace-nowrap text-zinc-600">{formatDateTime(s.opened_at)}{s.status === 'open' && <Badge tone="good" className="ml-2">Open</Badge>}</td>
                      <td className="td font-medium">{s.employee_name || '—'}</td>
                      <td className="td text-right tabular">{money(t.sales)}</td>
                      {seeExpected && <td className="td text-right tabular">{money(s.expected_cash ?? t.expected)}</td>}
                      <td className="td text-right tabular">{s.actual_cash != null ? money(s.actual_cash) : '—'}</td>
                      {seeExpected && <td className="td text-right">{diff == null ? '—' : diff === 0 ? <Badge tone="good">Balanced</Badge> : <Badge tone={diff < 0 ? 'bad' : 'warn'}>{diff > 0 ? '+' : ''}{money(diff)}</Badge>}{s.variance_reason && <p className="mt-0.5 text-xs text-zinc-500">{s.variance_reason}</p>}</td>}
                      <td className="td text-right"><Button size="sm" variant="ghost" icon={<Printer />} onClick={() => printZ(s)}>Z-report</Button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Dialog open={dialog === 'open'} onClose={() => setDialog(null)} title="Open your shift"
        footer={<><Button onClick={() => setDialog(null)}>Cancel</Button><Button variant="primary" type="submit" form="open-shift" loading={openShift.isPending}>Open shift</Button></>}>
        <form id="open-shift" onSubmit={(e: FormEvent) => { e.preventDefault(); openShift.mutate(undefined as never, { onSuccess: () => setDialog(null) }); }}>
          <Field label="Opening float" hint="Cash already in the drawer before your first sale."><MoneyInput value={opening || ''} onChange={setOpening} placeholder="0" autoFocus /></Field>
        </form>
      </Dialog>

      <Dialog open={dialog === 'close'} onClose={() => setDialog(null)} title="Close your shift" description={seeExpected ? undefined : 'Count all the cash in your drawer and enter the total. Your count is checked against the system.'}
        footer={<><Button onClick={() => setDialog(null)}>Cancel</Button><Button variant="primary" type="submit" form="close-shift" loading={closeShift.isPending}>Close shift</Button></>}>
        <form id="close-shift" className="grid gap-4" onSubmit={(e: FormEvent) => { e.preventDefault(); closeShift.mutate(undefined as never, { onSuccess: s => { setDialog(null); if (s) printZ(s); } }); }}>
          {seeExpected && current && <Notice>Expected in drawer: <b>{money(current.expected)}</b> (float {money(mine?.opening_cash)} + cash sales {money(current.cash)}{current.expenses ? ` − paid out ${money(current.expenses)}` : ''})</Notice>}
          <Field label="Cash counted"><MoneyInput value={counted || ''} onChange={setCounted} placeholder="0" autoFocus /></Field>
          {seeExpected && current && counted > 0 && counted !== current.expected && <Notice tone={counted < current.expected ? 'bad' : 'warn'}>{counted < current.expected ? 'Short' : 'Over'} by <b>{money(Math.abs(counted - current.expected))}</b></Notice>}
          <Field label={seeExpected ? 'Reason for any difference' : 'Note (optional)'}><Input value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Gave wrong change" /></Field>
        </form>
      </Dialog>

      <Dialog open={dialog === 'payout'} onClose={() => setDialog(null)} title="Pay out cash from the drawer" description="Recorded as a petty-cash expense and taken off your expected cash."
        footer={<><Button onClick={() => setDialog(null)}>Cancel</Button><Button variant="primary" type="submit" form="payout-form" loading={payOut.isPending}>Record pay-out</Button></>}>
        <form id="payout-form" className="grid gap-4" onSubmit={(e: FormEvent) => { e.preventDefault(); payOut.mutate(undefined as never, { onSuccess: () => setDialog(null) }); }}>
          <Field label="Amount"><MoneyInput value={payout.amount || ''} onChange={v => setPayout(p => ({ ...p, amount: v }))} placeholder="0" autoFocus /></Field>
          <Field label="What was it for?"><Input value={payout.description} onChange={e => setPayout(p => ({ ...p, description: e.target.value }))} placeholder="e.g. Cleaning supplies" required /></Field>
        </form>
      </Dialog>
    </>
  );
}
