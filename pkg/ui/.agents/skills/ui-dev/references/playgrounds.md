# Package playground workflow

Read this reference only for standalone UI and Node package playgrounds.
Hamiltonian uses `$metafor-dev`.

## Maintained selectors

The executable registry is `scripts/playgrounds.json`.

| Selector | Package contour | Origin | Ready and canvas capability |
| --- | --- | --- | --- |
| `nodes` | parent runtime consumer `@nodes/playground`, `pkg/nodes/playground` | `http://127.0.0.1:4015` | `nodesPlayground=ready`, WebGPU canvas, touch, pathname routes; lifecycle belongs `$nodes-dev` |
| `node-ui` | `@nodes/ui`, `pkg/nodes/ui` | `http://127.0.0.1:4016` | `nodeComponentPlayground=ready`, WebGPU canvas, touch, pathname routes |
| `components` | `@ui/components`, `pkg/ui/components` | `http://127.0.0.1:4017` | loaded `#stage-canvas`, WebGPU canvas, pathname routes |
| `ui-fixture` | diagnostic `@ui/playground` fixture | `http://127.0.0.1:4192` | `playgroundReady=ready`, WebGPU canvas, pathname routes |
| `elements` | `@ui/elements`, `pkg/ui/elements` | `http://127.0.0.1:7901` | `elementsPlayground=ready`, WebGPU canvas, pathname routes |

`@nodes/layout` is intentionally not a selector. Root `nodes` owns the WebGPU
runtime playground through `$nodes-dev`; the pure solver is verified by focused
tests and has no independent browser lifecycle.

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

### No-HMR source freshness gate

All maintained selectors are no-HMR by design. HMR is not accepted evidence for
this package architecture: it can replace only part of a split graph, preserve
stale retained/runtime state, bypass a changed manifest/export, and leave the
existing document on a different source boundary than its server. A successful
fresh build proves current disk resolution only; a healthy/reused process and a
browser reload do not prove that process compiled the same graph.

Use this decision table after a stable scoped source checkpoint:

| Changed scope | Required selector restart |
| --- | --- |
| `pkg/ui/elements` production, exports or manifest | `elements`, `components`, `node-ui`, `nodes`, and every running shared fixture importer |
| `pkg/ui/components` production, exports or manifest | `components`, `node-ui`, `nodes`, and every running shared fixture importer |
| root `pkg/nodes` runtime, projection contract or exports | `nodes` |
| `pkg/nodes/layout` production, exports or manifest | `nodes` |
| `pkg/nodes/ui` production | `node-ui` and `nodes` |
| package-owned Node UI stories | `node-ui` |
| parent `pkg/nodes/playground` source | `nodes` |
| package-owned Elements stories | `elements` |
| package-owned Components stories | `components` |
| shared `pkg/ui/playground` shell/router/theme | every running maintained selector |
| exact selector server/browser entry or build config | that selector and each direct importer named above |
| route/args-only navigation with no source change | no restart; navigate/reload the same target |

When a listed selector is not running, do not start it only to satisfy the
table. Restart every affected selector that is running or is required by the
current acceptance path. If dependency reachability is uncertain, treat the
consumer as affected instead of assuming freshness.

After every restart, resolve the existing singleton target and run explicit
`reload --target-id ... --route ...`. This is mandatory even if the target URL
already matches: same-URL navigation may leave the previous document loaded.
Then prove DOM ready plus exact route/source/args, console `0`, and non-black
canvas. Report new PID/processStart, target ID, route and source checkpoint.

Do not restart an owner-visible contour while source is an unfinished atomic
patch merely to preview it. A deliberate RED diagnosis of dirty source must be
labelled uncommitted/intermediate and cannot become current/final evidence. For
normal handoff, commit/checkpoint first, then restart and reload.

