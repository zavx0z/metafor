# nodes

`nodes` — корневой runtime-пакет универсального нодового графа. Он владеет
живыми сущностями `NodeTree → Frame / Node → Parameter → Socket → Link`,
значениями Parameter, ревизиями, подписками и получением производных проекций.

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

* [`@nodes/layout`](layout/README.md) — чистый числовой solver. Он получает
  производный serializable graph и не читает живой `NodeTree`, Parameter,
  renderer или WebGPU. Его собственный SVG playground позволяет разрабатывать
  fixed/adaptive placement и routing напрямую на numeric fixtures.
* [`@nodes/ui`](ui/README.md) — NodeCanvas/NodeEditor и сменяемые
  Frame/Node/Socket/Link renderers. Он отображает готовую проекцию и владеет
  только view-state: pan, zoom, selection, hover и overlays.
* `nodes` координирует живые сущности и проекции, но не зашивает Blender,
  WebGPU, font или viewport в каноническое состояние графа.

Прежние `NodeSystemDocument`, `MeasuredNodeSystem`, `PositionedNodeSystem`,
Port/Edge adapters и ручные compatibility helpers не входят в новый public
contract и удаляются без aliases.

## Playgrounds

```bash
bun run nodes:playground         # root nodes: полный runtime-путь
bun run nodes:layout:playground  # @nodes/layout: чистая SVG-геометрия
bun run nodes:components         # @nodes/ui: каталог компонентов
```

Parent WebGPU playground показывает полный путь `NodeTree → projection →
NodeEditor`, изменение значения через тот же живой Parameter, чистый snapshot и
диагностику кэша. `@nodes/layout` независимо показывает fixed/adaptive
`RIGHT`/`DOWN` geometry без UI-зависимостей. `@nodes/ui` независимо показывает
визуальные компоненты. Playground каждого package дополняет соседние и не
заменяется parent playground.

Lifecycle и background browser evidence всех трёх contours принадлежат skill
[`$nodes-dev`](.agents/skills/nodes-dev/SKILL.md), который выбирает их через
`--playground root|layout|ui` без дублирования package processes.

## Проверка

```bash
bun run --cwd pkg/nodes typecheck
bun run --cwd pkg/nodes/playground typecheck
bun test pkg/nodes
```
