# Правила создания meta.ts

## Структура

```typescript
export default MetaFor("<name>")
  .fields((field) => ({}))
  .superposition({})
  .mass(() => ({}))
  .energy()
  .processes((process, destroy) => [])
  .reactions((reaction) => [])
  .matter(({ state, value, html }) => html``)
  .bulk({
    view: ({ css }) => css``,
  })
```

**Порядок вызовов:** `fields → superposition → mass → energy → processes → reactions → matter → bulk`

`MetaFor` в `meta.ts` предоставляется DSL-средой как глобал; локальный `import "metafor"` не нужен. Обычные TypeScript-модули действий могут импортировать типы явно: `import type { ActionParams } from "@metafor/types/metafor/action"`.

---

## fields — только примитивы

```typescript
.fields((field) => ({
  name: field.string.required("Гость"),
  age: field.number.required(18, { label: "Возраст" }),
  status: field.enum("draft", "published").optional({ label: "Статус" }),
  relatedIds: field.array.required([], { label: "Связанные узлы" }),
}))
```

**Правила:**

- Только примитивы: `string`, `number`, `boolean`, `enum`, `array`
- Объекты — в `mass`
- `.optional({ label: "..." })` — метаданные для enum
- **array сейчас является topology/runtime-связью `number[]`:** `field.array.required([], { label })`
- **Label должен быть человекопонятным:** язык выбирается по контексту пакета, но подпись должна описывать поле или флаг так, как пользователь увидит его в UI/документации.

**Примеры label:**

```typescript
.fields((field) => ({
  // Правильно: человекопонятная подпись + опция
  message: field.string.optional({ label: "Сообщение (-m)" }),
  all: field.boolean.optional({ label: "Все файлы (-a)" }),
  error: field.string.optional({ label: "Error" }),
  amend: field.boolean.optional({ label: "Исправить (--amend)" }),

  // Неправильно: техническая или непонятная подпись
  message: field.string.optional({ label: "msg" }),
  all: field.boolean.optional({ label: "bool" }),
}))
```

---

## Superposition — граф переходов

```typescript
.superposition({
  ожидание: { загрузка: { userId: { gt: 0 } } },
  загрузка: { успех: {}, ошибка: {} },
  успех: { ожидание: { ready: { null: true } } },
})
```

**Условия:** `eq`, `gt`, `gte`, `lt`, `lte`, `between`, `startsWith`, `include`, `pattern`, `length`, `includes`, `isEmpty`, `in`, `notIn`, `startsWithIn`, `null`

**Переход по значению:**

```typescript
// Краткая запись для optional полей
состояние: { ожидание: { cmd: null } }  // cmd === null

// Развёрнутая запись для optional полей
состояние: { ожидание: { cmd: { null: false } } }  // cmd !== null
состояние: { ожидание: { cmd: { null: true } } }   // cmd === null
```

**Правила имён состояний:**

- Имена на русском языке
- Описательные имена: `ожидание`, `загрузка`, `успех`, `ошибка`
- Для имён с пробелами использовать кавычки: `"рабочие деревья"`, `"режим редактирования"`
- Самопереход запрещён даже с условием: `готов: { готов: {...} }` недопустим
- Повторение проходит через отдельное содержательное состояние:
  `готов → создание снимка → готов`

```typescript
.superposition({
  ожидание: {
    "рабочие деревья": { cmd: { startsWith: "worktree" } },
    "режим просмотра": { cmd: { startsWith: "show" } },
  },
  "рабочие деревья": { ожидание: {} },
  "режим просмотра": { ожидание: {} },
})
```

**Триггеры переходов:**

```typescript
.superposition({
  "получение команды": {
    "определение операции": { command: { null: false } },  // ✅ Только если команда есть
  },
  "определение операции": {
    "выполнение": { operation: { null: false } },  // ✅ Успех (operation установлен)
    "ошибка": { error: { null: false } },  // ✅ Ошибка (error установлен)
  },
  "выполнение": {
    "получение команды": { operation: null },  // ✅ Завершение выполнения
  },
  "ошибка": {
    "получение команды": { error: null },  // ✅ Сброс ошибки (краткая форма)
  },
})
```

Fields управляют работой Atom. Внешний агент или родитель задаёт значение Field,
после чего Superposition разрешает состояние с Process. Не вызывай action
напрямую и не добавляй скрытый imperative API поверх Atom.

