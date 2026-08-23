/**
 * Техническая точка входа Matrix.
 *
 * Matrix материализует производную проекцию Boundary, последовательно применяет
 * изменения Fields и структуры, выполняет один шаг автомата состояний и
 * публикует получившиеся Photon. Выполнение Process остаётся в Energy, а
 * каноническое подтверждение результата — в Boundary.
 *
 * @see [Полный проход State → Process → commit](https://github.com/zavx0z/metafor/blob/main/quantum/matrix/matrix.spec.ts#L72-L233)
 * @see [Одинаковая причинная трасса CPU и WebGPU](https://github.com/zavx0z/metafor/blob/main/quantum/matrix/runtime.parity.spec.ts#L293-L313)
 *
 * @packageDocumentation
 */

export {
  listMatrixRuntimeAtomIds,
} from "./matrix.ts"
