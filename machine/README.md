# Machine

Модуль фреймворка MetaFor для создания контекстно-ориентированных конечных автоматов с типизированными состояниями и автоматическими переходами. Позволяет определять состояния, переходы и действия отдельно, с полной типобезопасностью.

---

## Основные возможности

- **Автоматические переходы** — переходы происходят автоматически на основе контекста
- **Разделение переходов и действий** — переходы (StateConfig) и действия (ActionsConfig) описываются отдельно
- **Типизированные состояния и действия** — строгая типизация для всех частей автомата
- **Условные переходы на основе контекста**
- **Поддержка success/error-обработчиков** для действий
- **Интеграция с контекстом MetaFor**
- **Гибкая декларация** — действия можно задавать только для нужных состояний
- **Класс Machine** — runtime-реализация конечного автомата с автоматическими переходами

---

## Быстрый старт

### Импорт

```typescript
import { Machine, type StateConfig, type ActionsConfig } from "./index"
```

### Базовое использование (современный API)

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

// Конфигурация переходов (StateConfig)
const stateConfig: StateConfig<UserStates, UserContext> = {
  idle: {
    loading: {
      name: { length: { min: 2 } },
      isActive: true,
    },
  },
  loading: {
    success: { userId: { notEq: null } },
    error: { name: { eq: "error_user" } },
  },
  success: { idle: {} },
  error: { idle: {} },
}

// Конфигурация действий (ActionsConfig)
const actionsConfig: ActionsConfig<UserStates, UserContext> = {
  loading: {
    action: async ({ context }) => {
      return {
        userId: `user_${Date.now()}`,
        profile: { name: context.name, age: context.age },
      }
    },
    success: ({ update, data }) => {
      update({ userId: data.userId })
    },
    error: ({ update, error }) => {
      update({ name: "error_user" })
    },
  },
}

// Создаем автомат
const machine = new Machine<UserStates, UserContext, UserResult>(stateConfig, actionsConfig, "idle", (values) => {
  Object.assign(context, values)
  return context
})

// Используем - просто передаем контекст!
const context = { name: "Иван", age: null, isActive: true }
const result = await machine.update(context)
```

---

## Архитектура

- **StateConfig** — определяет переходы между состояниями (без действий)
- **ActionsConfig** — определяет действия (action, success, error) только для нужных состояний (Partial<Record<S, ...>>)
- **Machine** — принимает оба конфига и управляет автоматом

### Пример архитектуры

```typescript
const stateConfig: StateConfig<...> = { ... } // только переходы
const actionsConfig: ActionsConfig<...> = { ... } // только действия для нужных состояний
const machine = new Machine(stateConfig, actionsConfig, initialState, updateFn)
```

---

## API

### Класс Machine

```typescript
new Machine<S, C, R>(stateConfig: StateConfig<S, C>, actionsConfig: ActionsConfig<S, C>, initialState: S, updateFunction: (values: any) => any)
```

- `stateConfig` — карта переходов между состояниями
- `actionsConfig` — карта действий (Partial<Record<S, ...>>)
- `initialState` — начальное состояние
- `updateFunction` — функция для обновления контекста

#### Методы

- `update(context: ExtractValues<C>): Promise<R | undefined>` — обновляет контекст и выполняет автоматические переходы
- `onUpdate(callback: (patches: Array<{ op: "test" | "replace"; path: "/state"; value: S }>) => void): () => void` — подписка на изменения состояния

---

## Примеры

### Только переходы (без действий)

```typescript
const stateConfig: StateConfig<"idle" | "success", UserContext> = {
  idle: { success: { name: { length: { min: 2 } } } },
  success: { idle: {} },
}
const machine = new Machine(stateConfig, {}, "idle", updateFn)
```

### Только действия (без переходов)

```typescript
const actionsConfig: ActionsConfig<"loading", UserContext> = {
  loading: {
    action: ({ context }) => ({ userId: "id", profile: { name: context.name, age: context.age } }),
    success: ({ update, data }) => update({ userId: data.userId }),
  },
}
const machine = new Machine({}, actionsConfig, "loading", updateFn)
```

### Полный автомат (переходы + действия)

```typescript
const stateConfig: StateConfig<"idle" | "loading" | "success", UserContext> = { ... }
const actionsConfig: ActionsConfig<"loading" | "success", UserContext> = { ... }
const machine = new Machine(stateConfig, actionsConfig, "idle", updateFn)
```

---

## Важно

- **ActionsConfig** теперь всегда Partial<Record<S, ...>> — можно описывать действия только для нужных состояний.
- **StateConfig** описывает только переходы, без process/action.
- Вся логика success/error теперь в actionsConfig.
- Для строгой типизации всегда указывайте типы состояний и контекста явно.

---

## Тестирование

Модуль включает полный набор тестов для проверки всех аспектов работы машины состояний. См. папку `machine/test/`.

---

## Документация

См. JSDoc/TypeDoc в исходном коде и примеры выше.
