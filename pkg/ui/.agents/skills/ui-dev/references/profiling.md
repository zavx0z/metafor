# Visual and performance profiling

Read this reference only when a UI playground needs performance or GPU evidence.

## Clean background profile

Keep the normal package target non-instrumented and run:

```bash
SKILL=pkg/ui/.agents/skills/ui-dev
bun "$SKILL/scripts/ui-browser.ts" profile "$PWD" components \
  --route /button/basic/text --frames 60
```

The structured result identifies selector, exact route and CDP target, document
visibility/focus, viewport/DPR, `Performance.getMetrics` before/after,
`Runtime.getHeapUsage` before/after, and animation-frame samples. Background
throttling is disabled with focus emulation; no OS/browser focus changes.

Frame samples measure browser scheduling observed during the sampled interval.
They are not GPU timestamps. Heap values are point samples, not proof of a leak.
Compare repeated profiles under the same route, viewport, revision and workload.

## External WebGPU Inspector

Inspector remains an external diagnostic mode. Follow the instrumented capture
procedure in the repository `$metafor-dev` reference
`.agents/skills/metafor-dev/references/workflow.md`, adapting only the exact
standalone playground origin/target. Keep the clean target open and create one
separate instrumented target. Do not add Inspector scripts, bridge, extension,
package, loader, overlay, or capture API to UI/Node source, HTML, runtime, build,
or browser bundle.

Require a nonempty capture, render/compute passes or explicit evidence that none
should exist, draw/dispatch commands, and validation-error inspection. GPU time
exists only when timestamp results exist. Analyze a saved `.wgpuc` capture with
the `webgpu-capture-analysis` skill when available.

## Evidence boundary

- DOM/canvas and `Performance.getMetrics` are clean-target evidence.
- Frame/heap samples are bounded observations, not acceptance thresholds by
  themselves.
- Inspector proves only the instrumented target and captured frames.
- None of these artifacts is an owner-visible acceptance decision.
