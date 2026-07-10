# Force

Force — единый упорядоченный transport между изолированными доменами MetaFor.
Он переносит impulses, но не владеет declaration, SQLite, runtime state,
process execution или visual scene.

## Публичный API

```ts
import {Force} from "force"

const force = new Force("matrix")

force.onImpulse = async (message) => {
  const particle = message.parts[0]
  // patch local projection
}

force.impulse({
  parts: [{part: "photon", op: "replace", path: 17, value: "ready"}],
})
```

У Force нет `onCreate`, snapshot callback или reset lifecycle.

## Transport protocol

WebSocket `/ws` принимает:

```text
{type:"register", domain, id}
{parts:[particle]}
```

HTTP `POST /force` принимает только:

```text
{parts:[particle]}
```

`register` — единственный служебный payload. Любые `type:"create"`,
`type:"snapshot"`, `{type:"force"}` и сообщения с нулём или несколькими
particles отклоняются.

WebSocket impulse доставляется всем зарегистрированным получателям, кроме
отправившего socket. HTTP impulse не имеет socket-origin и доставляется всем.

## Message и Particle

```ts
interface ForceMessage {
  parts: [Particle]
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

Particle не содержит transport metadata. Разрешены только поля `part`, `op`,
`path`, `value`, `from`.

## Главный инвариант

```text
one changed entity = one ForceMessage = one Particle
```

Нельзя объединять в message:

- WIMP declaration целиком;
- несколько declaration tables;
- process catalog;
- actors collection;
- Matrix runtime;
- Bulk world.

Будущее физическое batching transport-а не должно быть видно consumer-у как
многочастичный logical message.

## Operations

Force использует только JSON Patch operation names:

- `add` — новая адресованная entity;
- `remove` — удаление адресованной entity без копии прежнего подграфа;
- `replace` — delta изменившихся свойств entity;
- `move` — перенос identity/value из `from` в `path`;
- `copy` — копирование адресованного значения из `from`;
- `test` — marker, claim или проверка адресованного значения.

Force не применяет эти операции. Их атомарно применяет store домена-получателя.

## Семантика частиц

| Part       | Основное направление       | Локальное изменение                         |
| ---------- | -------------------------- | ------------------------------------------- |
| `inflaton` | Dark → Boundary            | Одна canonical declaration entity           |
| `graviton` | Boundary → runtime domains | Один actor/topology/declaration runtime row |
| `gluon`    | runtime                    | Одно обычное field одного actor             |
| `higgs`    | runtime                    | Одна topology-зависимая ветвь/field         |
| `photon`   | Matrix → observers/Energy  | State одного actor                          |
| `z`        | Matrix ↔ Energy/lifecycle  | Claim/copy или replay marker                |
| `w+`       | Energy → Matrix            | Успешный локальный write-set                |
| `w-`       | Energy → Matrix            | Error и локальный error write-set           |

## Inflaton addressing

Collection entity:

```text
<wimp src>/<section>/<local id>
```

Singleton entity:

```text
<wimp src>/<meta|mass|bulk>
```

Пример одного field add:

```ts
{
  parts: [{
    part: "inflaton",
    op: "add",
    path: "zavx0z/git/fields/1",
    value: {key: "command", type: "string", required: false},
  }],
}
```

Изменение label передаётся без неизменившихся свойств:

```ts
{
  parts: [{
    part: "inflaton",
    op: "replace",
    path: "zavx0z/git/fields/1",
    value: {label: "Command"},
  }],
}
```

Dark завершает причинную серию marker-ом:

```ts
{parts: [{part: "inflaton", op: "test", path: "zavx0z/git"}]}
```

Marker не разрешает Boundary пересобирать мир.

## Runtime addressing

```text
actor/<runtime id>
topology/<runtime id>
declaration/<wimp src>/<section>/<local id>
```

Actor add несёт только одну actor entity с её локальными initial values. Actor
replace несёт delta, например новый `parentTopology` или `position`. Remove
содержит только path.

Process descriptor переносится как один declaration Graviton, а не catalog:

```ts
{
  parts: [{
    part: "graviton",
    op: "add",
    path: "declaration/zavx0z/git/processes/1",
    value: {id: 101, wimp: "zavx0z/git", state: "ready", descriptor: {}},
  }],
}
```

Actor-scoped field/state particles используют numeric actor ID. Field ID
находится внутри `value.fields[fieldId]`.

## Atomicity

Каждый входной patch является отдельной transaction Boundary. Derived
particles формируются из committed state и отправляются после commit по одной.
Транспортный порядок сохраняет причинную последовательность.

Целостность нельзя обеспечивать reset, очисткой таблиц или повторной сборкой
всех actors.

## Cold start и reconnect

После регистрации Force runtime отправляет обычный marker:

```ts
{
  parts: [{
    part: "z",
    op: "test",
    path: "force/replay/<domain>/<connection id>",
  }],
}
```

Force сообщает новому соединению также о уже подключённых consumers обычными
markers. Поэтому startup order не важен.

Domain store отвечает idempotent `add` particles своей текущей проекции.
Получатель upsert-ит те же identity и не очищает имеющееся состояние. Force не
хранит history, snapshot cache или replay log.

## Weak process flow

```text
Matrix -> photon/test(actor, state)
Energy -> z/test(actor, {energy})
Matrix -> z/copy(actor, from=energy, {fields})
Energy -> execute cached descriptor
Energy -> w+ | w-
Matrix -> patch actor fields and continue
```

Process descriptor уже находится в локальном Energy store. Большие outputs
остаются в mass/artifacts.

## Запрещённые механизмы

- snapshot/bootstrap payload;
- target `create`;
- reset/clear/restore projection;
- full declaration, catalog, runtime или world message;
- полная рематериализация после локального patch;
- прямое чтение чужого store после получения ID;
- доменная семантика внутри Force server.
