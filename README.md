# MetaFor

Фреймворк для создания контекстно-ориентированных конечных автоматов с типизированными состояниями и автоматическими переходами.

## Основные возможности

- **Контекстно-ориентированные конечные автоматы** - переходы происходят автоматически на основе контекста
- **Типизированные состояния** с процессами и условиями переходов
- **Интеграция с Web Components** - создание компонентов с встроенными машинами состояний
- **Реактивные подписки** - получение уведомлений об изменениях состояния в формате JSON Patch
- **Полная типизация TypeScript** - типобезопасность на всех уровнях

## Быстрый старт

### Установка

```bash
bun install
```

### Базовое использование

```typescript
import { MetaFor } from "./dist/metafor.js"

// Создаем экземпляр MetaFor
const metafor = MetaFor("user")

// Определяем контекст
const context = metafor.context((types) => ({
  name: types.string.required(),
  isActive: types.boolean.required(),
}))

// Определяем состояния
const states = {
  idle: {
    to: {
      loading: {
        name: { length: { min: 3 } },
        isActive: true,
      },
    },
  },
  loading: {
    process: {
      action: async ({ context }) => ({
        userId: `user_${context.name}`,
        timestamp: Date.now(),
      }),
      success: ({ update, data }) => {
        update({ name: data.userId })
      },
    },
    to: {
      success: { name: { startsWith: "user_" } },
    },
  },
  success: { to: { idle: {} } },
}

// Создаем компонент с машиной состояний
context.states(states)

// Используем компонент
const component = document.createElement("metafor-user")
document.body.appendChild(component)

// Обновляем контекст - машина автоматически выполнит переходы
component.updateContext({ name: "Иван", isActive: true })
```

### Прямое использование Machine

```typescript
import { Machine } from "./dist/metafor.js"

const machine = new Machine(config, "idle", (values) => {
  // Функция обновления контекста
  return { ...context, ...values }
})

// Автоматические переходы
const result = await machine.update({ name: "Иван", isActive: true })
```

## Модули

### Core (metafor.ts)

Основной API для создания Web Components с машинами состояний.

### Context (context/)

Система типизированных контекстов с реактивными обновлениями.

### Machine (machine/)

Контекстно-ориентированные конечные автоматы с автоматическими переходами.

## Примеры

- [Интеграция с Machine](examples/machine-integration.html) - демонстрация полного цикла работы

## Тестирование

```bash
# Все тесты
bun test

# Тесты контекста
bun run CONTEXT:TEST

# Тесты машины состояний
bun run MACHINE:TEST
```

## Сборка

```bash
# Разработка
bun run build:dev

# Продакшн
bun run build:prod
```

## Лицензия

MIT
