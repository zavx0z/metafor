# План рефакторинга: Boundary без обратной совместимости

## Цель

Boundary работает **только с индексами** — данные обезличены, нет имён полей.

---

## Архитектура

```
MONAD (имена)                    BOUNDARY (индексы)
{ hp: 100, mana: 50 }    →       [[0, 100], [1, 50]]
{ hp: { gt: 50 } }       →       { 0: { gt: 50 } }
```

---

## Часть 1: Boundary

### 1.1. Удалить FieldRegistry (класс)

**Файл:** `boundary/src/core/FieldRegistry.ts`

**Удалить:**
- Класс `FieldRegistry` (singleton)
- Методы: `getInstance()`, `register()`, `getField()`, `getId()`, `getAll()`, `has()`

**Оставить:**
- `FieldType` enum
- `FieldTypeValue` тип
- `Field` интерфейс

---

### 1.2. Типы кортежей

**Файл:** `boundary/src/index.t.ts`

**Добавить:**
```typescript
// Кортеж поля: [индекс, метаданные]
export type FieldTuple = [number, Field]

// Кортеж значения: [индекс, значение]
export type ValueTuple = [number, unknown]

export interface BoundaryConfig {
  fields: FieldTuple[]
  branes: BraneDefinition[]
}

export interface BraneDefinition {
  params: ValueTuple[]  // ← было: Record<string, unknown>
  state: string
  superposition: Superposition  // ← использует индексы (числа)
}
```

---

### 1.3. BraneManager — локальное хранилище

**Файл:** `boundary/src/core/BraneManager.ts`

**Изменить:**
```typescript
export class BraneManager {
  private fields: Map<number, Field> = new Map()  // ← локальное хранилище

  createEnsemble(
    params: ValueTuple[][],
    fields: FieldTuple[]
  ): number[] {
    // Сохраняем метаданные локально
    this.fields.clear()
    for (const [fieldId, field] of fields) {
      this.fields.set(fieldId, field)
    }

    // Создаём браны
    const braneIds = params.map(paramTuples => {
      const braneId = this.nextBraneId++
      const block = this.builder.build(paramTuples, this.fields)
      // ...
      return braneId
    })

    return braneIds
  }

  updateBraneField(braneId: number, fieldId: number, newValue: unknown): void {
    const field = this.fields.get(fieldId)  // ← прямой доступ по индексу
    if (!field) {
      throw new Error(`Field with ID ${fieldId} not found`)
    }
    // ...
  }
}
```

---

### 1.4. BraneBuilder — кортежи

**Файл:** `boundary/src/memory/BraneBuilder.ts`

**Изменить:**
```typescript
build(
  params: ValueTuple[],      // [[0, 100], [1, 50]]
  fields: Map<number, Field>
): BuildResult {
  // Сортируем по индексу
  const sortedParams = [...params].sort((a, b) => a[0] - b[0])

  const fieldLayouts = sortedParams.map(([fieldId, value]) => {
    const field = fields.get(fieldId)
    if (!field) {
      throw new Error(`Field with ID ${fieldId} not found`)
    }
    return { field, value, fieldId }
  })

  // ... раскладка в памяти
}
```

---

### 1.5. RulesCompiler — индексы в суперпозициях

**Файл:** `boundary/src/compiler/RulesCompiler.ts`

**Изменить:**
```typescript
compileEnsemble(
  superpositions: Superposition[],
  fields: FieldTuple[]
): CompiledEnsemble {
  this.fields = new Map(fields)

  const compiled: CompiledFieldRules[] = []
  for (let i = 0; i < superpositions.length; i++) {
    compiled.push(this.compileSingle(superpositions[i]!))
  }
  // ...
}

private compileSingle(superposition: Superposition): CompiledFieldRules {
  for (const [fromState, transitions] of Object.entries(superposition)) {
    if (!transitions) continue

    for (const [toState, conditions] of Object.entries(transitions)) {
      if (!conditions) continue

      // conditions: { 0: { gt: 50 }, 1: { lt: 100 } }
      // Ключи — индексы полей (числа)
      for (const [fieldIdx, condition] of Object.entries(conditions)) {
        const fieldId = Number(fieldIdx)  // ← строка → число
        const field = this.fields.get(fieldId)
        // ... компиляция
      }
    }
  }
  // ...
}
```