```typescript
.fields((field) => ({
  profileAddress: field.string.optional({ label: "Адрес сохранённого профиля" }),
  browserInstanceId: field.string.optional({ label: "Экземпляр браузера" }),
  rtcConnected: field.boolean.required(false, { label: "WebRTC подключён" }),
  screenshotPath: field.string.optional({ label: "Путь нового снимка" }),
  error: field.string.optional({ label: "Ошибка" }),
}))
.superposition({
  "ожидание профиля": {
    "запуск браузера": { profileAddress: { null: false } },
  },
  "запуск браузера": {
    "ошибка": { error: { null: false } },
    "подключение WebRTC": { browserInstanceId: { null: false } },
  },
  "подключение WebRTC": {
    "ошибка": { error: { null: false } },
    "браузер готов": { rtcConnected: { eq: true } },
  },
  "браузер готов": {
    "создание снимка": { screenshotPath: { null: false } },
  },
  "создание снимка": {
    "ошибка": { error: { null: false } },
    "браузер готов": { screenshotPath: { null: true } },
  },
  "ошибка": null,
})
```

**Порядок триггеров:**

Триггеры проверяются **по порядку** через `Object.entries().find()`. **Первое совпадение** выигрывает.

```typescript
.superposition({
  "парсинг опций": {
    // ✅ Сначала более специфичные (3 опции)
    "амед с подписью и сообщением": { 
      amend: { null: false }, 
      signoff: { null: false }, 
      message: { null: false } 
    },
    // ✅ Затем комбинации (2 опции)
    "коммит всех файлов с сообщением": { 
      all: { null: false }, 
      message: { null: false } 
    },
    // ✅ В конце одиночные (1 опция)
    "коммит с сообщением": { message: { null: false } },
    "коммит всех файлов": { all: { null: false } },
  },
})
```

**Правило:** Более специфичные условия (с несколькими проверками) должны идти **ПЕРЕД** менее специфичными (с одной проверкой).

**Пример:**

- `git commit --amend -s -m "msg"` → ✅ "амед с подписью и сообщением" (3 опции, первое совпадение)
- `git commit -a -m "msg"` → ✅ "коммит всех файлов с сообщением" (2 опции)
- `git commit -m "msg"` → ✅ "коммит с сообщением" (1 опция)

**Process:**

```typescript
.energy<{
  channel: BroadcastChannel
}>()
.processes((process) => [
  process("определение операции")
    .action(async ({ energy, field, mass, self, signal, value }) => {
      const mod = await import("./actions/detectOperation.ts")
      return mod.default({ energy, field, mass, self, signal, value })
    })
    .success(({ update, data }) => update(data))
    .error(({ update, error }) => update({ error: error.message })),
  process("выполнение")
    .action(async () => {
      const mod = await import("./actions/execute.ts")
      return mod.default()
    })
    .success(({ update }) => update({ operation: null })),
])
```

---

## Жизненный цикл process

**Порядок выполнения:**

```text
1. Вход в состояние
   ↓
2. action() → import("...") → return data ИЛИ throw error
   ↓
3. success() ИЛИ error() → update() → поля обновлены
   ↓
4. measurement() → проверка триггеров по полям
   ↓
5. Переход в следующее состояние (если триггер сработал)
```

**Важно:**

- ✅ **Триггеры проверяются ПОСЛЕ завершения process** (после success/error)
- ✅ **Поля могут обновляться в process**, но переход произойдёт только после завершения
- ❌ **Во время выполнения action** триггеры НЕ проверяются

**Пример:**

```typescript
.processes((process) => [
  process("загрузка")
    .action(async ({ energy, field, mass, self, signal, value }) => {
      const mod = await import("./actions/fetchData.ts")
      return mod.default({ energy, field, mass, self, signal, value })
    })
    .success(({ update, data }) => {
      update({ data })  // Финальное обновление
      // ✅ Теперь проверятся триггеры
    }),
])
```

**Принцип:** Process — атомарная операция. Все обновления полей внутри process накапливаются, и только после завершения (success/error) проверяются триггеры переходов.

---

## Mass — изменяемый рабочий материал

```typescript
.mass((mass) => ({
  profiles: {} as Record<string, { id: string }>,
  attempts: 0,
}))
```

Mass содержит только сериализуемые данные и материал, которые Process читает и
изменяет: примитивы, массивы, чистые object-значения, payload, диагностику и
адреса файлов. В Mass нельзя помещать `Map`, `Set`, функции, фабрики,
`MediaStream`, track, `RTCDataChannel`, socket, peer connection, decoder или
другие runtime handles. Живые сущности относятся к Energy.

