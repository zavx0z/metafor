import { Wimp } from "@dark/strong"
import type { DarkParticle } from "@dark/types"
import type { FieldKey } from "@metafor/ast"
import type {
  SharedDbBraneRecord,
  SharedDbFieldRecord,
  SharedDbFieldSchemaRecord,
  SharedDbFieldSourceRecord,
  SharedDbFieldValueRecord,
  SharedDbProjection,
} from "@shared/db"

const isTopologyFieldType = (type: string): boolean => type.startsWith("enum<") || type.startsWith("array<")
type SharedDbInputField = NonNullable<Wimp["fields"]>[string]

const cloneFieldSchema = (schema: SharedDbInputField["schema"]): SharedDbFieldSchemaRecord => ({
  type: schema.type,
  required: schema.required === true,
  topology: isTopologyFieldType(schema.type),
  ...(schema.label !== undefined ? { label: schema.label } : {}),
  ...(schema.values !== undefined ? { values: structuredClone(schema.values) } : {}),
})

/**
 * Собирает плоский список всех `Wimp`, достижимых от корня.
 *
 * Обход идёт по `children`, поэтому в плоскую DB-проекцию попадают только уже
 * собранные частицы, а промежуточные topology-частицы служат мостами к дочерним `Wimp`.
 *
 * @param root Корневой materialized `Wimp`, от которого начинается проекция.
 * @returns Список `Wimp` в стабильном порядке обхода.
 */
const collectReachableWimps = (root: Wimp): Wimp[] => {
  const ordered: Wimp[] = []
  const queue: DarkParticle[] = [root]
  const seenParticleIds = new Set<string>()

  while (queue.length > 0) {
    const particle = queue.shift()
    if (!particle || seenParticleIds.has(particle.id)) continue
    seenParticleIds.add(particle.id)

    if (particle instanceof Wimp) {
      ordered.push(particle)
    }

    for (const child of particle.children) {
      queue.push(child)
    }
  }

  return ordered
}

/**
 * Строит общую плоскую DB-проекцию из полностью materialized `Dark`-графа.
 *
 * Функция остаётся в `Dark`, потому что только здесь известны правила обхода
 * объектного графа, `children` и ordinary `Field.source`.
 *
 * @param root Корневой `Wimp` materialized `Dark`-графа.
 * @returns Плоская DB-проекция с готовыми индексами для downstream-кода.
 */
export const assembleSharedDbProjection = (root: Wimp): SharedDbProjection => {
  const orderedWimps = collectReachableWimps(root)
  const branes: SharedDbBraneRecord[] = []
  const fields: SharedDbFieldRecord[] = []
  const fieldValues: SharedDbFieldValueRecord[] = []
  const fieldSources: SharedDbFieldSourceRecord[] = []
  const braneIndexByDarkId = new Map<string, number>()
  const fieldIndexByDarkId = new Map<string, number>()
  const fieldIndexByBraneAndKey = new Map<number, Map<FieldKey, number>>()
  const fieldSourceByChildFieldIndex: Array<SharedDbFieldSourceRecord | undefined> = []
  const dependentFieldIndexesByParentFieldIndex = new Map<number, number[]>()
  const fieldIndexByObject = new Map<SharedDbInputField, number>()

  for (const wimp of orderedWimps) {
    const braneIndex = branes.length
    const fieldOffset = fields.length
    const fieldLookup = new Map<FieldKey, number>()
    braneIndexByDarkId.set(wimp.id, braneIndex)

    for (const [key, field] of Object.entries(wimp.fields ?? {})) {
      const fieldIndex = fields.length
      const fieldRecord: SharedDbFieldRecord = {
        index: fieldIndex,
        darkFieldId: field.id,
        ownerBraneIndex: braneIndex,
        key,
        schema: cloneFieldSchema(field.schema),
      }

      fields.push(fieldRecord)
      fieldValues.push({
        fieldIndex,
        value: structuredClone(field.value),
      })
      fieldIndexByDarkId.set(field.id, fieldIndex)
      fieldLookup.set(key, fieldIndex)
      fieldIndexByObject.set(field, fieldIndex)
    }

    branes.push({
      index: braneIndex,
      darkWimpId: wimp.id,
      src: wimp.src,
      ...(wimp.name !== undefined ? { name: wimp.name } : {}),
      fieldOffset,
      fieldCount: fields.length - fieldOffset,
    })
    fieldIndexByBraneAndKey.set(braneIndex, fieldLookup)
  }

  for (const wimp of orderedWimps) {
    for (const field of Object.values(wimp.fields ?? {})) {
      const childFieldIndex = fieldIndexByObject.get(field)
      const parentFieldIndex = field.source ? fieldIndexByObject.get(field.source) : undefined

      // В таблицу ordinary source-связей попадает только доказуемая прямая связь
      // между обычными полями. Topology-поля остаются лишь в общих таблицах полей и значений.
      if (
        childFieldIndex === undefined ||
        parentFieldIndex === undefined ||
        isTopologyFieldType(field.schema.type) ||
        isTopologyFieldType(field.source.schema.type)
      ) {
        continue
      }

      const sourceRecord: SharedDbFieldSourceRecord = {
        childFieldIndex,
        parentFieldIndex,
      }

      fieldSources.push(sourceRecord)
      fieldSourceByChildFieldIndex[childFieldIndex] = sourceRecord

      const dependents = dependentFieldIndexesByParentFieldIndex.get(parentFieldIndex)
      if (dependents) {
        dependents.push(childFieldIndex)
      } else {
        dependentFieldIndexesByParentFieldIndex.set(parentFieldIndex, [childFieldIndex])
      }
    }
  }

  return {
    rootBraneIndex: 0,
    branes,
    fields,
    fieldValues,
    fieldSources,
    braneIndexByDarkId,
    fieldIndexByDarkId,
    fieldIndexByBraneAndKey,
    fieldSourceByChildFieldIndex,
    dependentFieldIndexesByParentFieldIndex,
  }
}
