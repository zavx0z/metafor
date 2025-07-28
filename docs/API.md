# API Reference

Полный справочник по API MetaFor.

## MetaFor(tag: string)

Создает новый экземпляр MetaFor с указанным тегом компонента.

```typescript
MetaFor("my-component")
```

**Параметры:**

- `tag` — уникальный тег компонента (string)

**Возвращает:** Chain API для конфигурации компонента

## Chain API

### .context(schema)

Определяет типизированную схему контекста компонента.

```typescript
.context((types) => ({
  name: types.string.required("Anonymous"),
  age: types.number.required(18),
  isActive: types.boolean.required(false),
}))
```

**Параметры:**

- `schema` — функция, возвращающая схему контекста

**Поддерживаемые типы:**

- `types.string.required(default?)` / `types.string.optional(default?)`
- `types.number.required(default?)` / `types.number.optional(default?)`
- `types.boolean.required(default?)` / `types.boolean.optional(default?)`
- `types.array.required(default?)` / `types.array.optional(default?)`
- `types.enum(...values).required(default?)` / `types.enum(...values).optional(default?)`

### .states(config)

Определяет состояния автомата и условия переходов.

```typescript
.states({
  idle: { loading: {} },
  loading: {
    success: { isSuccess: true },
    error: { hasError: true }
  },
  success: { idle: {} },
  error: { idle: {} },
})
```

**Параметры:**

- `config` — объект с состояниями и условиями переходов

### .core()

Инициализирует ядро компонента. Обязательный вызов перед процессами и реакциями.

```typescript
.core()
```

### .processes(config)

Определяет асинхронные процессы с обработкой успеха и ошибок.

```typescript
.processes((process) => ({
  login: process({ title: "Авторизация" })
    .action(async ({ context }) => {
      // Основная логика
      return await fetch('/api/login', {
        method: 'POST',
        body: JSON.stringify(context)
      }).then(r => r.json())
    })
    .success(({ update, data }) => {
      // Обработка успеха
      update({ isAuthenticated: true, user: data })
    })
    .error(({ update, error }) => {
      // Обработка ошибки
      update({ error: error.message })
    })
}))
```

**Параметры:**

- `config` — функция, возвращающая объект с процессами

### .reactions(config)

Определяет реакции на внешние события.

```typescript
.reactions((reaction) => [
  [
    ["idle", "loading"],
    reaction({ title: "Обработка сообщений" })
      .filter({
        tag: "user",
        op: "replace",
        path: "/context"
      })
      .equal(({ update, context, meta, patch }) => {
        update({ lastMessage: patch.value })
      })
  ]
])
```

**Параметры:**

- `config` — функция, возвращающая массив реакций

### .view(config)

Определяет представление компонента.

```typescript
.view({
  render: ({ context, html, update, ref }) => html`
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

**Параметры:**

- `config.render` — функция рендеринга
- `config.style` — функция стилей (опционально)

## Типы данных

### ContextSchema

```typescript
interface ContextSchema {
  [key: string]: TypeDefinition
}

interface TypeDefinition {
  required: (defaultValue?: any) => RequiredTypeDefinition
  optional: (defaultValue?: any) => OptionalTypeDefinition
}
```

### StateConfig

```typescript
interface StateConfig {
  [stateName: string]: {
    [nextState: string]: TransitionConditions
  }
}

interface TransitionConditions {
  [fieldName: string]: ConditionDefinition
}
```

### ProcessConfig

```typescript
interface ProcessConfig {
  title?: string
  description?: string
}

interface ProcessChain<C> {
  action: <Res>(fn: ActionFunction<C, Res>) => ActionChain<C, Res>
}

interface ActionChain<C, Res> {
  success: (handler: SuccessHandler<C, Res>) => ActionChain<C, Res>
  error: (handler: ErrorHandler<C, Res>) => ActionChain<C, Res>
}
```

### ReactionConfig

