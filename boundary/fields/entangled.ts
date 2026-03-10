/**
 * Анализ запутанных (entangled) групп бран.
 *
 * Определяет группы бран с идентичными значениями полей для оптимизации памяти.
 * Вместо дублирования данных, одинаковые поля выносятся в shared-блоки.
 *
 * @packageDocumentation
 */
import type {
  EntangledGroup,
  EntangledAnalysis,
  BraneMapping,
  PreparedEntanglementBlock,
  PreparedEntanglementField,
  PreparedEntanglementProjection,
} from "./entangled.t"

/**
 * Анализирует значения бран и определяет entangled группы.
 *
 * @remarks
 * **Чистая функция:** Не имеет side effects, не зависит от состояния.
 *
 * Entangled группа создаётся когда:
 * 1. Поле присутствует у ≥2 бран
 * 2. Все значения поля одинаковы (Object.is)
 *
 * @param values - Массив значений бран в формате кортежей.
 * @returns Результат анализа с маппингом entangled групп.
 *
 * @example
 * ```typescript
 * const values = [
 *   [[0, 100], [1, true]],  // брана 0
 *   [[0, 100], [1, true]],  // брана 1 (идентична)
 * ]
 * const analysis = findEntangledGroups(values)
 * // analysis.entangledGroups: Map { "0,1" → { braneIndices: Set(0,1), fieldIndices: Set(0,1) } }
 * ```
 */
