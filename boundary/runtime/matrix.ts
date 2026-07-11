import type {SQL} from "bun"
import type {MatrixConditionValue} from "@metafor/types/matrix/condition"
import type {MatrixFieldRecord, MatrixInputBrane} from "@metafor/types/matrix/data"
import {
  STATE_NONE,
  STATE_UNDEFINED,
  type MatrixRuntimeSnapshot,
} from "@metafor/types/matrix/runtime"

type JsonRecord = Record<string, unknown>

type DeclarationRow = {
  src: string
  section: string
  localId: string
  canonicalJson: string
}

type ActorRow = {
  id: number
  wimp: string
  position: number
}

type ActorFieldRow = {
  actor: number
  field: number
  valueJson: string
}

type ActorStateRow = {
  actor: number
  metaState: number | null
}

type DeclarationRecord = {
  src: string
  section: string
  localId: string
  value: JsonRecord
}

const fieldType = {
  F32: 0,
  U32: 1,
  BOOL: 2,
  STRING_PTR: 3,
  ARRAY_PTR: 4,
} as const

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const integer = (value: unknown): number | null =>
  typeof value === "number" && Number.isSafeInteger(value) ? value : null

const text = (value: unknown): string | null =>
  typeof value === "string" ? value : null

const clone = <T>(value: T): T => structuredClone(value)

const group = <T, K extends string | number>(rows: readonly T[], key: (row: T) => K): Map<K, T[]> => {
  const result = new Map<K, T[]>()
  for (const row of rows) {
    const item = key(row)
    const bucket = result.get(item)
    if (bucket) bucket.push(row)
    else result.set(item, [row])
  }
  return result
}

/** Stable derived address for one materialized actor field. */
const fieldAddressId = (actorId: number, fieldId: number): number => {
  const sum = actorId + fieldId
  const id = (sum * (sum + 1)) / 2 + fieldId
  if (!Number.isSafeInteger(id)) {
    throw new Error(`Matrix field address id is not safe: actor=${actorId} field=${fieldId}`)
  }
  return id
}

const sortByPosition = <T extends {value: JsonRecord; localId: string}>(items: readonly T[]): T[] =>
  [...items].sort((left, right) => {
    const leftPosition = Number(left.value.position ?? left.localId)
    const rightPosition = Number(right.value.position ?? right.localId)
    return leftPosition - rightPosition
  })

const inferArrayElementType = (field: JsonRecord): "number" | "string" | "boolean" => {
  const declared = field.elementType
  if (declared === "number" || declared === "string" || declared === "boolean") return declared
  const sample = Array.isArray(field.default) ? field.default[0] : undefined
  if (typeof sample === "number" || typeof sample === "boolean") return typeof sample
  return "string"
}

const fallbackFieldValue = (field: JsonRecord, enumValues: readonly unknown[]): unknown => {
  if (Object.prototype.hasOwnProperty.call(field, "default")) return clone(field.default)
  if (field.type === "number") return 0
  if (field.type === "boolean") return false
  if (field.type === "array") return []
  if (field.type === "enum") return enumValues[0] ?? null
  return ""
}

const matrixField = (field: JsonRecord, enumValues: readonly unknown[]): MatrixFieldRecord => {
  if (field.type === "number") return {type: fieldType.F32}
  if (field.type === "boolean") return {type: fieldType.BOOL}
  if (field.type === "array") return {type: fieldType.ARRAY_PTR, elementType: inferArrayElementType(field)}
  if (field.type === "enum") return {type: fieldType.U32, enum: [...enumValues]}
  return {type: fieldType.STRING_PTR}
}

const predicateValue = (condition: JsonRecord): MatrixConditionValue => {
  const raw = condition.predicate ?? condition.predicates ?? condition.value ?? null
  if (
    raw === null ||
    typeof raw === "number" ||
    typeof raw === "boolean" ||
    typeof raw === "string" ||
    isRecord(raw)
  ) return clone(raw) as MatrixConditionValue
  throw new Error(`Unsupported Matrix condition predicate: ${JSON.stringify(raw)}`)
}

/**
 * Builds a target-specific, fully derived bootstrap projection for Matrix.
 * Boundary remains the canonical materialized world; Matrix may discard and
 * rebuild this value at any time.
 */
