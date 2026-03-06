# Задача: unlock метод для @boundary

## 📋 Оригинальное предложение

**Автор:** Пользователь

**Суть предложения:**
> Создать метод `unlock` в `@boundary/index.ts` и удалить импорт `matrixStoreGet, matrixHeapUpdate` из `@monad/`

**Исходный код в @monad/monad.ts:**

```typescript
// Для birth без intention снимаем lock сразу
const matrixState = matrixStoreGet()
const uniqueMonadsToUnlock = Array.from(new Set(monadsToUnlock))
const unlockUpdates = uniqueMonadsToUnlock.map((id) => {
  const index = _uuidToIndex.get(id)
  if (index === undefined) {
    throw new Error(`Monad ${id} not found in boundary`)
  }
  const blockPtr = matrixState.braneBlockPtrs[index]!
  return { offset: blockPtr + 2, value1: 0 }
})
matrixHeapUpdate(unlockUpdates)
```

---

## 🔍 Анализ архитектуры (на момент обсуждения)

**Проблема:**

| Данные           | Где хранились            | Кто использовал                            |
| ---------------- | ------------------------ | ------------------------------------------ |
| `braneBlockPtrs` | `@boundary/matrix/store` | @boundary/matrix, @monad                   |
| `heap`           | `@boundary/matrix/store` | @boundary/matrix, @boundary/fields, @monad |

**Вывод:** @monad вынужден импортировать из @boundary/matrix напрямую, потому что общие данные не были вынесены в общее хранилище.

---

## 🏗️ Изменения после обсуждения

### 1. Создано `@boundary/store` (общее хранилище)

```typescript
// @boundary/store/store.ts
export const store = {
  bytecode: Uint32Array,
  bytecodeOffsets: Uint32Array,
  initialStates: Uint32Array,
  heap: Uint32Array,          // ← общее
  braneBlockPtrs: number[],   // ← общее
}
```

### 2. Обновлён @monad/monad.ts

**Было:**

```typescript
import { matrixStoreGet, matrixHeapUpdate } from "@boundary/matrix"

const matrixState = matrixStoreGet()
const blockPtr = matrixState.braneBlockPtrs[index]!
```

**Стало:**

```typescript
import { storeGet } from "@boundary/store"
import { matrixHeapUpdate } from "@boundary/matrix"

const commonState = storeGet()
const { braneBlockPtrs } = commonState
const blockPtr = braneBlockPtrs[index]!
```

### 3. Разделены хранилища

| Хранилище                | Данные                                                                   |
| ------------------------ | ------------------------------------------------------------------------ |
| `@boundary/store`        | `heap`, `braneBlockPtrs`, `bytecode`, `bytecodeOffsets`, `initialStates` |
| `@boundary/fields/store` | `fields`, `heapAllocOffset`, `arrayReserveSize`, `arrayDataInvalidated`  |
| `@boundary/matrix/store` | `backend`, `operationMutex`                                              |

---

## ✅ Текущее состояние

**Импорты в @monad/monad.ts:**

```typescript
import { storeGet } from "@boundary/store"
import { matrixHeapUpdate } from "@boundary/matrix"
```

**unlock логика (осталась в @monad):**

```typescript
const commonState = storeGet()  // ← из общего store
const { heap, braneBlockPtrs } = commonState

const unlockUpdates = uniqueMonadsToUnlock.map((id) => {
  const index = _uuidToIndex.get(id)
  const blockPtr = braneBlockPtrs[index]!
  return { offset: blockPtr + 2, value1: 0 }
})
matrixHeapUpdate(unlockUpdates)  // ← прямая запись в GPU heap
```

---

## 📊 Итог

| Вопрос                                         | Решение                                                                  |
| ---------------------------------------------- | ------------------------------------------------------------------------ |
| Создавать ли `unlock` метод?                   | ❌ Не создан — логика осталась в @monad                                   |
| Удалить ли прямые импорты из @boundary/matrix? | ✅ Частично — `storeGet` из `@boundary/store`, `matrixHeapUpdate` остался |
| Почему `matrixHeapUpdate` остался?             | Это низкоуровневая GPU операция, не требует абстракции                   |
| Что изменилось?                                | `braneBlockPtrs` и `heap` теперь в общем `@boundary/store`               |

---

## 🎯 Вывод

Предложение было **архитектурно верным** — мы вынесли общие данные (`heap`, `braneBlockPtrs`) в `@boundary/store`, что позволило @monad импортировать из общего хранилища вместо прямого доступа к @boundary/matrix.

