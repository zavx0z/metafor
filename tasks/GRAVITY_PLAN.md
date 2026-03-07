# 🌌 План реализации: Force Gravity

**Цель:** Реализовать механизм гравитации — обход AST с вычислением условий и управление иерархией акторов через store с передачей запутанности в boundary.

**Контекст:**

- `space/client.ts` — скриптовый стиль (взаимодействия, оркестрация)
- `force/gravity/func/` — чистые функции (обход AST, вычисление условий)
- `force/gravity/store/` — явное состояние (граф иерархии, CRUD акторов, entangled)
- `@metafor/template` — парсер template literals → AST (`NodeType[]`)
- `@boundary/fields` — вычисление запутанности (оптимизация GPU-памяти)

**Архитектурные принципы:**

- ❌ **Никаких классов** — только чистые функции + явное состояние в store
- ❌ **Никаких поддиректорий** — модуль = 3 файла (`.ts`, `.t.ts`, `.spec.ts`)
- ✅ **CRUD в store** — каждый store имеет свой API для работы со своим состоянием
- ✅ **Граф иерархии** — из `force/gravity/old.md` (childrenView, orderKey)
- ✅ **UUID генерация** — перед сохранением в store
- ✅ **Store зависимостей** — actor → graph → order
- ✅ **Запутанность вычисляется в gravity** — передаётся готовой в boundary

---

## 1. Архитектура

### 1.1. Что делает Gravity

| Делает | Не делает |
| ------ | --------- |
| Обходит AST → `string[]` (src акторов) | Не вызывает `createActor()`/`deleteActor()` |
| Вычисляет условия (`log`, `cond`) на лету | Не знает о внутренностях акторов |
| Хранит граф иерархии (childrenView) | Не управляет состоянием автомата |
| Генерирует orderKey для порядка | Не обрабатывает HTML элементы (`el`, `text`) |
| CRUD операции над акторами | Не хранит `fields`/`superposition` (это в DSL) |
| Вычисляет entangled группы | Не передаёт сырые данные в boundary |

### 1.2. Поток данных

```text
space/client.ts
  ↓
loadDSL() → Schema
  ↓
schema.gravity → NodeType[]
  ↓
traverseHierarchy(NodeType[], context) → string[]
  ↓
for each src: createActor(uuid, src, parentUuid, orderKey)
  ↓
computeEntangled(actors) → EntangledData
  ↓
for each actor: createActor({ uuid, fields, values, superposition })
  ↓
updateBoundary(entangled) → Boundary с общими блоками
```

### 1.3. Структура модулей

```text
force/gravity/
├── func/
│   ├── traverse.ts      # traverseHierarchy(), traverseNode()
│   ├── traverse.t.ts    # TraverseContext
│   ├── traverse.spec.ts # тесты на обход
│   ├── resolve.ts       # resolveCondition(), resolvePath()
│   ├── resolve.t.ts     # ResolveContext
│   └── resolve.spec.ts  # тесты на вычисление
├── store/
│   ├── order.ts         # orderKey CRUD
│   ├── order.t.ts       # OrderKey тип
│   ├── order.spec.ts    # тесты
│   ├── graph.ts         # childrenView CRUD + иерархия
│   ├── graph.t.ts       # ChildrenView, IndexPath типы
│   ├── graph.spec.ts    # тесты
│   ├── actor.ts         # actors CRUD
│   ├── actor.t.ts       # ActorRecord тип
│   ├── actor.spec.ts    # тесты
│   ├── entangled.ts     # computeEntangled(), getEntangledData()
│   ├── entangled.t.ts   # EntangledData тип
│   └── entangled.spec.ts# тесты
├── load.ts              # загрузка DSL (существует)
├── old.md               # документация (архив концепций)
└── README.md            # API документация

space/
├── client.ts            # скриптовый стиль, оркестрация
└── GRAVITY_PLAN.md      # этот план
```

### 1.4. CRUD по store

Каждый store — **автономный модуль** со своим CRUD API:

