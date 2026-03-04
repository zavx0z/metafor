# 🌌 План реализации: Force Gravity

**Цель:** Реализовать механизм гравитации — парсинг AST и управление иерархией акторов через store.

**Контекст:**

- `space/client.ts` — скриптовый стиль (взаимодействия, оркестрация)
- `force/gravity/func/` — чистые функции (парсинг AST, вычисление путей)
- `force/gravity/store/` — явное состояние (граф иерархии, CRUD акторов)
- `@zavx0z/template` — парсер template literals → AST (`Node[]`)

**Архитектурные принципы:**

- ❌ **Никаких классов** — только чистые функции + явное состояние в store
- ❌ **Никаких поддиректорий** — модуль = 3 файла (`.ts`, `.t.ts`, `.spec.ts`)
- ✅ **CRUD в store** — каждый store имеет свой API для работы со своим состоянием
- ✅ **Граф иерархии** — из `force/gravity/old.md` (childrenView, orderKey)
- ✅ **UUID генерация** — перед сохранением в store
- ✅ **Store зависимостей** — actor → graph → order

---

## 1. Архитектура

### 1.1. Что делает Gravity

| Делает | Не делает |
| ------ | --------- |
| Парсит AST → ActorDeclaration[] | Не вызывает createMonad/deleteMonad |
| Хранит граф иерархии (childrenView) | Не знает о внутренностях монад |
| Генерирует orderKey для порядка | Не обрабатывает HTML элементы |
| Вычисляет indexPath для навигации | Не управляет состоянием автомата |
| CRUD операции над акторами | — |

### 1.2. Поток данных

```
space/client.ts
  ↓
loadDSL() → Schema
  ↓
schema.gravity → Node[]
  ↓
parseHierarchy(Node[], context) → ActorDeclaration[]
  ↓
syncHierarchy(ActorDeclaration[]) → { toCreate, toDelete }
  ↓
space/client.ts → createMonad/deleteMonad
```

### 1.3. Структура модулей

```
force/gravity/
├── func/
│   ├── parse.ts       # parseHierarchy(), parseNode()
│   ├── parse.t.ts     # ActorDeclaration, ParseContext
│   ├── parse.spec.ts  # тесты
│   ├── resolve.ts     # resolveCondition(), resolvePath()
│   ├── resolve.t.ts   # ResolveContext
│   └── resolve.spec.ts # тесты
├── store/
│   ├── order.ts       # orderKey CRUD
│   ├── order.t.ts     # OrderKey тип
│   ├── order.spec.ts  # тесты
│   ├── graph.ts       # childrenView CRUD + иерархия
│   ├── graph.t.ts     # ChildrenView, IndexPath типы
│   ├── graph.spec.ts  # тесты
│   ├── actor.ts       # actors CRUD + связь с graph/order
│   ├── actor.t.ts     # ActorRecord тип
│   └── actor.spec.ts  # тесты
├── load.ts            # загрузка DSL (существует)
├── old.md             # документация (архив концепций)
└── README.md          # API документация

space/
├── client.ts          # скриптовый стиль, оркестрация
└── GRAVITY_PLAN.md    # этот план
```

### 1.4. CRUD по store

Каждый store — **автономный модуль** со своим CRUD API:

| Store | Состояние | CRUD API |
| ----- | --------- | -------- |
| **order** | `OrderKey = Uint8Array` | `between()`, `first()`, `last()`, `compare()` |
| **graph** | `childrenView`, `indexPaths` | `addChild()`, `removeChild()`, `getChildren()`, `getIndexPath()` |
| **actor** | `Map<uuid, ActorRecord>` | `createActor()`, `getActor()`, `updateActor()`, `deleteActor()` |

**Зависимости между store:**

```
actor.ts → импортирует → graph.ts, order.ts
graph.ts → импортирует → order.ts
order.ts → нет зависимостей
```

### 1.5. Типы узлов AST

**Важно:** `gravity` описывает **только иерархию акторов**. HTML элементы не используются.

