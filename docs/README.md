# Документация MetaFor

Добро пожаловать в документацию MetaFor — современного TypeScript фреймворка для создания веб-компонентов на основе конечных автоматов.

## 📚 Содержание

### 🚀 Начало работы

- [Основная документация](../README.md) — Быстрый старт и обзор возможностей

### 🏗️ Основные компоненты

- [Контекст (Context)](CONTEXT.md) — Типизированное состояние компонента
- [Состояния (States)](STATES.md) — Автоматические переходы между состояниями
- [Процессы (Processes)](PROCESSES.md) — Асинхронные действия с обработкой успеха/ошибок
- [Реакции (Reactions)](REACTIONS.md) — Декларативные фильтры для внешних событий
- [Представление (View)](VIEW.md) — HTML template API и стили

### 🔧 Дополнительные материалы

- [Примеры проектов](../examples/) — Готовые примеры использования
- [API Reference](../api/) — Полная справочная документация
- [Руководство по миграции](../migration/) — Переход с других фреймворков

## 🎯 Быстрый старт

### Установка

```bash
npm install @metafor/core
```

### Первый компонент

```typescript
import { MetaFor } from "@metafor/core"

MetaFor("counter")
  .context((types) => ({
    count: types.number.required(0),
    isLoading: types.boolean.required(false),
  }))
  .states({
    idle: { loading: {} },
    loading: {
      success: { count: { gt: 0 } },
      error: { isLoading: false },
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
      .success(({ update, data }) => update({ count: data.count, isLoading: false }))
      .error(({ update }) => update({ isLoading: false })),
  }))
  .view({
    render: ({ context, html, update }) => html`
      <div>
        <h1>Счётчик: ${context.count}</h1>
        <button @click=${() => update({ isLoading: true })} ?disabled=${context.isLoading}>
          ${context.isLoading ? "Загрузка..." : "Увеличить"}
        </button>
      </div>
    `,
  })
```

## 🏗️ Архитектура

MetaFor состоит из пяти основных компонентов:

### 1. Контекст (Context)

Типизированное состояние компонента с автоматическим обновлением UI.

```typescript
.context((types) => ({
  name: types.string.required("Anonymous"),
  age: types.number.required(18),
  isActive: types.boolean.required(false),
}))
```

### 2. Состояния (States)

Декларативное описание переходов между состояниями автомата.

```typescript
.states({
  guest: {
    user: {
      name: { length: { min: 2 } },
      email: { pattern: /@/ }
    }
  },
  user: {
    admin: { isAdmin: true },
    guest: { logout: true }
  }
})
```

### 3. Процессы (Processes)

Асинхронные действия с обработкой успеха и ошибок.

```typescript
.processes((process) => ({
  login: process()
    .action(async ({ context }) => {
      const response = await fetch('/api/login', {
        method: 'POST',
        body: JSON.stringify(context)
      })
      return await response.json()
    })
    .success(({ update, data }) => {
      update({ isAuthenticated: true, user: data })
    })
    .error(({ update, error }) => {
      update({ error: error.message })
    })
}))
```

### 4. Реакции (Reactions)

Декларативные фильтры для обработки внешних событий.

```typescript
.reactions((reaction) => [
  [
    ["idle", "loading"],
    reaction()
      .filter({ tag: "user", op: "replace" })
      .equal(({ update, patch }) => {
        update({ lastMessage: patch.value })
      })
  ]
])
```

### 5. Представление (View)

HTML template API с автоматическим обновлением.

