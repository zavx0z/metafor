# Задача: UUID для монад — генерация в client.ts

**Приоритет:** Высокий  
**Зависимости:** Нет  
**Оценка:** 1-2 часа

---

## 📋 Контекст

Сейчас `createMonad()` генерирует UUID внутри через `crypto.randomUUID()`.

**Проблема:** Гравитация (client.ts) не может трековать акторы до создания монады.

**Решение:** Генерировать UUID в `space/client.ts` и передавать в `createMonad()` явно.

---

## 🎯 Цель

1. Убрать генерацию UUID из `monad/monad.ts`
2. Генерировать UUID в `space/client.ts` перед вызовом `createMonad()`
3. Обновить тесты в `monad/tests/`
4. **Важно:** Использовать имя `uuid` для всех переменных (не `id`)

---

## ✅ Требования

### 1. Изменения в `monad/monad.t.ts`

Добавить **обязательный** параметр `uuid` в `MonadConfig`:

```typescript
export interface MonadConfig {
  /** UUID монады (генерируется вызывающей стороной) */
  uuid: string
  fields: Record<string, FieldDefinition>
  values: Record<string, unknown>
  intentions?: Record<string, string>
  superposition: Record<string, unknown>
}
```

### 2. Изменения в `monad/monad.ts`

**Правило:** Все переменные называть `uuid`, не `id`.

```typescript
export function createMonad(config: MonadConfig): string {
  const uuid = config.uuid  // ← используем переданный UUID
  _monadIds.add(uuid)
  for (const [name, def] of Object.entries(config.fields)) {
    const registeredField = convertField(def as FieldDefinition)
    addMonadField(name, registeredField)
    if (config.values[name] !== undefined) {
      _fieldsDefinition[name] = def as FieldDefinition
    }
  }
  _monadParams.set(uuid, { ...config.values })
  _intentions.set(uuid, config.intentions ?? {})
  _superpositions.set(uuid, config.superposition)
  return uuid
}

export function deleteMonad(uuid: string): void {
  _monadIds.delete(uuid)
  _monadParams.delete(uuid)
  _intentions.delete(uuid)
  _superpositions.delete(uuid)
  _states.delete(uuid)
  _uuidToIndex.delete(uuid)
}
```

**Найти и заменить во всём файле:**

| Было | Стало |
|------|-------|
| `const id = ...` | `const uuid = ...` |
| `function deleteMonad(id: ...)` | `function deleteMonad(uuid: ...)` |
| `_monadParams.set(id, ...)` | `_monadParams.set(uuid, ...)` |
| `for (const monadId of ...)` | `for (const uuid of ...)` |

### 3. Изменения в `space/client.ts`

Генерировать UUID перед созданием монады:

```typescript
const uuid = crypto.randomUUID()
const monadUuid = createMonad({
  uuid,  // ← передаём явно
  fields: dsl.fields,
  values: {},
  superposition: dsl.superposition
})
```

### 4. Обновление тестов

Все тесты в `monad/tests/` должны передавать `uuid` явно:

```typescript
// Было:
const id = createMonad({ fields, values, superposition })

// Стало:
const uuid = crypto.randomUUID()
const monadUuid = createMonad({
  uuid,
  fields,
  values,
  superposition
})
```

---

## 📁 Файлы для изменения

| Файл | Изменения |
| ---- | --------- |
| `monad/monad.t.ts` | Добавить `uuid: string` (обязательный) в `MonadConfig` |
| `monad/monad.ts` | Переименовать `id` → `uuid`, убрать `crypto.randomUUID()` |
| `space/client.ts` | Генерировать UUID перед `createMonad()` |
| `monad/tests/*.test.ts` | Обновить все вызовы `createMonad()` |
| `monad/tests/**/*.test.ts` | Обновить все вызовы `createMonad()` |

---

## ✅ Критерии готовности

- [ ] `monad/monad.t.ts`: `uuid: string` (обязательный) в `MonadConfig`
- [ ] `monad/monad.ts`: нет `crypto.randomUUID()`, используется `config.uuid`
- [ ] `monad/monad.ts`: все переменные `id` переименованы в `uuid`
- [ ] `space/client.ts`: UUID генерируется перед `createMonad()`
- [ ] Все тесты в `monad/tests/` обновлены
- [ ] `bun test` проходит без ошибок
- [ ] `bun run build` без ошибок

---

## 🧪 Примеры

### client.ts

```typescript
import { createMonad } from "@boundary/monad"

// Генерация UUID и создание монады
const uuid = crypto.randomUUID()
const monadUuid = createMonad({
  uuid,
  fields: { name: field.string.required("") },
  values: { name: "Test" },
  superposition: { idle: {} }
})
```

### Тесты

```typescript
import { describe, test, expect } from "bun:test"
import { createMonad } from "@boundary/monad"

test("должен создавать монаду", () => {
  const uuid = crypto.randomUUID()
  const monadUuid = createMonad({
    uuid,
    fields: {},
    values: {},
    superposition: {}
  })
  expect(monadUuid).toBeDefined()
})
```

---

## 📚 Ссылки

- [GRAVITY_PLAN.md](./space/GRAVITY_PLAN.md) — общий план реализации гравитации
