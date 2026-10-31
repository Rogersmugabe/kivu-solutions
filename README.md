# Kivu POS

Point of sale, stock control and cash control for shops, bars and restaurants in Rwanda.
The owner sees every movement of stock and money; staff sign in with their own role.

**Stack:** React 19 · TypeScript · Vite · Tailwind CSS v4 · TanStack Query · Supabase (Postgres, Auth, RLS) · PWA (works offline) · hosted on GitHub Pages.

---

## What it does

| Area | Pages | Who |
|---|---|---|
| Overview | Dashboard — today's sales, profit, expenses and receipts vs this time yesterday, 7-day trend, payment channels, stock alerts, recent receipts, approvals waiting | Owner, manager |
| Sell | Point of sale (search / barcode / camera scan, base & bulk units, discounts (not for cashiers), Cash / MoMo / Bank / Split (part cash, part MoMo or bank — needs migration 002), change due, parked sales, offline selling, receipts) · Sales history (filters, receipts, voids, CSV) · Tables & orders (bars and restaurants only) | Owner, manager, cashier · waiter & kitchen for tables |
| Stock | Products · **Stock movements** (one ledger of sales, voids, deliveries, adjustments and wastage) · Suppliers & purchases (supplier debts and payments) | Owner, manager · stock clerk for products & movements |
| Money | Expenses · Cash shifts (float, blind count for cashiers, pay-outs, Z-reports) · Reports (profit, products, staff, payment methods, accountant export) | Owner, manager · cashiers run their own shift |
| Team | Staff & roles (invites, enable / disable) · Approvals & activity (void / adjustment requests, exceptions, audit log) | Owner (invites), manager |
| Account | Plan & billing · Settings (business, tax, location, signed-in devices) · Platform admin (Platinum Tech only) | Owner · platform admins |
| Help | Help & user guide — role-aware guides with search and printing, written in Markdown in `src/help/en/` | Everyone |

### Roles
| Role | Can |
|---|---|
| Owner | Everything, including billing, settings and staff invites |
| Manager | Run the shop: stock, suppliers, expenses, approvals, reports, staff access. No billing or settings |
| Cashier | Sell, run their own cash shift, see sales, request voids |
| Stock clerk | Receive stock, manage the catalogue view, request adjustments. No money totals |
| Waiter | Open table bills and send orders |
| Kitchen / bar prep | See the order queue and mark items served |

Roles are defined in `src/lib/access.ts`. The database must enforce the same rules (RLS and function checks) — the UI alone is not security.

### Removed in v6 (did not fit a POS)
- Customer credit ("Amadeni") and the Customers page.
- Terminal lock and supervisor PIN override (the owner never had a PIN, and the override signed the browser in as the manager). Staff switch by signing out and in with their own PIN.
- Role simulator, notification centre, local-storage backup / restore, partial language switcher.

---

## Develop

```bash
npm install
npm run dev          # http://localhost:5180
```

Open **http://localhost:5180/?mock** to use built-in sample data instead of the real database
(development only — it is not included in production builds). Add `&role=cashier` (or `manager`,
`stock_clerk`, `waiter`, `kitchen`) and `&type=bar` to test other roles and business types.

```bash
npm run typecheck    # TypeScript
npm test             # unit tests (money, Kigali dates, roles, cart, split payments, CSV, shift maths)
npm run build        # production build in dist/
npm run preview      # serve the production build
```

## Deploy (GitHub Pages)

1. GitHub → repository **Settings → Pages → Source: GitHub Actions** (one time).
2. Push to `main`. `.github/workflows/deploy.yml` runs the tests, builds and publishes `dist/`.

The app uses relative paths and hash routing, so it works under `https://<user>.github.io/<repo>/`.

## Database (Supabase)

The app uses the existing Supabase project and its functions (`record_sale_cart_v48`, `receive_stock`,
`request_or_adjust_stock`, `request_or_void_sale`, `close_shift_controlled`, `create_staff_invite`, …),
so existing shops keep all their data. SQL for database work lives in `supabase/`:

- `supabase/export-schema.sql` — read-only export of tables, policies and key functions. Run it in the
  Supabase SQL Editor and share the result so database fixes are written against the real schema.

- `supabase/migrations/` — run each file once, in order, in the SQL Editor.
- `supabase/functions/staff-signup` — Edge Function that creates staff logins.

### Staff sign-up and email confirmation
Owners sign up with email and keep Supabase's **"Confirm email"** on. Staff sign in with phone + 6-digit
PIN; their login is a placeholder address (`staff.<phone>@auth.duka.local`) that cannot receive mail, so
the `staff-signup` Edge Function creates it already confirmed — only for someone holding a valid, unused
invite for that exact phone number. Deploy it once with the Supabase CLI:

```bash
npx supabase login
npx supabase functions deploy staff-signup --no-verify-jwt --project-ref frduolsneevyndnebxvy
```

`--no-verify-jwt` is needed because the employee is not signed in yet; the invite is the credential.

## Project layout

```
src/
  App.tsx            routing, role guards, offline sync, device heartbeat
  auth/              session, profile, shop, plan features
  components/        UI kit, dialogs & toasts, printing (receipt, Z-report), barcode scanner, charts
  data/hooks.ts      one cached query per table + write helper
  layout/            app shell (collapsible sidebar, mobile drawer), navigation
  lib/               access (roles, plans), format (RWF, Kigali time), sales maths, shifts, offline queue, CSV
  pages/             one file per page
  help/              user manual: Markdown guides (en/) and the topic list (which roles see which guide)
  dev/mockBackend.ts sample data for development (?mock)
supabase/            SQL to run in the Supabase SQL Editor
legacy/              previous vanilla-JS app, kept for reference (not deployed)
```
