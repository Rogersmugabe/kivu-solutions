# RULE: Absolute Non-Disruption of Website Functionality

Under no circumstances alter, break, rename, remove, or degrade any existing functionality, interactive capability, accounting workflow, or backend integration of the website unless explicitly requested by the user.

All UI modernization, visual restructuring, and styling enhancements must be 100% backward-compatible and additive only.

### Directives:
- Preserve all existing DOM IDs and form inputs referenced by JS handlers.
- Preserve all Supabase RPC procedure calls, auth flows, and schema expectations.
- Maintain financial and accounting calculation correctness (cash drawer, shifts, debts/amadeni, RWF amounts).
- Enforce defensive null-checking across all DOM queries (`document.getElementById`).
- Test all changes with syntax checks (`node -c`) and ensure service worker compatibility.
