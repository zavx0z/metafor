# MetaFor

**MetaFor** — это современный TypeScript фреймворк для создания веб-компонентов на основе конечных автоматов с декларативным API, типобезопасностью и реактивностью.

## 🚀 Основные возможности

- **Конечные автоматы** — декларативное описание состояний и переходов
- **Типобезопасность** — полная типизация TypeScript для всех компонентов
- **Реактивность** — автоматическое обновление UI при изменении состояния
- **Процессы** — действия с обработкой успеха/ошибок (асинхронные и синхронные)
- **Реакции** — декларативные фильтры для обработки внешних событий
- **Шаблонизация** — современный HTML template API с директивами
- **Веб-компоненты** — нативная поддержка Custom Elements

## 📦 Установка

```bash
npm install @metafor/core
```

## 🎯 Быстрый старт

```typescript
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
    render: ({ context, html }) => html`
      <div>
        <h1>Счётчик: ${context.count}</h1>
        <button ?disabled=${context.isLoading}>${context.isLoading ? "Загрузка..." : "Увеличить"}</button>
      </div>
    `,
  })
```

## 🏗️ Архитектура

MetaFor состоит из нескольких ключевых компонентов:

### 1. Контекст (Context)

Контекст — это типизированное состояние компонента, которое автоматически обновляет UI при изменениях.

```typescript
.context((types) => ({
  // Обязательные поля
  name: types.string.required("Anonymous"),
  age: types.number.required(18),
  isActive: types.boolean.required(false),

  // Опциональные поля
  email: types.string.optional(),
  avatar: types.string.optional(),

  // Массивы
  tags: types.array.required([]),

  // Enum
  status: types.enum.required(["pending", "active", "blocked"]),
}))
```

**Поддерживаемые типы:**

- `string` — строки
- `number` — числа
- `boolean` — булевы значения
- `array` — массивы
- `enum` — перечисления

### 2. Состояния (States)

Состояния определяют возможные переходы автомата с условиями.

```typescript
.states({
  guest: {
    // Переход в user при выполнении условий
    user: {
      name: { length: { min: 2 } },
      email: { pattern: /@/ }
    }
  },
  user: {
    // Переход в admin при isAdmin: true
    admin: { isAdmin: true },
    // Переход в guest при logout: true
    guest: { logout: true }
  },
  admin: {
    user: { isAdmin: false }
  }
})
```

**Условия переходов:**

Для строк:

```typescript
name: {
  eq: "admin",           // равно
  startsWith: "user",    // начинается с
  endsWith: "admin",     // заканчивается на
  include: "test",       // содержит подстроку
  pattern: /^[a-z]+$/,   // регулярное выражение
  length: { min: 3, max: 20 } // длина
}
```

Для чисел:

```typescript
age: {
  eq: 18,        // равно
  gt: 0,         // больше
  gte: 18,       // больше или равно
  lt: 100,       // меньше
  lte: 65,       // меньше или равно
  between: [18, 65] // диапазон
}
```

Для булевых значений:

```typescript
isActive: {
  eq: true,      // равно
  notEq: false   // не равно
}
```

Для массивов:

```typescript
tags: {
  length: { min: 1 },    // длина
  includes: "admin",     // содержит элемент
  isEmpty: false         // не пустой
}
```

### 3. Процессы (Processes)

Процессы — это действия с обработкой успеха и ошибок. Они могут быть как асинхронными, так и синхронными.

```typescript
.processes((process) => ({
  login: process({
    title: "Авторизация",
    description: "Процесс входа пользователя"
  })
    .action(async ({ context }) => {
      // Основная логика
      const response = await fetch('/api/login', {
        method: 'POST',
        body: JSON.stringify({
          email: context.email,
          password: context.password
        })
      })

      if (!response.ok) {
        throw new Error('Ошибка авторизации')
      }

      return await response.json()
    })
    .success(({ update, data }) => {
      // Обработка успеха
      update({
        isAuthenticated: true,
        user: data.user,
        error: ""
      })
    })
    .error(({ update, error }) => {
      // Обработка ошибки
      update({
        error: error.message,
        isAuthenticated: false
      })
    }),

  logout: process()
    .action(({ context }) => {
      // Синхронное действие
      localStorage.removeItem('token')
      return { success: true }
    })
    .success(({ update }) => {
      update({
        isAuthenticated: false,
        user: null,
        error: ""
      })
    })
}))
```

### 4. Реакции (Reactions)

Реакции позволяют обрабатывать внешние события через декларативные фильтры.

```typescript
.reactions((reaction) => [
  [
    ["idle", "loading"], // Состояния, в которых активна реакция
    reaction({ title: "Обработка сообщений" })
      .filter({
        tag: "user",           // Фильтр по тегу
        op: "replace",         // Фильтр по операции
        path: "/context",      // Фильтр по пути
        value: { gt: 0 }       // Фильтр по значению
      })
      .equal(({ update, context, meta, patch }) => {
        // Обработка события
        update({
          lastMessage: patch.value,
          messageCount: context.messageCount + 1
        })
      })
  ],
  [
    ["idle", "loading", "success", "error"], // Все состояния
    reaction()
      .filter({ tag: "system" })
      .equal(({ update }) => {
        update({ systemNotification: true })
      })
  ]
])
```

