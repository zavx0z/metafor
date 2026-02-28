/**
 * Типы для модуля condition — парсинг JSON-условий в байт-код.
 *
 * @packageDocumentation
 */

import type { OP } from "./opcodes"

/**
 * Операторы сравнения для условий.
 * Соответствуют кодам операций в {@link OP}.
 */
export type ConditionOperator =
  | typeof OP.EQ
  | typeof OP.NEQ
  | typeof OP.GT
  | typeof OP.LT
  | typeof OP.GTE
  | typeof OP.LTE
  | typeof OP.IN
  | typeof OP.NOT_IN
  | typeof OP.INCLUDE
  | typeof OP.NOT_INCLUDE
  | typeof OP.LENGTH
  | typeof OP.IS_EMPTY

/**
 * Скалярное значение условия — примитивные типы для сравнения.
 * Используется в простых условиях и как значение для операторов.
 *
 * @example
 * ```typescript
 * 50                    // число
 * true                  // булево
 * "hero"                // строка
 * null                  // null
 * ```
 */
export type ScalarValue = number | boolean | string | null

/**
 * Объект условий с операторами сравнения.
 * Ключи — названия операторов, значения — скалярные значения или списки.
 *
 * @example
 * ```typescript
 * { gt: 50 }                    // больше 50
 * { lte: 100 }                  // меньше или равно 100
 * { in: [1, 2, 3] }             // входит в список
 * { isEmpty: true }             // пустой массив
 * { length: { gt: 5 } }         // длина больше 5
 * ```
 */
export interface ConditionOperators {
  /** Равно (`==`) */
  eq?: ScalarValue
  /** Не равно (`!=`) */
  ne?: ScalarValue
  /** Не равно (`!=`) — алиас */
  neq?: ScalarValue
  /** Не равно (`!=`) — алиас */
  notEq?: ScalarValue
  /** Больше (`>`) */
  gt?: ScalarValue
  /** Меньше (`<`) */
  lt?: ScalarValue
  /** Больше или равно (`>=`) */
  gte?: ScalarValue
  /** Меньше или равно (`<=`) */
  lte?: ScalarValue
  /** Входит в список */
  in?: ScalarValue[]
  /** Не входит в список */
  notIn?: ScalarValue[]
  /** Массив содержит элемент */
  include?: ScalarValue
  /** Массив не содержит элемент */
  notInclude?: ScalarValue
  /** Длина массива (число или объект с операторами) */
  length?: ScalarValue | ConditionOperators
  /** Массив пустой */
  isEmpty?: boolean
  /** Не больше (эквивалент `lte`) */
  notGt?: ScalarValue
  /** Не больше или равно (эквивалент `lt`) */
  notGte?: ScalarValue
  /** Не меньше (эквивалент `gte`) */
  notLt?: ScalarValue
  /** Не меньше или равно (эквивалент `gt`) */
  notLte?: ScalarValue
  /** В диапазоне `[min, max]` */
  between?: [ScalarValue, ScalarValue]
}

/**
 * Значение условия — скаляр или объект с операторами.
 *
 * @remarks
 * **Простое условие** — скалярное значение, интерпретируется как `EQ`:
 * ```typescript
 * parseCondition(50)      // → [{ op: OP.EQ, val: 50 }]
 * parseCondition("hero")  // → [{ op: OP.EQ, val: "hero" }]
 * ```
 *
 * **Сложное условие** — объект с операторами:
 * ```typescript
 * parseCondition({ gt: 50 })           // → [{ op: OP.GT, val: 50 }]
 * parseCondition({ in: [1, 2, 3] })    // → [{ op: OP.IN, val: [1, 2, 3] }]
 * ```
 *
 * @see {@link parseCondition} — функция парсинга условий
 */
export type ConditionValue = ScalarValue | ConditionOperators

/**
 * Распарсенное условие — готовая инструкция для байт-кода.
 *
 * @remarks
 * Результат парсинга {@link ConditionValue} в формат для GPU.
 * Используется при компиляции суперпозиций в {@link superposition}.
 *
 * @example
 * ```typescript
 * { op: OP.GT, val: 50 }        // hp > 50
 * { op: OP.IN, val: [1, 2, 3] } // value in [1, 2, 3]
 * ```
 */
export interface ParsedCheck {
  /** Код операции сравнения из {@link OP}. */
  op: ConditionOperator
  /**
   * Значение для сравнения.
   * Тип зависит от оператора:
   * - Скаляр для `EQ`, `GT`, `LT`, ...
   * - Массив для `IN`, `NOT_IN`
   */
  val: ScalarValue | ScalarValue[]
}