```typescript
interface ReactionConfig {
  title?: string
  description?: string
}

interface ReactionChain {
  filter: (conditions: FilterConditions) => ReactionChain
  equal: (handler: ReactionHandler) => ReactionChain
}
```

## Условия переходов

### Строковые условия

```typescript
{
  eq: string // равно
  notEq: string // не равно
  startsWith: string // начинается с
  endsWith: string // заканчивается на
  include: string // содержит подстроку
  notInclude: string // не содержит подстроку
  notStartsWith: string // не начинается с
  notEndsWith: string // не заканчивается на
  pattern: RegExp // соответствует паттерну
  length: number | { min: number, max: number } // длина
  between: [string, string] // между двумя строками
}
```

### Числовые условия

```typescript
{
  eq: number // равно
  notEq: number // не равно
  gt: number // больше
  gte: number // больше или равно
  lt: number // меньше
  lte: number // меньше или равно
  notGt: number // не больше
  notGte: number // не больше или равно
  notLt: number // не меньше
  notLte: number // не меньше или равно
  between: [number, number] // между двумя числами
}
```

### Булевы условия

```typescript
{
  eq: boolean // равно
  notEq: boolean // не равно
  logicalEq: boolean // логическое равенство
}
```

### Условия для массивов

```typescript
{
  length: number | { min: number, max: number } // длина
  includes: any // содержит элемент
  notIncludes: any // не содержит элемент
  isEmpty: boolean // пустой/не пустой
  every: ConditionDefinition // все элементы
  some: ConditionDefinition // хотя бы один элемент
}
```

### Условия для enum

```typescript
{
  eq: string                  // равно
  notEq: string              // не равно
  oneOf: string[]            // одно из значений
  notOneOf: string[]         // не одно из значений
}
```

### Null/undefined условия

```typescript
{
  null: boolean               // значение null/не null
}
```

## Фильтры реакций

### FilterConditions

```typescript
interface FilterConditions {
  tag?: string | ConditionDefinition
  index?: number | ConditionDefinition
  timestamp?: number | ConditionDefinition
  op?: "replace" | "add" | "remove" | "test"
  path?: string
  value?: any | ConditionDefinition
}
```

## HTML Template API

### Директивы

```typescript
// Обработчики событий
@click=${(e) => handler(e)}
@input=${(e) => handler(e)}
@submit=${(e) => handler(e)}

// Булевы атрибуты
?disabled=${condition}
?hidden=${condition}
?required=${condition}

// Свойства элементов
.value=${value}
.src=${url}
.textContent=${text}

// Ссылки на элементы
${ref('elementName')}

// Условный рендеринг
${when(condition, template)}

// Циклы
${repeat(items, (item) => template)}

// Преобразование массивов
${map(items, (item) => transform(item))}
```

## Функции обратного вызова

### ActionFunction

```typescript
type ActionFunction<C, Res> = (params: { context: ExtractValues<C> }) => Res | Promise<Res>
```

### SuccessHandler

```typescript
type SuccessHandler<C, Res> = (params: { update: UpdateFunction<C>; data: Res }) => void
```

### ErrorHandler

```typescript
type ErrorHandler<C> = (params: { update: UpdateFunction<C>; error: Error }) => void
```

### ReactionHandler

```typescript
type ReactionHandler = (params: { update: UpdateFunction<any>; context: any; meta: any; patch: any }) => void
```

### UpdateFunction

```typescript
type UpdateFunction<C> = (updates: Partial<ExtractValues<C>>) => void
```

## Утилиты

### getSnapshot()

Получает текущее состояние компонента.

```typescript
const element = document.querySelector("metafor-my-component")
const snapshot = element.getSnapshot()
console.log(snapshot.context)
console.log(snapshot.state)
```

### onUpdate(callback)

Подписывается на изменения контекста.

```typescript
const unsubscribe = context.onUpdate((updated) => {
  console.log("Контекст обновлен:", updated)
})

// Отписка
unsubscribe()
```

## Отладка

### Включение отладки

```typescript
// Включение отладки
window.debugMetaFor = true
```

### Логирование

При включенной отладке MetaFor автоматически логирует:

