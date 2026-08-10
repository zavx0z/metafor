# NODES-001 — Сделать раскладку нод плотной и безопасной

## Коротко

Вложенные ноды должны располагаться в едином плотном ритме без случайно
удвоенных пустот, а линии связей не должны проходить через посторонние карточки.
Одинаковое правило должно работать в горизонтальном и портретном режимах.

## Зачем

Текущая раскладка оставляет между header, параметрами, вложенными нодами и
границами compound расстояния больше шага между соседними сокетами. В живой
сцене одна из связей также проходит через внутренность `Peer process`, хотя эта
нода не является endpoint связи. Из-за этого схема одновременно теряет
плотность и нарушает геометрическую корректность.

## Связь с дорожной картой

Задача уточняет действующую границу общего пакета `nodes`, описанную в разделе
«Наблюдаемость и управление Hamiltonian» дорожной карты. Hamiltonian является
первым живым потребителем, но исправление не принадлежит его domain-модели.

## Подтверждённые факты

* Публичный `LayoutGraph` уже передаёт один базовый `spacing`, а Hamiltonian
  задаёт его равным шагу между сокетами.
* Адаптер передаёт одинаковые `spacing`, `padding` и `clearance`, но layout
  kernel внутренне увеличивает compound padding как минимум до двух clearance.
* Layout Worker adapter и его request/response types перенесены из
  `@nodes/layout` в пакет `nodes`; алгоритмический пакет снова экспортирует
  только pure function и числовой layout protocol.
* На живом landscape-снимке длинное semantic edge проходит через внутренность
  посторонней ноды `Peer process` на уровне параметра `Состояние`.
* На предоставленных снимках виден увеличенный промежуток между последним
  параметром и child, между header пустого compound и первым child, между
  соседними child, а также между содержимым и нижней границей compound.

## Решения владельца

* Алгоритмические требования разделены на
  [общие законы](../../pkg/nodes/layout/requirements/COMMON.md),
  [горизонтальный `RIGHT`](../../pkg/nodes/layout/requirements/RIGHT.md) и
  [вертикальный `DOWN`](../../pkg/nodes/layout/requirements/DOWN.md).
  Worker/integration принадлежат [`nodes`](../../pkg/nodes/REQUIREMENTS.md),
  UI/view — [`@nodes/ui`](../../pkg/nodes/ui/REQUIREMENTS.md), а traffic —
  приложению Hamiltonian.
* При закрытии задачи постоянные документы, public exports, tests и сохранённые
  machine proofs сверяются отдельной независимой проверкой.

## Границы

* Не менять Hamiltonian topology, domain facts, renderer или UI-метрики ради
  подгонки раскладки.
* Не добавлять ручные координаты, lanes, gateways или fixture-specific offsets.
* Сохранять минимальный serializable ELK-like protocol; Worker не включать в
  алгоритмический пакет.
* Не оптимизировать вторичную длину обхода ценой hard validity или плотности.

## Критерии готовности

* Для подтверждённых дефектов выполнены разделы «Единый ритм расстояний»,
  «Containment и препятствия», «Плотность и размещение»
  [общих требований](../../pkg/nodes/layout/requirements/COMMON.md).
* Отдельно выполнены требования горизонтальной
  [`RIGHT`](../../pkg/nodes/layout/requirements/RIGHT.md) и вертикальной
  [`DOWN`](../../pkg/nodes/layout/requirements/DOWN.md) раскладки.
* Focused tests и package typecheck проходят.
* Та же живая Hamiltonian topology проверена в RIGHT и DOWN на точной открытой
  CDP-вкладке; screenshots и machine-readable geometry приложены к задаче.

## Проверка результата

```bash
bun test pkg/nodes/layout/src pkg/nodes/layout-engine.test.ts
bun run --cwd pkg/nodes/layout typecheck
bun run --cwd pkg/nodes typecheck
```

## Реализованный срез

* Compound sizing использует измеренный собственный `contentHeight` и ровно
  один входной socket pitch между content, children и внутренней границей.