---

### 1.6. Boundary.write()

**Файл:** `boundary/src/index.ts`

**Изменить:**
```typescript
async write(config: BoundaryConfig) {
  // Передаём кортежи напрямую
  this.braneIds = this.braneManager.createEnsemble(
    config.branes.map(b => b.params),
    config.fields
  )

  const compiled = this.compiler.compileEnsemble(
    config.branes.map(b => b.superposition),
    config.fields
  )
  // ...
}
```

---

### 1.7. Boundary тесты

**Файлы:** `boundary/tests/**/*.test.ts`

**Старый формат:**
```typescript
await boundary.write({
  fields: { hp: { type: FieldType.F32 } },
  branes: [{
    params: { hp: 100 },
    state: "IDLE",
    superposition: { IDLE: { PATROL: { hp: { gt: 50 } } }, PATROL: null }
  }]
})
```

**Новый формат:**
```typescript
await boundary.write({
  fields: [[0, { type: FieldType.F32, name: "hp" }]],
  branes: [{
    params: [[0, 100]],
    state: "IDLE",
    superposition: { IDLE: { PATROL: { 0: { gt: 50 } } }, PATROL: null }
  }]
})
```

---

## Часть 2: Monad

### 2.1. Плоское хранилище

**Файл:** `monad/src/monad.ts`

**Хранилища:**
```typescript
const _globalFields: Map<string, [number, RegisteredField]> = new Map()
const _fieldNameIndex: Map<string, number> = new Map()
const _params: Map<string, unknown> = new Map()
const _fieldUsageCount: Map<string, number> = new Map()
```

---

### 2.2. addMonadField()

```typescript
function addMonadField(name: string, field: RegisteredField): number {
  const existing = _globalFields.get(name)
  if (existing) {
    const [existingIndex, existingField] = existing
    if (existingField.type !== field.type) {
      throw new Error(`Field '${name}' type conflict`)
    }
    return existingIndex
  }

  const newIndex = _nextFieldIndex++
  _globalFields.set(name, [newIndex, field])
  _fieldNameIndex.set(name, newIndex)
  return newIndex
}
```

---

### 2.3. getGlobalFields()

```typescript
export function getGlobalFields(): [number, string, RegisteredField][] {
  const result: [number, string, RegisteredField][] = []

  for (const [name, [index, field]] of _globalFields.entries()) {
    result.push([index, name, field])
  }

  return result.sort((a, b) => a[0] - b[0])
}
```

---

### 2.4. updateBoundary() — конвертация

```typescript
export async function updateBoundary(): Promise<void> {
  const monadIds = Array.from(_uuidToIndex.keys())

  if (monadIds.length === 0) {
    _boundary.current?.clear()
    _boundary.current = null
    return
  }

  const fieldsSchema = getGlobalFields()

  // Конвертируем params в кортежи
  const paramsTuples: ValueTuple[] = fieldsSchema.map(([index, name, _]) => {
    return [index, _params.get(name)]
  })

  // Конвертируем суперпозиции: { hp: {...} } → { 0: {...} }
  const convertedSuperpositions = monadIds.map(monadId => {
    const superposition = _superpositions.get(monadId)!
    return convertSuperpositionToIndices(superposition, _fieldNameIndex)
  })

  const allBranes = monadIds.map((monadId, i) => ({
    params: paramsTuples,
    state: _states.get(monadId)!,
    superposition: convertedSuperpositions[i]!
  }))

  await _boundary.current.write({
    fields: fieldsSchema.map(([index, name, field]) => [index, { ...field, name }] as FieldTuple),
    branes: allBranes
  })

  // Маппинги
  _uuidToIndex.clear()
  _indexToUuid.clear()
  monadIds.forEach((monadId, i) => {
    _uuidToIndex.set(monadId, i)
    _indexToUuid.set(i, monadId)
  })
}
```

