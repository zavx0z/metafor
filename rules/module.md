# Правило: Структура файлов модуля

| Файл             | Обязательность  | Назначение                                      |
| ---------------- | --------------- | ----------------------------------------------- |
| `index.ts`       | **Обязательно** | Экспорт внешнего API модуля (только ре-экспорт) |
| `{name}.ts`      | **Обязательно** | Оркестратор модуля, основная логика             |
| `{name}.spec.ts` | Опционально     | Unit-тесты                                      |

---

## Index и оркестратор

**Правило:**

- **`index.ts`** — только для экспорта внешнего API модуля (ре-экспорт из `{name}.ts`)
- **`{name}.ts`** — оркестратор модуля, содержит основную логику и координирует работу внутренних файлов

```typescript
// index.ts — только ре-экспорт функций
export { process } from './process.ts'

// process.ts — оркестратор модуля
import { store } from './store.ts'
import { validate } from './utils.ts'
import type { ProcessParams } from "@domain/types"

export const process = (params: ProcessParams) => {
  // координация работы модуля
}
```

---

## Разделение ответственности

* **`.ts`** — функции, логика, инстансы
* **`.spec.ts`** — только тесты

**Типы:** все типы определяются в `@{domain}/types`.

---

## Типы из `@{domain}/types`

**Правило:** Интерфейсы для store и параметров функций импортируются из `@{domain}/types`.

```typescript
// ❌ НЕПРАВИЛЬНО: локальный импорт типа
import type { StoreState } from './types.t.ts'

// ✅ ПРАВИЛЬНО: импорт из @domain/types
import type { StoreState } from "@domain/types"
```

**Структура типов:**

```text
{domain}/types/
├── shared.ts        ← типы для нескольких пакетов
├── {module}.ts      ← типы специфичные для модуля
└── index.ts         ← реэкспорт shared типов
```

**Импорт типов:**

```typescript
// Shared типы — из корня
import type { Store, Entity } from "@domain/types"

// Module-specific типы — из модуля
import type { ModuleStore } from "@domain/types/module"
import type { ProcessParams } from "@domain/types/process"
```

**См. также:**

* `rules/types.md` — централизованное управление типами

---

## Store-файлы

**Правило:** Для store создавай объект с состоянием и методами мутации.

```text
{domain}/types/{module}.ts  ← интерфейс {Module}Store
{module}/store.ts           ← инстанс {module}$: {Module}Store + методы
```

**Пример:**

```typescript
// @domain/types/shared.ts
/**
 * Состояние хранилища модуля.
 *
 * @property data {@link ModuleStore.data|данные для кодирования}
 * @property offset {@link ModuleStore.offset|смещение для аллокаций}
 */
export interface ModuleStore {
  /** Данные для кодирования. */
  data: Uint32Array

  /** Смещение для аллокаций. */
  offset: number
}

// module/store.ts
import type { ModuleStore } from "@domain/types"

/**
 * @module module$ — локальное хранилище модуля.
 *
 * Используется для:
 * - хранения данных кодирования
 * - управления смещением
 *
 * @property data {@link ModuleStore.data|описание}
 * @property offset {@link ModuleStore.offset|описание}
 *
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

* `rules/fp.md#7.1-Мутабельное-состояние-с-методами` — паттерн store$
* `rules/tsdoc.md` — формат документации
* `rules/packages.md#2-Хранилища-store` — где размещать store
* `rules/types.md` — централизованное управление типами

---

## Чек-лист для типов

Перед добавлением типа в `@{domain}/types` спроси:

1. Тип используется в 2+ функциях модуля?
2. Тип содержит 3+ поля?
3. Тип может понадобиться другим модулям?
4. Это store или параметры функции?

Если **хотя бы один ответ "да"** — добавь тип в `@{domain}/types/{module}.ts`.

---

## Примеры

| Модуль  | Тип в `@domain/types/` | `.ts`     |
| ------- | ---------------------- | --------- |
| Store   | `shared.ts` → `Store`  | `store`   |
| Process | `process.ts` → `Params`| `process` |
| API     | `api.ts` → `Config`    | `api`     |
