# nodes

`nodes` — лёгкое ядро semantic topology и общей логики node-system. Оно
проверяет serializable document без обязательной UI-анатомии, строит
containment index, задаёт нормализованный measured contract, предоставляет
positioned-geometry helpers и владеет транспортом layout Worker.

Над общим договором независимо собираются:

* [`@nodes/layout`](layout/README.md) получает минимальный ELK-like graph и
  возвращает координаты нод, compound-контейнеров, портов и semantic edges;
* [`@nodes/ui`](ui/README.md) измеряет и отображает карточки, viewport, edges и
  moving-message markers без зависимости от HUD;
* `@nodes/hud` предоставляет необязательные HUD-компоненты, включая Inspector.

Потребители передают в `nodes` один `NodeSystemDocument`, в котором port
принадлежит node и не обязан ссылаться на строку, карточку или другой UI-element.
`@nodes/ui` предоставляет Card presentation preset: он связывает semantic ports
с Card rows по ID, измеряет preset и передаёт дальше только topology и числовую
geometry. Сменяемый runtime `id` не обязан быть layout identity: producer
может передать стабильный `layoutId` того же visual slot, а adapter вернёт
рассчитанную геометрию к исходным domain IDs.

## Импорты

```ts
import {
  LayoutWorkerClient,
  validateNodeSystemDocument,
  type NodeSystemDocument,
} from "nodes"

import {layoutMeasuredNodeSystemAdaptive} from "nodes/adaptive-layout"
import {FixedLayoutWorkerClient} from "nodes/layout-worker/fixed/client"
import {AdaptiveLayoutWorkerClient} from "nodes/layout-worker/adaptive/client"
import {adaptNodeSystemCardPresentation} from "@nodes/ui/card-model"
import {FixedNodeSystemCardWorkerLayouter} from "@nodes/ui/fixed-card-layout"
import {AdaptiveNodeSystemCardLayouter} from "@nodes/ui/adaptive-card-layout"
import {NodeSystemSurface} from "@nodes/ui/surface"
import {NodeInspectorSurface} from "@nodes/hud/inspector"
```

Публичные semantic, measured, positioned и Worker-типы находятся в
[`types`](types/index.ts). Только
числовые типы layout protocol принадлежат
[`layout/types`](layout/types/index.ts); UI Card preset ссылается на эту topology
по IDs и не создаёт параллельную semantic model.

## Границы

* `nodes` содержит semantic model validation, normalized measurement,
  containment, incremental positioned geometry и Worker transport adapter. Он
  не импортирует Card, renderer или HUD.
* `NodeSystemNode.id` остаётся domain identity; optional `layoutId` используется
  только внутри layout adapter и обязан быть уникальным в document.
* `@nodes/layout` не читает Card presentation, текст, DOM или WebGPU state.
  Fixed и adaptive policy доступны через независимые
  `@nodes/layout/fixed` и `@nodes/layout/adaptive`; общий корень сохраняет
  только fixed compatibility contract.
* `@nodes/ui/card-model` владеет `title`, `summary`, `tone`, facts, actions и
  явными `portId → rowId` anchors. Эти значения не входят в semantic node.
* `@nodes/ui/fixed-card-layout` является явным fixed-port adapter: он измеряет
  Card preset в общий `MeasuredNodeSystem` и передаёт числовой graph в
  `@nodes/layout/fixed`. `@nodes/ui/adaptive-card-layout` использует то же
  measurement/materialization ядро и отдельный `@nodes/layout/adaptive`.
* `@nodes/ui/surface` принимает готовый `PositionedNodeSystemCard`; consumer со
  своей Card geometry не импортирует fixed adapter. Bare/другой presentation
  consumer работает с общим `PositionedNodeSystem` без этой surface.
* `@nodes/hud` необязателен; `nodes` и `@nodes/ui` от него не зависят.
* Generic Worker lifecycle принадлежит `nodes/layout-worker/transport`, а
  fixed/adaptive clients и executors публикуются отдельными subpath entrypoints.
  Узкий client не содержит solver, а executor не содержит противоположную
  policy.
* `connectionType` является opaque consumer value, общей для semantic edge и
  обоих его exact sockets. Consumer-provided resolver задаёт предметный цвет;
  generic UI предоставляет только deterministic fallback. `direction`
  определяет универсальную capability сокета, `side` ограничивает допустимое
  placement, а resolved `PositionedNodeSystemPort.side` фиксирует фактически
  выбранную сторону. Card `tone` отдельно показывает состояние.
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
bun run --cwd pkg/nodes/layout typecheck:playground
bun test pkg/nodes
bun run docs:layout
```

Dev-only SVG playground запускает реальные public policies без Card, WebGPU,
HUD или product renderer:

```bash
bun run nodes:playground
```

Он является изолированным доказательством layout input/result и не заменяет
визуальную либо runtime-приёмку конкретного consumer.
