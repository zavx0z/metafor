# 🌌 Запутанность полей: Анализ и План

**Дата:** 5 марта 2026
**Статус:** На утверждении

---

## Часть 1: Анализ

### 1.1. Архитектура сторов

#### Gravity (FORCE) — два стора

```
┌─────────────────────────────────────────────────────────┐
│ Gravity Stores                                          │
│                                                         │
│ 1. Field Store (поле)                                   │
│    - uuid: string                                       │
│    - type: "string" | "number" | "enum" | ...           │
│    - default?: unknown                                  │
│    - schemas: string[]  ← ссылки на Schema.uuid         │
│                                                         │
│ 2. Schema Store (схема)                                 │
│    - uuid: string                                       │
│    - field: string  ← ссылка на Field.uuid          │
│    - name: string       ← имя в DSL (operation, args)   │
│    - label?: string     ← человекочитаемое имя          │
│    - default?: unknown  ← дефолт для этой схемы         │
│                                                         │
│ 3. Entangled (запутанность)                             │
│    - field: string[]  ← какие поля запутаны        │
│    - conditionPath?: string                             │
│    - iterationPath?: string                             │
│    - children?: Entangled[]                             │
└─────────────────────────────────────────────────────────┘
```

**Ответственность:**
- ✅ Извлекает зависимости из AST
- ✅ Создаёт `Field` и `Schema`
- ✅ Определяет запутанность через `field`
- ❌ **НЕ вычисляет значения**

---

#### Strong Force (SPACE) — один стор

```
┌─────────────────────────────────────────────────────────┐
│ Strong Force Store                                      │
│                                                         │
│ EntangledField Store (обезличенные данные)              │
│    - uuid: string         ← генерирует сам              │
│    - fieldUuids: string[] ← из Gravity                  │
│    - value: unknown       ← вычисленное значение        │
│                                                         │
│ Пример:                                                  │
│   {                                                      │
│     uuid: "ef-abc123",  ← Strong Force UUID             │
│     fieldUuids: ["field-enum-001"],                      │
│     value: "start"                                       │
│   }                                                      │
└─────────────────────────────────────────────────────────┘
```

**Ответственность:**
- ✅ Получает `FlatStructure` от Gravity
- ✅ **Генерирует свои UUID** для групп запутанных полей
- ✅ **Вычисляет значения** для полей
- ✅ **Группирует** поля с одинаковыми значениями
- ❌ **НЕ знает о schema/name/label**

---

#### Boundary (FIELDS) — два стора

```
┌─────────────────────────────────────────────────────────┐
│ Boundary Stores                                         │
│                                                         │
│ 1. Entangled Groups (группы для бран)                   │
│    - uuid: string         ← из Strong Force             │
│    - braneIndices: number[]                              │
│    - fieldUuids: string[] ← из Strong Force             │
│    - value: unknown       ← общее значение              │
│                                                         │
│ 2. Blocks (объединение в блоки)                         │
│    - uuid: string         ← блок в heap                 │
│    - groups: string[]     ← какие группы в блоке        │
│    - shared: boolean      ← shared или local            │
│    - ptr: number          ← позиция в heap              │
└─────────────────────────────────────────────────────────┘
```

**Ответственность:**
- ✅ Получает группы от Strong Force
- ✅ **Создаёт shared блоки** для групп с одинаковыми значениями
- ✅ **Маппит группы на блоки**
- ✅ **Строит heap**
- ❌ **НЕ знает о DSL/AST/schema**

---

### 1.2. Поток данных