Mass принадлежит Energy, но её целевое хранилище находится на filesystem и
сохраняет версии. Она не передаётся через Force/Boundary/Matrix. Storage identity
нельзя выводить только из Atom ID: прямые Matter aliases могут разделять один
Mass-object между несколькими Atom.

Если нет сложных данных:

```typescript
.mass(() => ({}))
```

---

## Energy — живые runtime-сущности

```typescript
.energy<{
  channel: BroadcastChannel
  socket: WebSocket
  mediaStream: MediaStream
  dataChannel: RTCDataChannel
}>()
```

Energy declaration задаёт только постоянные TypeScript-типы сущностей. Generic
не существует в JavaScript, поэтому DSL не создаёт фиктивный объект и не
хранит `null` вместо живых сущностей. Реальный `BroadcastChannel` или
`WebSocket` создаётся action-модулем, помещается в `energy` процессом и
освобождается `destroy`-процессом.

В типе `.energy<EnergyType>()` запрещены:

- функции и фабрики;
- `new WebSocket(...)`, `new BroadcastChannel(...)` и другие side effects;
- `fetch`, чтение файлов и установление соединений;
- nullable union вроде `WebSocket | null`, скрывающий lifecycle-ошибку.

Если Energy не нужна, секция всё равно остаётся обязательной:

```typescript
.energy()
```

---

## Практический Browser Atom

Минимальный Browser Atom не имеет команды «запустить браузер». Его endpoint
изменяет Fields:

1. `profileAddress` получает адрес сохранённого профиля;
2. Process `подготовка WebRTC` рождает минимальный Bun signaling endpoint;
3. Process `запуск браузера` напрямую использует библиотеки Capsule и запускает
   сохранённый профиль без HTTP lifecycle API;
4. Process `подключение к браузеру` использует server-side `werift` и помещает
   endpoint, session, `MediaStream`, video track, `RTCDataChannel`, peer,
   decoder и очередь управления только в Energy;
5. состояние `браузер готов` условно materialize соседние дочерние Meta-пакеты
   `screenshot` и `control`, передавая им прямые Field-, Mass- и
   Energy-bindings;
6. `screenshotPath` разрешает дочерний цикл `ожидание снимка → создание снимка
   → ожидание снимка`; success записывает PNG, сохраняет `lastScreenshotPath` и
   очищает shared `screenshotPath`;
7. `controlCommand` разрешает дочерний цикл `ожидание команды → отправка
   команды → ожидание команды`; success сохраняет сериализуемый результат и
   очищает shared `controlCommand`.

Если несколько независимых намерений должны начаться в одном такте, endpoint
передаёт их одним Gluon в `value.fields`. Boundary фиксирует такой patch одним
canonical `ts`, а Matrix разрешает все подходящие переходы параллельно. Нельзя
добавлять искусственный `sequence` между Screenshot и Control или ждать
завершения одного Process перед запуском другого.

Корневой `meta.ts`, `browser/meta.ts`, `screenshot/meta.ts` и
`control/meta.ts` являются отдельными Meta-пакетами Atom. Их каталоги лежат
рядом в одном репозитории; Matter topology не повторяется в файловом пути.

```typescript
// browser/meta.ts
.superposition({
  "ожидание профиля": {"подготовка WebRTC": {profileAddress: {null: false}}},
  "подготовка WebRTC": {"запуск браузера": {rtcEndpoint: {null: false}}},
  "запуск браузера": {"подключение к браузеру": {instanceId: {null: false}}},
  "подключение к браузеру": {"браузер готов": {rtcConnected: {eq: true}}},
  "браузер готов": {"остановка": {stopRequested: {eq: true}}},
  "остановка": {"остановлен": {}},
  "остановлен": null,
})
.matter(({state, value, mass, energy, html}) => html`
  ${state === "браузер готов" && html`
    <meta-for
      src="owner/capsule/screenshot"
      fields=${{path: value.screenshotPath, lastPath: value.lastScreenshotPath}}
      mass=${mass}
      energy=${energy} />
  `}
  ${state === "браузер готов" && html`
    <meta-for
      src="owner/capsule/control"
      fields=${{command: value.controlCommand, result: value.controlResult}}
      mass=${mass}
      energy=${energy} />
  `}
`)
```

