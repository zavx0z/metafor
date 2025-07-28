# Руководство по миграции

Это руководство поможет вам перейти на MetaFor с других популярных фреймворков.

## Миграция с React

### Основные различия

| React                   | MetaFor                               |
| ----------------------- | ------------------------------------- |
| Компоненты с состоянием | Конечные автоматы с контекстом        |
| useState, useEffect     | Декларативные состояния и процессы    |
| JSX                     | HTML template API                     |
| Props drilling          | Контекст с автоматическим обновлением |
| Redux/MobX              | Встроенная система состояний          |

### Пример миграции

**React компонент:**

```tsx
import React, { useState, useEffect } from "react"

function Counter() {
  const [count, setCount] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")

  const increment = async () => {
    setIsLoading(true)
    try {
      await new Promise((resolve) => setTimeout(resolve, 1000))
      setCount((prev) => prev + 1)
      setError("")
    } catch (err) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div>
      <h1>Счётчик: {count}</h1>
      <button onClick={increment} disabled={isLoading}>
        {isLoading ? "Загрузка..." : "Увеличить"}
      </button>
      {error && <div className="error">{error}</div>}
    </div>
  )
}
```

**MetaFor эквивалент:**

```typescript
MetaFor("counter")
  .context((types) => ({
    count: types.number.required(0),
    isLoading: types.boolean.required(false),
    error: types.string.optional(),
  }))
  .states({
    idle: { loading: {} },
    loading: {
      success: { count: { gt: 0 } },
      error: { error: { notEq: "" } },
    },
    success: { idle: {} },
    error: { idle: {} },
  })
  .core()
  .processes((process) => ({
    loading: process()
      .action(async ({ context }) => {
        await new Promise((resolve) => setTimeout(resolve, 1000))
        return { count: context.count + 1 }
      })
      .success(({ update, data }) => {
        update({ count: data.count, isLoading: false, error: "" })
      })
      .error(({ update, error }) => {
        update({ error: error.message, isLoading: false })
      }),
  }))
  .view({
    render: ({ context, html, update }) => html`
      <div>
        <h1>Счётчик: ${context.count}</h1>
        <button @click=${() => update({ isLoading: true })} ?disabled=${context.isLoading}>
          ${context.isLoading ? "Загрузка..." : "Увеличить"}
        </button>
        ${context.error && html` <div class="error">${context.error}</div> `}
      </div>
    `,
  })
```

## Миграция с Vue.js

### Основные различия

| Vue.js                      | MetaFor                           |
| --------------------------- | --------------------------------- |
| Options API/Composition API | Декларативные автоматы            |
| Vuex/Pinia                  | Встроенная система состояний      |
| Vue Router                  | Автоматические переходы состояний |
| Vue Templates               | HTML template API                 |
| Computed properties         | Автоматические вычисления         |

### Пример миграции

**Vue.js компонент:**

```vue
<template>
  <div>
    <h1>Счётчик: {{ count }}</h1>
    <button @click="increment" :disabled="isLoading">
      {{ isLoading ? "Загрузка..." : "Увеличить" }}
    </button>
    <div v-if="error" class="error">{{ error }}</div>
  </div>
</template>

<script>
export default {
  data() {
    return {
      count: 0,
      isLoading: false,
      error: "",
    }
  },
  methods: {
    async increment() {
      this.isLoading = true
      try {
        await new Promise((resolve) => setTimeout(resolve, 1000))
        this.count++
        this.error = ""
      } catch (err) {
        this.error = err.message
      } finally {
        this.isLoading = false
      }
    },
  },
}
</script>
```

**MetaFor эквивалент:**

```typescript
MetaFor("counter")
  .context((types) => ({
    count: types.number.required(0),
    isLoading: types.boolean.required(false),
    error: types.string.optional(),
  }))
  .states({
    idle: { loading: {} },
    loading: {
      success: { count: { gt: 0 } },
      error: { error: { notEq: "" } },
    },
    success: { idle: {} },
    error: { idle: {} },
  })
  .core()
  .processes((process) => ({
    loading: process()
      .action(async ({ context }) => {
        await new Promise((resolve) => setTimeout(resolve, 1000))
        return { count: context.count + 1 }
      })
      .success(({ update, data }) => {
        update({ count: data.count, isLoading: false, error: "" })
      })
      .error(({ update, error }) => {
        update({ error: error.message, isLoading: false })
      }),
  }))
  .view({
    render: ({ context, html, update }) => html`
      <div>
        <h1>Счётчик: ${context.count}</h1>
        <button @click=${() => update({ isLoading: true })} ?disabled=${context.isLoading}>
          ${context.isLoading ? "Загрузка..." : "Увеличить"}
        </button>
        ${context.error && html` <div class="error">${context.error}</div> `}
      </div>
    `,
  })
```

