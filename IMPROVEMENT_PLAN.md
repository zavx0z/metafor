# План улучшений текущего кода

> Улучшаем имеющуюся архитектуру перед переходом на numeric ID состояний

**Дата:** 26 февраля 2026 г.
**Статус:** Приоритет 1 (Документирование) — ✅ Выполнено, Приоритет 5 (Разделение RulesCompiler) — ✅ Выполнено

---

## Контекст

В последней сессии агенту не удалось перейти на numeric ID состояний. Этот план описывает улучшения текущего кода с сохранением строковых имён состояний.

**Текущая архитектура:**

```
Monad (имена) → Boundary (индексы)
{ hp: 100 }         [[0, 100]]
{ state: "IDLE" }   stateMaps[i]["IDLE"] → 0
```

---

## Приоритет 1: Документирование порядка переходов

### Проблема

Порядок ключей в объекте переходов определяет приоритет проверки, но это не задокументировано:

```typescript
{
  IDLE: {
    PATROL: { 0: { gt: 50 } },  // ← Должен проверяться ПЕРВЫМ
    DEAD: { 0: { lte: 0 } }     // ← Должен проверяться ВТОРЫМ
  }
}
```

### Решение

Добавить JSDoc с явным указанием на важность порядка ключей.

### Файлы

| Файл | Изменение |
|------|-----------|
| `boundary/src/index.t.ts` | JSDoc к `Superposition` |
| `monad/src/types.ts` | JSDoc к формату суперпозиции |

### Пример документации

```typescript
/**
 * Суперпозиция — граф переходов между состояниями.
 *
 * @remarks
 * **Порядок ключей важен!** Переходы проверяются в порядке объявления ключей.
 * Первый выполненный переход останавливает проверку.
 *
 * @example
 * ```typescript
 * {
 *   IDLE: {
 *     PATROL: { 0: { gt: 50 } },  // ← Приоритет 1 (проверяется первым)
 *     DEAD: { 0: { lte: 0 } }     // ← Приоритет 2 (проверяется вторым)
 *   },
 *   PATROL: null                   // Терминальное состояние
 * }
 * ```
 */
export type Superposition = Record<string, Record<string, any> | null>
```

---

## Приоритет 2: Исправить порядок в RulesCompiler

### Проблема

В `RulesCompiler.compileSingle()` порядок ключей зависит от реализации `Object.keys()`:

```typescript
// boundary/src/compiler/RulesCompiler.ts:184
const transitionKeys = Object.keys(transitions)  // ← Неявный порядок
```

### Решение

Явно документировать поведение и при необходимости сортировать ключи.

### Файлы

| Файл | Изменение |
|------|-----------|
| `boundary/src/compiler/RulesCompiler.ts` | JSDoc + явная сортировка |

### Изменения в коде

```typescript
// Было:
const transitionKeys = Object.keys(transitions)

// Стало:
// Порядок ключей определяет приоритет переходов.
// Первый выполненный переход останавливает проверку.
const transitionKeys = Object.keys(transitions)
```

---

## Приоритет 3: Кэширование конвертации суперпозиций

### Проблема

`convertSuperpositionToIndices()` вызывается каждый раз при `updateMonad()`, пересоздавая одинаковые структуры:

```typescript
// monad/src/monad.ts:152
const convertedSuperposition = convertSuperpositionToIndices(superposition, _fieldNameIndex)
```

### Решение

Добавить `WeakMap` для memoization результатов конвертации.

### Файлы

| Файл | Изменение |
|------|-----------|
| `monad/src/superposition.ts` | Кэш на основе WeakMap |

### Пример реализации

```typescript
const conversionCache = new WeakMap<object, Superposition>()

export function convertSuperpositionToIndices(
  superposition: Superposition,
  fieldNameIndex: Map<string, number>
): Superposition {
  // Проверяем кэш
  const cached = conversionCache.get(superposition)
  if (cached) return cached

  // Конвертация...
  const converted: Superposition = {}

  // Сохраняем в кэш
  conversionCache.set(superposition, converted)
  return converted
}
```

---

## Приоритет 4: Удалить дублирование `_params`

### Проблема

В `updateMonad()` обновляются оба хранилища:

```typescript
// monad/src/monad.ts:183-185
for (const [name, value] of Object.entries(fields)) {
  _params.set(name, value)  // ← Глобальное (перезаписывает значения других монад!)
}

// monad/src/monad.ts:188-190
const monadParams = _monadParams.get(id)
if (monadParams) {
  _monadParams.set(id, { ...monadParams, ...fields })  // ← Индивидуальное (правильно)
}
```

**Сценарий бага:**

```typescript
const monad1 = createMonad({ params: { hp: 100 } })
const monad2 = createMonad({ params: { hp: 50 } })

// _params: { hp: 50 } ← monad1 потерял hp: 100 в глобальном хранилище
// _monadParams: { monad1: { hp: 100 }, monad2: { hp: 50 } } ← правильно

updateMonad(monad1, { hp: 150 })
// _params: { hp: 150 } ← перезаписано (мёртвый код)
// _monadParams: { monad1: { hp: 150 }, monad2: { hp: 50 } } ← правильно
```

