import { Wimp } from "@dark/strong"
import type { DarkParticle } from "@dark/types"
import type { FieldKey } from "@metafor/ast"
import type {
  SharedDbBraneRecord,
  SharedDbEntanglementSeedBlockMemberRecord,
  SharedDbEntanglementSeedBlockRecord,
  SharedDbEntanglementSeedFieldMemberRecord,
  SharedDbEntanglementSeedFieldRecord,
  SharedDbFieldRecord,
  SharedDbFieldSchemaRecord,
  SharedDbFieldSourceRecord,
  SharedDbFieldValueRecord,
  SharedDbProjection,
  SharedDbStateSeedConditionRecord,
  SharedDbStateSeedStateRecord,
  SharedDbStateSeedTransitionRecord,
} from "@shared/db"

const isTopologyFieldType = (type: string): boolean => type.startsWith("enum<") || type.startsWith("array<")
type SharedDbInputField = NonNullable<Wimp["fields"]>[string]
type NamedSuperposition = NonNullable<Wimp["superposition"]>

const cloneFieldSchema = (schema: SharedDbInputField["schema"]): SharedDbFieldSchemaRecord => ({
  type: schema.type,
  required: schema.required === true,
  topology: isTopologyFieldType(schema.type),
  ...(schema.label !== undefined ? { label: schema.label } : {}),
  ...(schema.values !== undefined ? { values: structuredClone(schema.values) } : {}),
})

const resolveSourceRoot = (field: SharedDbInputField): SharedDbInputField => {
  let current = field
  const seen = new Set<string>()

  while (current.source && !seen.has(current.id)) {
    seen.add(current.id)
    current = current.source
  }

  return current
}

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

const buildEntanglementSeeds = (
  orderedWimps: Wimp[],
  braneIndexByDarkId: Map<string, number>,
): {
  entanglementBlocks: SharedDbEntanglementSeedBlockRecord[]
  entanglementBlockMembers: SharedDbEntanglementSeedBlockMemberRecord[]
  entanglementFields: SharedDbEntanglementSeedFieldRecord[]
  entanglementFieldMembers: SharedDbEntanglementSeedFieldMemberRecord[]
} => {
  const familyMembersByRootDarkFieldId = new Map<string, SharedDbInputField[]>()

  for (const wimp of orderedWimps) {
    for (const field of Object.values(wimp.fields ?? {})) {
      const rootField = resolveSourceRoot(field)
      const family = familyMembersByRootDarkFieldId.get(rootField.id)
      if (family) {
        family.push(field)
      } else {
        familyMembersByRootDarkFieldId.set(rootField.id, [field])
      }
    }
  }

  const entanglementBlocks: SharedDbEntanglementSeedBlockRecord[] = []
  const entanglementBlockMembers: SharedDbEntanglementSeedBlockMemberRecord[] = []
  const entanglementFields: SharedDbEntanglementSeedFieldRecord[] = []
  const entanglementFieldMembers: SharedDbEntanglementSeedFieldMemberRecord[] = []
  const blockIndexByMembershipKey = new Map<string, number>()

  for (const [rootDarkFieldId, rawMembers] of familyMembersByRootDarkFieldId) {
    const members = Array.from(
      new Map(rawMembers.map((field) => [field.id, field])).values(),
    )
      .map((field) => {
        const braneIndex = braneIndexByDarkId.get(field.owner.id)
        if (braneIndex === undefined) {
          throw new Error(`Shared DB entanglement seed references unknown brane for field ${field.id}`)
        }
        return { field, braneIndex }
      })
      .sort((left, right) => left.braneIndex - right.braneIndex || left.field.key.localeCompare(right.field.key))

    const braneIndices = Array.from(new Set(members.map((member) => member.braneIndex))).sort((left, right) => left - right)
    if (braneIndices.length < 2 || members.length !== braneIndices.length) {
      continue
    }

    const representative = members.find((member) => member.field.id === rootDarkFieldId) ?? members[0]
    if (!representative) continue

    const membershipKey = braneIndices.join(",")
    let blockIndex = blockIndexByMembershipKey.get(membershipKey)
    if (blockIndex === undefined) {
      blockIndex = entanglementBlocks.length
      blockIndexByMembershipKey.set(membershipKey, blockIndex)
      entanglementBlocks.push({
        index: blockIndex,
        key: `source-family:${membershipKey}`,
      })
      braneIndices.forEach((braneIndex, memberIndex) => {
        entanglementBlockMembers.push({
          index: entanglementBlockMembers.length,
          blockIndex,
          memberIndex,
          braneIndex,
        })
      })
    }

    const blockFieldIndex = entanglementFields.filter((field) => field.blockIndex === blockIndex).length
    const semanticKeys = Array.from(new Set([representative.field.key, ...members.map((member) => member.field.key)])).sort()
    const payloadIds = members.map((member) => member.field.id).sort()

    entanglementFields.push({
      index: entanglementFields.length,
      blockIndex,
      blockFieldIndex,
      semanticKey: representative.field.id,
      fieldName: representative.field.key,
      provenance: "dark-source-family",
      representativeDarkFieldId: representative.field.id,
      representativeBraneIndex: representative.braneIndex,
      payloadIds,
      semanticKeys,
    })

    const entanglementFieldIndex = entanglementFields.length - 1
    members.forEach((member, memberIndex) => {
      entanglementFieldMembers.push({
        index: entanglementFieldMembers.length,
        entanglementFieldIndex,
        memberIndex,
        braneIndex: member.braneIndex,
        darkFieldId: member.field.id,
      })
    })
  }

  return {
    entanglementBlocks,
    entanglementBlockMembers,
    entanglementFields,
    entanglementFieldMembers,
  }
}

