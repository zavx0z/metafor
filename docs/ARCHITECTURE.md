# Архитектура

Архитектура MetaFor переводит онтологию `Домен × Сила × Сущность` в
исполняемые границы. Источником декларации является `meta`; источником
canonical current world является Boundary.

## Голографический инвариант

MetaFor строится в призме голографического принципа: целостный текущий мир
фиксируется на границе, а каждый runtime-домен получает самодостаточную
проекцию, достаточную для своей работы.

Из этого следуют четыре технических правила:

1. домен не читает внутреннее хранилище другого домена;
2. ID без данных не считается runtime snapshot;
3. пересечение границы происходит только через Force;
4. данные проекции должны позволять восстановить локальный runtime без скрытого
   обращения к Boundary.

Это архитектурная дисциплина, а не буквальная симуляция физики.

## Основной поток

```text
meta/WIMP source
  -> Dark reads and normalizes declaration
  -> inflaton declaration stream
  -> Force
  -> Boundary atomic declaration commit
  -> Boundary materializes current world
  -> graviton materialized projection
  -> Force
  -> Matrix / Energy / Bulk runtime projections
```

Короткая формула:

```text
Dark формирует возможность.
Boundary формирует действительность.
Force переносит импульсы.
Matrix проводит состояние.
Energy исполняет процессы.
Bulk проявляет форму.
```

Force не является доменом и не становится владельцем данных.

## Изоляция доменов

Production-код одного домена не импортирует runtime или persistence другого
домена. Общими могут быть только нижележащие типовые контракты.

- Dark не импортирует Boundary и не открывает SQLite.
- Boundary не исполняет process actions.
- Matrix не читает Boundary и не получает process source.
- Energy не читает Boundary и не владеет Matrix store.
- Bulk не читает Boundary и не становится вторым canonical store.
- Тесты могут собирать домены вместе, но тестовая склейка не является
  production API.

## Dark

Dark — source/meta reader и домен скрытой связности.

Вход:

```ts
{part: "inflaton", op: "test", path: "zavx0z/git"}
```

Dark:

1. загружает `meta` через `loadMeta`;
2. читает WIMP declaration;
3. назначает детерминированные local IDs внутри каждой declaration table;
4. рекурсивно включает явно представленные child WIMP из matter graph;
5. отправляет один атомарный declaration stream через Force.

Dark передаёт `meta`, fields/variants, states/transitions/conditions,
processes с handlers, reactions, matter, mass и bulk declaration. Он не создаёт
actor, topology instance или value и не испускает declaration как
`graviton`.

Версионирование declaration IDs в текущий контракт не входит.

## Force

Force — единый WebSocket/HTTP transport. Он знает только:

- registration домена;
- target `create` bootstrap snapshot;
- ordinary `ForceMessage {parts}`.

Обычные сообщения broadcast-ятся без `{type:"force"}`. Force не знает SQL,
не применяет patch, не маршрутизирует по бизнес-семантике и не хранит replay
log. Подробный контракт задан в [FORCE.md](./FORCE.md).

## Boundary

Boundary — самостоятельный владелец:

- canonical WIMP declarations;
- fields, enum variants, states, transitions и conditions;
- processes, actions/handlers и reactions;
- matter declarations;
- actor, topology, value и current materialization;
- runtime projections.

Boundary server сам открывает SQLite и создаёт `Force("boundary")`.
Declaration stream применяется одной транзакцией. Повторная одинаковая
declaration сохраняет ту же identity и заменяет canonical состав, а не
накапливает случайные autoincrement IDs.

После commit Boundary:

1. испускает `graviton` с материализованными actor/topology/current-world
   данными;
2. отправляет Matrix самодостаточный runtime snapshot через target `create`;
3. отправляет Energy process catalog через target `create`;
4. отправляет Bulk его runtime projection, пока эта совместимость нужна.

Boundary не отправляет сигнал, смысл которого состоит в том, чтобы получатель
сам прочитал Boundary DB.

Текущий core полностью реализует declaration-time materialization. Runtime
`higgs` уже применяется в Matrix, но обратный Boundary commit и перестройка
живущих Fuzzy/Macho branches вынесены в [TODO](../TODO.md); до этого
`structuralDirty` нельзя считать персистентной rematerialization.

## Declaration identity

Dark владеет declaration identity:

