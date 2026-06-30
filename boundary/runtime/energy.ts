import type {SQL} from "bun"

type EnergyFieldType = 0 | 1 | 2 | 3 | 4

export type BoundaryEnergyRuntimeSnapshot = {
  version: 1
  /** @deprecated Actor IDs kept only for legacy process result addressing. */
  wimpIds: number[]
  /** Actor IDs kept only for legacy process result addressing. */
  legacyProcessActorIds: number[]
  runtime: {
    actorIdByBraneIndex: number[]
    braneIndexByActorId: Array<[actorId: number, braneIndex: number]>
    wimpSrcByActorId: Array<[actorId: number, wimpSrc: string]>
    actorIdsByWimpSrc: Array<[wimpSrc: string, actorIds: number[]]>
    runtimeFieldIndexByActorFieldId: Array<[actorId: number, fieldId: number, runtimeFieldIndex: number]>
  }
  data: {
    fields: Array<{type: EnergyFieldType; elementType?: "string"; enum?: unknown[]}>
    branes: Array<{
      values: Array<[number, unknown]>
      state: number
      collapses: Array<Array<[number, Record<number, unknown>] | null>>
    }>
    stateNames: string[][]
  }
  strong: {
    runtimeFieldIndexByWimpFieldId: Array<[number, number]>
    wimpFieldIdsByRuntimeFieldIndex: number[][]
    braneIndexByWimpFieldId: Array<[number, number]>
    topologyWimpFieldIds: number[]
    topologyActorFieldIds: Array<[actorId: number, fieldId: number]>
  }
  weak: {
    stateMetaStateIdsByBraneIndex: number[][]
    stateProcessIdsByBraneIndex: Array<Array<number | null>>
  }
}

type ActorRow = {id: number; wimp: string; position: number}
type FieldRow = {
  id: number
  wimp: string
  key: string
  type: "string" | "number" | "boolean" | "array" | "enum"
  required: number
  label: string | null
}
type EnumVariantRow = {id: number; field: number; position: number; itemValue: string}
type StateRow = {id: number; wimp: string; name: string; position: number}
type TransitionRow = {id: number; fromState: number; toState: number; position: number}
type ConditionRow = {id: number; transition: number; field: number; position: number}
type PredicateRow = {
  id: number
  condition: number
  predicateOrder: number
  subjectKind: "value" | "length"
  operator: string
  valueKind: "null" | "boolean" | "number" | "string" | "enum" | "list"
  valueBoolean: number | null
  valueNumber: number | null
  valueText: string | null
  valueVariant: number | null
}
type PredicateListItemRow = {
  predicate: number
  itemOrder: number
  valueKind: "null" | "boolean" | "number" | "string" | "enum"
  valueBoolean: number | null
  valueNumber: number | null
  valueText: string | null
  valueVariant: number | null
}
type ProcessRow = {id: number; wimp: string; key: string}
type ActorValueRow = {actor: number; field: number; value: number}
type ActorStateRow = {actor: number; metaState: number | null}
type ValueRow = {
  id: number
  kind: "null" | "boolean" | "number" | "string" | "enum" | "list"
  booleanValue: number | null
  numberValue: number | null
  textValue: string | null
  variant: number | null
  enumValue: string | null
}
type ValueListItemRow = {value: number; position: number; itemValue: string}

const fieldType = {
  F32: 0,
  U32: 1,
  BOOL: 2,
  STRING_PTR: 3,
  ARRAY_PTR: 4,
} as const

const fieldAddressId = (actorId: number, fieldId: number): number => {
  const sum = actorId + fieldId
  const id = (sum * (sum + 1)) / 2 + fieldId
  if (!Number.isSafeInteger(id)) {
    throw new Error(`Energy field address id is not safe: actor=${actorId} field=${fieldId}`)
  }
  return id
}

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

