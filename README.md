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
| Account | Plan & billing (pay with Mobile Money — MTN and Airtel through Relworx, or MTN direct; needs migration 003 and the `momo-pay` function; bank by request) · Settings (business, tax, location, signed-in devices) · Platform admin (Platinum Tech only) | Owner · platform admins |
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
- `supabase/functions/momo-pay` — Edge Function for plan payments with Mobile Money (see below).

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

### Plan payments with Mobile Money
Owners pay on **Plan & billing**: Kivu sends a payment prompt to their phone and switches the plan when the
payment is confirmed. The `momo-pay` Edge Function prices the plan on the server, asks the provider for the
payment and only extends the plan when the provider itself reports it successful (`kivu_confirm_momo_payment`,
migration 003). Provider keys live only in Supabase secrets. Until a provider is set up, the Plans page shows
only "Request this plan".

The function uses **Relworx** (MTN and Airtel Rwanda) when its secrets are set, otherwise **MTN MoMo direct**.

#### Relworx (MTN + Airtel)
1. Run `supabase/migrations/003_momo_subscription_payments.sql` in the SQL Editor (once).
2. In the Relworx dashboard: create a business account (it needs an **RWF Mobile Money** wallet), set its
   **Request Payment Webhook** to `https://frduolsneevyndnebxvy.supabase.co/functions/v1/momo-pay?callback=relworx`,
   and create an API key.
3. Save the secrets and deploy:
   ```bash
   npx supabase secrets set --project-ref frduolsneevyndnebxvy RELWORX_ACCOUNT_NO=<REL…> RELWORX_API_KEY=<api key> RELWORX_WEBHOOK_KEY=<webhook signing key>
   npx supabase functions deploy momo-pay --no-verify-jwt --project-ref frduolsneevyndnebxvy
   ```
Relworx charges real money from the first payment; test with a small plan on your own number.

#### MTN MoMo direct — sandbox setup (testing, no real money)

1. Run `supabase/migrations/003_momo_subscription_payments.sql` in the SQL Editor.
2. Sign up at [momodeveloper.mtn.com](https://momodeveloper.mtn.com), subscribe to **Collections** and copy the primary key.
3. Create a sandbox API user and key (prints the next command):
   ```bash
   MOMO_SUBSCRIPTION_KEY=<primary key> node scripts/momo-sandbox-user.mjs
   ```
4. Run the printed `npx supabase secrets set …` command, then deploy:
   ```bash
   npx supabase functions deploy momo-pay --no-verify-jwt --project-ref frduolsneevyndnebxvy
   ```

In the sandbox, amounts are in EUR and no real prompt is sent. MTN's test numbers decide the result:
`46733123450` fails, `46733123451` is rejected, `46733123452` times out, `46733123453` stays pending,
most other numbers succeed. Going live: complete MTN's go-live form and contract
([momodeveloper.mtn.co.rw/go-live](https://momodeveloper.mtn.co.rw/go-live)), then replace the secrets with the
live ones from MTN and set `MOMO_TARGET_ENV`, `MOMO_BASE_URL` and `MOMO_CURRENCY=RWF`. Optionally set
`MOMO_CALLBACK_URL` to `https://frduolsneevyndnebxvy.supabase.co/functions/v1/momo-pay?callback=1`.

Plan prices live in two places that must match: `PLANS` in `src/lib/access.ts` (display) and
`kivu_plan_price()` in migration 003 (what is charged).

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
