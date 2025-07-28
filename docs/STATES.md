# Состояния (States)

Состояния определяют возможные переходы автомата с условиями. MetaFor автоматически переключает состояния на основе изменений контекста.

## Основные концепции

### Автоматические переходы

В MetaFor переходы между состояниями происходят автоматически при выполнении условий:

```typescript
.states({
  guest: {
    // Автоматический переход в user при выполнении условий
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
  }
})
```

### Декларативность

Состояния описываются декларативно — вы указываете условия, а не команды:

```typescript
// ✅ Декларативно - описываем условия
.states({
  idle: { loading: { isLoading: true } },
  loading: { success: { isSuccess: true } },
  success: { idle: { reset: true } }
})

// ❌ Императивно - не нужно отправлять команды
// send('LOADING') - такого API нет в MetaFor
```

## Структура состояний

### Базовый синтаксис

```typescript
.states({
  stateName: {
    nextState: conditions,
    anotherState: conditions,
  }
})
```

### Примеры

```typescript
.states({
  // Простой переход без условий
  idle: { loading: {} },

  // Переход с условиями
  loading: {
    success: { isSuccess: true },
    error: { hasError: true }
  },

  // Множественные переходы
  form: {
    submitting: {
      name: { length: { min: 2 } },
      email: { pattern: /@/ }
    },
    error: { errors: { length: { gt: 0 } } }
  }
})
```

## Условия переходов

### Строковые условия

```typescript
name: {
  // Прямое сравнение
  eq: "admin",                    // равно
  notEq: "guest",                 // не равно

  // Проверка содержимого
  startsWith: "user",             // начинается с
  endsWith: "admin",              // заканчивается на
  include: "test",                // содержит подстроку
  notInclude: "temp",             // не содержит подстроку
  notStartsWith: "temp",          // не начинается с
  notEndsWith: "temp",            // не заканчивается на

  // Регулярные выражения
  pattern: /^[a-z]+$/,           // соответствует паттерну

  // Длина
  length: 5,                      // точная длина
  length: { min: 3, max: 20 },   // диапазон длины

  // Диапазон
  between: ["a", "z"]            // между двумя строками
}
```

### Числовые условия

```typescript
age: {
  // Прямое сравнение
  eq: 18,                         // равно
  notEq: 0,                       // не равно

  // Сравнения
  gt: 0,                          // больше
  gte: 18,                        // больше или равно
  lt: 100,                        // меньше
  lte: 65,                        // меньше или равно

  // Отрицания
  notGt: 100,                     // не больше
  notGte: 65,                     // не больше или равно
  notLt: 0,                       // не меньше
  notLte: 18,                     // не меньше или равно

  // Диапазон
  between: [18, 65]              // между двумя числами
}
```

### Булевы условия

```typescript
isActive: {
  // Прямое сравнение
  eq: true,                       // равно
  notEq: false,                   // не равно

  // Логическое равенство
  logicalEq: true                 // логическое равенство
}
```

### Условия для массивов

```typescript
tags: {
  // Длина
  length: 3,                      // точная длина
  length: { min: 1, max: 10 },   // диапазон длины

  // Содержимое
  includes: "admin",              // содержит элемент
  notIncludes: "temp",            // не содержит элемент

  // Пустота
  isEmpty: false,                 // не пустой

  // Условия для элементов (только для чисел и строк)
  every: { gt: 0 },              // все элементы больше 0
  some: { include: "test" }      // хотя бы один элемент содержит "test"
}
```

### Условия для enum

```typescript
status: {
  // Прямое сравнение
  eq: "active",                   // равно
  notEq: "pending",               // не равно

  // Множественные значения
  oneOf: ["active", "pending"],   // одно из значений
  notOneOf: ["blocked", "deleted"] // не одно из значений
}
```

### Null/undefined условия

Для опциональных полей:

```typescript
email: {
  null: true,                     // значение null
  null: false,                    // значение не null
}
```

## Сложные условия

### Комбинирование условий

Все условия в одном состоянии должны выполняться одновременно:

```typescript
.states({
  form: {
    submitting: {
      // Все условия должны быть true
      name: { length: { min: 2 } },
      email: { pattern: /@/ },
      age: { gte: 18 },
      isAgreed: { eq: true }
    }
  }
})
```

### Множественные переходы

Из одного состояния может быть несколько переходов:

```typescript
.states({
  loading: {
    // Переход в success при успехе
    success: { isSuccess: true },

    // Переход в error при ошибке
    error: { hasError: true },

    // Переход в timeout при таймауте
    timeout: { isTimeout: true }
  }
})
```

## Примеры использования

### Форма регистрации

```typescript
MetaFor("registration")
  .context((types) => ({
    name: types.string.required(""),
    email: types.string.required(""),
    password: types.string.required(""),
    isSubmitting: types.boolean.required(false),
    errors: types.array.required([]),
    isSuccess: types.boolean.required(false),
  }))
  .states({
    editing: {
      // Переход в submitting при заполнении формы
      submitting: {
        name: { length: { min: 2 } },
        email: { pattern: /@/ },
        password: { length: { min: 6 } },
        isSubmitting: { eq: true },
      },
    },
    submitting: {
      // Переход в success при успешной регистрации
      success: { isSuccess: true },
      // Переход в error при ошибке
      error: { errors: { length: { gt: 0 } } },
    },
    success: {
      // Возврат к редактированию
      editing: { reset: true },
    },
    error: {
      // Возврат к редактированию
      editing: { isSubmitting: false },
    },
  })
```

### Асинхронная загрузка

