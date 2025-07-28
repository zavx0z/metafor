# Реакции (Reactions)

Реакции позволяют обрабатывать внешние события через декларативные фильтры. Они автоматически срабатывают при получении сообщений, соответствующих заданным условиям.

## Основные концепции

### Декларативные фильтры

Реакции используют декларативные фильтры для определения, когда они должны сработать:

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
  ]
])
```

### Автоматическое срабатывание

Реакции срабатывают автоматически при получении соответствующих сообщений:

```typescript
// Реакция сработает автоматически при получении сообщения
element.dispatchEvent(
  new CustomEvent("channel", {
    detail: {
      meta: { tag: "user" },
      patch: { op: "replace", path: "/context", value: 42 },
    },
    bubbles: true,
    composed: true,
  })
)
```

## Структура реакций

### Базовый синтаксис

```typescript
.reactions((reaction) => [
  [
    ["state1", "state2"], // Состояния, в которых активна реакция
    reaction(config?)
      .filter(conditions)
      .equal(handler)
  ]
])
```

### Состояния

Первый элемент массива определяет состояния, в которых реакция активна:

```typescript
.reactions((reaction) => [
  [
    ["idle"],           // Только в состоянии idle
    reaction()...
  ],
  [
    ["idle", "loading"], // В состояниях idle и loading
    reaction()...
  ],
  [
    ["idle", "processing"],              // Во всех состояниях
    reaction()...
  ]
])
```

### Конфигурация

```typescript
reaction() // Без метаданных
reaction({ title: "Моя реакция" }) // С заголовком
reaction({
  title: "Моя реакция",
  description: "Описание реакции",
}) // С заголовком и описанием
```

### Фильтры

Фильтры определяют условия, при которых реакция должна сработать:

```typescript
.filter({
  tag: "user",           // Фильтр по тегу
  index: 5,              // Фильтр по индексу
  timestamp: 1640995200000, // Фильтр по временной метке
  op: "replace",         // Фильтр по операции
  path: "/context",      // Фильтр по пути
  value: { gt: 0 }       // Фильтр по значению
})
```

### Обработчик

```typescript
.equal(({ update, context, meta, patch }) => {
  // Обработка события
  update({ newValue: patch.value })
})
```

**Параметры:**

- `update` — функция для обновления контекста
- `context` — текущий контекст компонента
- `meta` — метаданные сообщения
- `patch` — данные патча

## Фильтры реакций

### Фильтр по тегу (tag)

```typescript
.filter({
  // Прямое сравнение
  tag: "user",                    // тег должен быть "user"

  // Расширенные условия
  tag: { eq: "user" },           // равно
  tag: { notEq: "system" },      // не равно
  tag: { startsWith: "user" },   // начинается с
  tag: { endsWith: "admin" },    // заканчивается на
  tag: { include: "test" },      // содержит подстроку
  tag: { notInclude: "temp" },   // не содержит подстроку
  tag: { pattern: /^user/ },     // соответствует паттерну
  tag: { length: { min: 3 } },   // длина
  tag: { between: ["a", "z"] }   // между двумя строками
})
```

### Фильтр по индексу (index)

```typescript
.filter({
  // Прямое сравнение
  index: 5,                       // индекс должен быть 5

  // Расширенные условия
  index: { eq: 5 },              // равно
  index: { notEq: 0 },           // не равно
  index: { gt: 0 },              // больше
  index: { gte: 1 },             // больше или равно
  index: { lt: 100 },            // меньше
  index: { lte: 50 },            // меньше или равно
  index: { between: [1, 10] }    // между двумя числами
})
```

### Фильтр по временной метке (timestamp)

```typescript
.filter({
  // Прямое сравнение
  timestamp: 1640995200000,       // временная метка должна быть равна

  // Расширенные условия
  timestamp: { eq: 1640995200000 }, // равно
  timestamp: { gt: 1640995200000 }, // больше
  timestamp: { gte: 1640995200000 }, // больше или равно
  timestamp: { lt: 1640995200000 },  // меньше
  timestamp: { lte: 1640995200000 }, // меньше или равно
  timestamp: { between: [1640995200000, 1640995300000] } // диапазон
})
```

### Фильтр по операции (op)

```typescript
.filter({
  op: "replace",  // операция должна быть replace
  op: "add",      // операция должна быть add
  op: "remove",   // операция должна быть remove
  op: "test"      // операция должна быть test
})
```

### Фильтр по пути (path)

```typescript
.filter({
  path: "/context",  // путь должен быть /context
  path: "/state",    // путь должен быть /state
  path: "/"          // путь должен быть корневым
})
```

### Фильтр по значению (value)

Поддерживает все типы значений с расширенными условиями:

```typescript
.filter({
  // Строковые значения
  value: "active",                    // прямое сравнение
  value: { eq: "active" },           // равно
  value: { startsWith: "user" },     // начинается с
  value: { include: "test" },        // содержит подстроку
  value: { pattern: /^[a-z]+$/ },    // соответствует паттерну

  // Числовые значения
  value: 42,                         // прямое сравнение
  value: { eq: 42 },                // равно
  value: { gt: 0 },                 // больше
  value: { gte: 18 },               // больше или равно
  value: { between: [0, 100] },     // диапазон

  // Булевы значения
  value: true,                       // прямое сравнение
  value: { eq: true },              // равно

  // Массивы
  value: [1, 2, 3],                 // прямое сравнение
  value: { length: { gt: 0 } },     // длина
  value: { includes: "admin" },     // содержит элемент
  value: { isEmpty: false },        // не пустой

  // Null/undefined
  value: { null: true },            // значение null
  value: { null: false },           // значение не null
})
```

## Примеры использования

### Простая реакция

```typescript
MetaFor("message-handler")
  .context((types) => ({
    messageCount: types.number.required(0),
    lastMessage: types.string.optional(),
  }))
  .states({
    idle: {},
    processing: {},
  })
  .reactions((reaction) => [
    [
      ["idle", "processing"],
      reaction()
        .filter({ tag: "user" })
        .equal(({ update, patch }) => {
          update({
            messageCount: patch.value + 1,
            lastMessage: `Получено сообщение: ${patch.value}`,
          })
        }),
    ],
  ])
