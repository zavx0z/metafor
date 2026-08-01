/**
 * Канонические типы условий после разбора публичного языка Matrix.
 *
 * Числовые коды являются общим протоколом CPU и WebGPU. Публичные имена
 * операторов разбираются до этого уровня и не попадают в исполнитель как
 * неизвестные строки.
 *
 * @see [Сквозной путь Graph → Boundary → Matrix](https://github.com/zavx0z/metafor/blob/main/matrix/conditions.integration.spec.ts)
 * @see [Равенство условий CPU и WebGPU](https://github.com/zavx0z/metafor/blob/main/matrix/weak/tests/weak.conditions.test.ts)
 *
 * @packageDocumentation
 */

/** Числовой код канонической проверки, общий для TypeScript и WGSL. */
export type MatrixConditionOperator =
  | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9
  | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19
  | 20 | 21 | 22 | 23 | 24 | 25 | 26 | 27 | 28 | 29

/** Скаляр в публичной записи условия до нормализации Field. */
export type MatrixConditionScalarValue = number | boolean | string | null

/** Переносимое описание регулярного выражения без объекта JavaScript. */
export interface MatrixRegExpValue {
  source: string
  flags: string
}

/** Вложенные проверки элемента для `every` и `some`. */
export interface MatrixQuantifierValue {
  checks: MatrixParsedCheck[]
}

export type MatrixConditionOperand =
  | MatrixConditionScalarValue
  | MatrixConditionScalarValue[]
  | MatrixRegExpValue
  | MatrixQuantifierValue

/**
 * Все имена, которые Matrix принимает на границе подготовки.
 *
 * Совместимость имени с типом Field проверяет разборщик; неизвестное или
 * несовместимое имя приводит к ошибке подготовки.
 */
export interface MatrixConditionOperators {
  null?: boolean
  eq?: MatrixConditionScalarValue
  ne?: MatrixConditionScalarValue
  neq?: MatrixConditionScalarValue
  notEq?: MatrixConditionScalarValue
  logicalEq?: boolean
  gt?: MatrixConditionScalarValue
  lt?: MatrixConditionScalarValue
  gte?: MatrixConditionScalarValue
  lte?: MatrixConditionScalarValue
  in?: MatrixConditionScalarValue[]
  notIn?: MatrixConditionScalarValue[]
  oneOf?: MatrixConditionScalarValue[]
  notOneOf?: MatrixConditionScalarValue[]
  include?: MatrixConditionScalarValue
  notInclude?: MatrixConditionScalarValue
  includes?: MatrixConditionScalarValue
  notIncludes?: MatrixConditionScalarValue
  startsWith?: string
  endsWith?: string
  notStartsWith?: string
  notEndsWith?: string
  pattern?: MatrixRegExpValue | RegExp
  length?: number | {
    min?: number
    max?: number
    eq?: number
    gt?: number
    gte?: number
    lt?: number
    lte?: number
  }
  isEmpty?: boolean
  every?: MatrixConditionOperators
  some?: MatrixConditionOperators
  notGt?: MatrixConditionScalarValue
  notGte?: MatrixConditionScalarValue
  notLt?: MatrixConditionScalarValue
  notLte?: MatrixConditionScalarValue
  between?: [MatrixConditionScalarValue, MatrixConditionScalarValue]
}

export type MatrixConditionValue =
  | MatrixConditionScalarValue
  | MatrixConditionScalarValue[]
  | MatrixRegExpValue
  | RegExp
  | MatrixConditionOperators

/** Одна проверка после разбора имён, но до нормализации операнда в Store. */
export interface MatrixParsedCheck {
  op: MatrixConditionOperator
  val: MatrixConditionOperand
}

/** Каноническая проверка в Matrix Store. */
export interface MatrixConditionRecord {
  fieldIndex: number
  op: MatrixConditionOperator
  value: MatrixConditionOperand
}

export interface MatrixConditionInstruction {
  fieldType: number
  fieldIndex: number
  op: number
  valEncoded: number
}

export interface MatrixCompiledConditionsResult {
  instructions: MatrixConditionInstruction[]
  heap: number[]
}
