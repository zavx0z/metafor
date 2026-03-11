/** Строгая materialization подготовленного entanglement. */
import type { BraneMapping, PreparedEntanglementBlock, PreparedEntanglementField, PreparedEntanglementProjection } from "./entangled.t"

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
  // Runtime safety for malformed input: strict contract still validated below.
  braneIndices: Array.from(new Set(block.braneIndices)).sort((a, b) => a - b),
  fields: Array.isArray((block as { fields?: PreparedEntanglementField[] }).fields)
    ? block.fields.map(normalizePreparedField).sort((left, right) => left.fieldIndex - right.fieldIndex)
    : [],
  ...(block.key ? { key: block.key } : {}),
})

/**
 * Материализует заранее подготовленную entanglement projection в layout бран.
 *
 * Boundary не выводит shared-блоки из значений, а только валидирует готовую
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
    if (block.fields.length === 0) {
      throw new Error(`Entanglement block ${blockId}: requires at least 1 field`)
    }

    const blockKey = block.key ?? `${block.braneIndices.join(",")}:${block.fields.map((field) => field.fieldIndex).join(",")}`
    const sharedValues: [number, unknown][] = []

    block.fields.forEach((field) => {
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