export async function energyRuntime(sql: SQL): Promise<BoundaryEnergyRuntimeSnapshot> {
  const actors = await sql<ActorRow[]>`SELECT id, wimp, position FROM actor ORDER BY rowid`
  const fields = await sql<FieldRow[]>`SELECT id, wimp, key, type, required, label FROM field ORDER BY wimp, rowid`
  const enumVariants = await sql<EnumVariantRow[]>`
    SELECT id, field, position, item_value AS itemValue FROM field_enum_variant ORDER BY field, position
  `
  const states = await sql<StateRow[]>`SELECT id, wimp, name, position FROM state ORDER BY wimp, position`
  const transitions = await sql<TransitionRow[]>`
    SELECT id, from_state AS fromState, to_state AS toState, position FROM transition ORDER BY from_state, position
  `
  const conditions = await sql<ConditionRow[]>`
    SELECT id, transition, field, position FROM condition ORDER BY transition, position
  `
  const predicates = await sql<PredicateRow[]>`
    SELECT id, condition, predicate_order AS predicateOrder, subject_kind AS subjectKind, operator,
           value_kind AS valueKind, value_boolean AS valueBoolean, value_number AS valueNumber,
           value_text AS valueText, value_variant AS valueVariant
      FROM condition_predicate
     ORDER BY condition, predicate_order
  `
  const predicateListItems = await sql<PredicateListItemRow[]>`
    SELECT predicate, item_order AS itemOrder, value_kind AS valueKind,
           value_boolean AS valueBoolean, value_number AS valueNumber,
           value_text AS valueText, value_variant AS valueVariant
      FROM condition_list_item
     ORDER BY predicate, item_order
  `
  const processes = await sql<ProcessRow[]>`SELECT id, wimp, key FROM process ORDER BY wimp, rowid`
  const actorValues = await sql<ActorValueRow[]>`SELECT actor, field, value FROM actor_value ORDER BY actor, field`
  const actorStates = await sql<ActorStateRow[]>`SELECT actor, metaState FROM actor_state ORDER BY actor`
  const valueRows = await sql<ValueRow[]>`
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
  const valueListItems = await sql<ValueListItemRow[]>`
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
  const processByWimpKey = new Map(processes.map((row) => [`${row.wimp}\0${row.key}`, row.id] as const))
  const valueById = new Map(valueRows.map((row) => [row.id, row] as const))
  const valueItemsByValue = group(valueListItems, (item) => item.value)
  const enumValueByVariantId = new Map(enumVariants.map((variant) => [variant.id, variant.itemValue] as const))

  const decodeScalar = (row: Pick<PredicateRow, "valueKind" | "valueBoolean" | "valueNumber" | "valueText" | "valueVariant">): string | number | boolean | null => {
    if (row.valueKind === "boolean") return row.valueBoolean === 1
    if (row.valueKind === "number") return row.valueNumber ?? 0
    if (row.valueKind === "string") return row.valueText ?? ""
    if (row.valueKind === "enum") return row.valueVariant ? (enumValueByVariantId.get(row.valueVariant) ?? "") : ""
    return null
  }
  const decodeValue = (valueId: number | undefined, field: FieldRow): unknown => {
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
  const energyField = (field: FieldRow): {type: EnergyFieldType; elementType?: "string"; enum?: unknown[]} => {
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
  const predicateValue = (predicate: PredicateRow): unknown => {
    if (predicate.valueKind !== "list") return decodeScalar(predicate)
    return (predicateItemsByPredicate.get(predicate.id) ?? []).map(decodeScalar)
  }
  const mergePredicate = (target: Record<string, unknown>, predicate: PredicateRow): void => {
    const value = predicateValue(predicate)
    const key = operatorKey(predicate.operator)
    if (predicate.subjectKind === "length") {
      if (key === "eq") target.length = value
      else target.length = {...(typeof target.length === "object" && target.length !== null ? target.length : {}), [key]: value}
      return
    }
    if (predicate.valueKind === "null" && (predicate.operator === "eq" || predicate.operator === "neq")) {
      target.null = predicate.operator === "eq"
      return
    }
    target[key] = value
  }

  const dataFields: BoundaryEnergyRuntimeSnapshot["data"]["fields"] = []
  const branes: BoundaryEnergyRuntimeSnapshot["data"]["branes"] = []
  const stateNames: string[][] = []
  const wimpIds: number[] = []
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
  const stateProcessIdsByBraneIndex: Array<Array<number | null>> = []
  const runtimeFieldIndexByActorField = new Map<string, number>()

  actors.forEach((actor, braneIndex) => {
    const actorFields = fieldsByWimp.get(actor.wimp) ?? []
    const values: Array<[number, unknown]> = []
    wimpIds.push(actor.id)
    actorIdByBraneIndex[braneIndex] = actor.id
    braneIndexByActorId.push([actor.id, braneIndex])
    wimpSrcByActorId.push([actor.id, actor.wimp])
    const actorIdsForWimp = actorIdsByWimpSrc.get(actor.wimp)
    if (actorIdsForWimp) actorIdsForWimp.push(actor.id)
    else actorIdsByWimpSrc.set(actor.wimp, [actor.id])

    for (const field of actorFields) {
      const runtimeFieldIndex = dataFields.length
      const wimpFieldId = fieldAddressId(actor.id, field.id)
      dataFields.push(energyField(field))
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

    const actorStatesForWimp = statesByWimp.get(actor.wimp) ?? [{id: 0, wimp: actor.wimp, name: "default", position: 0}]
    const stateIndexById = new Map(actorStatesForWimp.map((state, index) => [state.id, index] as const))
    const selectedStateId = actorStateByActor.get(actor.id)
    const selectedState = selectedStateId === null || selectedStateId === undefined ? 0 : (stateIndexById.get(selectedStateId) ?? 0)
    stateNames[braneIndex] = actorStatesForWimp.map((state) => state.name)
    stateMetaStateIdsByBraneIndex[braneIndex] = actorStatesForWimp.map((state) => state.id)
    stateProcessIdsByBraneIndex[braneIndex] = actorStatesForWimp.map((state) => processByWimpKey.get(`${actor.wimp}\0${state.name}`) ?? null)

    const collapses = actorStatesForWimp.map((state) =>
      (transitionsByState.get(state.id) ?? []).map((transition) => {
        const targetState = stateIndexById.get(transition.toState)
        if (targetState === undefined) return null
        const transitionConditions: Record<number, unknown> = {}
        for (const condition of conditionsByTransition.get(transition.id) ?? []) {
          const runtimeFieldIndex = runtimeFieldIndexByActorField.get(`${actor.id}\0${condition.field}`)
          if (runtimeFieldIndex === undefined) continue
          const fieldCondition: Record<string, unknown> = {}
          for (const predicate of predicatesByCondition.get(condition.id) ?? []) mergePredicate(fieldCondition, predicate)
          transitionConditions[runtimeFieldIndex] = Object.keys(fieldCondition).length === 1 && "eq" in fieldCondition
            ? fieldCondition.eq
            : fieldCondition
        }
        return [targetState, transitionConditions] as [number, Record<number, unknown>]
      }),
    )

    branes.push({values, state: selectedState, collapses})
  })

  return {
    version: 1,
    wimpIds,
    legacyProcessActorIds: [...wimpIds],
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
      stateProcessIdsByBraneIndex,
    },
  }
}
