import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Sale, Shift, Shop } from '@/lib/types';
import { formatAmount, formatDateTime, money } from '@/lib/format';
import { paymentBreakdown, type BillPayments } from '@/lib/sales';

/* Printing renders the document into #print-root (outside the app and any dialog) and the
   print stylesheet sends only that element to the printer, so long receipts are never cut. */

const PrintContext = createContext<(doc: ReactNode) => void>(() => {});

export function PrintProvider({ children }: { children: ReactNode }) {
  const [doc, setDoc] = useState<ReactNode>(null);
  const [root, setRoot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    let el = document.getElementById('print-root');
    if (!el) { el = document.createElement('div'); el.id = 'print-root'; document.body.appendChild(el); }
    setRoot(el);
    const clear = () => setDoc(null);
    window.addEventListener('afterprint', clear);
    return () => window.removeEventListener('afterprint', clear);
  }, []);

  useEffect(() => {
    if (!doc) return;
    // Wait for the portal to paint before opening the print dialog.
    const id = requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
    return () => cancelAnimationFrame(id);
  }, [doc]);

  const print = useCallback((d: ReactNode) => setDoc(d), []);
  return (
    <PrintContext.Provider value={print}>
      {children}
      {root && doc ? createPortal(doc, root) : null}
    </PrintContext.Provider>
  );
}

export const usePrint = () => useContext(PrintContext);

/* ------------------------------ Thermal layouts ------------------------------ */

const slip = 'mx-auto w-[72mm] font-mono text-[11px] leading-snug text-black';
const Line = () => <div className="my-2 border-t border-dashed border-black" />;
const Row = ({ left, right, bold }: { left: ReactNode; right: ReactNode; bold?: boolean }) => (
  <div className={`flex justify-between gap-2 ${bold ? 'font-bold' : ''}`}><span>{left}</span><span className="whitespace-nowrap text-right">{right}</span></div>
);

/** `bills` holds the real payment parts of split sales and table bills (keyed by receipt). */
export function Receipt({ shop, rows, bills }: { shop: Shop; rows: Sale[]; bills?: BillPayments }) {
  const first = rows[0];
  const live = rows.filter(r => r.status !== 'voided');
  const lines = live.length ? live : rows;
  const discount = lines.reduce((a, r) => a + Number(r.discount || 0), 0);
  const total = lines.reduce((a, r) => a + Number(r.total || 0), 0);
  const gross = total + discount;
  const rate = Math.max(0, Number(shop.tax_rate || 0));
  const tax = rate > 0 ? Math.round((total * rate) / (100 + rate)) : 0;
  const isSplit = /split/i.test(first?.payment || '');
  const split = isSplit ? lines.reduce((acc, r) => { const b = paymentBreakdown(r, lines, bills); return { cash: acc.cash + b.cash, momo: acc.momo + b.momo, bank: acc.bank + b.bank }; }, { cash: 0, momo: 0, bank: 0 }) : null;
  return (
    <div className={slip}>
      <div className="text-center">
        <div className="text-sm font-bold">{shop.name}</div>
        {shop.phone && <div>{shop.phone}</div>}
        {shop.tax_number && <div>{shop.tax_label || 'VAT'} No: {shop.tax_number}</div>}
      </div>
      <Line />
      <Row left="Receipt" right={first?.receipt_no || '—'} />
      <Row left="Date" right={formatDateTime(first?.created_at)} />
      <Row left="Served by" right={first?.employee_name || '—'} />
      {live.length === 0 && <div className="mt-1 text-center font-bold">*** VOIDED ***</div>}
      <Line />
      {lines.map(r => (
        <div key={r.id} className="mb-1">
          <div>{r.product_name}</div>
          <Row left={`  ${r.entered_qty ?? r.qty} ${r.sold_unit || ''} x ${formatAmount((Number(r.total) + Number(r.discount || 0)) / Number(r.entered_qty || r.qty || 1))}`} right={money(Number(r.total) + Number(r.discount || 0))} />
        </div>
      ))}
      <Line />
      {discount > 0 && <><Row left="Subtotal" right={money(gross)} /><Row left="Discount" right={`-${money(discount)}`} /></>}
      <Row left="TOTAL" right={money(total)} bold />
      {rate > 0 && <Row left={`${shop.tax_label || 'VAT'} incl. (${rate}%)`} right={money(tax)} />}
      <Row left="Paid by" right={isSplit ? 'Split' : first?.payment || 'Cash'} />
      {split && <>
        {split.cash > 0 && <Row left="  Cash" right={money(split.cash)} />}
        {split.momo > 0 && <Row left="  Mobile Money" right={money(split.momo)} />}
        {split.bank > 0 && <Row left="  Bank" right={money(split.bank)} />}
      </>}
      <Line />
      <div className="text-center">{shop.receipt_footer || 'Thank you for your business'}</div>
      <div className="mt-1 text-center text-[9px]">Kivu POS receipt · not an RRA EBM fiscal receipt</div>
    </div>
  );
}

export interface ShiftTotals { cash: number; momo: number; bank: number; sales: number; expenses: number; expected: number; count: number }

export function ZReport({ shop, shift, totals }: { shop: Shop; shift: Shift; totals: ShiftTotals }) {
  const diff = shift.actual_cash != null ? Number(shift.actual_cash) - totals.expected : null;
  return (
    <div className={slip}>
      <div className="text-center">
        <div className="text-sm font-bold">{shop.name}</div>
        <div className="font-bold">SHIFT Z-REPORT</div>
      </div>
      <Line />
      <Row left="Staff" right={shift.employee_name || '—'} />
      <Row left="Opened" right={formatDateTime(shift.opened_at)} />
      <Row left="Closed" right={shift.closed_at ? formatDateTime(shift.closed_at) : 'Still open'} />
      <Line />
      <Row left="Cash sales" right={money(totals.cash)} />
      <Row left="Mobile Money" right={money(totals.momo)} />
      <Row left="Bank / card" right={money(totals.bank)} />
      <Row left="Total sales" right={money(totals.sales)} bold />
      <Row left="Transactions" right={totals.count} />
      <Line />
      <Row left="Opening float" right={money(shift.opening_cash)} />
      <Row left="+ Cash sales" right={money(totals.cash)} />
      <Row left="- Paid out" right={`-${money(totals.expenses)}`} />
      <Row left="Expected cash" right={money(totals.expected)} bold />
      <Row left="Counted cash" right={shift.actual_cash != null ? money(shift.actual_cash) : 'Not counted'} bold />
      <Row left="Difference" right={diff == null ? '—' : diff === 0 ? 'Balanced' : `${diff > 0 ? '+' : ''}${money(diff)}`} bold />
      {shift.variance_reason && <div>Reason: {shift.variance_reason}</div>}
      <Line />
      <div className="mt-6 flex justify-between gap-4 text-[10px]"><span className="flex-1 border-t border-black pt-1">Cashier</span><span className="flex-1 border-t border-black pt-1">Manager</span></div>
      <div className="mt-2 text-center text-[9px]">Printed {formatDateTime(new Date())}</div>
    </div>
  );
}
