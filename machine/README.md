# Machine

Модуль фреймворка MetaFor для создания контекстно-ориентированных конечных автоматов с типизированными состояниями и автоматическими переходами. Позволяет определять состояния, процессы и условия переходов между ними на основе контекста.

---

## Основные возможности

- **Автоматические переходы** - переходы происходят автоматически на основе контекста
- Типизированные состояния с процессами
- Условные переходы на основе контекста
- Поддержка действий, обработки ошибок и успешных операций
- Интеграция с контекстом MetaFor
- Автоматическая типизация переходов
- **Типизированные результаты процессов** - передача данных из `action` в `success` с полной типизацией
- **Класс Machine** - runtime-реализация конечного автомата с автоматическими переходами

---

## Быстрый старт

### Импорт

```typescript
import { Machine } from "./index"
import type { StateConfig } from "./index"
```

### Базовое использование

```typescript
// Определяем типы
type UserStates = "idle" | "loading" | "success" | "error"
type UserContext = {
  name: { type: "string"; required: true }
  age: { type: "number"; required: false }
  isActive: { type: "boolean"; required: true }
}
type UserResult = {
  userId: string
  profile: { name: string; age: number | null }
}

// Конфигурация состояний
const config: StateConfig<UserStates, UserContext, UserResult> = {
  idle: {
    to: {
      loading: {
        name: { length: { min: 2 } },
        isActive: true,
      },
    },
  },
  loading: {
    process: {
      action: async ({ context }) => {
        return {
          userId: `user_${Date.now()}`,
          profile: { name: context.name, age: context.age },
        }
      },
      success: ({ update, data }) => {
        update({ userId: data.userId })
      },
      error: ({ update }) => {
        update({ name: "error_user" })
      },
    },
    to: {
      success: { userId: { notEq: null } },
      error: { name: { eq: "error_user" } },
    },
  },
  success: { to: { idle: {} } },
  error: { to: { idle: {} } },
}

// Создаем автомат
const machine = new Machine<UserStates, UserContext, UserResult>(config, "idle")

// Используем - просто передаем контекст!
const context = { name: "Иван", age: null, isActive: true }
const result = await machine.update(context)
```

---

## API

### Класс Machine

Класс для управления контекстно-ориентированным конечным автоматом.

#### Конструктор

```typescript
new Machine<S, C, R>(config: StateConfig<S, C, R>, initialState: S, updateFunction: UpdateFunction<C>)
```

**Параметры:**

- `config` - конфигурация состояний автомата
- `initialState` - начальное состояние
- `updateFunction` - функция для обновления контекста, передаваемая в обработчики `success` и `error`

#### Свойства

- `currentState: S` - текущее состояние автомата
- `isExecuting: boolean` - выполняется ли действие в текущем состоянии
- `availableTransitions: S[]` - доступные переходы из текущего состояния

#### Методы

- `update(context: ExtractValues<C>): Promise<R | undefined>` - **основной метод** - обновляет контекст и выполняет автоматические переходы
- `onUpdate(callback: (patches: Array<{ op: "test" | "replace"; path: "/state"; value: S }>) => void): () => void` - подписка на изменения состояния в формате JSON Patch

---

## Автоматические переходы

### Метод update

Основной метод для работы с контекстно-ориентированной машиной:

```typescript
async update(context: ExtractValues<C>): Promise<R | undefined>
```

**Как это работает:**

1. **Анализ контекста** - машина анализирует переданный контекст
2. **Проверка условий** - проверяет все возможные переходы из текущего состояния
3. **Автоматический переход** - если условия выполняются, выполняет переход
4. **Выполнение процесса** - если новое состояние имеет процесс, запускает его
5. **Повтор** - повторяет цикл, пока есть возможные переходы
6. **Возврат результата** - возвращает результат последнего выполненного процесса

**Пример:**

```typescript
// Начальное состояние: "idle"
const context = { name: "Иван", age: 25, isActive: true }
const machine = new Machine(config, "idle", (values) => {
  // Обновляем контекст
  Object.assign(context, values)
  return context
})

// Передаем контекст
const result = await machine.update(context)

// Машина автоматически:
// 1. idle -> loading (условия выполняются)
// 2. Выполняет процесс loading
// 3. loading -> success (userId не null)
// 4. success -> idle (нет условий)
// 5. Возвращает результат процесса loading
```

### Метод onUpdate

Подписка на изменения состояния автомата в формате JSON Patch:

