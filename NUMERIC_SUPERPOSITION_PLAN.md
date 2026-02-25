# План: Числовые ID состояний для гарантии порядка переходов

## Проблема

**Текущий формат Superposition:**
```typescript
{
  IDLE: {
    PATROL: { 0: { gt: 50 } },  // переход 1
    DEAD: { 0: { lte: 0 } }     // переход 2
  },
  PATROL: null,
  DEAD: null
}
```

**Проблема:** `Object.entries()` не гарантирует порядок в старых JS движках. В GPU shader переходы могут проверяться в неправильном порядке.

---

## Решение: NumericSuperposition

**Новый формат:**
```typescript
{
  states: ["IDLE", "PATROL", "DEAD"],
  transitions: [
    [  // Из IDLE (индекс 0)
      { to: 1, conditions: { 0: { gt: 50 } } },   // PATROL — приоритет 1
      { to: 2, conditions: { 0: { lte: 0 } } }    // DEAD — приоритет 2
    ],
    [null],  // PATROL — терминальное
    [null]   // DEAD — терминальное
  ]
}
```

**Преимущества:**
- ✅ Порядок переходов гарантирован (массив, не объект)
- ✅ Boundary работает только с индексами (не знает имён состояний)
- ✅ Monad конвертирует имена → индексы

---

## Изменения по файлам

### 1. boundary/src/index.t.ts

**Добавить:**
```typescript
/**
 * Суперпозиция с числовыми ID состояний.
 * states — имена состояний для маппинга.
 * transitions — массив переходов в порядке приоритета.
 * transitions[fromStateIndex] = [{ to: toIndex, conditions }]
 */
export interface NumericSuperposition {
  states: string[]
  transitions: Array<Array<{
    to: number
    conditions: Record<number, any>
  } | null>>
}

/**
 * Superposition может быть в старом или новом формате.
 */
export type Superposition = 
  | Record<string, Record<string, any> | null>  // старый формат
  | NumericSuperposition  // новый формат
```

---

### 2. boundary/src/compiler/RulesCompiler.ts

**Изменить compileEnsemble:**
```typescript
compileEnsemble(
  superpositions: Superposition[],
  fields: FieldTuple[]
): CompiledEnsemble {
  const compiled: CompiledFieldRules[] = []
  
  for (const sup of superpositions) {
    // Проверяем формат
    if ("states" in sup && "transitions" in sup) {
      // Новый формат
      compiled.push(this.compileNumeric(sup as NumericSuperposition))
    } else {
      // Старый формат
      compiled.push(this.compileSingle(sup as Record<string, any>))
    }
  }
  
  // ... конкатенация bytecode
}
```

**Добавить compileNumeric:**
```typescript
private compileNumeric(superposition: NumericSuperposition): CompiledFieldRules {
  this.bytecode = []
  this.states = superposition.states

  // 1. Таблица состояний
  const stateTableOffset = this.bytecode.length
  for (let i = 0; i < this.states.length; i++) {
    this.bytecode.push(0)  // заглушка
  }

  // 2. Компилируем каждое состояние
  for (let i = 0; i < this.states.length; i++) {
    const stateBlockPtr = this.bytecode.length
    this.bytecode[stateTableOffset + i] = stateBlockPtr

    const transitions = superposition.transitions[i] || []
    const validTransitions = transitions.filter(t => t !== null)

    this.bytecode.push(validTransitions.length)

    // Заголовки переходов
    for (const tr of validTransitions) {
      this.bytecode.push(tr.to)
      this.bytecode.push(0)  // заглушка для condPtr
    }

    // Блоки условий
    for (let trIdx = 0; trIdx < validTransitions.length; trIdx++) {
      const tr = validTransitions[trIdx]!
      const trBase = stateBlockPtr + 1 + trIdx * 2
      const condBlockPtr = this.bytecode.length
      this.bytecode[trBase + 1] = condBlockPtr

      // Конвертируем conditions: Record<number, any> → Record<string, any>
      const conditionsObj: Record<string, any> = {}
      for (const [fieldIdx, cond] of Object.entries(tr.conditions)) {
        conditionsObj[fieldIdx] = cond
      }
      this.compileConditions(conditionsObj)
    }
  }

  return {
    bytecode: new Uint32Array(this.bytecode),
    stateMap: Object.fromEntries(this.states.map((s, i) => [s, i])),
    reverseStateMap: [...this.states]
  }
}
```

---

### 3. monad/src/superposition.ts

