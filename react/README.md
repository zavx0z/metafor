# Реакции

Реакции позволяют реагировать на изменения контекста и состояния в MetaFor. Они предоставляют декларативный способ определения условий и действий.

## API

### Создание реакции

```typescript
reaction({ title: "my_reaction", description: "Описание реакции" })
  .filter({
    /* условия фильтрации */
  })
  .equal(({ update, context, core, meta, patch, state }) => {
    // логика обновления
  })
```

### Параметры reaction()

- `title: string` - обязательное название реакции
- `description?: string` - необязательное описание реакции

### Фильтрация

Фильтр поддерживает декларативные условия для метаданных сообщения и патча:

#### Метаданные сообщения (meta)

- `tag?: CondStringRequired` - фильтрация по тегу сообщения
- `index?: CondNumberRequired` - фильтрация по индексу сообщения
- `timestamp?: CondNumberRequired` - фильтрация по временной метке

#### Патч (patch)

- `op?: "replace" | "add" | "remove" | "test"` - операция патча
- `path?: "/context" | "/state" | "/"` - путь патча
- `value?: any` - значение патча

#### Условия для строк (CondStringRequired)

```typescript
// Простое сравнение
tag: "test"

// Регулярное выражение
tag: /^test_/

// Объект с условиями
tag: {
  eq: "test",                    // равно
  notEq: "other",               // не равно
  startsWith: "test",           // начинается с
  endsWith: "end",              // заканчивается на
  include: "substring",         // содержит подстроку
  notInclude: "bad",            // не содержит подстроку
  notStartsWith: "bad",         // не начинается с
  notEndsWith: "bad",           // не заканчивается на
  pattern: /^test_\d+$/,        // регулярное выражение
  length: 5,                    // точная длина
  length: { min: 3, max: 10 },  // диапазон длины
  between: ["a", "z"]           // между двумя строками
}
```

#### Условия для чисел (CondNumberRequired)

```typescript
// Простое сравнение
index: 5

// Объект с условиями
index: {
  eq: 5,                        // равно
  notEq: 10,                    // не равно
  gt: 0,                        // больше
  gte: 1,                       // больше или равно
  lt: 100,                      // меньше
  lte: 50,                      // меньше или равно
  notGt: 10,                    // не больше
  notGte: 5,                    // не больше или равно
  notLt: 0,                     // не меньше
  notLte: 1,                    // не меньше или равно
  between: [1, 10]              // между двумя числами
}
```

### Примеры

#### Простая фильтрация

```typescript
reaction({ title: "increment" })
  .filter({ tag: "test" })
  .equal(({ update, context }) => {
    update({ value: context.value + 1 })
  })
```

#### Сложная фильтрация

```typescript
reaction({ title: "complex_filter" })
  .filter({
    tag: { startsWith: "user_" },
    index: { gte: 1, lt: 100 },
    op: "replace",
    path: "/context",
  })
  .equal(({ update, context }) => {
    update({ status: "processed" })
  })
```

#### Фильтрация по временным меткам

```typescript
reaction({ title: "recent_activity" })
  .filter({
    timestamp: { gte: Date.now() - 60000 }, // последняя минута
  })
  .equal(({ update }) => {
    update({ lastActivity: Date.now() })
  })
```

#### Комбинированная фильтрация

```typescript
reaction({ title: "specific_update" })
  .filter({
    tag: { include: "user" },
    index: { between: [1, 10] },
    op: "add",
    path: "/context",
    value: { type: "notification" },
  })
  .equal(({ update, context }) => {
    update({ notifications: [...context.notifications, context.value] })
  })
```

## Использование в MetaFor

```typescript
import { MetaFor } from "metafor"

const metafor = new MetaFor({
  context: {
    count: { type: "number", required: true },
  },
  states: {
    idle: {},
    active: {},
  },
  reactions: (reaction) => [
    [
      ["idle", "active"],
      reaction({ title: "increment", description: "Увеличивает счетчик" })
        .filter({ tag: "increment" })
        .equal(({ update, context }) => {
          update({ count: context.count + 1 })
        }),
    ],
  ],
})
```
