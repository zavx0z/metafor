# Типы в MetaFor

Централизованное управление типами в домене `Dark`.

## Принцип

Все типы домена `Dark` находятся в пакете `@dark/types`.

Прямые импорты типов из `.t.ts` файлов запрещены.

## Структура `@dark/types`

```
dark/types/
├── package.json      # exports: корень = shared.ts
├── shared.ts         # shared types (корневой экспорт)
├── strong.ts         # strong-specific типы
├── weak.ts           # weak-specific типы
└── dark.ts           # dark-specific типы
```

**Важно:** `index.ts` не используется. Корневой экспорт — это `shared.ts`.

**Удалённые модули:** `gravity.ts` и `em.ts` удалены, их типы перемещены в `shared.ts`.

## Правило импорта

### Порядок импортов

**Типы импортируются в самом верху, до импортов кода:**

```typescript
// ✅ Правильно — типы сверху
import type { DarkStore, GlobalTopologyPlacement } from "@dark/types"
import type { MetaAST } from "@metafor/ast"
import { cloneDarkSnapshot } from "./snapshot.ts"
import { gravity$ } from "./gravity/store.ts"

// ❌ Неправильно — типы после кода
import { cloneDarkSnapshot } from "./snapshot.ts"
import type { DarkStore } from "@dark/types"  // тип после импорта кода
import { gravity$ } from "./gravity/store.ts"
```

**Принцип:** Сначала все `import type`, затем все `import` (значения/функции).

### Один импорт из одного источника

Все типы из одного источника импортируются **одним импортом**:

```typescript
// ✅ Правильно — один импорт из @dark/types
import type {
  DarkStore,
  DarkStoreSnapshot,
  GlobalTopologyPlacement,
  GlobalTopologyReference,
} from "@dark/types"

// ❌ Неправильно — раздельные импорты из одного источника
import type { DarkStore, DarkStoreSnapshot } from "@dark/types"
import type { GlobalTopologyPlacement, GlobalTopologyReference } from "@dark/types"
```

### Shared types — из корня

Типы, используемые несколькими пакетами, импортируются из корня `@dark/types`:

```typescript
// ✅ Правильно
import type { GlobalTopologyPlacement, GravityStore, DarkStore } from "@dark/types"
import type { StrongIndexes, GlobalTopologyMetaIndex } from "@dark/types"

// ❌ Неправильно — не нужно указывать /shared
import type { GlobalTopologyPlacement } from "@dark/types/shared"
```

### Package-specific types — из модуля

Типы, специфичные для одного пакета, импортируются из соответствующего модуля:

```typescript
// ✅ Правильно
import type { StrongIndexStore } from "@dark/types/strong"
import type { ReplaceFragmentOptions } from "@dark/types/weak"
import type { DarkConsumer } from "@dark/types/em"
import type { Address, UUID } from "@dark/types/dark"

// ❌ Неправильно
import type { Address } from "@dark/types"  // Address не в shared
import type { StrongIndexStore } from "@dark/types"  // StrongIndexStore не в shared
import type { GravityStore } from "./gravity/store.t.ts"  // не из .t.ts
```

## Распределение типов

### `shared.ts` — общие типы (корневой экспорт)

Типы, используемые несколькими подпакетами:

- `GlobalTopologyObject`
- `GlobalTopologyPlacement`
- `GlobalTopologyLink`
- `GlobalTopologyReference`
- `GlobalTopologyEntanglement`
- `GlobalTopologyIngestOptions`
- `GlobalTopologyIngestResult`
- `GlobalTopologyMetaIndex`
- `StrongIndexes`
- `StrongIndexesSnapshot`
- `LocalTopologyFragment`
- `DarkStore`
- `DarkStoreSnapshot`
- `GravityStore`
- `GravityStoreSnapshot`

Эти типы доступны через `@dark/types` или `@dark/types/shared`.

### `dark.ts` — внутренние типы dark

Типы, специфичные для домена Dark:

- `Address`
- `UUID`
- `generateUUID()`

### `strong.ts` — типы strong

- `StrongIndexStore`
- `PlacementLookupResult`
- `ReferenceLookupResult`

### `weak.ts` — типы weak

Специфичные типы для операций weak:

- `TopologyMutationResult`
- `ReplaceFragmentOptions`, `ReplaceFragmentResult`
- `RemovePlacementSubtreeOptions`, `RemovePlacementSubtreeResult`
- `InsertFragmentAtPlacementOptions`, `InsertFragmentAtPlacementResult`
- `MovePlacementOptions`, `MovePlacementResult`
- `RebuildFragmentOptions`, `RebuildFragmentResult`

### `em.ts` — типы em

- `DarkConsumer`
- `DarkDownstreamProjection`

### `dark.ts` — внутренние типы dark

Типы, специфичные для домена Dark (не используются между пакетами):

- `Address`
- `UUID`
- `generateUUID()`

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
    "./strong": "./strong.ts",
    "./weak": "./weak.ts",
    "./dark": "./dark.ts"
  },
  "private": true
}
```

**Принцип:** `@dark/types` и `@dark/types/shared` — это один и тот же файл.

## Запрещено

1. **Реэкспорты типов в пакетах**

   Пакеты не должны реэкспортировать типы из `@dark/types`:

   ```typescript
   // ❌ Неправильно в dark/identifier.ts
   import type { UUID } from "@dark/types/dark"
   export type { UUID }  // реэкспорт запрещён

   // ❌ Неправильно в dark/gravity/index.ts
   export type { GravityStore } from "@dark/types"

   // ✅ Правильно — только функции и значения
   export { gravity$ } from "./store.ts"
   export { generateUUID } from "./identifier.ts"
   ```

   **Принцип:** Типы импортируются напрямую из `@dark/types/{module}` там, где они нужны.

2. **Импорт из `.t.ts` файлов**

   ```typescript
   // ❌ Неправильно
   import type { GravityStore } from "./gravity/store.t.ts"

   // ✅ Правильно
   import type { GravityStore } from "@dark/types/gravity"
   ```

3. **Дублирование типов**

   Типы определяются только в `@dark/types`. Пакеты импортируют их, а не переопределяют.

4. **Пустые `.t.ts` файлы**

   Файлы `.t.ts`, содержащие только реэкспорты из `@dark/types`, должны быть удалены.

## TSDoc для типов

Типы в `@dark/types` должны иметь TSDoc:

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

1. Определи, к какой категории относится тип (shared/gravity/strong/weak/em/dark)
2. Добавь тип в соответствующий файл `@dark/types/{module}.ts`
3. Если тип shared — добавь реэкспорт в `@dark/types/index.ts`
4. Обнови импорты в пакетах на `@dark/types/{module}`
5. Удали старые `.t.ts` файлы если они больше не нужны

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
- Все импорты типов идут через `@dark/types`
- Нет реэкспортов типов в index.ts пакетов
- Нет `.t.ts` файлов с реэкспортами
