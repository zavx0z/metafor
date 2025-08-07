# Правила MetaFor для AI агента

## Концепция фреймворка

MetaFor — это фреймворк для создания веб-компонентов на основе конечных автоматов. Каждый компонент является изолированным актором со своим состоянием, контекстом и логикой переходов.

## Архитектура компонента

### 1. Context — типизированное состояние

Контекст содержит **только примитивные типы данных**:

```typescript
.context((types) => ({
  // Строки
  name: types.string.required("Гость"),                    // обязательное поле
  email: types.string.optional(),                          // опциональное поле
  title: types.string.required("Заголовок")({ title: "Название" }), // с метаданными

  // Числа
  age: types.number.required(18),
  score: types.number.optional(),
  count: types.number.required(0)({ title: "Счетчик" }),

  // Булевы значения
  isActive: types.boolean.required(true),
  isVerified: types.boolean.optional(),

  // Перечисления (enum)
  role: types.enum("user", "admin", "moderator").required("user"),
  status: types.enum("draft", "published", "archived").optional(),

  // Массивы (только примитивов)
  tags: types.array.required(["default"]),
  categories: types.array.optional(),
  selectedIds: types.array.required([])({ title: "Выбранные ID" })
}))
```

**Правила:**

- Используй только примитивные типы: string, number, boolean, enum, array
- НЕ храни объекты в контексте
- Каждое поле может быть required или optional
- optional поля по умолчанию имеют значение null
- Метаданные добавляются через вызов функции: `({ title: "Описание" })`

### 2. Core — хранилище сложных данных

Core содержит сложные объекты, сервисы и DOM ссылки:

```typescript
.core((ref) => ({
  // Коллекции и объекты
  users: new Map<number, User>(),
  cache: new LRUCache(),
  settings: { theme: 'dark', lang: 'ru' },

  // Соединения и сервисы
  socket: null as WebSocket | null,
  apiService: new ApiService(),

  // Ссылки на DOM элементы
  formRef: ref(),        // создает ссылку на элемент
  inputRef: ref(),
  buttonRef: ref()
}))
```

**Правила:**

- Храни здесь любые сложные объекты
- ref() используется ТОЛЬКО для DOM элементов

### 3. States — конечный автомат

Состояния определяют узлы автомата и условия переходов:

```typescript
.states({
  // Начальное состояние
  idle: {
    loading: { userId: { gt: 0 } },        // переход при userId > 0
    error: {}                              // переход без условий
  },

  // Промежуточные состояния
  loading: {
    success: { data: { notEq: null } },    // переход при наличии данных
    error: { error: { notEq: "" } }        // переход при наличии ошибки
  },

  // Финальные состояния
  success: {
    idle: {},                              // возврат к началу
    editing: { mode: { eq: "edit" } }      // переход в режим редактирования
  },

  error: {
    idle: {},                              // возврат к началу
    retry: { retryCount: { lt: 3 } }       // повтор при retryCount < 3
  }
})
```

**Условия переходов:**

Для чисел:

- `eq: 5` — равно
- `gt: 10` — больше
- `gte: 0` — больше или равно
- `lt: 100` — меньше
- `lte: 50` — меньше или равно
- `between: [0, 100]` — диапазон

Для строк:

- `eq: "admin"` — равно
- `startsWith: "user_"` — начинается с
- `endsWith: ".pdf"` — заканчивается на
- `include: "test"` — содержит подстроку
- `pattern: /@gmail\.com$/` — регулярное выражение
- `length: { min: 2, max: 50 }` — длина строки

Для булевых значений:

- `eq: true` — равно
- `notEq: false` — не равно

Для массивов:

- `length: { gt: 0 }` — количество элементов
- `includes: "admin"` — содержит элемент
- `isEmpty: false` — не пустой

### 4. Processes — действия при входе в состояния

```typescript
.processes((process) => ({
  // Процесс для состояния "loading"
  loading: process({
    title: "Загрузка данных",
    description: "Загружает данные пользователя"
  })
    .action(async ({ context, core }) => {
      // Асинхронная логика
      const response = await fetch(`/api/users/${context.userId}`)
      const user = await response.json()
      return { user, timestamp: Date.now() }
    })
    .success(({ update, data, core }) => {
      // Синхронная обработка успеха
      core.users.set(data.user.id, data.user)
      update({
        userName: data.user.name,
        lastUpdate: data.timestamp,
        error: ""
      })
    })
    .error(({ update, error }) => {
      // Синхронная обработка ошибки
      update({
        error: error.message,
        retryCount: context.retryCount + 1
      })
    }),

  // Процесс для состояния "success"
  success: process()
    .action(() => {
      // Синхронное действие
      localStorage.setItem('lastSuccess', Date.now().toString())
      return { saved: true }
    })
    .success(({ update }) => {
      update({ status: "completed" })
    })
}))
```

**Правила:**

- Имя процесса = имя состояния
- action может быть async или sync
- success и error всегда синхронные
- Процесс выполняется при входе в состояние

### 5. Reactions — обработка сообщений от других компонентов

```typescript
// Сохрани хеши компонентов для фильтрации
const childUserHash = "abc123..." // хеш дочернего user компонента
const childFormHash = "def456..." // хеш дочернего form компонента

  .reactions((reaction) => [
    // Реакция активна в состояниях idle и loading
    [
      ["idle", "loading"], // НЕ используй ["*"]
      reaction({ title: "Обработка сообщений от user компонента" })
        .filter({
          meta: childUserHash, // хеш меты компонента-отправителя
          op: "replace", // операция: "add" | "replace" | "remove" | "test"
          path: "/context", // путь: "/" | "/context" | "/state"
          value: { userId: { gt: 0 } }, // условия на значение
        })
        .equal(({ update, patch, context, core, meta }) => {
          // Обработка сообщения
          const user = core.users.get(patch.value.userId)
          update({
            selectedUserName: user?.name || "Неизвестный",
            lastMessageTime: meta.timestamp,
          })
        }),
    ],

    // Реакция на добавление компонента
    [
      ["idle"],
      reaction({ title: "Компонент добавлен" })
        .filter({
          op: "add",
          path: "/",
        })
        .equal(({ patch }) => {
          console.log("Добавлен компонент:", patch.value)
        }),
    ],
  ])
```

