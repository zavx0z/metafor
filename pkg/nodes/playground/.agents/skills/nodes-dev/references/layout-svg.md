# Layout SVG page

| Property | Value |
| --- | --- |
| Route | `/layout/fixed-adaptive` |
| Ready | `nodesPlayground=ready`, `nodesLayoutPlayground=ready` |
| Presentation | `#svg-view svg` |

This DOM-only page runs the public fixed/adaptive policies against the six
frozen RIGHT/DOWN fixtures. It must not load Engine, WebGPU, NodeTree or editor.

```bash
SKILL=pkg/nodes/playground/.agents/skills/nodes-dev
bun test pkg/nodes/playground/packages/layout pkg/nodes/layout/src
bun run --cwd pkg/nodes/layout typecheck
bun run --cwd pkg/nodes/playground typecheck
"$SKILL/scripts/nodes-dev.sh" restart "$PWD"
bun "$SKILL/scripts/nodes-browser.ts" reload "$PWD" \
  --route /layout/fixed-adaptive --target-id "$target_id"
bun "$SKILL/scripts/nodes-browser.ts" dom "$PWD" \
  --route /layout/fixed-adaptive --target-id "$target_id"
bun "$SKILL/scripts/nodes-browser.ts" console "$PWD" \
  --route /layout/fixed-adaptive --target-id "$target_id"
```

Canvas/touch/profile/interaction actions are unsupported. DOM proves the exact
ready SVG page; frozen result and SVG hashes prove geometry.
