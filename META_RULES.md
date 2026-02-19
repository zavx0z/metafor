# Правила создания meta.ts

## Структура

```typescript
import "@metafor/meta"

export default MetaFor("<name>")
  .context((t) => ({ /* поля */ }))
  .states({ /* граф переходов */ })
  .core(() => ({}))
  .processes(() => ({}))
  .reactions(() => [])
  .view({ render: ({ state, context, html }) => html`...` })
```

**Порядок вызовов:** `context → states → core → processes → reactions → view`

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
- Объекты — в `core`
- `.optional({ label: "..." })` — метаданные для enum
- **Для array всегда указывай дженерик:** `t.array.required<string>([])`

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
    "выполнение": { group: { null: false } },  // ✅ Успех (group установлен)
    "ошибка": { error: { null: false } },  // ✅ Ошибка (error установлен)
  },
  "выполнение": {
    "получение команды": { group: null },  // ✅ Завершение выполнения
  },
  "ошибка": {
    "получение команды": { error: null },  // ✅ Сброс ошибки (краткая форма)
  },
})
```

**Process:**

```typescript
.processes(() => ({
  "определение операции": process()
    .action(({ core, context }) => ({ group: group as NonNullable<typeof context.group>, command, args }))
    .success(({ update, data }) => update({ group: data.group, command: data.command, args: data.args }))
    .error(({ update, error }) => update({ error: error.message })),
  "выполнение": process()
    .action(() => null)
    .success(({ update }) => update({ group: null })),
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

## Core — сложные данные

```typescript
.core(() => ({
  users: new Map(),
  socket: null as WebSocket | null,
}))
```

Если нет сложных данных:

```typescript
.core(() => ({}))
```

---

## Processes — action/success/error

```typescript
.processes(() => ({
  loading: process({ label: "Загрузка" })
    .action(async ({ context, core }) => {
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
  const group = getGroup(core.command)
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
.view({
  render: ({ state, context, core, html }) => html`
    ${state === "loading" && html`<meta-for src="zavx0z/spinner"></meta-for>`}
    ${state === "ready" && html`
      <meta-for src="zavx0z/content" context=${{ data: context.value }} core=${{ api: core.api }}></meta-for>
    `}
  `,
  style: ({ css }) => css`.container { padding: 1rem; }`,
})
```

---

## Пример: git enum

```typescript
import "@metafor/meta"

export default MetaFor("git")
  .context((t) => ({
    group: t.enum("start", "work", "examine").optional({ label: "Группа команд" }),
  }))
  .states({ idle: { selected: {} }, selected: { idle: {} } })
  .core(() => ({}))
  .processes(() => ({}))
  .reactions(() => [])
  .view({
    render: ({ context, html }) => html`
      ${context.group === "start" && html`<meta-for src="zavx0z/start"></meta-for>`}
      ${context.group === "work" && html`<meta-for src="zavx0z/work"></meta-for>`}
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
// ✅ Всё внутри .core()
export default MetaFor("git")
  .core({
    patterns: {
      start: /^(clone|init)$/,
      work: /^(add|mv|restore)$/,
    },
  })
  .processes((process) => ({
    ожидание: process()
      .action(({ core }) => {
        // Используем core.patterns внутри
        for (const [key, regex] of Object.entries(core.patterns)) {
          if (regex.test(core.command)) return { group: key }
        }
      })
  }))
```

**Правило:** Все данные, функции, паттерны — только внутри `.core()`, `.processes()`, `.context()`.

---

## Репозитории и субмодули

Каждая мета — отдельное репозиторий. Главное репо содержит субмодули (вложенные мета).

**Структура:**

```text
zavx0z/git/          # главное репо
  meta.ts
zavx0z/start/        # субмодуль
  meta.ts
zavx0z/work/         # субмодуль
  meta.ts
zavx0z/examine/      # субмодуль
  meta.ts
```

**Пути в src:**

Путь указывает на репо: `zavx0z/<repo-name>`

```typescript
.view({
  render: ({ context, html }) => html`
    ${context.group === "start" && html`<meta-for src="zavx0z/start"></meta-for>`}
    ${context.group === "work" && html`<meta-for src="zavx0z/work"></meta-for>`}
  `,
})
```

**Главное репо загружает субмодули:**

```typescript
// zavx0z/git/meta.ts
export default MetaFor("git")
  .context((t) => ({
    group: t.enum("start", "work").optional({ label: "Группа" }),
  }))
  .states({ idle: { selected: {} }, selected: { idle: {} } })
  .core(() => ({}))
  .processes(() => ({}))
  .reactions(() => [])
  .view({
    render: ({ context, html }) => html`
      ${context.group === "start" && html`<meta-for src="zavx0z/start"></meta-for>`}
    `,
  })
```
