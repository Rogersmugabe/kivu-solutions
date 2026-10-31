import type { Role } from '@/lib/types';
import gettingStarted from './en/getting-started.md?raw';
import quickStartCashier from './en/quick-start-cashier.md?raw';
import quickStartStaff from './en/quick-start-staff.md?raw';
import selling from './en/selling.md?raw';
import salesHistory from './en/sales-history.md?raw';
import productsStock from './en/products-stock.md?raw';
import money from './en/money.md?raw';
import team from './en/team.md?raw';
import tables from './en/tables.md?raw';
import billingSettings from './en/billing-settings.md?raw';
import faq from './en/faq.md?raw';

export interface HelpTopic {
  id: string;
  title: string;
  summary: string;
  /** Roles the guide is written for. Owners can read every guide, to train their team. */
  roles: Role[];
  /** Only shown to bars and restaurants. */
  hospitality?: boolean;
  body: string;
}

const STAFF: Role[] = ['manager', 'cashier', 'stock_clerk', 'waiter', 'kitchen'];
const ALL: Role[] = ['owner', ...STAFF];

export const HELP_TOPICS: HelpTopic[] = [
  { id: 'getting-started', title: 'Getting started', summary: 'From a new account to your first sale.', roles: ['owner'], body: gettingStarted },
  { id: 'cashier', title: 'Cashier quick start', summary: 'One page for every shift at the counter.', roles: ['owner', 'manager', 'cashier'], body: quickStartCashier },
  { id: 'staff', title: 'Joining and signing in', summary: 'Invite codes, PINs and what each role sees.', roles: ALL, body: quickStartStaff },
  { id: 'selling', title: 'Selling at the counter', summary: 'Cart, payments, split, park, offline and receipts.', roles: ['owner', 'manager', 'cashier'], body: selling },
  { id: 'sales', title: 'Sales history and voids', summary: 'Find receipts, reprint, export and void.', roles: ['owner', 'manager', 'cashier'], body: salesHistory },
  { id: 'stock', title: 'Products and stock', summary: 'Receive deliveries and correct stock.', roles: ['owner', 'manager', 'stock_clerk'], body: productsStock },
  { id: 'money', title: 'Shifts, expenses and suppliers', summary: 'Open and close the drawer, record spending and debts.', roles: ['owner', 'manager', 'cashier'], body: money },
  { id: 'team', title: 'Staff, approvals and reports', summary: 'Invite staff, approve requests and read your numbers.', roles: ['owner', 'manager'], body: team },
  { id: 'tables', title: 'Tables & orders', summary: 'Bills, kitchen queue, settling, recipes and wastage.', roles: ['owner', 'manager', 'cashier', 'waiter', 'kitchen'], hospitality: true, body: tables },
  { id: 'billing', title: 'Plan, billing and settings', summary: 'Plans, payment, receipts, tax and devices.', roles: ['owner'], body: billingSettings },
  { id: 'faq', title: 'Troubleshooting', summary: 'Sign-in, sync, printing and other questions.', roles: ALL, body: faq }
];

export function topicsFor(role: Role, hospitality: boolean): HelpTopic[] {
  return HELP_TOPICS.filter(t => (role === 'owner' || t.roles.includes(role)) && (!t.hospitality || hospitality));
}

/** Case-insensitive search over titles and text; returns topics with a short matching excerpt. */
export function searchTopics(topics: HelpTopic[], query: string): { topic: HelpTopic; excerpt: string }[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return topics.flatMap(topic => {
    const plain = topic.body.replace(/[#*_>|`]/g, '').replace(/\s+/g, ' ');
    const at = plain.toLowerCase().indexOf(q);
    if (at < 0 && !topic.title.toLowerCase().includes(q)) return [];
    const start = Math.max(0, at - 50);
    const excerpt = at < 0 ? topic.summary : `${start > 0 ? '…' : ''}${plain.slice(start, at + q.length + 70).trim()}…`;
    return [{ topic, excerpt }];
  });
}
