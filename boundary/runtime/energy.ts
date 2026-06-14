import type {SQL} from "bun"

type EnergyFieldType = 0 | 1 | 2 | 3 | 4

export type BoundaryEnergyRuntimeSnapshot = {
  version: 1
  wimpIds: string[]
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
    runtimeFieldIndexByWimpFieldId: Array<[string, number]>
    wimpFieldIdsByRuntimeFieldIndex: string[][]
    braneIndexByWimpFieldId: Array<[string, number]>
    topologyWimpFieldIds: string[]
  }
  weak: {
    stateMetaStateIdsByBraneIndex: string[][]
    stateProcessIdsByBraneIndex: Array<Array<string | null>>
  }
}

type ActorRow = {uuid: string; wimp: string; position: number}
type FieldRow = {
  uuid: string
  wimp: string
  key: string
  type: "string" | "number" | "boolean" | "array" | "enum"
  required: number
  label: string | null
}
type EnumVariantRow = {uuid: string; field: string; position: number; itemValue: string}
type StateRow = {uuid: string; wimp: string; name: string; position: number}
type TransitionRow = {uuid: string; fromState: string; toState: string; position: number}
type ConditionRow = {uuid: string; transition: string; field: string; position: number}
type PredicateRow = {
  uuid: string
  condition: string
  predicateOrder: number
  subjectKind: "value" | "length"
  operator: string
  valueKind: "null" | "boolean" | "number" | "string" | "enum" | "list"
  valueBoolean: number | null
  valueNumber: number | null
  valueText: string | null
  valueVariant: string | null
}
type PredicateListItemRow = {
  predicate: string
  itemOrder: number
  valueKind: "null" | "boolean" | "number" | "string" | "enum"
  valueBoolean: number | null
  valueNumber: number | null
  valueText: string | null
  valueVariant: string | null
}
type ProcessRow = {uuid: string; wimp: string; key: string}
type ActorValueRow = {actor: string; field: string; value: string}
type ActorStateRow = {actor: string; metaState: string | null}
type ValueRow = {
  uuid: string
  kind: "null" | "boolean" | "number" | "string" | "enum" | "list"
  booleanValue: number | null
  numberValue: number | null
  textValue: string | null
  variant: string | null
  enumValue: string | null
}
type ValueListItemRow = {value: string; position: number; itemValue: string}

const fieldType = {
  F32: 0,
  U32: 1,
  BOOL: 2,
  STRING_PTR: 3,
  ARRAY_PTR: 4,
} as const

