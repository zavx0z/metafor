import type {SQL} from "bun"
import type { MatrixBraneValue, MatrixCollapse } from "@metafor/types/matrix/data"
import type { MatrixConditionScalarValue, MatrixConditionValue } from "@metafor/types/matrix/condition"
import type { MatrixRuntimeSnapshot } from "@metafor/types/matrix/runtime"
import type { ActorStateRecord, ActorValueRecord, FieldEnumVariantRecord, ValueItemRecord } from "@metafor/types/boundary/value"
import type {
  BoundaryMatrixActorRow,
  BoundaryMatrixConditionRow,
  BoundaryMatrixFieldRow,
  BoundaryMatrixPredicateListItemRow,
  BoundaryMatrixPredicateRow,
  BoundaryMatrixProcessRow,
  BoundaryMatrixStateRow,
  BoundaryMatrixTransitionRow,
  BoundaryMatrixValueRow,
} from "@metafor/types/boundary/runtime"
import {STATE_NONE, STATE_UNDEFINED} from "@metafor/types/matrix/runtime"

const fieldType = {
  F32: 0,
  U32: 1,
  BOOL: 2,
  STRING_PTR: 3,
  ARRAY_PTR: 4,
} as const

const group = <T, K extends string | number>(rows: T[], key: (row: T) => K): Map<K, T[]> => {
  const map = new Map<K, T[]>()
  for (const row of rows) {
    const groupKey = key(row)
    const bucket = map.get(groupKey)
    if (bucket) bucket.push(row)
    else map.set(groupKey, [row])
  }
  return map
}

