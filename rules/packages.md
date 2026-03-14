# Архитектура пакетов и хранилищ

## Определения

| Термин     | Путь                  | Имя пакета            | Пример              |
| ---------- | --------------------- | --------------------- | ------------------- |
| **Проект** | `{project}/`          | `{project}`           | `metafor`           |
| **Домен**  | `{domain}/`           | `@{project}/{domain}` | `@metafor/boundary` |
| **Пакет**  | `{domain}/{package}/` | `@{domain}/{package}` | `@boundary/fields`  |

**Структура:**

```text
{project}/
├── {domain}/                       ← домен
│   ├── {domain}/{package}/         ← пакет
│   └── {domain}/{package}/         ← пакет
└── {domain}/                       ← другой домен
```

**Пример:**

```text
metafor/                            ← проект (metafor)
├── boundary/                       ← домен (@metafor/boundary)
│   ├── boundary/fields/            ← пакет (@boundary/fields)
│   ├── boundary/matrix/            ← пакет (@boundary/matrix)
│   └── boundary/store.ts           ← общее хранилище (boundary$)
├── force/                          ← домен (@metafor/force)
│   ├── force/monad/                ← пакет (@force/monad)
│   └── force/em/                   ← пакет (@force/em)
└── space/                          ← домен (@metafor/space)
```

**Правило импортов:** пакеты могут импортировать из вышестоящего уровня, но не наоборот.

---

## Хранилища (store)

### Типы хранилищ

| Тип           | Путь к модулю       | Файл store              | Имя переменной | Для чего                             |
| ------------- | ------------------- | ----------------------- | -------------- | ------------------------------------ |
| **Локальное** | `{domain}/{package}/` | `{package}/store.ts`    | `{name}$`      | Данные для одного пакета             |
| **Общее**     | `{domain}/`         | `{domain}/store.ts`     | `{domain}$`    | Данные для нескольких пакетов домена |

### Правило размещения данных

> **Данные хранятся там, где их используют.**

| Ситуация                                | Где хранить                      |
| --------------------------------------- | -------------------------------- |
| Использует **один** пакет               | Локальное хранилище этого пакета |
| Используют **несколько** пакетов домена | Общее хранилище домена           |

### Пример

```typescript
// ❌ НЕПРАВИЛЬНО: данные одного пакета в общем store
// boundary/store.ts
export const boundary$ = {
  fieldsConfig: Config[],  // Использует только @boundary/fields
}

// ✅ ПРАВИЛЬНО: данные одного пакета локально
// boundary/fields/store.ts
export const fields$ = {
  fieldsConfig: Config[],
}

// ✅ ПРАВИЛЬНО: общие данные в общем store
// boundary/store.ts
export const boundary$ = {
  heap: Uint32Array | null,      // Используют: @boundary/fields, @boundary/matrix
  braneBlockPtrs: number[],      // Используют: @boundary/fields, @boundary/matrix
}
```

---

## Чек-лист для store

Перед добавлением поля в store спроси:

1. Какие пакеты будут использовать это поле?
2. Это 2+ пакета **домена**? → **Общее хранилище домена** (`boundary$`)
3. Это 1 пакет? → **Локальное хранилище пакета** (`fields$`, `matrix$`)

---

## Поток данных

```text
{domain}/{package}/orchestrator
    ↓
{domain}/store.ts (boundary$)
    ↓
{domain}/{package}/executor
```

| Пакет           | Ответственность                    | Пример             |
| --------------- | ---------------------------------- | ------------------ |
| **Оркестратор** | Валидация, кодирование, компиляция | `@boundary/fields` |
| **Хранилище**   | Общие данные между пакетами домена | `boundary$`        |
| **Исполнитель** | Низкоуровневые операции            | `@boundary/matrix` |
| **Семантика**   | Бизнес-логика, состояния           | `@force/monad`     |

---

## Структура store-модуля

**Правило:** store — это модуль внутри пакета, не отдельный пакет.

```text
{domain}/{package}/
├── {package}.ts       ← оркестратор пакета
├── store.ts           ← инстанс {name}$ с методами reset()/restore()
└── package.json       ← имя: @{domain}/{package}
```

