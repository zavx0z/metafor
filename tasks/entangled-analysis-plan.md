# 🌌 Запутанность полей: Анализ и План

**Дата:** 5 марта 2026
**Статус:** На утверждении

---

## Часть 1: Анализ текущего состояния

### 1.1. Что есть сейчас

#### space/client.ts
```typescript
const schema = await loadDSL(HUB_DIRECTORY + "zavx0z/git")
const hierarchy: Node[] = schema.bulk.gravity

// ПУСТОЙ switch — ничего не делает
for (const [key, value] of Object.entries(hierarchy)) {
  switch (value.type) {
    case "map": { break }
    case "cond": { break }
    case "log": { break }
    case "meta": { break }
  }
}
```

**Проблема:** AST загружен, но не обрабатывается.

---

#### force/gravity/func/
```
func/
└── load.ts  // Только загрузка JSON
```

**Проблема:** Нет функций для обхода AST.

---

#### monad/monad.ts
```typescript
export async function updateBoundary(): Promise<BraneStateChange[]> {
  const allBranes: Brane[] = monadIds.map((monadId) => {
    const monadValues = _monadParams.get(monadId)!
    const valuesTuples = valuesToTuples(monadValues)
    return { values: valuesTuples, state: 0, collapses: [...] }
  })
  
  const data: Data = { fields: fieldsArray, branes: allBranes }
  await fieldsWrite(data)  // ← БЕЗ entangled
}
```

**Проблема:** `updateBoundary()` не передаёт запутанность в Boundary.

---

#### @boundary/fields/index.ts
```typescript
export async function write(data: Data): Promise<void> {
  // Нет параметра entangled
}
```

**Проблема:** `fieldsWrite()` не принимает явную запутанность.

---

### 1.2. Что нужно получить

#### space/client.ts
```typescript
const schema = await loadDSL("zavx0z/git")

// 1. Извлекаем структуру из AST
const structure = traverseHierarchy(schema.bulk.gravity)

// 2. Вычисляем значения
const context = { value: { operation: "start" }, mass: {} }
const manifests = evaluateConditions(structure, context)
  .map(m => ({
    src: evaluateTemplate(m.src, context),
    fields: evaluateFields(m.fields, context)
  }))

// 3. Создаём монады
for (const { src, fields } of manifests) {
  const uuid = crypto.randomUUID()
  createMonad({ uuid, fields })
}

// 4. Передаём явную запутанность
await updateBoundary({ entangled: structure.entangled })
```

---

#### force/gravity/func/
```
func/
├── load.ts           // ✅ Существует
├── traverse.ts       // ⬜ traverseHierarchy()
├── traverse.t.ts     // ⬜ Типы
└── traverse.spec.ts  // ⬜ Тесты
```

---

#### monad/monad.ts
```typescript
export async function updateBoundary(params?: {
  entangled?: EntangledStructure
}): Promise<BraneStateChange[]> {
  // ...
  await fieldsWrite({ fields, branes }, params?.entangled)
}
```

---

#### @boundary/fields/index.ts
```typescript
export async function write(
  data: Data,
  entangled?: EntangledStructure
): Promise<void> {
  // Использует явную запутанность
}
```

---

### 1.3. Формат запутанности в DSL

#### Простая запутанность
```typescript
.bulk({
  gravity: ({ value, html }) => html`
    ${value.operation && html`
      <meta-for src="zavx0z/git-${value.operation}"
        fields={{ operation: value.operation, args: value.args }} />
    `}
  `
})
```

---

#### Вложенная запутанность (глубина через map)
```typescript
.bulk({
  gravity: ({ value, mass, html }) => html`
    ${value.operation && html`
      <meta-for src="zavx0z/git-${value.operation}"
        fields={{ operation: value.operation, args: value.args }}>

        ${mass.items.map((item) => html`
          <meta-for src="zavx0z/child-${item.type}"
            fields={{
              parentId: value.operation,  // ← из родителя
              itemId: item.id,            // ← из итерации
              itemType: item.type         // ← из итерации
            }} />
        `)}
      </meta-for>
    `}
  `
})
```

---

