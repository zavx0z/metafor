# Аудит Editor Layer

## Текущее размещение

1. Отображение source и редактируемый draft UI используют `EditorPane` из `@ui/panes`.
2. `EditorPane` владеет изменением текста, движением курсора, clipboard, undo/redo, опциональной токенизацией, callbacks сохранения и изменения, read-only навигацией, подсветкой текущей исполняемой строки source и отрисовкой gutter. Scroll state приходит из `@ui/elements` `div`.
3. Runtime-состояние интерпретатора (`paused`, `running`, `loading`, `disconnected`) остаётся в `pkg/interpreter/web/main.ts`; общий компонент получает только title, source text, tokens/language и опциональную execution line.
4. Прежний локальный для интерпретатора `pkg/interpreter/web/source-pane.ts` удалён, чтобы code/source rendering имел одну реализацию.
5. Для стабильности интерпретатора не менять `pkg/interpreter/src/*`, REST-форму `/source`, команды и результаты `/ws`, attach-flow инспектора, semantics текущей строки, поведение frames/scopes/console command и запуск `bun run interpreter`.

## Первое выделение

Editor layer теперь начинается в `ui/panes/editor/`:

- `tokens.ts` определяет `EditorToken`, `EditorTokens`, `EditorTokenize` и `LanguageHighlighter`.
- `highlighter.ts` предоставляет небольшой registry highlighter-ов и resolver по language id или расширению файла.
- `languages/plaintext.ts` остаётся no-op fallback.
- `languages/typescript.ts` содержит лёгкий TypeScript/JavaScript tokenizer с теми же компактными категориями token-ов, которые использует source viewer интерпретатора.
- `token-renderer.ts` содержит создание shared token material и rendering tokenized-line.
- `source-pane-base.ts` содержит helper-типы source-view и filename-to-highlighter fallback для viewer-ов.
- `editor-pane.ts` содержит `EditorPane`; старый `ui/panes/editor-pane.ts` остаётся compatibility re-export.

Source viewer интерпретатора теперь настраивает `EditorPane` с `readOnly: true`, `showCaret: false` и `introAnimation: false`. Специфичные для интерпретатора labels `paused/running/disconnected` обрабатываются вне компонента.

## UI-проход

- Shared widget primitives в `ui/components/internal/renderers.ts` теперь используют rounded control chrome через существующий primitive `Pane.drawRoundedRect`.
- `ui/elements/theme.ts` экспортирует shared `radii` tokens для controls и panes.
- `Pane` принимает `borderRadiusPx`, поэтому interpreter panes и `EditorPane` могут использовать одинаковый rounded pane chrome без кастомных background meshes на каждый pane.
- `ConsolePane` теперь наследуется от `@ui/elements` `UiSurface` вместо собственного ручного управления background/border meshes. Он использует shared palette, div scroll, clipping и rounded pane chrome, выравнивает content по колонке source code и не добавляет нижний padding.
- `VirtualInput` больше не помечает focused hidden textarea через `aria-hidden`, чтобы не получать Chrome accessibility warning о focused descendant.

## Проверка

- `bun test ui/elements ui/components` проходит: 35 tests.
- `bun test pkg/interpreter` проходит: 17 tests.
- `bun run --filter @ui/elements typecheck` проходит.
- `bun run --filter @ui/panes typecheck` проходит.
- `bun run --filter @metafor/interpreter typecheck` проходит.

Предыдущие strict optional-property ошибки исправлены без изменения публичных engine API:

- `pkg/engine/src/geometries/TexturedPlaneGeometry.ts` теперь передаёт в `PlaneGeometry` только определённые optional fields.
- `pkg/engine/src/materials/ImageMaterial.ts` описывает `onTextureChange` как явное свойство `(() => void) | undefined`.

Дополнительные tests editor-layer покрывают highlighter resolution/registration, извлечение source path, TypeScript token categories и token-range normalization.

Runtime smoke:

- `bun run interpreter` запускает sidecar на `http://127.0.0.1:6500/`.
- Запуск default target через `/target/run` подключает Bun Inspector на `ws://127.0.0.1:6499/`.
- Reload web UI при уже остановленном процессе теперь повторно применяет сохранённый dump после инициализации `UiRuntime`, поэтому frames/scopes/source отображаются.
- Командный путь `/ws` проверен smoke-тестом через `eval` на frame 0 и вернул `2`.
