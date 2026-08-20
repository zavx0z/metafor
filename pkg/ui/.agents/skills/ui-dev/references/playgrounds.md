# Package playground workflow

Read this reference only for standalone UI and Node package playgrounds.
Hamiltonian uses `$metafor-dev`.

## Maintained selectors

The executable registry is `scripts/playgrounds.json`.

| Selector | Package contour | Origin | Ready and canvas capability |
| --- | --- | --- | --- |
| `node-ui` | `@nodes/ui`, `pkg/nodes/ui` | `http://127.0.0.1:4016` | `nodeComponentPlayground=ready`, WebGPU canvas, touch, pathname routes |
| `components` | `@ui/components`, `pkg/ui/components` | `http://127.0.0.1:4017` | loaded `#stage-canvas`, WebGPU canvas, pathname routes |
| `ui-fixture` | diagnostic `@ui/playground` fixture | `http://127.0.0.1:4192` | `playgroundReady=ready`, WebGPU canvas, pathname routes |
| `elements` | `@ui/elements`, `pkg/ui/elements` | `http://127.0.0.1:7901` | `elementsPlayground=ready`, WebGPU canvas, pathname routes |

`@nodes/layout` is intentionally not a selector. Its current SVG server is a
separate solver-only contour and still enables HMR. Add it only after an owner
accepts a maintained non-WebGPU lifecycle; do not invent a replacement command
or port in this skill.

## Lifecycle and ownership

From the exact checkout root:

```bash
SKILL=pkg/ui/.agents/skills/ui-dev
"$SKILL/scripts/ui-dev.sh" status "$PWD" components
"$SKILL/scripts/ui-dev.sh" start "$PWD" components
```

Launch `start` or `restart` through a long-lived PTY and keep its session ID.
The command prints structured state when ready and then waits on the exact Bun
child. A detached child is not persistent under the Codex tool process group.

Every action resolves cwd, argv, port environment, origin, HTTP marker, DOM
ready marker, canvas capability, state key, PID and log from the registry. An
unowned listener returns a typed `foreign` outcome and remains untouched.
Elements uses the same exact package ownership and singleton target rules.

Use `UI_DEV_TEST_MODE=1 UI_DEV_TEST_PORT=<free-port>` only for isolated tests;
normal work always uses the registry port.

## One stable background browser target

The browser helper uses the existing CDP Chrome. One selector reuses one target
for its origin and navigates that target between routes. Only a selector with no
existing origin target may call `Target.createTarget({background:true})`:

```bash
bun "$SKILL/scripts/ui-browser.ts" open "$PWD" components --route /button/basic/text
bun "$SKILL/scripts/ui-browser.ts" dom "$PWD" components --route /button/basic/text
bun "$SKILL/scripts/ui-browser.ts" console "$PWD" components --route /button/basic/text
bun "$SKILL/scripts/ui-browser.ts" canvas "$PWD" components \
  --route /button/basic/text --output /tmp/components-text.png
bun "$SKILL/scripts/ui-browser.ts" dom "$PWD" elements --route /layout/flex-css
bun "$SKILL/scripts/ui-browser.ts" canvas "$PWD" elements \
  --route /layout/flex-css --output /tmp/elements-flex-css.png
bun "$SKILL/scripts/ui-browser.ts" dom "$PWD" node-ui --route /editor/scene
bun "$SKILL/scripts/ui-browser.ts" canvas "$PWD" node-ui \
  --route /comparison/blender --output /tmp/node-comparison.png
```

The common route declaration fixes pathname behavior for every maintained
playground. The default Node route and CLI `--route /editor/scene` both resolve
to `http://127.0.0.1:4016/editor/scene`; selector registry cannot override the
pathname behavior.

Route is page state, not a reason to create another tab. `open`, `dom`,
`console`, `canvas`, `viewports`, `touch` and `profile` attach to the same
selector target and navigate it when necessary. Zero origin targets fail unless
`open` was requested; multiple origin targets are ambiguous and fail. Use
`targets` to list exact IDs and `--target-id` to name an existing one. Close only
an exact task-created duplicate with `close --target-id`; never reconcile by
closing an unknown owner tab. The helper never selects the active tab and never
exposes a focus action.

For an exact URL outside the registry, pass the URL in place of a selector and
provide `--canvas-selector` when canvas capture is needed. This does not grant
lifecycle ownership of that origin.

## Viewports and Node touch

```bash
capture_dir="$(mktemp -d)"
bun "$SKILL/scripts/ui-browser.ts" viewports "$PWD" components \
  --route /button/basic/text --output-dir "$capture_dir"
bun "$SKILL/scripts/ui-browser.ts" touch "$PWD" node-ui
```

`viewports` records native desktop metrics, verifies portrait `390x844 @2` and
landscape `844x390 @2`, captures optional exact canvas PNGs, and force-clears
device/touch emulation in `finally`. Final native metrics must equal the initial
metrics. `touch` is available only for a registry canvas with `touch:true`; its
one-touch pan and two-touch pinch are one atomic page evaluation and remain
synthetic evidence.

## Node reference asset boundary

The maintained Blender screenshot lives with this skill in `assets/`. The Node
playground binds `/ui-dev/blender-4.5.5-reference.png` directly to that owner
file. No old node-local skill directory or compatibility route exists.

## Acceptance labels

| Evidence | What it proves | What remains open |
| --- | --- | --- |
| Registry/lifecycle tests | Exact supported commands and process ownership | Browser rendering |
| DOM and console | State of one route-specific background target | Visual quality |
| Canvas PNG | Exact canvas pixels for that target and viewport | Browser chrome and owner judgment |
| Mobile emulation or synthetic touch | Responsive/handler path | Physical-device proof |
| Structured profile | Sampled CPU/frame/heap interval | GPU pass timing and owner acceptance |
| External Inspector capture | Recorded GPU objects/commands/validation | Owner acceptance |

Never label any automated result as owner acceptance.
