# 🌌 План реализации: Явная запутанность полей (Explicit Entangled Fields)

**Цель:** Реализовать поток явной запутанности от DSL до heap. Запутанность определяется в DSL явно, не вычисляется из значений.

---

## 📊 Поток явной запутанности

```
┌─────────────────────────────────────────────────────────┐
│ 1. DSL (github/zavx0z/git/meta.ts)                      │
│                                                         │
│  .fields((field) => ({                                  │
│    operation: field.enum(...).optional(),               │
│    args: field.string.optional()                        │
│  }))                                                    │
│  .bulk({                                                │
│    gravity: ({ value, html }) => html`                  │
│      ${value.operation && html`                         │
│        <meta-for src="zavx0z/git-${value.operation}"    │
│          fields={{                                      │
│            operation: value.operation,  ← ЯВНАЯ         │
│            args: value.args             ← ЗАПУТАННОСТЬ  │
│          }} />                                          │
│      `}                                                 │
│    `                                                    │
│  })                                                     │
│                                                         │
│  ╰─ Запутанность определена ЯВНО в DSL                  │
└─────────────────────────────────────────────────────────┘
         ↓ build (dsl/meta/metafor.ts)
┌─────────────────────────────────────────────────────────┐
│ 2. meta.json                                            │
│                                                         │
│  {                                                      │
│    "fields": {                                          │
│      "operation": { "type": "enum<...>" },              │
│      "args": { "type": "string" }                       │
│    },                                                   │
│    "bulk": {                                            │
│      "gravity": [                                       │
│        {                                                │
│          "type": "log",                                 │
│          "data": "/value/operation",                    │
│          "child": [{                                    │
│            "type": "meta",                              │
│            "src": "zavx0z/git-${_[0]}",                 │
│            "fields": {                                  │
│              "data": ["/value/operation", "/value/args"],
│              "expr": "{ operation: _[0], args: _[1] }"  │
│            }                                            │
│          }]                                             │
│        }                                                │
│      ]                                                  │
│    }                                                    │
│  }                                                      │
│                                                         │
│  ╰─ Запутанность сериализована: paths в fields.data     │
└─────────────────────────────────────────────────────────┘
         ↓ loadDSL() + parse() from @metafor/template
┌─────────────────────────────────────────────────────────┐
│ 3. AST (NodeType[])                                         │
│                                                         │
│  [                                                      │
│    {                                                    │
│      type: "log",                                       │
│      data: "/value/operation",                          │
│      child: [{                                          │
│        type: "meta",                                    │
│        tag: "meta-for",                                 │
│        string: {                                        │
│          src: {                                         │
│            data: "/value/operation",                    │
│            expr: "zavx0z/git-${_[0]}"                   │
│          }                                              │
│        },                                               │
│        fields: {                                        │
│          data: ["/value/operation", "/value/args"],  ←  │
│          expr: "{ operation: _[0], args: _[1] }"     ← ЗАПУТАННОСТЬ ЯВНАЯ
│        }                                                │
│      }]                                                 │
│    }                                                    │
│  ]                                                      │
│                                                         │
│  ╰─ Запутанность в структуре: fields.data = пути        │
└─────────────────────────────────────────────────────────┘
         ↓ traverseHierarchy() from force/gravity/func/
┌─────────────────────────────────────────────────────────┐
│ 4. Gravity (ОБХОД СТРУКТУРЫ, БЕЗ ЗНАЧЕНИЙ)              │
│                                                         │
│  traverseHierarchy(nodes):                              │
│    ↓                                                    │
│  traverseLogical() — извлекает путь условия             │
│    → { type: "log", path: "/value/operation" }          │
│    ↓                                                    │
│  traverseMap() — извлекает путь итерации                │
│    → { type: "map", path: "/core/items" }               │
│    ↓                                                    │
│  traverseMeta() — извлекает src + field paths           │
│    → {                                                  │
│        src: { path: "/value/operation",                 │
│               template: "zavx0z/git-${_[0]}" },         │
│        fields: [                                        │
│          { name: "operation", path: "/value/operation" },
│          { name: "args", path: "/value/args" }          │
│        ]                                                │
│      }                                                  │
│    ↓                                                    │
│  FlatStructure {                                        │
│    conditions: ["/value/operation"],                    │
│    iterations: ["/core/items"],                         │
│    manifests: [{ src, fields: [...] }]                  │
│  }                                                      │
│                                                         │
│  ╰─ Gravity извлекла СТРУКТУРУ (пути), не значения      │
└─────────────────────────────────────────────────────────┘
         ↓ Space координирует
┌─────────────────────────────────────────────────────────┐
│ 5. Space (координация: значения + структура)            │
│                                                         │
│  async function syncActors() {                          │
│    // 1. Получаем структуру из Gravity                  │
│    const structure = traverseHierarchy(schema.gravity)  │
│                                                         │
│    // 2. Вычисляем значения для условий                 │
│    const activeManifest = evaluateConditions(           │
│      structure,                                         │
│      { value, core }                                    │
│    )                                                    │
│    // activeManifest = [{ src, fields: [...] }]         │
│                                                         │
│    // 3. Вычисляем значения для fields                  │
│    const manifests = activeManifest.map(m => ({         │
│      src: evaluateTemplate(m.src, { value, core }),     │
│      fields: evaluateFields(m.fields, { value, core })  │
│    }))                                                  │
│    // manifests = [{                                    │
│    //   src: "zavx0z/git-start",                        │
│    //   fields: { operation: "start", args: "" }        │
│    // }]                                                │
│                                                         │
│    // 4. Создаём акторы + монады                        │
│    for (const { src, fields } of manifests) {           │
│      const uuid = crypto.randomUUID()                   │
│      createActor(uuid, src, parentUuid, orderKey)       │
│      createMonad({ uuid, fields })                      │
│    }                                                    │
│                                                         │
│    // 5. Передаём ЯВНУЮ запутанность в Boundary         │
│    await updateBoundary({                               │
│      manifests,                                         │
│      entangled: structure.entangled  ← ЯВНАЯ            │
│    })                                                   │
│  }                                                      │
└─────────────────────────────────────────────────────────┘
         ↓ updateBoundary() from monad/monad.ts
┌─────────────────────────────────────────────────────────┐
│ 6. Monad (подготовка для Boundary)                      │
│                                                         │
│  updateBoundary({ manifests, entangled })               │
│    ↓                                                    │
│  allBranes = manifests.map(m => ({                      │
│    values: objectToTuples(m.fields),                    │
│    state: 0,                                            │
│    collapses: []                                        │
│  }))                                                    │
│    ↓                                                    │
│  fieldsWrite({                                          │
│    fields: manifests.map(m => m.fields),                │
│    branes: allBranes,                                   │
│    entangled: entangled  ← ЯВНАЯ ЗАПУТАННОСТЬ           │
│  })                                                     │
│                                                         │
│  ╰─ Boundary получает явную запутанность из DSL         │
└─────────────────────────────────────────────────────────┘
         ↓ fieldsWrite() from @boundary/fields/
┌─────────────────────────────────────────────────────────┐
│ 7. Boundary (использует явную запутанность)             │
│                                                         │
│  fieldsWrite({ fields, branes, entangled })             │
│    ↓                                                    │
│  prepareData(data, entangled)                           │
│    ↓                                                    │
│  // НЕТ findEntangledGroups(values)!                    │
│  // Используем явную запутанность из DSL                │
│                                                         │
│  const braneMapping = buildBraneMapping(                │
│    values,                                              │
│    entangled  ← ЯВНАЯ                                   │
│  )                                                      │
│  // braneMapping = {                                    │
│  //   localFields: [[], []],                            │
│  //   braneEntangledMap: [[0], [0]],                    │
│  //   entangledFields: Map { "0,1" → [...] }            │
│  // }                                                   │
│    ↓                                                    │
│  buildHeap(braneMapping)                                │
│    ↓                                                    │
│  heap = Uint32Array с shared блоками                    │
│                                                         │
│  ╰─ Запутанность из DSL → shared блоки в heap           │
└─────────────────────────────────────────────────────────┘
         ↓ _initMatrix() from @boundary/matrix/
┌─────────────────────────────────────────────────────────┐
│ 8. Matrix (GPU память) — БЕЗ ИЗМЕНЕНИЙ                  │
│                                                         │
│  _initMatrix({ heap, bytecode, states, ... })           │
│    ↓                                                    │
│  heap загружен в GPU buffer                             │
│    ↓                                                    │
│  Брана 0 и Брана 1 ссылаются на один shared блок        │
│                                                         │
│  ╰─ Физическая запутанность в GPU                       │
└─────────────────────────────────────────────────────────┘
```

