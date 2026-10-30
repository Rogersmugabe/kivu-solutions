# Kivu Solutions — Cloud-Based POS & SaaS Platform

> **Modern Cloud-Based Point of Sale (POS), Inventory Control & Financial Operations System for Rwanda Businesses.**  
> Built with Vanilla Web Standards (ES2022+), Supabase (PostgreSQL + Auth + RPC), and Offline-First Progressive Web App (PWA) Architecture.

---

## 📌 Project Overview & Architectural Principles

Kivu Solutions is a commercial-grade, multi-terminal Cloud POS and retail management platform tailored for Rwandan enterprises (retail stores, supermarkets, bars, restaurants, and wholesale distributors).

### Core Directives & Strict Constraints
1. **Absolute Non-Disruption (Rule 1)**: All UI modernizations, styling enhancements, and operational features are 100% backward-compatible and additive. All 410 baseline DOM element IDs and 56 Supabase RPC stored procedure signatures are strictly preserved and audited.
2. **Financial & Accounting Precision**: All monetary values are computed in exact Rwandan Francs (RWF) as integers with zero floating-point rounding drift.
3. **Offline-First PWA Resilience**: Service Worker (`sw.js`) provides instant caching and background synchronization, allowing counter sales to continue during internet dropouts.
4. **Accessible, Non-Blocking Interactions**: Zero native browser blocking dialogs (`alert`, `confirm`, `prompt`). All interactions use custom, fully accessible asynchronous modals and toast notifications.
5. **Role-Based Access Control (RBAC)**: Fine-grained terminal permission tiers for `owner`, `manager`, `cashier`, `waiter`, `kitchen`, and `stock_clerk`.

---

## 📜 Sequential Master Changelog

Every feature, enhancement, and bug fix implemented on Kivu Solutions is logged below in strict chronological order, from the initial repository foundation to the latest release.

> **Instruction for Future Updates**: When completing new tasks or features, append them sequentially to the bottom of this list following the numbered format.

```
[1] Base POS Foundation & Initial Setup (v4.8.8)
 └── [2] UI Modernization & Commercial Plan Overhaul
      └── [3] Service Worker Auto-Update & Defensive SVGs
           └── [4] 0ms Pre-Hydration & SWR Background Sync
                └── [5] Master Architecture Transformation Plan
                     └── [6] Safety Net Tooling & Kigali Timezone Fix (v5.3.0)
                          └── [7] Elimination of Native Blocking Dialogs
                               └── [8] Design Tokens Consolidation & A11y
                                    └── [9] Sales Filters, Pagination & Stock Safety
                                         └── [10] Removal of Floating PWA Overlay (v5.3.1)
                                              └── [11] Removal of Duplicate POS Button Icons (v5.3.2)
                                                   └── [12] Vector SVG Icons & Notification Persistence (v5.3.3)
                                                        └── [13] Cloud POS & Terminal RBAC Architecture (v5.3.4)
                                                             └── [14] Staff Invites Fix & Interactive Role Simulator (v5.3.5)
                                                                  └── [15] Square-Inspired Split-Screen Auth Experience (v5.3.6)
```

---

### [1] Base POS Foundation & Initial Setup (v4.8.8)
- **Date**: 2026-10-16
- **Commit**: `98f5d9a`, `4b4127f`, `588126c`
- **Scope & Problem**: Initial repository setup and baseline upload of the Kivu Solutions web platform.
- **Implementation**:
  - Vanilla JS single-page web application communicating with Supabase PostgreSQL.
  - Core database schema integrations: sales, products, expenses, credits, shifts, and customers.
  - Initial Service Worker configuration for PWA caching on GitHub Pages.

---

### [2] UI Modernization & Commercial Plan Overhaul
- **Date**: 2026-10-27
- **Commit**: `b61fa21`, `95506f9`
- **Scope & Problem**: Outdated UI layouts, unformatted currency inputs, and lack of distinct commercial SaaS tiers.
- **Implementation**:
  - Overhauled commercial plans into structured database-compatible tiers: `Kivu Lite` (2,000 RWF/mo), `Kivu One-Time` (50,000 RWF once), `Kivu Business` (5,000 RWF/mo), `Kivu Control` (10,000 RWF/mo), and `Kivu Pro` (20,000 RWF/mo).
  - Built real-time currency formatting for Rwandan Francs (`money-input` with live comma thousands separators).
  - Added subscription status lifecycle evaluation (`active`, `trial`, `grace`, `expired`, `suspended`).
  - Improved POS counter sale drawer and held carts management.