export async function matrixRuntime(sql: SQL): Promise<MatrixRuntimeSnapshot> {
  const declarationRows = await sql<DeclarationRow[]>`
    SELECT src, section, local_id AS localId, canonical_json AS canonicalJson
      FROM boundary_declaration_entity
     ORDER BY rowid
  `
  const actors = await sql<ActorRow[]>`
    SELECT id, wimp, position FROM actor ORDER BY id
  `
  const actorFields = await sql<ActorFieldRow[]>`
    SELECT actor, field, value_json AS valueJson
      FROM boundary_actor_field
     ORDER BY actor, field
  `
  const actorStates = await sql<ActorStateRow[]>`
    SELECT actor, metaState FROM actor_state ORDER BY actor
  `

  const declarations: DeclarationRecord[] = declarationRows.map((row) => {
    const value = JSON.parse(row.canonicalJson) as unknown
    if (!isRecord(value)) throw new Error(`Boundary declaration ${row.src}/${row.section}/${row.localId} is not an object`)
    return {src: row.src, section: row.section, localId: row.localId, value}
  })

  const declarationsByWimpSection = group(declarations, (item) => `${item.src}\0${item.section}`)
  const valuesByActorField = new Map(
    actorFields.map((row) => [`${Number(row.actor)}\0${Number(row.field)}`, JSON.parse(row.valueJson) as unknown] as const),
  )
  const selectedStateByActor = new Map(actorStates.map((row) => [Number(row.actor), row.metaState] as const))

  const enumVariantsByField = new Map<number, unknown[]>()
  for (const variant of declarations.filter((item) => item.section === "variants")) {
    const fieldId = integer(variant.value.field)
    if (fieldId === null) continue
    const bucket = enumVariantsByField.get(fieldId)
    if (bucket) bucket.push(variant)
    else enumVariantsByField.set(fieldId, [variant])
  }
  for (const [fieldId, variants] of enumVariantsByField) {
    enumVariantsByField.set(
      fieldId,
      sortByPosition(variants as DeclarationRecord[]).map((variant) => clone(variant.value.itemValue)),
    )
  }

  const dataFields: MatrixFieldRecord[] = []
  const branes: MatrixInputBrane[] = []
  const stateNames: string[][] = []
  const actorIdByBraneIndex: number[] = []
  const braneIndexByActorId: Array<[number, number]> = []
  const wimpSrcByActorId: Array<[number, string]> = []
  const actorIdsByWimpSrc = new Map<string, number[]>()
  const runtimeFieldIndexByActorFieldId: Array<[number, number, number]> = []
  const runtimeFieldIndexByWimpFieldId: Array<[number, number]> = []
  const wimpFieldIdsByRuntimeFieldIndex: number[][] = []
  const braneIndexByWimpFieldId: Array<[number, number]> = []
  const topologyWimpFieldIds: number[] = []
  const topologyActorFieldIds: Array<[number, number]> = []
  const stateMetaStateIdsByBraneIndex: number[][] = []
  const stateHasProcessByBraneIndex: boolean[][] = []
  const runtimeFieldIndexByActorField = new Map<string, number>()

  for (let braneIndex = 0; braneIndex < actors.length; braneIndex++) {
    const actor = actors[braneIndex]!
    const fieldRecords = sortByPosition(
      declarationsByWimpSection.get(`${actor.wimp}\0fields`) ?? [],
    )
    const stateRecords = sortByPosition(
      declarationsByWimpSection.get(`${actor.wimp}\0states`) ?? [],
    )
    const transitionRecords = sortByPosition(
      declarationsByWimpSection.get(`${actor.wimp}\0transitions`) ?? [],
    )
    const conditionRecords = sortByPosition(
      declarationsByWimpSection.get(`${actor.wimp}\0conditions`) ?? [],
    )
    const processRecords = declarationsByWimpSection.get(`${actor.wimp}\0processes`) ?? []

    actorIdByBraneIndex.push(Number(actor.id))
    braneIndexByActorId.push([Number(actor.id), braneIndex])
    wimpSrcByActorId.push([Number(actor.id), actor.wimp])
    const actorIds = actorIdsByWimpSrc.get(actor.wimp)
    if (actorIds) actorIds.push(Number(actor.id))
    else actorIdsByWimpSrc.set(actor.wimp, [Number(actor.id)])

    const values: MatrixInputBrane["values"] = []
    for (const fieldRecord of fieldRecords) {
      const fieldId = integer(fieldRecord.value.id)
      if (fieldId === null) continue
      const runtimeFieldIndex = dataFields.length
      const variants = enumVariantsByField.get(fieldId) ?? []
      const value = valuesByActorField.get(`${actor.id}\0${fieldId}`)
      const wimpFieldId = fieldAddressId(Number(actor.id), fieldId)

      dataFields.push(matrixField(fieldRecord.value, variants))
      values.push([
        runtimeFieldIndex,
        clone(value === undefined ? fallbackFieldValue(fieldRecord.value, variants) : value),
      ])
      runtimeFieldIndexByActorField.set(`${actor.id}\0${fieldId}`, runtimeFieldIndex)
      runtimeFieldIndexByActorFieldId.push([Number(actor.id), fieldId, runtimeFieldIndex])
      runtimeFieldIndexByWimpFieldId.push([wimpFieldId, runtimeFieldIndex])
      wimpFieldIdsByRuntimeFieldIndex[runtimeFieldIndex] = [wimpFieldId]
      braneIndexByWimpFieldId.push([wimpFieldId, braneIndex])

      if (fieldRecord.value.type === "enum" || fieldRecord.value.type === "array") {
        topologyWimpFieldIds.push(wimpFieldId)
        topologyActorFieldIds.push([Number(actor.id), fieldId])
      }
    }

    const stateIndexById = new Map<number, number>()
    const stateNamesForActor: string[] = []
    const stateIdsForActor: number[] = []
    stateRecords.forEach((state, index) => {
      const stateId = integer(state.value.id)
      const name = text(state.value.name)
      if (stateId === null || name === null) return
      stateIndexById.set(stateId, index)
      stateIdsForActor[index] = stateId
      stateNamesForActor[index] = name
    })

    const selectedStateId = selectedStateByActor.get(Number(actor.id))
    const selectedState = stateRecords.length === 0
      ? STATE_NONE
      : selectedStateId === null || selectedStateId === undefined
        ? STATE_UNDEFINED
        : (stateIndexById.get(Number(selectedStateId)) ?? STATE_UNDEFINED)

    const processStateNames = new Set(
      processRecords
        .map((process) => text(process.value.state) ?? text(process.value.key) ?? process.localId)
        .filter((name): name is string => name.length > 0),
    )

    const conditionsByTransition = group(conditionRecords, (condition) => integer(condition.value.transition) ?? -1)
    const transitionsByState = group(transitionRecords, (transition) => integer(transition.value.fromState) ?? -1)
    const collapses: MatrixInputBrane["collapses"] = stateRecords.map((state) => {
      const stateId = integer(state.value.id)
      if (stateId === null) return []
      return (transitionsByState.get(stateId) ?? []).map((transition) => {
        const transitionId = integer(transition.value.id)
        const targetId = integer(transition.value.toState)
        if (transitionId === null || targetId === null) return null
        const targetState = stateIndexById.get(targetId)
        if (targetState === undefined) return null
        const transitionConditions: Record<number, MatrixConditionValue> = {}
        for (const condition of conditionsByTransition.get(transitionId) ?? []) {
          const fieldId = integer(condition.value.field)
          if (fieldId === null) continue
          const runtimeFieldIndex = runtimeFieldIndexByActorField.get(`${actor.id}\0${fieldId}`)
          if (runtimeFieldIndex === undefined) continue
          transitionConditions[runtimeFieldIndex] = predicateValue(condition.value)
        }
        return [targetState, transitionConditions]
      })
    })

    stateNames[braneIndex] = stateNamesForActor
    stateMetaStateIdsByBraneIndex[braneIndex] = stateIdsForActor
    stateHasProcessByBraneIndex[braneIndex] = stateNamesForActor.map((name) => processStateNames.has(name))
    branes.push({values, state: selectedState, collapses})
  }

  return {
    ok: true,
    version: 1,
    runtime: {
      actorIdByBraneIndex,
      braneIndexByActorId,
      wimpSrcByActorId,
      actorIdsByWimpSrc: [...actorIdsByWimpSrc.entries()].map(([src, actorIds]) => [src, [...actorIds]]),
      runtimeFieldIndexByActorFieldId,
    },
    data: {fields: dataFields, branes, stateNames},
    strong: {
      runtimeFieldIndexByWimpFieldId,
      wimpFieldIdsByRuntimeFieldIndex,
      braneIndexByWimpFieldId,
      topologyWimpFieldIds,
      topologyActorFieldIds,
    },
    weak: {
      stateMetaStateIdsByBraneIndex,
      stateHasProcessByBraneIndex,
    },
  }
}