- Переходы между состояниями
- Выполнение процессов
- Срабатывание реакций
- Обновления контекста

## Ограничения

### Нет доступа к DOM в процессах

```typescript
// ❌ Неправильно
.action(({ context }) => {
  document.getElementById('button').disabled = true
  return { result: "success" }
})

// ✅ Правильно
.action(({ context }) => {
  return { result: "success" }
})
.success(({ update, data }) => {
  update({ isButtonDisabled: true })
})
```

### Нет асинхронных обработчиков в реакциях

```typescript
// ❌ Неправильно
.equal(async ({ update, patch }) => {
  const data = await fetch('/api/data')
  update({ result: await data.json() })
})

// ✅ Правильно
.equal(({ update, patch }) => {
  update({ shouldFetch: true })
})
```

### Нет вложенных компонентов

```typescript
// ❌ Неправильно
render: ({ context, html }) => html`
  <div>
    <metafor-child-component></metafor-child-component>
  </div>
`

// ✅ Правильно
// Создайте отдельный компонент MetaFor("child-component")
```

## Примеры использования

### Полный пример компонента

```typescript
MetaFor("user-profile")
  .context((types) => ({
    user: types.object.required({
      id: types.number.required(0),
      name: types.string.required(""),
      email: types.string.required(""),
    }),
    isLoading: types.boolean.required(false),
    error: types.string.optional(),
  }))
  .states({
    idle: { loading: {} },
    loading: {
      success: { user: { id: { gt: 0 } } },
      error: { error: { notEq: "" } },
    },
    success: { idle: {} },
    error: { idle: {} },
  })
  .core()
  .processes((process) => ({
    fetchUser: process({ title: "Загрузка пользователя" })
      .action(async ({ context }) => {
        const response = await fetch(`/api/users/${context.user.id}`)
        if (!response.ok) {
          throw new Error("Пользователь не найден")
        }
        return await response.json()
      })
      .success(({ update, data }) => {
        update({ user: data, isLoading: false, error: "" })
      })
      .error(({ update, error }) => {
        update({ error: error.message, isLoading: false })
      }),
  }))
  .reactions((reaction) => [
    [
      ["idle", "loading", "success", "error"],
      reaction({ title: "Обновление пользователя" })
        .filter({ tag: "user", op: "replace" })
        .equal(({ update, patch }) => {
          update({ user: patch.value })
        }),
    ],
  ])
  .view({
    render: ({ context, html, update }) => html`
      <div class="user-profile">
        <h1>${context.user.name}</h1>
        <p>${context.user.email}</p>

        ${context.isLoading && html` <div class="loading">Загрузка...</div> `} ${context.error &&
        html` <div class="error">${context.error}</div> `}

        <button @click=${() => update({ isLoading: true })}>Обновить</button>
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

      button {
        padding: 8px 16px;
        background: #007bff;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
      }
    `,
  })
```

## Типы TypeScript

### Основные типы

```typescript
// Контекст
type ExtractValues<C> = {
  [K in keyof C]: C[K] extends RequiredTypeDefinition<infer T>
    ? T
    : C[K] extends OptionalTypeDefinition<infer T>
    ? T | null
    : never
}

// Состояния
type StateMachine<C> = {
  currentState: string
  context: ExtractValues<C>
  transitions: StateConfig
}

// Процессы
type Process<C, Res> = {
  title?: string
  description?: string
  action: ActionFunction<C, Res>
  success?: SuccessHandler<C, Res>
  error?: ErrorHandler<C>
}

// Реакции
type Reaction = {
  title?: string
  description?: string
  filter: FilterConditions
  handler: ReactionHandler
}
```

### Утилитарные типы

```typescript
// Обновление контекста
type Update<C> = (updates: Partial<ExtractValues<C>>) => void

// Метаданные
type Meta = {
  tag: string
  index?: number
  timestamp?: number
}

// Патч
type Patch = {
  op: "replace" | "add" | "remove" | "test"
  path: string
  value: any
}
```
