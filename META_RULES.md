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
  tags: t.array.required(["default"]),
}))
```

**Правила:**

- Только примитивы: `string`, `number`, `boolean`, `enum`, `array`
- Объекты — в `core`
- `.optional({ label: "..." })` — метаданные для enum

---

## States — граф переходов

```typescript
.states({
  ожидание: { загрузка: { userId: { gt: 0 } } },
  загрузка: { успех: {}, ошибка: {} },
  успех: { ожидание: { ready: null } },
})
```

**Условия:** `eq`, `gt`, `gte`, `lt`, `lte`, `between`, `startsWith`, `include`, `pattern`, `length`, `includes`, `isEmpty`

**Переход по значению:**

```typescript
// Для проверки на null
состояние: { ожидание: { cmd: null } }
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