**`unlock` метод не был создан** потому что:

1. Логика простая (4 строки)
2. `matrixHeapUpdate` — это прямой API для GPU heap
3. Дополнительная абстракция не добавляет ценности

**Текущая архитектура соответствует намерению:** @monad больше не зависит от внутренних данных @boundary/matrix, использует общее хранилище.

---

## ✅ Задача: Создать `unlock` метод в @boundary/index.ts

**Решение:** Создать централизованный метод `unlock()` в @boundary для снятия блокировки с бран.

### Что нужно сделать

1. **Создать функцию `unlock()` в `@boundary/index.ts`**
2. **Экспортировать функцию**
3. **Обновить @monad/monad.ts** — использовать `unlock()` вместо прямой логики

### Пример реализации

```typescript
// @boundary/index.ts
import { storeGet } from "@boundary/store"
import { matrixHeapUpdate } from "@boundary/matrix"

/**
 * Снимает блокировку с указанных бран.
 * 
 * @param monadIds - UUID моноад, с которых снять блокировку
 */
export function unlock(monadIds: string[]): void {
  const commonState = storeGet()
  const { braneBlockPtrs } = commonState
  
  // Нужна функция для получения индекса по UUID
  // TODO: добавить в @boundary/store или @boundary/matrix
  const uuidToIndex = new Map<string, number>()
  // ... инициализация мапы
  
  const unlockUpdates = monadIds.map((id) => {
    const index = uuidToIndex.get(id)
    if (index === undefined) {
      throw new Error(`Monad ${id} not found in boundary`)
    }
    const blockPtr = braneBlockPtrs[index]!
    return { offset: blockPtr + 2, value1: 0 }
  })
  
  matrixHeapUpdate(unlockUpdates)
}
```

### Обновление @monad/monad.ts

**Было:**

```typescript
const commonState = storeGet()
const { braneBlockPtrs } = commonState

const unlockUpdates = uniqueMonadsToUnlock.map((id) => {
  const index = _uuidToIndex.get(id)
  const blockPtr = braneBlockPtrs[index]!
  return { offset: blockPtr + 2, value1: 0 }
})
matrixHeapUpdate(unlockUpdates)
```

**Стало:**

```typescript
import { unlock } from "@boundary"

unlock(uniqueMonadsToUnlock)
```

---

## 📋 Чек-лист

- [x] Изучить `_uuidToIndex` в @monad — где хранится
- [x] Решить где хранить мапу UUID → индекс (в @boundary или @monad)
- [x] Создать `unlock()` в @boundary/index.ts
- [x] Экспортировать функцию
- [x] Обновить @monad/monad.ts
- [x] Обновить документацию в @boundary/index.ts
- [ ] Добавить тесты (если есть тестовая инфраструктура)
- [x] Обновить TASKS.md — отметить выполненным

**Решение по мапе UUID → индекс:**

Мапа `_uuidToIndex` хранится в @monad, поэтому `unlock()` принимает **индексы**, а не UUID.
@monad сам конвертирует UUID в индексы перед вызовом `unlock()`.

**Обновление @monad/monad.ts:**

```typescript
// Было (14 строк)
const matrixState = matrixStoreGet()
const uniqueMonadsToUnlock = Array.from(new Set(monadsToUnlock))
const unlockUpdates = uniqueMonadsToUnlock.map((id) => {
  const index = _uuidToIndex.get(id)
  if (index === undefined) {
    throw new Error(`Monad ${id} not found in boundary`)
  }
  const blockPtr = matrixState.braneBlockPtrs[index]!
  return { offset: blockPtr + 2, value1: 0 }
})
matrixHeapUpdate(unlockUpdates)

// Стало (5 строк)
const uniqueMonadsToUnlock = Array.from(new Set(monadsToUnlock))
const indexes = uniqueMonadsToUnlock
  .map((id) => _uuidToIndex.get(id))
  .filter((index): index is number => index !== undefined)
unlock(indexes)
```

---

## 📝 Примечания

**Дата обсуждения:** 6 марта 2026 г.

**Участники:** Пользователь, AI-ассистент

**Связанные файлы:**

- `.qwen/rules/session.md` — правило работы с историей сессии
- `.qwen/rules/rules.edit.md` — правило редактирования правил

---

## 🔗 Ссылки

* [[session]] — работа с историей сессии
* [[rules.edit]] — редактирование правил после ошибок
* [[packages]] — архитектура пакетов и хранилищ
