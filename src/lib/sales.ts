import type { Product, Sale } from './types';

/** Methods record_sale_cart accepts for counter sales (Credit was removed with customer credit). */
export type PaymentMethod = 'Cash' | 'Mobile Money' | 'Bank';
export const PAYMENT_METHODS: PaymentMethod[] = ['Cash', 'Mobile Money', 'Bank'];

export interface CartLine { product_id: string; entered_qty: number; unit_mode: 'base' | 'bulk' }

export const unitsPerBulk = (p?: Product | null) => {
  const n = Number(p?.units_per_bulk || 1);
  return n > 0 ? n : 1;
};
export const baseUnit = (p?: Product | null) => (p?.base_unit || 'Piece').trim() || 'Piece';
export const bulkUnit = (p?: Product | null) => (p?.bulk_unit || 'Carton').trim() || 'Carton';

/** Selling price of one bulk unit: unit price × units per bulk. */
export function bulkPrice(p: Product): number {
  return Math.round(Number(p.price || 0) * unitsPerBulk(p));
}

export const unitPrice = (p: Product, mode: CartLine['unit_mode']) => (mode === 'bulk' ? bulkPrice(p) : Math.round(Number(p.price || 0)));
export const baseQty = (p: Product, line: CartLine) => line.entered_qty * (line.unit_mode === 'bulk' ? unitsPerBulk(p) : 1);
export const lineTotal = (p: Product, line: CartLine) => Math.round(unitPrice(p, line.unit_mode) * line.entered_qty);

export interface CartTotals { subtotal: number; discount: number; total: number }

export function cartTotals(lines: CartLine[], products: Map<string, Product>, discountInput: number): CartTotals {
  const subtotal = lines.reduce((sum, l) => {
    const p = products.get(l.product_id);
    return p ? sum + lineTotal(p, l) : sum;
  }, 0);
  const discount = Math.min(Math.max(0, Math.round(discountInput || 0)), subtotal);
  return { subtotal, discount, total: subtotal - discount };
}

/** Units of a product already in the cart (in base units), to stop overselling. */
export function unitsInCart(lines: CartLine[], product: Product): number {
  return lines.filter(l => l.product_id === product.id).reduce((sum, l) => sum + baseQty(product, l), 0);
}

export interface Breakdown { cash: number; momo: number; bank: number; other: number }

/** Payments of closed bar / restaurant bills, keyed by receipt number. hospitality_close_tab()
 *  stores those sales with payment "Split" and keeps the real methods in hospitality_payments. */
export type BillPayments = Map<string, Breakdown>;

export function billPaymentsByReceipt(tabs: { id: string; receipt_no?: string | null }[], payments: { tab_id: string; method: string; amount: number }[]): BillPayments {
  const receiptOf = new Map(tabs.filter(t => t.receipt_no).map(t => [t.id, t.receipt_no as string]));
  const out: BillPayments = new Map();
  for (const p of payments) {
    const r = receiptOf.get(p.tab_id);
    if (!r) continue;
    const b = out.get(r) ?? { cash: 0, momo: 0, bank: 0, other: 0 };
    const amt = Number(p.amount || 0);
    if (p.method === 'Cash') b.cash += amt; else if (p.method === 'Mobile Money') b.momo += amt; else if (p.method === 'Bank') b.bank += amt; else b.other += amt;
    out.set(r, b);
  }
  return out;
}

/** How much of a sale row was paid by each channel. Receipts paid several ways (bar bills, and
 *  older split sales written as "Split (Cash 600, MoMo 400)") are apportioned across the receipt's
 *  lines in proportion to each line's total. Credit and other methods count as "other". */
export function paymentBreakdown(sale: Sale, receiptRows?: Sale[], bills?: BillPayments): Breakdown {
  const total = Number(sale.total) || 0;
  const pay = String(sale.payment || 'Cash');
  const rows = (receiptRows ?? []).filter(r => r.status !== 'voided');
  const share = (b: Breakdown): Breakdown => {
    const sum = rows.length > 1 ? rows.reduce((a, r) => a + (Number(r.total) || 0), 0) : (b.cash + b.momo + b.bank + b.other) || total;
    const ratio = sum > 0 ? total / sum : rows.length ? 1 / rows.length : 1;
    return { cash: Math.round(b.cash * ratio), momo: Math.round(b.momo * ratio), bank: Math.round(b.bank * ratio), other: Math.round(b.other * ratio) };
  };
  const bill = sale.receipt_no ? bills?.get(sale.receipt_no) : undefined;
  if (bill) return share(bill);
  if (!/split/i.test(pay)) {
    if (pay === 'Cash') return { cash: total, momo: 0, bank: 0, other: 0 };
    if (/mobile|momo/i.test(pay)) return { cash: 0, momo: total, bank: 0, other: 0 };
    if (/bank|card/i.test(pay)) return { cash: 0, momo: 0, bank: total, other: 0 };
    return { cash: 0, momo: 0, bank: 0, other: total };
  }
  const read = (re: RegExp) => Number((pay.match(re)?.[1] || '0').replace(/,/g, '')) || 0;
  const parsed = { cash: read(/Cash\s*([0-9.,]+)/i), momo: read(/(?:MoMo|Mobile Money)\s*([0-9.,]+)/i), bank: read(/Bank\s*([0-9.,]+)/i), other: 0 };
  // A plain "Split" with no amounts and no bill payments loaded: the method is unknown.
  if (parsed.cash + parsed.momo + parsed.bank === 0) return { cash: 0, momo: 0, bank: 0, other: total };
  return share(parsed);
}

/** Groups sale rows (one per product line) into receipts. */
export function groupReceipts(sales: Sale[]): { key: string; rows: Sale[]; total: number; createdAt: string; voided: boolean }[] {
  const map = new Map<string, Sale[]>();
  for (const s of sales) {
    const k = s.receipt_no || s.id;
    const list = map.get(k);
    if (list) list.push(s); else map.set(k, [s]);
  }
  return [...map.entries()].map(([key, rows]) => {
    const live = rows.filter(r => r.status !== 'voided');
    return {
      key,
      rows,
      total: (live.length ? live : rows).reduce((a, r) => a + (Number(r.total) || 0), 0),
      createdAt: rows.reduce((m, r) => (r.created_at > m ? r.created_at : m), rows[0].created_at),
      voided: live.length === 0
    };
  }).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export const stockStatus = (p: Product): 'out' | 'low' | 'ok' => (Number(p.qty) <= 0 ? 'out' : Number(p.qty) <= Number(p.low_stock || 0) ? 'low' : 'ok');
