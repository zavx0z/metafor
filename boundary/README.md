# Boundary

`Boundary` — голографическая граница MetaFor: самостоятельный домен, который
канонизирует source declaration, фиксирует её в SQLite и материализует
адресуемый current world.

Boundary не загружает `meta` вместо Dark, не исполняет процессы вместо Energy и
не ведёт runtime-переходы вместо Matrix.

## Основной поток

```text
meta/WIMP source
  -> Dark
  -> inflaton declaration stream
  -> Force
  -> Boundary atomic commit and materialization
  -> graviton materialized parts
  -> Force
  -> Matrix / Energy / Bulk
```

После успешного commit Boundary также отправляет адресованные bootstrap
snapshots:

```text
create(matrix, matrixRuntime)
create(energy, processCatalog)
create(bulk, bulkRuntime)
```

`Graviton` и `create` испускаются только после атомарной фиксации declaration и
materialized world. ID без самодостаточных данных не считается runtime-проекцией.

## Ответственность

Boundary владеет:

- canonical WIMP declaration;
- fields, enum variants, states, transitions и conditions;
- processes, handlers и reactions;
- matter, serializable mass declaration и bulk declaration;
- actor, topology и value instances;
- current materialized hierarchy;
- построением самодостаточных Matrix, Energy и Bulk projections.

Текущий реализованный commit materializes world из declaration/default values.
Обратная фиксация actor-scoped runtime `higgs` из Matrix и перестройка уже
живущих Fuzzy/Macho branches остаются отдельной задачей в [`TODO.md`](../TODO.md).

Boundary не владеет:

- source/meta loading и declaration normalization — это Dark;
- runtime state machine, locks и transitions — это Matrix;
- process execution и process-local runtime mass — это Energy;
- проявленной пространственной формой — это Bulk;
- междоменным хранением или бизнес-маршрутизацией — Force остаётся transport-ом.

## Идентичность

Declaration identity приходит из Dark как детерминированная пара:

```text
(wimpSrc, localNumber) внутри конкретной declaration table
```

Одинаковый local number допустим в разных tables: тип сущности уже задан table
context и не кодируется в ID. Версия declaration в identity сейчас не входит.

Boundary самостоятельно создаёт runtime/materialization identity:

- actor ID;
- topology instance ID;
- value ID;

Текущий materialized world определяется этим согласованным набором Boundary
rows; отдельный публичный materialization ID сейчас не вводится.

SQLite autoincrement допустим для этих runtime instances, но не определяет
declaration identity.

## Изоляция доменов

В production только Boundary открывает свою SQLite database.

- Dark не импортирует Boundary и передаёт только Inflaton через Force.
- Matrix получает `MatrixRuntimeSnapshot` и runtime particles.
- Energy получает self-contained process catalog и runtime signals.
- Bulk получает собственную projection.
- Ни один получатель не использует ID как указание затем прочитать Boundary DB.
- Междоменное взаимодействие проходит только через публичный Force transport,
  без локальной шины или direct ORM read.

Тесты могут открывать Boundary напрямую для подготовки fixture и проверки rows,
но такой import не становится production API между доменами.

## Server flow

`boundary/server.ts`:

1. открывает SQLite через `boundary/sqlite.ts`;
2. создаёт `Force("boundary")`;
3. принимает ordinary `{parts}` через `force.onImpulse`;
4. применяет Inflaton одной транзакцией;
5. материализует actor/topology/value current world;
6. публикует Graviton и target `create` snapshots после commit.

Путь к database передаётся первым позиционным аргументом server script. Если его
нет, Boundary читает `BOUNDARY_PATH`; без обоих используется
`boundary/tmp/boundary.sqlite`.

## Персистентный API

Низкоуровневый вход нужен самому Boundary server и test fixtures:

```ts
import {open} from "boundary/sqlite"

const boundary = await open(filename)
```

`boundary.materialize(message)` применяет входной Force message и возвращает
готовые projections после commit. `matrixRuntime()`, `energyRuntime()` и
`bulkRuntime()` строят snapshots внутри Boundary; runtime domains получают их
через target `create`, а не вызывают эти методы напрямую.
