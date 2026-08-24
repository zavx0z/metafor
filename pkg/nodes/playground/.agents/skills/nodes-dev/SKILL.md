---
name: nodes-dev
description: "Develop and verify the centralized MetaFor Nodes playground catalog and its core, editor, layout, layout-worker, and UI package routes. Use for Nodes package work; use metafor-dev for Hamiltonian or product integration."
---

# Nodes development

Use the checkout supplied for the task. Preserve its branch or detached HEAD,
unrelated changes, listeners and browser targets. `@nodes/playground` owns one
no-HMR process, one origin and one target; package isolation comes from routes
and separate browser bundles, not extra servers.

Before changing a contract, read `docs/README.md`, the affected package
requirements, public types and focused tests. A new law is written in the
owning requirements before its implementation.

## Central package catalog

| Package page | Overview route | Presentation |
| --- | --- | --- |
| catalog | `/` | DOM package catalog |
| `@nodes/core` | `/core/` | DOM runtime/document |
| `@nodes/editor` | `/editor/` | WebGPU editor |
| `@nodes/layout` | `/layout/` | DOM/SVG solver |
| `@nodes/layout-worker` | `/layout-worker/` | DOM wire protocol |
| `@nodes/ui` | `/ui/` | WebGPU story catalog |

Every prefix overview ends in `/`; exact leaves do not. Nested pages expose the
shared `Home` control back to `/`, and unknown suffixes fail closed.

- Read [references/catalog-dom.md](references/catalog-dom.md) for catalog,
  core and layout-worker checks.
- Read [references/editor-webgpu.md](references/editor-webgpu.md) for live
  authoring, cache and topology evidence.
- Read [references/layout-svg.md](references/layout-svg.md) for fixed/adaptive
  geometry and SVG evidence.
- Read [references/ui-webgpu.md](references/ui-webgpu.md) for Node UI stories,
  reference readiness and retained evidence.

## One lifecycle command

```bash
SKILL=pkg/nodes/playground/.agents/skills/nodes-dev
"$SKILL/scripts/nodes-dev.sh" status  "$PWD"
"$SKILL/scripts/nodes-dev.sh" ensure  "$PWD"
"$SKILL/scripts/nodes-dev.sh" restart "$PWD"
```

Run read-only `status` first and `ensure` before the first lifecycle or browser
operation. `ensure`, `start` and `restart` may remain foreground owners of the
exact Bun child, so retain their long-lived PTY. Foreign listeners are never
adopted or stopped.

Every source change under `pkg/nodes/**` or a shared Engine/Elements/Components
dependency reaches this single no-HMR process. After a stable checkpoint,
restart it once and explicitly reload each exact route required by the change.

## Route-aware browser evidence

```bash
bun "$SKILL/scripts/nodes-browser.ts" targets "$PWD"
bun "$SKILL/scripts/nodes-browser.ts" reload "$PWD" \
  --route /layout/fixed-adaptive --target-id "$target_id"
bun "$SKILL/scripts/nodes-browser.ts" canvas "$PWD" \
  --route /editor/live-node-tree --target-id "$target_id" \
  --output /tmp/nodes-editor.png
```

Run `targets` first. Open `/` only when the origin has no target; when more than
one target exists, stop and reconcile only a duplicate proven to belong to the
current task. Never focus a window or close an unknown target.

Catalog, core, layout and layout-worker accept DOM/console evidence. Canvas,
touch, viewports, profile and interaction actions fail closed on those routes.
Editor and UI additionally require an exact non-black canvas. Layout requires
the ready marker and a real `#svg-view svg`. Use the shared background `page`
action when visual inspection of a complete DOM/SVG/WebGPU viewport is required.

Tests and typechecks prove package contracts. Browser evidence proves only the
exact centralized route; it does not prove Hamiltonian integration, GPU timing
or owner acceptance.
