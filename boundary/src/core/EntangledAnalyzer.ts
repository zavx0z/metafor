/**
 * Анализ данных для создания entangled (shared) блоков.
 *
 * @packageDocumentation
 */

import type { FieldTuple, ValueTuple } from "../index.t"

/**
 * Результат подготовки entangled групп.
 */
export interface EntangledPreparation {
  /**
   * Маппинг ключа группы бран → ID entangled блока.
   * Ключ: отсортированные индексы бран ("0,1,2").
   */
  entangledBraneIds: Map<string, number>

  /**
   * Маппинг ключа группы → поля для entangled блока.
   */
  entangledFields: Map<string, ValueTuple[]>

  /**
   * Маппинг индекса браны → массив ID entangled блоков.
   */
  braneEntangledMap: number[][]

  /**
   * Локальные поля для каждой браны (не попавшие в entangled).
   */
  localFields: ValueTuple[][]
}

/**
 * Анализирует параметры бран и определяет entangled группы.
 *
 * @remarks
 * **Чистая функция:** Не имеет side effects, не зависит от состояния.
 *
 * Entangled группа создаётся когда:
 * 1. Поле присутствует у ≥2 бран
 * 2. Все значения поля одинаковы (Object.is)
 *
 * @param params - Массив параметров бран в формате кортежей.
 * @returns Результат анализа с маппингом entangled групп.
 *
 * @example
 * ```typescript
 * const params = [
 *   [[0, 100], [1, true]],  // брана 0
 *   [[0, 100], [1, true]],  // брана 1 (идентична)
 * ]
 * const analysis = analyzeEntangledGroups(params)
 * // analysis.entangledBraneIds: Map { "0,1" → 0 }
 * // analysis.localFields: [[], []] (все поля в entangled)
 * ```
 */
export function analyzeEntangledGroups(params: ValueTuple[][]): {
  componentUsage: Map<number, Set<number>>
  entangledGroups: Map<string, Set<number>>
} {
  const componentUsage = new Map<number, Set<number>>()
  params.forEach((braneParams, idx) => {
    braneParams.forEach(([fieldId]) => {
      if (!componentUsage.has(fieldId)) componentUsage.set(fieldId, new Set())
      componentUsage.get(fieldId)!.add(idx)
    })
  })

  const valueEquals = (left: unknown, right: unknown): boolean => {
    if (Array.isArray(left) && Array.isArray(right)) {
      if (left.length !== right.length) return false
      return left.every((value, idx) => Object.is(value, right[idx]))
    }
    return Object.is(left, right)
  }

  const entangledGroups = new Map<string, Set<number>>()
  componentUsage.forEach((braneIndicesSet, fieldId) => {
    if (braneIndicesSet.size < 2) return
    const key = Array.from(braneIndicesSet).sort().join(",")
    const ids = Array.from(braneIndicesSet)
    const brane0Params = params[ids[0]!]!
    let firstValue: unknown = undefined
    for (let i = 0; i < brane0Params.length; i++) {
      if (brane0Params[i]![0] === fieldId) {
        firstValue = brane0Params[i]![1]
        break
      }
    }
    if (firstValue === undefined) return
    let allSame = true
    for (let i = 1; i < ids.length && allSame; i++) {
      const braneParams = params[ids[i]!]!
      let found = false
      for (let j = 0; j < braneParams.length; j++) {
        if (braneParams[j]![0] === fieldId) {
          if (!valueEquals(braneParams[j]![1], firstValue)) {
            allSame = false
          }
          found = true
          break
        }
      }
      if (!found) allSame = false
    }
    if (!allSame) return
    if (!entangledGroups.has(key)) {
      entangledGroups.set(key, new Set())
    }
    entangledGroups.get(key)!.add(fieldId)
  })

  return { componentUsage, entangledGroups }
}

/**
 * Создаёт маппинг бран → entangled блоки + локальные поля.
 *
 * @remarks
 * **Чистая функция:** Не имеет side effects.
 *
 * @param params - Массив параметров бран.
 * @param entangledBraneIds - Маппинг ключ группы → ID entangled блока.
 * @param entangledGroups - Маппинг ключ группы → поля.
 * @param componentUsage - Маппинг поля → браны.
 * @returns Структура для создания бран.
 */
export function buildBraneMapping(
  params: ValueTuple[][],
  entangledBraneIds: Map<string, number>,
  entangledGroups: Map<string, Set<number>>,
  componentUsage: Map<number, Set<number>>,
): EntangledPreparation {
  // Собираем поля для каждой entangled группы
  const entangledFields = new Map<string, ValueTuple[]>()
  entangledGroups.forEach((fieldIds, key) => {
    const braneIndices = key.split(",").map((value) => Number(value))
    const firstBraneIdx = braneIndices[0]!
    const braneParams = params[firstBraneIdx]!
    const filteredParams = braneParams.filter(([fid]) => fieldIds.has(fid))
    entangledFields.set(key, filteredParams)
  })

  const braneEntangledMap: number[][] = []
  const localFields: ValueTuple[][] = []

  params.forEach((braneParams, idx) => {
    const entangledIds: number[] = []
    const usedGroupKeys = new Set<string>()
    const localBrane: ValueTuple[] = []

    braneParams.forEach(([fieldId, value]) => {
      const ids = componentUsage.get(fieldId)!
      if (ids.size < 2) {
        localBrane.push([fieldId, value])
        return
      }
      const key = Array.from(ids).sort().join(",")
      
      // Проверяем: есть ли эта группа бран в entangled И входит ли поле в эту группу
      const groupFieldIds = entangledGroups.get(key)
      if (!groupFieldIds || !groupFieldIds.has(fieldId)) {
        localBrane.push([fieldId, value])
        return
      }
      
      if (!usedGroupKeys.has(key)) {
        entangledIds.push(entangledBraneIds.get(key)!)
        usedGroupKeys.add(key)
      }
    })

    braneEntangledMap[idx] = entangledIds
    localFields[idx] = localBrane
  })

  return {
    entangledBraneIds,
    entangledFields,
    braneEntangledMap,
    localFields,
  }
}

/**
 * Полный анализ и подготовка данных для createEnsemble.
 *
 * @remarks
 * **Композиция:** `analyzeEntangledGroups` + `buildBraneMapping`.
 *
 * @param params - Массив параметров бран.
 * @returns Готовая структура для создания бран.
 *
 * @example
 * ```typescript
 * const params = [
 *   [[0, 100], [1, true]],
 *   [[0, 100], [1, true]],
 * ]
 * const preparation = prepareEnsembleData(params)
 * // preparation.localFields: [[], []]
 * // preparation.braneEntangledMap: [[0], [0]]
 * // preparation.entangledFields: Map { "0,1" → [[0, 100], [1, true]] }
 * ```
 */
export function prepareEnsembleData(params: ValueTuple[][]): EntangledPreparation {
  const { componentUsage, entangledGroups } = analyzeEntangledGroups(params)

  // Создаём entangled блоки (виртуальные ID)
  const entangledBraneIds = new Map<string, number>()
  let nextEntangledId = 0
  entangledGroups.forEach((fieldIds, key) => {
    entangledBraneIds.set(key, nextEntangledId++)
  })

  return buildBraneMapping(params, entangledBraneIds, entangledGroups, componentUsage)
}
