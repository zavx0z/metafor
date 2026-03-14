# Правило: Структура файлов модуля

| Файл             | Обязательность  | Назначение                                      |
| ---------------- | --------------- | ----------------------------------------------- |
| `index.ts`       | **Обязательно** | Экспорт внешнего API модуля (только ре-экспорт) |
| `index.t.ts`     | Опционально     | Экспорт типов внешнего API модуля               |
| `{name}.ts`      | **Обязательно** | Оркестратор модуля, основная логика             |
| `{name}.spec.ts` | Опционально     | Unit-тесты                                      |
| `{name}.t.ts`    | Опционально     | TypeScript типы и интерфейсы                    |

---

## Index и оркестратор

**Правило:**

- **`index.ts`** — только для экспорта внешнего API модуля (ре-экспорт из `{name}.ts`)
- **`index.t.ts`** — экспорт типов для внешнего API (ре-экспорт из `{name}.t.ts`)
- **`{name}.ts`** — оркестратор модуля, содержит основную логику и координирует работу внутренних файлов

```typescript
// index.ts — только ре-экспорт функций
export { process } from './process.ts'

// index.t.ts — только ре-экспорт типов
export type { ProcessParams } from './process.t.ts'

// process.ts — оркестратор модуля
import { store } from './store.ts'
import { validate } from './utils.ts'
import type { ProcessParams } from './process.t.ts'

export const process = (params: ProcessParams) => {
  // координация работы модуля
}
```

---

## Разделение ответственности

* **`.ts`** — функции, логика, инстансы
* **`.t.ts`** — только типы (никаких функций)
* **`.spec.ts`** — только тесты

---

## Типы в `.t.ts`

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

## Store-файлы

**Правило:** Для store создавай объект с состоянием и методами мутации.

```text
{name}.t.ts      ← интерфейс {Name}Store
store.ts         ← инстанс {name}$: {Name}Store + методы
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
 * @module store$ — локальное хранилище модуля.
 *
 * @property data {@link ModuleStore.data|данные для кодирования}
 * @property offset {@link ModuleStore.offset|смещение для аллокаций}
 * @see {@link ModuleStore} — тип состояния
 */
export const module$: ModuleStore & {
  reset(): void
  restore(state: ModuleStore): void
} = {
  data: null as unknown as Uint32Array,
  offset: 0,
  
  reset() {
    this.data = null as unknown as Uint32Array
    this.offset = 0
  },
  
  restore(state: ModuleStore) {
    this.data = state.data
    this.offset = state.offset
  },
}
```

**Использование:**

```typescript
// Оркестратор
import { module$ } from './store'

export function write(data: Data) {
  module$.restore(preparedState)
}

// Чтение напрямую
const { data, offset } = module$
```

**Суффикс `$`:**

- Указывает на мутабельность объекта
- Методы `reset()` и `restore()` мутируют `this`
- Чтение состояния — прямое обращение к полям

**См. также:**

* `.qwen/rules/fp.md#7.1-Мутабельное-состояние-с-методами` — паттерн store$
* `.qwen/rules/tsdoc.md#2-Store-TSDoc` — формат документации
* `.qwen/rules/packages.md#2-Хранилища-store` — где размещать store

---

## Чек-лист для `.t.ts`

Перед созданием типа спроси:

1. Тип используется в 2+ функциях модуля?
1. Тип содержит 3+ поля?
1. Тип может понадобиться другим модулям?
1. Это store или параметры функции?

Если **хотя бы один ответ "да"** — выноси в `.t.ts`.

---

## Примеры

| Модуль  | `.t.ts`         | `.ts`     |
| ------- | --------------- | --------- |
| Store   | `{Name}Store`   | `store`   |
| Process | `ProcessParams` | `process` |
| API     | `APIConfig`     | `api`     |
