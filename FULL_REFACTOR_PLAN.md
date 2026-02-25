## 🔴 Критические проблемы (обновлено)

### 1. **Плоское хранилище `_params` — потеря данных** ⚠️

**Проблема:**
```typescript
// monad/src/monad.ts
const _params: Map<string, unknown> = new Map()  // ← ОБЩЕЕ на все монады!
const _monadParams: Map<MonadId, Record<string, unknown>> = new Map()  // ← Дублирование!

// При updateMonad():
for (const [name, value] of Object.entries(fields)) {
  _params.set(name, value)  // ← Глобальное хранилище
}

// При updateBoundary():
const monadParams = _monadParams.get(monadId)!  // ← Индивидуальное хранилище
```

**Что не так:**
- **Два хранилища params** — `_params` и `_monadParams`
- **_params перезаписывает значения** разных монад
- **_monadParams используется, но _params тоже обновляется** — мёртвый код

**Сценарий:**
```typescript
const monad1 = createMonad({ params: { hp: 100 } })
const monad2 = createMonad({ params: { hp: 50 } })

// _params: { hp: 50 } ← monad1 потерял hp: 100 в глобальном хранилище
// _monadParams: { monad1: { hp: 100 }, monad2: { hp: 50 } } ← правильно

updateMonad(monad1, { hp: 150 })
// _params: { hp: 150 } ← перезаписано
// _monadParams: { monad1: { hp: 150 }, monad2: { hp: 50 } } ← правильно
```

**Вывод:** `_params` — **лишнее**, используется только в `updateMonad()` для обновления `_monadParams`.

---

### 2. **Глобальное состояние — фича, не баг** ✅

**Пользователь пояснил:**
> Это минимальный конечный автомат. Управление над ним возьмёт инстанс созданный на нем же и имена будут отслеживаться системой для того чтоб не было пересечений

**Архитектура:**
```
Monad (глобальный автомат)
  ↓
System (инстанс)
  ├─ MonadSystem #1 (игра)
  └─ MonadSystem #2 (редактор)
```

**Вывод:** Глобальное состояние — **преднамеренное решение**. Изоляция будет на уровне System.

---

### 3. **Конвертация суперпозиций — потеря порядка переходов** ⚠️

**Проблема:**
```typescript
// superposition.ts
for (const [toState, conditions] of Object.entries(transitions)) {
  // ❌ Порядок переходов НЕ гарантирован!
}
```

**Сценарий бага:**
```typescript
{
  IDLE: {
    PATROL: { 0: { gt: 50 } },  // ← Должен проверяться ПЕРВЫМ (приоритет)
    DEAD: { 0: { lte: 0 } }     // ← Должен проверяться ВТОРЫМ
  }
}

// Object.entries() может вернуть [DEAD, PATROL]
// Приоритет переходов нарушен!
```

**Решение:**
```typescript
// Массив переходов с явным порядком
type Superposition = Record<
  string,
  Array<{ toState: string; conditions: Record<number, Condition> }> | null
>

// Пример:
{
  IDLE: [
    { toState: "PATROL", conditions: { 0: { gt: 50 } } },
    { toState: "DEAD", conditions: { 0: { lte: 0 } } }
  ]
}
```

---

## 🟡 Архитектурные проблемы (обновлено)

### 4. **Boundary знает имена состояний — нарушение онтологии** ⚠️

**В ONTOLOGY.md:**
> Boundary не знает о *смысле* состояний. Он лишь вычисляет переходы по законам.

**В коде:**
```typescript
// boundary/src/index.ts
const states = new Uint32Array(config.branes.map((f, i) => 
  this.stateMaps[i]![f.state] ?? 0  // ← Boundary МАППИТ имена!
))
```

**Проблема:** Boundary создаёт маппинг имён состояний (`"IDLE" → 0`), что является ответственностью Monad.

**Решение:**
```typescript
// Monad передаёт числовые ID
await boundary.write({
  fields: [...],
  branes: [{
    initialStateIndex: 0,  // ← Число
    params: [...],
    superposition: {...}
  }]
})
```

---

### 5. **`convertSuperpositionToIndices` — нет валидации** ⚠️

**Проблема:**
```typescript
// superposition.ts
const fieldIndex = fieldNameIndex.get(fieldName)
if (fieldIndex === undefined) {
  throw new Error(`Field '${fieldName}' not found`)
}
```

**Что не так:**
- Ошибка только **при runtime** (во время конвертации)
- Нет валидации на этапе `createMonad()`

**Решение:**
```typescript
// Валидация при createMonad()
function validateSuperposition(
  superposition: Superposition,
  fieldNames: Set<string>
): void {
  for (const transitions of Object.values(superposition)) {
    if (!transitions) continue
    for (const conditions of Object.values(transitions)) {
      if (!conditions) continue
      for (const fieldName of Object.keys(conditions)) {
        if (!fieldNames.has(fieldName)) {
          throw new Error(`Unknown field '${fieldName}' in superposition`)
        }
      }
    }
  }
}
```

---

### 6. **RulesCompiler — смешение ответственности** ⚠️