---

### 2.5. convertSuperpositionToIndices()

```typescript
function convertSuperpositionToIndices(
  superposition: Superposition,
  fieldNameIndex: Map<string, number>
): Superposition {
  const converted: Superposition = {}

  for (const [fromState, transitions] of Object.entries(superposition)) {
    if (!transitions) {
      converted[fromState] = null
      continue
    }

    const convertedTransitions: Record<string, any> = {}
    for (const [toState, conditions] of Object.entries(transitions)) {
      const convertedConditions: Record<string, any> = {}

      // { hp: { gt: 50 } } → { 0: { gt: 50 } }
      for (const [fieldName, condition] of Object.entries(conditions)) {
        const fieldIndex = fieldNameIndex.get(fieldName)
        if (fieldIndex === undefined) {
          throw new Error(`Field '${fieldName}' not found`)
        }
        convertedConditions[fieldIndex] = condition
      }

      convertedTransitions[toState] = convertedConditions
    }

    converted[fromState] = convertedTransitions
  }

  return converted
}
```

---

### 2.6. updateMonad()

```typescript
export async function updateMonad(
  id: MonadId,
  fields: Record<string, unknown>
): Promise<void> {
  const index = _uuidToIndex.get(id)
  if (index === undefined) {
    throw new Error(`Monad ${id} not found in boundary`)
  }

  // Обновляем локально (имена)
  for (const [name, value] of Object.entries(fields)) {
    _params.set(name, value)
  }

  if (!_boundary.current) {
    throw new Error("Boundary not initialized")
  }

  // Конвертируем в кортежи
  for (const [name, value] of Object.entries(fields)) {
    const fieldId = _fieldNameIndex.get(name)
    if (fieldId === undefined) {
      throw new Error(`Field '${name}' not found`)
    }
    _boundary.current.updateBraneField(index, fieldId, value)
  }

  _boundary.current.step()
  // ...
}
```

---

### 2.7. Удалить convertAllFields()

**Файл:** `monad/src/field.ts`

**Удалить:**
- `convertAllFields()` — не нужна

**Оставить:**
- `convertField()` — конвертация одного поля

---

### 2.8. Экспорты

**Файл:** `monad/src/index.ts`

**Добавить:**
```typescript
export {
  getGlobalFields,
  getParams,
} from "./monad"
```

---

## Файлы для изменения

### Boundary
| Файл | Задача |
|------|--------|
| `src/core/FieldRegistry.ts` | Удалить класс, оставить типы |
| `src/index.t.ts` | Добавить FieldTuple, ValueTuple |
| `src/core/BraneManager.ts` | Локальное Map<number, Field> |
| `src/memory/BraneBuilder.ts` | Работа с ValueTuple[] |
| `src/compiler/RulesCompiler.ts` | Индексы в суперпозициях |
| `src/index.ts` | write() с кортежами |
| `tests/**/*.test.ts` | Все тесты на новый формат |

### Monad
| Файл | Задача |
|------|--------|
| `src/monad.ts` | Плоское хранилище, конвертация |
| `src/field.ts` | Удалить convertAllFields() |
| `src/monad.t.ts` | Удалить старые типы |
| `src/index.ts` | Добавить getGlobalFields, getParams |
| `tests/monad.test.ts` | Тесты работают |

---

## Запуск тестов

```bash
bun test monad      # 26 тестов
bun test boundary   # 141 тестов
```

---

## Результат

- ✅ FieldRegistry удалён
- ✅ Boundary — только индексы (обезличенные данные)
- ✅ Monad — имена с конвертацией в индексы
- ✅ Нет обратной совместимости
- ✅ 167 тестов проходят