| Store | Состояние | CRUD API |
| ----- | --------- | -------- |
| **order** | `OrderKey = Uint8Array` | `first()`, `last()`, `between()`, `compare()` |
| **graph** | `childrenView`, `indexPaths` | DOM-подобный API (12 функций) |
| **actor** | `Map<uuid, ActorRecord>` | `createActor()`, `getActor()`, `updateActor()`, `deleteActor()` + helpers |
| **entangled** | `EntangledData \| null` | `computeEntangled()`, `getEntangledData()` |

**Зависимости между store:**

```text
actor.ts → импортирует → graph.ts, order.ts
graph.ts → импортирует → order.ts
entangled.ts → импортирует → @boundary/fields/entangled
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

### 1.6. Ключевые инсайты

#### 1.6.1. Обход вместо парсинга

**❌ Было (парсер):**

```typescript
parseHierarchy(nodes, context): ActorDeclaration[]
// ActorDeclaration { src, context, fields, superposition }
```

**✅ Стало (обходчик):**

```typescript
traverseHierarchy(nodes, context): string[]
// ["zavx0z/git-start", "zavx0z/git-commit", ...]
```

**Почему:**

- `context` динамический — условия нужно вычислять на лету
- `fields`/`superposition` берутся из DSL схемы, не из gravity
- Простой массив src легче интегрировать с store

#### 1.6.2. Запутанность вычисляется в gravity

**❌ Было:**

```typescript
// @boundary/fields/prepare.ts
prepareData(data: Data) {
  const entangledAnalysis = findEntangledGroups(values)  // вычисление внутри boundary
}
```

**✅ Стало:**

```typescript
// client.ts
const entangled = storeEntangled.computeEntangled(actors)
await updateBoundary(entangled)  // передача готовых данных

// @boundary/fields/prepare.ts
prepareData(data: Data) {
  const analysis = data.entangled?.analysis ?? findEntangledGroups(values)
}
```

**Почему:**

- Gravity знает какие акторы создаются
- Entangled должен вычисляться до `createActor()`
- Boundary получает готовые данные, не вычисляет

#### 1.6.3. ActorRecord не содержит fields/superposition

**❌ Было:**

```typescript
interface ActorRecord {
  uuid: string
  src: string
  fields: Record<string, unknown>      // ❌ лишнее
  superposition: Record<string, unknown> // ❌ лишнее
}
```

**✅ Стало:**

```typescript
interface ActorRecord {
  uuid: string
  src: string
  parentUuid: string | null
  orderKey: Uint8Array
  actorId?: string
  status: 'pending' | 'active' | 'deleted'
}
```

**Почему:**

- `fields` определяются в DSL файле актора
- `superposition` определяется в DSL файле актора
- Gravity только управляет иерархией, не знает о внутренностях

---

## 2. Этапы реализации

### Этап 1: Store Order (orderKey CRUD) ✅

**Файлы:** `force/gravity/store/order.ts`, `order.t.ts`, `order.spec.ts`

**Статус:** ✅ Завершено (13 тестов)

**API:**

- `first()` — первый orderKey `[128]`
- `last()` — последний orderKey `[255]`
- `between(prev, next)` — вычисление промежуточного ключа
- `compare(a, b)` — лексикографическое сравнение

---

### Этап 2: Store Graph (childrenView CRUD) ✅

**Файлы:** `force/gravity/store/graph.ts`, `graph.t.ts`, `graph.spec.ts`

**Статус:** ✅ Завершено (17 тестов)

**API (DOM-подобный):**

- `appendChild()` — добавить в конец
- `insertBefore()` — вставить перед sibling
- `removeChild()` — удалить (без потомков)
- `replaceChild()` — заменить
- `moveChild()` — переместить к новому родителю
- `removeChildWithDescendants()` — удалить с потомками
- `hasChildren()` — проверка наличия детей
- `getChildren()` — получить детей
- `getRoots()` — получить корневые
- `getIndexPathByUuid()` — uuid → `"0/1/2"`
- `getUuidByIndexPath()` — `"0/1/2"` → uuid
- `computeIndexPath()` — вычислить путь для нового

---

### Этап 3: Store Actor (actors CRUD) ✅

**Файлы:** `force/gravity/store/actor.ts`, `actor.t.ts`, `actor.spec.ts`

**Статус:** ✅ Завершено (9 тестов)

**API:**

- `createActor(uuid, src, parentUuid, orderKey)` — создать
- `getActor(uuid)` — получить по UUID
- `updateActor(uuid, updates)` — обновить
- `deleteActor(uuid)` — удалить
- `getAllActors()` — список всех
- `getActorsByParent(parentUuid)` — фильтрация по родителю

**ActorRecord:**

```typescript
interface ActorRecord {
  uuid: string
  src: string
  parentUuid: string | null
  orderKey: Uint8Array
  actorId?: string
  status: 'pending' | 'active' | 'deleted'
}
```

---

### Этап 4: Store Entangled (запутанность полей) ⬜

**Файлы:** `force/gravity/store/entangled.ts`, `entangled.t.ts`, `entangled.spec.ts`

**Ответственность:** Вычисление entangled групп для оптимизации GPU-памяти.

**Контекст:**

Когда у нескольких акторов **одинаковые значения полей**, нет смысла дублировать данные в GPU-памяти. Вместо этого создаётся **entangled блок** с общими данными.

**Пример:**

```typescript
// Актор 1: { count: 42 }
// Актор 2: { count: 42 }  // ← одинаковое значение
// Вместо хранения дважды → общий entangled блок
```

**API:**

```typescript
// entangled.t.ts
export interface EntangledData {
  entangledBraneIds: Map<string, number>  // ключ группы → ID
  analysis: EntangledAnalysis             // результат findEntangledGroups()
}

