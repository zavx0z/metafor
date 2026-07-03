/**
 * `@matrix/weak` вычисляет переход состояния поверх канонического store Matrix.
 *
 * Корневой вход этой силы остаётся оркестратором, а конкретные роли разложены
 * по подпакетам `runtime`, `program`, `encode`.
 */

export {GPU} from "./device"
export {weakInit, weakHeapUpdate, weakReadChanges, weakStep, weakRunStep, weak$} from "./weak"
export {
  GPU_STATE_NONE,
  GPU_STATE_UNDEFINED,
  OP as CONDITION_OP,
  FIELD_TYPE,
  OP,
  STATE_NONE,
  STATE_UNDEFINED,
  StepMode,
  VALUE_TYPE as TYPE,
  VALUE_TYPE,
} from "./constants"
export type {StepMode as WeakStepMode} from "./constants"
export {CPUWeakRuntime} from "./cpu"
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
export type {MatrixStore} from "@matrix/gravity"
export type {WeakMode, WeakStore} from "./weak"