**Изменить convertSuperpositionToIndices:**
```typescript
export function convertSuperpositionToIndices(
  superposition: Superposition,
  fieldNameIndex: Map<string, number>,
  stateNameIndex: Map<string, number>
): NumericSuperposition {
  const stateNames = Object.keys(superposition)
  
  // Строим мапу имя → индекс для состояний
  const stateIndex = new Map<string, number>()
  stateNames.forEach((name, i) => stateIndex.set(name, i))

  // Компилируем переходы в порядке состояний
  const transitions: Array<Array<{
    to: number
    conditions: Record<number, any>
  } | null>> = []

  for (const fromState of stateNames) {
    const transObj = superposition[fromState]
    if (!transObj) {
      transitions.push([null])
      continue
    }

    const fromTransitions: Array<{ to: number; conditions: Record<number, any> } | null> = []

    for (const [toState, conditions] of Object.entries(transObj)) {
      const toIdx = stateIndex.get(toState)
      if (toIdx === undefined) continue

      if (!conditions) {
        fromTransitions.push({ to: toIdx, conditions: {} })
      } else {
        // Конвертируем имена полей → индексы
        const converted: Record<number, any> = {}
        for (const [fieldName, cond] of Object.entries(conditions)) {
          const fieldIdx = fieldNameIndex.get(fieldName)
          if (fieldIdx !== undefined) {
            converted[fieldIdx] = cond
          }
        }
        fromTransitions.push({ to: toIdx, conditions: converted })
      }
    }

    transitions.push(fromTransitions)
  }

  return {
    states: stateNames,
    transitions
  }
}
```

---

### 4. monad/src/monad.ts

**Изменить updateBoundary:**
```typescript
export async function updateBoundary(): Promise<void> {
  const monadIds = Array.from(_monadIds)
  if (monadIds.length === 0) {
    _boundary.current?.clear()
    _boundary.current = null
    return
  }

  // Собираем поля
  const fields: [number, string, Field][] = []
  for (const [name, [index, field]] of _globalFields.entries()) {
    fields.push([index, name, field])
  }
  fields.sort((a, b) => a[0] - b[0])

  // Конвертируем каждую монаду
  const allBranes = monadIds.map((monadId) => {
    const monadParams = _monadParams.get(monadId)!
    const paramsTuples: [number, unknown][] = fields.map(([index, name, _]) => {
      return [index, monadParams[name]]
    })

    const superposition = _superpositions.get(monadId)!
    const stateMap = _stateMaps.get(monadId)!
    
    // Конвертируем в NumericSuperposition
    const convertedSuperposition = convertSuperpositionToIndices(
      superposition,
      _fieldNameIndex,
      stateMap
    )

    const initialStateIndex = stateMap.get(_states.get(monadId)!) ?? 0

    return {
      params: paramsTuples,
      initialStateIndex,
      superposition: convertedSuperposition,  // ← NumericSuperposition
    }
  })

  // Создаём Boundary
  if (!_boundary.current) _boundary.current = new Boundary()
  else _boundary.current.clear()

  await _boundary.current.write({
    fields: fields.map(([index, name, field]) => [index, { ...field, name }]),
    branes: allBranes,
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

### 5. boundary/src/index.ts

**Изменить write:**
```typescript
async write(config: BoundaryConfig) {
  // ...
  
  const compiled = this.compiler.compileEnsemble(
    config.branes.map((b) => b.superposition),  // NumericSuperposition[]
    config.fields,
    { debug: debug("compiler") },
  )
  
  // ...
  
  // Initial states из branes
  const states = new Uint32Array(config.branes.map((b) => b.initialStateIndex ?? 0))
  
  // ...
}
```

**Изменить BraneDefinition:**
```typescript
export interface BraneDefinition {
  params: ValueTuple[]
  initialStateIndex: number  // ← было: state: string
  superposition: NumericSuperposition  // ← NumericSuperposition
}
```

---

### 6. boundary/tests/*.test.ts

**Оставить старый формат!** compileEnsemble автоматически конвертирует:
```typescript
// Тесты остаются без изменений
await boundary.write({
  fields: [[0, { type: FieldType.F32 }]],
  branes: [{
    state: "IDLE",  // ← старый формат
    params: [[0, 100]],
    superposition: {
      IDLE: { PATROL: { 0: { gt: 50 } } },
      PATROL: null
    }
  }]
})
```

---

## Итог

| Аспект | Было | Стало |
|--------|------|-------|
| **Формат Superposition** | Object (порядок не гарантирован) | Array (порядок гарантирован) |
| **Boundary** | Знает имена состояний | Только индексы |
| **Monad** | Передаёт имена | Конвертирует в индексы |
| **Тесты** | 135/135 pass | 135/135 pass (без изменений) |

---

## Проверка

```bash
bun test monad      # 26 тестов
bun test boundary   # 109 тестов
bun test            # 451 тест
```
