/**
 * Преобразует проверенную входную форму Matrix в канонический рабочий Store.
 *
 * Функция не изменяет живую Matrix, не открывает Force и не создаёт Weak.
 * Рождение использует её до открытия причинного канала, а проверки отдельных
 * вычислений — для создания изолированных Stores.
 *
 * @see [Подготовка обычных и общих Fields](https://github.com/zavx0z/metafor/blob/main/matrix/tests/prepare.spec.ts)
 * @see [Условия одинаково вычисляются CPU и WebGPU](https://github.com/zavx0z/metafor/blob/main/matrix/weak/tests/weak.conditions.test.ts)
 *
 * @packageDocumentation
 */

import type {MatrixInputData} from "@metafor/types/matrix/data"
import type {MatrixData} from "@metafor/types/matrix/store"
import {flattenMatrixData, validateData} from "gravity"
import {assembleStoredMatrixData} from "strong"

export function prepareMatrixData(data: MatrixInputData): MatrixData {
  validateData(data)
  return assembleStoredMatrixData(flattenMatrixData(data))
}