```text
(wimpSrc, localNumber) внутри field
(wimpSrc, localNumber) внутри state
(wimpSrc, localNumber) внутри process
(wimpSrc, localNumber) внутри reaction
(wimpSrc, localNumber) внутри matter
```

Одинаковый local number допустим в разных tables: тип уже задан table context.
Имена сущностей и их keys остаются изменяемыми данными и не подменяют identity.

Boundary владеет runtime/materialization identity:

```text
actor ID
topology instance ID
value ID
```

Отдельный public current-world ID сейчас не вводится; целостность snapshot
задаётся атомарным commit и согласованным набором этих Boundary-owned rows.

Dark не вычисляет эти ID. SQLite autoincrement не определяет declaration
identity.

## Matrix

Matrix получает только самодостаточный `MatrixRuntimeSnapshot` и runtime
particles. Она удерживает:

- actor/brane addressing;
- compact field values;
- state graph и transition conditions;
- topology field markers;
- process-bound marker и lock;
- frozen fields для выбранного Energy.

Matrix принимает `gluon`, `higgs`, `z`, `w+`, `w-`; испускает
`photon` и `z copy`. Она не получает action source, process descriptors или
Boundary ORM.

## Energy

Energy — исполнитель processes.

Boundary доставляет ему catalog:

```text
actor -> WIMP
WIMP + state -> process descriptor
```

Energy слушает `photon/test`, проверяет runtime env, claim-ит actor через
`z test`, получает frozen fields через `z copy`, исполняет cached
descriptor и возвращает `w+` или `w-`.

Runtime mass принадлежит Energy. Process action получает единый params object:

```ts
{field, value, mass, self}
```

Process result write-set ограничен declared `success.writeFields` или
`error.writeFields`. Большие результаты не должны становиться Matrix fields.

## Reactions

Reactions являются частью declaration stream и canonical Boundary schema.
Их declaration включает read/write/state references. Полное runtime-исполнение
reactions может развиваться отдельно, но отсутствие executor-а не является
основанием терять их из Dark → Boundary protocol.

## Fields и силовые каналы

Обычные fields:

- `string`
- `number`
- `boolean`

Их actor values меняются через `gluon`.

Topology fields:

- `enum` — выбор ветви;
- `array` — множественность ветвей.

Они меняются через `higgs`, а не как обычное значение. `array` не
мутируется внешней reaction и разворачивается Boundary по runtime value
конкретного actor. Поэтому Macho children создаёт Boundary, не Dark.

## Tool boundary

Внешний tool contract и внутренняя MetaFor-онтология — разные слои.

```text
external standard tool call
  -> adapter
  -> MetaFor operation
  -> Matrix state + Force signals
  -> Energy execution
  -> mass/artifact result
  -> external standard tool result
```

Агент снаружи не должен знать WIMP, actorId или Force particles. Будущий
Codex-compatible adapter должен брать upstream generated schema как source of
truth, а не вводить новый внешний protocol.

Force несёт компактные lifecycle signals. Matrix хранит status, lock и другие
значения автомата. Содержимое файлов, полный stdout/stderr, скриншоты и большие
JSON results принадлежат mass/artifact layer.

До реализации общего adapter-а разрешены только небольшие scoped test tools.
Широкий `shell.exec` не является первым тестовым инструментом.

## Файловая проекция

```text
force/      transport и runtime adapters
dark/       source/meta reader и declaration emitter
boundary/   SQLite, canonical declaration, materialization, projections
matrix/     runtime state/transition/lock processor
energy/     process executor и runtime mass
bulk/       проявленная runtime projection
types/      нижележащие serializable contracts
```

Файловая близость в monorepo не разрешает прямые runtime imports между
доменами.

## Финальные инварианты

1. `inflaton.path = meta SRC`.
2. Inflaton переносит declaration, Graviton — materialized current world.
3. Dark не создаёт actors.
4. Boundary владеет canonical DB и materialization.
5. Matrix, Energy и Bulk не читают Boundary.
6. Один Force transport обслуживает все домены.
7. Runtime snapshot самодостаточен.
8. Declaration IDs детерминированы Dark; runtime IDs принадлежат Boundary.
9. Process catalog приходит Energy через Force.
10. Большие tool results живут в mass/artifacts, не в Force/Matrix.