#### Запутанность с condition
```typescript
.bulk({
  gravity: ({ value, mass, html }) => html`
    ${value.operation && html`
      <meta-for src="zavx0z/git-${value.operation}"
        fields={{ operation: value.operation }}>
        
        ${mass.items.map((item) => html`
          ${item.active && html`
            <meta-for src="zavx0z/active-${item.type}"
              fields={{
                operation: value.operation,  // ← из root
                itemId: item.id,             // ← из map
                active: item.active          // ← из condition
              }} />
          `}
        `)}
      </meta-for>
    `}
  `
})
```

---

### 1.4. Формат AST (@zavx0z/template)

#### NodeLogical
```typescript
{
  type: "log",
  data: "/value/operation",
  child: [NodeMeta, ...]
}
```

#### NodeCondition
```typescript
{
  type: "cond",
  data: "/context/flag",
  expr: "flag ? 'a' : 'b'",
  child: [[NodeMeta, ...], [NodeMeta, ...]]
}
```

#### NodeMap
```typescript
{
  type: "map",
  data: "/mass/items",
  child: [NodeMeta, ...]
}
```

#### NodeMeta
```typescript
{
  type: "meta",
  tag: "meta-for",
  string: {
    src: { data: "/value/operation", expr: "zavx0z/git-${_[0]}" }
  },
  fields: {
    data: ["/value/operation", "/value/args"],
    expr: "{ operation: _[0], args: _[1] }"
  }
}
```

---

### 1.5. Формат Gravity (FlatStructure)

```typescript
interface FlatStructure {
  conditions: string[]              // Пути условий
  iterations: string[]              // Пути итераций
  manifests: ManifestPath[]         // Манифесты с путями
  entangled: EntangledStructure     // Явная запутанность
}

interface ManifestPath {
  src: {
    path: string | null
    template: string
  }
  fields: FieldPath[]
  context: {
    conditions: string[]
    iterations: string[]
  }
}

interface FieldPath {
  name: string
  path: string
}

interface EntangledStructure {
  groups: EntangledGroup[]
}

interface EntangledGroup {
  conditionPath?: string
  iterationPath?: string
  fieldPaths: string[]
  children?: EntangledGroup[]       // Вложенные группы
}
```

---

### 1.6. Пример FlatStructure

**DSL:**
```typescript
${value.operation && html`
  <meta-for src="zavx0z/git-${value.operation}"
    fields={{ operation: value.operation, args: value.args }}>
    ${mass.items.map((item) => html`
      <meta-for src="zavx0z/child-${item.type}"
        fields={{ parentId: value.operation, itemId: item.id }} />
    `)}
  </meta-for>
`}
```

**FlatStructure:**
```typescript
{
  conditions: ["/value/operation"],
  iterations: ["/mass/items"],
  manifests: [
    {
      src: { path: "/value/operation", template: "zavx0z/git-${_[0]}" },
      fields: [
        { name: "operation", path: "/value/operation" },
        { name: "args", path: "/value/args" }
      ],
      context: { conditions: ["/value/operation"], iterations: [] }
    },
    {
      src: { path: "/mass/items", template: "zavx0z/child-${_[1]}" },
      fields: [
        { name: "parentId", path: "/value/operation" },
        { name: "itemId", path: "[item]/id" }
      ],
      context: { conditions: ["/value/operation"], iterations: ["/mass/items"] }
    }
  ],
  entangled: {
    groups: [
      {
        conditionPath: "/value/operation",
        fieldPaths: ["/value/operation", "/value/args"],
        children: [
          {
            iterationPath: "/mass/items",
            fieldPaths: ["/value/operation", "[item]/id"]
          }
        ]
      }
    ]
  }
}
```

---

## Часть 2: План реализации

### 2.1. Этап 1: Gravity — traverseHierarchy

**Файлы:**
- `force/gravity/func/traverse.t.ts`
- `force/gravity/func/traverse.ts`
- `force/gravity/func/traverse.spec.ts`

**Типы (traverse.t.ts):**
```typescript
export interface FieldPath {
  name: string
  path: string
}

export interface ManifestPath {
  src: { path: string | null; template: string }
  fields: FieldPath[]
  context: { conditions: string[]; iterations: string[] }
}

export interface EntangledGroup {
  conditionPath?: string
  iterationPath?: string
  fieldPaths: string[]
  children?: EntangledGroup[]
}

export interface EntangledStructure {
  groups: EntangledGroup[]
}

export interface FlatStructure {
  conditions: string[]
  iterations: string[]
  manifests: ManifestPath[]
  entangled: EntangledStructure
}

export interface TraverseContext {
  conditions: string[]
  iterations: string[]
}
```

