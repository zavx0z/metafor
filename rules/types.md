# Типы в MetaFor

Централизованное управление типами в доменах.

## Принцип

Все типы домена находятся в пакете `@{domain}/types`.

## Структура `@{domain}/types`

```
{domain}/types/
├── package.json      # exports: корень = shared.ts
├── shared.ts         # shared types (корневой экспорт)
├── {module}.ts       # module-specific типы
└── ...
```

**Важно:** `index.ts` не используется. Корневой экспорт — это `shared.ts`.

## Именование типов store

**Правило:** тип store называется `{Domain}{Package}Store`.

| Уровень | Переменная | Тип |
|---------|------------|-----|
| Домен | `dark$` | `DarkStore` |
| Пакет домена | `gravity$` | `DarkGravityStore` |
| Пакет домена | `strong$` | `DarkStrongStore` |
| Пакет домена | `weak$` | `DarkWeakStore` |

**Принцип:** тип store явно указывает домен и пакет.

## Правило импорта

### Порядок импортов

Импорты располагаются в следующем порядке:

1. **Сторонние пакеты** (npm, внешние зависимости)
2. **Типы из `@{domain}/types`**
3. **Собственные модули домена** (`@{domain}/{package}`)
4. **Локальные импорты** (относительные пути)

```typescript
// ✅ ПРАВИЛЬНО — порядок соблюдён
import type { MetaAST } from "@metafor/ast"           // 1. Сторонние пакеты
import type { DarkStore } from "@dark/types"          // 2. Типы из @domain/types
import { gravity$ } from "@dark/gravity"              // 3. Собственные модули
import { compileFragment } from "../metafor/dsl/ts"   // 4. Локальные импорты
import { loadMeta } from "./load.ts"                  // 4. Локальные импорты

// ❌ НЕПРАВИЛЬНО — порядок нарушен
import { gravity$ } from "./gravity/store.ts"         // локальные до сторонних
import type { MetaAST } from "@metafor/ast"           // сторонние после локальных
import type { DarkStore } from "@dark/types"
```

**Принцип:** Сначала внешние зависимости, затем внутренние.

### Типы сверху, код снизу

**Типы импортируются в самом верху, до импортов кода:**

```typescript
// ✅ Правильно — типы сверху
import type { Store, Entity } from "@dark/types"
import type { MetaAST } from "@metafor/ast"
import { cloneSnapshot } from "./snapshot.ts"
import { store$ } from "./store.ts"

// ❌ Неправильно — типы после кода
import { cloneSnapshot } from "./snapshot.ts"
import type { Store } from "@dark/types"  // тип после импорта кода
import { store$ } from "./store.ts"
```

**Принцип:** Сначала все `import type`, затем все `import` (значения/функции).

### Один импорт из одного источника

Все типы из одного источника импортируются **одним импортом**:

```typescript
// ✅ Правильно — один импорт из @dark/types
import type {
  Store,
  StoreSnapshot,
  Entity,
  Reference,
} from "@dark/types"

// ❌ Неправильно — раздельные импорты из одного источника
import type { Store, StoreSnapshot } from "@dark/types"
import type { Entity, Reference } from "@dark/types"
```

### Shared types — из корня

Типы, используемые несколькими пакетами, импортируются из корня `@{domain}/types`:

```typescript
// ✅ Правильно
import type { Entity, Store, Indexes } from "@dark/types"

// ❌ Неправильно — не нужно указывать /shared
import type { Entity } from "@dark/types/shared"
```

### Package-specific types — из модуля

Типы, специфичные для одного пакета, импортируются из соответствующего модуля:

```typescript
// ✅ Правильно
import type { StoreInstance } from "@dark/types/store"
import type { MutationOptions } from "@dark/types/mutation"
import type { Address, UUID } from "@dark/types/internal"

// ❌ Неправильно
import type { Address } from "@dark/types"  // Address не в shared
import type { StoreInstance } from "@dark/types"  // StoreInstance не в shared
import type { Store } from "./store.t.ts"  // не из .t.ts
```

## Распределение типов

### `shared.ts` — общие типы (корневой экспорт)

Типы, используемые несколькими подпакетами домена:

- Основные сущности домена
- Store интерфейсы
- Индексы и snapshot типы
- Общие опции и результаты

Эти типы доступны через `@{domain}/types` или `@{domain}/types/shared`.

### `{module}.ts` — специфичные типы

Типы, используемые только одним подпакетом:

- `{module}Store` — store конкретного модуля
- `{module}Options`, `{module}Result` — опции и результаты операций
- Внутренние типы модуля

### `{internal}.ts` — внутренние типы

Типы, не используемые между пакетами:

- `Address`, `UUID` — идентификаторы
- Вспомогательные функции

## package.json

Корневой экспорт указывает на `shared.ts`. Реэкспорты не используются:

```json
{
  "name": "@dark/types",
  "type": "module",
  "main": "shared.ts",
  "exports": {
    ".": "./shared.ts",
    "./shared": "./shared.ts",
    "./store": "./store.ts",
    "./mutation": "./mutation.ts",
    "./internal": "./internal.ts"
  },
  "private": true
}
```

**Принцип:** `@{domain}/types` и `@{domain}/types/shared` — это один и тот же файл.

## Запрещено

1. **Реэкспорты типов в пакетах**

   Пакеты не должны реэкспортировать типы из `@{domain}/types`:

   ```typescript
   // ❌ Неправильно в dark/identifier.ts
   import type { UUID } from "@dark/types/internal"
   export type { UUID }  // реэкспорт запрещён

   // ❌ Неправильно в dark/gravity/index.ts
   export type { GravityStore } from "@dark/types"

   // ✅ Правильно — только функции и значения
   export { gravity$ } from "./store.ts"
   export { generateUUID } from "./identifier.ts"
   ```

   **Принцип:** Типы импортируются напрямую из `@{domain}/types/{module}` там, где они нужны.

2. **Дублирование типов**

   Типы определяются только в `@{domain}/types`. Пакеты импортируют их, а не переопределяют.

3. **TSDoc для типов**

   Типы должны иметь TSDoc с описанием назначения и полей.

## TSDoc для типов

Типы в `@{domain}/types` должны иметь TSDoc:

- Краткое описание назначения типа
- Описание полей через `/** */` комментарии
- Без `{@link}` ссылок на другие типы

Пример:

```typescript
/**
 * Глобальное размещение топологии.
 *
 * Представляет экземпляр объекта в конкретном месте графа.
 */
export interface GlobalTopologyPlacement {
  /** Уникальный ID размещения. */
  id: string

  /** Адрес meta-схемы, из которой определено размещение. */
  meta: string

  /** ID объекта, который размещается. */
  objectId: string

  /** Полный адрес размещения в графе. */
  address: string

  /** ID родительского размещения (отсутствует для root). */
  parentId?: string
}
```

## Миграция

При добавлении нового типа:

1. Определи, к какой категории относится тип (shared/{module}/internal)
2. Добавь тип в соответствующий файл `@{domain}/types/{module}.ts`
3. Если тип shared — он доступен через корневой экспорт
4. Обнови импорты в пакетах на `@{domain}/types/{module}`

## Проверка

Перед коммитом:

```bash
# Проверка TypeScript
bun run tsc --noEmit

# Проверка тестов
bun test
```

Убедись, что:
- Нет ошибок TypeScript
- Все импорты типов идут через `@{domain}/types`
- Нет реэкспортов типов в index.ts пакетов
- Все импорты типов — вверху файла, до импортов кода
- Все импорты из одного источника объединены в один import