---

### [3] Service Worker Auto-Update & Defensive SVGs
- **Date**: 2026-10-29
- **Commit**: `b68eca7`
- **Scope & Problem**: Stale assets remained cached indefinitely on client browsers, and SVG icons without explicit dimensions caused layout reflow jumps.
- **Implementation**:
  - Re-architected `sw.js` with network-first strategies for scripts and styles to prevent stale code mismatches.
  - Introduced automated cache-busting queries (`?v=...`) synchronized with the application release version.
  - Added defensive dimensions (`width`, `height`, `flex-shrink: 0`) across all SVGs to ensure layout stability on mobile viewports.

---

### [4] Instant 0ms Pre-Hydration & SWR Background Sync
- **Date**: 2026-10-29
- **Commit**: `a6236ac`
- **Scope & Problem**: Loading latency on slow mobile networks caused blank loading screens before business dashboards rendered.
- **Implementation**:
  - Implemented 0ms instant pre-hydration from `localStorage` snapshot (`kivu_offline_snapshot_v1`).
  - Injected early execution script in `<head>` adding `has-cached-session` class to paint the cached UI immediately.
  - Paired pre-hydration with seamless Stale-While-Revalidate (SWR) background data fetching from Supabase.
  - Built security safeguards verifying that cached user IDs and roles strictly match the active auth session before hydration.

---

### [5] Master Architecture Transformation Plan
- **Date**: 2026-10-29
- **Commit**: `4ffae6c`
- **Scope & Problem**: Systematic plan needed to elevate the website into a premier commercial SaaS product without breaking legacy dependencies.
- **Implementation**:
  - Established `kivu_master_implementation_plan.md` dividing work into 7 rigorous phases.
  - Defined strict non-negotiable mandates: preserve all 410 DOM IDs, all 56 RPCs, and exact RWF integer accounting.
  - Overhauled Executive Command Center, financial analytics cards, and KPI grids.

---

### [6] Safety Net Tooling & Kigali Timezone Fix (v5.3.0)
- **Date**: 2026-10-29
- **Commit**: `264592e`
- **Scope & Problem**: Need for automated regression testing; date bucketing bug sliced UTC strings, causing transactions after 10:00 PM in Rwanda (UTC+2) to be recorded on the previous day.
- **Implementation**:
  - Built `tools/check.js`: Automated CI gate checking JS syntax, version consistency, DOM ID baseline (410 IDs), Supabase RPC baseline (55 RPCs), and forbidden patterns.
  - Built `tools/bump-version.js`: Atomic script updating version across `version.json`, `index.html`, `sw.js`, and `app.js`.
  - Replaced unsafe `.toISOString().slice(0, 10)` with timezone-aware `day()` and `localDay()` helper for `Africa/Kigali` (UTC+2).
  - Created automated test harness `tools/tests/helpers.test.js` validating currency formatting, rounding, and timezone boundary conditions.

---

### [7] Elimination of Native Blocking Dialogs
- **Date**: 2026-10-29
- **Commit**: `61ba143`
- **Scope & Problem**: 174 native browser `alert()`, `confirm()`, and `prompt()` calls froze browser rendering and looked unpolished.
- **Implementation**:
  - Replaced all 149 `alert()` calls with accessible `kivuNotify(message, type)` and toast banners (`#toastContainer`).
  - Replaced all 10 `confirm()` calls with asynchronous promise-based `await kivuConfirm(question, options)`.
  - Replaced all 15 `prompt()` calls with asynchronous promise-based `await kivuPrompt(message, options)`.
  - Added accessible screen-reader live region (`#toastRegion` with `aria-live="polite"`).

---

