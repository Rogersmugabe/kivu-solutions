import type { Expense, HospitalityPayment, Sale, Shift } from './types';
import { paymentBreakdown } from './sales';
import type { ShiftTotals } from '@/components/print';

/** Drawer maths for a shift, mirroring the database's close_shift_controlled() exactly:
 *  expected = opening float + sales paid in Cash + cash table-bill payments − expenses linked to the shift.
 *  Mobile Money / bank figures are shown for information only; they never count toward the drawer. */
export function shiftTotals(shift: Shift, sales: Sale[], expenses: Expense[], hospitalityPayments: HospitalityPayment[] = []): ShiftTotals {
  const rows = sales.filter(s => s.shift_id === shift.id && s.status !== 'voided');
  const groups = new Map<string, Sale[]>();
  for (const s of rows) { const k = s.receipt_no || s.id; groups.set(k, [...(groups.get(k) ?? []), s]); }

  let cash = 0, momo = 0, bank = 0, total = 0;
  for (const s of rows) {
    total += Number(s.total || 0);
    if ((s.payment || 'Cash') === 'Cash') { cash += Number(s.total || 0); continue; }
    const b = paymentBreakdown(s, groups.get(s.receipt_no || s.id));
    momo += b.momo; bank += b.bank;
  }
  const tableCash = hospitalityPayments.filter(p => p.shift_id === shift.id && p.method === 'Cash').reduce((a, p) => a + Number(p.amount || 0), 0);
  const paidOut = expenses.filter(e => e.shift_id === shift.id && e.approval_status !== 'rejected').reduce((a, e) => a + Number(e.amount || 0), 0);

  return {
    cash: cash + tableCash, momo, bank, sales: total, expenses: paidOut, count: groups.size,
    expected: Number(shift.opening_cash || 0) + cash + tableCash - paidOut
  };
}
