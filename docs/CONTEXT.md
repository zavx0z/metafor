# Контекст (Context)

Контекст — это типизированное состояние компонента MetaFor, которое автоматически обновляет UI при изменениях.

## Основные концепции

### Простота

Контекст должен содержать только простые типы данных. Сложные объекты и структуры данных должны храниться в **core** - центральном хранилище данных, доступном во всех состояниях приложения.

```typescript
// ✅ Правильно - простые типы в контексте
.context((types) => ({
  userId: types.number.required(0),
  userName: types.string.required(""),
  selectedIds: types.array.required([]),
  isLoading: types.boolean.required(false),
}))

// ❌ Неправильно - сложные объекты в контексте
.context((types) => ({
  user: types.object.required({...}), // Должно быть в core
  items: types.array.required([{...}]), // Должно быть в core
}))
```

### Типобезопасность

Контекст обеспечивает полную типизацию TypeScript для всех полей:

```typescript
.context((types) => ({
  userId: types.number.required(0),
  userName: types.string.required("Anonymous"),
  userAge: types.number.required(18),
  isActive: types.boolean.required(false),
  userEmail: types.string.optional(),
  tagIds: types.array.required([]),
  status: types.enum.required(["pending", "active", "blocked"]),
}))
```

### Иммутабельность

Контекст нельзя изменить напрямую. Обновления происходят только через функцию `update`:

```typescript
// ❌ Неправильно - прямой доступ только для чтения
context.userName = "New Name"

// ✅ Правильно - обновление через update
update({ userName: "New Name" })
```

### Автоматическая реактивность

При изменении контекста UI автоматически перерендеривается:

```typescript
// UI обновится автоматически
update({ count: context.count + 1 })
```

## Поддерживаемые типы

### String

```typescript
// Обязательная строка
name: types.string.required("Anonymous")

// Опциональная строка (может быть null)
email: types.string.optional()

// Строка с кастомным значением по умолчанию
title: types.string.required("Новый документ")
```

### Number

```typescript
// Обязательное число
age: types.number.required(18)

// Опциональное число
score: types.number.optional()

// Число с кастомным значением по умолчанию
count: types.number.required(0)
```

### Boolean

```typescript
// Обязательный boolean
isActive: types.boolean.required(false)

// Опциональный boolean
isVisible: types.boolean.optional()

// Boolean с кастомным значением по умолчанию
isLoading: types.boolean.required(true)
```

### Array

```typescript
// Обязательный массив (только ID)
userIds: types.array.required([])

// Опциональный массив
tagIds: types.array.optional()

// Массив с кастомным значением по умолчанию
selectedIds: types.array.required([1, 2, 3])
```

**Важно:** Массивы в контексте должны содержать только ID (числа или строки). Сами объекты должны храниться в core.

### Enum

```typescript
// Обязательный enum
status: types.enum.required(["pending", "active", "blocked"])

// Опциональный enum
role: types.enum.optional(["user", "admin", "moderator"])

// Enum с кастомным значением по умолчанию
priority: types.enum.required(["low", "medium", "high"])
```

## API контекста

### Доступ к контексту

В функциях процессов и реакций контекст доступен через параметр `context`:

```typescript
.processes((process) => ({
  example: process()
    .action(({ context }) => {
      // Доступ к полям контекста
      console.log(context.userName)
      console.log(context.userAge)
      console.log(context.isActive)

      return { result: "success" }
    })
}))
```

### Обновление контекста

Обновление происходит через функцию `update`:

```typescript
.success(({ update, data }) => {
  // Обновление одного поля
  update({ userName: data.name })

  // Обновление нескольких полей
  update({
    userName: data.name,
    isActive: true,
    lastUpdated: Date.now()
  })

  // Обновление с вычислениями
  update({
    count: context.count + 1,
    total: context.count * context.price
  })
})
```

### Подписка на изменения

Можно подписаться на изменения контекста:

```typescript
const unsubscribe = context.onUpdate((updated) => {
  console.log("Контекст обновлен:", updated)
})

// Отписка
unsubscribe()
```

### Получение снапшота

Получить текущее состояние контекста:

```typescript
const snapshot = context.getSnapshot()
console.log(snapshot)
// { name: "John", age: 25, isActive: true, ... }
```

## Примеры использования

### Простой счетчик

```typescript
MetaFor("counter")
  .context((types) => ({
    count: types.number.required(0),
    isIncrementing: types.boolean.required(false),
  }))
  .processes((process) => ({
    increment: process()
      .action(({ context }) => {
        return { newCount: context.count + 1 }
      })
      .success(({ update, data }) => {
        update({
          count: data.newCount,
          isIncrementing: false,
        })
      }),
  }))
```

### Форма с валидацией

```typescript
MetaFor("form")
  .context((types) => ({
    userName: types.string.required(""),
    userEmail: types.string.required(""),
    errorMessages: types.array.required([]),
    isSubmitting: types.boolean.required(false),
  }))
  .processes((process) => ({
    submit: process()
      .action(({ context }) => {
        const errors = []

        if (context.userName.length < 2) {
          errors.push("Имя должно содержать минимум 2 символа")
        }

        if (!context.userEmail.includes("@")) {
          errors.push("Некорректный email")
        }

        if (errors.length > 0) {
          throw new Error(errors.join(", "))
        }

        return { success: true }
      })
      .success(({ update }) => {
        update({
          isSubmitting: false,
          errorMessages: [],
        })
      })
      .error(({ update, error }) => {
        update({
          isSubmitting: false,
          errorMessages: error.message.split(", "),
        })
      }),
  }))
```

