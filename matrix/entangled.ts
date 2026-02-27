/**
 * Анализ запутанных (entangled) групп бран.
 *
 * Определяет группы бран с идентичными значениями полей для оптимизации памяти.
 * Вместо дублирования данных, одинаковые поля выносятся в shared-блоки.
 *
 * @packageDocumentation
 */
import type { EntangledGroup, EntangledAnalysis, BraneMapping } from "./entangled.t"

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
 * const analysis = findEntangledGroups(params)
 * // analysis.entangledGroups: Map { "0,1" → { braneIndices: Set(0,1), fieldIndices: Set(0,1) } }
 * ```
 */
export function findEntangledGroups(
  params: [number, unknown][][],
): EntangledAnalysis {
  const fieldUsage = new Map<number, Set<number>>()

  // Собираем usage: поле → браны
  params.forEach((braneParams, idx) => {
    braneParams.forEach(([fieldId]) => {
      if (!fieldUsage.has(fieldId)) {
        fieldUsage.set(fieldId, new Set())
      }
      fieldUsage.get(fieldId)!.add(idx)
    })
  })

  // Функция сравнения значений (глубокое для массивов)
  const valueEquals = (left: unknown, right: unknown): boolean => {
    if (Array.isArray(left) && Array.isArray(right)) {
      if (left.length !== right.length) return false
      return left.every((value, idx) => Object.is(value, right[idx]))
    }
    return Object.is(left, right)
  }

  const entangledGroups = new Map<string, EntangledGroup>()

  // Для каждого поля проверяем: одинаковы ли значения у всех бран
  fieldUsage.forEach((braneIndicesSet, fieldId) => {
    if (braneIndicesSet.size < 2) return

    const ids = Array.from(braneIndicesSet)
    const brane0Params = params[ids[0]!]!

    // Находим значение поля у первой браны
    let firstValue: unknown = undefined
    for (let i = 0; i < brane0Params.length; i++) {
      if (brane0Params[i]![0] === fieldId) {
        firstValue = brane0Params[i]![1]
        break
      }
    }

    if (firstValue === undefined) return

    // Проверяем: одинаковы ли значения у всех бран
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

    // Создаём/обновляем группу
    const key = ids.sort((a, b) => a - b).join(",")
    if (!entangledGroups.has(key)) {
      entangledGroups.set(key, {
        braneIndices: new Set(ids),
        fieldIndices: new Set(),
      })
    }
    entangledGroups.get(key)!.fieldIndices.add(fieldId)
  })

  return { fieldUsage, entangledGroups }
}

/**
 * Создаёт маппинг бран → entangled блоки + локальные поля.
 *
 * @remarks
 * **Чистая функция:** Не имеет side effects.
 *
 * @param params - Массив параметров бран.
 * @param entangledBraneIds - Маппинг ключ группы → ID entangled блока.
 * @param analysis - Результат анализа findEntangledGroups.
 * @returns Структура для создания бран.
 */
export function buildBraneMapping(
  params: [number, unknown][][],
  entangledBraneIds: Map<string, number>,
  analysis: EntangledAnalysis,
): BraneMapping {
  const { fieldUsage, entangledGroups } = analysis

  // Собираем поля для каждой entangled группы
  const entangledFields = new Map<string, [number, unknown][]>()
  entangledGroups.forEach((group, key) => {
    const braneIndices = Array.from(group.braneIndices)
    const firstBraneIdx = braneIndices[0]!
    const braneParams = params[firstBraneIdx]!

    // Фильтруем только поля, входящие в эту группу
    const filteredParams = braneParams.filter(([fid]) =>
      group.fieldIndices.has(fid),
    )
    entangledFields.set(key, filteredParams)
  })

  const braneEntangledMap: number[][] = []
  const localFields: [number, unknown][][] = []

  params.forEach((braneParams, idx) => {
    const entangledIds: number[] = []
    const usedGroupKeys = new Set<string>()
    const localBrane: [number, unknown][] = []

    braneParams.forEach(([fieldId, value]) => {
      const ids = fieldUsage.get(fieldId)!

      // Если поле используется только одной браной — локальное
      if (ids.size < 2) {
        localBrane.push([fieldId, value])
        return
      }

      const key = Array.from(ids).sort((a, b) => a - b).join(",")

      // Проверяем: есть ли эта группа бран в entangled И входит ли поле в эту группу
      const group = entangledGroups.get(key)
      if (!group || !group.fieldIndices.has(fieldId)) {
        localBrane.push([fieldId, value])
        return
      }

      // Добавляем ссылку на entangled блок
      if (!usedGroupKeys.has(key)) {
        const entangledId = entangledBraneIds.get(key)!
        entangledIds.push(entangledId)
        usedGroupKeys.add(key)
      }
    })

    braneEntangledMap[idx] = entangledIds
    localFields[idx] = localBrane
  })

  return {
    localFields,
    braneEntangledMap,
    entangledFields,
  }
}