// entangled.ts
/**
 * Вычисляет entangled группы для акторов.
 *
 * @param actors - массив ActorRecord для анализа
 * @returns готовые данные для передачи в updateBoundary()
 */
export function computeEntangled(actors: ActorRecord[]): EntangledData

/**
 * Получает вычисленные entangled данные.
 *
 * @returns EntangledData или null если не вычислено
 */
export function getEntangledData(): EntangledData | null

export function _resetStore(): void
```

**Зависимости:**

- Импортирует `findEntangledGroups`, `buildBraneMapping` из `@boundary/fields/entangled`
- Использует `getAllActors()` из `actor.ts`

**Интеграция:**

```typescript
// client.ts
import { computeEntangled } from "force/gravity/store/entangled"
import { updateBoundary } from "force"

async function syncActors() {
  const actors = storeActor.getAllActors()
  const entangled = computeEntangled(actors)
  
  for (const actor of actors) {
    createActor({ uuid: actor.uuid, ... })
  }
  
  await updateBoundary(entangled)  // ← передача готовых данных
}
```

**Задачи:**

1. [ ] `entangled.t.ts` — типы `EntangledData`, `EntangledAnalysis`
2. [ ] `entangled.ts` — `computeEntangled()`, `getEntangledData()`
3. [ ] `entangled.spec.ts` — тесты на вычисление групп
4. [ ] Интеграция с `@boundary/fields/entangled`
5. [ ] Тесты на передачу в `updateBoundary()`

---

### Этап 5: Func Traverse (обход AST) ⬜

**Файлы:** `force/gravity/func/traverse.ts`, `traverse.t.ts`, `traverse.spec.ts`

**Ответственность:** Обход AST с вычислением условий → массив `src`.

**Контекст:**

**Нам не нужен парсер** — нам нужен **обходчик с вычислением условий на лету**.

**Почему не парсер:**

- `ActorDeclaration` с `context`/`fields`/`superposition` — лишняя сложность
- Условия (`log`, `cond`) нужно вычислять во время обхода
- `fields`/`superposition` берутся из DSL, не из gravity
- Простой `string[]` легче интегрировать

**API:**

```typescript
// traverse.t.ts
export interface TraverseContext {
  value: Record<string, unknown>  // value.* для условий
  state: string                    // state.* для условий
  mass: Record<string, unknown>    // mass.* для итерации (map)
}

// traverse.ts
/**
 * Обходит AST и собирает src акторов с учётом условий.
 *
 * @param nodes - AST от @metafor/template
 * @param context - контекст для вычисления условий
 * @returns массив src для создания акторов
 *
 * @example
 * ```typescript
 * const srcs = traverseHierarchy(nodes, {
 *   value: { operation: "clone" },
 *   state: "idle",
 *   mass: { items: ["item1", "item2"] }
 * })
 * // ["zavx0z/git-clone", "zavx0z/git-item", "zavx0z/git-item"]
 * ```
 */
