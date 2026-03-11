/**
 * `@boundary/weak` вычисляет переход состояния поверх канонического store Boundary.
 *
 * Корневой вход этой силы остаётся оркестратором, а конкретные роли разложены
 * по подпакетам `runtime`, `program`, `encode`.
 */

export { GPU } from "./device"
export { weakInit, weakHeapUpdate, weakReadChanges, weakStep, weakRunStep, weak$ } from "./runtime"
export { CONDITION_OP, FIELD_TYPE, OP, TYPE, VALUE_TYPE } from "./constants"
export {
  createFieldEncodingContext,
  encodeValue,
  encodeFieldValue,
  fieldTypeToBytecodeType,
  floatToUint,
  uintToFloat,
} from "./encode"
export {
  compileSuperposition,
  compileFlattenedSuperposition,
  compileParsedConditions,
  compileConditions,
  compileEnsemble,
  compileFlattenedEnsemble,
} from "./program"
export type { BoundaryStore } from "../store"
export type { WeakMode, WeakStore } from "./runtime"