---

## 🎯 Ключевые изменения

### 1. Gravity — ТОЛЬКО структура

**Было (неправильно):**
```typescript
// Gravity вычисляет значения
traverseHierarchy(nodes, { value: { operation: "start" } })
  → [{ src: "zavx0z/git-start", fields: { operation: "start" } }]
```

**Стало (правильно):**
```typescript
// Gravity извлекает пути
traverseHierarchy(nodes)
  → FlatStructure {
      conditions: ["/value/operation"],
      manifests: [{
        src: { path: "/value/operation", template: "..." },
        fields: [{ name: "operation", path: "/value/operation" }]
      }]
    }
```

### 2. Space — координирует значения + структуру

**Ответственность:**
- Вызывает `traverseHierarchy()` для структуры
- Вычисляет значения для условий (`value.operation`)
- Вычисляет значения для fields (`{ operation: "start" }`)
- Передаёт явную запутанность в Boundary

### 3. Boundary — использует явную запутанность

**Было (неправильно):**
```typescript
// Boundary вычисляет запутанность из значений
findEntangledGroups(values)  // ← УДАЛИТЬ
```

**Стало (правильно):**
```typescript
// Boundary получает явную запутанность из DSL
prepareData(data, entangled)  // ← entangled из Gravity
```

### 4. DSL — явное определение запутанности