```

### Реакция с множественными фильтрами

```typescript
MetaFor("data-processor")
  .context((types) => ({
    data: types.array.required([]),
    processedCount: types.number.required(0),
    lastProcessed: types.number.required(0),
  }))
  .states({
    idle: {},
    active: {},
  })
  .reactions((reaction) => [
    [
      ["idle", "active"],
      reaction({ title: "Обработка данных" })
        .filter({
          tag: "data",
          op: "replace",
          path: "/context",
          value: { length: { gt: 0 } },
        })
        .equal(({ update, patch, meta }) => {
          update({
            data: patch.value,
            processedCount: meta.index || 0,
            lastProcessed: Date.now(),
          })
        }),
    ],
  ])
```

### Реакция на системные события

```typescript
MetaFor("system-monitor")
  .context((types) => ({
    systemStatus: types.string.required("ok"),
    errorCount: types.number.required(0),
    lastError: types.string.optional(),
  }))
  .states({
    running: {},
    error: {},
  })
  .reactions((reaction) => [
    [
      ["running", "error"], // Во всех состояниях
      reaction({ title: "Системные уведомления" })
        .filter({
          tag: "system",
          op: "replace",
          path: "/context",
        })
        .equal(({ update, patch }) => {
          if (patch.value.status === "error") {
            update({
              systemStatus: "error",
              errorCount: patch.value.count || 0,
              lastError: patch.value.message,
            })
          } else {
            update({
              systemStatus: "ok",
              lastError: "",
            })
          }
        }),
    ],
  ])
```

### Реакция с валидацией

```typescript
MetaFor("form-validator")
  .context((types) => ({
    formData: types.object.required({
      name: types.string.required(""),
      email: types.string.required(""),
    }),
    errors: types.array.required([]),
    isValid: types.boolean.required(false),
  }))
  .states({
    editing: {},
    validating: {},
  })
  .reactions((reaction) => [
    [
      ["editing", "validating"],
      reaction({ title: "Валидация формы" })
        .filter({
          tag: "form",
          op: "replace",
          path: "/context",
          value: { name: { length: { gt: 0 } } },
        })
        .equal(({ update, patch }) => {
          const errors = []
          const data = patch.value

          if (data.name.length < 2) {
            errors.push("Имя должно содержать минимум 2 символа")
          }

          if (!data.email.includes("@")) {
            errors.push("Некорректный email")
          }

          update({
            errors,
            isValid: errors.length === 0,
          })
        }),
    ],
  ])
```

## Лучшие практики

### 1. Используйте специфичные фильтры

```typescript
// ✅ Хорошо - специфичные фильтры
.filter({
  tag: "user",
  op: "replace",
  path: "/context",
  value: { gt: 0 }
})

// ❌ Плохо - слишком общие фильтры
.filter({
  tag: "user" // Может сработать на любые сообщения с тегом user
})
```

### 2. Группируйте связанные реакции

```typescript
// ✅ Хорошо - логическая группировка
.reactions((reaction) => [
  // Реакции на пользовательские события
  [
    ["idle", "active"],
    reaction({ title: "Пользовательские сообщения" })
      .filter({ tag: "user" })
      .equal(handleUserMessage)
  ],
  [
    ["idle", "active"],
    reaction({ title: "Системные уведомления" })
      .filter({ tag: "system" })
      .equal(handleSystemMessage)
  ]
])
```

### 3. Используйте осмысленные имена

```typescript
// ✅ Хорошо - понятные имена
reaction({ title: "Обработка пользовательских сообщений" })
reaction({ title: "Валидация формы" })
reaction({ title: "Системные уведомления" })