export function traverseHierarchy(
  nodes: NodeType[],
  context: TraverseContext
): string[]

/**
 * Рекурсивно обходит узел AST.
 *
 * @param node - узел для обхода
 * @param context - контекст для вычисления условий
 * @returns массив src из этого узла и детей
 *
 * @internal
 */
function traverseNode(
  node: NodeType,
  context: TraverseContext
): string[]

/**
 * Обрабатывает NodeMeta — возвращает [src].
 *
 * @internal
 */
function traverseMeta(node: NodeMeta): string[]

/**
 * Обрабатывает NodeLogical — вычисляет условие, рекурсия по детям.
 *
 * @internal
 */
function traverseLogical(
  node: NodeLogical,
  context: TraverseContext
): string[]

/**
 * Обрабатывает NodeCondition — выбор ветки (true/false), рекурсия.
 *
 * @internal
 */
function traverseCondition(
  node: NodeCondition,
  context: TraverseContext
): string[]

/**
 * Обрабатывает NodeMap — итерация, рекурсия для каждого элемента.
 *
 * @internal
 */
function traverseMap(
  node: NodeMap,
  context: TraverseContext
): string[]
```

**Алгоритмы:**

**`traverseLogical`:**

```typescript
function traverseLogical(node, context): string[] {
  const condition = resolveCondition(node.data, node.expr, context)
  if (!condition) return []  // условие ложно → пропускаем детей
  return traverseChildren(node.child, context)
}
```

**`traverseCondition`:**

```typescript
function traverseCondition(node, context): string[] {
  const condition = resolveCondition(node.data, node.expr, context)
  const branchIndex = condition ? 0 : 1  // true → child[0], false → child[1]
  return traverseChildren(node.child[branchIndex], context)
}
```

**`traverseMap`:**

```typescript
function traverseMap(node, context): string[] {
  const array = resolvePath(node.data, context)  // массив из mass
  if (!Array.isArray(array)) return []

  return array.flatMap(item => {
    const itemContext = { ...context, item }  // добавляем item в контекст
    return traverseChildren(node.child, itemContext)
  })
}
```

**Задачи:**

1. [ ] `traverse.t.ts` — тип `TraverseContext`
2. [ ] `traverse.ts` — `traverseHierarchy()`, `traverseNode()`, `traverseMeta()`, `traverseLogical()`, `traverseCondition()`, `traverseMap()`
3. [ ] `traverse.spec.ts` — тесты на каждый тип узла
4. [ ] Интеграция с `resolveCondition()` (этап 6)
5. [ ] Тесты на вычисление условий

---

### Этап 6: Func Resolve (вычисление путей/условий) ⬜

**Файлы:** `force/gravity/func/resolve.ts`, `resolve.t.ts`, `resolve.spec.ts`

**Ответственность:** Вычисление путей и условий из контекста для `traverse.ts`.

**API:**

```typescript
// resolve.t.ts
export interface ResolveContext {
  value: Record<string, unknown>
  state: string
  mass: Record<string, unknown>
  item?: unknown  // для map итерации
}

// resolve.ts
/**
 * Вычисляет логическое/условное выражение.
 *
 * @param data - путь(и) к данным
 * @param expr - выражение с индексами (опционально)
 * @param context - контекст для вычисления
 * @returns true если условие истинно
 *
 * @example
 * ```typescript
 * resolveCondition("/value/operation", "${[0]} === 'clone'", context)  // true
 * ```
 */
export function resolveCondition(
  data: string | string[],
  expr: string | undefined,
  context: ResolveContext
): boolean

/**
 * Получает значение по пути из контекста.
 *
 * @param path - путь к данным (например, "/mass/items")
 * @param context - контекст для вычисления
 * @returns значение или undefined
 *
 * @example
 * ```typescript
 * resolvePath("/mass/items", context)  // ["item1", "item2"]
 * ```
 */
