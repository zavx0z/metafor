---
name: ui-dev
description: "Develop and verify MetaFor WebGPU UI elements, components, the shared UI playground fixture, and Blender-based @nodes/ui through selector-driven lifecycle and background CDP evidence. Use for package playground work and visual/performance diagnosis; use metafor-dev for Hamiltonian and do not use this skill for production runtime or solver-only @nodes/layout work."
---

# UI development

Work in the exact requested checkout and preserve its branch, unrelated changes,
listeners, terminal sessions, and browser targets. This skill owns standalone
package playgrounds only. Use `$metafor-dev` for Hamiltonian lifecycle, product
integration, or its managed visible contour.

Before changing UI, read `docs/README.md`, the affected package requirements,
public types, focused tests, and the active task card. Invoking this skill does
not authorize production edits that the user did not request.

## Select a maintained contour

Use the registry-driven dispatcher; never reconstruct commands or ports from
memory:

```bash
pkg/ui/.agents/skills/ui-dev/scripts/ui-dev.sh status  <checkout> <selector>
pkg/ui/.agents/skills/ui-dev/scripts/ui-dev.sh start   <checkout> <selector>
pkg/ui/.agents/skills/ui-dev/scripts/ui-dev.sh restart <checkout> <selector>
pkg/ui/.agents/skills/ui-dev/scripts/ui-dev.sh logs    <checkout> <selector>
pkg/ui/.agents/skills/ui-dev/scripts/ui-dev.sh health  <checkout> <selector>
pkg/ui/.agents/skills/ui-dev/scripts/ui-dev.sh stop    <checkout> <selector>
```

`start` and `restart` remain in the foreground and belong in a long-lived PTY.
The dispatcher stops only its exact checkout/selector/PID/command/listener.
Foreign listeners are reported and preserved; a second process is never
started or adopted.

Current selectors and exact usage are in
[references/playgrounds.md](references/playgrounds.md). `elements` is a typed
unsupported selector until that package owns a real runnable playground.

## Route detail only when needed

- For lifecycle, route-specific target selection, DOM/console/canvas evidence,
  mobile restore, or Node touch checks, read
  [references/playgrounds.md](references/playgrounds.md).
- For CPU/frame/heap evidence or external WebGPU Inspector routing, read
  [references/profiling.md](references/profiling.md).
- For Blender semantics, project divergences, or the maintained Node visual
  reference, read [references/blender-reference.md](references/blender-reference.md).

Automated browser operations are background-only. The helper resolves one exact
selector-owned target ID and never calls `Page.bringToFront`, focus/activate/window
endpoints, AI macOS, or a screenshot service. Canvas evidence comes from
`toDataURL` on the exact target. Intentional emulation is always cleared in a
`finally` path before handoff.

Each registry selector owns at most one stable browser target for its origin.
Route operations attach to that existing target and navigate it in place; they
never create one tab per path/hash. A target is created only when the selector
origin has no page target. Multiple existing targets are an explicit ambiguity:
the helper does not choose or close them silently. `targets` lists candidates,
`--target-id` selects one explicitly, and `close --target-id` is permitted only
for an exact duplicate known to have been created by the current task.

## Evidence boundary

Tests and typechecks prove their contracts. DOM/console evidence proves one
exact route and target. Canvas PNG proves canvas pixels, not browser chrome.
Performance metrics, heap and animation-frame samples prove only the sampled
interval. An external Inspector capture proves its recorded GPU commands.
Emulation, automated capture, and profiling never become physical-device proof
or explicit owner acceptance.

At handoff report checkout/branch/commit, selector, exact command/cwd/port,
ownership and PID/log, route/target ID, native metrics after restore, checks and
captures, and every remaining physical-device, GPU, integration, or owner gate.
