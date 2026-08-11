# NODES-005 — Объединять связанные рёбра в общий trunk

## Коротко

Связанные semantic edges должны использовать общий прямой маршрутный ствол,
когда это убирает независимые U-петли и не нарушает hard laws.

## Наблюдение владельца

В Hamiltonian несколько IPC-связей одного exact source-port идут к расположенным
друг над другом target-нодам. Router разносит их на независимые lanes: нижнее
ребро делает U-петлю вокруг уже подходящего вертикального участка. Владелец
указал, что такой участок нужно объединять и проводить прямо.

## Решение владельца

Каждый edge сохраняет semantic ID и exact visible parameter sockets. Связанные
edges с одним exact source-port или exact target-port могут совпадать на
generated trunk и разделяться только в generated junctions. Общая source-node
или target-node без общего exact port не разрешает bundle: рёбра разных портов
одной карточки не совпадают. Это не разрешает overlap несвязанных edges, ручные
lanes/gateways или изменение протокола presentation-данными.

## Границы

Меняется только чистый router `@nodes/layout`, его алгоритмические документы и
проверки. Worker, UI, Hamiltonian lifecycle, renderer и порядок parameter rows
не входят в задачу.

## Критерии готовности

1. Microfixture с одним exact source socket и двумя targets
   использует общий trunk без лишней U-петли.
2. Оба результата остаются отдельными sections с exact endpoints, EAST→WEST,
   orthogonality, hierarchy и node/compound clearance.
3. Рёбра разных exact sockets одной ноды и остальные несвязанные edges не могут
   совпадать и сохраняют полный pitch.
4. Generated junction не считается crossing; фактические crossings продолжают
   минимизироваться первой soft-целью.
5. RIGHT и DOWN детерминированы для повторов и перестановок входных массивов.
6. Frozen proof, package/root typecheck, final benchmark и точный live-сценарий
   проходят перед переводом в `REVIEW`.

## Артефакты

[`project/artifacts/NODES-005/`](../artifacts/NODES-005/README.md)

## Результат

Router генерирует axis существующего совместимого trunk как visibility
candidate и разрешает collinear overlap только для semantic edges с одним exact
source-port или exact target-port. Каждый edge остаётся отдельной section с
exact endpoints. Для разных sockets одной ноды действует прежний полный pitch.

Offline proof, оба typecheck и live RIGHT/DOWN прошли. Финальный benchmark
зафиксировал median 196.41 ms RIGHT и 426.99 ms DOWN; относительно последнего
NODES-003 это +9.2% и +5.9%, что передаётся независимому reviewer вместе с
функциональным результатом.

Result commit: `611283e776ac350764cf392603913bbc91b4185f`.