**Функции (traverse.ts):**
```typescript
export function traverseHierarchy(nodes: NodeType[]): FlatStructure

function traverseNode(node: NodeType, context: TraverseContext): TraverseResult

function traverseLogical(node: NodeLogical, context: TraverseContext): TraverseResult

function traverseCondition(node: NodeCondition, context: TraverseContext): TraverseResult

function traverseMap(node: NodeMap, context: TraverseContext): TraverseResult

function traverseMeta(node: NodeMeta, context: TraverseContext): TraverseResult

function extractFieldPaths(fields: Record<string, any>): FieldPath[]
```

**Тесты (traverse.spec.ts):**
```typescript
describe("traverseHierarchy", () => {
  it("извлекает структуру из log → meta", () => {...})
  it("извлекает структуру из map → meta", () => {...})
  it("извлекает вложенную структуру: log → map → meta", () => {...})
  it("извлекает запутанность с глубиной", () => {...})
})
```

---

### 2.2. Этап 2: Space — evaluateConditions/Fields

**Файл:** `space/client.ts`

**Функции:**
```typescript
interface EvaluateContext {
  value: Record<string, unknown>
  mass: Record<string, unknown>
  mapStack?: MapContext[]
}

interface MapContext {
  item: unknown
  index: number
}

function evaluateConditions(structure: FlatStructure, context: EvaluateContext): ManifestPath[]

function evaluateFields(fieldPaths: FieldPath[], context: EvaluateContext): Record<string, unknown>

function evaluateTemplate(template: string, values: unknown[]): string

function resolvePath(path: string, context: EvaluateContext): unknown
```

**Код (client.ts):**
```typescript
const schema = await loadDSL("zavx0z/git")
const structure = traverseHierarchy(schema.bulk.gravity)

const context = { value: { operation: "start" }, mass: {} }
const manifests = evaluateConditions(structure, context)
  .map(m => ({
    src: evaluateTemplate(m.src.template, [resolvePath(m.src.path, context)]),
    fields: evaluateFields(m.fields, context)
  }))

for (const { src, fields } of manifests) {
  const uuid = crypto.randomUUID()
  createActor(uuid, src, parentUuid, orderKey)
  createMonad({ uuid, fields })
}

await updateBoundary({ entangled: structure.entangled })
```

---

### 2.3. Этап 3: Monad — updateBoundary с entangled

**Файлы:**
- `monad/monad.t.ts`
- `monad/monad.ts`

**Изменения:**
```typescript
// monad.t.ts
export interface UpdateBoundaryParams {
  entangled?: EntangledStructure
}

// monad.ts
export async function updateBoundary(params?: UpdateBoundaryParams): Promise<BraneStateChange[]> {
  // ...
  await fieldsWrite({ fields, branes }, params?.entangled)
}
```

---

### 2.4. Этап 4: Boundary — fieldsWrite с entangled

**Файлы:**
- `@boundary/fields/index.t.ts`
- `@boundary/fields/index.ts`
- `@boundary/fields/prepare.ts`
- `@boundary/fields/entangled.ts`
- `@boundary/fields/entangled.t.ts`

**Изменения:**
```typescript
// index.t.ts
export interface FieldsWriteParams {
  fields: Record<string, unknown>[]
  branes: Brane[]
  entangled?: EntangledStructure
}

// index.ts
export async function write(data: Data, entangled?: EntangledStructure): Promise<void> {
  // Использует явную запутанность
}

// prepare.ts
export function prepareData(data: Data, entangled?: EntangledStructure): PreparedData {
  const values = data.branes.map(b => b.values)
  const braneMapping = buildBraneMapping(values, entangled)
  return { ...data, braneMapping }
}

// entangled.ts
export function buildBraneMapping(
  values: Value[][],
  entangled?: EntangledStructure
): BraneMapping {
  if (!entangled) {
    // Fallback: без запутанности (все поля local)
    return { localFields: [...], braneEntangledMap: [...], entangledFields: new Map() }
  }
  
  // Используем явную запутанность из DSL
  for (const group of entangled.groups) {
    // Создаём shared блоки
  }
}
```

**Удалить:**
- `findEntangledGroups(values)` — больше не используется

---

### 2.5. Этап 5: Интеграция и тесты