**Проблема:**
```typescript
export class RulesCompiler {
  private bytecode: number[] = []
  private states: string[] = []
  private fields: Map<...> = new Map()
  
  compileEnsemble(...) { ... }  // Компиляция
  compileSingle(...) { ... }    // Компиляция
  parseCondition(...) { ... }   // Парсинг
  encodeValue(...) { ... }      // Кодирование
}
```

**Что не так:**
- Класс делает **всё**: парсинг, кодирование, компиляцию, маппинг
- Невозможно переиспользовать части

**Решение:**
```typescript
class BytecodeEncoder { encodeValue(...) }
class ConditionParser { parseCondition(...) }
class StateMapper { createStateMap(...) }
class RulesCompiler {
  constructor(
    private encoder: BytecodeEncoder,
    private parser: ConditionParser,
    private mapper: StateMapper
  ) {}
}
```

---

## 🟢 Хорошие решения (подтверждено)

### ✅ **Разделение имён и индексов**
```typescript
Monad (имена)      →      Boundary (индексы)
{ hp: 100 }               [[0, 100]]
{ hp: { gt: 50 } }        { 0: { gt: 50 } }
```

### ✅ **FieldRegistry удалён**
Локальное хранилище в `BraneManager` вместо глобального singleton.

### ✅ **Кортежи `[index, value]`**
Явная передача индексов, нет неявных преобразований.

---

## 📋 Итоговый план исправлений

### Приоритет 1 (критично):
1. **Удалить `_params`** — использовать только `_monadParams`
2. **Исправить порядок переходов** — массив вместо объекта в суперпозициях
3. **Добавить валидацию суперпозиций** — проверка при `createMonad()`

### Приоритет 2 (архитектура):
4. **Числовые ID состояний** — Boundary не знает имён
5. **Разделить RulesCompiler** — парсер, энкодер, компилятор

### Приоритет 3 (оптимизация):
6. **Кэш конвертации** — memoization для `convertSuperpositionToIndices()`


## User

1. Плоское хранилище `_params` — потеря данных ⚠️
у нас параметры полей глобальны - если меняется в одной монаде, меняется у всех монад где используется это поле

2  Вывод: Глобальное состояние — преднамеренное решение. Изоляция будет на
    уровне System.

ты посмотри что мы делаем в @ONTOLOGY.md - мы переносим функционал из монолита atom
будет актор на монаде gravity и он будет рулить глобальными сторами и присваивать уникальные id 
так что все в порядке
3 тут да, действитеельно нужно доработать
4 - нужно сделать стор где будем хранить для каждой монады индекс и название состояния
5 - валидацию запланировать но на текущем этапе пока рано
6 - хорошее предложение
## 🔴 Критические проблемы (финальное исследование)

### 1. **Плоское хранилище `_params` — это фича, не баг** ✅

**Пользователь пояснил:**
> Параметры полей глобальны — если меняется в одной монаде, меняется у всех монад где используется это поле

**Архитектура:**
```
Gravity Agent (Bulk)
  ↓
Управляет глобальными сторами Monad
  ↓
Присваивает уникальные ID полям
  ↓
Глобальные params — общее состояние системы
```

**Вывод:** `_params` — **глобальное состояние системы**, а не баг. Gravity Agent будет управлять им.

---

### 2. **Глобальное состояние — преднамеренное решение** ✅

**Пользователь пояснил:**
> Мы переносим функционал из монолита atom. Будет актор на монаде Gravity и он будет рулить глобальными сторами.

**Архитектура:**
```
atom (монолит) → monad + boundary (разделение)
  ↓
Gravity Agent (Bulk) управляет:
  ├─ _globalFields
  ├─ _params
  └─ _fieldNameIndex
```

**Вывод:** Глобальное состояние — **преднамеренное решение** для Gravity Agent.

---

### 3. **Конвертация суперпозиций — потеря порядка переходов** ⚠️

**Проблема:**
```typescript
// superposition.ts
for (const [toState, conditions] of Object.entries(transitions)) {
  // ❌ Порядок переходов НЕ гарантирован!
}
```

**Сценарий бага:**
```typescript
{
  IDLE: {
    PATROL: { 0: { gt: 50 } },  // ← Приоритет 1
    DEAD: { 0: { lte: 0 } }     // ← Приоритет 2
  }
}

// Object.entries() может вернуть [DEAD, PATROL]
```

**Решение:**
```typescript
// Массив переходов с явным порядком
type Superposition = Record<
  string,
  Array<{ toState: string; conditions: Record<number, Condition> }> | null
>
```

---

### 4. **Boundary знает имена состояний — нарушение онтологии** ⚠️

**В ONTOLOGY.md:**
> Boundary не знает о *смысле* состояний. Он лишь вычисляет переходы по законам.

**В коде:**
```typescript
// boundary/src/index.ts
const states = new Uint32Array(config.branes.map((f, i) => 
  this.stateMaps[i]![f.state] ?? 0  // ← Boundary МАППИТ имена!
))
```

**Пользователь предложил:**
> Нужно сделать стор где будем хранить для каждой монады индекс и название состояния

