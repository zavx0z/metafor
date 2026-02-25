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

## Приоритет 3: Кэширование конвертации суперпозиций ❌

**Статус:** Неактуально.

**Причина:** Не влияет на переход на numeric ID состояний. Кэширование может быть добавлено позже при необходимости оптимизации.

---

## Приоритет 4: Удалить дублирование `_params` ❌

**Статус:** Неактуально.

**Причина:** Глобальное хранилище `_params` — преднамеренное решение для Gravity Agent (Bulk), который управляет общими полями. Изоляция будет на уровне System.

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
| 3 | Кэширование конвертации | `monad/src/superposition.ts` | Средний | Средняя | ❌ Неактуально |
| 4 | Удалить дублирование `_params` | `monad/src/monad.ts` | Средний | Низкая | ❌ Неактуально |
| 5 | Разделение RulesCompiler | `boundary/src/compiler/*.ts` | Низкий | Высокая | ✅ |

---

## Следующие шаги

**План завершён.** Следующий этап — переход на numeric ID состояний.

**См.:** `NUMERIC_SUPERPOSITION_PLAN.md` — план перехода на числовые идентификаторы состояний.

---

## Связанные документы

- [ONTOLOGY.md](./ONTOLOGY.md) — онтология архитектуры
- [FULL_REFACTOR_PLAN.md](./FULL_REFACTOR_PLAN.md) — анализ проблем
- [boundary/src/index.t.ts](./boundary/src/index.t.ts) — типы Boundary
- [monad/src/types.ts](./monad/src/types.ts) — типы Monad

---

*План составлен на основе анализа кода от 26 февраля 2026 г.*
