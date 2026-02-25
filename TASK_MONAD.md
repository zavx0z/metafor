# Задача: Monad — плоское хранилище с конвертацией в индексы

## Цель

Monad хранит поля глобально, конвертирует имена в индексы для Boundary.

---

## Задачи

### 1. Плоское хранилище

**Файл:** `monad/src/monad.ts`

**Добавить:**
```typescript
const _globalFields: Map<string, [number, RegisteredField]> = new Map()
const _fieldNameIndex: Map<string, number> = new Map()
const _params: Map<string, unknown> = new Map()
const _fieldUsageCount: Map<string, number> = new Map()
```

**Удалить:**
```typescript
const _fields: FieldsStore = new Map()  // ← старое хранилище
```

---

### 2. addMonadField()

**Добавить функцию:**
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

### 3. getGlobalFields()

**Добавить функцию:**
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

### 4. getParams()

**Добавить функцию:**
```typescript
export function getParams(): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [name, value] of _params.entries()) {
    result[name] = value
  }
  return result
}
```

---

### 5. createMonad()

**Изменить:**
```typescript
export function createMonad(config: MonadConfig): string {
  const id = crypto.randomUUID()

  for (const [name, def] of Object.entries(config.fields)) {
    const registeredField = convertField(def)
    addMonadField(name, registeredField)

    const count = _fieldUsageCount.get(name) ?? 0
    _fieldUsageCount.set(name, count + 1)

    if (config.params[name] !== undefined) {
      _params.set(name, config.params[name])
    }
  }

  return id
}
```

---

### 6. convertSuperpositionToIndices()

**Добавить функцию:**
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

### 7. updateBoundary()

**Изменить:**
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
    fields: fieldsSchema.map(([index, name, field]) => [index, { ...field, name }]),
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

### 8. updateMonad()

**Изменить:**
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

### 9. Удалить convertAllFields()

**Файл:** `monad/src/field.ts`

**Удалить:**
- `convertAllFields()` — не нужна

**Оставить:**
- `convertField()` — конвертация одного поля

---

### 10. Экспорты

**Файл:** `monad/src/index.ts`

**Добавить:**
```typescript
export {
  getGlobalFields,
  getParams,
} from "./monad"
```

---

## Запуск

```bash
bun test monad
```

**Ожидаемый результат:** 26 тестов pass

---

## Важно

- ✅ Входной формат с именами (API)
- ✅ Внутри конвертация в индексы для Boundary
- ✅ Плоское хранилище полей (одно на все монады)