## Миграция с Angular

### Основные различия

| Angular               | MetaFor                           |
| --------------------- | --------------------------------- |
| Components + Services | Конечные автоматы                 |
| NgRx/State Management | Встроенная система состояний      |
| Angular Router        | Автоматические переходы состояний |
| Angular Templates     | HTML template API                 |
| Dependency Injection  | Встроенные процессы               |

### Пример миграции

**Angular компонент:**

```typescript
import { Component } from "@angular/core"
import { CounterService } from "./counter.service"

@Component({
  selector: "app-counter",
  template: `
    <div>
      <h1>Счётчик: {{ count }}</h1>
      <button (click)="increment()" [disabled]="isLoading">
        {{ isLoading ? "Загрузка..." : "Увеличить" }}
      </button>
      <div *ngIf="error" class="error">{{ error }}</div>
    </div>
  `,
})
export class CounterComponent {
  count = 0
  isLoading = false
  error = ""

  constructor(private counterService: CounterService) {}

  async increment() {
    this.isLoading = true
    try {
      this.count = await this.counterService.increment(this.count)
      this.error = ""
    } catch (err) {
      this.error = err.message
    } finally {
      this.isLoading = false
    }
  }
}
```

**MetaFor эквивалент:**

```typescript
MetaFor("counter")
  .context((types) => ({
    count: types.number.required(0),
    isLoading: types.boolean.required(false),
    error: types.string.optional(),
  }))
  .states({
    idle: { loading: {} },
    loading: {
      success: { count: { gt: 0 } },
      error: { error: { notEq: "" } },
    },
    success: { idle: {} },
    error: { idle: {} },
  })
  .core()
  .processes((process) => ({
    loading: process()
      .action(async ({ context }) => {
        // Здесь может быть вызов сервиса
        await new Promise((resolve) => setTimeout(resolve, 1000))
        return { count: context.count + 1 }
      })
      .success(({ update, data }) => {
        update({ count: data.count, isLoading: false, error: "" })
      })
      .error(({ update, error }) => {
        update({ error: error.message, isLoading: false })
      }),
  }))
  .view({
    render: ({ context, html, update }) => html`
      <div>
        <h1>Счётчик: ${context.count}</h1>
        <button @click=${() => update({ isLoading: true })} ?disabled=${context.isLoading}>
          ${context.isLoading ? "Загрузка..." : "Увеличить"}
        </button>
        ${context.error && html` <div class="error">${context.error}</div> `}
      </div>
    `,
  })
```

## Миграция с Svelte

### Основные различия

| Svelte              | MetaFor                           |
| ------------------- | --------------------------------- |
| Reactive statements | Автоматические переходы состояний |
| Stores              | Встроенная система состояний      |
| Svelte templates    | HTML template API                 |
| Actions             | Процессы с обработкой ошибок      |
| Transitions         | Автоматические обновления UI      |

### Пример миграции

**Svelte компонент:**

```svelte
<script>
  import { writable } from 'svelte/store'

  let count = 0
  let isLoading = false
  let error = ''

  async function increment() {
    isLoading = true
    try {
      await new Promise(resolve => setTimeout(resolve, 1000))
      count++
      error = ''
    } catch (err) {
      error = err.message
    } finally {
      isLoading = false
    }
  }
</script>

<div>
  <h1>Счётчик: {count}</h1>
  <button
    on:click={increment}
    disabled={isLoading}
  >
    {isLoading ? 'Загрузка...' : 'Увеличить'}
  </button>
  {#if error}
    <div class="error">{error}</div>
  {/if}
</div>
```

**MetaFor эквивалент:**

