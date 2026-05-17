# Editor Layer Audit

## Current Placement

1. Source display is currently owned by `pkg/debug/web/source-card.ts`. It is a debug-specific viewer: it renders the paused source, current execution line, runtime state (`paused`, `running`, `loading`, `disconnected`) and scroll/keyboard navigation.
2. Editable editor UI is currently `pkg/ui/src/editor-card.ts`. It is exported by `@metafor/ui` as `EditorCard` and owns text mutation, cursor movement, clipboard, undo/redo, horizontal scroll, optional tokenization and save/change callbacks.
3. `SourceCard` and `EditorCard` share the same visual model: `Card` base, `ScrollListState`, gutter line numbers, token-colored text chunks, code background, header, line clipping and `syntaxTokens` categories (`k/s/n/c/t/f/p/d`).
4. The main duplication is token typing and tokenized-line rendering. `SourceCard` had a local `SyntaxToken`/`SourceTokens` type and its own token rendering loop; `EditorCard` had `EditorToken`/`EditorTokens` plus a similar rendering loop. Both also compute gutter width, visible rows and code clipping independently.
5. The safe common layer is token contracts, language highlighter resolution, shared token material creation and shared tokenized-line rendering. A future step can extract a full source/view base, but doing that now would touch more debug layout and runtime state than necessary.
6. To keep debug stable, do not change `pkg/debug/src/*`, the `/source` REST shape, `/ws` commands/results, inspector attach flow, `SourceCard` runtime states, current-line highlighting, frames/scopes/console command behavior or `bun run dark/debug/agent-attach.ts` startup.

## First Extraction

The editor layer now starts under `pkg/ui/src/editor/`:

- `tokens.ts` defines `EditorToken`, `EditorTokens`, `EditorTokenize` and `LanguageHighlighter`.
- `highlighter.ts` provides a small highlighter registry and resolver by language id or file extension.
- `languages/plaintext.ts` is the no-op fallback.
- `languages/typescript.ts` is a lightweight TypeScript/JavaScript tokenizer with the same compact token categories used by the debug source viewer.
- `token-renderer.ts` contains shared token material creation and tokenized-line rendering.
- `source-card-base.ts` contains source-view helper types and filename-to-highlighter fallback for viewers.
- `editor-card.ts` contains `EditorCard`; the old `pkg/ui/src/editor-card.ts` remains a compatibility re-export.

`SourceCard` remains in `pkg/debug/web` because its paused/running/disconnected behavior is debug-specific. It can now consume the shared `EditorTokens` format and shared token renderer without changing the server protocol.

## UI Pass

- Shared widget primitives in `pkg/ui/src/widgets.ts` now use rounded control chrome through the existing `Card.drawRoundedRect` primitive.
- `pkg/ui/src/theme.ts` exposes shared `radii` tokens for controls and cards.
- `Card` accepts `borderRadiusPx`, so debug cards and `EditorCard` can use the same rounded card chrome without custom per-card background meshes.
- `ConsoleCard` now extends `@metafor/ui` `Card` instead of owning manual background/border meshes. It uses the shared palette, scrollbar, clipping and rounded card chrome, with content aligned to the source code column and no bottom padding.
- `VirtualInput` no longer marks the focused hidden textarea with `aria-hidden`, avoiding Chrome's focused-descendant accessibility warning.

## Verification

- `bun test pkg/ui` passes: 23 tests.
- `bun test pkg/debug` passes: 13 tests.
- `bun run --filter @metafor/ui typecheck` currently fails before this UI layer on existing `pkg/engine` strict optional-property errors:
  - `pkg/engine/src/geometries/TexturedPlaneGeometry.ts:10`
  - `pkg/engine/src/materials/ImageMaterial.ts:38`
- `bun run --filter @metafor/bun-debug typecheck` fails on the same two `pkg/engine` errors.

Runtime smoke:

- `bun run dark/debug/agent-attach.ts` starts the sidecar on `http://127.0.0.1:6500/`.
- Starting the default target through `/target/run` connects Bun Inspector on `ws://127.0.0.1:6499/dark`.
- Reloading the web UI while already paused now re-applies the saved dump after `UiCanvas` initialization, so frames/scopes/source all render.
- `/ws` command path was smoke-tested with `eval` on frame 0 and returned `2`.
