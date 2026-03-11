/**
 * `@boundary/matrix` оркестрирует CPU/GPU runtime поверх канонического Boundary store.
 *
 * Matrix не владеет truth-данными: он получает `BoundaryStore`, локально выводит
 * execution-детали и пишет runtime-результаты обратно в тот же store.
 */

export { GPU } from "./device"
export { matrixInit, matrixHeapUpdate, matrixReadChanges, matrixStep, matrixRunStep } from "./matrix"
export { matrix$ } from "./store"
export { CONDITION_OP, FIELD_TYPE, OP, TYPE, VALUE_TYPE } from "./constants"
export type { BoundaryStore } from "../store"