export function findEntangledGroups(
  values: [number, unknown][][],
): EntangledAnalysis {
  const fieldUsage = new Map<number, Set<number>>()

  // Собираем usage: поле → браны
  values.forEach((braneValues, idx) => {
    braneValues.forEach(([fieldId]) => {
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
    const brane0Values = values[ids[0]!]!

    // Находим значение поля у первой браны
    let firstValue: unknown = undefined
    for (let i = 0; i < brane0Values.length; i++) {
      if (brane0Values[i]![0] === fieldId) {
        firstValue = brane0Values[i]![1]
        break
      }
    }

    if (firstValue === undefined) return

    // Проверяем: одинаковы ли значения у всех бран
    let allSame = true
    for (let i = 1; i < ids.length && allSame; i++) {
      const braneValues = values[ids[i]!]!
      let found = false
      for (let j = 0; j < braneValues.length; j++) {
        if (braneValues[j]![0] === fieldId) {
          if (!valueEquals(braneValues[j]![1], firstValue)) {
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
 * @param values - Массив значений бран.
 * @param entangledBraneIds - Маппинг ключ группы → ID entangled блока.
 * @param analysis - Результат анализа findEntangledGroups.
 * @returns Структура для создания бран.
 */
export function buildBraneMapping(
  values: [number, unknown][][],
  entangledBraneIds: Map<string, number>,
  analysis: EntangledAnalysis,
): BraneMapping {
  const { fieldUsage, entangledGroups } = analysis

  // Собираем поля для каждой entangled группы
  const entangledFields = new Map<string, [number, unknown][]>()
  entangledGroups.forEach((group, key) => {
    const braneIndices = Array.from(group.braneIndices)
    const firstBraneIdx = braneIndices[0]!
    const braneValues = values[firstBraneIdx]!

    // Фильтруем только поля, входящие в эту группу
    const filteredValues = braneValues.filter(([fid]) =>
      group.fieldIndices.has(fid),
    )
    entangledFields.set(key, filteredValues)
  })

  const braneEntangledMap: number[][] = []
  const localFields: [number, unknown][][] = []

  values.forEach((braneValues, idx) => {
    const entangledIds: number[] = []
    const usedGroupKeys = new Set<string>()
    const localBrane: [number, unknown][] = []

    braneValues.forEach(([fieldId, value]) => {
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

const valueEquals = (left: unknown, right: unknown): boolean => {
  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) return false
    return left.every((value, idx) => Object.is(value, right[idx]))
  }
  return Object.is(left, right)
}

const normalizePreparedField = (field: PreparedEntanglementField): PreparedEntanglementField => ({
  fieldIndex: field.fieldIndex,
  fieldName: field.fieldName,
  payloadIds: Array.from(new Set(field.payloadIds)).sort(),
  semanticKeys: Array.from(new Set(field.semanticKeys)).sort(),
  ...(field.representativeBraneIndex !== undefined
    ? { representativeBraneIndex: field.representativeBraneIndex }
    : {}),
})

const normalizeBlock = (block: PreparedEntanglementBlock): PreparedEntanglementBlock => ({
  braneIndices: Array.from(new Set(block.braneIndices)).sort((a, b) => a - b),
  ...(block.fields
    ? { fields: block.fields.map(normalizePreparedField).sort((left, right) => left.fieldIndex - right.fieldIndex) }
    : {}),
  ...(block.fieldIndices
    ? { fieldIndices: Array.from(new Set(block.fieldIndices)).sort((a, b) => a - b) }
    : {}),
  ...(block.key ? { key: block.key } : {}),
})

const resolvePreparedFields = (
  block: PreparedEntanglementBlock,
): PreparedEntanglementField[] => {
  if (block.fields && block.fields.length > 0) {
    return block.fields
  }

  // Legacy fallback for compatibility with old field-index-only projection.
  return block.fieldIndices?.map((fieldIndex) => ({
    fieldIndex,
    fieldName: String(fieldIndex),
    payloadIds: [],
    semanticKeys: [],
  } satisfies PreparedEntanglementField)) ?? []
}

/**
 * Материализует заранее подготовленную entanglement projection в brane layout.
 *
 * Boundary не выводит shared-блоки из значений, а только валидирует пришедшую
 * projection и раскладывает поля по local/shared частям.
 */
export function materializeEntanglement(
  values: [number, unknown][][],
  projection?: PreparedEntanglementProjection,
): BraneMapping {
  const blocks = projection?.blocks?.map(normalizeBlock) ?? []
  const entangledFields = new Map<string, [number, unknown][]>()
  const braneEntangledMap = values.map(() => [] as number[])
  const entangledAssignments = values.map(() => new Set<number>())

  blocks.forEach((block, blockId) => {
    if (block.braneIndices.length < 2) {
      throw new Error(`Entanglement block ${blockId}: requires at least 2 branes`)
    }
    const preparedFields = resolvePreparedFields(block)

    if (preparedFields.length === 0) {
      throw new Error(`Entanglement block ${blockId}: requires at least 1 field`)
    }

    const blockKey = block.key ?? `${block.braneIndices.join(",")}:${preparedFields.map((field) => field.fieldIndex).join(",")}`
    const sharedValues: [number, unknown][] = []

    preparedFields.forEach((field) => {
      const fieldIndex = field.fieldIndex
      const referenceBrane = field.representativeBraneIndex ?? block.braneIndices[0]!
      const referenceEntry = values[referenceBrane]?.find(([candidate]) => candidate === fieldIndex)

      if (!referenceEntry) {
        throw new Error(`Entanglement block ${blockKey}: field ${fieldIndex} missing in brane ${referenceBrane}`)
      }

      const [, referenceValue] = referenceEntry

      block.braneIndices.forEach((braneIndex) => {
        if (braneIndex < 0 || braneIndex >= values.length) {
          throw new Error(`Entanglement block ${blockKey}: brane ${braneIndex} out of range`)
        }

        const fieldEntry = values[braneIndex]!.find(([candidate]) => candidate === fieldIndex)
        if (!fieldEntry) {
          throw new Error(`Entanglement block ${blockKey}: field ${fieldIndex} missing in brane ${braneIndex}`)
        }
        if (!valueEquals(fieldEntry[1], referenceValue)) {
          throw new Error(`Entanglement block ${blockKey}: field ${fieldIndex} values diverge across branes`)
        }
        if (entangledAssignments[braneIndex]!.has(fieldIndex)) {
          throw new Error(`Entanglement block ${blockKey}: field ${fieldIndex} already assigned for brane ${braneIndex}`)
        }
      })

      block.braneIndices.forEach((braneIndex) => {
        entangledAssignments[braneIndex]!.add(fieldIndex)
      })
      sharedValues.push([fieldIndex, referenceValue])
    })

    entangledFields.set(blockKey, sharedValues)
    block.braneIndices.forEach((braneIndex) => {
      braneEntangledMap[braneIndex]!.push(blockId)
    })
  })

  const localFields = values.map((braneValues, braneIndex) =>
    braneValues.filter(([fieldIndex]) => !entangledAssignments[braneIndex]!.has(fieldIndex)),
  )

  return {
    localFields,
    braneEntangledMap,
    entangledFields,
  }
}
