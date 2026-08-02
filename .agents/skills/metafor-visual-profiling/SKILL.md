---
name: metafor-visual-profiling
description: Prepare, run, observe, and profile the local MetaFor Bulk/Visual browser contour with a persistent launchd service, one CDP Chrome, the external WebGPU Inspector MCP, clean first-paint measurements, screenshots, and GPU command captures. Use for MetaFor Bulk or Visual development, browser runtime verification, WebGPU profiling, contour lifecycle, or when reproducing this diagnostics environment on another Mac or for another agent.
---

# MetaFor Visual profiling

Keep diagnostics external to MetaFor. Never add WebGPU Inspector scripts,
packages, loaders, flags, overlays, or capture APIs to application source,
HTML, runtime, build, or browser bundles.

## Start every session

1. Resolve the exact user-named MetaFor checkout and preserve its branch and
   unrelated changes. Never substitute another checkout.
2. Run `scripts/doctor.sh <checkout>`.
3. Put Codex and the single CDP Chrome window side by side in the same macOS
   Space before browser development or profiling. Keep one clean MetaFor tab
   and use one temporary instrumented tab only for GPU diagnostics.
4. Use `scripts/contour-service.sh status <checkout>`. Start or restart the
   service only after proving no unrelated process owns ports 4000-4005.

Read `references/setup.md` only when installing, repairing, or moving the
environment to another Mac. Read `references/workflow.md` before a live
performance or visual proof.

For a first Inspector installation, run `scripts/setup-inspector.sh`. The
script defaults to the owner fork and an immutable tested commit. Pass an
explicit repository URL and full commit only to test another approved build.

## Contour lifecycle

Use the launchd wrapper so the contour survives Codex and terminal restarts:

```bash
scripts/contour-service.sh install <checkout>
scripts/contour-service.sh start <checkout>
scripts/contour-service.sh status <checkout>
scripts/contour-service.sh restart <checkout>
scripts/contour-service.sh stop <checkout>
```

After `install`, use the short command from any directory:

```bash
metafor-contour status
metafor-contour restart
metafor-contour logs
```

The service must run exactly `bun run runtime:universe` from the selected
checkout on standard ports 4000-4005. Do not enable HMR, port overrides,
login autostart, or automatic crash restart. Use `logs` for recent output and
`uninstall` only when the user asks to remove the service.

## Browser and Inspector

- Use one Chrome process with the dedicated CDP profile on port 9222. The MCP
  injects Inspector into new diagnostic pages; do not install the extension in
  that profile because double instrumentation corrupts measurements.
- Check the macOS control services before first use. Resolve the dedicated CDP
  tab through `GET /cdp/targets` and keep its stable `targetId`; `/windows` and
  `windowId/tabIndex` belong to regular AppleScript Chrome windows and may be
  empty for the separate CDP profile.
- Load the clean page before attaching Inspector. Attach with
  `attach_browser({ browserURL: "http://localhost:9222", reloadPages: false })`,
  then open a separate instrumented page with `open_page`. Do not reload the
  clean measurement tab.
- For the event-driven renderer, resolve the temporary instrumented target ID,
  start `scripts/arm-capture-drag.sh <target-id>` in a long-lived exec session
  with a short initial yield, then call `capture_frames` while that session is
  still running. The helper waits for the actual armed state and sends one
  target-specific CDP camera drag. Poll the exec session afterwards and
  require `capture-triggered`. Do not try to overlap nested tool calls in one
  orchestrator cell; they can execute sequentially and yield an empty capture.
  A zero-command capture is not a performance result.
- Close the temporary instrumented tab after diagnostics. Leave the clean tab
  and requested contour running.

For capture interpretation, also apply `$webgpu-capture-analysis`.

## Acceptance

Require all of the following before calling the environment ready:

- doctor reports the checkout, dependencies, MCP configuration, CDP, and
  contour state without required failures;
- the service survives one Codex restart and remains controllable through
  `status` and `restart`;
- the clean tab has no reload loop or console errors;
- the instrumented page shows a nonempty scene;
- a camera-drag capture contains render passes and draw calls, and validation
  errors are explicitly checked;
- clean first-paint/CPU/heap measurements remain separate from instrumented
  GPU captures.