### Простой контекст с ID

```typescript
MetaFor("user-profile")
  .context((types) => ({
    userId: types.number.required(0),
    userName: types.string.required(""),
    userEmail: types.string.required(""),
    userAvatar: types.string.optional(),
    theme: types.enum.required(["light", "dark"]),
    notifications: types.boolean.required(true),
    language: types.string.required("ru"),
    isLoading: types.boolean.required(false),
    lastUpdated: types.number.required(0),
  }))
  .processes((process) => ({
    updateProfile: process()
      .action(async ({ context }) => {
        const response = await fetch("/api/profile", {
          method: "PUT",
          body: JSON.stringify({
            id: context.userId,
            name: context.userName,
            email: context.userEmail,
            avatar: context.userAvatar,
            preferences: {
              theme: context.theme,
              notifications: context.notifications,
              language: context.language,
            },
          }),
        })
        return await response.json()
      })
      .success(({ update, data }) => {
        update({
          userName: data.name,
          userEmail: data.email,
          userAvatar: data.avatar,
          theme: data.preferences.theme,
          notifications: data.preferences.notifications,
          language: data.preferences.language,
          lastUpdated: Date.now(),
          isLoading: false,
        })
      }),
  }))
```

## Взаимодействие с Core

### Принцип разделения данных

- **Контекст** - простые типы для UI состояния
- **Core** - сложные объекты и данные приложения

```typescript
// ✅ Правильно - разделение ответственности
MetaFor("user-list")
  .context((types) => ({
    selectedUserIds: types.array.required([]),
    isLoading: types.boolean.required(false),
    currentPage: types.number.required(1),
  }))
  .core((core) => ({
    users: core.collection("users", {
      id: core.number,
      name: core.string,
      email: core.string,
      avatar: core.string,
    }),
  }))
```

### Доступ к данным из Core

```typescript
.processes((process) => ({
  loadUsers: process()
    .action(async ({ core }) => {
      const users = await fetch("/api/users")
      return { users: await users.json() }
    })
    .success(({ update, data, core }) => {
      // Сохраняем объекты в core
      core.users.set(data.users)

      // В контексте только ID
      update({
        selectedUserIds: [],
        isLoading: false
      })
    }),
}))
```

## Лучшие практики

### 1. Используйте типизацию

Всегда определяйте типы для всех полей контекста:

```typescript
// ✅ Хорошо - полная типизация
.context((types) => ({
  name: types.string.required(""),
  age: types.number.required(0),
  isActive: types.boolean.required(false),
}))

// ❌ Плохо - отсутствие типизации
.context(() => ({
  name: "",
  age: 0,
  isActive: false,
}))
```

### 2. Используйте простые типы

Контекст должен содержать только простые типы. Сложные объекты храните в core:

```typescript
// ✅ Хорошо - простые типы в контексте
.context((types) => ({
  userId: types.number.required(0),
  userName: types.string.required(""),
  userEmail: types.string.required(""),
  isLoading: types.boolean.required(false),
  theme: types.enum.required(["light", "dark"]),
}))

// ❌ Плохо - сложные объекты в контексте
.context((types) => ({
  user: types.object.required({
    name: types.string.required(""),
    email: types.string.required(""),
  }),
  ui: types.object.required({
    isLoading: types.boolean.required(false),
    theme: types.enum.required(["light", "dark"]),
  }),
}))
```

### 3. Используйте значения по умолчанию

Всегда указывайте осмысленные значения по умолчанию:

```typescript
// ✅ Хорошо - осмысленные значения по умолчанию
.context((types) => ({
  userId: types.number.required(0),
  userName: types.string.required("Anonymous"),
  count: types.number.required(0),
  isActive: types.boolean.required(false),
  theme: types.enum.required(["light", "dark"]),
}))

// ❌ Плохо - пустые значения
.context((types) => ({
  userId: types.number.required(0),
  userName: types.string.required(""),
  count: types.number.required(0),
  isActive: types.boolean.required(false),
  theme: types.enum.required(["light"]),
}))
```

### 4. Минимизируйте количество полей

Не создавайте избыточные поля:

```typescript
// ✅ Хорошо - минимальный набор полей
.context((types) => ({
  count: types.number.required(0),
  isLoading: types.boolean.required(false),
}))

// ❌ Плохо - избыточные поля
.context((types) => ({
  count: types.number.required(0),
  isLoading: types.boolean.required(false),
  isNotLoading: types.boolean.required(true), // Избыточно
  hasCount: types.boolean.required(false),    // Избыточно
}))
```

### 5. Используйте опциональные поля для nullable значений

```typescript
// ✅ Хорошо - правильное использование optional
.context((types) => ({
  name: types.string.required(""),
  email: types.string.optional(), // Может быть null
  avatar: types.string.optional(), // Может быть null
}))

// ❌ Плохо - required для nullable значений
.context((types) => ({
  name: types.string.required(""),
  email: types.string.required(""), // Неправильно, если может быть null
  avatar: types.string.required(""), // Неправильно, если может быть null
}))
```

## Отладка

### Включение отладки

```typescript
// Включение отладки контекста
window.debugMetaFor = true
```

### Логирование изменений

```typescript
// Подписка на изменения для отладки
context.onUpdate((updated) => {
  console.log("Контекст обновлен:", updated)
})
```

### Проверка типов

TypeScript автоматически проверяет типы при компиляции. Убедитесь, что включен строгий режим:

```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true
  }
}
```
