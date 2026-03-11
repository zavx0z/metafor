/**
 * `@boundary/fields` подготавливает, нормализует и дедуплицирует данные перед записью в Boundary store.
 */

import {validateData} from "./validate"
import {
  compileEnsemble,
  compileFlattenedEnsemble,
  compileFlattenedSuperposition,
  compileParsedConditions,
  compileSuperposition,
} from "./superposition"
import type {CompiledRules} from "./superposition.t"
import {
  createFieldEncodingContext,
  encodeFieldValue,
  encodeValue,
  fieldTypeToBytecodeType,
  floatToUint,
  normalizeFieldValue,
  uintToFloat,
} from "./values"
import type {EncodingContext} from "./values.t"
import {materializeEntanglement} from "./entangled"
import {parseCondition} from "./condition"
import {createStoredStringInterner, StoredStringInterner, type StoredStringTable} from "./string-table"
import {assembleStoredBoundaryData} from "./stored"
import type {PreparedEntanglementProjection} from "./entangled.t"

export {
  validateData,
  compileEnsemble,
  compileFlattenedEnsemble,
  compileFlattenedSuperposition,
  compileSuperposition,
  compileParsedConditions,
  createFieldEncodingContext,
  normalizeFieldValue,
  encodeValue,
  encodeFieldValue,
  fieldTypeToBytecodeType,
  floatToUint,
  uintToFloat,
  materializeEntanglement,
  parseCondition,
  createStoredStringInterner,
  StoredStringInterner,
  assembleStoredBoundaryData,
}
export type {
  PreparedEntanglementProjection,
  CompiledRules,
  EncodingContext,
  StoredStringTable,
}

export type {Field, Data, Brane, Collapse, BraneValue, FieldTypeValue} from "./index.t"
export type {FlattenedBoundaryInput, FlattenedBraneInput, FlattenedFieldChecks, FlattenedTransition} from "./stored.t"
export {FieldType} from "./index.t"
