import type { BusinessType, PlanKey, Role, Shop } from './types';

/* ------------------------------------------------------------------ */
/* Pages and role-based access                                         */
/* ------------------------------------------------------------------ */

export type PageKey =
  | 'dashboard' | 'sell' | 'sales' | 'products' | 'stock' | 'suppliers' | 'expenses'
  | 'staff' | 'shifts' | 'approvals' | 'reports' | 'tables' | 'plans' | 'settings' | 'admin';

/** Which pages each role may open. The database enforces the same rules with RLS. */
export const ROLE_PAGES: Record<Role, PageKey[]> = {
  owner: ['dashboard', 'sell', 'sales', 'tables', 'products', 'stock', 'suppliers', 'expenses', 'staff', 'shifts', 'approvals', 'reports', 'plans', 'settings'],
  manager: ['dashboard', 'sell', 'sales', 'tables', 'products', 'stock', 'suppliers', 'expenses', 'staff', 'shifts', 'approvals', 'reports'],
  cashier: ['sell', 'sales', 'tables', 'shifts'],
  stock_clerk: ['products', 'stock'],
  waiter: ['tables'],
  kitchen: ['tables']
};

export const ROLE_LABELS: Record<Role, string> = {
  owner: 'Owner',
  manager: 'Manager',
  cashier: 'Cashier',
  stock_clerk: 'Stock clerk',
  waiter: 'Waiter',
  kitchen: 'Kitchen / bar prep'
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  owner: 'Everything, including billing, settings and staff invites.',
  manager: 'Runs the shop: stock, suppliers, expenses, approvals and reports. No billing or settings.',
  cashier: 'Sells at the counter, runs their own cash shift and sees their sales.',
  stock_clerk: 'Receives stock and manages products. Cannot sell or see money totals.',
  waiter: 'Opens table bills and sends orders to the kitchen.',
  kitchen: 'Sees the kitchen / bar ticket queue and marks orders as served.'
};

/** Roles an owner can invite (owners are created at sign-up). */
export const INVITABLE_ROLES: Role[] = ['manager', 'cashier', 'stock_clerk', 'waiter', 'kitchen'];

export type Action =
  | 'sell' | 'void_sale' | 'approve' | 'manage_products' | 'receive_stock' | 'adjust_stock'
  | 'manage_suppliers' | 'record_expense' | 'invite_staff' | 'manage_staff' | 'see_money' | 'manage_settings';

const ROLE_ACTIONS: Record<Role, Action[]> = {
  owner: ['sell', 'void_sale', 'approve', 'manage_products', 'receive_stock', 'adjust_stock', 'manage_suppliers', 'record_expense', 'invite_staff', 'manage_staff', 'see_money', 'manage_settings'],
  manager: ['sell', 'void_sale', 'approve', 'manage_products', 'receive_stock', 'adjust_stock', 'manage_suppliers', 'record_expense', 'manage_staff', 'see_money'],
  // Cashiers can only *request* voids and stock adjustments; the database queues them for approval.
  cashier: ['sell', 'void_sale'],
  stock_clerk: ['receive_stock', 'adjust_stock'],
  waiter: [],
  kitchen: []
};

export const roleCan = (role: Role | undefined, action: Action) => !!role && ROLE_ACTIONS[role].includes(action);

/* ------------------------------------------------------------------ */
/* Plans and subscription                                              */
/* ------------------------------------------------------------------ */

export type Feature = 'expenses' | 'suppliers' | 'staff' | 'shifts' | 'tables' | 'approvals' | 'audit';

export interface Plan { key: PlanKey; label: string; price: number; oneTime?: boolean; tagline: string; features: Feature[] }