**Пример:**
```typescript
.bulk({
  gravity: ({ value, html }) => html`
    ${value.operation && html`
      <meta-for src="zavx0z/git-${value.operation}"
        fields={{
          operation: value.operation,  // ← ЯВНАЯ ЗАПУТАННОСТЬ
          args: value.args
        }} />
    `}
  `
})
```

**Запутанность = поля, которые явно связаны в gravity template.**

---

## 📁 Файлы для реализации

### 1. DSL → JSON (уже работает)

| Файл | Статус |
|------|--------|
| `dsl/meta/metafor.ts` | ✅ `parse(bulk.gravity)` |
| `dsl/meta/metafor.t.ts` | ✅ типы |
| `github/zavx0z/git/meta.ts` | ✅ пример DSL |

### 2. JSON → AST (уже работает)

| Файл | Статус |
|------|--------|
| `template/index.ts` | ✅ `parse()` |
| `template/parser.ts` | ✅ `extractHtmlElements()` |
| `template/node/meta.t.ts` | ✅ `NodeMeta` с `fields` |

### 3. AST → FlatStructure (требуется)

| Файл | Статус | Задачи |
|------|--------|--------|
| `force/gravity/func/traverse.t.ts` | ⬜ | `FlatStructure`, `Manifest`, `FieldPath` |
| `force/gravity/func/traverse.ts` | ⬜ | `traverseHierarchy()` — извлечение путей |
| `force/gravity/func/traverse.spec.ts` | ⬜ | тесты на извлечение структуры |

**API:**
```typescript
export interface FieldPath {
  name: string
  path: string  // "/value/operation", "[item]/id", "../[item]/name"
}

export interface ManifestPath {
  src: {
    path: string | null  // путь для template
    template: string     // "zavx0z/git-${_[0]}"
  }
  fields: FieldPath[]
}

export interface FlatStructure {
  conditions: string[]  // пути условий
  iterations: string[]  // пути итераций
  manifests: ManifestPath[]
  entangled: EntangledStructure  // явная запутанность
}

export interface EntangledStructure {
  // Информация о запутанности из DSL
  // Например: какие fields связаны с какими условиями/итерациями
  groups: EntangledGroup[]
}

export interface EntangledGroup {
  conditionPath?: string
  iterationPath?: string
  fieldPaths: string[]
}

export function traverseHierarchy(
  nodes: NodeType[]
): FlatStructure
```