```
┌─────────────────────────────────────────────────────────┐
│ 1. DSL                                                  │
│ .fields((field) => ({                                   │
│   operation: field.enum(...),                           │
│   op: field.enum(...)  ← тот же тип!                    │
│ }))                                                     │
│ .bulk({ gravity: ({ value, html }) => html`             │
│   <meta-for fields={{                                   │
│     operation: value.operation,                         │
│     op: value.operation  ← то же значение!              │
│   }} />                                                 │
│ `})                                                     │
└─────────────────────────────────────────────────────────┘
         ↓ build
┌─────────────────────────────────────────────────────────┐
│ 2. meta.json                                            │
└─────────────────────────────────────────────────────────┘
         ↓ parse()
┌─────────────────────────────────────────────────────────┐
│ 3. AST (Node[])                                         │
└─────────────────────────────────────────────────────────┘
         ↓ traverseHierarchy()
┌─────────────────────────────────────────────────────────┐
│ 4. Gravity (FORCE) — зависимости                        │
│                                                         │
│ Field Store:                                            │
│   field-enum-001: {                                     │
│     type: "enum",                                       │
│     schemas: ["schema-operation", "schema-op"]          │
│   }                                                     │
│                                                         │
│ Schema Store:                                           │
│   schema-operation: { fieldUuid: "field-enum-001",      │
│                       name: "operation" }               │
│   schema-op: { fieldUuid: "field-enum-001",             │
│                name: "op" }                             │
│                                                         │
│ FlatStructure:                                          │
│   entangled: {                                          │
│     groups: [{ fieldUuids: ["field-enum-001"] }]        │
│   }                                                     │
│                                                         │
│ ╰─ ПЕРЕДАЁТ: fieldUuids                                 │
└─────────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────────┐
│ 5. Strong Force (SPACE) — обезличенные данные           │
│                                                         │
│ EntangledField Store:                                   │
│   ef-abc123: {                                          │
│     uuid: "ef-abc123",       ← Strong Force UUID        │
│     fieldUuids: ["field-enum-001"],                     │
│     value: "start"                                      │
│   }                                                     │
│                                                         │
│ manifests = [{                                          │
│   fields: { operation: "start", op: "start" }           │
│ }]                                                      │
│                                                         │
│ ╰─ ПЕРЕДАЁТ: { uuid, value } (без schema!)              │
└─────────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────────┐
│ 6. Boundary (FIELDS) — группы и блоки                   │
│                                                         │
│ Entangled Groups Store:                                 │
│   ef-abc123: {                                          │
│     uuid: "ef-abc123",                                  │
│     braneIndices: [0, 1],                               │
│     value: "start"                                      │
│   }                                                     │
│                                                         │
│ Blocks Store:                                           │
│   block-shared-001: {                                   │
│     uuid: "block-shared-001",                           │
│     groups: ["ef-abc123"],                              │
│     shared: true,                                       │
│     ptr: 0                                              │
│   }                                                     │
│                                                         │
│ ╰─ СОЗДАЁТ: shared блок для группы                      │
└─────────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────────┐
│ 7. Heap — физическая память                             │
│                                                         │
│ heap: Uint32Array [                                     │
│   /* shared блок #0 */                                  │
│   1, 0, 0,  // local_count, entangled_count, lock       │
│   meta,      // field descriptor                        │
│   value,     // "start"                                 │
│                                                         │
│   /* брана 0 */                                         │
│   0, 1, 0,   // local_count=0, entangled_count=1        │
│   ptr0,      // ссылка на shared #0                     │
│                                                         │
│   /* брана 1 */                                         │
│   0, 1, 0,   // local_count=0, entangled_count=1        │
│   ptr0,      // ссылка на shared #0                     │
│ ]                                                       │
└─────────────────────────────────────────────────────────┘
```

---

### 1.3. Формат данных

#### Gravity → Strong Force

```typescript
// FlatStructure
{
  entangled: {
    groups: [{
      fieldUuids: ["field-enum-001"],  ← Gravity UUID
      conditionPath: "/value/operation"
    }]
  },
  manifests: [{
    fields: [
      { schemaUuid: "schema-operation", fieldUuid: "field-enum-001", path: "/value/operation" },
      { schemaUuid: "schema-op", fieldUuid: "field-enum-001", path: "/value/operation" }
    ]
  }]
}
```

---

#### Strong Force → Boundary

```typescript
// Strong Force передаёт Boundary
{
  manifests: [{
    fields: { operation: "start", op: "start" }  ← Без schema!
  }],
  entangledGroups: [{
    uuid: "ef-abc123",      ← Strong Force UUID
    fieldUuids: ["field-enum-001"],
    value: "start"
  }]
}
```

---

#### Boundary Internal

```typescript
// Entangled Groups Store
{
  "ef-abc123": {
    uuid: "ef-abc123",
    braneIndices: [0, 1],
    value: "start"
  }
}

// Blocks Store
{
  "block-shared-001": {
    uuid: "block-shared-001",
    groups: ["ef-abc123"],
    shared: true,
    ptr: 0
  }
}
```

---

### 1.4. Ключевые принципы

