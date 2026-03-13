# Higgs

`higgs.md` разворачивает протокольное чтение topology-field change в MetaFor.
Общие различения силы, `Boson`, подтипа канала и `Impulse` заданы в [корневом протоколе](../PROTOCOL.md).

## Higgs fields и канал изменения

В MetaFor topology-fields читаются как Higgs fields.
Их изменение переносится через `Higgs boson`.

Это изменение отлично от других каналов:

- `Photon` переносит `State`,
- `Gluon` изменяет ordinary `Field`,
- `Higgs boson` изменяет topology-fields,
- `Graviton` удерживает скрытую организацию и геометрию.

Topology-fields определяются типовой природой поля:

- `enum` всегда задаёт branch selection,
- `array` всегда задаёт branch multiplicity / branch expansion.

Это различие первично по отношению к AST.
AST лишь разворачивает topology semantics в конкретном контракте.

## Чтение по доменам

### Dark

- hidden topology как часть скрытого мира,
- наблюдение глобальной topology reconfiguration,
- удержание topology/gravity-непрерывности,
- чтение структурных следствий `Higgs boson` без превращения `Dark` в runtime-оркестратор.

### Boundary

- каноническая фиксация topology selection,
- каноническая фиксация branch multiplicity,
- различение topology-field change и ordinary field update,
- запрет внешней реактивной мутации `array`.

### Bulk

- проявленная structural reconfiguration,
- разворачивание ветвей,
- чтение атома как multiplicity после unfold,
- наблюдаемая смена topology, а не просто значения в текущей ветви.

## Семантика topology-fields

### `enum`

`enum` всегда выражает выбор ветви.
Это не просто ограниченный набор литералов, а topology selector:

- какая ветвь мира допустима,
- какой путь проявления активен,
- какая конфигурация структуры должна существовать.

### `array`

`array` всегда выражает множественность ветвей.
Это не ordinary collection value, а branch expansion:

- сколько ветвей должно существовать,
- как атом разворачивается в множественность,
- как единичная точка структуры становится составом ветвей.

Когда `array` раскрывается, атом становится multiplicity.
Это предотвращает чтение массива как простой value-box внутри неизменной topology.

## Ограничения для `array`

- `array` не участвует в entanglement,
- `array` не мутируется внешними реакциями,
- `array` может меняться только внутренним процессом самого атома,
- такое изменение должно проходить через изменение `State`,
- внешний мир может наблюдать результат topology change, но не должен напрямую вмешиваться в unfold topology.

Эти ограничения нужны, чтобы избежать неконтролируемого topology coupling.
Если внешние реакции могли бы произвольно мутировать `array`, topology становилась бы побочным эффектом чужих сигналов, а не результатом собственной эволюции атома.

## Глобальная наблюдаемость

Topology-field change имеет глобально наблюдаемые структурные последствия:

- `Higgs boson` меняет topology,
- `Photon` продолжает переносить `State`,
- `Graviton` удерживает ту скрытую геометрию, в которой topology change получает место,
- `Dark` наблюдает структурные следствия изменений, приходящих через `Electromagnetism`, `Higgs field change` и `Gravity`.

Это не делает `Dark` runtime execution center.
`Dark` остаётся hidden builder/holder topology и hidden observer их глобальной согласованности.
