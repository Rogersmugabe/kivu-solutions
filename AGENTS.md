# KIVU SOLUTIONS - DEVELOPMENT RULES & CONSTRAINTS

## RULE 1: ABSOLUTE NON-DISRUPTION OF WEBSITE FUNCTIONALITY

> **CRITICAL MANDATE**:
> Under no circumstances alter, break, rename, remove, or degrade any existing functionality, interactive capability, accounting workflow, or backend integration of the website unless explicitly requested by the user.
> 
> All UI modernization, visual restructuring, and styling enhancements must be **100% backward-compatible and additive only**.

---

### Core Directives

1. **DOM ID & Element Preservation**:
   - Never delete or rename existing DOM element IDs, form inputs, modal dialog IDs, or table container IDs that are referenced by `js/app.js` or external scripts.
   - If an element or panel is visually replaced or redesigned, retain backward-compatible hidden anchors (or defensive optional chaining in code) so cached service workers or legacy handlers never throw `null` reference errors.

2. **Backend & Supabase Integrity**:
   - Preserve all Supabase RPC procedure calls (e.g. `record_sale_cart_v48`, `close_shift_controlled`, `record_supplier_purchase_v44`, `get_business_summary_v48`), auth flows, and schema expectations.
   - Do not alter database queries, column mappings, or table structures without explicit user directive.

3. **Financial & Accounting Correctness**:
   - Shift opening/closing, cash drawer reconciliations, petty cash payouts, credit/debt ("Amadeni") balances, and receipt generation must remain accurate and uncompromised.
   - All monetary calculations (RWF) must remain exact integers with no loss of precision.

4. **Offline & Service Worker Compatibility**:
   - Maintain PWA offline caching integrity in `sw.js`.
   - Use network-first caching strategies for dynamic scripts and styles to prevent stale code mismatches.
   - When updating assets, update cache versions systematically and ensure old cached clients fail gracefully.

5. **Defensive Coding Standard**:
   - Always apply null checks (`el?.textContent`, `if (el) ...`) when manipulating DOM elements.
   - Validate JavaScript syntax (`node -c js/app.js`) and CSS syntax before finishing any turn.
   - Verify that all existing buttons, modal triggers, keyboard shortcuts (e.g. F2 POS, Escape modal close), and navigation links continue to work identically.
