# Context

Модуль для создания типизированных, иммутабельных контекстов с поддержкой схем и подписки на изменения. Подходит для управления состоянием в проектах, где важен контроль изменений.

---

## Быстрый старт

### Импорт

```ts
import { types, createContext } from "./context"
```

### Пример использования

```ts
import { types, createContext } from "./context"

const schema = {
  name: types.string.required("Гость"),
  age: types.number.optional(),
  isActive: types.boolean.required(true),
  role: types.enum("user", "admin", "moderator").required("user"),
  tags: types.array.optional(),
}

const { context, update, onUpdate, schema } = createContext(schema)

console.log(context.name) // "Гость"
update({ name: "Иван", age: 25 })
console.log(context.name) // "Иван"

// update возвращает только обновлённые поля:
const changed = update({ age: 30 })
console.log(changed) // { age: 30 }

const unsubscribe = onUpdate((patches) => {
  console.log("JSON Patch:", patches)
})

update({ age: null }) // JSON Patch: [{ op: "replace", path: "/age", value: null }]
unsubscribe()
```

### Chainable API с title

```ts
const schema = {
  name: types.string.required("Гость")({ title: "Имя пользователя" }),
  role: types.enum("user", "admin", "moderator").required("user")({ title: "Роль" }),
  nickname: types.string("Nic")({ title: "Псевдоним" }),
}
```

### Доступ к заголовкам через \_title

Контекст предоставляет доступ к заголовкам полей через свойство `_title`:

```ts
const { context } = createContext({
  name: types.string.required("Гость")({ title: "Имя пользователя" }),
  age: types.number.optional()({ title: "Возраст" }),
  isActive: types.boolean.required(true),
})

// Доступ к заголовкам
console.log(context._title.name) // "Имя пользователя"
console.log(context._title.age) // "Возраст"
console.log(context._title.isActive) // "" (пустая строка, если title не указан)

// _title — изменяемый объект
context._title.name = "Полное имя"
context._title.age = "Возраст пользователя"
console.log(context._title.name) // "Полное имя"

// Значения контекста остаются неизменными
console.log(context.name) // "Гость" (не изменилось)
```

**Особенности:**

- `_title` — изменяемый объект для управления заголовками
- Если `title` не указан в схеме, по умолчанию используется пустая строка
- Изменение `_title` не влияет на значения контекста
- Можно добавлять заголовки для полей, у которых не был указан `title`

---

## Основные возможности

- Типизированные схемы для описания структуры состояния
- Иммутабельный доступ к значениям (контекст нельзя изменить напрямую)
- Метод update для безопасного и контролируемого обновления
- Подписка на изменения (onUpdate) с поддержкой JSON Patch (RFC 6902) для отслеживания изменений
- Поддержка типов: string, number, boolean, array, enum
- Chainable API для удобного описания схем

---

## API

### types

Фабрики для описания схемы:

**Строки:**

- `types.string.required(defaultValue?)` / `types.string.optional(defaultValue?)`
- `types.string(defaultValue?)` — сокращение для optional

**Числа:**

- `types.number.required(defaultValue?)` / `types.number.optional(defaultValue?)`
- `types.number(defaultValue?)` — сокращение для optional

**Булевы:**

- `types.boolean.required(defaultValue?)` / `types.boolean.optional(defaultValue?)`
- `types.boolean(defaultValue?)` — сокращение для optional

**Массивы:**

- `types.array.required(defaultValue?)` / `types.array.optional(defaultValue?)`
- `types.array(defaultValue?)` — сокращение для optional

**Перечисления:**

- `types.enum(...values).required(defaultValue?)` / `types.enum(...values).optional(defaultValue?)`
- `types.enum(...values)(defaultValue?)` — сокращение для optional

**Chainable API:**
Все фабрики поддерживают цепочку вызовов для добавления дополнительных опций:

```ts
types.string.required("default")({ title: "Название поля" })
```

### createContext(schema)

Создаёт типизированный контекст по схеме.

**Параметры:**

- `schema` — объект схемы с использованием types

**Возвращает:**

- `context` — иммутабельный объект состояния
- `update(values)` — обновление значений (только переданные ключи)
  - **ВНИМАНИЕ:** update возвращает объект только с реально обновлёнными полями (а не весь контекст)
- `onUpdate(cb)` — подписка на изменения (возвращает функцию отписки)
- `schema` — схема контекста (только для чтения)

---

## Примеры схем

```ts
// Пользовательский контекст
const userSchema = {
  name: types.string.required("Гость")({ title: "Имя пользователя" }),
  age: types.number.optional()({ title: "Возраст" }),
  isActive: types.boolean.required(true)({ title: "Активен" }),
  role: types.enum("user", "admin", "moderator").required("user")({ title: "Роль" }),
  tags: types.array.optional()({ title: "Теги" }),
}

const { context, update, schema } = createContext(userSchema)

update({ name: "Иван", age: 25 }) // { name: "Иван", age: 25 }
update({ age: 30 }) // { age: 30 }

// Контекст продукта
const productSchema = {
  id: types.string.required()({ title: "Уникальный идентификатор" }),
  name: types.string.required("Новый продукт")({ title: "Название" }),
  price: types.number.required(0)({ title: "Цена" }),
  inStock: types.boolean.required(false)({ title: "В наличии" }),
  category: types.enum("electronics", "clothing", "books").optional()({ title: "Категория" }),
  images: types.array.required([])({ title: "Изображения" }),
}

const { update: updateProduct, schema: productSchemaInfo } = createContext(productSchema)
updateProduct({ id: "prod-123", price: 999 }) // { id: "prod-123", price: 999 }

// Простой синтаксис без title
const simpleSchema = {
  name: types.string.required("default"),
  age: types.number(),
  role: types.enum("user", "admin").required("user"),
}
```

---

## Экспорты

Модуль предоставляет следующие экспорты:

```ts
// Основной экспорт
import { createContext, types } from "./context"

// Дополнительные экспорты типов
import type { ContextSchema, ContextInstance, ExtractValues, JsonPatch } from "./context"
```

---

## Особенности

### Возвращаемое значение update

Метод `update()` **возвращает только те поля, которые действительно изменились**:

```ts
const { context, update, schema } = createContext({
  name: types.string.required("Гость"),
  age: types.number.optional(),
})

// Если возраст был null, а имя "Гость"
const result = update({ name: "Гость", age: 25 })
console.log(result) // { age: 25 } - только изменившееся поле!
```

### Типизация опциональных полей

Опциональные поля имеют тип `T | null`, где T — базовый тип:

- `types.string()` → `string | null`
- `types.number.optional()` → `number | null`

Обязательные поля имеют строгий тип:

- `types.string.required()` → `string`
- `types.number.required()` → `number`

---

## Архитектура

```text
context/
├── index.ts          # Основной экспорт модуля
├── index.t.ts        # Типы для контекста
├── types.ts          # Фабрики типов
├── types.t.ts        # Типы для фабрик
└── test/             # Тесты
    ├── context.spec.ts
    ├── schema.spec.ts
    ├── update.spec.ts
    └── onUpdate.spec.ts
```

### Основные компоненты

- **Context** — класс для работы с типизированными контекстами
- **types** — фабрики для создания схем типов
- **createContext** — фабричная функция для создания экземпляров контекста