**Пример:**

```text
boundary/fields/
├── fields.ts          ← оркестратор @boundary/fields
├── store.ts           ← инстанс fields$ с методами
└── package.json       ← имя: @boundary/fields
```

**Общее хранилище домена:**

Если данные используют несколько пакетов домена — создай store-модуль в корне домена:

```text
boundary/
├── boundary.ts        ← оркестратор домена
├── store.ts           ← инстанс boundary$ с методами
├── fields/
│   ├── fields.ts
│   └── store.ts       ← локальное fields$
├── matrix/
│   └── matrix.ts
└── package.json       ← имя: @boundary/boundary
```

**Правило размещения:**

| Ситуация | Где хранить | Имя |
|----------|-------------|-----|
| Использует **один** пакет | `{package}/store.ts` | `fields$`, `matrix$` |
| Используют **несколько** пакетов домена | `{domain}/store.ts` | `boundary$` |

**API store-объекта:**

Если store требует методы `reset()` и `restore()` — размещай их **внутри объекта**:

```typescript
// ✅ ПРАВИЛЬНО: методы внутри объекта
export const boundary$: BoundaryStore = {
  heap: null as unknown as Uint32Array,
  braneBlockPtrs: [],

  reset() {
    this.heap = null as unknown as Uint32Array
    this.braneBlockPtrs = []
  },

  restore(state: BoundaryStore) {
    this.heap = state.heap
    this.braneBlockPtrs = state.braneBlockPtrs
  },
}

// ❌ НЕПРАВИЛЬНО: отдельные функции экспорта
export function resetBoundaryStore(store$: BoundaryStore): void { ... }
export function restoreBoundaryStore(store$: BoundaryStore, state: BoundaryStore): void { ... }
```

---

## Типы для store

**Правило:** Все типы store определяются в `@{domain}/types`.

```text
{domain}/types/
├── shared.ts        ← типы для нескольких пакетов (BoundaryStore, FieldsStore)
├── fields.ts        ← типы специфичные для @boundary/fields
└── matrix.ts        ← типы специфичные для @boundary/matrix
```

**Импорт типов:**

```typescript
// ✅ ПРАВИЛЬНО: импорт из @domain/types
import type { BoundaryStore } from "@boundary/types"
import type { FieldsStore } from "@boundary/types/fields"

// ❌ НЕПРАВИЛЬНО: определение локально
import type { FieldsStore } from "./store.t.ts"
```

**TSDoc для store:**

Документируй store по слоям:

1. **`@{domain}/types/shared.ts`** — короткие комментарии полей в интерфейсе
2. **`{domain}/store.ts`** — заголовок с `@property` для каждого поля
3. **Поля внутри object literal** — без TSDoc

Пример в `@boundary/types/shared.ts`:

```typescript
/**
 * Состояние `@boundary/store`.
 *
 * Хранит данные, используемые несколькими пакетами:
 * - {@link BoundaryStore.heap | heap} — для операций с памятью
 * - {@link BoundaryStore.braneBlockPtrs | braneBlockPtrs} — для указателей
 */
export interface BoundaryStore {
  /** Массив данных для операций. */
  heap: Uint32Array | null

  /** Указатели на блоки памяти. */
  braneBlockPtrs: number[]
}
```

Пример в `boundary/store.ts`:

```typescript
/**
 * Хранилище данных `@boundary`.
 *
 * Используется пакетами:
 * - `@boundary/fields` — для операций с полями
 * - `@boundary/matrix` — для операций с памятью
 *
 * @property heap {@link BoundaryStore.heap|описание}
 * @property braneBlockPtrs {@link BoundaryStore.braneBlockPtrs|описание}
 *
 * @see {@link BoundaryStore} — тип состояния
 */
export const boundary$: BoundaryStore = {
  heap: null as unknown as Uint32Array,
  braneBlockPtrs: [],

  reset() { ... },
  restore(state) { ... },
}
```

**См. также:**

* `rules/types.md` — централизованное управление типами
* `rules/tsdoc.md` — стандарты документирования
* `rules/fp.md#7.1-Мутабельное-состояние-с-методами` — паттерн store$
