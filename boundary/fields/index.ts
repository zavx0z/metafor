/**
 * @boundary/fields — flatten-preparation, deduplication and derived packers helpers.
 *
 * @packageDocumentation
 */

import { validateData } from "./validate"
import { buildHeap, findFieldOffset, packMeta, unpackMeta } from "./heap"
import type { HeapInput } from "./heap.t"
import {
  compileEnsemble,
  compileFlattenedEnsemble,
  compileFlattenedSuperposition,
  compileParsedConditions,
  compileSuperposition,
} from "./superposition"
import type { CompiledRules } from "./superposition.t"
import {
  createFieldEncodingContext,
  encodeFieldValue,
  encodeValue,
  fieldTypeToBytecodeType,
  floatToUint,
  normalizeFieldValue,
  uintToFloat,
} from "./values"
import type { EncodingContext } from "./values.t"
import { materializeEntanglement } from "./entangled"
import { parseCondition } from "./condition"
import { OP, TYPE } from "./opcodes"
import { createStoredStringInterner, createStringAtlasExport, StoredStringInterner, type StoredStringTable } from "./string-table"
import { assembleStoredBoundaryData } from "./stored"

export {
  validateData,
  buildHeap,
  findFieldOffset,
  packMeta,
  unpackMeta,
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
  createStringAtlasExport,
  StoredStringInterner,
  assembleStoredBoundaryData,
  OP,
  TYPE,
}

export type {
  CompiledRules,
  EncodingContext,
  HeapInput,
  StoredStringTable,
}

export type { Field, Data, Brane, Collapse, BraneValue, FieldTypeValue } from "./index.t"
export type { FlattenedBoundaryInput, FlattenedBraneInput, FlattenedFieldChecks, FlattenedTransition } from "./stored.t"
export { FieldType } from "./index.t"
