# Nodes packages

`pkg/nodes` — workspace-контейнер независимых Node packages и их parent
playground. Сам package `nodes` не имеет production exports.

`@nodes/core` владеет живыми сущностями
`NodeTree → Frame / Node → Parameter → Socket → Link`, значениями Parameter,
ревизиями, подписками и получением производных проекций.

`Parameter` является локальным Store своего значения. `NodeTree` наблюдает его
изменения и сообщает одну новую ревизию дерева; отдельная карта значений рядом
с графом не создаётся. Чистый `snapshot()` возвращает JSON-данные без методов,
подписок и callbacks.

## Проекции

`NodeTree` не хранит единственную экранную геометрию. Один живой граф может
одновременно иметь desktop, mobile, read-only и другие представления. Метод
`tree.project(projector, request)` получает подключаемый projector и возвращает
результат для точного renderer, viewport, шрифта, темы и layout policy.

Projector разделяет три производных результата:

1. intrinsic measurement изменившихся Node и точные local Socket anchors;
2. расположение Node/Frame и маршруты Link для конкретного viewport;
3. готовые local render plans, которые renderer материализует без повторного
   измерения той же Node.

Повторный запрос с тем же ключом и ревизией использует кэш. Изменение значения,
не меняющее intrinsic geometry, обновляет Field и local plan, но не запускает
повторный глобальный layout. Pan/zoom принадлежат view и вообще не вызывают
`NodeTree.project()`.

## Границы пакетов

* [`@nodes/core`](core/README.md) — renderer-neutral runtime, snapshot и
  projection coordination.
* [`@nodes/editor`](editor/README.md) — headless JSON Patch commands,
  optimistic revision и явный layout gate без solver dependency.
* [`@nodes/layout`](layout/README.md) — чистый числовой solver. Он получает
  производный serializable graph и не читает живой `NodeTree`, Parameter,
  renderer или WebGPU. Его собственный SVG playground позволяет разрабатывать
  fixed/adaptive placement и routing напрямую на numeric fixtures.
* `@nodes/layout-worker` — отдельные transport, client и executor entrypoints
  fixed/adaptive Worker. Client entrypoints не загружают solver.
* [`@nodes/ui`](ui/README.md) — NodeCanvas/NodeEditor и сменяемые
  Frame/Node/Socket/Link renderers. Он отображает готовую проекцию и владеет
  только view-state: pan, zoom, selection, hover и overlays.
* `@nodes/core` координирует живые сущности и проекции, но не зашивает Blender,
  WebGPU, font или viewport в каноническое состояние графа.

Прежние `NodeSystemDocument`, `MeasuredNodeSystem`, `PositionedNodeSystem`,
Port/Edge adapters и ручные compatibility helpers не входят в новый public
contract и удаляются без aliases.

## Playgrounds

```bash
bun run nodes:playground
```

Главная `/` является каталогом всех пяти production-пакетов. Exact routes
`/core/*`, `/editor/*`, `/layout/*`, `/layout-worker/*` и `/ui/*` обслуживает
один process `@nodes/playground` на порту `4018`, но каждый package page имеет
собственный browser entry и не загружает соседний bundle. SVG layout остаётся
без WebGPU, а editor и UI сохраняют независимые WebGPU-модули.

Lifecycle и background browser evidence принадлежат skill
[`$nodes-dev`](playground/.agents/skills/nodes-dev/SKILL.md). Lifecycle запускает
один catalog process; package выбирается только exact route.

## Проверка

```bash
bun run --cwd pkg/nodes/core typecheck
bun run --cwd pkg/nodes/editor typecheck
bun run --cwd pkg/nodes/layout-worker typecheck
bun run --cwd pkg/nodes/ui typecheck
bun run --cwd pkg/nodes/playground typecheck
bun test pkg/nodes
```