| Тип | Интерфейс | Назначение | Пример |
| --- | --------- | ---------- | ------ |
| `meta` | `NodeMeta` | `<meta-for>` актор | `<meta-for src="zavx0z/git-start">` |
| `cond` | `NodeCondition` | Условный актор (тернарный) | `${state === "loading" ? html\`<meta-for ...>\` : null}` |
| `log` | `NodeLogical` | Логический актор (`&&`) | `${value.operation && html\`<meta-for ...>\`}` |
| `map` | `NodeMap` | Итерация по массиву акторов | `${items.map(i => html\`<meta-for ...>\`)}` |
| `text` | `NodeText` | **Игнорируется** | — |
| `el` | `NodeElement` | **Игнорируется** | — |

---

## 2. Этапы реализации

### Этап 1: Store Order (orderKey CRUD)

**Файлы:** `force/gravity/store/order.ts`, `order.t.ts`, `order.spec.ts`

**Ответственность:** Генерация и сравнение orderKey

**Состояние:** Нет (stateless, чистые функции)

```typescript
// order.t.ts
/**
 * OrderKey для детерминированного порядка.
 * Лексикографически сравнивается через Uint8Array.
 */
export type OrderKey = Uint8Array

// order.ts
/**
 * Создаёт первый orderKey в списке.
 *
 * @example
 * ```typescript
 * const key = first()  // Uint8Array([128])
 * ```
 */
export function first(): OrderKey

/**
 * Создаёт последний orderKey в списке.
 *
 * @example
 * ```typescript
 * const key = last()  // Uint8Array([255])
 * ```
 */
export function last(): OrderKey

/**
 * Вычисляет orderKey между двумя соседями.
 *
 * @param prevKey - ключ предыдущего элемента (null если первый)
 * @param nextKey - ключ следующего элемента (null если последний)
 * @returns новый orderKey посередине
 *
 * @example
 * ```typescript
 * const key = between(null, null)  // первый элемент
 * const key2 = between(key, null)  // второй элемент
 * ```
 */
export function between(
  prevKey: OrderKey | null,
  nextKey: OrderKey | null
): OrderKey

/**
 * Сравнивает два orderKey.
 *
 * @returns -1 если a < b, 0 если равны, 1 если a > b
 *
 * @example
 * ```typescript
 * compare(first(), last())  // -1
 * ```
 */
export function compare(a: OrderKey, b: OrderKey): -1 | 0 | 1
```

**Задачи:**

1. [x] `first()` — первый orderKey (например, `[128]`)
2. [x] `last()` — последний orderKey (например, `[255]`)
3. [x] `between()` — вычисление промежуточного ключа
4. [x] `compare()` — лексикографическое сравнение Uint8Array
5. [x] Тесты на все функции (13 тестов)

---

### Этап 2: Store Graph (childrenView CRUD) ✅

**Файлы:** `force/gravity/store/graph.ts`, `graph.t.ts`, `graph.spec.ts`

**Ответственность:** Управление иерархией (parent → children)

**Состояние:**

```typescript
let childrenView: Map<string, string[]> = new Map()  // parentUuid → [childUuids]
let rootUuids: string[] = []  // корневые акторы
let indexPaths: Map<string, IndexPath> = new Map()  // uuid → "0/1/2"
```

**CRUD API:**

```typescript
// graph.t.ts
export type IndexPath = string
export type ChildrenView = Map<string, string[]>

// graph.ts
/**
 * Добавляет актора в конец списка детей.
 */
export function appendChild(parentUuid: string | null, childUuid: string): void

/**
 * Вставляет актора перед указанным sibling.
 */
export function insertBefore(
  parentUuid: string | null,
  newChildUuid: string,
  referenceChildUuid: string
): void

/**
 * Удаляет актора из иерархии (без потомков).
 */
export function removeChild(parentUuid: string | null, childUuid: string): void

/**
 * Заменяет одного актора на другого.
 */
export function replaceChild(
  parentUuid: string | null,
  newChildUuid: string,
  oldChildUuid: string
): void

/**
 * Перемещает актора к новому родителю.
 */
export function moveChild(
  childUuid: string,
  newParentUuid: string | null
): void

/**
 * Удаляет актора и всех потомков.
 */
export function removeChildWithDescendants(
  parentUuid: string | null,
  childUuid: string
): void

/**
 * Проверяет наличие детей.
 */
export function hasChildren(parentUuid: string): boolean

/**
 * Получает детей актора.
 */
export function getChildren(parentUuid: string): string[]

/**
 * Получает корневые акторы.
 */
export function getRoots(): string[]

/**
 * Получает индекс-путь актора.
 */
export function getIndexPathByUuid(uuid: string): IndexPath | undefined

/**
 * Получает uuid по индекс-пути.
 */
export function getUuidByIndexPath(indexPath: IndexPath): string | undefined

/**
 * Вычисляет индекс-путь для нового актора.
 */
export function computeIndexPath(
  parentUuid: string | null,
  childUuid: string
): IndexPath

export function _resetStore(): void
```

