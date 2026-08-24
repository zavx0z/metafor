# Editor WebGPU page

| Property | Value |
| --- | --- |
| Route | `/editor/live-node-tree` |
| Ready | `nodesPlayground=ready`, `nodesPlaygroundPage=editor` |
| Canvas | `#nodes-playground-canvas` |

This page proves `NodeTreeEditor → NodeTree → projection → NodeEditor` while
layout remains explicitly gated.

```bash
SKILL=pkg/nodes/playground/.agents/skills/nodes-dev
bun test pkg/nodes/core pkg/nodes/editor \
  pkg/nodes/ui/blender-projection.test.ts \
  pkg/nodes/playground/packages/editor
bun run --cwd pkg/nodes/playground typecheck
"$SKILL/scripts/nodes-dev.sh" restart "$PWD"
bun "$SKILL/scripts/nodes-browser.ts" reload "$PWD" \
  --route /editor/live-node-tree --target-id "$target_id"
bun "$SKILL/scripts/nodes-browser.ts" canvas "$PWD" \
  --route /editor/live-node-tree --target-id "$target_id" \
  --output /tmp/nodes-editor.png
```

For value-cache evidence after an exact reload:

```bash
bun "$SKILL/scripts/nodes-browser.ts" interact "$PWD" \
  --route /editor/live-node-tree --target-id "$target_id" \
  --plan pkg/nodes/playground/.agents/skills/nodes-dev/references/editor-cache-invalidation.plan.json
```

For structural authoring and manual layout:

```bash
bun "$SKILL/scripts/nodes-browser.ts" interact "$PWD" \
  --route /editor/live-node-tree --target-id "$target_id" \
  --plan pkg/nodes/playground/.agents/skills/nodes-dev/references/editor-topology.plan.json
```

Before F9, tree/topology revisions advance while projection revisions stay old
and `nodeTreeLayoutDirty=true`. After F9, exact revisions match, dirty is false,
console is empty and canvas is non-black.
