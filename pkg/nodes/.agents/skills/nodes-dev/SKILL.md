---
name: nodes-dev
description: "Develop and verify the root MetaFor nodes runtime, its NodeTree projections, and the parent WebGPU playground through an exact package-owned lifecycle and background browser target. Use ui-dev for the separate @nodes/ui component catalog and use focused tests for solver-only @nodes/layout work."
---

# Nodes development

Work in the checkout supplied for the task. Preserve its branch or detached
`HEAD`, unrelated changes, listeners and browser targets. This skill owns only
the root `nodes` package and its parent playground; it does not own Hamiltonian,
the separate `@nodes/ui` catalog, or solver-only `@nodes/layout` source work.

Before changing the runtime contract, read `docs/README.md`,
`pkg/nodes/README.md`, `pkg/nodes/REQUIREMENTS.md`, public types and focused
tests. A new law is written in the owning requirements before its types and
implementation.

## Lifecycle

Use the fixed parent contour through the package-owned wrappers:

```bash
SKILL=pkg/nodes/.agents/skills/nodes-dev
"$SKILL/scripts/nodes-dev.sh" status  "$PWD"
"$SKILL/scripts/nodes-dev.sh" ensure  "$PWD"
"$SKILL/scripts/nodes-dev.sh" restart "$PWD"
"$SKILL/scripts/nodes-dev.sh" logs    "$PWD"
"$SKILL/scripts/nodes-dev.sh" health  "$PWD"
"$SKILL/scripts/nodes-dev.sh" stop    "$PWD"
```

Run `ensure` before the first lifecycle or browser operation. `ensure`, `start`
and `restart` may remain foreground owners of the exact Bun child, so keep them
in a long-lived PTY. The shared dispatcher verifies checkout, command, listener,
PID, HTTP marker and process start; it never adopts or stops a foreign process.

The playground is intentionally no-HMR. After changing runtime source,
projection adapters, the parent playground entry, package exports or shared UI
dependencies, finish a stable scoped patch, restart this contour, and explicitly
reload its existing browser target before collecting evidence.

## Browser evidence

Use the package wrapper; it fixes selector `nodes` and delegates to the shared
background-only CDP implementation:

```bash
bun "$SKILL/scripts/nodes-browser.ts" targets "$PWD"
bun "$SKILL/scripts/nodes-browser.ts" open "$PWD" --route /node-tree/runtime/live
bun "$SKILL/scripts/nodes-browser.ts" reload "$PWD" \
  --route /node-tree/runtime/live --target-id "$target_id"
bun "$SKILL/scripts/nodes-browser.ts" dom "$PWD" \
  --route /node-tree/runtime/live --target-id "$target_id"
bun "$SKILL/scripts/nodes-browser.ts" console "$PWD" \
  --route /node-tree/runtime/live --target-id "$target_id"
bun "$SKILL/scripts/nodes-browser.ts" canvas "$PWD" \
  --route /node-tree/runtime/live --target-id "$target_id" \
  --output /tmp/nodes-runtime.png
```

One origin owns at most one stable target. Never focus a window, create a new
target when one already exists, or close an unknown duplicate. Exact DOM state,
console `0`, and a non-black encoded canvas prove only this parent playground;
they do not prove Hamiltonian integration, a physical device, GPU timings, or
owner acceptance.

Read [references/playground.md](references/playground.md) before the first
source refresh or browser operation.