export function resolvePath(
  path: string,
  context: ResolveContext
): unknown
```

**Операторы:**

- Сравнение: `===`, `!==`, `>`, `<`, `>=`, `<=`
- Логические: `&&`, `||`, `!`
- Литералы: строки, числа, булевы

**Задачи:**

1. [ ] `resolve.t.ts` — тип `ResolveContext`
2. [ ] `resolve.ts` — `resolveCondition()`, `resolvePath()`
3. [ ] `resolve.spec.ts` — тесты на операторы и литералы
4. [ ] Интеграция с `traverse.ts`

---

### Этап 7: Интеграция в client.ts ⬜

**Файл:** `space/client.ts`

**Поток данных:**

```typescript
import { traverseHierarchy } from "force/gravity/func/traverse"
import { createActor, getAllActors } from "force/gravity/store/actor"
import { computeEntangled } from "force/gravity/store/entangled"
import { appendChild, getRoots, getChildren } from "force/gravity/store/graph"
import { between, first } from "force/gravity/store/order"
import { createActor, updateBoundary, deleteActor } from "force"

async function syncActors(
  nodes: NodeType[],
  context: TraverseContext,
  parentUuid: string | null = null
) {
  // 1. Обход AST → [src, src, src]
  const srcs = traverseHierarchy(nodes, context)

  // 2. Получаем текущих акторов
  const current = parentUuid === null
    ? getRoots()
    : getChildren(parentUuid)

  // 3. Вычисляем diff
  const toCreate = srcs.filter(src => !current.some(a => a.src === src))
  const toDelete = current.filter(uuid => !srcs.some(src => src === uuid))

  // 4. Удаляем лишних
  for (const uuid of toDelete) {
    const actor = getActor(uuid)
    if (actor?.actorId) {
      deleteActor(actor.actorId)
    }
    deleteActor(uuid)
    removeChild(parentUuid, uuid)
  }

  // 5. Создаём новых
  for (const src of toCreate) {
    const siblings = parentUuid === null ? getRoots() : getChildren(parentUuid)
    const prevOrderKey = siblings.length > 0
      ? getOrderKey(siblings[siblings.length - 1]!)
      : null
    const orderKey = between(prevOrderKey, null)

    const uuid = crypto.randomUUID()
    createActor(uuid, src, parentUuid, orderKey)
    appendChild(parentUuid, uuid)
  }

  // 6. Создаём акторов для всех записей
  const actors = getAllActors()
  for (const actor of actors) {
    // Получаем fields/superposition из DSL схемы
    const schema = await loadDSL(actor.src)
    createActor({
      uuid: actor.uuid,
      fields: schema.fields,
      values: context.value,
      superposition: schema.superposition
    })
  }

  // 7. Вычисляем запутанность и передаём в boundary
  const entangled = computeEntangled(actors)
  await updateBoundary(entangled)
}
```

**Задачи:**

1. [ ] Импорт из `func/traverse`, `store/*`, `force`
2. [ ] Diff desired vs current
3. [ ] Создание акторов + акторов
4. [ ] Удаление акторов + акторов
5. [ ] Связь `ActorRecord.uuid → actorId`
6. [ ] Вычисление и передача `entangled`
7. [ ] Логирование изменений

---

### Этап 8: Реактивность ⬜

**Файл:** `space/client.ts`

**Ответственность:** Пересчёт иерархии при изменении `value`/`state`/`mass`.

**API:**

```typescript
let lastContext: TraverseContext | null = null

async function checkAndReapply(newContext: TraverseContext) {
  if (hasChanged(lastContext, newContext)) {
    const schema = await loadDSL(HUB_DIRECTORY + "zavx0z/git")
    const hierarchy = schema.gravity
    
    await syncActors(hierarchy, newContext, null)
    
    lastContext = newContext
  }
}

function hasChanged(
  old: TraverseContext | null,
  fresh: TraverseContext
): boolean {
  if (!old) return true
  return (
    !shallowEqual(old.value, fresh.value) ||
    old.state !== fresh.state ||
    !shallowEqual(old.mass, fresh.mass)
  )
}

function shallowEqual(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const keysA = Object.keys(a)
  const keysB = Object.keys(b)
  if (keysA.length !== keysB.length) return false
  return keysA.every(key => a[key] === b[key])
}
```

**Задачи:**

1. [ ] `shallowEqual()` для `value`/`mass`
2. [ ] `checkAndReapply()` с пересчётом иерархии
3. [ ] Debounce (опционально)

---

### Этап 9: Тестирование на git-иерархии ⬜

**Сценарии:**

1. [ ] Старт: `operation = null` → нет детей
2. [ ] Ввод команды: `command = "clone"` → `operation = "start"`
3. [ ] Гравитация: создание актора `zavx0z/git-start`
4. [ ] Смена операции: `operation = "work"` → замена ребёнка
5. [ ] Ошибка: `error = "..."` → создание `zavx0z/git-error`

**Интеграционные тесты:**

1. [ ] `traverseHierarchy()` с `log`/`cond`/`map`
2. [ ] `computeEntangled()` с одинаковыми values
3. [ ] `updateBoundary(entangled)` с общими блоками
4. [ ] Полный цикл: AST → акторовы → boundary

---

## 3. Критерии готовности

| Критерий | Статус |
| -------- | ------ |
| ✅ Store Order: orderKey CRUD | ✅ Завершено |
| ✅ Store Graph: childrenView CRUD | ✅ Завершено |
| ✅ Store Actor: actors CRUD | ✅ Завершено |
| ⬜ Store Entangled: entangled groups | ⬜ Ожидает |
| ⬜ Func Traverse: AST → string[] | ⬜ Ожидает |
| ⬜ Func Resolve: условия/пути | ⬜ Ожидает |
| ⬜ Интеграция в client.ts | ⬜ Ожидает |
| ⬜ Реактивность на изменения | ⬜ Ожидает |
| ⬜ Работа с git-иерархией | ⬜ Ожидает |
| ⬜ Тесты (unit + integration) | ⬜ Ожидает |

---

## 4. Риски

| Риск | Решение |
| ---- | ------- |
| Переполнение orderKey | Увеличивать размер Uint8Array при необходимости |
| Каскадное удаление | Рекурсивный `removeChildWithDescendants()` + `deleteActor()` |
| Частые ре-рендеры | Shallow equality, debounce |
| Динамические `src` (нет DSL) | Lazy load, error boundary |
| Entangled не вычисляется | Проверка `computeEntangled()` перед `updateBoundary()` |
| Условия в traverse не работают | Тесты на `resolveCondition()` с разными операторами |

---

## 5. Зависимости

| Задача | Файл | Статус |
| ------ | ---- | ------ |
| **✅ UUID в client.ts** | (удалена) | ✅ Завершена |
| **✅ Gravity Stores** | (удалена) | ✅ Завершена |
| **⬜ Store Entangled** | `tasks/entangled-store.md` | ⬜ Ожидает |
| **⬜ Func Traverse** | `tasks/func-traverse.md` | ⬜ Ожидает |
| **⬜ Func Resolve** | `tasks/func-resolve.md` | ⬜ Ожидает |
| **⬜ Entangled Planning** | `tasks/entangled-planning.md` | ⬜ Ожидает |
| **⬜ Интеграция client.ts** | — | ⬜ Ожидает |
| **⬜ Реактивность** | — | ⬜ Ожидает |
| **⬜ Тесты git-иерархия** | — | ⬜ Ожидает |

---

## 6. Глоссарий

| Термин | Определение |
| ------ | ----------- |
| **Гравитация** | Сила, управляющая иерархией акторов (orderKey, childrenView, indexPath) |
| **Запутанность** | Оптимизация GPU-памяти через общие блоки для одинаковых полей |
| **Обходчик** | Функция `traverseHierarchy()` — обход AST с вычислением условий |
| **Парсер** | ❌ Не используется — условия вычисляются на лету |
| **ActorRecord** | Запись актора в store (uuid, src, parentUuid, orderKey, actorId, status) |
| **EntangledData** | Готовые данные для `updateBoundary()` (entangledBraneIds, analysis) |

---

## 7. Ссылки

- [old.md](./force/gravity/old.md) — архив концепций гравитации
- [entangled-planning.md](./tasks/entangled-planning.md) — задача на планирование запутанности
- [@boundary/fields/entangled.ts](./boundary/fields/entangled.ts) — анализ запутанности
- [@metafor/template](./node_modules/@metafor/template/dist/index.d.ts) — типы узлов AST
