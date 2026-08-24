# Node UI WebGPU page

| Property | Value |
| --- | --- |
| Representative detail route | `/ui/socket/boolean/input` |
| Ready | `nodesPlayground=ready`, `nodeComponentPlayground=ready` |
| Canvas | `#nodes-playground-canvas` |

The `ui/` mount preserves all NodeEditor, Frame, Link, Socket and Blender
comparison story ids. Strip only the `ui/` mount when choosing a story module.

```bash
SKILL=pkg/nodes/playground/.agents/skills/nodes-dev
bun test pkg/nodes/ui pkg/nodes/playground/packages/ui
bun run --cwd pkg/nodes/ui typecheck
bun run --cwd pkg/nodes/playground typecheck
"$SKILL/scripts/nodes-dev.sh" restart "$PWD"
story_route=/ui/node-editor/scene/default
bun "$SKILL/scripts/nodes-browser.ts" reload "$PWD" \
  --route "$story_route" --target-id "$target_id"
bun "$SKILL/scripts/nodes-browser.ts" dom "$PWD" \
  --route "$story_route" --target-id "$target_id"
bun "$SKILL/scripts/nodes-browser.ts" console "$PWD" \
  --route "$story_route" --target-id "$target_id"
bun "$SKILL/scripts/nodes-browser.ts" canvas "$PWD" \
  --route "$story_route" --target-id "$target_id" \
  --output /tmp/nodes-ui.png
```

Ready is published only after the reference texture reaches ready and a later
frame renders. Verify exact story route/source/args, console `0` and non-black
canvas.
