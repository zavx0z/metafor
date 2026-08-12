# nodes

`nodes` — пакет модели и общей логики node-system. Он проверяет document,
строит containment index, связывает измеренные UI-карточки с числовой
раскладкой и управляет явными presentation edits.

Пакет собирает два независимых нижних слоя:

* [`@nodes/layout`](layout/README.md) получает минимальный ELK-like graph и
  возвращает координаты нод, compound-контейнеров, портов и semantic edges;
* [`@nodes/ui`](ui/README.md) измеряет и отображает карточки, Inspector,
  viewport и moving-message markers.

Hamiltonian и другие приложения передают в `nodes` собственный
`NodeSystemDocument`. Смысл domain facts и actions остаётся у приложения:
node-system только проверяет presentation model и связывает её IDs с готовой
геометрией. Сменяемый runtime `id` не обязан быть layout identity: producer
может передать стабильный `layoutId` того же visual slot, а adapter вернёт
рассчитанную геометрию к исходным domain IDs.

## Импорты

```ts
import {
  LayoutWorkerClient,
  MetaForNodeSystemWorkerLayouter,
  validateNodeSystemDocument,
  type NodeSystemDocument,
} from "nodes"

import {NodeInspectorSurface, NodeSystemSurface} from "@nodes/ui"
```

Публичные model- и Worker-типы находятся в [`types`](types/index.ts). Только
числовые типы layout protocol принадлежат
[`layout/types`](layout/types/index.ts); UI-компоненты не создают параллельную
модель нод.

## Границы

* `nodes` содержит model validation, containment, layout adapter и
  incremental presentation logic, а также Worker transport adapter.
* `NodeSystemNode.id` остаётся domain identity; optional `layoutId` используется
  только внутри layout adapter и обязан быть уникальным в document.
* `@nodes/layout` не читает UI document, текст, DOM или WebGPU state.
* `@nodes/ui` не рассчитывает автоматическое размещение и не владеет semantic
  topology.
* `connectionType` является presentation-семантикой соединения, общей для
  semantic edge и обоих его exact sockets. UI выводит из неё один устойчивый
  цвет; `direction` определяет сторону сокета, а `tone` отдельно показывает
  состояние и не меняет тип соединения.
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
