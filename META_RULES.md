# Правила создания meta.ts

## Структура

```typescript
import "@metafor/meta"

export default MetaFor("<name>")
  .brane((field) => ({ /* поля */ }))
  .superposition({ /* граф переходов */ })
  .mass({})
  .processes((process, destroy) => ({}))
  .reactions((reaction) => [])
  .bulk({ gravity: ({ state, value, html }) => html`...`, view: ({css}) => css`...` })
```

**Порядок вызовов:** `brane → superposition → mass → processes → reactions → bulk`

---

## brane — только примитивы

```typescript
.brane((field) => ({
  name: field.string.required("Гость"),
  age: field.number.required(18)({ label: "Возраст" }),
  status: field.enum("draft", "published").optional({ label: "Статус" }),
  tags: field.array.required<string>([], { label: "Теги" }),
}))
```

**Правила:**

- Только примитивы: `string`, `number`, `boolean`, `enum`, `array`
- Объекты — в `mass`
- `.optional({ label: "..." })` — метаданные для enum
- **Для array всегда указывай дженерик:** `field.array.required<string>([])`
- **Label всегда на русском:** `label: "Сообщение (-m)"`, `label: "Все файлы (-a)"`

**Примеры label:**

```typescript
.brane((field) => ({
  // ✅ Правильно: русский + опция
  message: field.string.optional({ label: "Сообщение (-m)" }),
  all: field.boolean.optional({ label: "Все файлы (-a)" }),
  amend: field.boolean.optional({ label: "Исправить (--amend)" }),

  // ❌ Неправильно: английский
  message: field.string.optional({ label: "Commit message (-m)" }),
  all: field.boolean.optional({ label: "Commit all (-a)" }),
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
.processes((process) => ({
  "определение операции": process()
    .action(async ({ mass, value }) => {
      const mod = await import("./actions/detectOperation.ts")
      return mod.default({ mass, value })
    })
    .success(({ update, data }) => update(data))
    .error(({ update, error }) => update({ error: error.message })),
  "выполнение": process()
    .action(async () => {
      const mod = await import("./actions/execute.ts")
      return mod.default()
    })
    .success(({ update }) => update({ operation: null })),
}))
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
.processes((process) => ({
  "загрузка": process()
    .action(async ({ value }) => {
      const mod = await import("./actions/fetchData.ts")
      return mod.default({ value })
    })
    .success(({ update, data }) => {
      update({ data })  // Финальное обновление
      // ✅ Теперь проверятся триггеры
    }),
}))
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

## Processes — process(action/success/error) destroy

**Важно:** Действия процессов выносятся в отдельные ESM-модули.

### Структура action-модуля

```typescript
// actions/fetchUser.ts
import type { ActionParams } from "@metafor/meta"

export interface FetchUserResult {
  name: string
  email: string
}

export default async function action({
  value,
}: ActionParams<{ id: { type: "number" } }, {}>): Promise<FetchUserResult> {
  const res = await fetch(`/api/users/${value.id}`)
  return await res.json()
}
```

**Правила:**

1. **Первая строка:** `import("...")` для загрузки модуля
2. **Последняя строка:** `return` для возврата результата
3. **Любое имя экспорта:** `default`, `action`, `process`, `load`, `run`, `execute`

### Пример в meta.ts

```typescript
.processes((process, destroy) => ({
  loading: process({ label: "Загрузка", env: ["browser", "node"] })
    .action(async ({ value }) => {
      const mod = await import("./actions/fetchUser.ts")
      return mod.default({ value })
    })
    .success(({ update, data }) => update({ name: data.name }))
    .error(({ update, error }) => update({ error: error.message })),
}))
```

**Примечание:** `success` и `error` обработчики остаются inline в DSL. Только `action` выносится в отдельный модуль.

**Параметры process:**

| Параметр | Тип | Описание |
| -------- | --- | -------- |
| `label` | `string` | Название процесса для документации |
| `desc` | `string` | Описание процесса для документации |
| `env` | `ExecutionEnv[]` | Среды исполнения: `"browser"`, `"node"`, `"worker"`, `"server"`, `"any"` |

**Примеры env:**

```typescript
// Только браузер
process({ env: ["browser"] })

// Браузер и Node.js
process({ env: ["browser", "node"] })