**Фильтры реакций:**

- `tag` — хеш компонента-отправителя
- `op` — операция: "add" | "replace" | "remove" | "test"
- `path` — путь изменения: "/" | "/context" | "/state"
- `value` — условия на значение (как в states)
- `index` — индекс сообщения
- `timestamp` — временная метка

### 6. View — представление компонента

```typescript
.view({
  render: ({ context, state, core, html, when, repeat, choose, ref, update }) => {
    return html`
      <div class="component state-${state}">
        <!-- Отображение в зависимости от состояния -->
        ${choose(state, [
          ["idle", () => html`
            <button @click=${() => update({ userId: 123 })}>
              Загрузить пользователя
            </button>
          `],
          ["loading", () => html`
            <div class="spinner">Загрузка...</div>
          `],
          ["success", () => html`
            <form ${ref(core.formRef)}>
              <input
                ${ref(core.inputRef)}
                .value=${context.userName}
                @input=${(e) => update({ userName: e.target.value })}
              />
              <button ${ref(core.buttonRef)} type="submit">
                Сохранить
              </button>
            </form>
          `],
          ["error", () => html`
            <div class="error">${context.error}</div>
            <button @click=${() => update({ retryCount: 0, userId: context.userId })}>
              Повторить
            </button>
          `]
        ])}

        <!-- Условный рендеринг -->
        ${when(context.isLoading,
          () => html`<div class="overlay">Обработка...</div>`
        )}

        <!-- Циклы с ключами -->
        ${repeat(
          context.selectedIds,
          (id) => id,  // ключ для оптимизации
          (id) => {
            const user = core.users.get(id)
            return html`<div>${user?.name || "Загрузка..."}</div>`
          }
        )}
      </div>
    `
  },

  style: ({ css }) => css`
    .component {
      padding: 1rem;
    }

    .state-loading {
      opacity: 0.6;
    }

    .error {
      color: red;
    }
  `,

  onMount: ({ core }) => {
    // Инициализация после монтирования
    if (core.socket) {
      core.socket.addEventListener('message', core.handleMessage)
    }
  },

  onDestroy: ({ core }) => {
    // Очистка при уничтожении
    if (core.socket) {
      core.socket.close()
    }
  }
})
```

**Директивы HTML:**

- `@event` — обработчики событий
- `?attribute` — булевы атрибуты
- `.property` — свойства элементов
- `${ref(core.refName)}` — привязка DOM элемента

## Передача данных между компонентами

### Передача контекста и core дочерним компонентам

```typescript
// Сохрани хеши дочерних компонентов
const userDetailsHash = MetaFor("user-details")
  .context((types) => ({ userId: types.number.required(0) }))
  // ... остальная конфигурация
  .view(/* ... */)

const messengerHash = MetaFor("messenger")
  .context((types) => ({ message: types.string.required("") }))
  // ... остальная конфигурация
  .view(/* ... */)

  // В родительском компоненте
  .view({
    render: ({ context, core, html }) => html`
    <div>
      <!-- Передача контекста -->
      <meta-${userDetailsHash}
        context=${{
          userId: context.selectedUserId,
        }}>
      </meta-${userDetailsHash}>
      
      <!-- Передача core объектов -->
      <meta-${messengerHash}
        core=${{
          socket: core.socket,
          apiService: core.apiService,
        }}>
      </meta-${messengerHash}>
    </div>
  `,
  })
```

## Создание компонента

```typescript
// Создание компонента возвращает хеш
const hash = MetaFor("user-profile")
  .context((types) => ({
    userId: types.number.required(0),
    userName: types.string.required(""),
  }))
  .states({
    idle: { loading: { userId: { gt: 0 } } },
    loading: { success: {}, error: {} },
    success: { idle: {} },
    error: { idle: {} },
  })
  .core((ref) => ({
    users: new Map(),
    formRef: ref(),
  }))
  .processes((process) => ({
    loading: process()
      .action(async ({ context }) => {
        const response = await fetch(`/api/users/${context.userId}`)
        return await response.json()
      })
      .success(({ update, data }) => {
        update({ userName: data.name })
      })
      .error(({ update, error }) => {
        update({ error: error.message })
      }),
  }))
  .reactions((reaction) => [])
  .view({
    render: ({ context, html }) => html` <div>${context.userName}</div> `,
  })

// Используй полученный хеш для создания элемента
document.body.innerHTML = `<meta-${hash}></meta-${hash}>`
```

## Важные правила

1. **Контекст** — только примитивы (string, number, boolean, enum, array)
2. **Core** — любые сложные объекты, ref() для DOM
3. **States** — условия переходов основаны на полях контекста
4. **Processes** — имя процесса = имя состояния
5. **Reactions** — tag это хеш компонента, а не произвольная строка
6. **View** — используй полученный хеш для создания элементов

## Чек-лист

- [ ] Контекст содержит только примитивы
- [ ] Сложные объекты вынесены в core
- [ ] ref() используется для DOM элементов
- [ ] Имена процессов совпадают с именами состояний
- [ ] В реакциях указаны конкретные состояния (не "\*")
- [ ] tag в фильтрах реакций — это хеш компонента
- [ ] Используется хеш для создания элементов акторов
