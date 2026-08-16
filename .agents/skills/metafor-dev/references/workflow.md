# Visual and WebGPU workflow

Read this reference only for visual verification, performance profiling, or a
WebGPU capture. Ordinary Hamiltonian development uses `metafor-dev.sh` without
Inspector.

## Clean browser proof

1. Run `scripts/metafor-dev.sh status <checkout>` and retain its exact origin,
   CDP PID, and target ID.
2. Run `scripts/metafor-dev.sh start <checkout>` only when the managed contour
   is stopped. Do not launch another Chrome or Hamiltonian process.
3. Use the existing non-instrumented target for console, reload-loop, loader,
   functional, first-paint, CPU, heap, and final visual evidence.
4. Read server output through `scripts/metafor-dev.sh logs <checkout>` so the
   agent and owner observe the same iTerm session.

## Instrumented GPU proof

1. Keep the clean Hamiltonian target open.
2. Attach WebGPU Inspector to `http://127.0.0.1:9222` without reloading existing
   pages.
3. Open one separate instrumented page at the exact origin reported by
   `metafor-dev.sh status`.
4. Require a nonempty scene and the Inspector HUD before capture.
5. Resolve the instrumented page ID through Inspector and its CDP target ID
   through `http://127.0.0.1:9222/json/list`.
6. Arm `bun scripts/arm-capture-drag.ts <target-id>` in a long-lived tool
   session, then capture one frame with `payloads: "none"` and
   `profilePasses: true`.
7. Require the helper result `capture-triggered`, render passes, draw calls, and
   an explicit validation-error check. A zero-command capture is not evidence.
8. Close only the temporary instrumented page. Leave the clean target, CDP
   Chrome, and requested Hamiltonian process in their agreed state.

Inspector is external diagnostics. Never add its script, bridge, extension,
package, loader, overlay, or capture API to MetaFor source, HTML, build, or
browser bundles.

## Evidence boundary

- A functional browser check proves only the exercised user path.
- A screenshot proves only the visible state at capture time.
- An Inspector capture proves GPU commands, objects, and validation state.
- GPU time is measured only when timestamp results are present.
- Isolated automation does not replace owner-visible acceptance in the managed
  iTerm and Chrome contour.