Каждый Process по-прежнему использует только тонкий wrapper `dynamic import →
direct return`. `.mass()` задаёт сериализуемый типовой контракт, но runtime не
гидратирует его placeholder автоматически: первый owning action создаёт рабочий
Mass-object в Energy store. Текущий in-memory adapter должен быть заменён
filesystem-backed versioned store без изменения DSL. Дочерние прямые `mass=${mass}` и
`energy=${energy}` сохраняют identity. Исходный путь Meta-пакета не задаёт
runtime-вложенность; граф задаёт Matter. Постоянный WebRTC listener остаётся в
Energy между тактами: возвращение Screenshot/Control Atom в ожидание не
переподключает socket, peer или DataChannel и не создаёт окно потери сообщения.

---

## Processes — process(state, action/success/error) destroy(state)

**Параметры process:**

| Параметр | Описание                                          |
| -------- | ------------------------------------------------- |
| `field`  | **Fields** — типизированные декларации полей      |
| `value`  | **Значения полей** — текущие данные атома         |
| `mass`   | **Mass** — изменяемый рабочий материал            |
| `energy` | **Energy** — живые runtime-сущности               |
| `signal` | **AbortSignal** — остановка старого execution     |
| `self`   | **Идентификатор** — полный путь к атому           |

**Принцип:**

- **field** — декларация поля (схема, тип, валидатор). Определяется в `.fields()`. Доступно в `process.action({ field })`.
- **value** — значение поля (текущие данные). Доступно в `process.action({ value })`.

**Важно:** Действия процессов выносятся в отдельные ESM-модули.

### Структура action-модуля

```typescript
// actions/fetchUser.ts
import type { ActionParams } from "@metafor/types/metafor/action"
import type { FieldType } from "@metafor/types/metafor/fields"

export interface FetchUserResult {
  name: string
  email: string
}

type FetchUserFields = { id: FieldType<"number", true, number> }
type FetchUserValue = { id: number }
type FetchUserMass = { cache: Map<number, FetchUserResult> }
type FetchUserEnergy = { client: { get(url: string): Promise<Response> } }

export default async function action({
  field,
  value,
  mass,
  energy,
  signal,
}: ActionParams<FetchUserFields, FetchUserMass, FetchUserValue, FetchUserEnergy>): Promise<FetchUserResult> {
  // field.id — декларация поля (схема)
  // value.id — значение поля (данные)
  // mass — изменяемый рабочий материал
  // energy — живые сущности текущего Energy runtime
  const res = await fetch(`/api/users/${value.id}`, {signal})
  return await res.json()
}
```

**Параметры action:**

| Параметр | Описание                                                      |
| -------- | ------------------------------------------------------------- |
| `field`  | **Декларация полей** — схема, тип, валидатор (из `.fields()`) |
| `value`  | **Значения полей** — текущие данные атома                     |
| `mass`   | **Mass** — изменяемый рабочий материал                        |
| `energy` | **Energy** — живые runtime-сущности                           |
| `signal` | **AbortSignal** — cooperative остановка execution             |
| `self`   | **Идентификатор** — полный путь к атому                       |

**Принцип:**

- **field** — декларация поля (схема, тип, валидатор)
- **value** — значение поля (текущие данные)

**Правила:**

1. **Первая и единственная подготовительная инструкция:** `await import("...")`
2. **Следующая и последняя инструкция:** direct `return` вызова export этого модуля
3. **Любое имя экспорта:** `default`, `action`, `process`, `load`, `run`, `execute`

Между `import` и `return` нельзя объявлять промежуточные вычисления, менять
`mass`/`energy` или выполнять cleanup. Runtime-валидатор отклоняет такой mixed
wrapper. В аргументах внешнего вызова разрешено только декларативное wiring
готовых значений: никаких spread/iterator, вложенных вызовов, присваиваний,
coercion/operators, `new`, `await` или других side effects. Сигнатура wrapper — только простая
деструктуризация имён без default/rest. Вся исполняемая логика принадлежит
импортированному модулю. Computed keys/access и глобальные значения также не
входят в wiring: используются только параметры wrapper, их прямые свойства,
object-поля и примитивные литералы.

### Пример в meta.ts

```typescript
.processes((process, destroy) => [
  process("loading", { label: "Загрузка", env: ["browser", "node"] })
    .action(async ({ energy, field, mass, self, signal, value }) => {
      const mod = await import("./actions/fetchUser.ts")
      return mod.default({ energy, field, mass, self, signal, value })
    })
    .success(({ update, data }) => update({ name: data.name }))
    .error(({ update, error }) => update({ error: error.message })),
])
```

**Примечание:** `success` и `error` обработчики остаются inline в DSL. Только `action` выносится в отдельный модуль.

`destroy` также не содержит cleanup-логику внутри декларации. Он динамически
импортирует отдельный модуль, которому передаются раздельные `energy` и `mass`:

