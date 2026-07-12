---
name: DESIGN subagent CSS template literal unit bug
description: A recurring class of bug where subagent-written inline styles produce invalid CSS by mixing a JS numeric variable with a unit suffix in a template literal.
---

Subagent-authored React components sometimes write inline indent/spacing styles as
a template literal like `` `${value * 1rem}px` `` — mixing a unitless JS expression
with a stray CSS unit token (`1rem`) inside the string, then appending `px`. This
produces an invalid computed style (not a plain NaN/undefined — it can silently
break the whole render tree since it's invalid CSS-in-JS, which can manifest as an
"Invalid hook call" / duplicate-React error in the browser console after a hot
reload if the error interrupts module evaluation order).

**Why:** Discovered when a DESIGN subagent used this pattern (`indent * 1rem` + `px`)
in two sibling table components; it typechecked fine (TS doesn't check CSS unit
correctness in string templates) but broke rendering only in the browser, not in
`tsc --noEmit`.

**How to apply:** After any subagent finishes frontend work, grep the diff for
inline style template literals combining a JS variable with a CSS unit literal
(e.g. `rem`, `em`, `px` appearing mid-expression rather than only as the trailing
suffix). Restart the workflow and check both workflow logs and browser console
logs after the fix — a stale HMR session can still show the old cached error even
after the source fix is correct on disk, so a fresh restart + log refresh is
required to confirm the fix actually took effect.