```typescript
MetaFor("data-loader")
  .context((types) => ({
    data: types.array.required([]),
    isLoading: types.boolean.required(false),
    error: types.string.optional(),
    retryCount: types.number.required(0),
  }))
  .states({
    idle: {
      // Переход в loading при начале загрузки
      loading: { isLoading: true },
    },
    loading: {
      // Переход в success при получении данных
      success: {
        data: { length: { gt: 0 } },
        isLoading: false,
      },
      // Переход в error при ошибке
      error: {
        error: { notEq: "" },
        isLoading: false,
      },
      // Переход в timeout при превышении попыток
      timeout: { retryCount: { gte: 3 } },
    },
    success: {
      // Возврат к idle при сбросе
      idle: { reset: true },
    },
    error: {
      // Повторная попытка
      loading: {
        isLoading: true,
        retryCount: { gt: 0 },
      },
    },
    timeout: {
      // Возврат к idle
      idle: { reset: true },
    },
  })
```

### Модальное окно

```typescript
MetaFor("modal")
  .context((types) => ({
    isOpen: types.boolean.required(false),
    content: types.string.required(""),
    isLoading: types.boolean.required(false),
    isConfirmed: types.boolean.required(false),
  }))
  .states({
    closed: {
      // Открытие модального окна
      opening: { isOpen: true },
    },
    opening: {
      // Переход в open после загрузки
      open: { isLoading: false },
    },
    open: {
      // Закрытие модального окна
      closing: { isOpen: false },
      // Подтверждение действия
      confirming: { isConfirmed: true },
    },
    confirming: {
      // Возврат в open после подтверждения
      open: { isConfirmed: false },
    },
    closing: {
      // Переход в closed
      closed: { reset: true },
    },
  })
```

## Лучшие практики

### 1. Используйте осмысленные имена состояний

```typescript
// ✅ Хорошо - понятные имена
.states({
  idle: { loading: {} },
  loading: { success: {}, error: {} },
  success: { idle: {} },
  error: { idle: {} }
})

// ❌ Плохо - непонятные имена
.states({
  s1: { s2: {} },
  s2: { s3: {}, s4: {} },
  s3: { s1: {} },
  s4: { s1: {} }
})
```

### 2. Группируйте связанные состояния

```typescript
// ✅ Хорошо - логическая группировка
.states({
  // Состояния формы
  form: { submitting: {} },
  submitting: { success: {}, error: {} },
  success: { form: {} },
  error: { form: {} },

  // Состояния загрузки
  idle: { loading: {} },
  loading: { loaded: {}, failed: {} },
  loaded: { idle: {} },
  failed: { idle: {} }
})
```

### 3. Используйте простые условия

```typescript
// ✅ Хорошо - простые условия
.states({
  form: {
    submitting: {
      name: { length: { min: 2 } },
      email: { pattern: /@/ }
    }
  }
})

// ❌ Плохо - сложные условия
.states({
  form: {
    submitting: {
      name: {
        length: { min: 2, max: 50 },
        pattern: /^[a-zA-Z\s]+$/,
        notInclude: "admin"
      },
      email: {
        pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        notInclude: "temp"
      }
    }
  }
})
```

### 4. Избегайте циклических переходов

```typescript
// ✅ Хорошо - ациклические переходы
.states({
  idle: { loading: {} },
  loading: { success: {}, error: {} },
  success: { idle: {} },
  error: { idle: {} }
})

// ❌ Плохо - циклические переходы
.states({
  idle: { loading: {} },
  loading: { idle: {} } // Может создать бесконечный цикл
})
```

### 5. Используйте флаги для управления переходами

```typescript
// ✅ Хорошо - использование флагов
.context((types) => ({
  isLoading: types.boolean.required(false),
  isSuccess: types.boolean.required(false),
  hasError: types.boolean.required(false),
}))

.states({
  idle: { loading: { isLoading: true } },
  loading: {
    success: { isSuccess: true },
    error: { hasError: true }
  }
})

// ❌ Плохо - сложная логика в условиях
.states({
  idle: { loading: { status: { eq: "loading" } } },
  loading: {
    success: { status: { eq: "success" } },
    error: { status: { eq: "error" } }
  }
})
```

## Отладка

### Включение отладки

```typescript
// Включение отладки состояний
window.debugMetaFor = true
```

### Логирование переходов

При включенной отладке MetaFor автоматически логирует переходы между состояниями:

```
[DEBUG] State transition: idle -> loading
[DEBUG] State transition: loading -> success
```

### Проверка условий

Можно проверить, какие условия выполняются:

```typescript
// В функции процесса
.action(({ context }) => {
  console.log('Current context:', context)
  console.log('Conditions check:', {
    nameLength: context.name.length >= 2,
    emailValid: /@/.test(context.email),
    ageValid: context.age >= 18
  })
})
```

## Ограничения

### Нет условных переходов

MetaFor не поддерживает условные переходы на основе внешних событий:

```typescript
// ❌ Не поддерживается
.states({
  idle: {
    loading: {
      // Условие на основе события
      onUserClick: true
    }
  }
})
```

### Нет вложенных состояний

MetaFor не поддерживает вложенные состояния:

```typescript
// ❌ Не поддерживается
.states({
  form: {
    editing: {
      valid: { submitting: {} },
      invalid: { error: {} }
    }
  }
})
```

### Нет параллельных состояний

MetaFor не поддерживает параллельные состояния:

```typescript
// ❌ Не поддерживается
.states({
  // Параллельные состояния
  auth: { loggedIn: {}, loggedOut: {} },
  ui: { loading: {}, ready: {} }
})
```
