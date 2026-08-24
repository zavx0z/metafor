# Central UI playground workflow

Read this reference for lifecycle, route-specific browser evidence and source
freshness of the centralized UI catalog. Nodes lifecycle belongs `$nodes-dev`.

## Maintained contours

The executable registry is `scripts/playgrounds.json`.

| Selector | Origin | Ownership |
| --- | --- | --- |
| `ui` | `http://127.0.0.1:4017` | one UI catalog process and target |
| `nodes` | `http://127.0.0.1:4018` | browser/dispatcher seam reused only by `$nodes-dev` |

The UI selector serves these package pages:

| Mount | Kind | Canvas |
| --- | --- | --- |
| `/` | DOM catalog | none |
| `/elements/` | WebGPU story tree | `#stage-canvas` |
| `/components/` | WebGPU story tree | `#stage-canvas` |
| `/playground/` | diagnostic WebGPU tree | `#playground-canvas` |
| `/hud/` | DOM package inventory | none |

## Lifecycle and source freshness

From the exact checkout root:

```bash
SKILL=pkg/ui/playground/.agents/skills/ui-dev
"$SKILL/scripts/ui-dev.sh" status "$PWD"
"$SKILL/scripts/ui-dev.sh" ensure "$PWD"
```

The wrapper always selects `ui`; it does not accept a package selector. A
healthy exact process is reused. A stopped contour is started only by
`ensure/start/restart` in a retained long-lived PTY. A foreign listener is
reported and preserved.

`UI_DEV_TEST_MODE=1 UI_DEV_TEST_PORT=<ephemeral>` isolates only lifecycle HTTP
state. It does not redirect CDP: without an explicitly separate
`UI_DEV_CDP_PORT`, browser commands still inspect port `9222`. Therefore a
no-real-browser audit uses hub/tests/typechecks only.

The UI hub is no-HMR. After a stable checkpoint:

| Changed scope | Running selector that must restart |
| --- | --- |
| `pkg/ui/elements` production/stories/exports | `ui`; also `nodes` if its Node UI consumer is required |
| `pkg/ui/components` production/stories/exports | `ui`; also `nodes` if required |
| shared `pkg/ui/playground` router/shell/server | `ui` and every required running importer |
| UI hub catalog, page entry or skill registry | `ui` |
| route-only navigation on fresh source | none |

Do not start an unrelated stopped selector only to satisfy the table. After a
required restart, reload each exact route in the existing singleton target.

## One stable background target

```bash
bun "$SKILL/scripts/ui-browser.ts" open "$PWD" ui --route /
bun "$SKILL/scripts/ui-browser.ts" dom "$PWD" ui --route /elements/
bun "$SKILL/scripts/ui-browser.ts" canvas "$PWD" ui \
  --route /elements/div/basic/background --output /tmp/elements.png
bun "$SKILL/scripts/ui-browser.ts" canvas "$PWD" ui \
  --route /components/button/basic/contained --output /tmp/components.png
bun "$SKILL/scripts/ui-browser.ts" dom "$PWD" ui --route /hud/
bun "$SKILL/scripts/ui-browser.ts" page "$PWD" ui \
  --route /hud/ --output /tmp/ui-hud.png
```

Every overview has trailing `/`; every exact leaf does not. The helper performs
a no-redirect HTTP preflight for registry routes. `308` reports the canonical
address, `404` is rejected, and DOM routes reject canvas-only actions. One UI
origin target is navigated in place. Multiple targets are explicit ambiguity;
close only a duplicate proven to belong to the current task.

Each nested page must expose `data-playground-home` with `href="/"`. Verify the
link in DOM and use `page` when the full composition, SVG or DOM overlay needs
visual inspection. Use a background interaction plan only when click behavior
itself is in scope.

## Interaction and viewport evidence

`interact` requires selector `ui`, explicit canonical route, explicit existing
target ID and a versioned JSON data plan. It never evaluates supplied JavaScript.
Use pointer/key steps and checkpoints exactly as described by the plan schema in
`scripts/interaction-plan.ts` tests.

`viewports` and `profile` are available only on the current route's WebGPU
canvas. Viewport emulation and background focus emulation are restored in
`finally`. Canvas capture rejects two consecutive black snapshots and never
writes a rejected artifact.

Automated DOM, canvas, input and profile evidence remains route-specific and is
not owner acceptance.
