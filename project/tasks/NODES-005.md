# NODES-005 — Объединять связанные рёбра в общий trunk

## Коротко

Связанные semantic edges должны использовать общий прямой маршрутный ствол,
когда это убирает независимые U-петли и не нарушает hard laws.

## Наблюдение владельца

В Hamiltonian несколько IPC-связей одного source-node идут к расположенным друг
над другом target-нодам. Router разносит их на независимые lanes: нижнее ребро
делает U-петлю вокруг уже подходящего вертикального участка. Владелец указал,
что такой участок нужно объединять и проводить прямо.

## Решение владельца

Каждый edge сохраняет semantic ID и exact visible parameter sockets. Связанные
edges с общим source-node или target-node могут совпадать на generated trunk и
разделяться только в generated junctions. Это не разрешает overlap несвязанных
edges, ручные lanes/gateways или изменение протокола presentation-данными.

## Границы

Меняется только чистый router `@nodes/layout`, его алгоритмические документы и
проверки. Worker, UI, Hamiltonian lifecycle, renderer и порядок parameter rows
не входят в задачу.

## Критерии готовности

1. Microfixture с двумя разными source sockets одной ноды и двумя targets
   использует общий trunk без лишней U-петли.
2. Оба результата остаются отдельными sections с exact endpoints, EAST→WEST,
   orthogonality, hierarchy и node/compound clearance.
3. Несвязанные edges по-прежнему не могут совпадать и сохраняют полный pitch.
4. Generated junction не считается crossing; фактические crossings продолжают
   минимизироваться первой soft-целью.
5. RIGHT и DOWN детерминированы для повторов и перестановок входных массивов.
6. Frozen proof, package/root typecheck, final benchmark и точный live-сценарий
   проходят перед переводом в `REVIEW`.

## Артефакты

[`project/artifacts/NODES-005/`](../artifacts/NODES-005/README.md)
