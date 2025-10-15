# MetaFor

> ⚠️ **Статус проекта**: MetaFor находится в активной фазе разработки. Документация может содержать неточности и может изменяться по мере развития фреймворка.  
> 🚨 **Использование в продакшене**: Использование в продакшене на свой страх и риск. Фреймворк еще не стабилен и может содержать критические изменения.

**MetaFor** — это современный VanillaJS фреймворк для создания real-time веб-приложений на основе контекстно-ориентированного конечного автомата с декларативным API, типобезопасностью и реактивностью. Работает как на клиенте, так и на сервере.

## 🚀 Основные возможности

- **Контекстно-ориентированный конечный автомат** — состояния и переходы зависят от контекста
- **Universal JavaScript** — работает как на клиенте, так и на сервере
- **Real-time обновления** — мгновенная реакция на изменения состояния без перезагрузки
- **Типобезопасность** — полная типизация TypeScript для всех компонентов
- **Реактивность** — автоматическое обновление UI при изменении состояния
- **Процессы** — действия с обработкой успеха/ошибок (асинхронные и синхронные)
- **Реакции** — декларативные фильтры для обработки внешних событий
- **Шаблонизация** — современный template API с `@zavx0z/template`
- **Zero-build** — работает без сборщиков и компиляции
- **Позиционные пути** — уникальные пути VDOM для каждого актора
- **Иерархия акторов** — управление деревом акторов с автоматической генерацией путей
- **Расширенные фильтры** — доступ к контексту в реакциях с декларативными условиями

## 🌐 Языковые версии

- **[English](doc.md)** - Английская документация (по умолчанию)
- **Русский** (текущая) - Русскоязычная документация

---

## 🎯 Быстрый старт

