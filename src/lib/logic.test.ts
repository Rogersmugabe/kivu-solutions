import { describe, expect, it } from 'vitest';
import { businessDay, minuteOfDay, money, normalizeRwPhone, parseMoney, isValidRwPhone } from './format';
import { ROLE_PAGES, employeeRole, enabledFeatures, roleCan, subscriptionStatus, visiblePages } from './access';
import { bulkPrice, cartTotals, groupReceipts, lineTotal, paymentBreakdown, paymentLabel, unitsInCart } from './sales';
import { parseCsv } from './csv';
import { shiftTotals } from './shifts';
import type { Expense, HospitalityPayment, Product, Sale, Shift, Shop } from './types';

const product = (over: Partial<Product> = {}): Product => ({ id: 'p1', shop_id: 's', name: 'Primus', qty: 48, cost: 700, price: 1000, low_stock: 10, units_per_bulk: 12, ...over });
const sale = (over: Partial<Sale> = {}): Sale => ({ id: Math.random().toString(36), shop_id: 's', product_name: 'Primus', qty: 1, total: 1000, created_at: '2026-10-30T10:00:00Z', ...over });

describe('money and dates', () => {
  it('formats and parses whole Rwandan Francs', () => {
    expect(money(2_000_000)).toBe('2,000,000 RWF');
    expect(money(1999.6)).toBe('2,000 RWF');
    expect(parseMoney('2,000,000')).toBe(2_000_000);
    expect(parseMoney('')).toBe(0);
    expect(parseMoney('abc')).toBe(0);
  });
  it('buckets business days in Kigali time', () => {
    expect(businessDay('2026-10-29T22:30:00Z')).toBe('2026-10-30');
    expect(businessDay('2026-10-29T21:59:00Z')).toBe('2026-10-29');
    expect(minuteOfDay('2026-10-29T22:30:00Z')).toBe(30);
  });
  it('normalises Rwandan phone numbers', () => {
    expect(normalizeRwPhone('0788 123 456')).toBe('+250788123456');
    expect(normalizeRwPhone('250788123456')).toBe('+250788123456');
    expect(isValidRwPhone('+250788123456')).toBe(true);
    expect(isValidRwPhone('+25078812345')).toBe(false);
  });
});

describe('role-based access', () => {
  const shop = (over: Partial<Shop> = {}): Shop => ({ id: 's', name: 'Shop', plan: 'control', subscription_status: 'active', business_type: 'retail', ...over });
  it('gives each role only its pages', () => {
    expect(ROLE_PAGES.cashier).not.toContain('reports');
    expect(ROLE_PAGES.stock_clerk).toEqual(['products', 'stock']);
    expect(ROLE_PAGES.manager).not.toContain('settings');
    expect(ROLE_PAGES.manager).not.toContain('plans');
  });
  it('limits sensitive actions', () => {
    expect(roleCan('cashier', 'approve')).toBe(false);
    expect(roleCan('cashier', 'void_sale')).toBe(true);
    expect(roleCan('manager', 'invite_staff')).toBe(false);
    expect(roleCan('owner', 'invite_staff')).toBe(true);
    expect(roleCan('stock_clerk', 'see_money')).toBe(false);
  });
  it('shows tables only to bars and restaurants', () => {
    const f = enabledFeatures(shop());
    expect(visiblePages('owner', shop(), f, false)).not.toContain('tables');
    expect(visiblePages('owner', shop({ business_type: 'bar' }), f, false)).toContain('tables');
  });
  it('hides plan-locked pages from staff but not from the owner', () => {
    const lite = shop({ plan: 'basic' });
    const f = enabledFeatures(lite);
    expect(visiblePages('owner', lite, f, false)).toContain('suppliers');
    expect(visiblePages('manager', lite, f, false)).not.toContain('suppliers');
  });
  it('falls back to Lite features when the subscription has ended', () => {
    const expired = shop({ current_period_end: '2020-01-01T00:00:00Z', grace_ends_at: '2020-01-04T00:00:00Z' });
    expect(subscriptionStatus(expired)).toBe('expired');
    expect(enabledFeatures(expired).has('staff')).toBe(false);
  });
  it('lets the platform switch a feature off per shop', () => {
    expect(enabledFeatures(shop(), { approvals: false }).has('approvals')).toBe(false);
  });
});

