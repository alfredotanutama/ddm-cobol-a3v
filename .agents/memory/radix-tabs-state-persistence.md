---
name: Radix Tabs unmount loses child state
description: Radix/shadcn Tabs unmounts inactive TabsContent by default, wiping any state local to the tab's component tree on switch.
---

Radix UI's `Tabs`/`TabsContent` (used by shadcn) unmounts inactive tab panels from the DOM by default. Any `useState` living inside a component rendered only within a `TabsContent` is destroyed when the user switches away and recreated fresh when they switch back.

**Why:** Discovered when a user reported that form/textarea input on one tab was lost after visiting another tab — the state was declared inside the tab's own component rather than a shared ancestor.

**How to apply:** If tab content must persist across switches, lift the state up to the common parent (e.g. the page/App component) and pass values + setters down as props, rather than reaching for Radix's `forceMount` (which keeps all panels mounted/hidden and is heavier). Lifting state is simpler and avoids rendering hidden content unnecessarily.
