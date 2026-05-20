# Source To Edit Draft

Debug UI now has a first safe draft-editing step on top of the shared editor layer.

## Behavior

- `SourcePane` remains the default paused-source viewer.
- The toolbar can switch the central source area into `Edit Draft` mode.
- `EditorPane` is imported from `@metafor/components`, receives the current `/source` text and resolves highlighting by source path.
- Draft state is held only in the browser process memory.
- `Cmd/Ctrl+S` or the toolbar save action marks the draft as saved in memory and writes nothing to disk.
- The toolbar exposes draft state as `clean`, `dirty`, `saved in memory`, or `no source`.

## UI Stabilization

- The toolbar uses stable fixed-width status chips so labels do not resize the row when state changes.
- The language switch is the first toolbar chip and persists `ru` / `en` in `localStorage`.
- Socket, inspector and target states are short visible labels with delayed localized tooltips for details.
- Debugger control commands are serialized in the browser UI: pause/resume/step/eval allow one active command at a time, disable the control buttons while the command is in flight, and show the active operation in the target status chip.
- Paused source highlighting is stronger: the active line has an orange outline/rail in addition to the execution arrow.
- Verbose events are compacted for UI reading: routine successful inspector responses and polling noise are hidden, important events are summarized, and autoscroll pins to the newest event while enabled.

## Target Start / BRK

- `pauseOnStart` is now command-level BRK, not a late `Debugger.pause`.
- When the user starts a Bun target with pause-on-start enabled, `--inspect-wait=...` / `--inspect=...` is normalized to `--inspect-brk=...`.
- The default UI target command starts with BRK enabled, so the first pause lands on the first executable line of the user script instead of Node/Bun service frames.
- The REST `/target/run` shape is unchanged: callers still pass `{ command, pauseOnStart }`.

## Boundaries

This step does not change:

- REST endpoints
- WebSocket `/ws`
- source patching or file writes

## Verification

- `bun run --filter @metafor/elements typecheck`
- `bun run --filter @metafor/components typecheck`
- `bun run --filter @metafor/bun-debug typecheck`
- `bun test ui/elements`
- `bun test ui/components`
- `bun test pkg/debug`

Next step: diff/patch preview before any file write or target rerun flow.
