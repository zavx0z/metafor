# Инициализация частицы в MetaFor

## Введение

Инициализация частицы — это процесс создания и настройки частицы перед её использованием в приложении. Правильная инициализация обеспечивает корректную работу частицы и её взаимодействие с другими компонентами системы. В этом документе описаны различные способы инициализации частиц и рекомендации по их применению.

## Основные способы инициализации

### 1. Стандартная инициализация

Стандартный способ инициализации частицы включает создание частицы с указанием начального состояния и контекста:

```javascript
// Серверный код (TypeScript)
import { MetaFor } from "metafor"

const todoParticle = MetaFor("todo-list")
  .states("IDLE", "LOADING", "LOADED", "ERROR")
  .context((t) => ({
    items: t.array([]),
    isLoading: t.boolean(false),
    error: t.nullable(t.string(null)),
  }))
  .transitions([
    { from: "IDLE", to: [{ state: "LOADING", trigger: { isLoading: true } }] },
    { from: "LOADING", to: [{ state: "LOADED", trigger: { items: { length: { gt: 0 } } } }] },
    { from: "LOADING", to: [{ state: "ERROR", trigger: { error: { isNull: false } } }] },
    { from: "ERROR", to: [{ state: "IDLE", trigger: { error: null } }] },
  ])
  .actions({
    fetchItems: ({ context, transition }) => {
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
  .create({
    state: "IDLE",
    context: {
      items: [],
    },
  })
```

Для клиентского кода (VanillaJS):

```javascript
// Клиентский код (VanillaJS)
import { MetaFor } from "./metafor.js"

const todoParticle = MetaFor("todo-list")
  .states("IDLE", "LOADING", "LOADED", "ERROR")
  .context((t) => ({
    items: t.array([]),
    isLoading: t.boolean(false),
    error: t.nullable(t.string(null)),
  }))
  .transitions([
    { from: "IDLE", to: [{ state: "LOADING", trigger: { isLoading: true } }] },
    { from: "LOADING", to: [{ state: "LOADED", trigger: { items: { length: { gt: 0 } } } }] },
    { from: "LOADING", to: [{ state: "ERROR", trigger: { error: { isNull: false } } }] },
    { from: "ERROR", to: [{ state: "IDLE", trigger: { error: null } }] },
  ])
  .actions({
    fetchItems: ({ context, transition }) => {
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
  .create({
    state: "IDLE",
    context: {
      items: [],
    },
  })
```

В этом примере:

- Частица создается с начальным состоянием "IDLE"
- Контекст инициализируется с пустым массивом `items`
- Другие поля контекста инициализируются значениями по умолчанию

### 2. Инициализация с пользовательскими сервисами

Вы можете инициализировать частицу с пользовательскими сервисами, которые будут доступны в действиях:

```javascript
// Серверный код
import { MetaFor } from "metafor"

const todoParticle = MetaFor("todo-list")
  .states("IDLE", "LOADING", "LOADED", "ERROR")
  .context((t) => ({
    items: t.array([]),
    isLoading: t.boolean(false),
    error: t.nullable(t.string(null)),
  }))
  .transitions([
    { from: "IDLE", to: [{ state: "LOADING", trigger: { isLoading: true } }] },
    { from: "LOADING", to: [{ state: "LOADED", trigger: { items: { length: { gt: 0 } } } }] },
    { from: "LOADING", to: [{ state: "ERROR", trigger: { error: { isNull: false } } }] },
    { from: "ERROR", to: [{ state: "IDLE", trigger: { error: null } }] },
  ])
  .actions({
    fetchItems: ({ context, services }) => {
      context.update({ isLoading: true })

      services.api
        .getTodos()
        .then((data) => {
          context.update({ items: data, isLoading: false })
        })
        .catch((error) => {
          context.update({ error: error.message, isLoading: false })
        })
    },
  })
  .create({
    state: "IDLE",
    services: {
      api: {
        getTodos: () => fetch("/api/todos").then((response) => response.json()),
        addTodo: (todo) =>
          fetch("/api/todos", {
            method: "POST",
            body: JSON.stringify(todo),
            headers: { "Content-Type": "application/json" },
          }).then((response) => response.json()),
      },
      storage: {
        save: (key, value) => localStorage.setItem(key, JSON.stringify(value)),
        load: (key) => JSON.parse(localStorage.getItem(key) || "null"),
      },
    },
  })
```

### 3. Инициализация с обработчиками событий

При инициализации частицы можно указать обработчики событий, которые будут вызываться при изменении состояния или контекста:

```javascript
const todoParticle = MetaFor("todo-list")
  .states("IDLE", "LOADING", "LOADED", "ERROR")
  .context((t) => ({
    /* ... */
  }))
  .transitions([
    /* ... */
  ])
  .actions({
    /* ... */
  })
  .create({
    state: "IDLE",
    onTransition: (from, to) => {
      console.log(`Состояние изменилось с ${from} на ${to}`)
    },
    onUpdate: (context) => {
      console.log("Контекст обновлен:", context)
    },
  })
```

### 4. Инициализация с визуализацией

Для отладки и разработки можно инициализировать частицу с включенной визуализацией:

```javascript
const todoParticle = MetaFor("todo-list")
  .states("IDLE", "LOADING", "LOADED", "ERROR")
  .context((t) => ({
    /* ... */
  }))
  .transitions([
    /* ... */
  ])
  .actions({
    /* ... */
  })
  .create({
    state: "IDLE",
    graph: true,
  })

// Получение компонента визуализации
todoParticle.graph().then((component) => {
  document.getElementById("graph-container").appendChild(component)
})
```

## Асинхронная инициализация

В некоторых случаях требуется асинхронная инициализация частицы, например, когда начальные данные нужно загрузить с сервера:

```javascript
// Создание частицы
const todoParticle = MetaFor("todo-list")
  .states("IDLE", "LOADING", "LOADED", "ERROR")
  .context((t) => ({
    items: t.array([]),
    isLoading: t.boolean(false),
    error: t.nullable(t.string(null)),
  }))
  .transitions([
    /* ... */
  ])
  .actions({
    fetchItems: ({ context }) => {
      /* ... */
    },
    initialize: ({ context, services }) => {
      context.update({ isLoading: true })

      return services.api
        .getTodos()
        .then((data) => {
          context.update({ items: data, isLoading: false })
          return data
        })
        .catch((error) => {
          context.update({ error: error.message, isLoading: false })
          throw error
        })
    },
  })
  .create({
    state: "LOADING",
    services: {
      api: {
        getTodos: () => fetch("/api/todos").then((response) => response.json()),
      },
    },
  })

// Асинхронная инициализация
todoParticle.actions
  .initialize()
  .then(() => {
    console.log("Частица инициализирована успешно")
  })
  .catch((error) => {
    console.error("Ошибка инициализации частицы:", error)
  })
```

## Инициализация с сохраненным состоянием

MetaFor позволяет инициализировать частицу с сохраненным ранее состоянием, что полезно для восстановления состояния приложения:

```javascript
// Функция для сохранения состояния частицы
function saveParticleState(particle) {
  const state = particle.state
  const context = particle.context.get()

  localStorage.setItem(`particle_${particle.tag}`, JSON.stringify({ state, context }))
}

// Функция для загрузки состояния частицы
function loadParticleState(tag) {
  const savedData = localStorage.getItem(`particle_${tag}`)

  if (savedData) {
    return JSON.parse(savedData)
  }

  return null
}

// Создание частицы с сохраненным состоянием
const savedState = loadParticleState("todo-list")

const todoParticle = MetaFor("todo-list")
  .states("IDLE", "LOADING", "LOADED", "ERROR")
  .context((t) => ({
    items: t.array([]),
    isLoading: t.boolean(false),
    error: t.nullable(t.string(null)),
  }))
  .transitions([
    /* ... */
  ])
  .actions({
    /* ... */
  })
  .create(
    savedState || {
      state: "IDLE",
      context: {
        items: [],
      },
    }
  )

// Сохранение состояния при изменении
todoParticle.subscribe(() => {
  saveParticleState(todoParticle)
})
```

## Практические рекомендации

1. **Всегда указывайте начальное состояние** при создании частицы, чтобы избежать неопределенного поведения.

2. **Инициализируйте контекст с разумными значениями по умолчанию**, чтобы частица могла корректно функционировать даже без внешних данных.

3. **Используйте пользовательские сервисы** для инкапсуляции внешних зависимостей, что упрощает тестирование и повышает модульность.

4. **Применяйте асинхронную инициализацию** для загрузки начальных данных с сервера или из других асинхронных источников.

5. **Сохраняйте и восстанавливайте состояние частицы** для обеспечения персистентности между сессиями пользователя.

6. **Используйте обработчики событий** для отладки и логирования изменений в частице.

7. **Включайте визуализацию** во время разработки для лучшего понимания состояний и переходов частицы.

## Заключение

Правильная инициализация частицы является важным шагом в разработке приложений с использованием MetaFor. Выбор подходящего способа инициализации зависит от конкретных требований вашего приложения. Следуя рекомендациям, приведенным в этом документе, вы сможете эффективно инициализировать частицы и обеспечить их корректную работу в вашем приложении.