```typescript
.view({
  render: ({ context, html, update }) => html`
    <div>
      <h1>${context.name}</h1>
      <button @click=${() => update({ count: context.count + 1 })}>
        Увеличить
      </button>
    </div>
  `,
  style: ({ css }) => css`
    div { padding: 20px; }
    button { background: #007bff; color: white; }
  `
})
```

## 🔑 Ключевые особенности

### Автоматические переходы

Переходы между состояниями происходят автоматически при изменении контекста:

```typescript
// При update({ isAdmin: true }) автомат автоматически перейдет в состояние admin
.states({
  user: { admin: { isAdmin: true } }
})
```

### Типобезопасность

Полная типизация TypeScript для всех компонентов:

```typescript
// TypeScript автоматически выводит типы
.action(async ({ context }) => {
  // context имеет полную типизацию
  return { user: context.user }
})
.success(({ update, data }) => {
  // data имеет тип из action
  update({ user: data.user })
})
```

### Декларативность

Все компоненты описываются декларативно:

```typescript
// Декларативное описание фильтров
.filter({
  tag: "user",
  op: "replace",
  value: { gt: 0 }
})

// Декларативное описание условий переходов
.states({
  form: {
    submitting: {
      name: { length: { min: 2 } },
      email: { pattern: /@/ }
    }
  }
})
```

### Реактивность

UI автоматически обновляется при изменении контекста:

```typescript
// UI обновится автоматически
update({ count: context.count + 1 })
```

## 🎨 Примеры использования

### Форма с валидацией

```typescript
MetaFor("user-form")
  .context((types) => ({
    name: types.string.required(""),
    email: types.string.required(""),
    age: types.number.required(0),
    errors: types.array.required([]),
    isSubmitting: types.boolean.required(false),
  }))
  .states({
    editing: {
      submitting: {
        name: { length: { min: 2 } },
        email: { pattern: /@/ },
        age: { gte: 18 },
      },
    },
    submitting: {
      success: { isSubmitting: false },
      error: { errors: { length: { gt: 0 } } },
    },
    success: { editing: {} },
    error: { editing: {} },
  })
  .core()
  .processes((process) => ({
    submitting: process()
      .action(async ({ context }) => {
        const errors = []

        if (context.name.length < 2) {
          errors.push("Имя должно содержать минимум 2 символа")
        }

        if (!context.email.includes("@")) {
          errors.push("Некорректный email")
        }

        if (context.age < 18) {
          errors.push("Возраст должен быть не менее 18 лет")
        }

        if (errors.length > 0) {
          throw new Error(errors.join(", "))
        }

        await new Promise((resolve) => setTimeout(resolve, 1000))
        return { success: true }
      })
      .success(({ update }) => {
        update({
          isSubmitting: false,
          errors: [],
          name: "",
          email: "",
          age: 0,
        })
      })
      .error(({ update, error }) => {
        update({
          isSubmitting: false,
          errors: error.message.split(", "),
        })
      }),
  }))
  .view({
    render: ({ context, html, update }) => html`
      <form
        @submit=${(e) => {
          e.preventDefault()
          update({ isSubmitting: true })
        }}>
        <div>
          <label>Имя:</label>
          <input .value=${context.name} @input=${(e) => update({ name: e.target.value })} placeholder="Введите имя" />
        </div>

        <div>
          <label>Email:</label>
          <input
            .value=${context.email}
            @input=${(e) => update({ email: e.target.value })}
            placeholder="Введите email"
            type="email" />
        </div>

        <div>
          <label>Возраст:</label>
          <input
            .value=${context.age}
            @input=${(e) => update({ age: parseInt(e.target.value) || 0 })}
            type="number"
            min="0" />
        </div>

        <button type="submit" ?disabled=${context.isSubmitting}>
          ${context.isSubmitting ? "Отправка..." : "Отправить"}
        </button>

        ${context.errors.length > 0 &&
        html` <div class="errors">${context.errors.map((error) => html`<div class="error">${error}</div>`)}</div> `}
      </form>
    `,
    style: ({ css }) => css`
      form {
        max-width: 400px;
        margin: 0 auto;
        padding: 20px;
      }

      div {
        margin-bottom: 15px;
      }

      label {
        display: block;
        margin-bottom: 5px;
        font-weight: bold;
      }

      input {
        width: 100%;
        padding: 8px;
        border: 1px solid #ddd;
        border-radius: 4px;
      }

      button {
        width: 100%;
        padding: 10px;
        background: #007bff;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
      }

      button:disabled {
        background: #ccc;
        cursor: not-allowed;
      }

      .errors {
        margin-top: 15px;
      }

      .error {
        color: red;
        margin-bottom: 5px;
      }
    `,
  })
```

### Счетчик с асинхронной загрузкой

```typescript
MetaFor("async-counter")
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
        if (Math.random() > 0.8) {
          throw new Error("Случайная ошибка")
        }
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
      <div class="counter">
        <h2>Счётчик: ${context.count}</h2>
        <button @click=${() => update({ isLoading: true })} ?disabled=${context.isLoading}>
          ${context.isLoading ? "Загрузка..." : "Увеличить"}
        </button>
        ${context.error && html` <div class="error">${context.error}</div> `}
      </div>
    `,
    style: ({ css }) => css`
      .counter {
        text-align: center;
        padding: 20px;
      }
      .error {
        color: red;
        margin-top: 10px;
      }
      button:disabled {
        opacity: 0.5;
      }
    `,
  })
```

## 🔍 Отладка

### Включение отладки

```typescript
// Включение отладки
window.debugMetaFor = true
```

### Получение снапшота

```typescript
// Получение текущего состояния
const element = document.querySelector("metafor-my-component")
const snapshot = element.getSnapshot()
console.log(snapshot)
```

### Логирование

При включенной отладке MetaFor автоматически логирует:

- Переходы между состояниями
- Выполнение процессов
- Срабатывание реакций
- Обновления контекста

## 🤝 Сообщество

- [GitHub](https://github.com/metafor/metafor) — Исходный код
- [Issues](https://github.com/metafor/metafor/issues) — Сообщения об ошибках
- [Discussions](https://github.com/metafor/metafor/discussions) — Обсуждения
- [Examples](https://github.com/metafor/examples) — Примеры проектов

## 📄 Лицензия

MIT License - см. файл [LICENSE](../LICENSE) для подробностей.
