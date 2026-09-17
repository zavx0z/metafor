# Реализация частиц в MetaFor

## Введение

В этом разделе описаны различные способы реализации частиц в MetaFor на разных платформах и технологических стеках. MetaFor предоставляет гибкие возможности для создания частиц, что позволяет адаптировать их под конкретные требования проекта и особенности используемых технологий.

---

## Платформы и окружения

MetaFor может быть использован в различных окружениях и на разных платформах:

### 1. Веб-приложения

- **Браузерное окружение**

  - Полная поддержка современных браузеров
  - Интеграция с DOM через специализированные адаптеры
  - Оптимизация для работы в однопоточной среде

- **Фреймворки**
  - React: интеграция через хуки и компоненты высшего порядка
  - Vue: интеграция через композиционный API
  - Angular: интеграция через сервисы и директивы
  - Vanilla JS: прямое использование без дополнительных зависимостей

### 2. Мобильные приложения

- **React Native**

  - Адаптированные API для работы с нативными компонентами
  - Оптимизация для мобильных устройств

- **Native Mobile**
  - iOS: интеграция через Swift/Objective-C обертки
  - Android: интеграция через Kotlin/Java обертки

### 3. Серверные приложения

- **Node.js**

  - Поддержка асинхронных операций
  - Интеграция с серверными фреймворками (Express, Koa, Fastify)

- **Deno**
  - Поддержка современных возможностей JavaScript/TypeScript
  - Безопасное выполнение в изолированной среде

### 4. Десктопные приложения

- **Electron**

  - Интеграция как в основном, так и в рендерер-процессах
  - Синхронизация состояний между процессами

- **Tauri**
  - Легковесная альтернатива с использованием Rust

---

## Способы создания частиц

MetaFor предоставляет несколько способов создания частиц, каждый из которых имеет свои преимущества и особенности:

### 1. Декларативный подход (Fluent API)

Наиболее читаемый и структурированный способ создания частиц, использующий цепочку методов:

```javascript
import { MetaFor } from "metafor"

const todoParticle = MetaFor("todo-list")
  .states("IDLE", "LOADING", "LOADED", "ERROR")
  .context((t) => ({
    items: t.array([]),
    isLoading: t.boolean(false),
    error: t.nullable(t.string(null)),
  }))
  .collapses([
    { from: "IDLE", to: [{ state: "LOADING", trigger: { isLoading: true } }] },
    { from: "LOADING", to: [{ state: "LOADED", trigger: { items: { length: { gt: 0 } } } }] },
    { from: "LOADING", to: [{ state: "ERROR", trigger: { error: { isNull: false } } }] },
    { from: "ERROR", to: [{ state: "IDLE", trigger: { error: null } }] },
  ])
  .actions({
    fetchItems: ({ context }) => {
      context.update({ isLoading: true })

      fetch("/api/todos")
        .then((response) => response.json())
        .then((data) => {
          context.update({ items: data, isLoading: false })
        })
        .catch((error) => {
          context.update({ error: error.message, isLoading: false })
        })
    },
    clearError: ({ context }) => {
      context.update({ error: null })
    },
  })
  .create()
```

**Преимущества:**

- Высокая читаемость кода
- Последовательное определение компонентов частицы
- Удобство для сложных частиц с множеством состояний и действий

**Рекомендуется для:**

- Сложных частиц с множеством состояний и действий
- Проектов, где важна читаемость и поддерживаемость кода
- Командной разработки, где важно единообразие стиля

### 2. Конфигурационный подход

Создание частицы с помощью объекта конфигурации:

