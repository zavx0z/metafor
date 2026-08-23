---
name: nodes-dev
description: "Develop and verify all three MetaFor Nodes package playgrounds: root NodeTree runtime, @nodes/layout SVG solver, and @nodes/ui WebGPU components. Use for NodeTree, projection, layout, routing, and Node Editor package work; use metafor-dev for Hamiltonian or product integration."
---

# Nodes development

Work in the checkout supplied for the task. Preserve its branch or detached
`HEAD`, unrelated changes, listeners and browser targets. Every package keeps
its own playground; the root integration contour never replaces layout or UI.
Pass the exact checkout root as `$PWD` to every wrapper.

Before changing a contract, read `docs/README.md`, the affected package
requirements, public types and focused tests. A new law is written in the
owning requirements before its types and implementation.

## Select owning contour evidence

| Playground | Public name | Shared selector | Origin | Presentation |
| --- | --- | --- | --- | --- |
| root `nodes` | `root` | `nodes` | `127.0.0.1:4018` | no-HMR WebGPU runtime |
| `@nodes/layout` | `layout` | `node-layout` | `127.0.0.1:4015` | HMR HTML/SVG solver |
| `@nodes/ui` | `ui` | `node-ui` | `127.0.0.1:4016` | no-HMR WebGPU catalog |

Omitting `--playground` remains backward-compatible and selects `root`.
Story-only work usually needs one contour. Production layout or Node UI changes
also require the integrated `root` contour after their package-local proof.

- For root NodeTree/projection work, read
  [references/root-runtime.md](references/root-runtime.md).
- For fixed/adaptive solver, routing or SVG work, read
  [references/layout-svg.md](references/layout-svg.md).
- For NodeEditor, renderer or component-story work, read
  [references/node-ui.md](references/node-ui.md).

## Lifecycle

Use one wrapper for all three contours:

```bash
SKILL=pkg/nodes/.agents/skills/nodes-dev
"$SKILL/scripts/nodes-dev.sh" status  "$PWD" --playground root
"$SKILL/scripts/nodes-dev.sh" ensure  "$PWD" --playground layout
"$SKILL/scripts/nodes-dev.sh" restart "$PWD" --playground ui
```

Read-only `status` may run first. Run `ensure` before the first start/restart or
browser operation. `ensure`, `start` and `restart` may remain foreground owners
of the exact Bun child, so retain their long-lived PTY. All names delegate to
the same shared exact dispatcher; `ui` therefore reuses the existing `node-ui`
PID/state instead of duplicating it. Foreign listeners are preserved.

Root and UI are no-HMR. Layout keeps HMR for iteration, but final evidence after
source changes still requires an exact restart and reload. A production layout
change requires local `layout` proof and fresh integrated `root` proof; a
production Node UI change requires fresh `ui` and `root` proof.

## Browser evidence

The browser wrapper accepts the same `--playground` flag immediately after the
checkout and remains background-only:

```bash
bun "$SKILL/scripts/nodes-browser.ts" open "$PWD" --playground root
bun "$SKILL/scripts/nodes-browser.ts" dom "$PWD" --playground layout
bun "$SKILL/scripts/nodes-browser.ts" canvas "$PWD" --playground ui \
  --output /tmp/node-ui.png
```

Root and UI support canvas, viewport, touch, profile and interaction evidence.
Layout supports target, reload, DOM and console evidence; canvas-only actions
fail closed because its presentation is SVG. One origin owns at most one stable
target. Never focus a window, create a second target when one exists, or close
an unknown target.

Tests and typechecks prove contracts; DOM/console and encoded canvas prove only
the exact selected package contour. They do not prove Hamiltonian integration,
a physical device, GPU timings or owner acceptance.
