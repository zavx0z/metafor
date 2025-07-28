# Процессы (Processes)

Процессы — это асинхронные действия с обработкой успеха и ошибок. Они позволяют выполнять бизнес-логику и обновлять контекст компонента.

## Основные концепции

### Chain API

Процессы используют цепочку методов для декларативного описания:

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
    })
}))
```

### Типобезопасность

TypeScript автоматически выводит типы для всех этапов процесса:

```typescript
.processes((process) => ({
  fetchUser: process()
    .action(async ({ context }) => {
      // TypeScript знает тип context
      const response = await fetch(`/api/users/${context.userId}`)
      return await response.json() // Тип возвращаемого значения
    })
    .success(({ update, data }) => {
      // TypeScript знает тип data из action
      update({ user: data }) // data имеет тип из action
    })
    .error(({ update, error }) => {
      // TypeScript знает тип error
      update({ error: error.message })
    })
}))
```

## Структура процесса

### 1. process(config?)

Создает новый процесс с опциональными метаданными:

```typescript
process() // Без метаданных
process({ title: "Мой процесс" }) // С заголовком
process({
  title: "Мой процесс",
  description: "Описание процесса",
}) // С заголовком и описанием
```

### 2. action(fn)

Основная функция процесса:

```typescript
.action(({ context }) => {
  // Синхронная логика
  return { result: "success" }
})

.action(async ({ context }) => {
  // Асинхронная логика
  const response = await fetch('/api/data')
  return await response.json()
})
```

**Параметры:**

- `context` — текущий контекст компонента (только для чтения)

**Возвращаемое значение:**

- Любой тип данных или Promise

### 3. success(handler)

Обработчик успешного завершения:

```typescript
.success(({ update, data }) => {
  // data — результат action
  update({
    result: data,
    isLoading: false
  })
})
```

**Параметры:**

- `update` — функция для обновления контекста
- `data` — результат выполнения action

### 4. error(handler)

Обработчик ошибок:

```typescript
.error(({ update, error }) => {
  // error — объект Error
  update({
    error: error.message,
    isLoading: false
  })
})
```

**Параметры:**

- `update` — функция для обновления контекста
- `error` — объект Error

## Примеры использования

### Простой процесс

```typescript
MetaFor("counter")
  .context((types) => ({
    count: types.number.required(0),
    isLoading: types.boolean.required(false),
  }))
  .processes((process) => ({
    increment: process()
      .action(({ context }) => {
        return { newCount: context.count + 1 }
      })
      .success(({ update, data }) => {
        update({ count: data.newCount })
      }),
  }))
```

### Асинхронный процесс

```typescript
MetaFor("data-fetcher")
  .context((types) => ({
    data: types.array.required([]),
    isLoading: types.boolean.required(false),
    error: types.string.optional(),
  }))
  .processes((process) => ({
    fetchData: process()
      .action(async ({ context }) => {
        const response = await fetch("/api/data")

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }

        return await response.json()
      })
      .success(({ update, data }) => {
        update({
          data: data,
          isLoading: false,
          error: "",
        })
      })
      .error(({ update, error }) => {
        update({
          error: error.message,
          isLoading: false,
        })
      }),
  }))
```

### Процесс с валидацией

```typescript
MetaFor("form-submitter")
  .context((types) => ({
    name: types.string.required(""),
    email: types.string.required(""),
    errors: types.array.required([]),
    isSubmitting: types.boolean.required(false),
  }))
  .processes((process) => ({
    submit: process()
      .action(({ context }) => {
        const errors = []

        if (context.name.length < 2) {
          errors.push("Имя должно содержать минимум 2 символа")
        }

        if (!context.email.includes("@")) {
          errors.push("Некорректный email")
        }

        if (errors.length > 0) {
          throw new Error(errors.join(", "))
        }

        return { name: context.name, email: context.email }
      })
      .success(({ update, data }) => {
        update({
          isSubmitting: false,
          errors: [],
        })
        console.log("Форма отправлена:", data)
      })
      .error(({ update, error }) => {
        update({
          isSubmitting: false,
          errors: error.message.split(", "),
        })
      }),
  }))
