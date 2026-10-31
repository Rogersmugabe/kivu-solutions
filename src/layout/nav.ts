import {
  LayoutDashboard, ShoppingCart, ReceiptText, UtensilsCrossed, Package, ArrowLeftRight, Truck,
  Wallet, Clock, BarChart3, Users, ShieldCheck, CreditCard, Settings, Building2, LifeBuoy, type LucideIcon
} from 'lucide-react';
import type { PageKey } from '@/lib/access';

export interface NavItem { key: PageKey; path: string; label: string; icon: LucideIcon; title: string }

export const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  { label: 'Overview', items: [{ key: 'dashboard', path: '/', label: 'Dashboard', icon: LayoutDashboard, title: 'Dashboard' }] },
  {
    label: 'Sell',
    items: [
      { key: 'sell', path: '/sell', label: 'Point of sale', icon: ShoppingCart, title: 'Point of sale' },
      { key: 'sales', path: '/sales', label: 'Sales', icon: ReceiptText, title: 'Sales history' },
      { key: 'tables', path: '/tables', label: 'Tables & orders', icon: UtensilsCrossed, title: 'Tables & orders' }
    ]
  },
  {
    label: 'Stock',
    items: [
      { key: 'products', path: '/products', label: 'Products', icon: Package, title: 'Products' },
      { key: 'stock', path: '/stock', label: 'Stock movements', icon: ArrowLeftRight, title: 'Stock movements' },
      { key: 'suppliers', path: '/suppliers', label: 'Suppliers', icon: Truck, title: 'Suppliers & purchases' }
    ]
  },
  {
    label: 'Money',
    items: [
      { key: 'expenses', path: '/expenses', label: 'Expenses', icon: Wallet, title: 'Expenses' },
      { key: 'shifts', path: '/shifts', label: 'Cash shifts', icon: Clock, title: 'Cash shifts' },
      { key: 'reports', path: '/reports', label: 'Reports', icon: BarChart3, title: 'Reports' }
    ]
  },
  {
    label: 'Team',
    items: [
      { key: 'staff', path: '/staff', label: 'Staff & roles', icon: Users, title: 'Staff & roles' },
      { key: 'approvals', path: '/approvals', label: 'Approvals', icon: ShieldCheck, title: 'Approvals & activity' }
    ]
  },
  {
    label: 'Account',
    items: [
      { key: 'plans', path: '/plans', label: 'Plan & billing', icon: CreditCard, title: 'Plan & billing' },
      { key: 'settings', path: '/settings', label: 'Settings', icon: Settings, title: 'Settings' },
      { key: 'help', path: '/help', label: 'Help & user guide', icon: LifeBuoy, title: 'Help & user guide' },
      { key: 'admin', path: '/admin', label: 'Platform admin', icon: Building2, title: 'Platform admin' }
    ]
  }
];

export const ALL_NAV = NAV_GROUPS.flatMap(g => g.items);
export const navFor = (key: PageKey) => ALL_NAV.find(i => i.key === key)!;