**Решение:**
```typescript
// Monad хранит маппинг состояний
const _stateMaps: Map<MonadId, Map<string, number>> = new Map()

// Boundary получает числовые ID
await boundary.write({
  fields: [...],
  branes: [{
    initialStateIndex: 0,  // ← Число
    params: [...],
    superposition: {...}
  }]
})
```

---

### 5. **Валидация суперпозиций — пока рано** ⏸️

**Пользователь:**
> Валидацию запланировать но на текущем этапе пока рано

**Вывод:** Отложить до зрелости API.

---

### 6. **RulesCompiler — смешение ответственности** ⚠️

**Проблема:**
```typescript
export class RulesCompiler {
  // Делает всё: парсинг, кодирование, компиляцию, маппинг
}
```

**Решение:**
```typescript
class BytecodeEncoder { encodeValue(...) }
class ConditionParser { parseCondition(...) }
class StateMapper { createStateMap(...) }
class RulesCompiler { /* делегирует */ }
```

---

## 📋 Финальный план исправлений

### Приоритет 1 (критично):
1. **Исправить порядок переходов** — массив вместо объекта в суперпозициях
   - **Файл:** `monad/src/superposition.ts`
   - **Файл:** `boundary/src/compiler/RulesCompiler.ts`
   - **Файл:** `boundary/tests/**/*.test.ts`

### Приоритет 2 (архитектура):
2. **Стор состояний для каждой монады** — числовые ID вместо имён
   - **Файл:** `monad/src/monad.ts` — `_stateMaps: Map<MonadId, Map<string, number>>`
   - **Файл:** `boundary/src/index.ts` — `initialStateIndex: number`
   - **Файл:** `boundary/src/index.t.ts` — обновить `BraneDefinition`

### Приоритет 3 (оптимизация):
3. **Разделить RulesCompiler** — парсер, энкодер, компилятор
   - **Файл:** `boundary/src/compiler/RulesCompiler.ts` — рефакторинг
   - **Файл:** `boundary/src/compiler/BytecodeEncoder.ts` — новый
   - **Файл:** `boundary/src/compiler/ConditionParser.ts` — новый

---

## 🟢 Подтверждено как правильное

✅ **Глобальное хранилище `_params`** — фича для Gravity Agent  
✅ **Глобальное состояние** — преднамеренное решение  
✅ **Разделение имён и индексов** — Monad ↔ Boundary  
✅ **FieldRegistry удалён** — локальное хранилище  
✅ **Кортежи `[index, value]`** — явные индексы

### Приоритет 1: Числовые ID состояний (решает проблемы 3 и 4)

**Monad:**

```typescript
// monad/src/monad.ts
const _stateMaps: Map<MonadId, Map<string, number>> = new Map()

export function createMonad(config: MonadConfig): string {
  const id = crypto.randomUUID()
  
  // Строим мапу имя → индекс для состояний
  const stateMap = new Map<string, number>()
  let stateIndex = 0
  for (const stateName of Object.keys(config.superposition)) {
    stateMap.set(stateName, stateIndex++)
  }
  _stateMaps.set(id, stateMap)
  
  // Конвертируем суперпозицию в числовые ID
  const convertedSuperposition = convertSuperpositionToIndices(
    config.superposition,
    _fieldNameIndex,
    stateMap  // ← передаём мапу состояний
  )
  // ...
}
```

**Boundary:**

```typescript
// boundary/src/index.t.ts
export interface BraneDefinition {
  initialStateIndex: number  // ← Было: state: string
  params: ValueTuple[]
  superposition: NumericSuperposition
}

export type NumericSuperposition = {
  states: string[]  // ← Для отладки
  transitions: Record<number, Array<{
    to: number
    conditions: Record<number, Condition>
  }>>
}
```

**RulesCompiler:**

```typescript
// boundary/src/compiler/RulesCompiler.ts
compileEnsemble(superpositions: NumericSuperposition[], ...) {
  for (const superposition of superpositions) {
    // superposition.states — явный порядок состояний
    // superposition.transitions[from] — массив переходов в порядке приоритета
    for (const transition of superposition.transitions[fromState]) {
      // ← Порядок гарантирован!
    }
  }
}
```

---

## 📄 Файлы для изменения

| Файл | Изменение |
|------|-----------|
| `monad/src/monad.ts` | `_stateMaps`, конвертация в числовые ID |
| `monad/src/superposition.ts` | Новый формат `NumericSuperposition` |
| `boundary/src/index.t.ts` | `initialStateIndex`, `NumericSuperposition` |
| `boundary/src/index.ts` | Приём числовых ID |
| `boundary/src/compiler/RulesCompiler.ts` | Работа с массивами переходов |
| `boundary/tests/**/*.test.ts` | Обновить тесты на новый формат |

---

## Преимущества

| Проблема | Решение |
|----------|---------|
| **Порядок переходов** | Массив `transitions[from]` сохраняет порядок |
| **Boundary знает имена** | Boundary получает только числа (`from: 0`, `to: 1`) |
| **Отладка** | `states: ["IDLE", "PATROL"]` для человека |