// Database keys stay basic/one_time/business/control/pro for compatibility with existing shops.
export const PLANS: Plan[] = [
  { key: 'basic', label: 'Kivu Lite', price: 2000, tagline: 'Counter sales and stock for a single owner.', features: ['expenses'] },
  { key: 'one_time', label: 'Kivu One-Time', price: 50000, oneTime: true, tagline: 'Pay once: sales and stock, no staff accounts.', features: [] },
  { key: 'business', label: 'Kivu Business', price: 5000, tagline: 'Staff accounts, shifts, suppliers and tables.', features: ['expenses', 'suppliers', 'staff', 'shifts', 'tables'] },
  { key: 'control', label: 'Kivu Control', price: 10000, tagline: 'Adds approvals and anti-theft controls.', features: ['expenses', 'suppliers', 'staff', 'shifts', 'tables', 'approvals', 'audit'] },
  { key: 'pro', label: 'Kivu Pro', price: 20000, tagline: 'Everything, with priority support.', features: ['expenses', 'suppliers', 'staff', 'shifts', 'tables', 'approvals', 'audit'] }
];

export const planFor = (key: string | null | undefined): Plan => PLANS.find(p => p.key === key) ?? PLANS[0];

export const PAGE_FEATURE: Partial<Record<PageKey, Feature>> = {
  expenses: 'expenses', suppliers: 'suppliers', staff: 'staff', shifts: 'shifts', tables: 'tables', approvals: 'approvals'
};

export const FEATURE_MIN_PLAN: Record<Feature, string> = {
  expenses: 'Kivu Lite', suppliers: 'Kivu Business', staff: 'Kivu Business', shifts: 'Kivu Business',
  tables: 'Kivu Business', approvals: 'Kivu Control', audit: 'Kivu Control'
};

export const SUBSCRIPTION_GRACE_DAYS = 3;

const isFuture = (v?: string | null) => !!v && new Date(v).getTime() > Date.now();

export type SubscriptionStatus = 'trial' | 'active' | 'grace' | 'expired' | 'suspended' | 'cancelled';

export function subscriptionStatus(shop: Shop | null | undefined): SubscriptionStatus {
  if (!shop) return 'expired';
  if (shop.platform_suspended) return 'suspended';
  const raw = (shop.subscription_status || 'active').toLowerCase();
  if (shop.plan === 'one_time' && raw !== 'suspended') return 'active';
  if (raw === 'trial') return isFuture(shop.trial_ends_at) ? 'trial' : 'expired';
  if (raw === 'grace') return isFuture(shop.grace_ends_at) ? 'grace' : 'expired';
  if (raw === 'cancelled' || raw === 'suspended' || raw === 'expired') return raw;
  if (!shop.current_period_end || isFuture(shop.current_period_end)) return 'active';
  return isFuture(shop.grace_ends_at) ? 'grace' : 'expired';
}

export const subscriptionAllowsAccess = (shop: Shop | null | undefined) => ['trial', 'active', 'grace'].includes(subscriptionStatus(shop));

/** Features the shop can use now: its plan's features while the subscription is valid, and
 *  per-shop overrides set by the platform (a flag can switch a plan feature off). */
export function enabledFeatures(shop: Shop | null | undefined, flags: Record<string, boolean> = {}): Set<Feature> {
  const base = subscriptionAllowsAccess(shop) ? planFor(shop?.plan).features : planFor('basic').features;
  return new Set(base.filter(f => flags[f] !== false));
}

export const isHospitality = (type: BusinessType | null | undefined) => type === 'bar' || type === 'restaurant' || type === 'bar_restaurant';

/** Final page list for a signed-in user: role, plan and business type together. */
export function visiblePages(role: Role, shop: Shop | null, features: Set<Feature>, isPlatformAdmin: boolean): PageKey[] {
  const pages = ROLE_PAGES[role].filter(page => {
    if (page === 'tables' && !isHospitality(shop?.business_type)) return false;
    const feature = PAGE_FEATURE[page];
    // Owners still see locked pages (so they can upgrade); staff only see what they can use.
    if (feature && !features.has(feature) && role !== 'owner') return false;
    return true;
  });
  return isPlatformAdmin ? [...pages, 'admin'] : pages;
}
