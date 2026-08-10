# @metafor/layout

`@metafor/layout` — чистый TypeScript engine автоматической раскладки
compound-графов. Он получает уже измеренные ноды и порты, сам вычисляет
placement, размеры compound-контейнеров, gateways и ортогональные маршруты,
затем возвращает только готовую геометрию.

Layout ничего не знает о тексте карточки, Flex, `NodeSystemDocument`, DOM,
WebGPU, Hamiltonian или способе отображения результата.

## Протокол

Публичный договор находится в [`types/protocol.ts`](types/protocol.ts) и
экспортируется через `@metafor/layout` и `@metafor/layout/types`. Имена близки к
ELK JSON, но договор уже: один `LayoutEdge` всегда соединяет ровно один source
port с одним target port.

```ts
type LayoutGraph = {
  viewport: {width: number; height: number}
  nodes: Array<{
    id: string
    parentId?: string
    width: number
    height: number
  }>
  ports: Array<{
    id: string
    nodeId: string
    y: number // offset центра сокета от верха ноды
  }>
  edges: Array<{
    id: string
    sourcePortId: string
    targetPortId: string
  }>
  layoutOptions?: {
    spacing?: number
    layerSpacing?: number
    padding?: number
    clearance?: number
  }
}
```

Все числа во внешнем протоколе — логические пиксели. Внутреннее целочисленное
представление является деталью алгоритма и не входит в public API. Сторона и
направление порта тоже не передаются: роль edge однозначно задаёт source=EAST и
target=WEST.

`LayoutResult` содержит только:

* `direction` — `RIGHT` для landscape/square и `DOWN` для portrait;
* `bounds`;
* окончательные `x/y/width/height` каждой ноды и compound;
* абсолютные `x/y` исходных портов;
* один ортогональный `section` каждого semantic edge.

Исходный graph, текст, UI-состояние и внутренние поисковые метрики в ответ не
дублируются.

## Синхронный вызов

```ts
import {layout, type LayoutGraph} from "@metafor/layout"

const graph: LayoutGraph = {
  viewport: {width: 900, height: 600},
  nodes: [
    {id: "source", width: 180, height: 100},
    {id: "target", width: 180, height: 100},
  ],
  ports: [
    {id: "source/out", nodeId: "source", y: 72},
    {id: "target/in", nodeId: "target", y: 72},
  ],
  edges: [{
    id: "message",
    sourcePortId: "source/out",
    targetPortId: "target/in",
  }],
}

const result = layout(graph)
```

Синхронная pure function нужна для offline tests и других небраузерных
потребителей. Она не использует Worker и не имеет side effects.

## Worker

Worker protocol добавляет к тому же `LayoutGraph` только служебные
`requestId` и `generation`:

```ts
type LayoutWorkerRequest = {
  type: "layout"
  requestId: number
  generation: number
  graph: LayoutGraph
}
```

`LayoutWorkerClient` управляет одним долгоживущим endpoint, связывает ответы с
requests, отклоняет устаревшие generations и завершает Worker при `dispose()`.
Молчаливого main-thread fallback нет. Реальный Worker entrypoint вызывает ту же
`runLayoutWorkerRequest`, которую используют offline tests.

## Граница с UI

`@ui/node` на main thread:

1. измеряет загруженный renderer-шрифт и строит card plan;
2. превращает карточки в `LayoutNode` и видимые сокеты в `LayoutPort`;
3. отправляет минимальный `LayoutGraph` в Worker;
4. связывает полученные IDs с исходным UI document и рисует результат.

Layout package не может сортировать или менять domain facts: presentation-only
перестановка строк происходит до построения следующего измеренного graph.

## Геометрические законы

* Один semantic edge остаётся одним edge и заканчивается в точных сокетах.
* Source всегда EAST, target всегда WEST в `RIGHT` и `DOWN`.
* Compound boundary пересекается только через WEST/EAST gateway.
* Маршрут не проходит через постороннюю ноду или запрещённую containment chain.
* Соблюдаются containment, spacing, clearance, orthogonality и отсутствие
  overlap.
* Результат детерминирован для повторов и стабильных перестановок входных
  массивов.
* Большие пустоты в portrait и compound считаются дефектом placement.

По алгоритму выбран производительный гибрид: layered median/barycenter ordering,
bounded compaction по мотивам
[Brandes–Köpf](https://boriskoepf.de/papers/gd01a.pdf) и sparse visibility A* из
подхода
[orthogonal connector routing](https://users.monash.edu/~mwybrow/papers/wybrow-gd-2009.pdf).
Network-simplex оставлен только как ориентир layered-архитектуры, описанной
[Gansner et al.](https://graphviz.org/documentation/TSE93.pdf). ELK и Libavoid не
являются runtime-зависимостями.

## TypeDoc и проверки

Полная русская API-документация строится из TSDoc public contracts:

```bash
bun run docs:layout
```

Результат появляется в `tmp/typedoc/layout`. Основные проверки:

```bash
bun test pkg/layout/src
bun run --cwd pkg/layout typecheck
```