### 4. Space — вычисление значений (требуется)

| Файл | Статус | Задачи |
|------|--------|--------|
| `space/client.ts` | ⬜ | `evaluateConditions()`, `evaluateFields()` |

**API:**
```typescript
function evaluateConditions(
  structure: FlatStructure,
  context: { value: Record, core: Record }
): ManifestPath[]

function evaluateFields(
  fieldPaths: FieldPath[],
  context: { value: Record, core: Record }
): Record<string, unknown>
```

### 5. Monad — передача явной запутанности (модификация)

| Файл | Статус | Задачи |
|------|--------|--------|
| `monad/monad.ts` | ⬜ | `updateBoundary({ manifests, entangled })` |
| `monad/monad.t.ts` | ⬜ | типы для явной запутанности |

### 6. Boundary — использование явной запутанности (модификация)

| Файл | Статус | Задачи |
|------|--------|--------|
| `@boundary/fields/index.t.ts` | ⬜ | `FieldsWriteParams` с `entangled` |
| `@boundary/fields/prepare.ts` | ⬜ | `prepareData(data, entangled)` |
| `@boundary/fields/entangled.ts` | ⬜ | `buildBraneMapping(values, entangled)` |
| `@boundary/fields/entangled.t.ts` | ⬜ | типы для явной запутанности |

**Удалить:**
- ❌ `findEntangledGroups(values)` — больше не нужно

### 7. Heap → Matrix (без изменений)

| Файл | Статус |
|------|--------|
| `@boundary/fields/heap.ts` | ✅ `buildHeap()` |
| `@boundary/matrix/index.ts` | ✅ `_initMatrix()` |

---

## 📋 Этапы реализации

### Этап 1: Gravity — извлечение структуры

**Файлы:**
- `force/gravity/func/traverse.t.ts`
- `force/gravity/func/traverse.ts`
- `force/gravity/func/traverse.spec.ts`

**Задачи:**
- [ ] Определить типы: `FieldPath`, `ManifestPath`, `FlatStructure`, `EntangledStructure`
- [ ] `traverseLogical()` — извлечь путь условия
- [ ] `traverseCondition()` — извлечь пути веток
- [ ] `traverseMap()` — извлечь путь итерации
- [ ] `traverseMeta()` — извлечь `src.path` + `fields[]`
- [ ] Собрать `entangled` информацию (какие fields в каких условиях/итерациях)
- [ ] Тесты на извлечение структуры

**Пример вывода:**
```typescript
{
  conditions: ["/value/operation"],
  iterations: ["/core/items"],
  manifests: [{
    src: { path: "/value/operation", template: "zavx0z/git-${_[0]}" },
    fields: [
      { name: "operation", path: "/value/operation" },
      { name: "args", path: "/value/args" }
    ]
  }],
  entangled: {
    groups: [{
      conditionPath: "/value/operation",
      fieldPaths: ["/value/operation", "/value/args"]
    }]
  }
}
```

---

### Этап 2: Space — вычисление значений

**Файл:** `space/client.ts`

**Задачи:**
- [ ] `evaluateConditions(structure, { value, core })` — вычислить условия
- [ ] `evaluateFields(fieldPaths, { value, core })` — вычислить fields
- [ ] `evaluateTemplate(template, { value, core })` — вычислить src
- [ ] Интеграция с `traverseHierarchy()`

**Пример:**
```typescript
const structure = traverseHierarchy(schema.gravity)
const activeManifests = evaluateConditions(structure, { value, core })
const manifests = activeManifests.map(m => ({
  src: evaluateTemplate(m.src, { value, core }),
  fields: evaluateFields(m.fields, { value, core })
}))
```

---

### Этап 3: Monad — передача явной запутанности

**Файлы:**
- `monad/monad.t.ts`
- `monad/monad.ts`

**Задачи:**
- [ ] `UpdateBoundaryParams` с `entangled: EntangledStructure`
- [ ] `updateBoundary({ manifests, entangled })`
- [ ] Передача `entangled` в `fieldsWrite()`

---

### Этап 4: Boundary — использование явной запутанности