```typescript
onUpdate(callback: (patches: Array<{ op: "test" | "replace"; path: "/state"; value: S }>) => void): () => void
```

**Операции:**

- `test` - когда входим в состояние с `action` (процессом)
- `replace` - когда входим в состояние без `action` или после успешного выполнения `action`

**Пример:**

```typescript
// Подписываемся на изменения состояния
const unsubscribe = machine.onUpdate((patches) => {
  patches.forEach((patch) => {
    console.log(`${patch.op === "test" ? "Тестируем" : "Заменяем"} состояние: ${patch.value}`)
  })
})

// Обновляем контекст
await machine.update(context)

// Отписываемся
unsubscribe()
```

### Преимущества автоматических переходов

1. **Простота использования** - не нужно вручную управлять переходами
2. **Контекстная логика** - переходы определяются данными, а не кодом
3. **Автоматическая обработка** - машина сама определяет последовательность состояний
4. **Типобезопасность** - все переходы типизированы
5. **Гибкость** - легко изменять логику через конфигурацию
6. **Реактивность** - возможность подписываться на изменения состояния

---

## Типизированные результаты процессов

### StateProcess с generic параметром R

```typescript
type StateProcess<T extends ContextSchema = any, R = any> = {
  action: (params: { context: ExtractValues<T> }) => R | Promise<R>
  error: (params: { update: (values: UpdateValues<ExtractValues<T>>) => ExtractValues<T> }) => void
  success?: (params: { update: (values: UpdateValues<ExtractValues<T>>) => ExtractValues<T>; data: R }) => void
}
```

#### Пример StateProcess

```typescript
// Определяем типы
type UserContext = {
  name: { type: "string"; required: true }
  email: { type: "string"; required: true }
}

type UserResult = {
  userId: string
  profile: { name: string; email: string }
}

// Создаем StateProcess с типизацией
const userProcess: StateProcess<UserContext, UserResult> = {
  action: ({ context }) => {
    // context имеет тип { name: string, email: string }
    return {
      userId: `user_${Date.now()}`,
      profile: {
        name: context.name,
        email: context.email,
      },
    }
  },
  success: ({ update, data }) => {
    // data имеет тип UserResult
    console.log(`User created: ${data.userId}`)
    update({ name: data.profile.name })
  },
  error: ({ update }) => {
    update({ name: "Error User" })
  },
}
```

#### Преимущества

1. **Типобезопасность результатов**: TypeScript автоматически выводит тип результата из `action` в `success`
2. **IntelliSense поддержка**: Полная поддержка автодополнения и проверки типов
3. **Ошибки на этапе компиляции**: Неправильное использование типов будет обнаружено до выполнения
4. **Рефакторинг**: Безопасное изменение типов с автоматическим обновлением всех зависимостей
5. **Асинхронная поддержка**: Поддержка как синхронных, так и асинхронных действий

---

## Условия переходов

Модуль поддерживает богатую систему условий для переходов между состояниями:

### Строковые условия

```typescript
{
  name: {
    startsWith: "test",
    endsWith: "user",
    include: "admin",
    pattern: /^[a-z]+$/,
    length: { min: 3, max: 20 },
    eq: "exact_match"
  }
}
```

### Числовые условия

```typescript
{
  age: {
    gt: 18,
    gte: 21,
    lt: 65,
    lte: 60,
    between: [18, 65],
    eq: 25
  }
}
```

### Булевы условия

```typescript
{
  isActive: true,
  isVerified: { eq: false, logicalEq: true }
}
```

### Массивы

```typescript
{
  tags: {
    length: { min: 1 },
    includes: "admin",
    isEmpty: false,
    every: (tag) => tag.length > 0
  }
}
```

### Проверка на null (для optional полей)

```typescript
{
  email: { null: false },
  phone: null
}
```

---

## Архитектура

```text
machine/
├── index.ts          # Основной экспорт модуля с реализацией класса Machine
├── index.t.ts        # Типы для модуля
├── transition.t.ts   # Типы условий переходов
├── README.md         # Документация
└── test/             # Тесты
    ├── state.spec.ts
    └── machine.spec.ts
```

### Основные компоненты

- **Machine** - класс для управления контекстно-ориентированным конечным автоматом (реализован в index.ts)
- **StateProcess** - типизированные процессы состояний
- **TransitionConditions** - система условий переходов
- **StateConfig** - конфигурация всех состояний
- **update** - основной метод для автоматической обработки контекста