* Placement различает свободный gap и фактически занятый routing corridor,
  поддерживает плотный portrait flow и не центрирует крайний fan-out target ценой
  подъёма всего ряда.
* Router рассматривает content-band прозрачного ancestor как obstacle,
  сохраняет H/V edge-edge и edge-node clearance и не проводит semantic edge
  через постороннюю ноду.
* Exact RIGHT/DOWN запросы, machine proof и live screenshots находятся в
  [`project/artifacts/NODES-001`](../artifacts/NODES-001/README.md).
* Worker transport adapter, request/response types и его tests физически
  принадлежат `nodes`; `@nodes/layout` не экспортирует Worker API.
* `@nodes/ui` документирует intrinsic measurement ширины/высоты, занятого
  `contentHeight`, socket offsets и socket pitch до вызова layout.
* Общий документ алгоритма фиксирует фактический лексикографический порядок
  routing и orientation-specific placement objectives.
* Пересечения рёбер, найденные после этого среза, исправлены и независимо
  проверены отдельной завершённой задачей. NODES-001 требует собственной
  отдельной закрывающей проверки актуальных proof и package contracts.

## Closing handoff

* Original result commit: `e17a3394f61194dccda790a97406ac7c92118f37`
  (`feat(nodes): compact layout and minimize crossings`). Closing correction:
  `915d13976c633f2ed30f350eccb3aa3a32fdeada` (`fix(nodes): align layout
  package boundaries`).
* Затронутые владельцы: вычислительное ядро `@nodes/layout`, presentation-
  adapter `nodes`, измерение карточек `@nodes/ui`; Hamiltonian служит live
  acceptance consumer, его topology и renderer не менялись.
* Постоянные документы для сверки:
  [`layout/requirements/COMMON.md`](../../pkg/nodes/layout/requirements/COMMON.md),
  [`RIGHT.md`](../../pkg/nodes/layout/requirements/RIGHT.md),
  [`DOWN.md`](../../pkg/nodes/layout/requirements/DOWN.md),
  [`layout/README.md`](../../pkg/nodes/layout/README.md),
  [`nodes/REQUIREMENTS.md`](../../pkg/nodes/REQUIREMENTS.md) и
  [`ui/REQUIREMENTS.md`](../../pkg/nodes/ui/REQUIREMENTS.md).
* Долговечные выводы: единый socket-pitch rhythm, content-aware compound
  compaction, edge-node/edge-edge clearance в обеих осях, запрет прохода через
  unrelated node content, плотный `DOWN` flow и socket-aligned `RIGHT` placement
  описаны у постоянных владельцев.
* Свежая проверка перед handoff: `98/98` tests пакетов `nodes` и Hamiltonian
  host/browser build, typecheck пакетов `@nodes/layout`, `nodes` и корня,
  TypeDoc build, `git diff --check` — green. Machine-readable RIGHT и DOWN
  proofs, exact requests и live screenshots находятся в artifacts.
* Final benchmark на exact frozen inputs: RIGHT median `46.13 ms`, DOWN median
  `267.61 ms`; предыдущий сопоставимый замер `47.83/285.78 ms`, geometry hashes
  совпадают. Полный protocol и samples сохранены в
  [`benchmark-current.json`](../artifacts/NODES-001/benchmark-current.json).
* Владелец 2026-08-10 визуально принял итоговую геометрию. Closing correction
  устраняет выявленные расхождения физической границы Worker, UI measurement
  law, objective order и stale proof hashes. Перед удалением карточки требуется
  новый независимый verdict по актуальному HEAD.

## Independent closing review

`PASS` на `539179a5a5468a8b7197c31741aaf799c93fcf6b`: проверяющий независимо
подтвердил чистую Worker/package boundary, полноту постоянных требований,
соответствие soft objectives коду, байтовую воспроизводимость RIGHT/DOWN proof,
совместимость benchmark protocol и отсутствие regression. Свежий прогон дал
`98 pass / 0 fail`; typecheck `@nodes/layout`, `nodes` и корня, Hamiltonian
browser/Worker build и `docs:layout` прошли. Runtime и browser при review не
изменялись.