**Файлы:**
- `@boundary/fields/index.t.ts`
- `@boundary/fields/prepare.ts`
- `@boundary/fields/entangled.ts`
- `@boundary/fields/entangled.t.ts`

**Задачи:**
- [ ] `FieldsWriteParams` с `entangled`
- [ ] `prepareData(data, entangled)` — использовать явную запутанность
- [ ] `buildBraneMapping(values, entangled)` — использовать явную запутанность
- [ ] ❌ Удалить `findEntangledGroups(values)`
- [ ] Тесты на shared блоки с явной запутанностью

---

## 🧪 Тесты

### Unit — Gravity

```typescript
// traverse.spec.ts
test("извлекает структуру из log → meta", () => {
  const ast = parse(({ html, value }) => html`
    ${value.operation && html`
      <meta-for src="zavx0z/git-${value.operation}"
        fields={{ operation: value.operation }} />
    `}
  `)

  const structure = traverseHierarchy(ast)

  expect(structure).toEqual({
    conditions: ["/value/operation"],
    iterations: [],
    manifests: [{
      src: { path: "/value/operation", template: "zavx0z/git-${_[0]}" },
      fields: [{ name: "operation", path: "/value/operation" }]
    }],
    entangled: {
      groups: [{
        conditionPath: "/value/operation",
        fieldPaths: ["/value/operation"]
      }]
    }
  })
})

test("извлекает структуру из map → meta", () => {
  const ast = parse(({ html, core }) => html`
    ${core.items.map(item => html`
      <meta-for src="zavx0z/git-${item.type}"
        fields={{ id: item.id, type: item.type }} />
    `)}
  `)

  const structure = traverseHierarchy(ast)

  expect(structure).toEqual({
    conditions: [],
    iterations: ["/core/items"],
    manifests: [{
      src: { path: "/core/items", template: "zavx0z/git-${_[1]}" },
      fields: [
        { name: "id", path: "[item]/id" },
        { name: "type", path: "[item]/type" }
      ]
    }],
    entangled: {
      groups: [{
        iterationPath: "/core/items",
        fieldPaths: ["[item]/id", "[item]/type"]
      }]
    }
  })
})
```

### Integration — полный поток

```typescript
test("полный поток: DSL → Matrix с явной запутанностью", () => {
  // 1. DSL → JSON → AST
  const schema = await loadDSL("zavx0z/git")
  const ast = parse(schema.gravity)

  // 2. Gravity → структура
  const structure = traverseHierarchy(ast)
  expect(structure.entangled.groups.length).toBeGreaterThan(0)

  // 3. Space → значения
  const manifests = evaluateConditions(structure, { value: { operation: "start" } })
    .map(m => ({
      src: evaluateTemplate(m.src, { value: { operation: "start" } }),
      fields: evaluateFields(m.fields, { value: { operation: "start" } })
    }))

  // 4. Monad → Boundary
  await updateBoundary({ manifests, entangled: structure.entangled })

  // 5. Boundary → Heap
  // Проверить shared блоки в heap
})
```

---

## ✅ Критерии готовности

- [ ] `traverseHierarchy()` извлекает пути, не значения
- [ ] `FlatStructure` содержит `conditions`, `iterations`, `manifests`, `entangled`
- [ ] `entangled` информация собирается из структуры AST
- [ ] Space вычисляет значения для условий и fields
- [ ] `updateBoundary()` принимает `entangled`
- [ ] Boundary использует явную запутанность (нет `findEntangledGroups`)
- [ ] Shared блоки создаются в heap из явной запутанности
- [ ] Integration тест на полный поток: DSL → Matrix

---

## 🕒 Оценка

| Этап | Время |
|------|-------|
| **Этап 1: Gravity** | 2 часа |
| **Этап 2: Space** | 1 час |
| **Этап 3: Monad** | 0.5 часа |
| **Этап 4: Boundary** | 1.5 часа |
| **Тесты** | 1 час |
| **Итого** | **6 часов** |

---

## 🔗 Ссылки

- [tasks/entangled-planning.md](./tasks/entangled-planning.md) — исходная задача
- [template/index.ts](./template/index.ts) — парсер AST
- [github/zavx0z/git/meta.ts](./github/zavx0z/git/meta.ts) — пример DSL
