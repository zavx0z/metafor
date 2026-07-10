/**
 * `@matrix/weak` computes state transitions over the canonical Matrix store.
 */
export {GPU} from "./device"
export {weakInit, weakReconfigure, weakHeapUpdate, weakReadChanges, weakStep, weakRunStep, weak$} from "./weak"
export {
  GPU_STATE_NONE,
  GPU_STATE_UNDEFINED,
  FIELD_TYPE,
  OP,
  STATE_NONE,
  STATE_UNDEFINED,
  StepMode,
  VALUE_TYPE,
} from "./constants"
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
