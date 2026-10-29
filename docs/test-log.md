# Kivu Solutions — Test & Verification Log

**Environment**: Node v24.21.0 on Windows (powershell)
**Target**: Kivu Solutions Web Platform (Vanilla PWA + Supabase)
**Asset Version**: 5.3.0

---

## Phase 0 & Phase 1: Tooling & Correctness (Observed)

| Test ID | Description | Command / Execution | Status | Observed Output |
|---|---|---|---|---|
| **T01** | `money(2000000)` formats as integer RWF with commas | `node --test tools/tests/helpers.test.js` | ✅ PASS | `"2,000,000 RWF"` (en-RW Intl integer formatting) |
| **T02** | `money(1999.6)` rounds correctly to 2,000 RWF | `node --test tools/tests/helpers.test.js` | ✅ PASS | `"2,000 RWF"` (Math.round boundary) |
| **T03** | `parseMoney("2,000,000")` parses to 2000000 | `node --test tools/tests/helpers.test.js` | ✅ PASS | `2000000` |
| **T04** | `parseMoney("")` and invalid strings parse to 0 | `node --test tools/tests/helpers.test.js` | ✅ PASS | `0` |
| **T05** | `formatMoneyString("2000000")` formats with commas | `node --test tools/tests/helpers.test.js` | ✅ PASS | `"2,000,000"` |
| **T06** | `day()` timezone test: 22:30 UTC is 00:30 next day in Kigali | `$env:TZ="Africa/Kigali"; node --test ...` | ✅ PASS | Returned `"2026-10-30"` (was `"2026-10-29"` before S1.1 fix) |
| **T07** | `day()` daytime test | `$env:TZ="Africa/Kigali"; node --test ...` | ✅ PASS | Returned `"2026-10-29"` |
| **T08** | `day()` leap year month-end boundary test | `$env:TZ="Africa/Kigali"; node --test ...` | ✅ PASS | Returned `"2028-03-01"` |
| **T11** | Version consistency check across 3 files | `node tools/check.js` | ✅ PASS | `index.html` ?v=5.3.0, `sw.js` kivu-v5-3-0-shell, `app.js` ?v=5.3.0 |
| **T15** | UI Audit & RPC Contract generation | `node tools/audit-ui.js` | ✅ PASS | 273 controls audited, 0 unbound; 55 distinct RPCs contracted |

---

## Phase 2: Non-blocking Dialogs & UX Primitives (Observed)

| Test ID | Description | Command / Execution | Status | Observed Output |
|---|---|---|---|---|
| **T12** | Every former `alert()` call site | Full codebase conversion | ✅ PASS | 149 sites converted to `kivuNotify()` / `showToast()` |
| **T13** | Every former `confirm()` call site | Full codebase conversion | ✅ PASS | 10 sites converted to `await kivuConfirm()` |
| **T14** | Every former `prompt()` call site | Full codebase conversion | ✅ PASS | 15 sites converted to `await kivuPrompt()` |
| **T15b** | Native dialog strict pattern check | `node tools/check.js` | ✅ PASS | `alert=0, confirm=0, prompt=0` call sites outside helper definitions |
| **T16** | Accessible `#toastRegion` | DOM audit | ✅ PASS | `<div id="toastRegion" class="sr-only" aria-live="polite">` present in `index.html` |
| **T17** | Unified SaaS dialog elements | DOM audit | ✅ PASS | `<dialog id="confirmDialog">` and `<dialog id="promptDialog">` present and styled |

---

## Phase 3: Accessibility & Design Tokens (Observed)

| Test ID | Description | Command / Execution | Status | Observed Output |
|---|---|---|---|---|
| **T20** | Reduced motion support | `css/style.css` media query | ✅ PASS | `@media (prefers-reduced-motion: reduce)` resets duration & transitions |
| **T21** | Focus visible states | `css/style.css` | ✅ PASS | `:where(button,[role=button],a,input,select,textarea,summary):focus-visible` ring |
| **T22** | Dialog labelling | DOM audit | ✅ PASS | 38 dialogs labelled via `aria-labelledby` pointing to their titles |
| **T23** | Icon buttons accessibility | DOM audit | ✅ PASS | All icon buttons have descriptive `aria-label` attributes |
| **T24** | Active navigation a11y | `showPage()` in `app.js` | ✅ PASS | Sets `aria-current="page"` on desktop and mobile active nav items |
| **T25** | `!important` reduction | CSS audit | ✅ PASS | Reduced from 156 down to 74 (52.6% reduction, <= 76 criterion met) |

---

## Phase 4: Page-by-Page Audit & Polish (In Progress)