**Фильтры реакций:**

- `tag` — фильтр по тегу сообщения
- `index` — фильтр по индексу
- `timestamp` — фильтр по временной метке
- `op` — фильтр по операции (replace, add, remove, test)
- `path` — фильтр по пути (/context, /state, /)
- `value` — фильтр по значению с поддержкой всех типов условий

### 5. Представление (View)

Представление определяет UI компонента с использованием HTML template API.

```typescript
.view({
  render: ({ context, html, update, ref }) => html`
    <div class="user-profile">
      <h1>${context.name}</h1>

      ${context.isLoading
        ? html`<div class="loading">Загрузка...</div>`
        : html`
          <form @submit=${(e) => {
            e.preventDefault()
            update({ isLoading: true })
          }}>
            <input
              .value=${context.email}
              @input=${(e) => update({ email: e.target.value })}
              placeholder="Email"
            />
            <button type="submit" ?disabled=${!context.email}>
              Сохранить
            </button>
          </form>
        `
      }

      ${context.error
        ? html`<div class="error">${context.error}</div>`
        : null
      }
    </div>
  `,

  style: ({ css }) => css`
    .user-profile {
      padding: 20px;
      border: 1px solid #ccc;
      border-radius: 8px;
    }

    .loading {
      color: #666;
      font-style: italic;
    }

    .error {
      color: red;
      margin-top: 10px;
    }

    input {
      padding: 8px;
      border: 1px solid #ddd;
      border-radius: 4px;
      margin-right: 10px;
    }

    button {
      padding: 8px 16px;
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
  `
})
```

**Директивы HTML:**

- `@event` — обработчики событий
- `?attribute` — булевы атрибуты
- `.property` — свойства элементов
- `${ref()}` — ссылки на элементы
- `${when(condition, template)}` — условный рендеринг
- `${repeat(items, template)}` — циклы
- `${map(items, fn)}` — преобразование массивов

## 🔧 API Reference

### MetaFor(tag: string)

Создает новый экземпляр MetaFor с указанным тегом компонента.

```typescript
const component = MetaFor("my-component")
```

### Chain API

MetaFor использует цепочку методов для конфигурации:

```typescript
MetaFor("example")
  .context(schema) // Схема контекста
  .states(config) // Конфигурация состояний
  .core({}) // Инициализация ядра
  .processes(config) // Конфигурация процессов
  .reactions(config) // Конфигурация реакций
  .view(config) // Конфигурация представления
```

### Контекст

```typescript
.context((types) => ({
  // Обязательные поля
  field: types.string.required(defaultValue),
  field: types.number.required(defaultValue),
  field: types.boolean.required(defaultValue),
  field: types.array.required(defaultValue),
  field: types.enum.required(values),

  // Опциональные поля
  field: types.string.optional(),
  field: types.number.optional(),
  field: types.boolean.optional(),
  field: types.array.optional(),
  field: types.enum.optional(values),
}))
```

### Состояния

```typescript
.states({
  stateName: {
    nextState: conditions,
    anotherState: conditions,
  }
})
```

### Процессы

```typescript
.processes((process) => ({
  processName: process(config?)
    .action(fn)
    .success(handler)
    .error(handler)
}))
```

### Реакции

```typescript
.reactions((reaction) => [
  [
    ["state1", "state2"],
    reaction(config?)
      .filter(conditions)
      .equal(handler)
  ]
])
```

### Представление

```typescript
.view({
  render: ({ context, html, update, ref }) => html`...`,
  style: ({ css }) => css`...`
})
```

## 🎨 Примеры

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
        ${context.error ? html`<div class="error">${context.error}</div>` : null}
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

        // Имитация отправки на сервер
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

        ${context.errors.length > 0
          ? html` <div class="errors">${context.errors.map((error) => html`<div class="error">${error}</div>`)}</div> `
          : null}
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

## 🔍 Отладка

MetaFor предоставляет встроенные инструменты отладки:

```typescript
// Включение отладки
window.debugMetaFor = true

// Получение снапшота состояния
const element = document.querySelector("metafor-my-component")
const snapshot = element.getSnapshot()
console.log(snapshot)
```

## 📚 Дополнительные ресурсы

- [Примеры проектов](https://github.com/metafor/examples)
- [API документация](https://metafor.dev/api)
- [Руководство по миграции](https://metafor.dev/migration)
- [Сообщество](https://github.com/metafor/metafor/discussions)

## 🤝 Вклад в проект

Мы приветствуем вклад в развитие MetaFor! Это закрытый репозиторий, поэтому для участия в разработке свяжитесь с командой проекта.
