# Правила создания meta.ts

## Структура

```typescript
import "@metafor/meta"

export default MetaFor("<name>")
  .context((t) => ({ /* поля */ }))
  .states({ /* граф переходов */ })
  .mass(() => ({}))
  .processes(() => ({}))
  .reactions(() => [])
  .bulk({ gravity: ({ state, context, html }) => html`...` })
```

**Порядок вызовов:** `context → states → mass → processes → reactions → view`

---

## Context — только примитивы

```typescript
.context((t) => ({
  name: t.string.required("Гость"),
  age: t.number.required(18)({ label: "Возраст" }),
  status: t.enum("draft", "published").optional({ label: "Статус" }),
  tags: t.array.required<string>([], { label: "Теги" }),
}))
```

**Правила:**

- Только примитивы: `string`, `number`, `boolean`, `enum`, `array`
- Объекты — в `mass`
- `.optional({ label: "..." })` — метаданные для enum
- **Для array всегда указывай дженерик:** `t.array.required<string>([])`
- **Label всегда на русском:** `label: "Сообщение (-m)"`, `label: "Все файлы (-a)"`

**Примеры label:**

```typescript
.context((t) => ({
  // ✅ Правильно: русский + опция
  message: t.string.optional({ label: "Сообщение (-m)" }),
  all: t.boolean.optional({ label: "Все файлы (-a)" }),
  amend: t.boolean.optional({ label: "Исправить (--amend)" }),
  
  // ❌ Неправильно: английский
  message: t.string.optional({ label: "Commit message (-m)" }),
  all: t.boolean.optional({ label: "Commit all (-a)" }),
}))
```

---

## States — граф переходов

```typescript
.states({
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
.states({
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
.states({
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
.states({
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
.processes(() => ({
  "определение операции": process()
    .action(({ mass, context }) => ({ operation: operation as NonNullable<typeof context.operation>, command, args }))
    .success(({ update, data }) => update(data))
    .error(({ update, error }) => update({ error: error.message })),
  "выполнение": process()
    .action(() => null)
    .success(({ update }) => update({ operation: null })),
}))
```

---

## Жизненный цикл process

**Порядок выполнения:**

```text
1. Вход в состояние
   ↓
2. action() → return data ИЛИ throw error
   ↓
3. success() ИЛИ error() → update() → контекст обновлён
   ↓
4. measurement() → проверка триггеров по контексту
   ↓
5. Переход в следующее состояние (если триггер сработал)
```

**Важно:**

- ✅ **Триггеры проверяются ПОСЛЕ завершения process** (после success/error)
- ✅ **Контекст может обновляться в process**, но переход произойдёт только после завершения
- ❌ **Во время выполнения action** триггеры НЕ проверяются

**Пример:**

```typescript
.processes(() => ({
  "загрузка": process()
    .action(async ({ context, update }) => {
      // ❌ Триггеры НЕ проверятся до завершения process
      update({ status: "loading" })  // Промежуточное обновление
      const data = await fetch(...)
      update({ status: "success" })  // Ещё одно обновление
      return { data }
    })
    .success(({ update, data }) => {
      update({ data })  // Финальное обновление
      // ✅ Теперь проверятся триггеры
    }),
}))
```

**Принцип:** Process — атомарная операция. Все обновления контекста внутри process накапливаются, и только после завершения (success/error) проверяются триггеры переходов.

---

## Mass — сложные данные

```typescript
.mass(() => ({
  users: new Map(),
  socket: null as WebSocket | null,
}))
```

Если нет сложных данных:

```typescript
.mass(() => ({}))
```

---

## Processes — action/success/error

```typescript
.processes(() => ({
  loading: process({ label: "Загрузка" })
    .action(async ({ context, mass }) => {
      const res = await fetch(`/api/${context.id}`)
      return await res.json()
    })
    .success(({ update, data }) => update({ name: data.name }))
    .error(({ update, error }) => update({ error: error.message })),
}))
```

**Типизация возвращаемого значения:**

```typescript
// ✅ Через NonNullable<typeof context.field>
.action(({ context }) => {
  const group = getGroup(mass.command)
  return { group: group as NonNullable<typeof context.group> }
})

// ❌ Не хардкодить строковый литерал
return { group: group as "start" | "work" | "examine" }
```

Если процессов нет:

```typescript
.processes(() => ({}))
```

---

## Reactions — события других атомов

```typescript
.reactions(() => [
  [["idle", "loading"], reaction({ label: "Обработка" })
    .filter({ meta: "child", op: "replace", path: "/context" })
    .equal(({ update, patch }) => update({ value: patch.value }))],
])
```

**Фильтры:** `meta`, `op` (add|replace|remove|test), `path` (/\|/context\|/state), `value`

Если реакций нет:

```typescript
.reactions(() => [])
```

---

## View — иерархия акторов

```typescript
.bulk({
  gravity: ({ context, html }) => html`
    ${context.operation && html`
      <meta-for
        src="zavx0z/git-${context.operation}"
        context=${{ command: context.command, args: context.args }} />
    `}
    ${context.error && html`
      <meta-for
        src="zavx0z/git-error"
        context=${{ message: context.error }} />
    `}
  `,
  view: ({ css }) => css`.container { padding: 1rem; }`,
})
```

**Правила:**

