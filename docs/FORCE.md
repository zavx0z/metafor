# Force

Force — единый транспорт импульсов между изолированными доменами MetaFor.
Он переносит протокол, но не владеет ни декларациями, ни БД, ни runtime-state,
ни исполнением процессов.

Онтология описана в [ONTOLOGY.md](./ONTOLOGY.md), доменные границы — в
[ARCHITECTURE.md](./ARCHITECTURE.md), а силовые каналы подробнее разобраны в
[Gravity](./proto/gravity.md), [Electromagnetism](./proto/electromagnetism.md),
[Strong](./proto/strong.md), [Weak](./proto/weak.md) и
[Higgs](./proto/higgs.md).

## Один транспорт

Server и browser используют один публичный смысл:

```ts
import {Force} from "force"

const force = new Force("matrix")

force.onCreate = (snapshot) => {}
force.onImpulse = (message) => {}
force.impulse({parts: []})
```

Runtime-adapter различается, Force API и формат сообщения — нет.
Локальный `BroadcastChannel` не является междоменным transport-ом ядра.

Центральный server принимает:

```text
WS /ws:
  {type:"register", domain, id}
  {type:"create", domain, snapshot}
  {parts:[...]}

HTTP POST /force:
  {parts:[...]}
```

`register` и `create` — transport-control. Обычный `ForceMessage` всегда
передаётся как `{parts}` и не оборачивается в `{type:"force"}`.
`create` доставляет bootstrap snapshot указанному домену; ordinary messages
пока broadcast-ятся всем зарегистрированным доменам, а каждый домен игнорирует
нерелевантные частицы.

Force не применяет патчи, не открывает SQLite, не знает бизнес-логику доменов и
не добавляет ack, ordinary impulse replay, seq, queue или routing policy.
Последний target `create` snapshot хранится отдельно как bootstrap для нового
клиента соответствующего домена.

## Message и Particle

```ts
interface ForceMessage {
  parts: Particle[]
}

interface Particle {
  part: "inflaton" | "graviton" | "gluon" | "higgs" |
        "photon" | "z" | "w+" | "w-"
  op: "add" | "remove" | "replace" | "move" | "copy" | "test"
  path: string | number
  value?: unknown
  from?: string | number
}
```

Конверт не дублирует `part`, `channel`, `source` или `boson`.
Смысл маршрута читается с каждой частицы.

## Семантика частиц

| `part/op`   | Направление                | Смысл                                     |
| ----------- | -------------------------- | ----------------------------------------- |
| `inflaton`  | Dark → Boundary            | Поток source/meta/WIMP declarations       |
| `graviton`  | Boundary → runtime domains | Материализованная структура current world |
| `gluon`     | runtime                    | Значение обычного field у actor           |
| `higgs`     | runtime                    | Изменение topology field: enum/array      |
| `photon`    | Matrix → observers/Energy  | Наблюдаемый state signal                  |
| `z/test`    | Energy → Matrix            | Запрос на claim процесса                  |
| `z/copy`    | Matrix → Energy            | Выбор исполнителя и frozen fields         |
| `w+`        | Energy → Matrix            | Успешный result write-set                 |
| `w-`        | Energy → Matrix            | Ошибка и error write-set                  |

`Inflaton` и `Graviton` не взаимозаменяемы. Первый переносит возможность
формы, второй — уже материализованную Boundary-проекцию.

## Inflaton: declaration stream

Для `inflaton`:

```text
part = inflaton
path = meta SRC
value = именованная часть WIMP declaration
```

Пример:

```ts
{
  parts: [
    {
      part: "inflaton",
      op: "replace",
      path: "zavx0z/git",
      value: {meta: {name: "git", desc: "Git"}}
    },
    {
      part: "inflaton",
      op: "replace",
      path: "zavx0z/git",
      value: {
        fields: {
          "1": {key: "command", type: "string", required: false}
        }
      }
    }
  ]
}
```

Поток покрывает реально представленные в DSL sections:
`meta`, `fields`, enum `variants`, `states`, `transitions`,
`conditions`, `processes` с action/env/read/write/handlers/finally,
`reactions`, `matter`, `mass` и `bulk`.

Dark выдаёт детерминированные local declaration IDs. Идентичность declaration
составляется как `WIMP SRC + localNumber` внутри конкретной таблицы:

```text
field("zavx0z/git", "1")
state("zavx0z/git", "1")
process("zavx0z/git", "1")
matter("zavx0z/git", "1")
```

Тип сущности уже задан таблицей и не кодируется в ID. Actor, topology instance,
value и прочие materialized row IDs в Dark не создаются.

## Graviton: materialized projection

Boundary атомарно применяет declaration stream, создаёт canonical declaration
rows и материализует actor/topology/value/current-world rows. Только после
commit он испускает `graviton`.

```ts
{
  part: "graviton",
  op: "add",
  path: "actor",
  value: {
    actor: {id: 17, parentActor: null, parentTopology: null, wimp: "zavx0z/git", position: 0},
    values: [],
    valueRecords: [],
    valueItems: [],
    state: {actor: 17, metaState: null}
  }
}
```

Topology instances идут отдельными Graviton parts с `path = fuzzy | axion |
macho`.

Runtime domain не должен получать UUID/ID с подразумеваемым последующим чтением
Boundary. Для полного bootstrap Boundary дополнительно отправляет
самодостаточные target `create` snapshots:

```text
Boundary commit
  -> graviton materialized parts
  -> create(matrix, matrixRuntime)
  -> create(energy, processCatalog)
  -> create(bulk, bulkRuntime)
```

Так голографический инвариант становится техническим: данные, пересекающие
границу, достаточны для восстановления соответствующей runtime-проекции.

## Runtime addressing

- `inflaton.path` — WIMP SRC;
- materialized `graviton.path` — collection kind (`actor`, `fuzzy`, `axion`,
  `macho`), а instance ID находится в snapshot value;
- class-scope `higgs.path` — WIMP SRC;
- actor-scope `gluon`, `higgs`, `photon`, `z`, `w+`, `w-` используют
  `path = actor ID`;
- fields адресуются внутри `value.fields[fieldId]`;
- key, label, name и display order не являются protocol addresses;
- `/field/...` не является обычным Force path.

Обычные `string`, `number`, `boolean` fields меняются через `gluon`.
`enum` и `array` являются topology fields и меняются через `higgs`.

## Weak process flow

```text
Matrix -> photon/test(actor, state)
Energy -> z/test(actor, {energy})
Matrix -> z/copy(actor, from=energy, {fields})
Energy -> execute cached descriptor
Energy -> w+ | w-
Matrix -> apply write-set, unlock, continue transition
```

Matrix snapshot содержит только то, что нужно автомату. Process catalog и
action descriptors получает Energy. `z copy` несёт frozen fields, но не
process descriptor.

## Данные инструментов

Force переносит управляющие события и ограниченные runtime-проекции, но не
является хранилищем артефактов. Содержимое файлов, большой stdout/stderr,
скриншоты, архивы и объёмные tool results должны жить в filesystem-backed
operation mass/artifacts. Текущая in-memory Energy mass предназначена только
для compact process-local data. Matrix удерживает только состояние операции, а
Force возвращает небольшой status/write-set.

Внешний tool adapter не должен раскрывать агенту `actorId`, WIMP или частицы:
снаружи остаётся стандартный tool contract, внутри действует MetaFor.
