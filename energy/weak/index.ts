/**
 * `@energy/weak` вычисляет переход состояния поверх канонического store Energy.
 *
 * Корневой вход этой силы остаётся оркестратором, а конкретные роли разложены
 * по подпакетам `runtime`, `program`, `encode`.
 */

export {GPU} from "./device"
export {weakInit, weakHeapUpdate, weakReadChanges, weakStep, weakRunStep, weak$} from "./weak"
export {OP as CONDITION_OP, FIELD_TYPE, OP, VALUE_TYPE as TYPE, VALUE_TYPE} from "./constants"
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
export type {EnergyStore} from "@energy/gravity"
export type {WeakMode, WeakStore} from "./weak"
