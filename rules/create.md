---
description: 
globs: 
alwaysApply: false
---
## Введение


Метод `create()` в MetaFor используется для создания экземпляра частицы после его определения. Этот метод инициализирует частицу с начальным состоянием и контекстом, делая его готовым к использованию в приложении.
---

## Базовое использование

После определения частицы с помощью методов `states()`, `context()`, `transitions()` и других, вы можете создать его экземпляр:

```javascript
const todoParticle = MetaFor("todo-list")
  .states("IDLE", "LOADING", "LOADED", "ERROR")
  .context((t) => ({
    items: t.array({ title: "Список элементов", default: [] }),
    isLoading: t.boolean({ title: "Состояние загрузки", default: false }),
    error: t.string({ title: "Сообщение об ошибке", nullable: true, default: null }),
  }))
  .transitions([
    { from: "IDLE", to: [{ state: "LOADING", trigger: { isLoading: true } }] },
    { from: "LOADING", to: [{ state: "LOADED", trigger: { items: { length: { gt: 0 } } } }] },
    { from: "LOADING", to: [{ state: "ERROR", trigger: { error: { isNull: false } } }] },
    { from: "ERROR", to: [{ state: "IDLE", trigger: { error: null } }] },
  ])
  .actions({
    fetchItems: ({ context }) => {
      // Логика загрузки элементов
    },
  })
  .create({
    state: "IDLE", // Начальное состояние
    context: {
      // Начальные значения контекста
      items: [
        { id: 1, title: "Изучить Quantum Atom", completed: false },
        { id: 2, title: "Создать приложение", completed: false },
      ],
      isLoading: false,
      error: null,
    },
  })
```

---

## Параметры метода create

Метод `create()` принимает объект с настройками для инициализации частицы:

```javascript
const todoParticle = MetaFor("todo-list")
  // ... определение частицы ...
  .create({
    state: "IDLE", // Начальное состояние
    context: {
      // Начальные значения контекста
      items: [
        { id: 1, title: "Изучить Quantum Atom", completed: false },
        { id: 2, title: "Создать приложение", completed: false },
      ],
      isLoading: false,
      error: null,
    },
  })
```

### Доступные параметры

- **state**: Начальное состояние частицы (должно быть одним из определенных состояний)
- **context**: Объект с начальными значениями для контекста
- **core**: Объект с методами ядра или общее ядро для нескольких частиц
- **services**: Объект с сервисами, которые будут доступны в действиях и реакциях

---

## Возвращаемое значение

Метод `create()` возвращает объект с API для взаимодействия с частицей:

```javascript
const {
  state, // Текущее состояние атома
  context, // Текущий контекст атома
  actions, // Методы для выполнения действий
  onChange, // Метод для подписки на изменения
  view, // Представление атома (если определено)
  destroy, // Метод для уничтожения атома
} = todoParticle.create()
```

### Доступные методы и свойства

- **state**: Текущее состояние частицы (строка)
- **context**: Текущий контекст частицы (объект)
- **actions**: Объект с методами для выполнения действий
- **onChange**: Метод для подписки на изменения частицы
- **onStateChange**: Метод для подписки на изменения состояния
- **onContextChange**: Метод для подписки на изменения контекста
- **view**: Представление частицы (если определено)
- **destroy**: Метод для уничтожения частицы и освобождения ресурсов

---

## Примеры использования

### Подписка на изменения частицы

```javascript
const todoParticle = MetaFor("todo-list")
  // ... определение частицы ...
  .create()

const unsubscribe = todoParticle.onChange(({ state, context }) => {
  console.log(`Состояние изменилось на: ${state}`)
  console.log("Новый контекст:", context)
})

todoParticle.actions.fetchItems()

unsubscribe()
```

### Использование общего ядра для нескольких частиц

```javascript
const sharedCore = {
  api: {
    fetchData: () => fetch("/api/data").then((response) => response.json()),
    saveData: (data) =>
      fetch("/api/data", {
        method: "POST",
        body: JSON.stringify(data),
        headers: { "Content-Type": "application/json" },
      }).then((response) => response.json()),
  },
}

const dataParticle = MetaFor("data").create({ core: sharedCore })
const uiParticle = MetaFor("ui").create({ core: sharedCore })
```

### Уничтожение частицы

```javascript
const todoParticle = MetaFor("todo-list").create()

todoParticle.destroy()
```

---

## Практические рекомендации

1. **Используйте значения по умолчанию** - определяйте разумные значения по умолчанию в контексте.
2. **Инициализируйте частицы при запуске** - создавайте экземпляры частиц при запуске приложения.
3. **Отписывайтесь от изменений** - всегда отписывайтесь от изменений, когда компонент размонтируется.
4. **Используйте общее ядро** - передавайте общее ядро при создании частиц.
5. **Уничтожайте неиспользуемые частицы** - вызывайте метод `destroy()` для освобождения ресурсов.
6. **Проверяйте начальное состояние** - убедитесь, что оно соответствует начальному контексту.
7. **Используйте типизацию** - если вы используете TypeScript, определяйте типы для контекста и состояний.
