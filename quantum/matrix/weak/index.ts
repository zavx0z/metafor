/**
 * Вычислительный слой переходов Matrix.
 *
 * Один активный исполнитель читает подготовленную проекцию, пропускает
 * заблокированные Branes, вводит неопределённые States в первый объявленный
 * State либо проверяет обычные Transitions. CPU является эталонным
 * последовательным исполнителем, WebGPU — параллельным; их наблюдаемая трасса
 * обязана совпадать.
 *
 * @see [Рождение неопределённого State](https://github.com/zavx0z/metafor/blob/main/matrix/weak/tests/weak.parity.test.ts#L155-L175)
 * @see [Atom без графа States](https://github.com/zavx0z/metafor/blob/main/matrix/weak/tests/weak.parity.test.ts#L213-L237)
 * @see [Первый подходящий Transition](https://github.com/zavx0z/metafor/blob/main/matrix/weak/tests/weak.parity.test.ts#L265-L281)
 * @see [Полный язык условий от Graph до шага Weak](https://github.com/zavx0z/metafor/blob/main/matrix/conditions.integration.spec.ts)
 * @see [Равенство всех условий CPU и WebGPU](https://github.com/zavx0z/metafor/blob/main/matrix/weak/tests/weak.conditions.test.ts)
 *
 * @packageDocumentation
 */

export {GPU} from "./device"
export {weakInit, weakHeapUpdate, weakReadChanges, weakStep, weakRunStep, weakStructuralUpdate, weak$} from "./weak"
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