```

### Процесс с множественными обновлениями

```typescript
MetaFor("user-manager")
  .context((types) => ({
    user: types.object.required({
      id: types.number.required(0),
      name: types.string.required(""),
      email: types.string.required(""),
    }),
    isLoading: types.boolean.required(false),
    lastUpdated: types.number.required(0),
  }))
  .processes((process) => ({
    updateUser: process()
      .action(async ({ context }) => {
        const response = await fetch(`/api/users/${context.user.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(context.user),
        })

        if (!response.ok) {
          throw new Error("Ошибка обновления пользователя")
        }

        return await response.json()
      })
      .success(({ update, data }) => {
        update({
          user: data,
          lastUpdated: Date.now(),
          isLoading: false,
        })
      })
      .error(({ update, error }) => {
        update({
          isLoading: false,
        })
        console.error("Ошибка обновления:", error.message)
      }),
  }))
```

## Лучшие практики

### 1. Разделяйте логику

```typescript
// ✅ Хорошо - разделение ответственности
.action(({ context }) => {
  // Только бизнес-логика
  return validateAndProcess(context.data)
})
.success(({ update, data }) => {
  // Только обновление UI
  update({ result: data, isLoading: false })
})
.error(({ update, error }) => {
  // Только обработка ошибок
  update({ error: error.message, isLoading: false })
})

// ❌ Плохо - смешивание логики
.action(({ context, update }) => {
  // Смешивание логики и обновления
  const result = processData(context.data)
  update({ result, isLoading: false })
  return result
})
```

### 2. Используйте осмысленные имена

```typescript
// ✅ Хорошо - понятные имена
.processes((process) => ({
  fetchUserData: process()...,
  updateUserProfile: process()...,
  deleteUserAccount: process()...,
}))

// ❌ Плохо - непонятные имена
.processes((process) => ({
  process1: process()...,
  action2: process()...,
  handler3: process()...,
}))
```

### 3. Обрабатывайте ошибки

```typescript
// ✅ Хорошо - обработка ошибок
.processes((process) => ({
  fetchData: process()
    .action(async () => {
      const response = await fetch('/api/data')
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      return await response.json()
    })
    .success(({ update, data }) => {
      update({ data, isLoading: false })
    })
    .error(({ update, error }) => {
      update({ error: error.message, isLoading: false })
    })
}))

// ❌ Плохо - отсутствие обработки ошибок
.processes((process) => ({
  fetchData: process()
    .action(async () => {
      const response = await fetch('/api/data')
      return await response.json() // Может упасть
    })
    .success(({ update, data }) => {
      update({ data, isLoading: false })
    })
    // Нет error handler
}))
```

### 4. Используйте типизацию

```typescript
// ✅ Хорошо - типизированные данные
.action(async ({ context }): Promise<UserData> => {
  const response = await fetch(`/api/users/${context.userId}`)
  return await response.json()
})
.success(({ update, data }: { update: UpdateFn, data: UserData }) => {
  update({ user: data })
})

// ❌ Плохо - отсутствие типизации
.action(async ({ context }) => {
  const response = await fetch(`/api/users/${context.userId}`)
  return await response.json() // any
})
.success(({ update, data }) => {
  update({ user: data }) // data: any
})
```

### 5. Избегайте побочных эффектов в action

```typescript
// ✅ Хорошо - чистая функция
.action(({ context }) => {
  // Только вычисления и возврат результата
  return {
    isValid: context.name.length > 0,
    processedData: processData(context.data)
  }
})

// ❌ Плохо - побочные эффекты
.action(({ context }) => {
  // Побочные эффекты
  localStorage.setItem('data', JSON.stringify(context.data))
  console.log('Processing data...')

  return { result: 'success' }
})
```

## Метаданные процессов

### Заголовок и описание

```typescript
.processes((process) => ({
  login: process({
    title: "Авторизация пользователя",
    description: "Процесс входа в систему с валидацией данных"
  })
    .action(...)
    .success(...)
    .error(...)
}))
```

### Использование метаданных

Метаданные доступны в отладочной информации и могут использоваться для логирования:

```typescript
// При включенной отладке
window.debugMetaFor = true

// В логах будет отображаться:
// [DEBUG] Process "Авторизация пользователя" started
// [DEBUG] Process "Авторизация пользователя" completed
```

## Ограничения

### Нет доступа к update в action

```typescript
// ❌ Неправильно - update недоступен в action
.action(({ context, update }) => {
  update({ isLoading: true }) // Ошибка!
  return { result: "success" }
})

// ✅ Правильно - update только в success/error
.action(({ context }) => {
  return { result: "success" }
})
.success(({ update, data }) => {
  update({ isLoading: false, result: data.result })
})
```

### Нет доступа к DOM

```typescript
// ❌ Неправильно - нет доступа к DOM в процессах
.action(({ context }) => {
  document.getElementById('button').disabled = true // Ошибка!
  return { result: "success" }
})

// ✅ Правильно - обновление через контекст
.action(({ context }) => {
  return { result: "success" }
})
.success(({ update, data }) => {
  update({ isButtonDisabled: true })
})
```

### Нет вложенных процессов

```typescript
// ❌ Неправильно - нет вложенных процессов
.processes((process) => ({
  mainProcess: process()
    .action(() => {
      // Вызов другого процесса
      this.subProcess() // Ошибка!
      return { result: "success" }
    })
}))

// ✅ Правильно - отдельные процессы
.processes((process) => ({
  mainProcess: process()
    .action(() => {
      return { shouldCallSub: true }
    })
    .success(({ update, data }) => {
      if (data.shouldCallSub) {
        update({ triggerSubProcess: true })
      }
    }),
  subProcess: process()
    .action(() => {
      return { result: "sub" }
    })
}))
```

## Отладка

### Включение отладки

```typescript
// Включение отладки процессов
window.debugMetaFor = true
```

### Логирование

При включенной отладке MetaFor автоматически логирует выполнение процессов:

```
[DEBUG] Process "fetchData" started
[DEBUG] Process "fetchData" action completed
[DEBUG] Process "fetchData" success handler called
[DEBUG] Process "fetchData" completed
```

### Проверка состояния

```typescript
// Получение снапшота для отладки
const element = document.querySelector("metafor-my-component")
const snapshot = element.getSnapshot()
console.log("Current state:", snapshot)
```

## Производительность

### Ленивая загрузка

Процессы выполняются только при необходимости:

```typescript
// Процесс не выполняется до вызова
.processes((process) => ({
  heavyProcess: process()
    .action(async () => {
      // Этот код выполнится только при необходимости
      const result = await expensiveOperation()
      return result
    })
}))
```

### Кэширование

Результаты процессов не кэшируются автоматически. При необходимости кэширования используйте контекст:

```typescript
.context((types) => ({
  cachedData: types.object.optional(),
  lastFetch: types.number.required(0),
}))
.processes((process) => ({
  fetchData: process()
    .action(({ context }) => {
      // Проверка кэша
      if (context.cachedData && Date.now() - context.lastFetch < 60000) {
        return context.cachedData
      }

      // Загрузка новых данных
      return fetch('/api/data').then(r => r.json())
    })
    .success(({ update, data }) => {
      update({
        cachedData: data,
        lastFetch: Date.now()
      })
    })
}))
```