```typescript
MetaFor("counter")
  .context((types) => ({
    count: types.number.required(0),
    isLoading: types.boolean.required(false),
    error: types.string.optional(),
  }))
  .states({
    idle: { loading: {} },
    loading: {
      success: { count: { gt: 0 } },
      error: { error: { notEq: "" } },
    },
    success: { idle: {} },
    error: { idle: {} },
  })
  .core()
  .processes((process) => ({
    loading: process()
      .action(async ({ context }) => {
        await new Promise((resolve) => setTimeout(resolve, 1000))
        return { count: context.count + 1 }
      })
      .success(({ update, data }) => {
        update({ count: data.count, isLoading: false, error: "" })
      })
      .error(({ update, error }) => {
        update({ error: error.message, isLoading: false })
      }),
  }))
  .view({
    render: ({ context, html, update }) => html`
      <div>
        <h1>Счётчик: ${context.count}</h1>
        <button @click=${() => update({ isLoading: true })} ?disabled=${context.isLoading}>
          ${context.isLoading ? "Загрузка..." : "Увеличить"}
        </button>
        ${context.error && html` <div class="error">${context.error}</div> `}
      </div>
    `,
  })
```

## Миграция с XState

### Основные различия

| XState         | MetaFor                         |
| -------------- | ------------------------------- |
| State machines | Конечные автоматы с контекстом  |
| Events         | Автоматические переходы         |
| Actions        | Процессы с обработкой ошибок    |
| Guards         | Декларативные условия           |
| Services       | Встроенные асинхронные процессы |

### Пример миграции

**XState машина:**

```typescript
import { createMachine, assign } from "xstate"

const counterMachine = createMachine({
  id: "counter",
  initial: "idle",
  context: {
    count: 0,
    isLoading: false,
    error: "",
  },
  states: {
    idle: {
      on: {
        INCREMENT: "loading",
      },
    },
    loading: {
      entry: assign({ isLoading: true }),
      invoke: {
        src: "incrementService",
        onDone: {
          target: "success",
          actions: assign({
            count: (context, event) => event.data.count,
            isLoading: false,
            error: "",
          }),
        },
        onError: {
          target: "error",
          actions: assign({
            error: (context, event) => event.data.message,
            isLoading: false,
          }),
        },
      },
    },
    success: {
      on: {
        RESET: "idle",
      },
    },
    error: {
      on: {
        RESET: "idle",
      },
    },
  },
})

const incrementService = () => new Promise((resolve) => setTimeout(() => resolve({ count: 1 }), 1000))
```

**MetaFor эквивалент:**

```typescript
MetaFor("counter")
  .context((types) => ({
    count: types.number.required(0),
    isLoading: types.boolean.required(false),
    error: types.string.optional(),
  }))
  .states({
    idle: { loading: {} },
    loading: {
      success: { count: { gt: 0 } },
      error: { error: { notEq: "" } },
    },
    success: { idle: {} },
    error: { idle: {} },
  })
  .core()
  .processes((process) => ({
    loading: process()
      .action(async ({ context }) => {
        await new Promise((resolve) => setTimeout(resolve, 1000))
        return { count: context.count + 1 }
      })
      .success(({ update, data }) => {
        update({ count: data.count, isLoading: false, error: "" })
      })
      .error(({ update, error }) => {
        update({ error: error.message, isLoading: false })
      }),
  }))
  .view({
    render: ({ context, html, update }) => html`
      <div>
        <h1>Счётчик: ${context.count}</h1>
        <button @click=${() => update({ isLoading: true })} ?disabled=${context.isLoading}>
          ${context.isLoading ? "Загрузка..." : "Увеличить"}
        </button>
        ${context.error && html` <div class="error">${context.error}</div> `}
      </div>
    `,
  })
```

## Пошаговая миграция

### Шаг 1: Анализ существующего кода

1. Определите состояния компонента
2. Выявите асинхронные операции
3. Найдите обработчики событий
4. Проанализируйте зависимости

### Шаг 2: Создание контекста

```typescript
// Определите типизированное состояние
.context((types) => ({
  // Перенесите все переменные состояния
  count: types.number.required(0),
  isLoading: types.boolean.required(false),
  error: types.string.optional(),
  // ... другие поля
}))
```

### Шаг 3: Определение состояний