// Любая среда
process({ env: ["any"] })
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
.processes((process, destroy) => ({}))
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

## Bulk — иерархия акторов

```typescript
.bulk({
  gravity: ({ value, html }) => html`
    ${value.operation && html`
      <meta-for
        src="zavx0z/git-${value.operation}"
        fields=${{ command: value.command, args: value.args }} />
    `}
    ${value.error && html`
      <meta-for
        src="zavx0z/git-error"
        fields=${{ message: value.error }} />
    `}
  `,
  view: ({ css }) => css`.container { padding: 1rem; }`,
})
```

**Правила:**

- Теги `<meta-for>` самозакрывающиеся: `<meta-for src="..." />`
- Поля передаются через атрибут `fields={{ ... }}`
- Если fields === null, ничего не рендерится
- Ошибки отображаются через отдельный актор
- Пути динамические: `src="zavx0z/git-${value.operation}"`

---

## Пример актора

```typescript
import "@metafor/meta"

export default MetaFor("git")
  .brane((field) => ({
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
  .processes((process) => ({
    "определение операции": process()
      .action(async ({ mass, value }) => {
        const mod = await import("./actions/detectOperation.ts")
        return mod.default({ mass, value })
      })
      .success(({ update, data }) => update(data))
      .error(({ update, error }) => update({ error: error.message })),
    "выполнение": process()
      .action(async () => {
        const mod = await import("./actions/execute.ts")
        return mod.default()
      })
      .success(({ update }) => update({ operation: null })),
  }))
  .bulk({
    gravity: ({ value, html }) => html`
      ${value.operation && html`
        <meta-for src="zavx0z/git-${value.operation}" fields=${{ command: value.command }} />
      `}
      ${value.error && html`
        <meta-for src="zavx0z/git-error" fields=${{ message: value.error }} />
      `}
    `,
  })
```

### Пример action-модуля: detectOperation.ts

```typescript
// actions/detectOperation.ts
import type { ActionParams } from "@metafor/meta"

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
4. Импорт: `import "@metafor/meta"`
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
  .processes((process) => ({
    "определение операции": process()
      .action(async ({ mass, value }) => {
        const mod = await import("./actions/detectOperation.ts")
        return mod.default({ mass, value })
      })
      .success(({ update, data }) => update(data))
  }))
```

**Правило:** Все данные, функции, паттерны — только внутри `.mass()`, `.processes()`, `.brane()` **или в отдельных action-модулях**.

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

Путь указывает на GitHub репо: `<username>/<repo-name>`

```typescript
.bulk({
  gravity: ({ value, html }) => html`
    ${value.operation === "start" && html`
      <meta-for src="zavx0z/git-start" fields=${{ command: value.command, args: value.args }} />
    `}
    ${value.operation === "work" && html`
      <meta-for src="otheruser/git-work" fields=${{ command: value.command, args: value.args }} />
    `}
  `,
})
```

**Главное репо загружает группы:**

```typescript
// zavx0z/git/meta.ts
export default MetaFor("git")
  .brane((field) => ({
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
  .processes((process) => ({
    "определение операции": process()
      .action(async ({ mass, value }) => {
        const mod = await import("./actions/detectOperation.ts")
        return mod.default({ mass, value })
      })
      .success(({ update, data }) => update(data))
      .error(({ update, error }) => update({ error: error.message })),
    "выполнение": process()
      .action(async () => {
        const mod = await import("./actions/execute.ts")
        return mod.default()
      })
      .success(({ update }) => update({ operation: null })),
  }))
  .bulk({
    gravity: ({ value, html }) => html`
      ${value.operation === "start" && html`
        <meta-for src="zavx0z/git-start" fields=${{ command: value.command, args: value.args }} />
      `}
      ${value.operation === "work" && html`
        <meta-for src="otheruser/git-work" fields=${{ command: value.command, args: value.args }} />
      `}
    `,
  })
```

### Пример action-модуля в репозитории

```typescript
// actions/detectOperation.ts
import type { ActionParams } from "@metafor/meta"

interface DetectOperationValue {
  command?: string | null
}

interface DetectOperationResult {
  operation: "start" | "work"
}

export default async function action({
  mass,
  value,
}: ActionParams<{}, { patterns: Record<string, RegExp> }>): Promise<DetectOperationResult> {
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