```javascript
import { createParticle } from "metafor"

const todoParticle = createParticle({
  tag: "todo-list",
  states: ["IDLE", "LOADING", "LOADED", "ERROR"],
  context: (t) => ({
    items: t.array([]),
    isLoading: t.boolean(false),
    error: t.nullable(t.string(null)),
  }),
  collapses: [
    { from: "IDLE", to: [{ state: "LOADING", trigger: { isLoading: true } }] },
    { from: "LOADING", to: [{ state: "LOADED", trigger: { items: { length: { gt: 0 } } } }] },
    { from: "LOADING", to: [{ state: "ERROR", trigger: { error: { isNull: false } } }] },
    { from: "ERROR", to: [{ state: "IDLE", trigger: { error: null } }] },
  ],
  actions: {
    fetchItems: ({ context }) => {
      context.update({ isLoading: true })

      fetch("/api/todos")
        .then((response) => response.json())
        .then((data) => {
          context.update({ items: data, isLoading: false })
        })
        .catch((error) => {
          context.update({ error: error.message, isLoading: false })
        })
    },
    clearError: ({ context }) => {
      context.update({ error: null })
    },
  },
  initialState: "IDLE",
})
```

**Преимущества:**

- Возможность динамического создания частиц
- Удобство для программного создания частиц
- Возможность сериализации и десериализации конфигурации
- Поддержка генерации конфигурации из внешних источников

**Рекомендуется для:**

- Динамического создания частиц на основе данных
- Интеграции с системами управления конфигурациями
- Генерации частиц из внешних источников (API, базы данных)

### 3. Упрощенный подход

Для простых частиц с минимальным набором состояний и действий:

```javascript
import { simpleParticle } from "metafor"

const counterParticle = simpleParticle({
  tag: "counter",
  context: {
    count: 0,
  },
  actions: {
    increment: ({ context }) => {
      context.update({ count: context.get().count + 1 })
    },
    decrement: ({ context }) => {
      context.update({ count: context.get().count - 1 })
    },
    reset: ({ context }) => {
      context.update({ count: 0 })
    },
  },
})
```

**Преимущества:**

- Минимальный объем кода
- Отсутствие необходимости определять состояния и переходы
- Быстрое создание простых частиц

**Рекомендуется для:**

- Простых частиц с минимальным набором состояний
- Прототипирования и быстрой разработки
- Обучения новых разработчиков

---

## Интеграция с различными технологиями

### 1. TypeScript

MetaFor полностью поддерживает TypeScript, обеспечивая строгую типизацию всех компонентов:

```typescript
import { MetaFor, ParticleContext } from "metafor"

// Определение типов для контекста
interface TodoContext extends ParticleContext {
  items: Array<{ id: number; title: string; completed: boolean }>
  isLoading: boolean
  error: string | null
}

// Определение типов для состояний
type TodoState = "IDLE" | "LOADING" | "LOADED" | "ERROR"

// Создание частицы с типизацией
const todoParticle = MetaFor<TodoContext, TodoState>("todo-list")
  .states("IDLE", "LOADING", "LOADED", "ERROR")
  .context((t) => ({
    items: t.array([]),
    isLoading: t.boolean(false),
    error: t.nullable(t.string(null)),
  }))
  // ...
  .create()
```

### 2. React

Интеграция с React через специализированные хуки:

```jsx
import { useParticle } from "metafor/react"
import { todoParticle } from "./particles/todo"

function TodoList() {
  const { state, context, actions } = useParticle(todoParticle)

  useEffect(() => {
    actions.fetchItems()
  }, [])

  if (state === "LOADING") {
    return <div>Loading...</div>
  }

  if (state === "ERROR") {
    return <div>Error: {context.error}</div>
  }

  return (
    <div>
      <h1>Todo List</h1>
      <ul>
        {context.items.map((item) => (
          <li key={item.id}>{item.title}</li>
        ))}
      </ul>
      <button onClick={actions.fetchItems}>Refresh</button>
    </div>
  )
}
```

### 3. Vue

Интеграция с Vue через композиционный API:

