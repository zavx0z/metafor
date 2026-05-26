# Editor Layer Audit

## Current Placement

1. Source display and editable draft UI both use `EditorPane` from `@metafor/components`.
2. `EditorPane` owns text mutation, cursor movement, clipboard, undo/redo, optional tokenization, save/change callbacks, read-only navigation, source execution-line highlighting and gutter rendering. Scroll state comes from `@metafor/elements` `div`.
3. Debug runtime state (`paused`, `running`, `loading`, `disconnected`) stays in `pkg/debug/web/main.ts`; the shared component only receives title text, source text, tokens/language and an optional execution line.
4. The former debug-local `pkg/debug/web/source-pane.ts` was removed so code/source rendering has one implementation.
5. To keep debug stable, do not change `pkg/debug/src/*`, the `/source` REST shape, `/ws` commands/results, inspector attach flow, current-line semantics, frames/scopes/console command behavior or `bun run dark/debug/agent-attach.ts` startup.

## First Extraction

The editor layer now starts under `ui/components/editor/`:

- `tokens.ts` defines `EditorToken`, `EditorTokens`, `EditorTokenize` and `LanguageHighlighter`.
- `highlighter.ts` provides a small highlighter registry and resolver by language id or file extension.
- `languages/plaintext.ts` is the no-op fallback.
- `languages/typescript.ts` is a lightweight TypeScript/JavaScript tokenizer with the same compact token categories used by the debug source viewer.
- `token-renderer.ts` contains shared token material creation and tokenized-line rendering.
- `source-pane-base.ts` contains source-view helper types and filename-to-highlighter fallback for viewers.
- `editor-pane.ts` contains `EditorPane`; the old `ui/components/editor-pane.ts` remains a compatibility re-export.

The debug source viewer now configures `EditorPane` with `readOnly: true`, `showCaret: false` and `introAnimation: false`. Debug-specific paused/running/disconnected labels are handled outside the component.

## UI Pass

- Shared widget primitives in `ui/components/internal/renderers.ts` now use rounded control chrome through the existing `Pane.drawRoundedRect` primitive.
- `ui/elements/theme.ts` exposes shared `radii` tokens for controls and panes.
- `Pane` accepts `borderRadiusPx`, so debug panes and `EditorPane` can use the same rounded pane chrome without custom per-pane background meshes.
- `ConsolePane` now extends `@metafor/elements` `UiSurface` instead of owning manual background/border meshes. It uses the shared palette, div scroll, clipping and rounded pane chrome, with content aligned to the source code column and no bottom padding.
- `VirtualInput` no longer marks the focused hidden textarea with `aria-hidden`, avoiding Chrome's focused-descendant accessibility warning.

## Verification

- `bun test ui/elements ui/components` passes: 35 tests.
- `bun test pkg/debug` passes: 17 tests.
- `bun run --filter @metafor/elements typecheck` passes.
- `bun run --filter @metafor/components typecheck` passes.
- `bun run --filter @metafor/bun-debug typecheck` passes.

The previous strict optional-property failures were fixed without changing public engine APIs:

- `pkg/engine/src/geometries/TexturedPlaneGeometry.ts` now only forwards defined optional fields to `PlaneGeometry`.
- `pkg/engine/src/materials/ImageMaterial.ts` models `onTextureChange` as an explicit `(() => void) | undefined` property.

Additional editor-layer tests cover highlighter resolution/registration, source path extraction, TypeScript token categories and token-range normalization.

Runtime smoke:

- `bun run dark/debug/agent-attach.ts` starts the sidecar on `http://127.0.0.1:6500/`.
- Starting the default target through `/target/run` connects Bun Inspector on `ws://127.0.0.1:6499/dark`.
- Reloading the web UI while already paused now re-applies the saved dump after `UiRuntime` initialization, so frames/scopes/source all render.
- `/ws` command path was smoke-tested with `eval` on frame 0 and returned `2`.