// ❌ Плохо - непонятные имена
reaction({ title: "handler1" })
reaction({ title: "process" })
reaction({ title: "update" })
```

### 4. Обрабатывайте ошибки

```typescript
// ✅ Хорошо - обработка ошибок
.equal(({ update, patch }) => {
  try {
    const data = JSON.parse(patch.value)
    update({ processedData: data })
  } catch (error) {
    update({ error: "Некорректные данные" })
  }
})

// ❌ Плохо - отсутствие обработки ошибок
.equal(({ update, patch }) => {
  const data = JSON.parse(patch.value) // Может упасть
  update({ processedData: data })
})
```

### 5. Используйте типизацию

```typescript
// ✅ Хорошо - типизированные данные
.equal(({ update, patch }: {
  update: UpdateFn,
  patch: { value: UserData }
}) => {
  update({ user: patch.value })
})

// ❌ Плохо - отсутствие типизации
.equal(({ update, patch }) => {
  update({ user: patch.value }) // patch.value: any
})
```

## Отладка

### Включение отладки

```typescript
// Включение отладки реакций
window.debugMetaFor = true
```

### Логирование

При включенной отладке MetaFor автоматически логирует срабатывание реакций:

```
[DEBUG] Reaction "Обработка сообщений" triggered
[DEBUG] Filter conditions: { tag: "user", op: "replace" }
[DEBUG] Reaction handler executed
```

### Тестирование реакций

```typescript
// Создание тестового сообщения
const element = document.querySelector("metafor-my-component")

element.dispatchEvent(
  new CustomEvent("channel", {
    detail: {
      meta: { tag: "user" },
      patch: {
        op: "replace",
        path: "/context",
        value: 42,
      },
    },
    bubbles: true,
    composed: true,
  })
)

// Проверка результата
await Bun.sleep(10)
const snapshot = element.getSnapshot()
console.log("Updated context:", snapshot.context)
```

## Производительность

### Фильтрация на уровне состояния

Реакции проверяются только в указанных состояниях:

```typescript
.reactions((reaction) => [
  [
    ["idle"], // Реакция активна только в состоянии idle
    reaction()...
  ]
])
```

### Эффективные фильтры

Используйте простые фильтры для лучшей производительности:

```typescript
// ✅ Хорошо - простые фильтры
.filter({
  tag: "user",
  op: "replace"
})

// ❌ Плохо - сложные фильтры
.filter({
  tag: { pattern: /^user.*admin$/ },
  value: {
    every: {
      gt: 0,
      lt: 100
    }
  }
})
```

## Ограничения

### Нет доступа к DOM

```typescript
// ❌ Неправильно - нет доступа к DOM в реакциях
.equal(({ update, patch }) => {
  document.getElementById('button').click() // Ошибка!
  update({ clicked: true })
})

// ✅ Правильно - обновление через контекст
.equal(({ update, patch }) => {
  update({ shouldClick: true })
})
```

### Нет асинхронных обработчиков

```typescript
// ❌ Неправильно - нет async/await в обработчиках
.equal(async ({ update, patch }) => {
  const result = await fetch('/api/data') // Ошибка!
  update({ data: await result.json() })
})

// ✅ Правильно - синхронные обработчики
.equal(({ update, patch }) => {
  update({ shouldFetch: true })
})
```

### Нет вложенных реакций

```typescript
// ❌ Неправильно - нет вложенных реакций
.equal(({ update, patch }) => {
  // Вызов другой реакции
  this.handleOtherReaction(patch) // Ошибка!
  update({ processed: true })
})

// ✅ Правильно - отдельные реакции
.equal(({ update, patch }) => {
  update({ triggerOtherReaction: true })
})
```

## Интеграция с процессами

Реакции могут работать вместе с процессами:

```typescript
MetaFor("integrated-component")
  .context((types) => ({
    data: types.array.required([]),
    isLoading: types.boolean.required(false),
    triggerProcess: types.boolean.required(false),
  }))
  .states({
    idle: { loading: { isLoading: true } },
    loading: { idle: { isLoading: false } },
  })
  .processes((process) => ({
    fetchData: process()
      .action(async ({ context }) => {
        const response = await fetch("/api/data")
        return await response.json()
      })
      .success(({ update, data }) => {
        update({ data, isLoading: false })
      }),
  }))
  .reactions((reaction) => [
    [
      ["idle"],
      reaction()
        .filter({ tag: "fetch" })
        .equal(({ update }) => {
          update({ triggerProcess: true })
        }),
    ],
  ])
```
