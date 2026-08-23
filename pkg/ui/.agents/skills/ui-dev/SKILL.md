---
name: ui-dev
description: "Develop and verify MetaFor WebGPU UI elements, components, and the shared UI playground fixture through selector-driven lifecycle and background CDP evidence. Use nodes-dev for root nodes, @nodes/layout, or @nodes/ui playgrounds; use metafor-dev for Hamiltonian and product runtime."
---

# UI development

Work in the exact requested checkout and preserve its branch, unrelated changes,
listeners, terminal sessions, and browser targets. This skill owns standalone
generic UI package playgrounds only. `$nodes-dev` routes all three Nodes
playgrounds through this skill's shared dispatcher without duplicating their
selectors. Use `$metafor-dev` for Hamiltonian lifecycle, product integration,
or its managed visible contour.

Before changing UI, read `docs/README.md`, the affected package requirements,
public types, focused tests, and the active task card. Invoking this skill does
not authorize production edits that the user did not request.

## Select a maintained contour

Use the registry-driven dispatcher; never reconstruct commands or ports from
memory:

```bash
pkg/ui/.agents/skills/ui-dev/scripts/ui-dev.sh status  <checkout> <selector>
pkg/ui/.agents/skills/ui-dev/scripts/ui-dev.sh ensure  <checkout> <selector>
pkg/ui/.agents/skills/ui-dev/scripts/ui-dev.sh start   <checkout> <selector>
pkg/ui/.agents/skills/ui-dev/scripts/ui-dev.sh restart <checkout> <selector>
pkg/ui/.agents/skills/ui-dev/scripts/ui-dev.sh logs    <checkout> <selector>
pkg/ui/.agents/skills/ui-dev/scripts/ui-dev.sh health  <checkout> <selector>
pkg/ui/.agents/skills/ui-dev/scripts/ui-dev.sh stop    <checkout> <selector>
```

Before its first lifecycle or browser operation, the supervising task runs
`ensure`. A healthy exact contour is reused and `ensure` returns immediately. If
the contour is stopped, `ensure` starts it in the foreground and the supervising
task retains that long-lived PTY. A short-lived source subagent never owns the
live contour.

`start` and `restart` also remain in the foreground and belong in a long-lived PTY.
The dispatcher stops only its exact checkout/selector/PID/command/listener.
Foreign listeners are reported and preserved; a second process is never
started or adopted.

## Prove source freshness before browser evidence

These package playgrounds intentionally do not use HMR. Partial hot replacement
cannot prove a fresh combined package graph, changed exports/manifest, exact
process ownership, retained-state reset, or the code loaded by the existing
document. `ensure` with `outcome:"reused"` proves only process health and
ownership; it never proves current source.

After any applicable production source, story, shared playground dependency,
package manifest/export, or browser entry change made since the selector was
started — or whenever freshness cannot be proved — the supervising task must:

1. finish a stable scoped source checkpoint; never present a dirty atomic patch
   as the current owner interface;
2. `restart` every affected selector through the dispatcher and retain each
   foreground PTY;
3. explicitly `reload` the existing singleton target even when its URL/route is
   unchanged;
4. verify exact route/source/args in DOM, console `0`, and an accepted non-black
   canvas before visual handoff.

Route/args-only navigation on an already fresh process may reuse the selector
and target without restart. A browser reload alone does not refresh a stale
server graph. Read the affected-selector table and exact commands in
[references/playgrounds.md](references/playgrounds.md) before the first source
refresh or browser operation.

Current selectors and exact usage are in
[references/playgrounds.md](references/playgrounds.md). `elements` owns the
restored public-shell playground on its package contour.

## Route detail only when needed

- For lifecycle, route-specific target selection, DOM/console/canvas evidence,
  live pointer/keyboard plans, mobile restore, or Node touch checks, read
  [references/playgrounds.md](references/playgrounds.md).
- For CPU/frame/heap evidence or external WebGPU Inspector routing, read
  [references/profiling.md](references/profiling.md).
- For Blender semantics, project divergences, or the maintained Node visual
  reference, read [references/blender-reference.md](references/blender-reference.md).

Automated browser operations are background-only. The helper resolves one exact
selector-owned target ID and never calls `Page.bringToFront`, focus/activate/window
endpoints, AI macOS, or a screenshot service. Exact canvas evidence decodes the
`toDataURL` PNG into an RGB/alpha pixel probe on that target; it never probes a
hidden WebGPU canvas through direct 2D drawImage. Starting or idle black pixels
are rejected and never written as successful evidence. Intentional emulation is
always cleared in a `finally` path before handoff.

Each registry selector owns at most one stable browser target for its origin.
Route operations attach to that existing target and navigate it in place; they
never create one tab per route. A target is created only when the selector
origin has no page target. Multiple existing targets are an explicit ambiguity:
the helper does not choose or close them silently. `targets` lists candidates,
`--target-id` selects one explicitly, and `close --target-id` is permitted only
for an exact duplicate known to have been created by the current task.

Run `interact` only after the required source-fresh restart and explicit reload
of an existing exact target. Supply a versioned JSON data plan, explicit route
and target ID; never encode JavaScript in the plan. Treat its mouse/keyboard
events as synthetic background evidence, not physical-device or owner proof.

## Evidence boundary

Tests and typechecks prove their contracts. DOM/console evidence proves one
exact route and target. Canvas PNG proves canvas pixels, not browser chrome.
Performance metrics, heap and animation-frame samples prove only the sampled
interval. An external Inspector capture proves its recorded GPU commands.
Emulation, automated capture, and profiling never become physical-device proof
or explicit owner acceptance.

At handoff report checkout/branch/commit, selector, exact command/cwd/port,
ownership and PID/log, route/target ID, native metrics after restore, checks and
captures, the loaded source-freshness boundary, and every remaining
physical-device, GPU, integration, or owner gate.
