# Layout SVG playground

| Property | Value |
| --- | --- |
| Public name | `layout` |
| Shared selector | `node-layout` |
| Package cwd | `pkg/nodes/layout` |
| Command | `bun playground/server.ts` |
| Origin | `http://127.0.0.1:4015` |
| Default route | `/` |
| Ready marker | `nodesLayoutPlayground=ready` |
| Presentation | `#svg-view svg` |

This package-local HMR contour develops public fixed/adaptive placement,
`RIGHT`/`DOWN` routing, compounds, ports and gateways without NodeTree, Engine
or WebGPU. Run its frozen SVG/result tests and both package typechecks first:

```bash
bun test ./pkg/nodes/layout/playground ./pkg/nodes/layout/src
bun run --cwd pkg/nodes/layout typecheck
bun run --cwd pkg/nodes/layout typecheck:playground
```

For final evidence, restart and reload even though iterative development uses
HMR. Use DOM and console evidence; the readiness marker is published only after
the initial public layout produces an SVG. Canvas, touch, viewport, profile and
interaction actions are intentionally unsupported through this wrapper.

Run `targets` first. If it returns zero candidates, run `open`, then list again.
If it returns exactly one, copy that `id` to `target_id`. If it returns more
than one, stop and reconcile only an exact duplicate created by the current
task.

```bash
SKILL=pkg/nodes/.agents/skills/nodes-dev
"$SKILL/scripts/nodes-dev.sh" ensure "$PWD" --playground layout
bun test ./pkg/nodes/layout/playground ./pkg/nodes/layout/src
bun run --cwd pkg/nodes/layout typecheck
bun run --cwd pkg/nodes/layout typecheck:playground
"$SKILL/scripts/nodes-dev.sh" restart "$PWD" --playground layout
bun "$SKILL/scripts/nodes-browser.ts" targets "$PWD" --playground layout
bun "$SKILL/scripts/nodes-browser.ts" open "$PWD" --playground layout \
  --route / # only when targets returned zero candidates
bun "$SKILL/scripts/nodes-browser.ts" targets "$PWD" --playground layout # list again after open
target_id="copy-the-single-target-id"
bun "$SKILL/scripts/nodes-browser.ts" reload "$PWD" --playground layout \
  --route / --target-id "$target_id"
bun "$SKILL/scripts/nodes-browser.ts" dom "$PWD" --playground layout \
  --route / --target-id "$target_id"
bun "$SKILL/scripts/nodes-browser.ts" console "$PWD" --playground layout \
  --route / --target-id "$target_id"
```

DOM proves the exact ready SVG contour, while frozen result/SVG hashes in the
focused tests prove geometry. Generic DOM output does not replace those
structural assertions.

After production solver changes, also restart/reload `root` to prove the
integrated projection consumer. The two proofs do not replace one another.
