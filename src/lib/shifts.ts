import type { Expense, Sale, Shift } from './types';
import { paymentBreakdown } from './sales';
import type { ShiftTotals } from '@/components/print';

/** Drawer maths for a shift, from the sales recorded against it and the cash paid out by the
 *  same person while it was open. */
export function shiftTotals(shift: Shift, sales: Sale[], expenses: Expense[]): ShiftTotals {
  const rows = sales.filter(s => s.shift_id === shift.id && s.status !== 'voided');
  const groups = new Map<string, Sale[]>();
  for (const s of rows) { const k = s.receipt_no || s.id; groups.set(k, [...(groups.get(k) ?? []), s]); }
  const t = { cash: 0, momo: 0, bank: 0, sales: 0 };
  for (const s of rows) {
    const b = paymentBreakdown(s, groups.get(s.receipt_no || s.id));
    t.cash += b.cash; t.momo += b.momo; t.bank += b.bank; t.sales += Number(s.total || 0);
  }
  const start = new Date(shift.opened_at).getTime();
  const end = shift.closed_at ? new Date(shift.closed_at).getTime() : Date.now();
  const paidOut = expenses
    .filter(e => e.approval_status !== 'rejected' && (e.shift_id === shift.id || (e.user_id === shift.user_id && (e.category || '').toLowerCase() === 'petty cash' && new Date(e.created_at).getTime() >= start && new Date(e.created_at).getTime() <= end)))
    .reduce((a, e) => a + Number(e.amount || 0), 0);
  return { ...t, expenses: paidOut, expected: Number(shift.opening_cash || 0) + t.cash - paidOut, count: groups.size };
}
