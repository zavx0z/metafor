# Standalone browser workflow

Read this reference only for the `@nodes/ui` component playground. Hamiltonian
uses `$metafor-dev` and its own managed contour.

## Lifecycle and ownership

From the repository root:

```bash
SKILL=pkg/nodes/.agents/skills/node-system-dev
"$SKILL/scripts/playground.sh" status
"$SKILL/scripts/playground.sh" health
"$SKILL/scripts/playground.sh" serve
```

The server is `pkg/nodes/ui/playground/server.ts` on
`http://127.0.0.1:4016/`. Its Bun configuration explicitly disables HMR.
Run `serve` through a long-lived `exec_command` PTY and keep its session ID.
It refuses to replace or adopt any listener not recorded as its exact
checkout-owned process and returns status `2` after preserving one. It does
not use `nohup`: Codex may reap detached children with the tool process group.
`stop` preserves an unowned listener. Use
`NODE_SYSTEM_DEV_PORT` only for an isolated lifecycle test; normal development
uses `4016`.

At every new turn run `status`. A stale browser target is not server health;
if listener/health is absent, start a fresh foreground `serve` PTY and reload
the exact target before collecting evidence.

## Exact Chrome target

The helper checks `GET /health`, requires CDP, and resolves a `page` target by
the exact URL `http://127.0.0.1:4016/` from `GET /cdp/targets`:

```bash
python3 "$SKILL/scripts/browser.py" target
python3 "$SKILL/scripts/browser.py" open
python3 "$SKILL/scripts/browser.py" reload
python3 "$SKILL/scripts/browser.py" focus
```

`open` creates the URL through `POST /cdp/targets` only when no exact target
exists. More than one exact target is ambiguous and stops the workflow. Never
substitute `/windows`, an active tab, a first target, or a different origin.
`focus` calls `Page.bringToFront` only for that exact target; it does not guess
an ordinary Chrome profile or OS window.

## DOM, console, and images

```bash
python3 "$SKILL/scripts/browser.py" dom
python3 "$SKILL/scripts/browser.py" console --duration-ms 1200
python3 "$SKILL/scripts/browser.py" canvas /tmp/node-system-canvas.png
```

Use `canvas` for exact WebGPU canvas pixels: it evaluates
`canvas.toDataURL("image/png")` on the exact target. A whole-window screenshot
is a different artifact. Use `@meta/chrome /screenshot` only when the service
can map an exact browser window and tab. If it reports multiple-profile
ambiguity, stop; never fall back to the first Chrome window or mislabel the
canvas PNG as a window screenshot. Before any screenshot, state the expected
visible result in its required caption, inspect the image, and report mismatch.

The DOM result includes the target URL, readiness marker, dataset selection and
canvas transform, inner/scroll dimensions, DPR, and canvas backing/client size.
Console capture reports the exact target and entries collected during the
requested interval.

## Desktop and mobile viewports

Run the complete matrix as one helper operation:

```bash
capture_dir="$(mktemp -d)"
python3 "$SKILL/scripts/browser.py" viewports --output-dir "$capture_dir"
```

The operation first clears any stale device override and records the current
native desktop metrics. It then checks portrait `390x844 @2`, landscape
`844x390 @2`, readiness, horizontal overflow, console errors, and optional
exact canvas captures. A `finally` path clears emulation, reloads, and verifies
that the final metrics equal the initial native metrics.

`DELETE /viewport` restores native device metrics; it does not claim that a
particular physical window size is an acceptance standard. Do not hand off a
target while an emulation override remains active.

## Atomic synthetic touch sequence

```bash
python3 "$SKILL/scripts/browser.py" touch
```

The command establishes portrait emulation, dispatches one-touch pan followed
by two-touch pinch inside one page evaluation, verifies transform changes, and
restores native metrics in `finally`. The entire `touchstart -> touchmove ->
touchend` sequence is sent in one REST `POST /eval`.

Do not split `Input.dispatchTouchEvent` across `/cdp/command` requests.
`@meta/chrome` creates a new CDP session for each command, so Chrome loses the
active touch after `touchStart`. The bundled check deliberately uses one atomic
synthetic page sequence instead. It proves handler behavior, not trusted input
or a physical phone.

## Acceptance labels

| Evidence | What it proves | What remains open |
| --- | --- | --- |
| Unit/type/Flex checks | Pure contracts and structural composition | Runtime pixels and interaction |
| DOM and console | State of one exact target during capture | Visual quality |
| Canvas PNG | Exact canvas bytes at one viewport | Browser chrome and owner judgment |
| Window screenshot | Visible page state at capture time | Physical device behavior |
| Mobile emulation + synthetic touch | Emulated responsive and handler path | Physical mobile proof |
| Physical-device run | Exercised device/browser path | Explicit visual acceptance |
| Owner acceptance | Owner accepted the presented result | No inferred replacement |

Always label an isolated check with its exact origin, target, viewport, and
input type. Never collapse these evidence classes into “visually accepted.”