### [8] Design Tokens Consolidation & A11y Modernization
- **Date**: 2026-10-29
- **Commit**: `ee2d421`
- **Scope & Problem**: High CSS specificity conflicts (156 `!important` tags) and missing accessibility attributes on interactive controls.
- **Implementation**:
  - Consolidated design tokens under CSS variables (`--color-brand`, `--color-text`, `--color-border`).
  - Added `aria-labelledby` referencing heading IDs across all 38 modal dialogs.
  - Added descriptive `aria-label` attributes to all icon-only buttons.
  - Dynamic `aria-current="page"` attribute tracking active desktop and mobile navigation links.
  - Added `@media (prefers-reduced-motion: reduce)` support and keyboard `:focus-visible` focus rings.
  - Reduced CSS `!important` occurrences by over 53%.

---

### [9] Sales Filters, Pagination & Stock Safety Pre-Checks
- **Date**: 2026-10-29
- **Commit**: `ef374f2`
- **Scope & Problem**: Large sales tables caused DOM sluggishness; checkout lacked client-side stock availability checks.
- **Implementation**:
  - Built multi-dimension sales filter bar: Payment channel (Cash, MoMo, Bank, Credit, Split), Date range (`From` - `To`), Sort order (Newest, Oldest, Amount).
  - Implemented sales table pagination (25 records per page) with `#salesPager`.
  - Added POS safety stock pre-checks before submitting sales to Supabase to prevent accidental negative inventory.
  - Added device data backup and restore (`#exportLocalDataBtn`, `#importLocalDataBtn`) for repayments and petty cash logs.
  - Added `beforeunload` unsaved changes warning guard for business settings.
  - Created architectural specifications for Tier C backend procedures (`docs/tier-c-proposals.md`).

---

### [10] Removal of Floating PWA Overlay (v5.3.1)
- **Date**: 2026-10-29
- **Commit**: `630433d`
- **Scope & Problem**: User reported an intrusive button banner hanging on every screen.
- **Implementation**:
  - Identified persistent PWA installation prompt (`#pwaInstallBar`) hovering over the layout.
  - Hid and suppressed the overlay with `display: none !important`, preserving element ID to avoid null reference exceptions in legacy handlers.

---

### [11] Removal of Duplicate POS Button Icons (v5.3.2)
- **Date**: 2026-10-29
- **Commit**: `6ab42a9`
- **Scope & Problem**: User reported an awkward duplicate plus symbol (`+ + New sale`) on POS action buttons.
- **Implementation**:
  - Cleaned redundant plus glyphs across the desktop header, quick action buttons, and empty-state triggers.
  - Streamlined button typography into clean, modern action labels.

---

### [12] Vector SVG Icon System & Notification Persistence (v5.3.3)
- **Date**: 2026-10-29
- **Commit**: `562ccf1`
- **Scope & Problem**: User reported that notification modals looked outdated, read notifications reverted to unread on reload, and unicode emojis looked unpolished.
- **Implementation**:
  - Replaced all raw unicode emojis with crisp, lightweight inline SVG vector icons across top nav, refresh button, KPI cards, quick actions, payment channels, and alert ribbons.
  - Modernized notification center modal with tabbed filtering (`All`, `Unread`, `High Priority`), "Mark all as read" button, and empty state illustrations.
  - Implemented dual-layer read notification persistence (`kivu_read_notifs_v3_${shop.id}`) in `localStorage` so read states survive page reloads and browser refreshes.
  - Added automated test harness `tools/tests/notifications-persistence.test.js`.

---

### [13] Cloud POS & Terminal RBAC Architecture (v5.3.4)
- **Date**: 2026-10-29
- **Commit**: `98968c4`
- **Scope & Problem**: User requested Cloud-Based POS system architecture with Role-Based Access Control, eliminating operational redundancy.
- **Implementation**:
  - **Fast PIN Terminal Lock Screen (`#lockTerminalBtn`, `#terminalLockModal`)**: Cashiers and waitstaff can lock the register or switch operators in seconds using a 6-digit PIN without logging out of the session.
  - **Real-Time Supervisor Override (`#supervisorOverrideModal`)**: Cashiers requesting transaction voids or stock adjustments can summon a manager/owner to authenticate and approve the action on the spot via PIN.
  - **Blind Cash Drawer Reconciliation (`#closeShiftModal`)**: Cashiers count and enter physical cash blindly without seeing expected totals; cash variance is shielded and revealed only to managers/owners.
  - **Staff SaaS Shielding**: Hidden SaaS upgrade pricing modals from non-owner roles.
  - Added automated test suite `tools/tests/pos-rbac.test.js`.

---