**Задачи:**

1. [x] `appendChild()` — добавление в конец childrenView
2. [x] `insertBefore()` — вставка перед sibling
3. [x] `removeChild()` — удаление (без потомков)
4. [x] `replaceChild()` — замена одного на другой
5. [x] `moveChild()` — перемещение к новому родителю
6. [x] `removeChildWithDescendants()` — каскадное удаление
7. [x] `hasChildren()` — проверка наличия детей
8. [x] `getChildren()` — быстрый доступ к детям
9. [x] `getRoots()` — корневые акторы
10. [x] `getIndexPathByUuid()` — получение пути по uuid
11. [x] `getUuidByIndexPath()` — получение uuid по пути
12. [x] `computeIndexPath()` — путь для нового актора
13. [x] Тесты на иерархию (17 тестов)

---

### Этап 3: Store Actor (actors CRUD) ✅

**Файлы:** `force/gravity/store/actor.ts`, `actor.t.ts`, `actor.spec.ts`

**Ответственность:** CRUD операции над акторами

**Состояние:**

```typescript
let actors: Map<string, ActorRecord> = new Map()  // uuid → ActorRecord
```

**CRUD API:**

```typescript
// actor.t.ts
export interface ActorRecord {
  uuid: string
  src: string
  parentUuid: string | null
  orderKey: Uint8Array
  monadId?: string
  status: 'pending' | 'active' | 'deleted'
}

// actor.ts
/**
 * Создаёт актора.
 *
 * @param uuid - UUID актора
 * @param src - путь к DSL
 * @param parentUuid - UUID родителя (null для корневых)
 * @param orderKey - orderKey для порядка
 * @returns созданный ActorRecord
 *
 * @example
 * ```typescript
 * const actor = createActor(uuid, "zavx0z/git-start", null, orderKey)
 * ```
 */
export function createActor(
  uuid: string,
  src: string,
  parentUuid: string | null,
  orderKey: Uint8Array
): ActorRecord

/**
 * Получает актора по UUID.
 *
 * @param uuid - UUID актора
 * @returns ActorRecord или undefined
 *
 * @example
 * ```typescript
 * const actor = getActor(uuid)
 * ```
 */
export function getActor(uuid: string): ActorRecord | undefined

/**
 * Обновляет поля актора.
 *
 * @param uuid - UUID актора
 * @param updates - поля для обновления
 * @returns обновлённый ActorRecord или undefined
 *
 * @example
 * ```typescript
 * updateActor(uuid, { monadId: "monad-123", status: 'active' })
 * ```
 */
export function updateActor(
  uuid: string,
  updates: Partial<ActorRecord>
): ActorRecord | undefined

/**
 * Удаляет актора.
 *
 * @param uuid - UUID актора
 *
 * @example
 * ```typescript
 * deleteActor(uuid)
 * ```
 */
export function deleteActor(uuid: string): void

/**
 * Получает всех акторов.
 *
 * @returns массив всех ActorRecord
 *
 * @example
 * ```typescript
 * const all = getAllActors()
 * ```
 */
export function getAllActors(): ActorRecord[]

/**
 * Получает акторов по родителю.
 *
 * @param parentUuid - UUID родителя
 * @returns массив ActorRecord
 *
 * @example
 * ```typescript
 * const children = getActorsByParent(null)  // корневые
 * ```
 */
export function getActorsByParent(parentUuid: string): ActorRecord[]

export function _resetStore(): void
```

