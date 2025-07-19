# Machine

Модуль фреймворка MetaFor для создания конечных автоматов с типизированными состояниями и переходами. Позволяет определять состояния, процессы и условия переходов между ними на основе контекста.

---

## Основные возможности

- Типизированные состояния с процессами
- Условные переходы на основе контекста
- Поддержка действий, обработки ошибок и успешных операций
- Интеграция с контекстом MetaFor
- Автоматическая типизация переходов
- **Типизированные результаты процессов** - передача данных из `action` в `success` с полной типизацией
- **Класс Machine** - runtime-реализация конечного автомата с проверкой условий переходов

---

## Быстрый старт

### Импорт

```typescript
import { Machine } from "./machine"
import type { StateConfig } from "./machine"
```

### Пример использования

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
        // Имитируем API запрос
        await new Promise((resolve) => setTimeout(resolve, 100))
        return {
          userId: `user_${Date.now()}`,
          profile: { name: context.name, age: context.age },
        }
      },
      success: ({ update, data }) => {
        console.log(`Пользователь создан: ${data.userId}`)
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

// Используем
const context = { name: "Иван", age: null, isActive: true }
console.log(machine.currentState) // "idle"
console.log(machine.isExecuting) // false

// Проверяем переходы
console.log(machine.canTransitionTo("loading", context)) // true

// Выполняем переход
machine.transitionTo("loading", context)
console.log(machine.currentState) // "loading"

// Запускаем процесс
const result = await machine.execute(context)
console.log(result) // { userId: "user_123...", profile: {...} }
```

---

## API

### Machine

Класс для управления конечным автоматом.

#### Конструктор

```typescript
new Machine<S, C, R>(config: StateConfig<S, C, R>, initialState: S)
```

#### Свойства

- `currentState: S` - текущее состояние автомата
- `isExecuting: boolean` - выполняется ли действие в текущем состоянии
- `availableTransitions: S[]` - доступные переходы из текущего состояния

#### Методы

- `canTransitionTo(targetState: S, context: ExtractValues<C>): boolean` - проверяет возможность перехода
- `transitionTo(targetState: S, context: ExtractValues<C>): boolean` - выполняет переход
- `execute(context: ExtractValues<C>): Promise<R | undefined>` - запускает процесс текущего состояния

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
├── index.ts          # Основной экспорт модуля
├── index.t.ts        # Типы для модуля
├── Machine.ts        # Реализация класса Machine
├── transition.t.ts   # Типы условий переходов
├── example.ts        # Пример использования
├── README.md         # Документация
└── test/             # Тесты
    ├── state.spec.ts
    └── Machine.spec.ts
```

### Основные компоненты

- **Machine** - класс для управления конечным автоматом
- **StateProcess** - типизированные процессы состояний
- **TransitionConditions** - система условий переходов
- **StateConfig** - конфигурация всех состояний
