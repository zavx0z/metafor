# Правило: Структура файлов модуля

| Файл             | Обязательность  | Назначение                             |
| ---------------- | --------------- | -------------------------------------- |
| `{name}.ts`      | **Обязательно** | Основная логика и публичный API модуля |
| `{name}.spec.ts` | Опционально     | Unit-тесты                             |
| `{name}.t.ts`    | Опционально     | TypeScript типы и интерфейсы           |

---

## 1. Разделение ответственности

* **`.ts`** — функции, логика, инстансы
* **`.t.ts`** — только типы (никаких функций)
* **`.spec.ts`** — только тесты

---

## 2. Типы в `.t.ts`

**Правило:** Интерфейсы для store и параметров функций выноси в `.t.ts`.

```typescript
// ❌ НЕПРАВИЛЬНО: интерфейс в .ts
export interface StoreState { field: string }
export const store: StoreState = { field: '' }

// ✅ ПРАВИЛЬНО: интерфейс в .t.ts
// types.t.ts
export interface StoreState { field: string }

// store.ts
import type { StoreState } from './types.t.ts'
export const store: StoreState = { field: '' }
```

---

## 3. Store-файлы

**Правило:** Для store создавай пару файлов:

```text
{name}.t.ts  ← интерфейс {Name}Store
{name}.ts    ← инстанс store: {Name}Store
```

**Пример:**

```typescript
// store.t.ts
export interface ModuleStore {
  data: Uint32Array
  offset: number
}

// store.ts
import type { ModuleStore } from './store.t.ts'

/**
 * @property data {@link ModuleStore.data|описание}
 * @property offset {@link ModuleStore.offset|описание}
 * @see {@link ModuleStore} — тип состояния
 */
export const store: ModuleStore = {
  data: null as unknown as Uint32Array,
  offset: 0,
}
```

**См. также:**

* `.qwen/rules/tsdoc.md#2-Store-TSDoc` — формат документации store
* `.qwen/rules/packages.md#2-Хранилища-store` — где размещать store

---

## 4. Чек-лист для `.t.ts`

Перед созданием типа спроси:

1. Тип используется в 2+ функциях модуля?
1. Тип содержит 3+ поля?
1. Тип может понадобиться другим модулям?
1. Это store или параметры функции?

Если **хотя бы один ответ "да"** — выноси в `.t.ts`.

---

## 5. Примеры

| Модуль  | `.t.ts`         | `.ts`     |
| ------- | --------------- | --------- |
| Store   | `{Name}Store`   | `store`   |
| Process | `ProcessParams` | `process` |
| API     | `APIConfig`     | `api`     |