const group = <T, K extends string>(rows: T[], key: (row: T) => K): Map<K, T[]> => {
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
  const actors = await sql<ActorRow[]>`SELECT uuid, wimp, position FROM actor ORDER BY rowid`
  const fields = await sql<FieldRow[]>`SELECT uuid, wimp, key, type, required, label FROM field ORDER BY wimp, rowid`
  const enumVariants = await sql<EnumVariantRow[]>`
    SELECT uuid, field, position, item_value AS itemValue FROM field_enum_variant ORDER BY field, position
  `
  const states = await sql<StateRow[]>`SELECT uuid, wimp, name, position FROM state ORDER BY wimp, position`
  const transitions = await sql<TransitionRow[]>`
    SELECT uuid, from_state AS fromState, to_state AS toState, position FROM transition ORDER BY from_state, position
  `
  const conditions = await sql<ConditionRow[]>`
    SELECT uuid, transition, field, position FROM condition ORDER BY transition, position
  `
  const predicates = await sql<PredicateRow[]>`
    SELECT uuid, condition, predicate_order AS predicateOrder, subject_kind AS subjectKind, operator,
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
  const processes = await sql<ProcessRow[]>`SELECT uuid, wimp, key FROM process ORDER BY wimp, rowid`
  const actorValues = await sql<ActorValueRow[]>`SELECT actor, field, value FROM actor_value ORDER BY actor, field`
  const actorStates = await sql<ActorStateRow[]>`SELECT actor, metaState FROM actor_state ORDER BY actor`
  const valueRows = await sql<ValueRow[]>`
    SELECT value.uuid, value.kind,
           value_boolean.boolean AS booleanValue,
           value_number.number AS numberValue,
           value_string.text AS textValue,
           value_enum.variant AS variant,
           field_enum_variant.item_value AS enumValue
      FROM value
      LEFT JOIN value_boolean ON value_boolean.value = value.uuid
      LEFT JOIN value_number ON value_number.value = value.uuid
      LEFT JOIN value_string ON value_string.value = value.uuid
      LEFT JOIN value_enum ON value_enum.value = value.uuid
      LEFT JOIN field_enum_variant ON field_enum_variant.uuid = value_enum.variant
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
  const processByWimpKey = new Map(processes.map((row) => [`${row.wimp}\0${row.key}`, row.uuid] as const))
  const valueById = new Map(valueRows.map((row) => [row.uuid, row] as const))
  const valueItemsByValue = group(valueListItems, (item) => item.value)
  const enumValueByVariantId = new Map(enumVariants.map((variant) => [variant.uuid, variant.itemValue] as const))

  const decodeScalar = (row: Pick<PredicateRow, "valueKind" | "valueBoolean" | "valueNumber" | "valueText" | "valueVariant">): string | number | boolean | null => {
    if (row.valueKind === "boolean") return row.valueBoolean === 1
    if (row.valueKind === "number") return row.valueNumber ?? 0
    if (row.valueKind === "string") return row.valueText ?? ""
    if (row.valueKind === "enum") return row.valueVariant ? (enumValueByVariantId.get(row.valueVariant) ?? "") : ""
    return null
  }
  const decodeValue = (valueId: string | undefined, field: FieldRow): unknown => {
    const row = valueId === undefined ? undefined : valueById.get(valueId)
    if (!row) {
      if (field.type === "number") return 0
      if (field.type === "boolean") return false
      if (field.type === "array") return []
      if (field.type === "enum") return variantsByField.get(field.uuid)?.[0]?.itemValue ?? null
      return ""
    }
    if (row.kind === "boolean") return row.booleanValue === 1
    if (row.kind === "number") return row.numberValue ?? 0
    if (row.kind === "string") return row.textValue ?? ""
    if (row.kind === "enum") return row.enumValue ?? ""
    if (row.kind === "list") return (valueItemsByValue.get(row.uuid) ?? []).map((item) => item.itemValue)
    return null
  }
  const energyField = (field: FieldRow): {type: EnergyFieldType; elementType?: "string"; enum?: unknown[]} => {
    if (field.type === "number") return {type: fieldType.F32}
    if (field.type === "boolean") return {type: fieldType.BOOL}
    if (field.type === "array") return {type: fieldType.ARRAY_PTR, elementType: "string"}
    if (field.type === "enum") {
      return {type: fieldType.U32, enum: (variantsByField.get(field.uuid) ?? []).map((variant) => variant.itemValue)}
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
    return (predicateItemsByPredicate.get(predicate.uuid) ?? []).map(decodeScalar)
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
  const wimpIds: string[] = []
  const runtimeFieldIndexByWimpFieldId: Array<[string, number]> = []
  const braneIndexByWimpFieldId: Array<[string, number]> = []
  const wimpFieldIdsByRuntimeFieldIndex: string[][] = []
  const stateMetaStateIdsByBraneIndex: string[][] = []
  const stateProcessIdsByBraneIndex: Array<Array<string | null>> = []
  const runtimeFieldIndexByActorField = new Map<string, number>()

  actors.forEach((actor, braneIndex) => {
    const actorFields = fieldsByWimp.get(actor.wimp) ?? []
    const values: Array<[number, unknown]> = []
    wimpIds.push(actor.uuid)

    for (const field of actorFields) {
      const runtimeFieldIndex = dataFields.length
      const wimpFieldId = `${actor.uuid}:${field.uuid}`
      dataFields.push(energyField(field))
      values.push([runtimeFieldIndex, decodeValue(actorValueByActorField.get(`${actor.uuid}\0${field.uuid}`), field)])
      runtimeFieldIndexByActorField.set(`${actor.uuid}\0${field.uuid}`, runtimeFieldIndex)
      runtimeFieldIndexByWimpFieldId.push([wimpFieldId, runtimeFieldIndex])
      braneIndexByWimpFieldId.push([wimpFieldId, braneIndex])
      wimpFieldIdsByRuntimeFieldIndex[runtimeFieldIndex] = [wimpFieldId]
    }

    const actorStatesForWimp = statesByWimp.get(actor.wimp) ?? [{uuid: `${actor.wimp}:default`, wimp: actor.wimp, name: "default", position: 0}]
    const stateIndexById = new Map(actorStatesForWimp.map((state, index) => [state.uuid, index] as const))
    const selectedStateId = actorStateByActor.get(actor.uuid)
    const selectedState = selectedStateId === null || selectedStateId === undefined ? 0 : (stateIndexById.get(selectedStateId) ?? 0)
    stateNames[braneIndex] = actorStatesForWimp.map((state) => state.name)
    stateMetaStateIdsByBraneIndex[braneIndex] = actorStatesForWimp.map((state) => state.uuid)
    stateProcessIdsByBraneIndex[braneIndex] = actorStatesForWimp.map((state) => processByWimpKey.get(`${actor.wimp}\0${state.name}`) ?? null)

    const collapses = actorStatesForWimp.map((state) =>
      (transitionsByState.get(state.uuid) ?? []).map((transition) => {
        const targetState = stateIndexById.get(transition.toState)
        if (targetState === undefined) return null
        const transitionConditions: Record<number, unknown> = {}
        for (const condition of conditionsByTransition.get(transition.uuid) ?? []) {
          const runtimeFieldIndex = runtimeFieldIndexByActorField.get(`${actor.uuid}\0${condition.field}`)
          if (runtimeFieldIndex === undefined) continue
          const fieldCondition: Record<string, unknown> = {}
          for (const predicate of predicatesByCondition.get(condition.uuid) ?? []) mergePredicate(fieldCondition, predicate)
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
    data: {fields: dataFields, branes, stateNames},
    strong: {
      runtimeFieldIndexByWimpFieldId,
      wimpFieldIdsByRuntimeFieldIndex,
      braneIndexByWimpFieldId,
      topologyWimpFieldIds: [],
    },
    weak: {
      stateMetaStateIdsByBraneIndex,
      stateProcessIdsByBraneIndex,
    },
  }
}