- Теги `<meta-for>` самозакрывающиеся: `<meta-for src="..." />`
- Контекст передаётся через атрибут `context={{ ... }}`
- Если context === null, ничего не рендерится
- Ошибки отображаются через отдельный актор
- Пути динамические: `src="zavx0z/git-${context.operation}"`

---

## Пример: git enum

```typescript
import "@metafor/meta"

export default MetaFor("git")
  .context((t) => ({
    operation: t.enum("start", "work", "examine").optional({ label: "Тип операции" }),
    error: t.string.optional({ label: "Ошибка" }),
    command: t.string.optional({ label: "Команда" }),
    args: t.string.optional({ label: "Аргументы" }),
  }))
  .states({
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
      .action(({ mass, context }) => {
        const command = context.command?.split(" ")[0]
        let operation = null
        for (const [key, regex] of Object.entries(mass.patterns)) {
          if (regex.test(command)) {
            operation = key
            break
          }
        }
        if (!operation) throw new Error(`Неизвестная команда: ${command}`)
        return { operation: operation as NonNullable<typeof context.operation> }
      })
      .success(({ update, data }) => update(data))
      .error(({ update, error }) => update({ error: error.message })),
    "выполнение": process()
      .action(() => null)
      .success(({ update }) => update({ operation: null })),
  }))
  .bulk({
    gravity: ({ context, html }) => html`
      ${context.operation && html`
        <meta-for src="zavx0z/git-${context.operation}" context=${{ command: context.command }} />
      `}
      ${context.error && html`
        <meta-for src="zavx0z/git-error" context=${{ message: context.error }} />
      `}
    `,
  })
```

---

## Соглашения

1. Файл: `<username>/<name>/meta.ts` (например: `zavx0z/git/meta.ts`)
2. Имя: `MetaFor("<name>")`
3. Enum: всегда с `label`
4. Импорт: `import "@metafor/meta"`
5. View: только `<meta-for>` для иерархии акторов
6. Цепочка: все методы обязательны (даже пустые)
7. **Весь код внутри MetaFor** — никаких внешних функций/констант

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
      .action(({ mass, context }) => {
        const command = context.command?.split(" ")[0]
        let operation = null
        for (const [key, regex] of Object.entries(mass.patterns)) {
          if (regex.test(command)) {
            operation = key
            break
          }
        }
        if (!operation) throw new Error(`Неизвестная команда: ${command}`)
        return { operation: operation as NonNullable<typeof context.operation> }
      })
      .success(({ update, data }) => update({ operation: data.operation }))
  }))
```

**Правило:** Все данные, функции, паттерны — только внутри `.mass()`, `.processes()`, `.context()`.

---

## Репозитории и субмодули

Каждая мета — отдельное репозиторий на верхнем уровне `zavx0z/`. Главное репо содержит ссылки на другие репо через префиксы.

**Структура:**

```text
zavx0z/git/              # главное репо
  meta.ts
zavx0z/git-start/        # группа start
  meta.ts
zavx0z/git-start-clone/  # команда clone
  meta.ts
zavx0z/git-start-init/   # команда init
  meta.ts
zavx0z/git-work/         # группа work
  meta.ts
zavx0z/git-work-add/     # команда add
  meta.ts
```

**Преимущества плоской структуры:**

- ✅ Все репо на верхнем уровне — легко найти
- ✅ Полные имена с префиксами — ясно назначение
- ✅ Нет вложенности — можно менять состав без изменения иерархии
- ✅ Префиксы сохраняют группировку — `git-start-*`, `git-work-*`

**Пути в src:**

Путь указывает на репо: `zavx0z/<repo-name>`

```typescript
.bulk({
  gravity: ({ context, html }) => html`
    ${context.operation === "start" && html`<meta-for src="zavx0z/git-start" context=${{ command: context.command, args: context.args }} />`}
    ${context.operation === "work" && html`<meta-for src="zavx0z/git-work" context=${{ command: context.command, args: context.args }} />`}
  `,
})
```

**Главное репо загружает группы:**

```typescript
// zavx0z/git/meta.ts
export default MetaFor("git")
  .context((t) => ({
    operation: t.enum("start", "work").optional({ label: "Тип операции" }),
    command: t.string.optional({ label: "Команда" }),
    args: t.string.optional({ label: "Аргументы" }),
  }))
  .states({
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
      .action(({ mass, context }) => {
        const command = context.command?.split(" ")[0]
        let operation = null
        for (const [key, regex] of Object.entries(mass.patterns)) {
          if (regex.test(command)) {
            operation = key
            break
          }
        }
        if (!operation) throw new Error(`Неизвестная команда: ${command}`)
        return { operation: operation as NonNullable<typeof context.operation> }
      })
      .success(({ update, data }) => update(data))
      .error(({ update, error }) => update({ error: error.message })),
    "выполнение": process()
      .action(() => null)
      .success(({ update }) => update({ operation: null })),
  }))
  .bulk({
    gravity: ({ context, html }) => html`
      ${context.operation === "start" && html`<meta-for src="zavx0z/git-start" context=${{ command: context.command, args: context.args }} />`}
      ${context.operation === "work" && html`<meta-for src="zavx0z/git-work" context=${{ command: context.command, args: context.args }} />`}
    `,
  })
```
