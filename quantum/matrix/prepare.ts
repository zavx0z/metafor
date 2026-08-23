/**
 * Преобразует проверенную входную форму Matrix в канонический рабочий Store.
 *
 * Функция не изменяет живую Matrix, не открывает Force и не создаёт Weak.
 * Рождение использует её до открытия причинного канала, а проверки отдельных
 * вычислений — для создания изолированных Stores.
 *
 * @see [Подготовка обычных и общих Fields](https://github.com/zavx0z/metafor/blob/main/quantum/matrix/tests/prepare.spec.ts)
 * @see [Условия одинаково вычисляются CPU и WebGPU](https://github.com/zavx0z/metafor/blob/main/quantum/matrix/weak/tests/weak.conditions.test.ts)
 *
 * @packageDocumentation
 */

import type {MatrixInputData} from "@matrix/types/data"
import type {MatrixData} from "@matrix/types/store"
import {flattenMatrixData, validateData} from "@matrix/gravity"
import {assembleStoredMatrixData} from "@matrix/strong"

export function prepareMatrixData(data: MatrixInputData): MatrixData {
  validateData(data)
  return assembleStoredMatrixData(flattenMatrixData(data))
}