const createDefaultSuperposition = (): NamedSuperposition => ({
  default: null,
})

const buildStateSeeds = (
  orderedWimps: Wimp[],
  braneIndexByDarkId: Map<string, number>,
): {
  stateSeedStates: SharedDbStateSeedStateRecord[]
  stateSeedTransitions: SharedDbStateSeedTransitionRecord[]
  stateSeedConditions: SharedDbStateSeedConditionRecord[]
} => {
  const stateSeedStates: SharedDbStateSeedStateRecord[] = []
  const stateSeedTransitions: SharedDbStateSeedTransitionRecord[] = []
  const stateSeedConditions: SharedDbStateSeedConditionRecord[] = []

  for (const wimp of orderedWimps) {
    const ownerBraneIndex = braneIndexByDarkId.get(wimp.id)
    if (ownerBraneIndex === undefined) {
      throw new Error(`Shared DB state seed references unknown brane for Wimp ${wimp.id}`)
    }

    const namedSuperposition =
      wimp.superposition && Object.keys(wimp.superposition).length > 0
        ? (structuredClone(wimp.superposition) as NamedSuperposition)
        : createDefaultSuperposition()

    const stateNames = Object.keys(namedSuperposition)
    const stateIndexByName = new Map<string, number>()
    stateNames.forEach((stateName, stateIndex) => {
      stateIndexByName.set(stateName, stateIndex)
      stateSeedStates.push({
        index: stateSeedStates.length,
        ownerBraneIndex,
        stateIndex,
        name: stateName,
        initial: stateIndex === 0,
      })
    })

    stateNames.forEach((stateName, fromStateIndex) => {
      const transitions = namedSuperposition[stateName]
      if (transitions === null) {
        stateSeedTransitions.push({
          index: stateSeedTransitions.length,
          ownerBraneIndex,
          fromStateIndex,
          transitionIndex: 0,
          targetStateIndex: null,
        })
        return
      }

      Object.entries(transitions).forEach(([targetStateName, conditions], transitionIndex) => {
        const targetStateIndex = stateIndexByName.get(targetStateName)
        if (targetStateIndex === undefined) {
          throw new Error(`Unknown state '${targetStateName}' in superposition of Wimp ${wimp.id}`)
        }

        stateSeedTransitions.push({
          index: stateSeedTransitions.length,
          ownerBraneIndex,
          fromStateIndex,
          transitionIndex,
          targetStateIndex,
        })

        if (conditions === null) {
          return
        }

        Object.entries(conditions).forEach(([fieldKey, condition], conditionIndex) => {
          const field = wimp.fields?.[fieldKey]
          if (!field) {
            throw new Error(`State seed field '${fieldKey}' not found in Wimp ${wimp.id}`)
          }

          stateSeedConditions.push({
            index: stateSeedConditions.length,
            transitionSeedIndex: stateSeedTransitions.length - 1,
            conditionIndex,
            darkFieldId: field.id,
            condition: structuredClone(condition),
          })
        })
      })
    })
  }

  return {
    stateSeedStates,
    stateSeedTransitions,
    stateSeedConditions,
  }
}

/**
 * Строит общую плоскую DB-проекцию из полностью materialized `Dark`-графа.
 *
 * Функция остаётся в `Dark`, потому что только здесь известны правила обхода
 * объектного графа, `children`, `Field.source` и `Wimp.superposition`.
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

  const entanglementSeeds = buildEntanglementSeeds(orderedWimps, braneIndexByDarkId)
  const stateSeeds = buildStateSeeds(orderedWimps, braneIndexByDarkId)

  return {
    rootBraneIndex: 0,
    branes,
    fields,
    fieldValues,
    fieldSources,
    ...entanglementSeeds,
    ...stateSeeds,
    braneIndexByDarkId,
    fieldIndexByDarkId,
    fieldIndexByBraneAndKey,
    fieldSourceByChildFieldIndex,
    dependentFieldIndexesByParentFieldIndex,
  }
}
