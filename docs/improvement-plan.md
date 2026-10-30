# Kivu Solutions — Product Improvement Plan (v6)

Branch: `feature/product-transformation` (based on `security/terminal-hardening-v5.3.7`).
Constraints: GitHub Pages static hosting, Supabase backend (schema not in this repo), AGENTS.md Rule 1
(additive, keep all baseline DOM IDs and RPC names), no new runtime dependencies, nothing pushed without approval.

Status legend: ☐ to do · ◐ in progress · ☑ done · ⛔ blocked (needs backend / external service)

---

## 1. What the audit found

### Works (keep)
- Auth (owner email, staff phone + PIN), invites, plan gating, role-based navigation.
- POS checkout through `record_sale_cart_v48`, held carts, barcode scanning, offline queue with `client_ref`.
- Inventory, suppliers and purchases, expenses, customers / credit, shifts and Z-report, hospitality tabs.
- Reports and dashboard calculated from loaded data; CSV / accountant export; platform admin console.
- Static wiring is sound: every inline handler resolves to a function except one (below), every `data-open`
  target exists, every form has a submit handler.

### Broken (confirmed)
| # | Problem | Where |
|---|---|---|
| B1 | Sales page "Cash / Mobile Money / Bank / Credit today" cards are never filled — always `0 RWF` | `#salesCashToday` etc., no JS writes them |
| B2 | Sales category pills call `filterSalesCategory`, which is never defined | `renderSales` |
| B3 | Escape closes the *first* open dialog in DOM order, not the top one, and resets its form — e.g. Escape on a receipt over the POS can wipe the POS form underneath | global keydown handler |
| B4 | Owner device list and tax fields in Settings never render: `renderSettingsV41` is reassigned later, dropping the wrapper that called `renderOwnerDevices()` | app.js settings section |
| B5 | CSV import: `'\\r'` is a two-character string, so CRLF files keep `\r` in the last column | `parseCsv` |
| B6 | Petty cash ignores `record_expense` errors (`try/catch` around a call that never throws) | `#pettyCashForm` |
| B7 | `day()` ("Kigali day") uses the device time zone, not Africa/Kigali | `localDay` |
| B8 | `renderDukaAdmin` declared twice; the second silently wins | app.js |
| B9 | Supervisor-override void calls `void_sale_cart_v48`, which is not in the RPC contract; if missing, the override fails with no fallback | override handler |
| B10 | Heading text is HTML-escaped and then written with `textContent`, so names with `&` show `&amp;` | dashboard heading |
| B11 | Every hourly token refresh re-runs the full `enter()` (reload of all data + re-render) | `onAuthStateChange` |

### Poorly implemented / inconsistent
- Visual language drifted across versions: `:root` tokens defined 3+ times; primary actions are green on one page,
  black on another, blue elsewhere; buttons, inputs, tables and dialogs each have several competing styles.
- Sales filter bar stacks full-width selects; receipt numbers and dates wrap awkwardly in tables.
- Mobile bottom nav only covers 3 pages.

### Needs backend (cannot be solved in the frontend alone) ⛔
- Repayments, petty-cash and split-payment details live only in `localStorage` (multi-device accuracy).
  Proposed tables / RPCs already in `docs/tier-c-proposals.md`.
- Server-side shift expected cash, `verify_staff_pin` RPC, RLS audit, server-side report aggregates
  (current reports cover at most the latest 1,000 rows).

---

## 2. Phased implementation

### Phase A — Functional repairs (priority 1)
| | Task |
|---|---|
| ☑ | B1 Populate today's payment-channel cards on the Sales page from real sales (split-aware) |
| ☑ | B2 Implement `filterSalesCategory` consistent with the other category filters |
| ☑ | B3 Escape closes only the topmost dialog (native `cancel`), reset that dialog's own form |
| ☑ | B4 Restore owner device list + tax fields in Settings |
| ☑ | B5 Fix CSV CR/LF parsing |
| ☑ | B6 Surface `record_expense` failures for petty cash |
| ☑ | B7 Make date bucketing use Africa/Kigali regardless of device zone |
| ☑ | B8 Remove the dead duplicate `renderDukaAdmin` |
| ☑ | B9 Fall back to `request_or_void_sale` when `void_sale_cart_v48` is unavailable |
| ☑ | B10 Stop double-escaping text written with `textContent` |
| ☑ | B11 Skip full reloads on token refresh for the same signed-in user |

### Phase B — Design system (priority 2)
One token set and one component layer appended as the last section of `css/style.css`
("Kivu Design System v6"), so it overrides the drifted legacy layers without deleting baseline selectors:
- Tokens: colour (neutral slate, single brand blue, semantic success / warning / danger / info), radius,
  shadow, spacing, type scale, focus ring, motion.
- Components: buttons (primary / secondary / ghost / danger, sizes, hover / focus / active / disabled /
  loading), inputs / selects / textareas, cards & panels, KPI tiles, tables, badges / pills, tabs / filter
  bars, dialogs, toasts, empty states, sidebar nav, top bar, auth screen.

### Phase C — Page-by-page application (priority 2)
Overview, Sales, POS dialog, Tables & Orders, Inventory, Customers, Suppliers, Expenses, Employees, Shifts,
Reports, Controls, Subscription, Settings, Platform admin, auth screens, receipts / Z-report (print).

### Phase D — Dashboard usefulness (priority 3, real data only)
- Today vs yesterday comparison on KPI tiles (from loaded sales / expenses).
- Recent transactions list (latest receipts) with link to the receipt.
- Keep existing trend chart, payment channels, fast movers, credit watchlist, stock alerts.

### Phase E — Responsive & accessibility (priority 3)
Tables scroll inside their card on small screens, filter bars wrap, dialogs fit phones, touch-size targets,
visible focus, labelled controls, reduced motion respected.

### Phase F — QA
`node tools/check.js`, `node --test tools/tests/*.test.js`, browser checks of every page at desktop / tablet /
phone sizes with Supabase stubbed (no production calls), console error check. Live end-to-end flows against
Supabase require a test account and remain **manual verification**.

---

## 3. Risks
- CSS overrides can collide with legacy rules that use `!important` → verify each page visually.
- No access to the database: server-side behaviour (RLS, RPC internals) is unverified.
- Large single-file app.js: each change kept small and covered by `check.js` baselines.
