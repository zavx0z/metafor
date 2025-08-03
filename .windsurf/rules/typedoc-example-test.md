---
trigger: manual
description:
globs:
---

# Правила документирования типов с примерами из тестов

## 1. Структура JSDoc комментариев для типов

```typescript
/**
 * Описание типа на русском языке
 *
 * @includeExample ./path/to/test/file.spec.ts
 * @includeExample ./path/to/another/test.spec.ts
 */
export type TypeName = ...
```

## 2. Подготовка тестов для документации

### 2.1 Именование тестовых файлов

- Используйте точки вместо дефисов: `states.config.basic.spec.ts` ✅, `states-config-basic.spec.ts` ❌
- Имена должны быть описательными и отражать функциональность

### 2.2 Структура тестовых файлов

```typescript
import { test, expect } from "bun:test"
import type { TypeName } from "../index.t.ts"

test("Краткое описание что тестируется", () => {
  // Минимальный рабочий пример
  const example: TypeName = {
    // Конфигурация
  }

  // Проверки с русскими сообщениями
  expect(actual, "описание проверки").toBe(expected)
})
```

### 2.3 Принципы написания тестов-примеров

**✅ Хорошо:**

- Один тест = один концепт
- Минимальная конфигурация
- Понятные имена переменных
- Русские сообщения в expect
- Фокус на демонстрации API

**❌ Плохо:**

- Сложные тесты с множеством проверок
- Избыточная конфигурация
- Технические детали реализации
- Английские сообщения

## 3. Разделение больших тестов

Если тест покрывает несколько концептов, разделите его:

**Было:**

```typescript
// states.config.spec.ts - 100+ строк
test("Все конфигурации состояний", () => {
  // Много разных примеров
})
```

**Стало:**

```typescript
// states.config.basic.spec.ts
test("Базовая конфигурация состояний", () => {
  // Простой пример
})

// states.config.order.spec.ts
test("Конфигурация с порядком переходов", () => {
  // Пример с порядком
})
```

## 4. Конфигурация TypeDoc

В `typedoc.json`:

```json
{
  "exclude": [
    "**/node_modules/**",
    "**/fixture/**",
    "**/*.test.ts"
    // НЕ исключаем **/test/** и **/*.spec.ts
  ],
  "plugin": ["typedoc-plugin-include-example"]
}
```

## 5. Примеры использования

### 5.1 Для типов состояний

```typescript
/**
 * Конфигурация всех состояний системы
 *
 * @includeExample ./state/test/states.config.basic.spec.ts
 * @includeExample ./state/test/states.config.order.spec.ts
 */
export type StatesConfig<S extends string, C extends ContextSchema> = ...
```

### 5.2 Для типов условий

```typescript
/**
 * Условие для строковых значений
 *
 * @includeExample ./state/test/conditions.string.spec.ts
 */
export type CondStringRequired = ...
```

## 6. Проверка результата

После добавления примеров:

1. Запустите тесты: `bun test`
2. Сгенерируйте документацию: `bun run docs`
3. Проверьте, что примеры отображаются в HTML документации

## 7. Исключения

- **НЕ создавайте отдельные файлы examples** - используйте только тесты
- **НЕ добавляйте @example в сами тесты** - только @includeExample в типах
- **НЕ документируйте в тестах** - тесты должны содержать только код

## 8. Решение проблем с типизацией

Если возникают ошибки TypeScript в тестах-примерах:

```typescript
// Добавьте as any для обхода строгой типизации
const example: TypeName = {
  property: { condition: value } as any,
}

expect((example.property as any)?.condition, "описание").toBe(expected)
```

Эти правила обеспечивают автоматическое обновление документации при изменении тестов и поддерживают актуальность примеров.
description:
globs:
alwaysApply: false

---