**Задачи:**

1. [x] `createActor()` — создание с UUID, src, parentUuid, orderKey
2. [x] `getActor()` — получение по UUID
3. [x] `updateActor()` — обновление полей (включая monadId)
4. [x] `deleteActor()` — удаление
5. [x] `getAllActors()` — список всех
6. [x] `getActorsByParent()` — фильтрация по родителю
7. [x] Интеграция с `graph` и `order` store
8. [x] Тесты на CRUD (9 тестов)

---

### Этап 4: Функции парсинга AST ⬜

**Файлы:** `force/gravity/func/parse.ts`, `parse.t.ts`, `parse.spec.ts`

**Ответственность:** Парсинг AST → ActorDeclaration[]

```typescript
// parse.t.ts
export interface ParseContext {
  value: Record<string, unknown>
  state: string
  mass: Record<string, unknown>
}

export interface ActorDeclaration {
  src: string
  context?: Record<string, unknown>
  fields: Record<string, unknown>
  superposition: Record<string, unknown>
}

// parse.ts
export function parseHierarchy(
  nodes: Node[],
  context: ParseContext
): ActorDeclaration[]

function parseNode(
  node: Node,
  context: ParseContext,
  parentUuid: string | null
): ActorDeclaration[]
```

**Задачи:**

1. [ ] `parseHierarchy()` — обход массива узлов, возврат ActorDeclaration[]
2. [ ] `parseNode()` — диспетчер по типу узла
3. [ ] Обработка `meta` — извлечение src, context, fields, superposition
4. [ ] Обработка `log` — вычисление условия, рекурсия по детям
5. [ ] Обработка `cond` — выбор ветки (true/false), рекурсия
6. [ ] Обработка `map` — итерация, рекурсия для каждого элемента
7. [ ] Игнорирование `text` и `el`
8. [ ] Тесты на парсинг

---

### Этап 5: Функции вычисления путей/условий ⬜

**Файлы:** `force/gravity/func/resolve.ts`, `resolve.t.ts`, `resolve.spec.ts`

**Ответственность:** Вычисление путей и условий из контекста

```typescript
// resolve.t.ts
export interface ResolveContext {
  value: Record<string, unknown>
  state: string
  mass: Record<string, unknown>
  index?: number
  item?: unknown
}

// resolve.ts
export function resolveCondition(
  data: string | string[],
  expr: string | undefined,
  context: ResolveContext
): boolean

export function resolvePath(
  path: string | ValueDynamic | ValueStatic,
  context: ResolveContext
): string
```

**Задачи:**

1. [ ] `resolveCondition()` — вычисление логических/условных выражений
2. [ ] `resolvePath()` — резолвинг путей к данным
3. [ ] Операторы: `===`, `!==`, `&&`, `||`, `>`, `<`
4. [ ] Литералы: строки, числа, булевы
5. [ ] Тесты на вычисление

---

### Этап 6: Интеграция в client.ts ⬜

**Файл:** `space/client.ts`

```typescript
import { parseHierarchy } from "force/gravity/func/parse"
import { createActor, getActor, updateActor, deleteActor } from "force/gravity/store/actor"
import { addChild, removeChild, getChildren, getRoots } from "force/gravity/store/graph"
import { between, first } from "force/gravity/store/order"
import { createMonad, deleteMonad } from "@boundary/monad"

async function syncActors(
  nodes: Node[],
  context: ParseContext,
  parentUuid: string | null
) {
  // 1. Парсинг AST → ActorDeclaration[]
  const declarations = parseHierarchy(nodes, context)

  // 2. Получаем текущих акторов
  const current = parentUuid === null ? getRoots() : getChildren(parentUuid)

  // 3. Вычисляем diff
  const toCreate: ActorDeclaration[] = []
  const toDelete: string[] = []

  // 4. Удаляем лишних
  for (const uuid of toDelete) {
    const actor = getActor(uuid)
    if (actor?.monadId) {
      deleteMonad(actor.monadId)
    }
    deleteActor(uuid)
    removeChild(parentUuid, uuid)
  }

  // 5. Создаём новых
  for (const declaration of toCreate) {
    const siblings = parentUuid === null ? getRoots() : getChildren(parentUuid)
    const prevOrderKey = siblings.length > 0 ? getOrderKey(siblings[siblings.length - 1]!) : null
    const orderKey = between(prevOrderKey, null)

    const uuid = crypto.randomUUID()
    createActor(uuid, declaration.src, parentUuid, orderKey)
    addChild(parentUuid, uuid)

    const monadId = createMonad({
      uuid,
      fields: declaration.fields,
      values: declaration.context || {},
      superposition: declaration.superposition
    })
    updateActor(uuid, { monadId, status: 'active' })
  }
}
```

