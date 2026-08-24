---
name: ui-dev
description: "Develop and verify the centralized MetaFor UI playground catalog and its Elements, Components, Workbench, and HUD package routes. Use nodes-dev for the Nodes catalog; use metafor-dev for Hamiltonian or product runtime."
---

# UI development

Use the exact checkout supplied for the task. Preserve its branch or detached
HEAD, unrelated changes, listeners and browser targets. `@ui/playground` owns
one no-HMR process, one origin and one target; package isolation comes from
routes and separate browser bundles, not extra servers.

Before changing a contract, read `docs/README.md`, the affected package
requirements, public types and focused tests. A new law is written in the
owning requirements before its implementation.

## Central package catalog

| Package page | Overview route | Presentation |
| --- | --- | --- |
| catalog | `/` | DOM package catalog |
| `@ui/elements` | `/elements/` | WebGPU story catalog |
| `@ui/components` | `/components/` | WebGPU story catalog |
| `@ui/playground` | `/playground/` | diagnostic WebGPU fixture |
| `@ui/hud` | `/hud/` | honest DOM package inventory |

Every story prefix is an overview with trailing `/`; an exact story leaf has no
trailing `/`. Every nested page exposes `Home` back to `/`. Unknown suffixes
are rejected instead of opening a fallback story.

Read [references/playgrounds.md](references/playgrounds.md) before lifecycle,
browser, interaction or source-freshness work. Read
[references/profiling.md](references/profiling.md) only for CPU/frame/heap or
external WebGPU Inspector evidence. Read
[references/blender-reference.md](references/blender-reference.md) only when
Blender semantics or visual mapping is in scope.

## One lifecycle command

```bash
SKILL=pkg/ui/playground/.agents/skills/ui-dev
"$SKILL/scripts/ui-dev.sh" status  "$PWD"
"$SKILL/scripts/ui-dev.sh" ensure  "$PWD"
"$SKILL/scripts/ui-dev.sh" restart "$PWD"
```

Run read-only `status` first and `ensure` before the first lifecycle or browser
operation. `ensure`, `start` and `restart` may remain foreground owners of the
exact Bun child, so retain their long-lived PTY. Foreign listeners are never
adopted or stopped.

After any applicable source change, finish a stable source checkpoint, restart
the one affected running selector, and explicitly reload every route required
for evidence. Route-only navigation on a fresh process may reuse the same
process and target.

## Route-aware browser evidence

```bash
bun "$SKILL/scripts/ui-browser.ts" targets "$PWD" ui
bun "$SKILL/scripts/ui-browser.ts" reload "$PWD" ui \
  --route /elements/div/ --target-id "$target_id"
bun "$SKILL/scripts/ui-browser.ts" canvas "$PWD" ui \
  --route /components/button/basic/contained --target-id "$target_id" \
  --output /tmp/ui-components.png
```

Run `targets` first. Open `/` only when the origin has no target; multiple
targets are explicit ambiguity. Route operations navigate the existing target
in place and never focus an OS window. DOM routes reject canvas/touch/profile
actions. The helper validates the requested route against the running server,
rejects noncanonical redirects and unknown paths, and selects the page-owned
canvas descriptor.

Automated browser operations are background-only. They never call
`Page.bringToFront`, focus/activate/window endpoints, AI macOS or screenshot
services. Exact canvas evidence decodes the target canvas PNG and rejects
starting or idle black pixels. Emulation is cleared before handoff.

## Evidence boundary

Tests and typechecks prove contracts. DOM/console proves one exact route and
target. Canvas PNG proves pixels, not browser chrome. Synthetic interaction,
mobile emulation, profiling and external GPU capture do not become physical
device proof or owner acceptance.

At handoff report checkout/commit, selector, process ownership and PID, exact
route/target, checks, console, canvas evidence where applicable, restored native
metrics and every remaining integration or owner gate.