**Integration тест:**
```typescript
// integration.spec.ts
describe("полный поток запутанности", () => {
  it("DSL → Matrix с вложенной запутанностью", async () => {
    const schema = await loadDSL("zavx0z/git")
    const structure = traverseHierarchy(schema.bulk.gravity)

    const context = {
      value: { operation: "start", args: "test" },
      mass: { items: [{ id: 1, type: "child", active: true }] }
    }
    
    const manifests = evaluateConditions(structure, context)
      .map(m => ({
        src: evaluateTemplate(m.src.template, [resolvePath(m.src.path, context)]),
        fields: evaluateFields(m.fields, context)
      }))
    
    for (const { src, fields } of manifests) {
      createMonad({ uuid: crypto.randomUUID(), fields })
    }
    
    await updateBoundary({ entangled: structure.entangled })
    
    const heap = getHeap()
    expect(hasSharedBlocks(heap)).toBe(true)
  })
})
```

---

## 3. Чек-лист реализации

### Этап 1: Gravity

- [ ] `traverse.t.ts` — типы
- [ ] `traverse.ts` — `traverseHierarchy()`, `traverseLogical()`, `traverseCondition()`, `traverseMap()`, `traverseMeta()`
- [ ] `traverse.ts` — `extractFieldPaths()`
- [ ] `traverse.ts` — сбор `entangled.groups` с `children`
- [ ] `traverse.spec.ts` — тест на `log → meta`
- [ ] `traverse.spec.ts` — тест на `map → meta`
- [ ] `traverse.spec.ts` — тест на `log → map → meta`
- [ ] `traverse.spec.ts` — тест на `cond → meta`
- [ ] `traverse.spec.ts` — тест на `log → cond → map → meta`
- [ ] `traverse.spec.ts` — тест на `entangled.groups` с `children`

### Этап 2: Space

- [ ] `client.ts` — `evaluateConditions()`
- [ ] `client.ts` — `evaluateFields()`
- [ ] `client.ts` — `evaluateTemplate()`
- [ ] `client.ts` — `resolvePath()` с `mapStack`
- [ ] `client.ts` — интеграция с `traverseHierarchy()`
- [ ] `client.ts` — вызов `updateBoundary({ entangled })`

### Этап 3: Monad

- [ ] `monad.t.ts` — `UpdateBoundaryParams`
- [ ] `monad.ts` — `updateBoundary({ entangled })`
- [ ] `monad.ts` — передача `entangled` в `fieldsWrite()`

### Этап 4: Boundary

- [ ] `index.t.ts` — `FieldsWriteParams` с `entangled`
- [ ] `index.ts` — `write(data, entangled)`
- [ ] `prepare.ts` — `prepareData(data, entangled)`
- [ ] `entangled.ts` — `buildBraneMapping(values, entangled)`
- [ ] `entangled.t.ts` — типы
- [ ] Удалить `findEntangledGroups()`
- [ ] `entangled.spec.ts` — тест на shared блоки
- [ ] `entangled.spec.ts` — тест на вложенную запутанность

### Этап 5: Интеграция

- [ ] `integration.spec.ts` — полный поток DSL → Matrix
- [ ] `integration.spec.ts` — тест на простую запутанность
- [ ] `integration.spec.ts` — тест на вложенную запутанность
- [ ] `integration.spec.ts` — тест на запутанность с condition

---

## 4. Оценка времени

| Этап | Задачи | Время |
|------|--------|-------|
| **1. Gravity** | Типы, логика, тесты (5 тестов) | 2 часа |
| **2. Space** | Вычисление значений, интеграция | 1 час |
| **3. Monad** | Модификация `updateBoundary` | 0.5 часа |
| **4. Boundary** | Модификация `fieldsWrite`, удаление | 1.5 часа |
| **5. Интеграция** | Integration тесты (4 теста) | 1 час |
| **Итого** | | **6 часов** |

---

## 5. Критерии готовности

- [ ] `traverseHierarchy()` извлекает `conditions`, `iterations`, `manifests`, `entangled`
- [ ] `entangled.groups` содержит `children` для вложенности
- [ ] `evaluateFields()` вычисляет значения для путей: `/value/*`, `[item]/*`, `../[item]/*`
- [ ] `updateBoundary()` принимает `entangled`
- [ ] `buildBraneMapping()` использует явную запутанность
- [ ] `findEntangledGroups()` удалён
- [ ] Integration тест на полный поток проходит
- [ ] Shared блоки создаются для вложенной запутанности