```typescript
destroy("остановка", { env: ["server"] }).before(async ({ energy, mass }) => {
  const mod = await import("./actions/release.ts")
  return mod.default({ energy, mass })
})
```

После `before` Energy runtime удаляет набор живых сущностей этого Atom. Mass
имеет отдельное хранилище и отдельный lifecycle.

**Параметры process:**

| Параметр | Тип              | Описание                                                                 |
| -------- | ---------------- | ------------------------------------------------------------------------ |
| `label`  | `string`         | Название процесса для документации                                       |
| `desc`   | `string`         | Описание процесса для документации                                       |
| `env`    | `ExecutionEnv[]` | Среды исполнения: `"browser"`, `"node"`, `"worker"`, `"server"`, `"any"` |

**Примеры env:**

```typescript
// Только браузер
process("loading", { env: ["browser"] })

// Браузер и NodeType.js
process("loading", { env: ["browser", "node"] })

// Любая среда
process("loading", { env: ["any"] })
```

**Типизация возвращаемого значения:**

```typescript
// meta.ts: wrapper только передаёт точные типы внешнему модулю
.action(async ({ energy, field, mass, self, signal, value }) => {
  const mod = await import("./actions/getGroup.ts")
  return mod.default({ energy, field, mass, self, signal, value })
})
```

```typescript
// actions/getGroup.ts: результат выводится из точного типа Value
type GroupValue = {
  group: "start" | "work" | "examine" | null
}
type GroupParams = {
  field: Record<string, unknown>
  value: GroupValue
  mass: Record<string, never>
  energy: Record<string, never>
  signal: AbortSignal
  self: { atom: string; meta: string; path: string }
}

export default async function action({
  value,
}: GroupParams): Promise<{ group: NonNullable<GroupValue["group"]> }> {
  const group = await detectGroup()
  return { group }
}

// ❌ Не хардкодить строковый литерал
return { group: group as "start" }
```

Если процессов нет:

```typescript
.processes((process, destroy) => [])
```

---

## Reactions — события других атомов

```typescript
.reactions((reaction) => [
  [["idle", "loading"], reaction({ label: "Обработка" })
    .filter({ meta: "child", op: "replace", path: "/fields" })
    .equal(({ update, patch }) => update({ value: patch.value }))],
])
```

**Фильтры:** `meta`, `op` (add|replace|remove|test), `path` (/\|/fields\|/state), `value`

Если реакций нет:

```typescript
.reactions((reaction) => [])
```

---

## Matter — иерархия и runtime bindings атомов

```typescript
.matter(({ state, value, mass, energy, html }) => html`
  <meta-for
    src="owner/project/${value.operation}"
    fields=${{ command: value.command, args: value.args }}
    mass=${{ cache: mass.cache }}
    energy=${{ socket: energy.socket }} />
  ${state === "ошибка" && html`
    <meta-for
      src="owner/project/error"
      fields=${{ message: value.error }} />
  `}
`)
.bulk({
  view: ({ css }) => css`.container { padding: 1rem; }`,
})
```

**Правила:**

- Matter описывает только иерархию атомов, а не локальную HTML-разметку
- Теги `<meta-for>` самозакрывающиеся: `<meta-for src="..." />`
- Поля передаются через атрибут `fields={{ ... }}`
- Точная прямая передача ordinary scalar Field, например
  `fields=${{ path: value.screenshotPath }}`, создаёт shared canonical Value:
  ребёнок, родитель и другие связанные siblings изменяют одну величину
- Любое вычисление (`+`, template, condition, несколько dependencies) создаёт
  независимый дочерний Field; одинаковые текущие значения сами по себе Fields
  не связывают
- `enum` и `array` являются topology Fields и в entanglement не участвуют
- Рабочая Mass передаётся отдельно через `mass=${...}`, живые Energy-сущности —
  через `energy=${...}`
- Для передачи всего родительского store используй `mass=${mass}` или
  `energy=${energy}`; это exact-reference alias внутри одного Energy runtime
- `mass` binding может зависеть только от `mass`, а `energy` binding — только от
  `energy`; не смешивай домены и не помещай в binding функции, `new`, I/O или
  создание соединений
- Для Mass/Energy в SQLite фиксируются только `massBinding` и `energyBinding`
  descriptors; значения и живые объекты остаются в локальных Energy stores
- Для прямого Field binding Boundary отдельно фиксирует source relation и общий
  Value identity. Это canonical Field data, а не Mass/Energy object
