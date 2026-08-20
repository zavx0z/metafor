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
"$SKILL/scripts/ui-dev.sh" ensure "$PWD" components
```

The supervising task runs `ensure` before its first lifecycle or browser
operation. For an exact healthy process it reports `outcome:"reused"` and
returns without changing the PID. For a stopped selector it reports
`outcome:"started"` when ready, then remains foreground owner of the exact Bun
child; launch it through a long-lived PTY and keep its session ID. A short-lived
source subagent does not own this PTY. `start` and `restart` have the same
foreground lifetime when explicitly needed. A detached child is not persistent
under the Codex tool process group.

`status` includes one bounded `lastExit` record. TERM/HUP loss of the owning
wrapper is reported as `owner-session-lost` with a recovery hint; explicit
`stop` overwrites it with `manual-stop`. `ensure` preserves a foreign listener
with `outcome:"refused-foreign"`, and reports an exact owned but unhealthy
process as `outcome:"owned-unhealthy"` without restarting or killing it. Use an
explicit `restart` only after diagnosing that state.

Every action resolves cwd, argv, port environment, origin, HTTP marker, DOM
ready marker, canvas capability, state key, PID and log from the registry. An
unowned listener returns a typed `foreign` outcome and remains untouched.
Elements uses the same exact package ownership and singleton target rules.

A long-lived Bun server does not prove that it has reread a changed workspace
package manifest or `exports`. After such a change, restart every affected
selector through the dispatcher. A successful fresh build proves only current
disk resolution; it does not prove the old process. If the existing document
previously received `500` for `/entry.js`, explicitly `reload` its exact target
after server recovery: navigating to the same URL does not reload it.

The dispatcher needs process inspection and localhost HTTP access. In a
restricted process/network sandbox its status can be false `foreign` or
`unhealthy`, and server bind can surface as false `EADDRINUSE`. Run lifecycle and
browser commands outside that restriction before deciding ownership or changing
a process. Never use the restricted result to adopt or kill a listener.

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

`canvas` validates real pixels by copying the WebGPU canvas into a bounded 2D
RGB/alpha probe. A first `starting-or-idle-black` snapshot is rejected, then the
same target receives exactly one same-route `Page.navigate` plus ready wait to
create renderer activity. During that retry only, background focus emulation
removes renderer throttling; a generic `resize` event requests the package
renderer, then two animation frames and a fixed 250 ms settle are awaited within
a two-second bound. Emulation is restored to `false` in `finally`.
A non-black second snapshot is written atomically and reports `attempts:2`, the
rejected first probe, and
`rendererActivity:"same-route-navigation"`. A second black snapshot returns
`kind:"starting-or-idle-black"`, `written:false`, exits nonzero, and does not
write or remove the destination. There is no further retry.

## Viewports and Node touch

```bash
capture_dir="$(mktemp -d)"
bun "$SKILL/scripts/ui-browser.ts" viewports "$PWD" components \
  --route /button/basic/text --output-dir "$capture_dir"
bun "$SKILL/scripts/ui-browser.ts" touch "$PWD" node-ui
```

`viewports` records native desktop metrics, verifies portrait `390x844 @2` and
landscape `844x390 @2`, captures optional exact canvas PNGs, and force-clears
device/touch emulation in `finally`. Each viewport reload already supplies
renderer activity, so a black viewport capture is rejected with the same typed
outcome and no additional retry. Final native metrics must equal the initial
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
| Fresh in-memory build | Current disk source and manifests resolve | Old process and loaded document |
| DOM and console | State of one route-specific background target | Visual quality |
| Accepted non-black Canvas PNG | Pixel-probed exact canvas for that target and viewport | Browser chrome and owner judgment |
| Mobile emulation or synthetic touch | Responsive/handler path | Physical-device proof |
| Structured profile | Sampled CPU/frame/heap interval | GPU pass timing and owner acceptance |
| External Inspector capture | Recorded GPU objects/commands/validation | Owner acceptance |

Never label any automated result as owner acceptance.
