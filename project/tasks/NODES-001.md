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
* Layout Worker adapter и его request/response types пока физически находятся
  в `@nodes/layout`; это расходится с уточнённой границей владельца и требует
  отдельного implementation-среза после документационного разделения.
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
* Текущий документационный срез только собирает и сверяет требования в обратной
  хронологии. Tests в этом срезе не меняются и не запускаются; их соответствие
  реестру проверяется отдельным последующим срезом.

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
* Пересечения рёбер, найденные после этого среза, исправлены и независимо
  проверены отдельной завершённой задачей. NODES-001 требует собственной
  отдельной закрывающей проверки актуальных proof и package contracts.

## Closing handoff

* Result commit: `e17a3394f61194dccda790a97406ac7c92118f37` (`feat(nodes):
  compact layout and minimize crossings`). Final benchmark/documentation
  supplement: `35d3183f4` (`docs(nodes): record final layout benchmark`).
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
* Свежая проверка перед handoff: `26/26` focused tests, typecheck пакетов
  `@nodes/layout` и `nodes`, `git diff --check` — green. Machine-readable RIGHT
  и DOWN proofs, exact requests и live screenshots находятся в artifacts.
* Владелец 2026-08-10 визуально принял итоговую геометрию. Независимому
  проверяющему нужно отдельно оценить документированную границу Worker: карточка
  отмечает физическое нахождение Worker adapter/types в `@nodes/layout` как
  отдельный последующий implementation-срез; это нельзя молча считать ни
  выполненным, ни блокирующим без verdict по scope NODES-001.
