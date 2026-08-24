# Root NodeTree runtime playground

| Property | Value |
| --- | --- |
| Public name | `root` |
| Shared selector | `nodes` |
| Package cwd | `pkg/nodes/playground` |
| Command | `bun server.ts` |
| Origin | `http://127.0.0.1:4018` |
| Default route | `/node-tree/runtime/live` |
| Ready marker | `nodesPlayground=ready` |
| Canvas | `#nodes-playground-canvas` |

This contour proves `NodeTree → projection → NodeEditor`. After runtime,
projection, layout, Node UI or shared UI dependencies change, run focused tests,
restart `root`, resolve its singleton target, explicitly reload the exact route,
then verify DOM, console `0` and a non-black canvas.

Run `targets` first. If it returns zero candidates, run `open`, then list again.
If it returns exactly one, copy that `id` to `target_id`. If it returns more
than one, stop and reconcile only an exact duplicate created by the current
task; passing one ID does not waive the singleton rule.

```bash
SKILL=pkg/nodes/.agents/skills/nodes-dev
"$SKILL/scripts/nodes-dev.sh" ensure "$PWD" --playground root
bun test ./pkg/nodes/core/node-tree-runtime.test.ts \
  ./pkg/nodes/core/parameter.test.ts \
  ./pkg/nodes/ui/blender-projection.test.ts
"$SKILL/scripts/nodes-dev.sh" restart "$PWD" --playground root
bun "$SKILL/scripts/nodes-browser.ts" targets "$PWD" --playground root
bun "$SKILL/scripts/nodes-browser.ts" open "$PWD" --playground root \
  --route /node-tree/runtime/live # only when targets returned zero candidates
bun "$SKILL/scripts/nodes-browser.ts" targets "$PWD" --playground root # list again after open
target_id="copy-the-single-target-id"
bun "$SKILL/scripts/nodes-browser.ts" reload "$PWD" --playground root \
  --route /node-tree/runtime/live --target-id "$target_id"
bun "$SKILL/scripts/nodes-browser.ts" dom "$PWD" --playground root \
  --route /node-tree/runtime/live --target-id "$target_id"
bun "$SKILL/scripts/nodes-browser.ts" console "$PWD" --playground root \
  --route /node-tree/runtime/live --target-id "$target_id"
bun "$SKILL/scripts/nodes-browser.ts" canvas "$PWD" --playground root \
  --route /node-tree/runtime/live --target-id "$target_id" \
  --output /tmp/nodes-root.png
```

The ready marker appears only after the first projection reaches NodeEditor and
a frame renders. For cache/invalidation work, exercise the exact changed path
with the bundled bounded data-only plan:

```bash
bun "$SKILL/scripts/nodes-browser.ts" interact "$PWD" --playground root \
  --route /node-tree/runtime/live --target-id "$target_id" \
  --plan pkg/nodes/.agents/skills/nodes-dev/references/root-cache-invalidation.plan.json
```

Assert `treeRevision=1`, `projectionRevision=1`, `reusedMeasurements=2` and
`reusedLayouts=1` in the checkpoint DOM. Reload alone proves only the initial
projection. These counters are runtime evidence, not proof of another package
or product integration.

For structural authoring, use the separate repeatable editor plan after an
exact reload:

```bash
bun "$SKILL/scripts/nodes-browser.ts" interact "$PWD" --playground root \
  --route /node-tree/runtime/live --target-id "$target_id" \
  --plan pkg/nodes/.agents/skills/nodes-dev/references/root-editor-topology.plan.json
```

Its first two checkpoints must keep the previous projection while
`nodeTreeLayoutDirty=true`; the final F9 checkpoint must match tree and
projection topology revisions, clear the dirty marker and capture a non-black
canvas. F6 adds one Parameter, F7 disconnects one Link, and neither command
runs layout before F9.
