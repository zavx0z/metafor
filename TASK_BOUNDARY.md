# Задача: Boundary — переход на индексы без обратной совместимости

## Цель

Boundary работает **только с индексами** — данные обезличены.

---

## Задачи

### 1. Удалить FieldRegistry (класс)

**Файл:** `boundary/src/core/FieldRegistry.ts`

**Удалить:**
- Класс `FieldRegistry`
- Все методы: `getInstance()`, `register()`, `getField()`, `getId()`, `getAll()`, `has()`

**Оставить:**
```typescript
export const FieldType = { F32: 0, U32: 1, BOOL: 2, STRING_PTR: 3, ARRAY_PTR: 4, SHARED_PTR: 5 }
export type FieldTypeValue = typeof FieldType[keyof typeof FieldType]
export interface Field { fieldId: number; type: FieldTypeValue; name?: string; elementType?: string; enumValues?: any[] }
```

---

### 2. Типы кортежей

**Файл:** `boundary/src/index.t.ts`

**Добавить:**
```typescript
export type FieldTuple = [number, Field]
export type ValueTuple = [number, unknown]

export interface BoundaryConfig {
  fields: FieldTuple[]
  branes: BraneDefinition[]
}

export interface BraneDefinition {
  params: ValueTuple[]  // ← было Record<string, unknown>
  state: string
  superposition: Superposition
}
```

---

### 3. BraneManager — локальное хранилище

**Файл:** `boundary/src/core/BraneManager.ts`

**Изменить:**
```typescript
private fields: Map<number, Field> = new Map()

createEnsemble(params: ValueTuple[][], fields: FieldTuple[]): number[] {
  this.fields.clear()
  for (const [fieldId, field] of fields) {
    this.fields.set(fieldId, field)
  }
  // ...
}

updateBraneField(braneId: number, fieldId: number, newValue: unknown): void {
  const field = this.fields.get(fieldId)
  // ...
}
```

---

### 4. BraneBuilder — кортежи

**Файл:** `boundary/src/memory/BraneBuilder.ts`

**Изменить:**
```typescript
build(params: ValueTuple[], fields: Map<number, Field>): BuildResult {
  const sortedParams = [...params].sort((a, b) => a[0] - b[0])
  const fieldLayouts = sortedParams.map(([fieldId, value]) => {
    const field = fields.get(fieldId)
    return { field, value, fieldId }
  })
  // ...
}
```

---

### 5. RulesCompiler — индексы

**Файл:** `boundary/src/compiler/RulesCompiler.ts`

**Изменить:**
```typescript
compileEnsemble(superpositions: Superposition[], fields: FieldTuple[]) {
  this.fields = new Map(fields)
  // ...
}

private compileSingle(superposition: Superposition) {
  for (const [fieldIdx, condition] of Object.entries(conditions)) {
    const fieldId = Number(fieldIdx)  // ← строка → число
    // ...
  }
}
```

---

### 6. Boundary.write()

**Файл:** `boundary/src/index.ts`

**Изменить:**
```typescript
async write(config: BoundaryConfig) {
  this.braneIds = this.braneManager.createEnsemble(
    config.branes.map(b => b.params),
    config.fields
  )
  // ...
}
```

---

### 7. Тесты — новый формат

**Файлы:** `boundary/tests/**/*.test.ts`

**Конвертировать:**
```typescript
// Было:
fields: { hp: { type: FieldType.F32 } }
params: { hp: 100 }
superposition: { hp: { gt: 50 } }

// Стало:
fields: [[0, { type: FieldType.F32, name: "hp" }]]
params: [[0, 100]]
superposition: { 0: { gt: 50 } }
```

---

## Запуск

```bash
bun test boundary
```

**Ожидаемый результат:** 141 тест pass

---

## Важно

- ❌ **Нет обратной совместимости**
- ✅ Только кортежи `[[index, value]]`
- ✅ Только индексы в суперпозициях `{ 0: {...} }`
