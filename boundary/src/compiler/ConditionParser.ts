import { OP } from "../opcodes"

/**
 * Значение условия — примитив или сложный объект.
 */
export type ConditionValue = number | boolean | string | { [key: string]: any }

/**
 * Распарсенное условие: оператор и значение.
 */
export interface ParsedCheck {
  /** Оператор сравнения (OP.EQ, OP.GT, ...). */
  op: number
  /** Значение для сравнения. */
  val: any
}

/**
 * Парсер JSON-условий в формат байт-кода.
 *
 * Преобразует декларативные условия из superposition в последовательность
 * инструкций для VM на GPU.
 *
 * @example
 * ```typescript
 * const parser = new ConditionParser()
 *
 * // Простое условие
 * parser.parseCondition(50)
 * // → [{ op: OP.EQ, val: 50 }]
 *
 * // Сложное условие
 * parser.parseCondition({ gt: 50, lte: 100 })
 * // → [{ op: OP.GT, val: 50 }, { op: OP.LTE, val: 100 }]
 *
 * // Массив
 * parser.parseCondition({ in: [1, 2, 3] })
 * // → [{ op: OP.IN, val: [1, 2, 3] }]
 * ```
 */
export class ConditionParser {
  /**
   * Парсит условие в массив проверок.
   *
   * @param cond - Условие из superposition (примитив или объект).
   * @returns Массив проверок { op, val }.
   *
   * @example
   * ```typescript
   * parseCondition(50)                    // → [{ op: OP.EQ, val: 50 }]
   * parseCondition({ gt: 50 })            // → [{ op: OP.GT, val: 50 }]
   * parseCondition({ gt: 50, lte: 100 })  // → [{ op: OP.GT, val: 50 }, { op: OP.LTE, val: 100 }]
   * parseCondition({ in: [1, 2, 3] })     // → [{ op: OP.IN, val: [1, 2, 3] }]
   * ```
   */
  parseCondition(cond: ConditionValue): ParsedCheck[] {
    // Простое условие — прямое сравнение на равенство
    if (typeof cond !== "object" || cond === null) {
      return [{ op: OP.EQ, val: cond }]
    }

    const checks: ParsedCheck[] = []

    // Обработка сложного объекта { gt: 5, lte: 10 }
    for (const [k, v] of Object.entries(cond)) {
      switch (k) {
        case "eq":
          checks.push({ op: OP.EQ, val: v })
          break
        case "ne":
        case "notEq":
        case "neq":
          checks.push({ op: OP.NEQ, val: v })
          break
        case "gt":
          checks.push({ op: OP.GT, val: v })
          break
        case "lt":
          checks.push({ op: OP.LT, val: v })
          break
        case "gte":
          checks.push({ op: OP.GTE, val: v })
          break
        case "lte":
          checks.push({ op: OP.LTE, val: v })
          break
        case "in":
          checks.push({ op: OP.IN, val: v })
          break
        case "notIn":
          checks.push({ op: OP.NOT_IN, val: v })
          break

        // Array Operators
        case "include":
          checks.push({ op: OP.INCLUDE, val: v })
          break
        case "notInclude":
          checks.push({ op: OP.NOT_INCLUDE, val: v })
          break
        case "length":
          this.parseLengthCondition(v, checks)
          break
        case "isEmpty":
          checks.push({ op: OP.IS_EMPTY, val: v })
          break

        // Atom-like extended conditions (инвертированные)
        case "notGt":
          checks.push({ op: OP.LTE, val: v }) // ! >  == <=
          break
        case "notGte":
          checks.push({ op: OP.LT, val: v }) // ! >= == <
          break
        case "notLt":
          checks.push({ op: OP.GTE, val: v }) // ! <  == >=
          break
        case "notLte":
          checks.push({ op: OP.GT, val: v }) // ! <= == >
          break
        case "between":
          if (Array.isArray(v) && v.length === 2) {
            checks.push({ op: OP.GTE, val: v[0] })
            checks.push({ op: OP.LTE, val: v[1] })
          }
          break
      }
    }

    return checks
  }

  /**
   * Парсит условие на длину массива.
   *
   * @param v - Значение условия (число или объект с операторами).
   * @param checks - Массив для добавления результатов.
   */
  private parseLengthCondition(v: any, checks: ParsedCheck[]): void {
    if (typeof v === "number") {
      checks.push({ op: OP.LENGTH, val: v })
      return
    }

    if (typeof v === "object" && v !== null) {
      for (const [lengthOp, lengthVal] of Object.entries(v)) {
        switch (lengthOp) {
          case "eq":
            checks.push({ op: OP.LENGTH, val: lengthVal })
            break
          case "gt":
            checks.push({ op: OP.GT, val: lengthVal })
            break
          case "lt":
            checks.push({ op: OP.LT, val: lengthVal })
            break
          case "gte":
            checks.push({ op: OP.GTE, val: lengthVal })
            break
          case "lte":
            checks.push({ op: OP.LTE, val: lengthVal })
            break
        }
      }
    }
  }
}
