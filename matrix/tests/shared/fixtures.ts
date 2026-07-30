import type {BoundaryInitialState} from "@metafor/types/boundary/initial"
import {weak$} from "@matrix/weak"
import {prepareMatrixBirth} from "../../birth.ts"
import {initializeIncrementalMatrixIndexes} from "../../incremental.ts"

/**
 * Создаёт изолированное холодное рождение для проверки подготовки Matrix.
 *
 * Очистка предыдущего Weak относится только к повторным случаям одного
 * процесса проверки. Рабочий сервер рождает Matrix один раз в новом процессе.
 */
export async function prepareMatrixBirthFixture(initial: BoundaryInitialState) {
  weak$.dispose()
  return await prepareMatrixBirth(initial)
}

/** Создаёт фикстуру рождения вместе с индексами частичных изменений. */
export async function prepareIncrementalMatrixFixture(initial: BoundaryInitialState) {
  const result = await prepareMatrixBirthFixture(initial)
  initializeIncrementalMatrixIndexes()
  return result
}