```vue
<template>
  <div>
    <h1>Todo List</h1>
    <div v-if="state === 'LOADING'">Loading...</div>
    <div v-else-if="state === 'ERROR'">Error: {{ context.error }}</div>
    <ul v-else>
      <li v-for="item in context.items" :key="item.id">{{ item.title }}</li>
    </ul>
    <button @click="actions.fetchItems">Refresh</button>
  </div>
</template>

<script>
import { useParticle } from "metafor/vue"
import { todoParticle } from "./particles/todo"

export default {
  setup() {
    const { state, context, actions } = useParticle(todoParticle)

    onMounted(() => {
      actions.fetchItems()
    })

    return { state, context, actions }
  },
}
</script>
```

### 4. Node.js

Использование в серверном окружении:

```javascript
import { MetaFor } from "metafor"
import express from "express"

const app = express()

// Создание частицы для управления состоянием сервера
const serverParticle = MetaFor("server-state")
  .states("STARTING", "RUNNING", "STOPPING", "STOPPED", "ERROR")
  .context((t) => ({
    port: t.number(3000),
    connections: t.number(0),
    error: t.nullable(t.string(null)),
  }))
  .collapses([
    /* ... */
  ])
  .actions({
    start: ({ context, core }) => {
      const server = app.listen(context.port, () => {
        context.update({ status: "RUNNING" })
      })

      server.on("error", (error) => {
        context.update({ error: error.message })
      })

      core.server = server
    },
    stop: ({ context, core }) => {
      if (core.server) {
        core.server.close(() => {
          context.update({ status: "STOPPED" })
        })
      }
    },
  })
  .core(() => ({
    server: null,
  }))
  .create()

// Использование частицы для управления сервером
serverParticle.actions.start()

// Обработка сигналов завершения
process.on("SIGTERM", () => {
  serverParticle.actions.stop()
})
```

---

## Расширенные возможности

### 1. Композиция частиц

MetaFor поддерживает композицию частиц, позволяя создавать сложные системы из простых компонентов:

```javascript
// Частица для управления аутентификацией
const authParticle = MetaFor("auth")
  .states("ANONYMOUS", "AUTHENTICATED")
  // ...
  .create()

// Частица для управления списком задач, зависящая от аутентификации
const todoParticle = MetaFor("todo-list")
  .states("IDLE", "LOADING", "LOADED", "ERROR")
  // ...
  .reactions([
    {
      source: authParticle.tag,
      handler: ({ source, actions }) => {
        if (source.state === "AUTHENTICATED") {
          actions.fetchItems()
        }
      },
    },
  ])
  .create()
```

### 2. Персистентность

MetaFor предоставляет механизмы для сохранения и восстановления состояния частиц:

```javascript
import { MetaFor, persistParticle } from "metafor"

// Создание частицы
const todoParticle = MetaFor("todo-list")
  // ...
  .create()

// Настройка персистентности
persistParticle(todoParticle, {
  storage: localStorage,
  key: "todo-list",
  include: ["items"], // Сохранять только items
  exclude: ["isLoading", "error"], // Не сохранять isLoading и error
})
```

### 3. Отладка и мониторинг

MetaFor включает инструменты для отладки и мониторинга частиц:

```javascript
import { MetaFor, enableDevTools } from "metafor"

// Включение инструментов разработчика
enableDevTools()

// Создание частицы с отладочной информацией
const todoParticle = MetaFor("todo-list")
  // ...
  .create({
    debug: true, // Включение отладки для этой частицы
    logger: console.log, // Настройка логгера
  })
```

---

## Заключение

MetaFor предоставляет гибкие возможности для создания и использования частиц в различных окружениях и на разных платформах. Выбор способа создания частиц зависит от конкретных требований проекта, предпочтений команды разработчиков и особенностей используемых технологий.

Независимо от выбранного подхода, MetaFor обеспечивает предсказуемое поведение, строгую типизацию и удобные инструменты для разработки и отладки, что делает его мощным инструментом для управления состояниями в современных приложениях.
