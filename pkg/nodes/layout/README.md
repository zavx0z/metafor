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
WebGPU, конкретном consumer или способе отображения результата.

## Policies и общий solver

`@nodes/layout/fixed` является узким public entrypoint действующей fixed policy:
он разрешает каждый source-port в `EAST`, target-port в `WEST`, отклоняет один
port в обеих ролях и только затем передаёт graph общему solver. Корневой
`layout` остаётся compatibility alias `layoutFixed`.

Общий placement/routing/validation core получает `ResolvedLayoutGraph`, где у
каждого measured port уже есть одна сторона `WEST | EAST`. Он не читает и не
выводит socket capability и не содержит adaptive side-selection. Это позволяет
следующим policies переиспользовать geometry laws без копирования router и
validators.

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
представление является деталью алгоритма и не входит в public API. Fixed input
не передаёт сторону: её явно разрешает fixed policy. Общий resolved contract
содержит только выбранную `WEST`/`EAST` сторону, но не capability `in/out/inout`.

`LayoutResult` содержит только:

* `direction` — `RIGHT` для landscape/square и `DOWN` для portrait;
* `bounds`;
* окончательные `x/y/width/height` каждой ноды и compound;
* абсолютные `x/y` и resolved side исходных портов;
* один ортогональный `section` каждого semantic edge.

Исходный graph, текст, UI-состояние и внутренние поисковые метрики в ответ не
дублируются.

## Синхронный вызов

```ts
import {layoutFixed, type FixedLayoutGraph} from "@nodes/layout/fixed"

const graph: FixedLayoutGraph = {
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

const result = layoutFixed(graph)
```

Синхронная pure function нужна для offline tests и других небраузерных
потребителей. Она не использует Worker и не имеет side effects.

## Минимизация пересечений

После hard validity router сравнивает варианты сначала по общему и максимальному
числу crossings. Sparse visibility A* учитывает уже занятые segments, а
ограниченный стабильный edge schedule не зависит от порядка входных массивов.
Нулевое число crossings не завершает сравнение остальных стабильных schedules:
среди них продолжают действовать turns, Manhattan length, detour и остальные
цели общего лексикографического порядка.
Для двух и более связей с одинаковыми source/target nodes отдельный bundle-pass
сохраняет порядок lanes на всех четырёх поворотах общего U-corridor: он только
переставляет между рёбрами уже найденные legal tracks, повторно запускает полный
validator и принимает кандидат лишь при улучшении crossing-first objective.

Связанные edges с одним exact source-port или одним exact target-port могут
оставаться разными semantic edges и одновременно использовать совпадающий
generated trunk. Router строит отдельные exact terminal stubs, считает
merge/split junction частью bundle, не разрешает overlap несвязанных edges и
принимает объединение только после полного validator и лексикографического
улучшения geometry. Общая карточка без общего exact port не разрешает
объединение: рёбра разных портов сохраняют полный clearance.

Layout не переставляет parameter rows: `ports[].y` является уже измеренным
входом минимального протокола. Перестановка связанных строк до повторного layout
принадлежит presentation-adapter пакета [`nodes`](../README.md).

В portrait placement боковой routing reserve не копируется автоматически под
последний child. Сначала проверяется компактный вариант с одним socket pitch
снизу; ограниченные варианты с нижним corridor остаются в наборе кандидатов для
графов, которым такой маршрут действительно нужен.

После `DOWN` routing compound boundary подтягивается к фактически занятым
vertical lanes и children: между каждой соседней boundary, lane и child
остаётся ровно один `clearance`. Для compound с semantic ports вместе с
границей перемещаются exact port centers и terminal sections; intrinsic width
не уменьшается. Найденная геометрия не принимается на веру — она полностью
валидируется повторно на сжатых rectangles и обновлённых routes.

Локальные вертикальные пустоты между sibling-рядами compact устраняет отдельно
внутри каждого parent, начиная с глубоко вложенных compounds. Если между
рядами проходит horizontal route, сохраняется по одному `clearance` с обеих
сторон фактически занятого track; без route остаётся один `clearance` между
рядами. После каждого сдвига нижнего sibling-поддерева маршруты строятся заново,
и вариант принимается только после полных placement и route validators.

После локального сдвига `DOWN` отдельно подтягивает нижнюю границу каждого
parent к последнему собственному content, child или фактически занятой route
coordinate. Свободный остаток сокращается до одного `clearance`; ноды, порты и
sections не перемещаются, а сжатая граница принимается только после полных
placement и route validators.

В `RIGHT` связи с общим exact source/target port сначала резервируют общий
side track, а вариант с раздельными tracks остаётся bounded fallback. После
routing кандидат с пустым нижним compound-reserve отбрасывается. Visibility
grid содержит координаты ровно в одном clearance снаружи прозрачных
source/target ancestors, поэтому внешний маршрут не получает скрытый второй
pitch.

Единый горизонтальный ритм действует в `RIGHT` и `DOWN`. Для каждого бокового
compound corridor и каждого фактического межслойного corridor резерв считается
по различным tracks, а не по числу semantic edges. Exact-port bundle занимает
один track; edge с другим port занимает ещё один. Corridor с `N` такими tracks
имеет ровно `N + 1` промежутков по одному `clearance`, включая расстояния до
границы или соседних нод. Финальная compaction сдвигает только конкретный ряд
или устойчиво выровненную `RIGHT`-колонку, заново маршрутизирует весь graph и
принимает сдвиг только после hard validation; `padding + clearance` не могут
создать второй пустой шаг ни в одном направлении.

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

## Обязательный benchmark перед REVIEW

Внутри задачи агент сначала достигает её функционального и геометрического
результата. Benchmark не выполняется после каждой промежуточной попытки и не
заменяет hard validation, tests или visual acceptance.

Когда задача, меняющая placement, compaction, routing, порядок кандидатов, soft
objectives или поисковый бюджет, готова к переводу в `REVIEW`, исполнитель:

1. Запускает один final benchmark на принятых frozen `RIGHT` и `DOWN` inputs.
2. Сохраняет machine-readable result в
   `project/artifacts/<ID>/benchmark-current.json`. Результат содержит все
   samples, min/median/max, hashes inputs и geometry, runtime environment и
   точную Git revision или hash изменённого layout source.
3. Записывает итоговые числа и ссылку на artifact в карточке задачи.
4. Включает код, final benchmark и обязательную документацию в result-коммит,
   который переводит задачу в `REVIEW`.

Если применимый предыдущий benchmark существует, он берётся из Git history и
сопоставляется только при одинаковых inputs и условиях. Изменение fixture
создаёт новый baseline; числа разных inputs нельзя выдавать за прямое ускорение
или regression.

Benchmark фиксирует стоимость уже достигнутого результата. После review
владелец решает, приемлема ли она сейчас или нужна отдельная задача
оптимизации. При закрытии `project/artifacts/<ID>/` удаляется по обычным
правилам проекта; отдельный постоянный архив benchmark JSON внутри package не
создаётся.

Изменения только Worker transport, UI, view или renderer измеряются у своего
владельца и не превращаются в benchmark вычислительного ядра layout.