export async function matrixRuntime(sql: SQL): Promise<MatrixRuntimeSnapshot> {
  const actors = await sql<BoundaryMatrixActorRow[]>`SELECT id, wimp, position FROM actor ORDER BY rowid`
  const fields = await sql<BoundaryMatrixFieldRow[]>`SELECT id, wimp, key, type, required, label FROM field ORDER BY wimp, rowid`
  const enumVariants = await sql<FieldEnumVariantRecord[]>`
    SELECT id, field, position, item_value AS itemValue FROM field_enum_variant ORDER BY field, position
  `
  const states = await sql<BoundaryMatrixStateRow[]>`SELECT id, wimp, name, position FROM state ORDER BY wimp, position`
  const transitions = await sql<BoundaryMatrixTransitionRow[]>`
    SELECT id, from_state AS fromState, to_state AS toState, position FROM transition ORDER BY from_state, position
  `
  const conditions = await sql<BoundaryMatrixConditionRow[]>`
    SELECT id, transition, field, position FROM condition ORDER BY transition, position
  `
  const predicates = await sql<BoundaryMatrixPredicateRow[]>`
    SELECT id, condition, predicate_order AS predicateOrder, subject_kind AS subjectKind, operator,
           value_kind AS valueKind, value_boolean AS valueBoolean, value_number AS valueNumber,
           value_text AS valueText, value_variant AS valueVariant
      FROM condition_predicate
     ORDER BY condition, predicate_order
  `
  const predicateListItems = await sql<BoundaryMatrixPredicateListItemRow[]>`
    SELECT predicate, item_order AS itemOrder, value_kind AS valueKind,
           value_boolean AS valueBoolean, value_number AS valueNumber,
           value_text AS valueText, value_variant AS valueVariant
      FROM condition_list_item
     ORDER BY predicate, item_order
  `
  const processes = await sql<BoundaryMatrixProcessRow[]>`SELECT wimp, key FROM process ORDER BY wimp, rowid`
  const actorValues = await sql<ActorValueRecord[]>`SELECT actor, field, value FROM actor_value ORDER BY actor, field`
  const actorStates = await sql<ActorStateRecord[]>`SELECT actor, metaState FROM actor_state ORDER BY actor`
  const valueRows = await sql<BoundaryMatrixValueRow[]>`
    SELECT value.id, value.kind,
           value_boolean.boolean AS booleanValue,
           value_number.number AS numberValue,
           value_string.text AS textValue,
           value_enum.variant AS variant,
           field_enum_variant.item_value AS enumValue
      FROM value
      LEFT JOIN value_boolean ON value_boolean.value = value.id
      LEFT JOIN value_number ON value_number.value = value.id
      LEFT JOIN value_string ON value_string.value = value.id
      LEFT JOIN value_enum ON value_enum.value = value.id
      LEFT JOIN field_enum_variant ON field_enum_variant.id = value_enum.variant
     ORDER BY value.rowid
  `
  const valueListItems = await sql<ValueItemRecord[]>`
    SELECT value, position, item_value AS itemValue FROM value_list_item ORDER BY value, position
  `

  const fieldsByWimp = group(fields, (field) => field.wimp)
  const variantsByField = group(enumVariants, (variant) => variant.field)
  const statesByWimp = group(states, (state) => state.wimp)
  const transitionsByState = group(transitions, (transition) => transition.fromState)
  const conditionsByTransition = group(conditions, (condition) => condition.transition)
  const predicatesByCondition = group(predicates, (predicate) => predicate.condition)
  const predicateItemsByPredicate = group(predicateListItems, (item) => item.predicate)
  const actorValueByActorField = new Map(actorValues.map((row) => [`${row.actor}\0${row.field}`, row.value] as const))
  const actorStateByActor = new Map(actorStates.map((row) => [row.actor, row.metaState] as const))
  const processKeys = new Set(processes.map((row) => `${row.wimp}\0${row.key}`))
  const valueById = new Map(valueRows.map((row) => [row.id, row] as const))
  const valueItemsByValue = group(valueListItems, (item) => item.value)
  const enumValueByVariantId = new Map(enumVariants.map((variant) => [variant.id, variant.itemValue] as const))

  const decodeScalar = (
    row: Pick<BoundaryMatrixPredicateRow, "valueKind" | "valueBoolean" | "valueNumber" | "valueText" | "valueVariant">,
  ): MatrixConditionScalarValue => {
    if (row.valueKind === "boolean") return row.valueBoolean === 1
    if (row.valueKind === "number") return row.valueNumber ?? 0
    if (row.valueKind === "string") return row.valueText ?? ""
    if (row.valueKind === "enum") return row.valueVariant ? (enumValueByVariantId.get(row.valueVariant) ?? "") : ""
    return null
  }
  const decodeValue = (valueId: number | undefined, field: BoundaryMatrixFieldRow): MatrixBraneValue => {
    const row = valueId === undefined ? undefined : valueById.get(valueId)
    if (!row) {
      if (field.type === "number") return 0
      if (field.type === "boolean") return false
      if (field.type === "array") return []
      if (field.type === "enum") return variantsByField.get(field.id)?.[0]?.itemValue ?? null
      return ""
    }
    if (row.kind === "boolean") return row.booleanValue === 1
    if (row.kind === "number") return row.numberValue ?? 0
    if (row.kind === "string") return row.textValue ?? ""
    if (row.kind === "enum") return row.enumValue ?? ""
    if (row.kind === "list") return (valueItemsByValue.get(row.id) ?? []).map((item) => item.itemValue)
    return null
  }
  const matrixField = (field: BoundaryMatrixFieldRow): MatrixRuntimeSnapshot["data"]["fields"][number] => {
    if (field.type === "number") return {type: fieldType.F32}
    if (field.type === "boolean") return {type: fieldType.BOOL}
    if (field.type === "array") return {type: fieldType.ARRAY_PTR, elementType: "string"}
    if (field.type === "enum") {
      return {type: fieldType.U32, enum: (variantsByField.get(field.id) ?? []).map((variant) => variant.itemValue)}
    }
    return {type: fieldType.STRING_PTR}
  }
  const operatorKey = (operator: string): string => {
    if (operator === "not_in") return "notIn"
    if (operator === "not_include") return "notInclude"
    if (operator === "is_empty") return "isEmpty"
    return operator
  }
  const predicateValue = (predicate: BoundaryMatrixPredicateRow): MatrixConditionScalarValue | MatrixConditionScalarValue[] => {
    if (predicate.valueKind !== "list") return decodeScalar(predicate)
    return (predicateItemsByPredicate.get(predicate.id) ?? []).map(decodeScalar)
  }
  const mergePredicate = (target: Record<string, MatrixConditionValue>, predicate: BoundaryMatrixPredicateRow): void => {
    const value = predicateValue(predicate)
    const key = operatorKey(predicate.operator)
    if (predicate.subjectKind === "length") {
      if (key === "eq") target.length = value
      else {
        const lengthTarget = typeof target.length === "object" && target.length !== null && !Array.isArray(target.length)
          ? target.length
          : {}
        target.length = {...lengthTarget, [key]: value}
      }
      return
    }
    if (predicate.valueKind === "null" && (predicate.operator === "eq" || predicate.operator === "neq")) {
      target.null = predicate.operator === "eq"
      return
    }
    target[key] = value
  }

  const dataFields: MatrixRuntimeSnapshot["data"]["fields"] = []
  const branes: MatrixRuntimeSnapshot["data"]["branes"] = []
  const stateNames: string[][] = []
  const actorIdByBraneIndex: number[] = []
  const braneIndexByActorId: Array<[actorId: number, braneIndex: number]> = []
  const wimpSrcByActorId: Array<[actorId: number, wimpSrc: string]> = []
  const actorIdsByWimpSrc = new Map<string, number[]>()
  const runtimeFieldIndexByActorFieldId: Array<[actorId: number, fieldId: number, runtimeFieldIndex: number]> = []
  const runtimeFieldIndexByWimpFieldId: Array<[number, number]> = []
  const braneIndexByWimpFieldId: Array<[number, number]> = []
  const wimpFieldIdsByRuntimeFieldIndex: number[][] = []
  const topologyWimpFieldIds: number[] = []
  const topologyActorFieldIds: Array<[actorId: number, fieldId: number]> = []
  const stateMetaStateIdsByBraneIndex: number[][] = []
  const stateHasProcessByBraneIndex: boolean[][] = []
  const runtimeFieldIndexByActorField = new Map<string, number>()

  actors.forEach((actor, braneIndex) => {
    const actorFields = fieldsByWimp.get(actor.wimp) ?? []
    const values: MatrixRuntimeSnapshot["data"]["branes"][number]["values"] = []
    actorIdByBraneIndex[braneIndex] = actor.id
    braneIndexByActorId.push([actor.id, braneIndex])
    wimpSrcByActorId.push([actor.id, actor.wimp])
    const actorIdsForWimp = actorIdsByWimpSrc.get(actor.wimp)
    if (actorIdsForWimp) actorIdsForWimp.push(actor.id)
    else actorIdsByWimpSrc.set(actor.wimp, [actor.id])

    for (const field of actorFields) {
      const runtimeFieldIndex = dataFields.length
      const wimpFieldId = runtimeFieldIndex
      dataFields.push(matrixField(field))
      values.push([runtimeFieldIndex, decodeValue(actorValueByActorField.get(`${actor.id}\0${field.id}`), field)])
      runtimeFieldIndexByActorField.set(`${actor.id}\0${field.id}`, runtimeFieldIndex)
      runtimeFieldIndexByActorFieldId.push([actor.id, field.id, runtimeFieldIndex])
      runtimeFieldIndexByWimpFieldId.push([wimpFieldId, runtimeFieldIndex])
      braneIndexByWimpFieldId.push([wimpFieldId, braneIndex])
      wimpFieldIdsByRuntimeFieldIndex[runtimeFieldIndex] = [wimpFieldId]
      if (field.type === "enum" || field.type === "array") {
        topologyWimpFieldIds.push(wimpFieldId)
        topologyActorFieldIds.push([actor.id, field.id])
      }
    }

    const actorStatesForWimp = statesByWimp.get(actor.wimp) ?? []
    const stateIndexById = new Map(actorStatesForWimp.map((state, index) => [state.id, index] as const))
    const selectedStateId = actorStateByActor.get(actor.id)
    const selectedState = actorStatesForWimp.length === 0
      ? STATE_NONE
      : selectedStateId === null || selectedStateId === undefined
        ? STATE_UNDEFINED
        : (stateIndexById.get(selectedStateId) ?? STATE_UNDEFINED)
    stateNames[braneIndex] = actorStatesForWimp.map((state) => state.name)
    stateMetaStateIdsByBraneIndex[braneIndex] = actorStatesForWimp.map((state) => state.id)
    stateHasProcessByBraneIndex[braneIndex] = actorStatesForWimp.map((state) => processKeys.has(`${actor.wimp}\0${state.name}`))

    const collapses = actorStatesForWimp.map((state) =>
      (transitionsByState.get(state.id) ?? []).map((transition): MatrixCollapse => {
        const targetState = stateIndexById.get(transition.toState)
        if (targetState === undefined) return null
        const transitionConditions: Record<number, MatrixConditionValue> = {}
        for (const condition of conditionsByTransition.get(transition.id) ?? []) {
          const runtimeFieldIndex = runtimeFieldIndexByActorField.get(`${actor.id}\0${condition.field}`)
          if (runtimeFieldIndex === undefined) continue
          const fieldCondition: Record<string, MatrixConditionValue> = {}
          for (const predicate of predicatesByCondition.get(condition.id) ?? []) mergePredicate(fieldCondition, predicate)
          const normalizedCondition = Object.keys(fieldCondition).length === 1 && "eq" in fieldCondition
            ? fieldCondition.eq
            : fieldCondition
          if (normalizedCondition !== undefined) transitionConditions[runtimeFieldIndex] = normalizedCondition
        }
        return [targetState, transitionConditions]
      }),
    )

    branes.push({values, state: selectedState, collapses})
  })

  return {
    version: 1,
    runtime: {
      actorIdByBraneIndex,
      braneIndexByActorId,
      wimpSrcByActorId,
      actorIdsByWimpSrc: [...actorIdsByWimpSrc.entries()].map(([wimpSrc, actorIds]): [string, number[]] => [
        wimpSrc,
        [...actorIds],
      ]),
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