| Уровень | Что знает | Чего НЕ знает |
|---------|-----------|---------------|
| **Gravity** | `Field.uuid`, `Schema.uuid`, `Schema.name`, `Schema.label` | Значения полей |
| **Strong Force** | `Field.uuid`, `value`, **свой `uuid` для групп** | `Schema.name`, `Schema.label` |
| **Boundary** | **Strong Force `uuid`**, `value`, `braneIndices` | `Field.uuid`, `Schema.*`, DSL |

---

## Часть 2: План реализации

### 2.1. Этап 1: Gravity — Field/Schema сторы

**Файлы:**
- `force/gravity/store/field.t.ts`
- `force/gravity/store/field.ts`
- `force/gravity/store/field.spec.ts`
- `force/gravity/store/schema.t.ts`
- `force/gravity/store/schema.ts`
- `force/gravity/store/schema.spec.ts`

**Типы (field.t.ts):**
```typescript
export type FieldType = "string" | "number" | "boolean" | "enum" | "array" | "object"

export interface FieldRecord {
  uuid: string
  type: FieldType
  default?: unknown
  schemas: string[]  // Schema.uuid[]
}

export interface FieldStore {
  get(uuid: string): FieldRecord | undefined
  getByType(type: FieldType): FieldRecord[]
  create(field: Omit<FieldRecord, 'uuid'>): string
  addSchema(fieldUuid: string, schemaUuid: string): void
  clear(): void
}
```

**Типы (schema.t.ts):**
```typescript
export interface SchemaRecord {
  uuid: string
  fieldUuid: string  // Field.uuid
  name: string       // Имя в DSL
  label?: string
  default?: unknown
}

export interface SchemaStore {
  get(uuid: string): SchemaRecord | undefined
  getByName(name: string): SchemaRecord | undefined
  getByField(fieldUuid: string): SchemaRecord[]
  create(schema: Omit<SchemaRecord, 'uuid'>): string
  clear(): void
}
```

---

### 2.2. Этап 2: Gravity — traverseHierarchy

**Файлы:**
- `force/gravity/func/traverse.t.ts`
- `force/gravity/func/traverse.ts`
- `force/gravity/func/traverse.spec.ts`

**Типы (traverse.t.ts):**
```typescript
export interface FieldLink {
  schemaUuid: string    // "schema-operation"
  fieldUuid: string     // "field-enum-001"
  path: string          // "/value/operation"
}

export interface EntangledGroup {
  fieldUuids: string[]    // UUID полей из Gravity
  conditionPath?: string
  iterationPath?: string
  children?: EntangledGroup[]
}

export interface FlatStructure {
  conditions: string[]
  iterations: string[]
  manifests: ManifestPath[]
  entangled: EntangledStructure
}
```

**Функции (traverse.ts):**
```typescript
export function traverseHierarchy(
  nodes: NodeType[],
  stores: {
    fields: FieldStore
    schemas: SchemaStore
  }
): FlatStructure
```

---

### 2.3. Этап 3: Strong Force — генерация UUID для групп

**Файл:** `space/client.ts`

**Функции:**
```typescript
interface EntangledFieldGroup {
  uuid: string              // Strong Force генерирует
  fieldUuids: string[]      // Из Gravity
  value: unknown            // Вычисленное значение
}

function createEntangledGroups(
  entangled: EntangledStructure,
  manifests: ManifestPath[],
  context: EvaluateContext
): EntangledFieldGroup[]

function evaluateFieldLinks(
  links: FieldLink[],
  context: EvaluateContext
): Record<string, unknown>  // { schemaName: value }
```

**Код (client.ts):**
```typescript
// 1. Gravity → FlatStructure
const structure = traverseHierarchy(schema.bulk.gravity, {
  fields: fieldStore,
  schemas: schemaStore
})

// 2. Вычисляем значения
const manifests = evaluateConditions(structure, context)
  .map(m => ({
    src: evaluateTemplate(m.src.template, [...]),
    fields: evaluateFieldLinks(m.fields, context)
  }))

// 3. Создаём группы Strong Force (обезличенные)
const entangledGroups = createEntangledGroups(
  structure.entangled,
  manifests,
  context
)
// entangledGroups = [{
//   uuid: "ef-abc123",  ← Strong Force UUID
//   fieldUuids: ["field-enum-001"],
//   value: "start"
// }]

// 4. Передаём в Boundary
await updateBoundary({
  manifests,
  entangledGroups  ← Без schema!
})
```

---

### 2.4. Этап 4: Boundary — группы и блоки

