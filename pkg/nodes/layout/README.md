# @nodes/layout

`@nodes/layout` — чистый TypeScript engine автоматической раскладки
compound-графов. Он получает уже измеренные ноды и порты, сам вычисляет
placement, размеры compound-контейнеров, gateways и ортогональные маршруты,
затем возвращает только готовую геометрию.

Алгоритмические требования разделены по режимам:

* [общие законы](requirements/COMMON.md);
* [горизонтальная раскладка `RIGHT`](requirements/RIGHT.md);
* [вертикальная раскладка `DOWN`](requirements/DOWN.md).

Worker, UI, управление видом и traffic presentation не принадлежат этим
документам.

Layout ничего не знает о тексте карточки, Flex, `NodeSystemDocument`, DOM,
WebGPU, Hamiltonian или способе отображения результата.

## Протокол

Публичный договор находится в [`types/protocol.ts`](types/protocol.ts) и
экспортируется через `@nodes/layout` и `@nodes/layout/types`. Имена близки к
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
    contentHeight?: number // нижняя граница занятого собственного content
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
import {layout, type LayoutGraph} from "@nodes/layout"

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

## Минимизация пересечений

После hard validity router сравнивает варианты сначала по общему и максимальному
числу crossings. Sparse visibility A* учитывает уже занятые segments, а
ограниченный стабильный edge schedule не зависит от порядка входных массивов.
Для двух и более связей с одинаковыми source/target nodes отдельный bundle-pass
сохраняет порядок lanes на всех четырёх поворотах общего U-corridor: он только
переставляет между рёбрами уже найденные legal tracks, повторно запускает полный
validator и принимает кандидат лишь при улучшении crossing-first objective.

Layout не переставляет parameter rows: `ports[].y` является уже измеренным
входом минимального протокола. Перестановка связанных строк до повторного layout
принадлежит presentation-adapter пакета [`nodes`](../README.md).

## Требования

Общие hard laws и порядок оптимизации принадлежат
[`requirements/COMMON.md`](requirements/COMMON.md). Responsive-правила находятся
отдельно в [`RIGHT.md`](requirements/RIGHT.md) и
[`DOWN.md`](requirements/DOWN.md). Интеграция и Worker принадлежат
[`nodes`](../REQUIREMENTS.md), а renderer/view —
[`@nodes/ui`](../ui/REQUIREMENTS.md).

## TypeDoc и проверки

Полная русская API-документация строится из TSDoc public contracts:

```bash
bun run docs:layout
```

Результат появляется в `tmp/typedoc/layout`. Основные проверки:

```bash
bun test pkg/nodes/layout/src
bun run --cwd pkg/nodes/layout typecheck
```
