import type { Product, Sale } from './types';

export type PaymentMethod = 'Cash' | 'Mobile Money' | 'Bank' | 'Split';
export const PAYMENT_METHODS: PaymentMethod[] = ['Cash', 'Mobile Money', 'Bank', 'Split'];

export interface CartLine { product_id: string; entered_qty: number; unit_mode: 'base' | 'bulk' }

export const unitsPerBulk = (p?: Product | null) => {
  const n = Number(p?.units_per_bulk || 1);
  return n > 0 ? n : 1;
};
export const baseUnit = (p?: Product | null) => (p?.base_unit || 'Piece').trim() || 'Piece';
export const bulkUnit = (p?: Product | null) => (p?.bulk_unit || 'Carton').trim() || 'Carton';

/** Selling price of one bulk unit: the explicit bulk price, or unit price × units per bulk. */
export function bulkPrice(p: Product): number {
  const explicit = Number(p.bulk_price || 0);
  return explicit > 0 ? Math.round(explicit) : Math.round(Number(p.price || 0) * unitsPerBulk(p));
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

export interface Split { cash: number; momo: number; bank: number }

/** The payment string stored on each sale row (the database keeps one text column). */
export function paymentLabel(method: PaymentMethod, split?: Split): string {
  if (method !== 'Split' || !split) return method;
  const parts = [`Cash ${split.cash}`, `MoMo ${split.momo}`];
  if (split.bank) parts.push(`Bank ${split.bank}`);
  return `Split (${parts.join(', ')})`;
}

export interface Breakdown { cash: number; momo: number; bank: number }

/** How much of a sale row was paid by each channel. Split sales are apportioned across the
 *  rows of the same receipt in proportion to each row's total. */
export function paymentBreakdown(sale: Sale, receiptRows?: Sale[]): Breakdown {
  const total = Number(sale.total) || 0;
  const pay = String(sale.payment || 'Cash');
  if (!/split/i.test(pay)) {
    if (/mobile|momo/i.test(pay)) return { cash: 0, momo: total, bank: 0 };
    if (/bank|card/i.test(pay)) return { cash: 0, momo: 0, bank: total };
    return { cash: total, momo: 0, bank: 0 };
  }
  const read = (re: RegExp) => Number((pay.match(re)?.[1] || '0').replace(/,/g, '')) || 0;
  let cash = read(/Cash\s*([0-9.,]+)/i), momo = read(/(?:MoMo|Mobile Money)\s*([0-9.,]+)/i), bank = read(/Bank\s*([0-9.,]+)/i);
  if (cash + momo + bank === 0) cash = total;
  const rows = (receiptRows ?? []).filter(r => r.status !== 'voided');
  if (rows.length > 1) {
    const sum = rows.reduce((a, r) => a + (Number(r.total) || 0), 0);
    const ratio = sum > 0 ? total / sum : 1 / rows.length;
    return { cash: Math.round(cash * ratio), momo: Math.round(momo * ratio), bank: Math.round(bank * ratio) };
  }
  return { cash, momo, bank };
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