**Файлы:**
- `@boundary/fields/entangled.t.ts`
- `@boundary/fields/entangled.ts`
- `@boundary/fields/blocks.t.ts` (новый)
- `@boundary/fields/blocks.ts` (новый)

**Типы (entangled.t.ts):**
```typescript
export interface EntangledGroup {
  uuid: string              // Из Strong Force
  braneIndices: number[]
  value: unknown
}

export interface EntangledAnalysis {
  entangledGroups: Map<string, EntangledGroup>  // uuid → group
}
```

**Типы (blocks.t.ts):**
```typescript
export interface BlockRecord {
  uuid: string              // Блок в heap
  groups: string[]          // EntangledGroup.uuid[]
  shared: boolean
  ptr: number               // Позиция в heap
}

export interface BlocksStore {
  create(block: Omit<BlockRecord, 'uuid'>): string
  get(uuid: string): BlockRecord | undefined
  getByGroup(groupUuid: string): BlockRecord | undefined
}
```

**Функции (entangled.ts):**
```typescript
export function findEntangledGroups(
  values: [number, unknown][][],
  entangledGroups: Array<{ uuid: string; value: unknown }>
): EntangledAnalysis

export function buildBraneMapping(
  values: [number, unknown][][],
  analysis: EntangledAnalysis,
  blocks: BlocksStore
): BraneMapping
```

---

## 3. Чек-лист реализации

### Этап 1: Gravity Stores

- [ ] `field.t.ts` — `FieldRecord`, `FieldType`, `FieldStore`
- [ ] `field.ts` — `create()`, `get()`, `addSchema()`
- [ ] `field.spec.ts` — тесты на CRUD
- [ ] `schema.t.ts` — `SchemaRecord`, `SchemaStore`
- [ ] `schema.ts` — `create()`, `get()`, `getByName()`
- [ ] `schema.spec.ts` — тесты на CRUD

### Этап 2: Gravity Traverse

- [ ] `traverse.t.ts` — `FieldLink`, `EntangledGroup` (с `fieldUuids`)
- [ ] `traverse.ts` — `traverseHierarchy()` с `stores`
- [ ] `traverse.ts` — `extractFieldLinks()` с созданием `Field`/`Schema`
- [ ] `traverse.spec.ts` — тест на `fieldUuids` в `entangled.groups`

### Этап 3: Strong Force

- [ ] `client.ts` — `createEntangledGroups()` с генерацией `uuid`
- [ ] `client.ts` — `evaluateFieldLinks()` → `{ schemaName: value }`
- [ ] `client.ts` — вызов `updateBoundary({ entangledGroups })`

### Этап 4: Boundary

- [ ] `entangled.t.ts` — `EntangledGroup` (с `uuid` из Strong Force)
- [ ] `entangled.ts` — `findEntangledGroups()` с `entangledGroups`
- [ ] `blocks.t.ts` — `BlockRecord`, `BlocksStore`
- [ ] `blocks.ts` — `create()`, `get()`, `getByGroup()`
- [ ] `entangled.ts` — `buildBraneMapping()` с `blocks`
- [ ] `entangled.spec.ts` — тест на shared блоки

### Этап 5: Интеграция

- [ ] `integration.spec.ts` — тест на поля с одинаковым типом/значением
- [ ] `integration.spec.ts` — проверка shared блоков

---

## 4. Оценка времени

| Этап | Задачи | Время |
|------|--------|-------|
| **1. Gravity Stores** | `field.*`, `schema.*` | 2 часа |
| **2. Gravity Traverse** | Модификация с `stores` | 1.5 часа |
| **3. Strong Force** | `createEntangledGroups()` | 1 час |
| **4. Boundary** | `entangled.*`, `blocks.*` | 1.5 часа |
| **5. Интеграция** | Тесты | 0.5 часа |
| **Итого** | | **6.5 часов** |

---

## 5. Критерии готовности

- [ ] `FieldStore` создаёт `FieldRecord` с `uuid`, `type`, `schemas[]`
- [ ] `SchemaStore` создаёт `SchemaRecord` с `fieldUuid`, `name`, `label`
- [ ] `Strong Force` генерирует свои `uuid` для групп
- [ ] `Strong Force` НЕ передаёт `schemaUuid` в Boundary
- [ ] `Boundary` использует `uuid` из Strong Force
- [ ] `BlocksStore` создаёт shared блоки для групп
- [ ] Integration тест на поля с одинаковыми значениями