describe('cart and payments', () => {
  it('prices bulk units as units × price', () => {
    expect(bulkPrice(product())).toBe(12_000);
    expect(lineTotal(product(), { product_id: 'p1', entered_qty: 2, unit_mode: 'bulk' })).toBe(24_000);
  });
  it('caps the discount at the subtotal', () => {
    const p = product();
    const t = cartTotals([{ product_id: 'p1', entered_qty: 3, unit_mode: 'base' }], new Map([[p.id, p]]), 5000);
    expect(t).toEqual({ subtotal: 3000, discount: 3000, total: 0 });
  });
  it('counts stock in the cart in base units', () => {
    expect(unitsInCart([{ product_id: 'p1', entered_qty: 1, unit_mode: 'bulk' }, { product_id: 'p1', entered_qty: 3, unit_mode: 'base' }], product())).toBe(15);
  });
  it('stores and reads split payments, apportioned across receipt lines', () => {
    const label = paymentLabel('Split', { cash: 600, momo: 400, bank: 0 });
    expect(label).toBe('Split (Cash 600, MoMo 400)');
    const a = sale({ receipt_no: 'R1', total: 750, payment: label }), b = sale({ receipt_no: 'R1', total: 250, payment: label });
    expect(paymentBreakdown(a, [a, b])).toEqual({ cash: 450, momo: 300, bank: 0 });
    expect(paymentBreakdown(sale({ payment: 'Mobile Money', total: 900 }))).toEqual({ cash: 0, momo: 900, bank: 0 });
  });
  it('groups sale lines into receipts and flags fully voided ones', () => {
    const g = groupReceipts([sale({ receipt_no: 'R1' }), sale({ receipt_no: 'R1', total: 500 }), sale({ receipt_no: 'R2', status: 'voided' })]);
    expect(g.find(r => r.key === 'R1')?.total).toBe(1500);
    expect(g.find(r => r.key === 'R2')?.voided).toBe(true);
  });
});

describe('csv import', () => {
  it('handles quoted fields and Windows line endings', () => {
    const rows = parseCsv('name,price\r\n"Sugar, 1kg",1600\r\nRice,7500\r\n');
    expect(rows).toEqual([{ name: 'Sugar, 1kg', price: '1600' }, { name: 'Rice', price: '7500' }]);
  });
});

describe('cash shift maths (mirrors close_shift_controlled)', () => {
  it('expects float + plain Cash sales + cash table payments − expenses linked to the shift', () => {
    const shift: Shift = { id: 'sh', user_id: 'u1', opening_cash: 20_000, status: 'open', opened_at: '2026-10-30T06:00:00Z' };
    const sales = [
      sale({ shift_id: 'sh', total: 5000, payment: 'Cash' }),
      sale({ shift_id: 'sh', total: 3000, payment: 'Mobile Money' }),
      sale({ shift_id: 'sh', total: 1000, payment: 'Split (Cash 600, MoMo 400)', receipt_no: 'R9' }),
      sale({ shift_id: 'sh', total: 9999, payment: 'Cash', status: 'voided' }),
      sale({ shift_id: 'other', total: 7777, payment: 'Cash' })
    ];
    const expenses: Expense[] = [
      { id: 'e1', description: 'Paid out', amount: 1500, category: 'Petty cash', user_id: 'u1', shift_id: 'sh', created_at: '2026-10-30T08:00:00Z' },
      { id: 'e2', description: 'Rent', amount: 90_000, category: 'Rent', user_id: 'u1', shift_id: null, created_at: '2026-10-30T08:00:00Z' },
      { id: 'e3', description: 'Rejected', amount: 999, category: 'Petty cash', shift_id: 'sh', approval_status: 'rejected', created_at: '2026-10-30T08:00:00Z' }
    ];
    const payments: HospitalityPayment[] = [
      { id: 'h1', tab_id: 't', method: 'Cash', amount: 4000, shift_id: 'sh', created_at: '2026-10-30T09:00:00Z' },
      { id: 'h2', tab_id: 't', method: 'Mobile Money', amount: 2000, shift_id: 'sh', created_at: '2026-10-30T09:00:00Z' }
    ];
    const t = shiftTotals(shift, sales, expenses, payments);
    // Split sales are not counted as drawer cash by the database, so the app must not count them either.
    expect(t.cash).toBe(9000);
    expect(t.expenses).toBe(1500);
    expect(t.expected).toBe(20_000 + 5000 + 4000 - 1500);
    expect(t.sales).toBe(9000);
  });
});

describe('employee roles', () => {
  it('maps the labels stored in employees.role to role keys', () => {
    expect(employeeRole('Stock Clerk')).toBe('stock_clerk');
    expect(employeeRole('Cashier')).toBe('cashier');
    expect(employeeRole('Kitchen')).toBe('kitchen');
    expect(employeeRole('manager')).toBe('manager');
  });
});
