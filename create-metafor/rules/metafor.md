# Правила создания meta.ts

## Структура

```typescript
export default MetaFor("<name>")
  .fields((field) => ({}))
  .superposition({})
  .mass({})
  .processes((process, destroy) => [])
  .reactions((reaction) => [])
  .matter(({ state, value, html }) => html``)
  .bulk({
    view: ({ css }) => css``,
  })
```

**Порядок вызовов:** `fields → superposition → mass → processes → reactions → matter → bulk`

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
.processes((process) => [
  process("определение операции")
    .action(async ({ mass, value }) => {
      const mod = await import("./actions/detectOperation.ts")
      return mod.default({ mass, value })
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
    .action(async ({ value }) => {
      const mod = await import("./actions/fetchData.ts")
      return mod.default({ value })
    })
    .success(({ update, data }) => {
      update({ data })  // Финальное обновление
      // ✅ Теперь проверятся триггеры
    }),
])
```

**Принцип:** Process — атомарная операция. Все обновления полей внутри process накапливаются, и только после завершения (success/error) проверяются триггеры переходов.

---

## Mass — сложные данные

```typescript
.mass({
  users: new Map(),
  socket: null as WebSocket | null,
})
```

Если нет сложных данных:

```typescript
.mass({})
```

---

## Processes — process(state, action/success/error) destroy(state)

**Параметры process:**

| Параметр | Описание                                          |
| -------- | ------------------------------------------------- |
| `value`  | **Значения полей** — текущие данные атома         |
| `mass`   | **Масса** — сложные данные и зависимости от среды |
| `self`   | **Идентификатор** — полный путь к атому           |

**Принцип:**

- **field** — декларация поля (схема, тип, валидатор). Определяется в `.fields()`. Доступно в `process.action({ field })`.
- **value** — значение поля (текущие данные). Доступно в `process.action({ value })`.

**Важно:** Действия процессов выносятся в отдельные ESM-модули.

### Структура action-модуля

```typescript
// actions/fetchUser.ts
import type { ActionParams } from "@metafor/types/metafor/action"

export interface FetchUserResult {
  name: string
  email: string
}

export default async function action({
  field,
  value,
}: ActionParams<{ id: { type: "number" } }, {}>): Promise<FetchUserResult> {
  // field.id — декларация поля (схема)
  // value.id — значение поля (данные)
  const res = await fetch(`/api/users/${value.id}`)
  return await res.json()
}
```

**Параметры action:**

| Параметр | Описание                                                      |
| -------- | ------------------------------------------------------------- |
| `field`  | **Декларация полей** — схема, тип, валидатор (из `.fields()`) |
| `value`  | **Значения полей** — текущие данные атома                     |
| `mass`   | **Масса** — сложные данные и зависимости от среды             |
| `self`   | **Идентификатор** — полный путь к атому                       |

**Принцип:**

- **field** — декларация поля (схема, тип, валидатор)
- **value** — значение поля (текущие данные)

**Правила:**

1. **Первая строка:** `import("...")` для загрузки модуля
2. **Последняя строка:** `return` для возврата результата
3. **Любое имя экспорта:** `default`, `action`, `process`, `load`, `run`, `execute`

### Пример в meta.ts

```typescript
.processes((process, destroy) => [
  process("loading", { label: "Загрузка", env: ["browser", "node"] })
    .action(async ({ value }) => {
      const mod = await import("./actions/fetchUser.ts")
      return mod.default({ value })
    })
    .success(({ update, data }) => update({ name: data.name }))
    .error(({ update, error }) => update({ error: error.message })),
])
```

**Примечание:** `success` и `error` обработчики остаются inline в DSL. Только `action` выносится в отдельный модуль.

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
// ✅ Через NonNullable<typeof value.field>
.action(async ({ value }) => {
  const mod = await import("./actions/getGroup.ts")
  const group = mod.default(mass.command)
  return { group: group as NonNullable<typeof value.group> }
})

// ❌ Не хардкодить строковый литерал
return { group: group as "start" | "work" | "examine" }
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

## Matter — иерархия акторов

```typescript
.matter(({ state, value, html }) => html`
  <meta-for
    src="zavx0z/git-${value.operation}"
    fields=${{ command: value.command, args: value.args }} />
  ${state === "ошибка" && html`
    <meta-for
      src="zavx0z/git-error"
      fields=${{ message: value.error }} />
  `}
`)
.bulk({
  view: ({ css }) => css`.container { padding: 1rem; }`,
})
```

**Правила:**

- Matter описывает только иерархию акторов, а не локальную HTML-разметку
- Теги `<meta-for>` самозакрывающиеся: `<meta-for src="..." />`
- Поля передаются через атрибут `fields={{ ... }}`
- Если fields === null, ничего не рендерится
- Ошибки отображаются через отдельный актор
- В сериализованном matter допустимы только topology-узлы: `meta`, `log`, `cond`, `map`
- `&&` и тернарный `? :` допустимы только если их basis — `state` или `enum`
- `map()` в matter допустим только по `array`-полю topology
- Динамический `src` допустим только если он зависит от одного статического `enum`-поля
- Если dynamic `src` уже зависит от `enum`, не оборачивай его в `value.mode && ...`: direct `<meta-for src="...${value.mode}" />` достаточно, `null` не должен материализовать актор `...-null`
- Не поднимай в topology branch-choice по `boolean`, `string`, `number` или `mass`
- Не рендери в matter `div`, `span`, `button`, текст и прочие HTML-элементы — это не акторы

**Topology-семантика в matter:**

```typescript
.matter(({ state, value, html }) => html`
  ${state === "готово" && html`<meta-for src="zavx0z/panel" />`}
  ${state === "загрузка"
    ? html`<meta-for src="zavx0z/spinner" />`
    : html`<meta-for src="zavx0z/content" />`}
  <meta-for src="zavx0z/git-${value.mode}" />
  ${value.mode === "card"
    ? html`<meta-for src="zavx0z/card" />`
    : html`<meta-for src="zavx0z/table" />`}
`)

// ❌ Нельзя: boolean не является topology basis
.matter(({ value, html }) => html`
  ${value.enabled ? html`<meta-for src="x" />` : html`<meta-for src="y" />`}
`)

// ❌ Нельзя: mass не является topology basis
.matter(({ mass, html }) => html`
  ${mass.session ? html`<meta-for src="x" />` : html`<meta-for src="y" />`}
`)

// ❌ Нельзя: optional enum не нужно проверять через truthy/null guard
.matter(({ value, html }) => html`
  ${value.mode && html`<meta-for src="zavx0z/git-${value.mode}" />`}
`)

// ❌ Нельзя: HTML belongs to Bulk, not matter
.matter(({ value, html }) => html`
  <div>${value.title}</div>
`)
```

---

## Пример актора

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
  .mass({
    patterns: {
      start: /^(clone|init)$/,
      work: /^(add|mv|restore)$/,
      examine: /^(show|status|diff)$/,
    },
  })
  .processes((process) => [
    process("определение операции")
      .action(async ({ mass, value }) => {
        const mod = await import("./actions/detectOperation.ts")
        return mod.default({ mass, value })
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
  .matter(({ state, value, html }) => html`
    <meta-for src="zavx0z/git-${value.operation}" fields=${{ command: value.command }} />
    ${state === "ошибка" && html`
      <meta-for src="zavx0z/git-error" fields=${{ message: value.error }} />
    `}
  `)
  .bulk()
```

### Пример action-модуля: detectOperation.ts

```typescript
// actions/detectOperation.ts
import type { ActionParams } from "@metafor/types/metafor/action"

interface DetectOperationValue {
  command?: string | null
}

interface DetectOperationResult {
  operation: "start" | "work" | "examine"
}

export default async function action({
  mass,
  value,
}: ActionParams<{}, { patterns: Record<string, RegExp> }>): Promise<DetectOperationResult> {
  const command = value.command?.split(" ")[0]
  if (!command) throw new Error("Команда не указана")
  
  for (const [key, regex] of Object.entries(mass.patterns)) {
    if (regex.test(command)) {
      return { operation: key as "start" | "work" | "examine" }
    }
  }
  
  throw new Error(`Неизвестная команда: ${command}`)
}
```

---

## Соглашения

1. Файл: `<username>/<name>/meta.ts` (например: `zavx0z/git/meta.ts`)
2. Имя: `MetaFor("<name>")`
3. Enum: всегда с `label`
4. Импорт в `meta.ts` не нужен: `MetaFor` предоставляет DSL-среда
5. Bulk: только `<meta-for>` для иерархии акторов
6. Цепочка: все методы обязательны (даже пустые)
7. **Action-модули:** логика действий в отдельных файлах `actions/*.ts`
8. **Структура action:** `import("...")` + `return`

---

## Весь код внутри MetaFor

**Нельзя:**

```typescript
// ❌ Вне MetaFor
const PATTERNS = { start: /^(clone|init)$/ }
function getGroup(cmd) { ... }

export default MetaFor("git")...
```

**Можно:**

```typescript
// ✅ Всё внутри .mass()
export default MetaFor("git")
  .mass({
    patterns: {
      start: /^(clone|init)$/,
      work: /^(add|mv|restore)$/,
    },
  })
  .processes((process) => [
    process("определение операции")
      .action(async ({ mass, value }) => {
        const mod = await import("./actions/detectOperation.ts")
        return mod.default({ mass, value })
      })
      .success(({ update, data }) => update(data))
  ])
```

**Правило:** Все данные, функции, паттерны — только внутри `.mass()`, `.processes()`, `.fields()` **или в отдельных action-модулях**.

**Action-модули:**

- Выносите логику действий в отдельные файлы: `actions/*.ts`
- Каждый модуль экспортирует функцию по умолчанию или именованную
- Модуль импортируется динамически: `await import("./actions/...")`

---

## Репозитории и субмодули

Каждая мета — отдельный репозиторий на GitHub. Локально все репо хранятся в общей директории `github/`.

**Структура на GitHub:**

```text
github.com/zavx0z/git/              # главное репо
github.com/zavx0z/git-start/        # группа start
github.com/zavx0z/git-start-clone/  # команда clone
github.com/otheruser/git-work/      # группа work от другого пользователя
```

**Локальная структура:**

```text
~/github/
  zavx0z/git/              # главное репо
    meta.ts
  zavx0z/git-start/        # группа start
    meta.ts
  zavx0z/git-start-clone/  # команда clone
    meta.ts
  otheruser/git-work/      # группа work от другого пользователя
    meta.ts
```

**Преимущества распределённой структуры:**

- ✅ Каждый репо независим — можно развивать отдельно
- ✅ Разные авторы — каждый владеет своими мета
- ✅ Нет центральной зависимости — можно использовать любые репо
- ✅ Префиксы сохраняют группировку — `git-start-*`, `git-work-*`
- ✅ Локально все в одном месте — директория `github/`

**Пути в src:**

Хаб — это каноническая адресация meta-сущности вида `owner/path`, которая резолвится в `owner/path/meta.json`.

Путь указывает на GitHub репо: `<username>/<repo-name>`

Если выбор репозитория зависит от topology, basis должен быть только `state` или `enum`.

```typescript
.matter(({ value, html }) => html`
  ${value.operation === "start" && html`
    <meta-for src="zavx0z/git-start" fields=${{ command: value.command, args: value.args }} />
  `}
  ${value.operation === "work" && html`
    <meta-for src="otheruser/git-work" fields=${{ command: value.command, args: value.args }} />
  `}
`)
.bulk()
```

**Главное репо загружает группы:**

```typescript
// zavx0z/git/meta.ts
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
  .mass({
    patterns: {
      start: /^(clone|init)$/,
      work: /^(add|mv|restore)$/,
    },
  })
  .processes((process) => [
    process("определение операции")
      .action(async ({ mass, value }) => {
        const mod = await import("./actions/detectOperation.ts")
        return mod.default({ mass, value })
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
  .matter(({ value, html }) => html`
    ${value.operation === "start" && html`
      <meta-for src="zavx0z/git-start" fields=${{ command: value.command, args: value.args }} />
    `}
    ${value.operation === "work" && html`
      <meta-for src="otheruser/git-work" fields=${{ command: value.command, args: value.args }} />
    `}
  `)
  .bulk()
```

### Пример action-модуля в репозитории

```typescript
// actions/detectOperation.ts
import type { ActionParams } from "@metafor/types/metafor/action"

interface DetectOperationValue {
  command?: string | null
}

interface DetectOperationResult {
  operation: "start" | "work"
}

export default async function action({
  mass,
  field,
  value,
}: ActionParams<{}, { patterns: Record<string, RegExp> }>): Promise<DetectOperationResult> {
  // field — декларация полей (схема)
  // value — значения полей (данные)
  const command = value.command?.split(" ")[0]
  if (!command) throw new Error("Команда не указана")

  for (const [key, regex] of Object.entries(mass.patterns)) {
    if (regex.test(command)) {
      return { operation: key as "start" | "work" }
    }
  }

  throw new Error(`Неизвестная команда: ${command}`)
}
```
