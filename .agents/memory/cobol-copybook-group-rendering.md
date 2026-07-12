---
name: COBOL copybook parser group/REDEFINES rendering
description: How group header rows (01 records, plain nested groups, REDEFINES headers) are represented and rendered in the cobol-stream-tool parser/UI.
---

Group header lines (no PIC clause — e.g. a bare `01 RECORD-NAME.` or `05 SOME-GROUP.`) are emitted as their own `ParsedField` row with `isGroup: true`, `length: 0`, `kind: "GROUP"`, and a `start` offset equal to the offset of whatever comes next (their first child, or the running cursor). This lets them show up in both the Generate and Decompose tables as non-fillable, zero-width rows without disturbing offset math — loops over fields treat `length: 0` as a no-op.

`groupNote` carries the human-readable label shown in place of an input:
- `"Record Description"` for level-01 headers
- `"Redefines <name>"` for REDEFINES group headers
- `null` for plain nested groups (e.g. `05 PAYMENT-DETAILS.`) — they just show as a structural row with no extra note

**Why:** The PRD's reference table expects every named group (not just level-01 and REDEFINES) to be visible in the field list, but only REDEFINES needs the shared-offset behavior. Giving all group headers a uniform `isGroup`/`groupNote` representation avoids duplicating rendering logic in `generate-tab.tsx` and `decompose-tab.tsx`.

**How to apply:** REDEFINES nesting is intentionally kept single-level (`shadowLevel`/`shadowCursor` only track one active REDEFINES at a time) — this matches the PRD's explicit "nested REDEFINES beyond one level is out of scope." Don't build a general multi-level indent stack for this; it wasn't needed and would risk changing existing indent semantics for the simple REDEFINES case. If multi-level REDEFINES is ever requested, that constraint needs to be revisited deliberately, not organically.

Each field also carries a `kind: "ALPHA" | "NUMERIC" | "DECIMAL" | "GROUP"` derived from PIC type + decimals, used by `generate-tab.tsx` to filter keystrokes (digits-only for NUMERIC, digits+dot for DECIMAL) and set `inputMode`. COMP-3 fields are intentionally treated as plain NUMERIC/DECIMAL (displayed as normal numbers, no packed-decimal conversion) per the PRD table.
