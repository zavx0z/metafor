# nodes

`nodes` — лёгкое ядро модели и общей логики node-system. Оно проверяет
serializable document, строит containment index, предоставляет
positioned-geometry helpers и владеет транспортом layout Worker.

Над общим договором независимо собираются:

* [`@nodes/layout`](layout/README.md) получает минимальный ELK-like graph и
  возвращает координаты нод, compound-контейнеров, портов и semantic edges;
* [`@nodes/ui`](ui/README.md) измеряет и отображает карточки, viewport, edges и
  moving-message markers без зависимости от HUD;
* `@nodes/hud` предоставляет необязательные HUD-компоненты, включая Inspector.

Потребители передают в `nodes` собственный `NodeSystemDocument`. Смысл domain
facts, actions, connection types и их visual mapping остаётся у приложения:
node-system только проверяет presentation model и связывает её IDs с готовой
геометрией. Сменяемый runtime `id` не обязан быть layout identity: producer
может передать стабильный `layoutId` того же visual slot, а adapter вернёт
рассчитанную геометрию к исходным domain IDs.

## Импорты

```ts
import {
  LayoutWorkerClient,
  validateNodeSystemDocument,
  type NodeSystemDocument,
} from "nodes"

import {FixedNodeSystemCardWorkerLayouter} from "@nodes/ui/fixed-card-layout"
import {NodeSystemSurface} from "@nodes/ui/surface"
import {NodeInspectorSurface} from "@nodes/hud/inspector"
```

Публичные model- и Worker-типы находятся в [`types`](types/index.ts). Только
числовые типы layout protocol принадлежат
[`layout/types`](layout/types/index.ts); UI-компоненты не создают параллельную
модель нод.

## Границы

* `nodes` содержит model validation, containment, incremental positioned
  geometry и Worker transport adapter. Он не импортирует renderer или HUD.
* `NodeSystemNode.id` остаётся domain identity; optional `layoutId` используется
  только внутри layout adapter и обязан быть уникальным в document.
* `@nodes/layout` не читает UI document, текст, DOM или WebGPU state.
* `@nodes/ui/fixed-card-layout` является явным fixed-port adapter: он измеряет
  generic card preset и передаёт числовой graph в `@nodes/layout`.
* `@nodes/ui/surface` принимает готовый `PositionedNodeSystem`; consumer со
  своей adaptive policy не импортирует fixed adapter.
* `@nodes/hud` необязателен; `nodes` и `@nodes/ui` от него не зависят.
* `connectionType` является opaque consumer value, общей для semantic edge и
  обоих его exact sockets. Consumer-provided resolver задаёт предметный цвет;
  generic UI предоставляет только deterministic fallback. `direction`
  определяет универсальную capability сокета, `side` или выбранный adapter —
  его placement, а `tone` отдельно показывает состояние.
* Renderer может скруглить готовый маршрут для рисования, но не меняет exact
  endpoint, gateway или bend ownership.
* Перед вторым layout-pass adapter может переставить только связанные
  socket-bearing fact rows между их существующими слотами. Он сохраняет domain
  facts, IDs и несвязанные строки и принимает перестановку только при улучшении
  crossing-first routing objective.

Нормативные требования к projection и layout Worker находятся в
[`REQUIREMENTS.md`](REQUIREMENTS.md). Worker adapter принадлежит `nodes`, а не
алгоритмическому пакету `@nodes/layout`.

## Проверка

```bash
bun run --cwd pkg/nodes typecheck
bun test pkg/nodes
bun run docs:layout
```
