---
name: node-system-dev
description: "Develop and visually debug MetaFor's Blender-based @nodes/ui component library and its standalone port-4016 playground. Use for Frame/Node/Parameter/Socket/Link rendering, interaction, responsive touch behavior, or Blender-reference comparisons; use metafor-dev for Hamiltonian and do not use this skill for solver-only @nodes/layout work."
---

# Node System development

Work in the exact requested checkout and preserve its branch, unrelated changes,
processes, and browser targets. This skill owns only the standalone `@nodes/ui`
component-development contour. Use `$metafor-dev` for Hamiltonian lifecycle,
product integration, its visible iTerm session, or its managed Chrome target.

Before changing components, read `docs/README.md`,
`pkg/nodes/ui/REQUIREMENTS.md`, `pkg/ui/elements/REQUIREMENTS.md`, the active
task card, public types, and focused tests. Do not infer permission to change
production code merely because this skill was invoked.

## Component boundary

Keep the public model `NodeTree -> Frame / Node -> Parameter -> Socket -> Link`.
`Frame` is a visual parent, not a Node or reusable Node Group. A `Parameter`
owns one universal Field and may expose one left and one right Socket on the
same Flex row. Socket `direction` is independent from visual side. Universal
fields remain in `@ui/components`; child composition remains in shared Flex.

The Blender preset follows Blender 4.5 visual discipline while intentionally
retaining the project font and rounded orthogonal Link routes. Do not copy
Blender GPL source, Manual text, or assets into MetaFor.

## Route detail only when needed

- For playground lifecycle, exact `@meta/chrome` targeting, DOM/console/image
  evidence, viewport checks, or synthetic touch checks, read
  [references/browser-workflow.md](references/browser-workflow.md).
- For Blender source/Manual/API research, component semantics, project
  divergences, or a visual defect comparison, read
  [references/blender-reference.md](references/blender-reference.md).

The maintained owner reference screenshot is versioned in `assets/` and served
only by the dev playground comparison route. It is not a production UI asset.

Use the bundled lifecycle helper instead of ad hoc background processes:

```bash
pkg/nodes/.agents/skills/node-system-dev/scripts/playground.sh status
pkg/nodes/.agents/skills/node-system-dev/scripts/playground.sh health
pkg/nodes/.agents/skills/node-system-dev/scripts/playground.sh serve
pkg/nodes/.agents/skills/node-system-dev/scripts/playground.sh logs
pkg/nodes/.agents/skills/node-system-dev/scripts/playground.sh stop
```

Launch `serve` in a long-lived PTY tool session and retain that session ID; the
command intentionally stays in the foreground. A detached `nohup` child is not
persistent under the Codex tool process group and is forbidden. The helper
defaults to `127.0.0.1:4016`, runs Bun without HMR, and stops only the exact
process it owns. An existing unowned listener is evidence to preserve, not
permission to adopt or kill it. Re-check `status` at the start of every turn;
do not promise that a tool PTY survives a separate Codex task.

Use `scripts/browser.py` for the repeated fragile browser operations. It
selects one page whose URL is exactly `http://127.0.0.1:4016/`; it never falls
back to an active tab, ordinary Chrome window, or first target. Its viewport and
touch checks restore native device metrics even when a check fails. Use its
exact `focus` command for owner-visible handoff.

## Evidence boundary

Package tests and typechecks prove only their contracts. DOM and console prove
the inspected target. A canvas export proves exact canvas pixels; a whole-window
screenshot proves visible browser state at capture time. Mobile emulation and
synthetic `TouchEvent` prove only that emulated browser path. They do not prove
a physical device and none of these replace explicit owner visual acceptance.

At handoff report the checkout, branch and commit, playground ownership and
PID, exact target ID/URL, native metrics after restore, checks and captures, and
the still-open physical-device or owner-acceptance gates.
