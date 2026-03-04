/**
 * Типы для API fields.
 *
 * @packageDocumentation
 *
 * @remarks
 * Все типы переопределены в `@boundary/matrix/types` и ре-экспортируются отсюда.
 */

// Ре-экспорт типов из @boundary/matrix
export {
  FieldType,
  type FieldTypeValue,
  type BraneValue,
  type Field,
  type Collapse,
  type Brane,
  type Data,
} from "@boundary/matrix"

// Алиас для обратной совместимости
/**
 * @deprecated Используйте `BraneValue` из `@boundary/matrix`
 */
export type BraneParamValue = BraneValue
