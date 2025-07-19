# States

Модуль фреймворка MetaFor для создания конечных автоматов с типизированными состояниями и переходами. Позволяет определять состояния, процессы и условия переходов между ними на основе контекста.

---

## Основные возможности

- Типизированные состояния с процессами
- Условные переходы на основе контекста
- Поддержка действий, обработки ошибок и успешных операций
- Интеграция с контекстом MetaFor
- Автоматическая типизация переходов
- **Типизированные результаты процессов** - передача данных из `action` в `success` с полной типизацией

---

## Типизированные результаты процессов

### StateProcess с generic параметром R

```typescript
type StateProcess<T extends ContextSchema = any, R = any> = {
  action: (params: { context: ExtractValues<T> }) => R
  error: (params: { update: (values: UpdateValues<ExtractValues<T>>) => ExtractValues<T> }) => void
  success?: (params: { update: (values: UpdateValues<ExtractValues<T>>) => ExtractValues<T>; data: R }) => void
}
```

#### Пример использования

```typescript
// Определяем типы
type UserContext = {
  name: { type: "string"; required: true }
  email: { type: "string"; required: true }
}

type UserResult = {
  userId: string
  profile: { name: string; email: string }
}

// Создаем StateProcess с типизацией
const userProcess: StateProcess<UserContext, UserResult> = {
  action: ({ context }) => {
    // context имеет тип { name: string, email: string }
    return {
      userId: `user_${Date.now()}`,
      profile: {
        name: context.name,
        email: context.email,
      },
    }
  },
  success: ({ update, data }) => {
    // data имеет тип UserResult
    console.log(`User created: ${data.userId}`)
    update({ name: data.profile.name })
  },
  error: ({ update }) => {
    update({ name: "Error User" })
  },
}
```

#### Преимущества

1. **Типобезопасность результатов**: TypeScript автоматически выводит тип результата из `action` в `success`
2. **IntelliSense поддержка**: Полная поддержка автодополнения и проверки типов
3. **Ошибки на этапе компиляции**: Неправильное использование типов будет обнаружено до выполнения
4. **Рефакторинг**: Безопасное изменение типов с автоматическим обновлением всех зависимостей
