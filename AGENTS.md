# KIVU POS — DEVELOPMENT RULES

Kivu is a point-of-sale system: the owner tracks every movement of **stock** and **money**, and
employees sign in with their own role (role-based access control). Every change must serve that.

## Architecture (v6)
- React 19 + TypeScript + Vite, Tailwind CSS v4, TanStack Query, React Router (hash routing).
- Backend: the existing Supabase project (Postgres + Auth + RLS + RPC functions). The app talks to it
  directly from the browser; there is no server of our own.
- Hosting: GitHub Pages, built and deployed by `.github/workflows/deploy.yml` on every push to `main`.
- `legacy/` holds the previous vanilla-JS app for reference only. It is not built or deployed.

## Rules
1. **Data integrity first.** Money is whole Rwandan Francs (integers). Sales, stock changes, voids,
   expenses and shift closes go through the database functions (`record_sale_cart_v48`,
   `receive_stock`, `request_or_adjust_stock`, `request_or_void_sale`, `record_expense`,
   `close_shift_controlled`, …). Never overwrite a value the database computed.
2. **Stock only changes through a recorded movement.** Product edits never change quantity directly.
3. **Access is enforced twice.** `src/lib/access.ts` hides what a role cannot use; the database (RLS
   and function checks) must also refuse it. Never rely on the UI alone for security.
4. **Business days are Africa/Kigali time** (`businessDay()` in `src/lib/format.ts`), whatever the
   device time zone.
5. **No fake features.** If something needs a database change, write the SQL in `supabase/` and say so;
   do not simulate it in the browser.
6. **No secrets in the frontend.** Only the Supabase publishable (anon) key belongs in the app.
7. **Before finishing:** `npm run typecheck`, `npm test` and `npm run build` must pass. Check pages in
   the browser with the development sample backend (`npm run dev`, open `/?mock`), including staff
   roles (`&role=cashier`) and a bar (`&type=bar`), at phone and desktop widths.
