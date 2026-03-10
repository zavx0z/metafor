/**
 * @boundary/fields — чистые функции для GPU-эволюции суперпозиций.
 *
 * @packageDocumentation
 *
 * ## Архитектура
 *
 * Модуль содержит чистые функции для обработки данных:
 *
 * - **validateData()** — валидация входных данных
 * - **encodeValue()** — кодирование значений
 * - **buildHeap()** — построение heap layout
 * - **compileEnsemble()** — компиляция суперпозиций
 * - **materializeEntanglement()** — materialization prepared shared projection
 *
 * ## Принцип работы
 *
 * Каждая брана — это набор полей в heap с индивидуальным bytecode FSM.
 * Compute shader выполняет все переходы параллельно (1 поток на брану).
 *
 * @example
 * ```typescript
 * import { validateData, encodeValue, buildHeap } from "@boundary/fields"
 *
 * // Валидация
 * validateData(data)
 *
 * // Кодирование
 * const encoded = encodeValue(100, { type: TYPE.FLOAT })
 * ```
 */

import { fields$ } from "./store"
import { validateData } from "./validate"
import { buildHeap, findFieldOffset, packMeta, unpackMeta } from "./heap"
import type { HeapInput } from "./heap.t"
import { compileEnsemble, compileFlattenedEnsemble, compileFlattenedSuperposition, compileParsedConditions, compileSuperposition } from "./superposition"
import type { CompiledRules } from "./superposition.t"
import { createFieldEncodingContext, encodeFieldValue, encodeValue, fieldTypeToBytecodeType, floatToUint, uintToFloat } from "./values"
import type { EncodingContext } from "./values.t"
import { materializeEntanglement } from "./entangled"
import { parseCondition } from "./condition"
import { OP, TYPE } from "./opcodes"
import { createStoredStringInterner, createStringAtlasExport, StoredStringInterner } from "./string-table"
import { assembleStoredBoundaryData } from "./stored"

// ============================================================================
// ЭКСПОРТ
// ============================================================================

export {
  // Валидация
  validateData,
  // Heap
  buildHeap,
  findFieldOffset,
  packMeta,
  unpackMeta,
  // Superposition
  compileEnsemble,
  compileFlattenedEnsemble,
  compileFlattenedSuperposition,
  compileSuperposition,
  compileParsedConditions,
  // Params
  createFieldEncodingContext,
  encodeValue,
  encodeFieldValue,
  fieldTypeToBytecodeType,
  floatToUint,
  uintToFloat,
  // Entangled
  materializeEntanglement,
  // Condition
  parseCondition,
  // Strings
  createStoredStringInterner,
  createStringAtlasExport,
  StoredStringInterner,
  assembleStoredBoundaryData,
  // Opcodes
  OP,
  TYPE,
  // Internal
  fields$,
}

export type {
  CompiledRules,
  EncodingContext,
  HeapInput,
}

// Ре-экспорт типов
export type { Field, Data, Brane, Collapse, BraneValue, FieldTypeValue } from "./index.t"
export type {
  FlattenedBoundaryInput,
  FlattenedBraneInput,
  FlattenedFieldChecks,
  FlattenedTransition,
  StoredBoundaryData,
  StoredEntangledBlock,
  StoredFieldMeta,
  StoredStringTable,
} from "./stored.t"
export { FieldType } from "./index.t"