If the existing document previously received `500` for `/entry.js`, explicit
reload after recovery is especially required; navigating to the same URL does
not reload it.

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
`console`, `canvas`, `interact`, `viewports`, `touch` and `profile` attach to the
same selector target and navigate it when necessary. Zero origin targets fail
unless `open` was requested; multiple origin targets are ambiguous and fail. Use
`targets` to list exact IDs and `--target-id` to name an existing one. Close only
an exact task-created duplicate with `close --target-id`; never reconcile by
closing an unknown owner tab. The helper never selects the active tab and never
exposes a focus action.

For an exact URL outside the registry, pass the URL in place of a selector and
provide `--canvas-selector` when canvas capture is needed. This does not grant
lifecycle ownership of that origin.

## Background pointer and keyboard plans

Use `interact` after the source-fresh restart and explicit `reload` gate. Unlike
ordinary route commands it requires a registry selector, explicit route,
explicit existing target ID and a target already loaded at that exact URL. It
does not create or navigate a target:

```bash
bun "$SKILL/scripts/ui-browser.ts" reload "$PWD" components \
  --route /integer-input/basic/labeled --target-id "$target_id"
bun "$SKILL/scripts/ui-browser.ts" interact "$PWD" components \
  --route /integer-input/basic/labeled --target-id "$target_id" \
  --plan /tmp/integer-pointer.json
```

The plan is JSON data only. Version `1` accepts at most 256 ordered steps, each
settle is `0..2000` ms, total settle is at most 10 seconds, drag segments are
`1..60`, and pointer coordinates must be inside the current CSS viewport.
Unknown keys, unsupported kinds, incomplete mouse/key pairs and duplicate
modifiers fail closed. Modifiers are `alt | ctrl | meta | shift`; mouse buttons
are `left | middle | right`.

```json
{
  "version": 1,
  "settleMs": 100,
  "steps": [
    {"kind":"pointer-move", "x":310, "y":228},
    {"kind":"settle", "ms":120},
    {"kind":"checkpoint", "name":"hover", "dom":true},
    {"kind":"pointer-drag", "from":{"x":310,"y":228}, "to":{"x":390,"y":228}, "button":"left", "modifiers":["shift"], "segments":8},
    {"kind":"key-down", "key":"Escape", "code":"Escape"},
    {"kind":"key-up", "key":"Escape", "code":"Escape"},
    {"kind":"text", "text":"12"},
    {"kind":"settle", "ms":120},
    {"kind":"checkpoint", "name":"after", "dom":true, "canvas":"/tmp/integer-after.png"}
  ]
}
```

Pointer steps are `pointer-move`, `pointer-down`, `pointer-up` and
`pointer-drag`. Move/down/up use CSS `x/y`, down/up add `button`, and drag uses
`from/to/button/segments`; every pointer step accepts `modifiers`. Keyboard
down/up use `key`, optional `code` and modifiers; `text` inserts bounded text.
Every run returns initial/final DOM, all collected console entries and
checkpoint results.
An exact-route change, console error or rejected black canvas makes the command
nonzero. A checkpoint capture never performs the canvas command's same-route
activity retry because navigation would reset the interaction scenario. Reload
between independent scenarios explicitly. `interact` enables background focus
emulation only around the atomic plan, restores it to false in `finally`, and
reports both states even when input fails. This does not focus an OS window.
Background CDP input remains synthetic evidence and never implies
physical-device or owner acceptance.

Every explicit and final settle runs inside the target: it waits the requested
delay and then at least two animation frames before the next checkpoint. A
bounded no-frame timeout fails the plan and reports its frame barrier; it never
navigates or uses a host-side sleep as render evidence. Put an explicit settle
immediately before each visual checkpoint; top-level `settleMs` remains the
final post-plan barrier and does not reorder earlier checkpoints.

`canvas` validates the exact encoded artifact: it obtains `toDataURL`, decodes
that PNG through browser-native ImageBitmap/Blob, then copies the decoded image
into a bounded 2D RGB/alpha probe. Direct WebGPU-canvas drawImage is not evidence
because a hidden canvas can return an empty 2D copy while its encoded PNG is
valid. A first `starting-or-idle-black` snapshot is rejected, then the
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
