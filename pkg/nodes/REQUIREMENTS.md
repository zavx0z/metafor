# Требования семейства Nodes

Этот документ владеет композицией независимых Nodes packages и parent
playground. Runtime-законы принадлежат [`@nodes/core`](core/REQUIREMENTS.md),
алгоритмические законы — [`@nodes/layout`](layout/README.md), Worker boundary —
`@nodes/layout-worker`, а WebGPU view — [`@nodes/ui`](ui/REQUIREMENTS.md).

## Package boundary

1. `@nodes/core`, `@nodes/layout`, `@nodes/layout-worker` и `@nodes/ui`
   сохраняют независимые production entrypoints и не загружают соседние
   реализации без точного импорта.
2. Parent playground является dev-only workspace consumer. Он не входит в
   production exports пакетов семейства.
3. Root `nodes`, `@nodes/layout` и `@nodes/ui` сохраняют независимые
   package-owned playground. Parent integration playground дополняет
   package-local стенды, но не заменяет и не удаляет их.
4. `$nodes-dev` маршрутизирует public names `root | layout | ui` к их exact
   shared selectors и не создаёт параллельные package processes.

## Parent playground

1. Parent playground использует один `UiRuntime` и общий пятизонный
   `@ui/playground`, но semantic runtime и диагностика принадлежат `@nodes/core`.
2. Route `/node-tree/runtime/live` показывает один живой NodeTree, его чистый
   snapshot, текущие revisions и counters measurement/layout/plan/materialize.
3. Изменение Field проходит `Field → Parameter.set → NodeTree change → project
   → NodeEditor` без отдельной карты значений и без ручных coordinates Node.
4. Ready marker публикуется только после первой projection, передачи результата
   NodeEditor и фактически отрисованного WebGPU frame.
5. Playground no-HMR и запускается через `$nodes-dev`; exact DOM, console `0` и
   non-black canvas доказывают только parent contour.