- `fields` expression materialized Matter edge можно заменить на лету:
  Boundary перестраивает source/value relation, Graviton переносит новый Atom
  projection, а Matrix заново готовит shared CPU/GPU layout до следующего такта
- Установленный binding не вычисляется на каждом claim; его инвалидирует
  Graviton, изменивший Matter continuation ребёнка или отношение Atom/Topology
  к owning parent
- Если dependency ещё не создана, дочерний Process не claim-ится до следующего
  релевантного trigger
- Если fields === null, ничего не рендерится
- Ошибки отображаются через отдельный атом
- В сериализованном matter допустимы только topology-узлы: `meta`, `log`, `cond`, `map`
- `&&` и тернарный `? :` допустимы только если их basis — `state` или `enum`
- `map()` в matter допустим только по `array`-полю topology
- Динамический `src` допустим только если он зависит от одного статического `enum`-поля
- Если dynamic `src` уже зависит от `enum`, не оборачивай его в `value.mode && ...`: direct `<meta-for src="...${value.mode}" />` достаточно, `null` не должен материализовать атом `...-null`
- Не поднимай в topology branch-choice по `boolean`, `string`, `number` или `mass`
- Не рендери в matter `div`, `span`, `button`, текст и прочие HTML-элементы — это не атомы

Пример обратной записи без отдельного RPC:

```typescript
// Родитель
.matter(({ value, html }) => html`
  <meta-for
    src="zavx0z/capsule/screenshot"
    fields=${{ path: value.screenshotPath }} />
`)

// Дочерний Process после записи файла
.success(({ update }) => update({ path: null }))
```

`path` ребёнка и `screenshotPath` родителя — одна каноническая величина.
Очистка ребёнком очищает родителя и разрешает переходы всех Atom, читающих эту
величину, в одном параллельном time step. Если написать
`path: value.screenshotPath + ""`, это уже computed-copy без обратной связи.

**Topology-семантика в matter:**

```typescript
.matter(({ state, value, html }) => html`
  ${state === "готово" && html`<meta-for src="zavx0z/project/panel" />`}
  ${state === "загрузка"
    ? html`<meta-for src="zavx0z/project/spinner" />`
    : html`<meta-for src="zavx0z/project/content" />`}
  <meta-for src="owner/project/${value.mode}" />
  ${value.mode === "card"
    ? html`<meta-for src="zavx0z/project/card" />`
    : html`<meta-for src="zavx0z/project/table" />`}
`)

// ❌ Нельзя: boolean не является topology basis
.matter(({ value, html }) => html`
  ${value.enabled ? html`<meta-for src="owner/project/x" />` : html`<meta-for src="owner/project/y" />`}
`)

// ❌ Нельзя: mass не является topology basis
.matter(({ mass, html }) => html`
  ${mass.session ? html`<meta-for src="owner/project/x" />` : html`<meta-for src="owner/project/y" />`}
`)

// ❌ Нельзя: optional enum не нужно проверять через truthy/null guard
.matter(({ value, html }) => html`
  ${value.mode && html`<meta-for src="owner/project/${value.mode}" />`}
`)

// ❌ Нельзя: HTML belongs to Bulk, not matter
.matter(({ value, html }) => html`
  <div>${value.title}</div>
`)
```

---

## Пример атома

```typescript
export default MetaFor("git")
  .fields((field) => ({
    operation: field.enum("start", "work", "examine").optional({ label: "Тип операции" }),
    error: field.string.optional({ label: "Ошибка" }),
    command: field.string.optional({ label: "Команда" }),
    args: field.string.optional({ label: "Аргументы" }),
  }))
  .superposition({
    "получение команды": {
      "определение операции": { command: { null: false } },
    },
    "определение операции": {
      "выполнение": { operation: { null: false } },
      "ошибка": { error: { null: false } },
    },
    "выполнение": {
      "получение команды": { operation: null },
    },
    "ошибка": {
      "получение команды": { error: null },
    },
  })
  .mass((mass) => ({attempts: mass.json()}))
  .energy()
  .processes((process) => [
    process("определение операции")
      .action(async ({ energy, field, mass, self, signal, value }) => {
        const mod = await import("./actions/detectOperation.ts")
        return mod.default({ energy, field, mass, self, signal, value })
      })
      .success(({ update, data }) => update(data))
      .error(({ update, error }) => update({ error: error.message })),
    process("выполнение")
      .action(async () => {
        const mod = await import("./actions/execute.ts")
        return mod.default()
      })
      .success(({ update }) => update({ operation: null })),
  ])
  .reactions(() => [])
  .matter(({ state, value, html }) => html`
    <meta-for src="owner/project/${value.operation}" fields=${{ command: value.command }} />
    ${state === "ошибка" && html`
      <meta-for src="owner/project/error" fields=${{ message: value.error }} />
    `}
  `)
  .bulk()
```