```typescript
const counter = MetaFor("counter")
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
  .reactions()
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

### 3. Core — хранилище сложных данных

Core — это объект для хранения сложных структур данных, сервисов и DOM ссылок, которые не должны храниться в контексте.

```typescript
.core((ref) => ({
  // Коллекции и объекты
  users: new Map<number, User>(),
  cache: new LRUCache(),
  settings: { theme: 'dark', lang: 'ru' },

  // Соединения и сервисы
  socket: null as WebSocket | null,
  apiService: new ApiService(),
  database: new DatabaseConnection(),

  // Ссылки на DOM элементы
  formRef: ref(),        // создает ссылку на форму
  inputRef: ref(),       // создает ссылку на input
  canvasRef: ref(),      // создает ссылку на canvas
  modalRef: ref()        // создает ссылку на модальное окно
}))
```

**Особенности Core:**

- **Хранение сложных объектов**: Map, Set, классы, сервисы
- **DOM элементы**: для прямого доступа к DOM элементам
- **Персистентность**: Core сохраняется между рендерами
- **Доступность**: Core доступен во всех процессах, реакциях и view

**Использование DOM элементов:**

```typescript
.view({
  render: ({ context, core, html, update }) => html`
    <form onsubmit=${(e) => {
      e.preventDefault()
      // работа с данными формы
    }}>
      <input
        type="text"
        value=${context.name}
      />
      <canvas></canvas>
    </form>
  `,

  onMount: ({ core }) => {
    // Доступ к DOM элементам после монтирования
    if (core.canvasRef.current) {
      const ctx = core.canvasRef.current.getContext('2d')
      // инициализация canvas
    }

    // Фокус на input
    core.inputRef.current?.focus()
  }
})
```

### 4. Процессы (Processes)

Процессы — это действия, выполняемые при входе в состояние. **ВАЖНО: Имя процесса должно точно совпадать с именем состояния.**

**Ключевые правила:**

- ✅ Имя процесса = имя состояния
- ✅ Процесс выполняется автоматически при входе в состояние
- ✅ action может быть async или sync
- ✅ success и error всегда синхронные

```typescript
.processes((process) => ({
  // Асинхронный процесс для состояния "loading"
  loading: process({
    label: "Авторизация",
    desc: "Процесс входа пользователя"
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

  // Синхронный процесс для состояния "save"
  save: process({
    label: "Сохранение данных"
  })
    .action(({ context, core }) => {
      // Синхронная логика
      const data = {
        name: context.name,
        email: context.email,
        timestamp: Date.now()
      }
      localStorage.setItem('userData', JSON.stringify(data))
      core.cache.set('lastSave', data)
      return data
    })
    .success(({ update, data }) => {
      update({
        lastSaved: data.timestamp,
        isDirty: false,
        saveError: ""
      })
    })
    .error(({ update, error }) => {
      update({
        saveError: error.message,
        isDirty: true
      })
    }),

  // Процесс без action (только для изменения контекста)
  reset: process()
    .success(({ update }) => {
      update({
        name: "",
        email: "",
        isDirty: false,
        error: ""
      })
    })
}))
```

### 5. Реакции (Reactions)

Реакции позволяют обрабатывать сообщения от других компонентов через декларативные фильтры. **ВАЖНО: `meta` в фильтре — это имя компонента-отправителя, а не произвольная строка.**

```typescript
// Сначала получаем имена компонентов для фильтрации
const userComponentName = "user-component" // имя user компонента
const adminComponentName = "admin-component" // имя admin компонента

  .reactions((reaction) => [
    [
      ["idle", "loading"], // Состояния, в которых активна реакция
      reaction({ label: "Обработка сообщений от user компонента" })
        .filter({
          meta: userComponentHash, // Хеш меты компонента-отправителя
          op: "replace", // Операция: "add" | "replace" | "remove" | "test"
          path: "/context", // Путь: "/" | "/context" | "/state"
          value: { userId: { gt: 0 } }, // Условия на значение
        })
        .equal(({ update, context, meta, actor, timestamp, patch, core }) => {
          // Обработка сообщения
          const user = core.users.get(patch.value.userId)
          update({
            selectedUser: user,
            lastMessageTime: timestamp,
            messageCount: context.messageCount + 1,
            actorIndex: actor.index, // Доступ к индексу актора
          })
        }),
    ],
    [
      ["idle"], // Реакция только в состоянии idle
      reaction({ label: "Обработка команд от admin компонента" })
        .filter({
          meta: adminComponentHash,
          op: "add",
          path: "/",
        })
        .equal(({ update, patch }) => {
          console.log("Получена команда:", patch.value)
          update({ adminCommand: patch.value })
        }),
    ],
  ])
```

**Фильтры реакций:**

- `meta` — имя компонента-отправителя (обязательно использовать переменную с именем)
- `op` — операция: `"add"` | `"replace"` | `"remove"` | `"test"`
- `path` — путь изменения: `"/"` | `"/context"` | `"/state"`
- `value` — условия на значение (как в states)
- `index` — индекс актора по отношению к братьям в родителе (для уникализации)
- `timestamp` — временная метка отправки сообщения

**Новые фильтры для массивов:**

- `in` — проверка вхождения значения в массив:
  - Для строк: `meta: { in: ["admin", "user"] }` или `actor: { in: ["actor-1", "actor-2"] }`
  - Для чисел: `value: { in: [1, 2, 3] }`
- `notIn` — проверка отсутствия значения в массиве:
  - Для строк: `meta: { notIn: ["banned", "suspended"] }` или `actor: { notIn: ["blocked-1", "blocked-2"] }`
  - Для чисел: `value: { notIn: [0, 4, 6] }`

### 6. Представление (View)

Представление определяет UI компонента с использованием `@zavx0z/template` API.

```typescript
.view({
  render: ({ context, html, update }) => html`
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
              value=${context.email}
              oninput=${(e) => update({ email: e.target.value })}
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

**HTML атрибуты:**

- `onclick`, `onchange` — обработчики событий: `onclick=${handler}`
- `attribute` — булевы атрибуты: `${isDisabled && "disabled"}`
- `value`, `class` — обычные атрибуты: `value=${text}`

**JavaScript выражения:**

````typescript
// Условный рендеринг с тернарным оператором
${context.isLoggedIn
  ? html`<div>Добро пожаловать, ${context.userName}!</div>`
  : html`<div>Пожалуйста, войдите в систему</div>`
}

// Условный рендеринг с логическим оператором
${context.isLoading && html`<div class="spinner">Загрузка...</div>`}

// Циклы с map
${context.items.map(item => html`<div>${item.name}</div>`)}

// Вложенные условия
${state === "idle"
  ? html`<div>Ожидание...</div>`
  : state === "loading"
    ? html`<div class="spinner">Загрузка...</div>`
    : state === "success"
      ? html`<div>Успешно!</div>`
      : html`<div class="error">Ошибка!</div>`
}

// Циклы с filter и map
${context.items
  .filter(item => item.visible)
  .map((item, index) => html`
    <li>
      ${index + 1}. ${item.name}
      <button onclick=${() => removeItem(item.id)}>Удалить</button>
    </li>
  `)
}

// Простое преобразование массива
${context.tags.map(tag => html`<span class="tag">${tag}</span>`)}

### 7. Передача данных между компонентами

MetaFor поддерживает передачу данных от родительского компонента к дочернему через атрибуты `context` и `core`.

```typescript
// Сначала создаем дочерние компоненты и получаем их имена
const childUserComponent = MetaFor("child-user")
  .context((types) => ({
    userId: types.number.required(0),
    userName: types.string.required(""),
  }))
  .states({ idle: {} })
  .core((ref) => ({
    displayRef: ref()
  }))
  .processes()
  .reactions()
  .view({
    render: ({ context, core, html }) => html`
      <div ${ref(core.displayRef)}>
        <p>User ID: ${context.userId}</p>
        <p>User Name: ${context.userName}</p>
      </div>
    `,
  })

const childMessengerComponent = MetaFor("child-messenger")
  .context((types) => ({
    message: types.string.required(""),
  }))
  .states({ idle: {} })
  .core()
  .processes()
  .reactions()
  .view({
    render: ({ context, core, html }) => html`
      <div class="messenger">
        <p>Сообщение: ${context.message}</p>
        ${core.socket ? html`<span class="status">🟢 Online</span>` : html`<span class="status">🔴 Offline</span>`}
      </div>
    `,
  })

// Родительский компонент
const parentHash = MetaFor("parent")
  .context((types) => ({
    selectedUserId: types.number.required(1),
    currentMessage: types.string.required("Hello!"),
  }))
  .states({ idle: {} })
  .core((ref) => ({
    socket: new WebSocket('ws://localhost:8080'),
    apiService: new ApiService(),
    users: new Map([
      [1, { name: "Иван" }],
      [2, { name: "Мария" }]
    ])
  }))
  .processes()
  .reactions()
  .view({
    render: ({ context, core, html }) => {
      const user = core.users.get(context.selectedUserId)
      return html`
        <div class="container">
          <h1>Родительский компонент</h1>

          <!-- Передача контекста -->
          <meta-child-user
            context=${{
              userId: context.selectedUserId,
              userName: user?.name || "Unknown"
            }}>
          </meta-child-user>

          <!-- Передача core объектов -->
          <meta-child-messenger
            context=${{
              message: context.currentMessage
            }}
            core=${{
              socket: core.socket,
              apiService: core.apiService
            }}>
          </meta-child-messenger>
        </div>
      `
    }
  })

// Создание корневого элемента
document.body.innerHTML = `<meta-${parentHash}></meta-${parentHash}>`
````

**Особенности передачи данных:**

**Context:**

- Передается через атрибут `context=${object}`
- Автоматически обновляется при изменении контекста родителя
- Содержит только примитивные типы данных

**Core:**

- Передается через атрибут `core=${object}`
- Позволяет передавать сложные объекты, сервисы, соединения
- Дочерний компонент получает доступ к объектам родителя

**Важно:**

- Сначала создайте дочерние компоненты и сохраните их имена
- Используйте имена в шаблонах: `<meta-${name}>`
- Компоненты автоматически регистрируются при первом вызове MetaFor

## 🏷️ Система компонентов

MetaFor использует автоматическую систему регистрации компонентов для обеспечения уникальности и изоляции:

### Как работают компоненты

1. **Имя компонента** — это идентификатор для регистрации
2. **Компонент регистрируется** автоматически при первом вызове MetaFor с данной конфигурацией
3. **Итоговый элемент** создается с именем компонента
4. **Регистрация происходит автоматически** при первом вызове MetaFor с данной конфигурацией

### Пример использования

```typescript
// Создание компонента
const component = MetaFor("user-profile")
  .context((types) => ({
    name: types.string.required(""),
    email: types.string.required(""),
  }))
  .states({ idle: {} })
  .core()
  .processes()
  .reactions()
  .view({
    render: ({ context, html }) => html`<div>${context.name}</div>`,
  })

// Создание элемента
document.body.innerHTML = `<meta-user-profile></meta-user-profile>`

// Получение элемента для работы
const element = document.querySelector(`meta-user-profile`)
```

### Преимущества системы

- **Уникальность**: Каждая конфигурация получает уникальное имя
- **Изоляция**: Компоненты с разной конфигурацией не конфликтуют
- **Автоматичность**: Не нужно придумывать уникальные имена элементов
- **Безопасность**: Исключены конфликты имен между компонентами

## 🔧 API Reference

### MetaFor(name: string, config?: { desc?: string; dev?: boolean })

Создает новый экземпляр MetaFor с указанным именем компонента.

**Важно:** Имя компонента используется для создания элемента с тегом `meta-${name}`.

```typescript
const component = MetaFor("my-component")
  .context(...)
  .states(...)
  .core(...)
  .processes(...)
  .reactions(...)
  .view(...)

// Элемент компонента: meta-my-component
document.body.innerHTML = `<meta-my-component></meta-my-component>`
```

### Chain API

MetaFor использует цепочку методов для конфигурации. Метод `.view()` возвращает компонент, который используется для создания элемента:

```typescript
const component = MetaFor("example")
  .context(schema) // Схема контекста
  .states(config) // Конфигурация состояний
  .core({}) // Инициализация ядра
  .processes(config) // Конфигурация процессов
  .reactions(config) // Конфигурация реакций
  .view(config) // Конфигурация представления и возврат компонента

// Создание элемента с именем компонента
document.body.innerHTML = `<meta-example></meta-example>`
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
const asyncCounterHash = MetaFor("async-counter")
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
  .reactions()
  .view({
    render: ({ context, html, update }) => html`
      <div class="counter">
        <h2>Счётчик: ${context.count}</h2>
        <button onclick=${() => update({ isLoading: true })} ?disabled=${context.isLoading}>
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

// Создание элемента
document.body.innerHTML = `<meta-${asyncCounterHash}></meta-${asyncCounterHash}>`
```

### Форма с валидацией

```typescript
const userFormHash = MetaFor("user-form")
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
  .reactions()
  .view({
    render: ({ context, html, update }) => html`
      <form
        @submit=${(e) => {
          e.preventDefault()
          update({ isSubmitting: true })
        }}>
        <div>
          <label>Имя:</label>
          <input value=${context.name} oninput=${(e) => update({ name: e.target.value })} placeholder="Введите имя" />
        </div>

        <div>
          <label>Email:</label>
          <input
            value=${context.email}
            oninput=${(e) => update({ email: e.target.value })}
            placeholder="Введите email"
            type="email" />
        </div>

        <div>
          <label>Возраст:</label>
          <input
            value=${context.age}
            oninput=${(e) => update({ age: parseInt(e.target.value) || 0 })}
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

// Создание элемента
document.body.innerHTML = `<meta-${userFormHash}></meta-${userFormHash}>`
```

### Передача контекста между компонентами

```typescript
// Сначала создаем дочерний компонент и получаем его имя
const childWidgetComponent = MetaFor("child-widget")
  .context((types) => ({
    message: types.string.required("Сообщение по умолчанию"),
    count: types.number.required(0),
  }))
  .states({ idle: {} })
  .core()
  .processes()
  .reactions()
  .view({
    render: ({ context, html }) => html`
      <div class="widget">
        <h3>Дочерний виджет</h3>
        <p>Полученное сообщение: ${context.message}</p>
        <p>Полученный счетчик: ${context.count}</p>
        <div class="status">Статус: ${context.count > 0 ? "Активен" : "Неактивен"}</div>
      </div>
    `,
    style: ({ css }) => css`
      .widget {
        padding: 15px;
        border: 1px solid #28a745;
        border-radius: 6px;
        margin-top: 15px;
        background: #f8f9fa;
      }

      .status {
        margin-top: 10px;
        padding: 5px 10px;
        background: #28a745;
        color: white;
        border-radius: 4px;
        text-align: center;
      }
    `,
  })

// Родительский компонент с динамическим обновлением
const parentHash = MetaFor("parent-dashboard")
  .context((types) => ({
    userMessage: types.string.required("Привет от родителя"),
    userCount: types.number.required(0),
    isLoading: types.boolean.required(false),
  }))
  .states({
    idle: { loading: {} },
    loading: { idle: {} },
  })
  .core()
  .processes((process) => ({
    loading: process()
      .action(async ({ context }) => {
        await new Promise((resolve) => setTimeout(resolve, 1000))
        return {
          userMessage: "Обновленное сообщение от родителя",
          userCount: context.userCount + 1,
        }
      })
      .success(({ update, data }) => {
        update({
          userMessage: data.userMessage,
          userCount: data.userCount,
          isLoading: false,
        })
      }),
  }))
  .reactions()
  .view({
    render: ({ context, html, update }) => html`
      <div class="dashboard">
        <h1>Родительский компонент</h1>
        <p>Сообщение: ${context.userMessage}</p>
        <p>Счетчик: ${context.userCount}</p>

        <button onclick=${() => update({ isLoading: true })} ?disabled=${context.isLoading}>
          ${context.isLoading ? "Обновление..." : "Обновить данные"}
        </button>

        <meta-${childWidgetHash}
          context=${{
            message: context.userMessage,
            count: context.userCount,
          }}></meta-${childWidgetHash}>
      </div>
    `,
    style: ({ css }) => css`
      .dashboard {
        padding: 20px;
        border: 2px solid #007bff;
        border-radius: 8px;
        margin: 20px;
      }

      button {
        padding: 10px 20px;
        background: #007bff;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        margin: 10px 0;
      }

      button:disabled {
        background: #ccc;
        cursor: not-allowed;
      }
    `,
  })

// Создание родительского элемента
document.body.innerHTML = `<meta-${parentHash}></meta-${parentHash}>`
```

## 🔍 Отладка

MetaFor предоставляет встроенные инструменты отладки:

```typescript
// Включение отладки
import { enableMetaForDebug } from "@zavx0z/metafor/debug/config"

enableMetaForDebug()

// Получение снапшота состояния
// Важно: используйте правильный элемент с именем компонента
const component = MetaFor("my-component").context(...).states(...).core(...).processes(...).reactions(...).view(...)
const element = document.querySelector(`meta-my-component`)
const snapshot = element.getSnapshot()
console.log(snapshot)
```

## 📚 Дополнительные ресурсы

- [Примеры проектов](https://github.com/metafor/examples)
- [API документация](https://api.metafor.space)
- [Руководство по миграции](https://migration.metafor.space)

## TODO

- Сократить кол-во eval-функций
  - Processes
    - action (параметры в process. импорт из модулей/модуля)
    - success (схема данных обновления контекста)
    - error (схема данных обновления контекста)
- Оптимизировать каналы
  - разделить патчи состояния и контекста по разным каналам
  - включить в жизненный цикл микротаски