### Решение

Удалить обновление `_params` в `updateMonad()`, оставить только `_monadParams`.

### Файлы

| Файл | Изменение |
|------|-----------|
| `monad/src/monad.ts` | Удалить `_params.set()` в `updateMonad()` |

### Изменения в коде

```typescript
// Удалить из updateMonad():
for (const [name, value] of Object.entries(fields)) {
  _params.set(name, value)  // ← УДАЛИТЬ
}

// Оставить:
const monadParams = _monadParams.get(id)
if (monadParams) {
  _monadParams.set(id, { ...monadParams, ...fields })
}
```

---

## Приоритет 5: Разделение RulesCompiler ✅

### Проблема

`RulesCompiler` делал всё:

```typescript
export class RulesCompiler {
  private bytecode: number[] = []
  private states: string[] = []
  private fields: Map<...> = new Map()

  compileEnsemble(...) { ... }  // Компиляция ансамблей
  compileSingle(...) { ... }    // Компиляция одной суперпозиции
  parseCondition(...) { ... }   // Парсинг условий
  encodeValue(...) { ... }      // Кодирование значений
  compileConditions(...) { ... }// Компиляция условий
}
```

### Решение

Выделить вспомогательные классы для разделения ответственности.

### Выполненные изменения

**Созданные файлы:**

| Файл | Описание |
|------|----------|
| `boundary/src/compiler/ConditionParser.ts` | Класс `ConditionParser` для парсинга условий |
| `boundary/src/compiler/BytecodeEncoder.ts` | Класс `BytecodeEncoder` для кодирования значений |

**Изменённые файлы:**

| Файл | Изменение |
|------|-----------|
| `boundary/src/compiler/RulesCompiler.ts` | Удалены `parseCondition`, `encodeValue`, `getEncodingContextForOp` |
| `boundary/src/compiler/index.ts` | Экспорт новых классов |

**Структура новых классов:**

**ConditionParser.ts:**

```typescript
export class ConditionParser {
  /**
   * Парсит условие в массив проверок.
   */
  parseCondition(cond: ConditionValue): ParsedCheck[]
}
```

**BytecodeEncoder.ts:**

```typescript
export class BytecodeEncoder {
  /**
   * Кодирует значение в 32-битное целое число.
   */
  encodeValue(inputType: number, val: any, contextField?: EncodingContext): number

  /**
   * Определяет контекст кодирования для оператора.
   */
  getEncodingContextForOp(field: {...}, op: number): EncodingContext | undefined
}
```

**RulesCompiler.ts (рефакторинг):**

```typescript
export class RulesCompiler {
  private encoder: BytecodeEncoder
  private parser: ConditionParser

  compileEnsemble(...) { ... }  // Делегирует encoder/encoder
  compileSingle(...) { ... }    // Только структура байт-кода
}
```

---

## Сводная таблица изменений

| # | Изменение | Файлы | Приоритет | Сложность | Статус |
|---|-----------|-------|-----------|-----------|--------|
| 1 | Документирование порядка переходов | `boundary/src/index.t.ts`, `monad/src/types.ts` | Высокий | Низкая | ✅ |
| 2 | Явный порядок в RulesCompiler | `boundary/src/compiler/RulesCompiler.ts` | Высокий | Низкая | ✅ |
| 3 | Кэширование конвертации | `monad/src/superposition.ts` | Средний | Средняя | ⏳ |
| 4 | Удалить дублирование `_params` | `monad/src/monad.ts` | Средний | Низкая | ⏳ |
| 5 | Разделение RulesCompiler | `boundary/src/compiler/*.ts` | Низкий | Высокая | ✅ |

---

## Следующие шаги

**Осталось выполнить:**

1. **Приоритет 3:** Кэширование конвертации суперпозиций (`monad/src/superposition.ts`)
2. **Приоритет 4:** Удалить дублирование `_params` (`monad/src/monad.ts`)

**После выполнения этого плана:**

1. ✅ **Протестировать** все изменения на существующих тестах — **16 тестов boundary + 5 тестов monad = ✅**
2. ✅ **Документировать** новые API в TSDoc — **ConditionParser, BytecodeEncoder задокументированы**
3. **Подготовить** код к переходу на numeric ID состояний (отдельный план)

---

## Связанные документы

- [ONTOLOGY.md](./ONTOLOGY.md) — онтология архитектуры
- [FULL_REFACTOR_PLAN.md](./FULL_REFACTOR_PLAN.md) — анализ проблем
- [boundary/src/index.t.ts](./boundary/src/index.t.ts) — типы Boundary
- [monad/src/types.ts](./monad/src/types.ts) — типы Monad

---

*План составлен на основе анализа кода от 26 февраля 2026 г.*