### Пример action-модуля: detectOperation.ts

```typescript
// actions/detectOperation.ts
import type { ActionParams } from "@metafor/types/metafor/action"
import type { FieldType } from "@metafor/types/metafor/fields"

interface DetectOperationValue {
  command?: string | null
}

interface DetectOperationResult {
  operation: "start" | "work" | "examine"
}

type GitFields = {
  operation: FieldType<"enum", false, undefined, readonly ["start", "work", "examine"]>
  error: FieldType<"string">
  command: FieldType<"string">
  args: FieldType<"string">
}
type GitValue = {
  operation: "start" | "work" | "examine" | null
  error: string | null
  command: string | null
  args: string | null
}
type GitMass = { attempts: number }
type GitEnergy = Record<never, never>

export default async function action({
  mass,
  energy,
  value,
}: ActionParams<GitFields, GitMass, GitValue, GitEnergy>): Promise<DetectOperationResult> {
  const command = value.command?.split(" ")[0]
  if (!command) throw new Error("Команда не указана")

  const patterns = {
    start: /^(clone|init)$/,
    work: /^(add|mv|restore)$/,
    examine: /^(show|status|diff)$/,
  } as const
  for (const [key, regex] of Object.entries(patterns)) {
    if (regex.test(command)) {
      return { operation: key as "start" | "work" | "examine" }
    }
  }
  
  throw new Error(`Неизвестная команда: ${command}`)
}
```

---

## Соглашения

1. Файл: `<username>/<name>/meta.ts` (например: `owner/project/meta.ts`)
2. Имя: `MetaFor("<name>")`
3. Enum: всегда с `label`
4. Импорт в `meta.ts` не нужен: `MetaFor` предоставляет DSL-среда
5. Bulk: только `<meta-for>` для иерархии атомов
6. Цепочка: все методы обязательны (даже пустые)
7. **Action-модули:** логика действий в отдельных файлах `actions/*.ts`
8. **Структура action:** `import("...")` + `return`
9. **Работа запускается Fields:** значение Field разрешает переход и Process
10. **Без самопереходов:** цикл всегда проходит через другое состояние
11. **Mass сериализуема:** все живые handles находятся только в Energy

---

## Декларация в MetaFor, исполнение в модулях

**Нельзя:**

```typescript
// ❌ Вне MetaFor
const PATTERNS = { start: /^(clone|init)$/ }
function getGroup(cmd) { ... }

export default MetaFor("git")...
```

**Можно:**

```typescript
// ✅ В MetaFor только данные Mass и типы Energy
export default MetaFor("git")
  .mass((mass) => ({
    attempts: 0,
  }))
  .energy<{
    socket: WebSocket
  }>()
  .processes((process) => [
    process("определение операции")
      .action(async ({ energy, field, mass, self, signal, value }) => {
        const mod = await import("./actions/detectOperation.ts")
        return mod.default({ energy, field, mass, self, signal, value })
      })
      .success(({ update, data }) => update(data))
  ])
```

**Правило:** `.fields()` и `.mass()` содержат декларативные данные, а
`.energy<EnergyType>()` — только TypeScript-типы. Любые функции, алгоритмы,
подключения, паттерны исполнения и cleanup живут только в отдельных
action-модулях. Inline callback процесса является тонким wrapper:
`import("...")` и `return`.
Его аргументы только передают готовые значения и не исполняют логику.

**Action-модули:**

- Выносите логику действий в отдельные файлы: `actions/*.ts`
- Каждый модуль экспортирует функцию по умолчанию или именованную
- Модуль импортируется динамически: `await import("./actions/...")`

---

## Cluster, Galaxy и Atom-репозитории

Физический корень внешних Meta называется `cluster/`. Он содержит Galaxy —
каталоги GitHub-владельцев. Репозиторий владельца является корневым Atom и
корневым Meta-пакетом; его `meta.ts` находится непосредственно в корне.
Внутренние Meta-пакеты Atom лежат рядом друг с другом внутри того же
репозитория. Дополнительных каталогов `galaxy/`, `atom/`, `metas/` и вложенных
Git-репозиториев нет.

**Локальная структура:**

```text
cluster/
└── owner/                 # Galaxy: GitHub-владелец
    └── project/           # корневой Atom и Git-репозиторий
        ├── meta.ts        # src: owner/project
        ├── start/
        │   └── meta.ts    # src: owner/project/start
        └── work/
            └── meta.ts    # src: owner/project/work
```

