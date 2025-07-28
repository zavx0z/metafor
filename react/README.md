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
- `value?: Condition<any> | ConditionOptional<any>` - значение патча с расширенными условиями

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

#### Условия для булевых значений (CondBooleanRequired)

```typescript
// Простое сравнение
value: true

// Объект с условиями
value: {
  eq: true,                     // равно
  notEq: false,                 // не равно
  logicalEq: true               // логическое равенство
}
```

#### Условия для массивов (CondArrayRequired)

```typescript
// Простое сравнение
value: [1, 2, 3]

// Объект с условиями
value: {
  length: 3,                    // точная длина
  length: { min: 1, max: 5 },   // диапазон длины
  includes: "item",             // содержит элемент
  notIncludes: "bad",           // не содержит элемент
  isEmpty: true,                // пустой массив
  every: { gt: 0 },             // все элементы больше 0 (для чисел)
  every: { include: "test" },   // все элементы содержат "test" (для строк)
  some: { lt: 10 },             // хотя бы один элемент меньше 10 (для чисел)
  some: { startsWith: "user" }  // хотя бы один элемент начинается с "user" (для строк)
}
```

#### Условия для значений патча (value)

Система поддерживает все типы значений с расширенными условиями сравнения:

**Строковые значения:**

```typescript
// Прямое сравнение
value: "active"

// Регулярное выражение
value: /^user_\d+$/

// Расширенные условия
value: {
  eq: "active",                 // равно
  startsWith: "user_",          // начинается с
  include: "error",             // содержит подстроку
  pattern: /^\d+$/,             // регулярное выражение
  length: 5,                    // длина 5 символов
  length: { min: 3, max: 10 },  // длина от 3 до 10 символов
  between: ["a", "z"]           // между двумя строками
}
```

**Числовые значения:**

```typescript
// Прямое сравнение
value: 42

// Расширенные условия
value: {
  eq: 42,                       // равно
  gt: 10,                       // больше 10
  gte: 10,                      // больше или равно 10
  lt: 100,                      // меньше 100
  lte: 100,                     // меньше или равно 100
  between: [10, 100]            // между 10 и 100
}
```

**Булевы значения:**

```typescript
// Прямое сравнение
value: true

// Расширенные условия
value: {
  eq: true,                     // равно
  logicalEq: true               // логическое равенство
}
```

**Массивы:**

```typescript
// Прямое сравнение
value: [1, 2, 3]

// Расширенные условия
value: {
  length: 3,                    // длина 3
  length: { min: 1, max: 5 },   // длина от 1 до 5
  includes: "item",             // содержит "item"
  isEmpty: true,                // пустой массив
  every: { gt: 0 },             // все элементы больше 0
  some: { include: "error" }    // хотя бы один содержит "error"
}
```

**Null и undefined:**

```typescript
// Прямое сравнение
value: null
value: undefined

// Условие null в объекте
value: { null: true }           // значение должно быть null
```

**Объекты:**

```typescript
// Прямое сравнение
value: { name: "test", value: 42 }

// Сложные объекты
value: {
  user: {
    id: 123,
    name: "John",
    settings: {
      theme: "dark",
      notifications: true
    }
  }
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

#### Фильтрация по значению патча

```typescript
// Фильтрация по строковому значению
reaction({ title: "user_activation" })
  .filter({
    value: { startsWith: "user_", include: "active" },
  })
  .equal(({ update }) => {
    update({ status: "activated" })
  })

// Фильтрация по числовому значению
reaction({ title: "high_value" })
  .filter({
    value: { gt: 100, lt: 1000 },
  })
  .equal(({ update }) => {
    update({ priority: "high" })
  })

// Фильтрация по массиву
reaction({ title: "multiple_items" })
  .filter({
    value: { length: { min: 2 }, every: { gt: 0 } },
  })
  .equal(({ update }) => {
    update({ processed: true })
  })

// Фильтрация по объекту
reaction({ title: "user_settings" })
  .filter({
    value: { user: { settings: { theme: "dark" } } },
  })
  .equal(({ update }) => {
    update({ darkMode: true })
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

#### Комбинированные условия для значения

```typescript
reaction({ title: "complex_value_filter" })
  .filter({
    value: {
      gt: 10,
      lt: 100,
      op: "replace",
      path: "/context",
    },
  })
  .equal(({ update }) => {
    update({ processed: true })
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
