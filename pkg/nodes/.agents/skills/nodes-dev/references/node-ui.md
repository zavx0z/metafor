# Node UI component playground

| Property | Value |
| --- | --- |
| Public name | `ui` |
| Shared selector | `node-ui` |
| Package cwd | `pkg/nodes/ui` |
| Command | `bun playground/server.ts` |
| Origin | `http://127.0.0.1:4016` |
| Default route | `/editor/scene` |
| Ready marker | `nodeComponentPlayground=ready` |
| Canvas | `#node-component-canvas` |

This no-HMR contour owns NodeEditor, Frame, Node, Parameter, Socket, Link and
Blender renderer stories. The Nodes wrapper delegates to the same shared
`node-ui` selector used by the UI dispatcher, so it must reuse one PID and one
background target.

After production Node UI or package stories change, run focused tests, restart
`ui`, reload its exact route and verify DOM, console `0` and a non-black canvas.
Story-only changes stop after this package proof. Production Node UI changes
also require restart/reload of `root`.

Choose the exact story pathname from `pkg/nodes/ui/playground/routes.ts` and its
story registry; do not silently use the default route for a different story.

Run `targets` first. If it returns zero candidates, run `open`, then list again.
If it returns exactly one, copy that `id` to `target_id`. If it returns more
than one, stop and reconcile only an exact duplicate created by the current
task.

```bash
SKILL=pkg/nodes/.agents/skills/nodes-dev
"$SKILL/scripts/nodes-dev.sh" ensure "$PWD" --playground ui
bun test ./pkg/nodes/ui
bun run --cwd pkg/nodes/ui typecheck
bun run --cwd pkg/nodes/ui typecheck:playground
"$SKILL/scripts/nodes-dev.sh" restart "$PWD" --playground ui
story_route=node-editor/scene/default
bun "$SKILL/scripts/nodes-browser.ts" targets "$PWD" --playground ui
bun "$SKILL/scripts/nodes-browser.ts" open "$PWD" --playground ui \
  --route "/$story_route" # only when targets returned zero candidates
bun "$SKILL/scripts/nodes-browser.ts" targets "$PWD" --playground ui # list again after open
target_id="copy-the-single-target-id"
bun "$SKILL/scripts/nodes-browser.ts" reload "$PWD" --playground ui \
  --route "/$story_route" --target-id "$target_id"
bun "$SKILL/scripts/nodes-browser.ts" dom "$PWD" --playground ui \
  --route "/$story_route" --target-id "$target_id"
bun "$SKILL/scripts/nodes-browser.ts" console "$PWD" --playground ui \
  --route "/$story_route" --target-id "$target_id"
bun "$SKILL/scripts/nodes-browser.ts" canvas "$PWD" --playground ui \
  --route "/$story_route" --target-id "$target_id" --output /tmp/node-ui.png
```