Корневой Atom создаётся командой `create-metafor <repository> --dir
cluster/<owner>` и получает собственный Git. Внутренний Atom создаётся командой
`create-metafor <meta-package> --dir cluster/<owner>/<repository>` без
вложенного `git init`, commit и отдельного install.

**Пути в `src`:**

- корневой Atom: `<owner>/<repository>`;
- внутренний Atom: `<owner>/<repository>/<meta-package>`.

Префикс `cluster/` в `src` не входит. Source-путь идентифицирует Meta-пакет, но
не кодирует runtime parent chain: один внутренний Meta-пакет можно materialize
у разных родителей и на любой глубине без копирования каталога.

WIMP `src` не равен npm-имени. Корневой пакет может называться
`@owner/project`, а внутренний `owner/project/start` — `@owner/project-start`.
Имя `@owner/project/start` невалидно как `package.json.name`, потому что npm
допускает только форму `@scope/package`.

Если выбор репозитория зависит от topology, basis должен быть только `state` или `enum`.

```typescript
.matter(({ value, html }) => html`
  ${value.operation === "start" && html`
    <meta-for src="owner/project/start" fields=${{ command: value.command, args: value.args }} />
  `}
  ${value.operation === "work" && html`
    <meta-for src="owner/project/work" fields=${{ command: value.command, args: value.args }} />
  `}
`)
.bulk()
```

**Корневой Meta-пакет использует внутренние пакеты:**

```typescript
// owner/project/meta.ts
export default MetaFor("git")
  .fields((field) => ({
    operation: field.enum("start", "work").optional({ label: "Тип операции" }),
    command: field.string.optional({ label: "Команда" }),
    args: field.string.optional({ label: "Аргументы" }),
  }))
  .superposition({
    "получение команды": {
      "определение операции": { command: { null: false } },
    },
    "определение операции": {
      "выполнение": { operation: { null: false } },
      "ошибка": { error: { null: false } },
    },
    "выполнение": {
      "получение команды": { operation: null },
    },
    "ошибка": {
      "получение команды": { error: null },
    },
  })
  .mass((mass) => ({attempts: mass.json()}))
  .energy()
  .processes((process) => [
    process("определение операции")
      .action(async ({ energy, field, mass, self, signal, value }) => {
        const mod = await import("./actions/detectOperation.ts")
        return mod.default({ energy, field, mass, self, signal, value })
      })
      .success(({ update, data }) => update(data))
      .error(({ update, error }) => update({ error: error.message })),
    process("выполнение")
      .action(async () => {
        const mod = await import("./actions/execute.ts")
        return mod.default()
      })
      .success(({ update }) => update({ operation: null })),
  ])
  .reactions(() => [])
  .matter(({ value, html }) => html`
    ${value.operation === "start" && html`
      <meta-for src="owner/project/start" fields=${{ command: value.command, args: value.args }} />
    `}
    ${value.operation === "work" && html`
      <meta-for src="owner/project/work" fields=${{ command: value.command, args: value.args }} />
    `}
  `)
  .bulk()
```

### Пример action-модуля в репозитории

```typescript
// actions/detectOperation.ts
import type { ActionParams } from "@metafor/types/metafor/action"
import type { FieldType } from "@metafor/types/metafor/fields"

interface DetectOperationValue {
  command?: string | null
}

interface DetectOperationResult {
  operation: "start" | "work"
}

type GitFields = {
  operation: FieldType<"enum", false, undefined, readonly ["start", "work"]>
  command: FieldType<"string">
  args: FieldType<"string">
}
type GitValue = {
  operation: "start" | "work" | null
  command: string | null
  args: string | null
}
type GitMass = { attempts: number }
type GitEnergy = Record<never, never>

export default async function action({
  mass,
  energy,
  field,
  value,
}: ActionParams<GitFields, GitMass, GitValue, GitEnergy>): Promise<DetectOperationResult> {
  // field — декларация полей (схема)
  // value — значения полей (данные)
  const command = value.command?.split(" ")[0]
  if (!command) throw new Error("Команда не указана")

  const patterns = {
    start: /^(clone|init)$/,
    work: /^(add|mv|restore)$/,
  } as const
  for (const [key, regex] of Object.entries(patterns)) {
    if (regex.test(command)) {
      return { operation: key as "start" | "work" }
    }
  }

  throw new Error(`Неизвестная команда: ${command}`)
}
```
