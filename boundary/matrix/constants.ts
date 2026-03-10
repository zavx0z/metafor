/**
 * @boundary/matrix/constants — execution constants local to Matrix.
 *
 * Эти константы нужны только для derived packing и runtime execution.
 * Они не являются частью canonical Boundary store.
 *
 * @packageDocumentation
 */

/**
 * Идентификаторы типов полей, которые записаны в канонической схеме Boundary store.
 */
export const FIELD_TYPE = {
  F32: 0,
  U32: 1,
  BOOL: 2,
  STRING_PTR: 3,
  ARRAY_PTR: 4,
} as const

/**
 * Идентификаторы execution-типов, которые ожидают bytecode и derived heap Matrix.
 */
export const VALUE_TYPE = {
  FLOAT: 0,
  UINT: 1,
  BOOL: 2,
  STRING: 3,
  ARRAY: 4,
} as const

/**
 * Идентификаторы операций условий, которые использует Matrix execution.
 *
 * Значения должны совпадать с каноническими условиями, которые записывает Fields.
 */
export const CONDITION_OP = {
  EQ: 0,
  NEQ: 1,
  GT: 2,
  LT: 3,
  GTE: 4,
  LTE: 5,
  IN: 6,
  NOT_IN: 7,
  INCLUDE: 8,
  NOT_INCLUDE: 9,
  LENGTH: 10,
  IS_EMPTY: 11,
} as const