```typescript
// Создайте автомат состояний
.states({
  // Определите возможные состояния
  idle: { loading: {} },
  loading: { success: {}, error: {} },
  success: { idle: {} },
  error: { idle: {} },
})
```

### Шаг 4: Создание процессов

```typescript
// Перенесите асинхронную логику в процессы
.processes((process) => ({
  loading: process()
    .action(async ({ context }) => {
      // Перенесите логику из методов/функций
      return await someAsyncOperation(context)
    })
    .success(({ update, data }) => {
      // Обработка успеха
      update({ result: data, isLoading: false })
    })
    .error(({ update, error }) => {
      // Обработка ошибок
      update({ error: error.message, isLoading: false })
    })
}))
```

### Шаг 5: Создание представления

```typescript
// Перенесите шаблон в HTML template API
.view({
  render: ({ context, html, update }) => html`
    <!-- Перенесите JSX/шаблон сюда -->
    <div>
      <h1>${context.title}</h1>
      <button @click=${() => update({ isLoading: true })}>
        ${context.isLoading ? 'Загрузка...' : 'Действие'}
      </button>
    </div>
  `
})
```

## Советы по миграции

### 1. Постепенная миграция

Не пытайтесь мигрировать весь проект сразу. Начните с простых компонентов:

```typescript
// Начните с простого счетчика
MetaFor("simple-counter")
  .context((types) => ({
    count: types.number.required(0),
  }))
  .view({
    render: ({ context, html, update }) => html`
      <div>
        <h1>${context.count}</h1>
        <button @click=${() => update({ count: context.count + 1 })}>Увеличить</button>
      </div>
    `,
  })
```

### 2. Сохранение логики

Переносите бизнес-логику в процессы:

```typescript
// Сохраните существующую логику
.action(async ({ context }) => {
  // Перенесите существующие функции сюда
  const result = await existingService.call(context.data)
  return result
})
```

### 3. Использование типизации

Используйте TypeScript для безопасности типов:

```typescript
// Определите типы для данных
interface UserData {
  id: number
  name: string
  email: string
}

.action(async ({ context }): Promise<UserData> => {
  const response = await fetch('/api/user')
  return await response.json()
})
```

### 4. Тестирование

Создайте тесты для новых компонентов:

```typescript
// Тестируйте компоненты
test("Counter increments", async () => {
  const element = document.querySelector("metafor-counter")
  const button = element.querySelector("button")

  button.click()
  await Bun.sleep(100)

  const snapshot = element.getSnapshot()
  expect(snapshot.context.count).toBe(1)
})
```

## Часто задаваемые вопросы

### Q: Как перенести Redux store?

**A:** Используйте контекст MetaFor:

```typescript
// Вместо Redux store
.context((types) => ({
  user: types.object.required({
    id: types.number.required(0),
    name: types.string.required(""),
  }),
  settings: types.object.required({
    theme: types.enum.required(["light", "dark"]),
    language: types.string.required("en"),
  }),
}))
```

### Q: Как перенести React Router?

**A:** Используйте состояния автомата:

```typescript
// Вместо React Router
.states({
  home: { profile: { isAuthenticated: true } },
  profile: { settings: {}, home: {} },
  settings: { profile: {} },
})
```

### Q: Как перенести Vuex actions?

**A:** Используйте процессы MetaFor:

```typescript
// Вместо Vuex actions
.processes((process) => ({
  fetchUser: process()
    .action(async ({ context }) => {
      const response = await fetch('/api/user')
      return await response.json()
    })
    .success(({ update, data }) => {
      update({ user: data })
    })
}))
```

### Q: Как перенести Angular services?

**A:** Используйте процессы с внешними сервисами:

```typescript
// Вместо Angular services
.action(async ({ context }) => {
  // Вызовите существующий сервис
  return await existingService.getData(context.id)
})
```

## Заключение

Миграция на MetaFor может быть постепенным процессом. Начните с простых компонентов и постепенно переходите к более сложным. Используйте встроенные возможности MetaFor для упрощения кода и улучшения типобезопасности.

Для получения дополнительной помощи обратитесь к:

- [Документации MetaFor](README.md)
- [Примерам проектов](../examples/)
- [Сообществу](https://github.com/metafor/metafor/discussions)
