# Live workflow

## Clean browser proof

Use the clean, non-instrumented MetaFor tab for first-paint, CPU, heap,
console, reload-loop, loader, and final visual evidence. Keep Inspector out of
these measurements because injection changes timings and object counts.

Before browser input, verify the control-service health and resolve the exact
page through `GET http://127.0.0.1:7880/cdp/targets`. Retain its stable
`targetId`; do not substitute `windowId/tabIndex` from `/windows` for the
dedicated CDP profile. Keep Codex and the CDP Chrome window visible side by
side in one macOS Space.

## Instrumented GPU proof

1. Create or identify the clean MetaFor CDP target before attaching Inspector.
2. Call `browser_status`.
3. Attach to `http://localhost:9222` with `reloadPages: false`. This registers
   future-document injection without instrumenting the already loaded clean
   document.
4. Call `open_page` for `http://127.0.0.1:4004/` and retain its `pageId`.
5. Use `screenshot_page` and require a nonempty scene plus the yellow Inspector
   HUD.
6. Query `/cdp/targets` again and identify the page target created by
   `open_page`. It is distinct from the clean target and from the MCP `pageId`.
7. Start `scripts/arm-capture-drag.sh <instrumented-target-id>` through a
   long-lived `exec_command` with a short initial yield (for example 250 ms).
   Retain its session ID instead of waiting for completion. The target-bound
   watcher waits for `webgpuInspector._localCaptureActive` and then sends one
   real CDP camera drag.
8. While that exec session is running, call `capture_frames` with
   `payloads: "none"` and `profilePasses: true`. Afterwards poll the exec
   session and require `capture-triggered`. This order avoids the orchestrator
   serializing capture and input calls. A zero-command capture means no
   rendered frame occurred and is not a performance result.
9. Require render passes and draw calls. Call `analyze_performance` and
   `get_validation_errors`.
10. If GPU timestamps are unavailable, report that explicitly. Do not infer
   measured GPU time from fill-workload heuristics.
11. Close the temporary instrumented tab; keep the clean tab and contour in the
    requested state.

For detailed capture interpretation, use `$webgpu-capture-analysis`.

## Evidence boundaries

- Inspector capture proves GPU command/object structure and validation state.
- A timed capture proves GPU time only when timestamp results are present.
- Large idle gaps in an event-driven renderer are not dropped animation frames;
  do not treat Inspector rAF averages as continuous-FPS evidence.
- Lighthouse mobile throttling is a comparative stress test, not a native
  desktop first-paint measurement.