### [14] Staff Invites Fix & Interactive Role Simulator (v5.3.5)
- **Date**: 2026-10-29
- **Commit**: `0230211`
- **Scope & Problem**: Adding staff threw `Notice: function gen_random_bytes(integer) does not exist`. Store owner needed an easy way to check how each role's screen looks without creating fake accounts.
- **Implementation**:
  - **Resilient Fallback for Invites**: Wrapped `create_staff_invite` RPC in client-side fallback generating cryptographically secure 6-character invite codes (`crypto.getRandomValues`) inserted directly into `staff_invites` table.
  - **Supabase SQL Fix**: Authored `docs/fix-gen-random-bytes.sql` setting `search_path = public, extensions` on PostgreSQL functions.
  - **Interactive Role Simulator (`#roleSimulatorPanel`, `#rolePreviewBanner`)**: Built a one-click simulation switcher allowing the store owner to instantly preview and test the UI as **Cashier**, **Manager**, **Waiter**, **Kitchen / Bar Prep**, or **Stock Clerk** without creating dummy accounts.
  - Added persistent top simulation banner with instant exit back to Owner view.
  - Added automated test suite `tools/tests/role-simulator-and-invites.test.js`.

---

### [15] Square-Inspired Split-Screen Auth Experience (v5.3.6)
- **Date**: 2026-10-29
- **Commit**: `c922468`
- **Scope & Problem**: User provided reference screenshots of Square's modern sign-up and sign-in pages, requesting an identical visual overhaul while keeping all functionality intact.
- **Implementation**:
  - **Left Form Column**: Clean white container with geometric black Kivu logo, dynamic headers (`Let’s create your account` / `Sign in`), interactive password/PIN show/hide visibility toggles (`👁️`), Square-style Rwanda locale selector, terms and privacy consent checkbox, and solid black pill CTA buttons (`Continue` / `Create account`).
  - **Right Hero Column**:
    - For Sign Up: Curated monochrome brand wall (*"Join the 4,000+ businesses running with Kivu."*).
    - For Sign In: Feature showcase list with *"Increase order speed"* highlighted, paired with a floating counter POS card mockup (*"See what’s possible with Kivu Business"*).
  - Maintained 100% backward compatibility with all 15 baseline auth DOM IDs and Supabase auth workflows.
  - Added automated test suite `tools/tests/square-auth-layout.test.js`.

---

## 🧪 Verification & Test Suite

The repository includes a comprehensive automated test and compliance harness:

| Suite | File | Tests | Coverage |
|---|---|---|---|
| **Core Helpers** | `tools/tests/helpers.test.js` | 8 | Currency formatting, integer rounding, Kigali UTC+2 timezone |
| **Notification Persistence** | `tools/tests/notifications-persistence.test.js` | 2 | LocalStorage read notification tracking across reloads |
| **POS & RBAC** | `tools/tests/pos-rbac.test.js` | 4 | SaaS shielding, blind drawer count, continuous register, supervisor override |
| **Role Simulator & Invites** | `tools/tests/role-simulator-and-invites.test.js` | 6 | Invite codes, role simulation restrictions, DB error fallback |
| **Square Auth Layout** | `tools/tests/square-auth-layout.test.js` | 3 | Split-screen DOM structure, baseline IDs, input mapping |
| **Total** | | **23** | **100% Passing** |

### Running Quality Checks & Tests
```powershell
# 1. Run all unit tests
node --test tools/tests/*.test.js

# 2. Run master baseline compliance check (DOM IDs, RPCs, syntax, versions)
node tools/check.js

# 3. Bump version across all manifests and service worker caches
node tools/bump-version.js <new-version>
```

---

## 🛠️ Technology Stack
- **Frontend**: Vanilla JavaScript (ES2022+), CSS3 with CSS Variables, HTML5 Semantic Elements.
- **Database & Auth**: [Supabase](https://supabase.com) (PostgreSQL 15, Row Level Security, Stored Procedures / RPCs, GoTrue Auth).
- **Offline / PWA**: Native Service Worker API, CacheStorage API, Web App Manifest.
- **Testing**: Node.js Native Test Runner (`node:test`, `node:assert/strict`).
- **Hosting**: GitHub Pages (`https://rogersmugabe.github.io/kivu-solutions/`).