**Задачи:**

1. [ ] Импорт из store/func модулей
2. [ ] Diff desired vs current
3. [ ] Создание акторов + монад
4. [ ] Удаление акторов + монад
5. [ ] Связь `ActorRecord.uuid → monadId`
6. [ ] Логирование изменений

---

### Этап 7: Реактивность ⬜

**Файл:** `space/client.ts`

```typescript
let lastValues: Record<string, unknown> = {}

async function checkAndReapply(newValues: Record<string, unknown>) {
  if (hasChanged(lastValues, newValues)) {
    const declarations = parseHierarchy(hierarchy, { value: newValues, state, mass })
    await syncActors(hierarchy, { value: newValues, state, mass }, null)
    lastValues = newValues
  }
}
```

**Задачи:**

1. [ ] Shallow equality check
2. [ ] Пересчёт иерархии при изменениях
3. [ ] Debounce (опционально)

---

### Этап 8: Тестирование на git-иерархии ⬜

**Сценарии:**

1. [ ] Старт: `operation = null` → нет детей
2. [ ] Ввод команды: `command = "clone"` → `operation = "start"`
3. [ ] Гравитация: создание актора `zavx0z/git-start`
4. [ ] Смена операции: `operation = "work"` → замена ребёнка
5. [ ] Ошибка: `error = "..."` → создание `zavx0z/git-error`

---

## 3. Критерии готовности

| Критерий | Статус |
| -------- | ------ |
| ✅ Store Order: orderKey CRUD | ✅ Завершено |
| ✅ Store Graph: childrenView CRUD | ✅ Завершено |
| ✅ Store Actor: actors CRUD | ✅ Завершено |
| ⬜ Func Parse: AST → ActorDeclaration[] | ⬜ Ожидает |
| ⬜ Func Resolve: пути/условия | ⬜ Ожидает |
| ⬜ Интеграция в client.ts | ⬜ Ожидает |
| ⬜ Реактивность на изменения полей | ⬜ Ожидает |
| ⬜ Работа с git-иерархией | ⬜ Ожидает |
| ⬜ Тесты (unit + integration) | ⬜ Ожидает |

---

## 4. Риски

| Риск | Решение |
| ---- | ------- |
| Переполнение orderKey | Увеличивать размер Uint8Array при необходимости |
| Каскадное удаление | Рекурсивный `removeChild()` + `deleteActor()` |
| Частые ре-рендеры | Shallow equality, debounce |
| Динамические `src` (нет DSL) | Lazy load, error boundary |

---

## 5. Зависимости

| Задача | Файл | Статус |
| ------ | ---- | ------ |
| **✅ UUID в client.ts** | (удалена) | ✅ Завершена |
| **✅ Gravity Stores** | (удалена) | ✅ Завершена |
| **🔄 Func Parse** | `tasks/func-parse.md` | 🔄 В выполнении |
| **⬜ Entangled Planning** | `tasks/entangled-planning.md` | ⬜ Ожидает |
| **⬜ Func Resolve** | `tasks/func-resolve.md` | ⬜ Ожидает |
| **⬜ Интеграция client.ts** | — | ⬜ Ожидает |
| **⬜ Реактивность** | — | ⬜ Ожидает |
| **⬜ Тесты git-иерархия** | — | ⬜ Ожидает |
