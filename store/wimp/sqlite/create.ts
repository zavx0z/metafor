import type {WimpCreateFieldInput, WimpCreateInput, WimpCreateProcessInput, WimpCreateReactionInput, WimpCreateStateInput} from "./create.t.ts"

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

type SqlValue = string | number | null

type CreateRows = {
  mass: SqlValue[][]
  fields: SqlValue[][]
  fieldDefaults: SqlValue[][]
  fieldStringDefaults: SqlValue[][]
  fieldNumberDefaults: SqlValue[][]
  fieldBooleanDefaults: SqlValue[][]
  fieldArrayDefaultItems: SqlValue[][]
  fieldEnumVariants: SqlValue[][]
  fieldEnumDefaults: SqlValue[][]
  states: SqlValue[][]
  transitions: SqlValue[][]
  conditions: SqlValue[][]
  conditionPredicates: SqlValue[][]
  conditionListItems: SqlValue[][]
  processes: SqlValue[][]
  processEnv: SqlValue[][]
  processActions: SqlValue[][]
  processFinally: SqlValue[][]
  processActionRead: SqlValue[][]
  processActionWrite: SqlValue[][]
  processFinallyRead: SqlValue[][]
  reactions: SqlValue[][]
  reactionStates: SqlValue[][]
  reactionRead: SqlValue[][]
  reactionWrite: SqlValue[][]
}

const createRows = (): CreateRows => ({
  mass: [],
  fields: [],
  fieldDefaults: [],
  fieldStringDefaults: [],
  fieldNumberDefaults: [],
  fieldBooleanDefaults: [],
  fieldArrayDefaultItems: [],
  fieldEnumVariants: [],
  fieldEnumDefaults: [],
  states: [],
  transitions: [],
  conditions: [],
  conditionPredicates: [],
  conditionListItems: [],
  processes: [],
  processEnv: [],
  processActions: [],
  processFinally: [],
  processActionRead: [],
  processActionWrite: [],
  processFinallyRead: [],
  reactions: [],
  reactionStates: [],
  reactionRead: [],
  reactionWrite: [],
})

const sqlValue = (value: SqlValue): string => {
  if (value === null) return "NULL"
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`Cannot encode non-finite SQL number: ${value}`)
    return String(value)
  }
  return `'${value.replaceAll("'", "''")}'`
}

const insertRowsSql = (
  table: string,
  columns: readonly string[],
  rows: readonly (readonly SqlValue[])[],
  options: {orIgnore?: boolean} = {},
): string | null => {
  if (rows.length === 0) return null

  const values = rows
    .map((row) => `(${row.map(sqlValue).join(", ")})`)
    .join(",\n")
  return `INSERT${options.orIgnore ? " OR IGNORE" : ""} INTO ${table} (${columns.join(", ")})\nVALUES\n${values};`
}

const pushMassRows = (
  rows: CreateRows,
  src: string,
  value: unknown,
  parentValue: string | null,
  entryKey: string | null,
  entryOrder: number | null,
): string => {
  const uuid = crypto.randomUUID()

  if (Array.isArray(value)) {
    rows.mass.push([uuid, src, parentValue, "array", entryKey, entryOrder, null, null, null])
    for (let index = 0; index < value.length; index++) {
      pushMassRows(rows, src, value[index], uuid, null, index)
    }
    return uuid
  }

  if (isRecord(value)) {
    rows.mass.push([uuid, src, parentValue, "object", entryKey, entryOrder, null, null, null])
    for (const [childKey, childValue] of Object.entries(value)) {
      pushMassRows(rows, src, childValue, uuid, childKey, null)
    }
    return uuid
  }

  if (typeof value === "string") {
    rows.mass.push([uuid, src, parentValue, "string", entryKey, entryOrder, value, null, null])
    return uuid
  }

  if (typeof value === "number") {
    rows.mass.push([uuid, src, parentValue, "number", entryKey, entryOrder, null, value, null])
    return uuid
  }

  if (typeof value === "boolean") {
    rows.mass.push([uuid, src, parentValue, "boolean", entryKey, entryOrder, null, null, value ? 1 : 0])
    return uuid
  }

  rows.mass.push([uuid, src, parentValue, "null", entryKey, entryOrder, null, null, null])
  return uuid
}

const pushFieldDefaultRows = (
  rows: CreateRows,
  fieldUuid: string,
  field: WimpCreateFieldInput,
  enumVariants: Map<string, string>,
): void => {
  if (field.default === undefined) return

  rows.fieldDefaults.push([fieldUuid])

  if (field.type === "string") {
    rows.fieldStringDefaults.push([fieldUuid, String(field.default)])
  } else if (field.type === "number") {
    rows.fieldNumberDefaults.push([fieldUuid, Number(field.default)])
  } else if (field.type === "boolean") {
    rows.fieldBooleanDefaults.push([fieldUuid, field.default ? 1 : 0])
  } else if (field.type === "array") {
    const values = Array.isArray(field.default) ? field.default : []
    for (let position = 0; position < values.length; position++) {
      rows.fieldArrayDefaultItems.push([crypto.randomUUID(), fieldUuid, position, String(values[position])])
    }
  } else if (field.type === "enum") {
    const variantUuid = enumVariants.get(String(field.default))
    if (!variantUuid) throw new Error(`Enum default "${String(field.default)}" is not registered for field "${field.key}"`)
    rows.fieldEnumDefaults.push([fieldUuid, variantUuid])
  }
}

const pushFieldRows = (
  rows: CreateRows,
  src: string,
  fields: readonly WimpCreateFieldInput[],
): Map<string, string> => {
  const fieldUuids = new Map<string, string>()

  for (const field of fields) {
    const fieldUuid = crypto.randomUUID()
    const enumVariants = new Map<string, string>()
    fieldUuids.set(field.key, fieldUuid)

    rows.fields.push([fieldUuid, src, field.key, field.type, field.required ? 1 : 0, field.label ?? null])

    if (field.type === "enum" && field.values !== undefined) {
      for (let position = 0; position < field.values.length; position++) {
        const value = String(field.values[position])
        const variantUuid = crypto.randomUUID()
        enumVariants.set(value, variantUuid)
        rows.fieldEnumVariants.push([variantUuid, fieldUuid, position, value])
      }
    }

    pushFieldDefaultRows(rows, fieldUuid, field, enumVariants)
  }

  return fieldUuids
}

const normalizePredicate = (predicate: unknown): Record<string, unknown> | undefined => {
  if (predicate === null) return {null: true}
  if (typeof predicate === "boolean" || typeof predicate === "number" || typeof predicate === "string") {
    return {eq: predicate}
  }
  if (isRecord(predicate)) return predicate
  return undefined
}

const normalizeOperator = (operator: string): string => {
  if (operator === "notEq") return "neq"
  if (operator === "notIn") return "not_in"
  if (operator === "notInclude") return "not_include"
  if (operator === "isEmpty") return "is_empty"
  return operator
}

const normalizeListItem = (value: unknown): {
  kind: "null" | "boolean" | "number" | "string" | "enum"
  booleanValue: number | null
  numberValue: number | null
  textValue: string | null
  variantValue: string | null
} => {
  if (value === null) return {kind: "null", booleanValue: null, numberValue: null, textValue: null, variantValue: null}
  if (typeof value === "boolean") return {kind: "boolean", booleanValue: value ? 1 : 0, numberValue: null, textValue: null, variantValue: null}
  if (typeof value === "number") return {kind: "number", booleanValue: null, numberValue: value, textValue: null, variantValue: null}
  return {kind: "string", booleanValue: null, numberValue: null, textValue: String(value), variantValue: null}
}

const pushPredicateRows = (
  rows: CreateRows,
  conditionUuid: string,
  predicateOrder: number,
  op: string,
  value: unknown,
): void => {
  const predicateUuid = crypto.randomUUID()
  let operator = normalizeOperator(op)
  let valueKind: "null" | "boolean" | "number" | "string" | "enum" | "list" = "null"
  let valueBoolean: number | null = null
  let valueNumber: number | null = null
  let valueText: string | null = null
  const valueVariant: string | null = null

  if (op === "null") {
    operator = value === false ? "neq" : "eq"
  } else if (Array.isArray(value) && (operator === "in" || operator === "not_in")) {
    valueKind = "list"
  } else if (typeof value === "boolean") {
    valueKind = "boolean"
    valueBoolean = value ? 1 : 0
  } else if (typeof value === "number") {
    valueKind = "number"
    valueNumber = value
  } else if (typeof value === "string") {
    valueKind = "string"
    valueText = value
  }

  rows.conditionPredicates.push([
    predicateUuid,
    conditionUuid,
    predicateOrder,
    "value",
    operator,
    valueKind,
    valueBoolean,
    valueNumber,
    valueText,
    valueVariant,
  ])

  if (valueKind !== "list" || !Array.isArray(value)) return
  for (let itemOrder = 0; itemOrder < value.length; itemOrder++) {
    const item = normalizeListItem(value[itemOrder])
    rows.conditionListItems.push([
      predicateUuid,
      itemOrder,
      item.kind,
      item.booleanValue,
      item.numberValue,
      item.textValue,
      item.variantValue,
    ])
  }
}

const pushPredicateGroupRows = (rows: CreateRows, conditionUuid: string, predicateDsl: unknown): void => {
  const normalized = normalizePredicate(predicateDsl)
  if (!normalized) return

  let predicateOrder = 0
  for (const [op, value] of Object.entries(normalized)) {
    pushPredicateRows(rows, conditionUuid, predicateOrder, op, value)
    predicateOrder++
  }
}

const pushConditionRows = (
  rows: CreateRows,
  fieldUuids: Map<string, string>,
  transitionUuid: string,
  conditions: unknown,
): void => {
  if (!isRecord(conditions)) return

  let position = 0
  for (const [fieldKey, predicate] of Object.entries(conditions)) {
    const fieldUuid = fieldUuids.get(fieldKey)
    if (!fieldUuid) continue

    const conditionUuid = crypto.randomUUID()
    rows.conditions.push([conditionUuid, transitionUuid, fieldUuid, position])
    pushPredicateGroupRows(rows, conditionUuid, predicate)
    position++
  }
}

const pushStateRows = (
  rows: CreateRows,
  src: string,
  fieldUuids: Map<string, string>,
  states: readonly WimpCreateStateInput[],
): Map<string, string> => {
  const stateUuids = new Map<string, string>()

  for (let position = 0; position < states.length; position++) {
    const state = states[position]!
    const stateUuid = crypto.randomUUID()
    stateUuids.set(state.name, stateUuid)
    rows.states.push([stateUuid, src, state.name, position])
  }

  for (const state of states) {
    const fromUuid = stateUuids.get(state.name)
    if (!fromUuid || !isRecord(state.transitions)) continue

    let position = 0
    for (const [toName, conditions] of Object.entries(state.transitions)) {
      const toUuid = stateUuids.get(toName)
      if (!toUuid) continue

      const transitionUuid = crypto.randomUUID()
      rows.transitions.push([transitionUuid, fromUuid, toUuid, position])
      pushConditionRows(rows, fieldUuids, transitionUuid, conditions)
      position++
    }
  }

  return stateUuids
}

const pushProcessFieldLinkRows = (
  rows: CreateRows,
  table: "process_action_read" | "process_action_write" | "process_finally_read",
  processUuid: string,
  fieldUuids: Map<string, string>,
  fieldKeys: readonly string[] | undefined,
  phase?: "action" | "success" | "error",
): void => {
  for (const fieldKey of fieldKeys ?? []) {
    const fieldUuid = fieldUuids.get(fieldKey)
    if (!fieldUuid) continue

    if (table === "process_action_read") {
      rows.processActionRead.push([processUuid, fieldUuid, phase ?? null])
    } else if (table === "process_action_write") {
      rows.processActionWrite.push([processUuid, fieldUuid, phase ?? null])
    } else {
      rows.processFinallyRead.push([processUuid, fieldUuid])
    }
  }
}

const pushProcessRows = (
  rows: CreateRows,
  src: string,
  fieldUuids: Map<string, string>,
  processes: readonly WimpCreateProcessInput[],
): void => {
  for (const {key, declaration} of processes) {
    const processUuid = crypto.randomUUID()
    const type = declaration.type === "finally" ? "finally" : "action"

    rows.processes.push([processUuid, src, key, type, declaration.label ?? null, declaration.desc ?? null])

    for (const env of declaration.env ?? []) {
      rows.processEnv.push([processUuid, env])
    }

    if (declaration.type === "finally") {
      rows.processFinally.push([processUuid, declaration.before.src])
      pushProcessFieldLinkRows(rows, "process_finally_read", processUuid, fieldUuids, declaration.before.read)
      continue
    }

    rows.processActions.push([
      processUuid,
      declaration.action.src,
      declaration.action.importSpecifier ?? null,
      declaration.action.wrapperSrc ?? null,
      declaration.success?.src ?? null,
      declaration.error?.src ?? null,
    ])
    pushProcessFieldLinkRows(rows, "process_action_read", processUuid, fieldUuids, declaration.action.read, "action")
    pushProcessFieldLinkRows(rows, "process_action_read", processUuid, fieldUuids, declaration.success?.read, "success")
    pushProcessFieldLinkRows(rows, "process_action_read", processUuid, fieldUuids, declaration.error?.read, "error")
    pushProcessFieldLinkRows(rows, "process_action_write", processUuid, fieldUuids, declaration.success?.write, "success")
    pushProcessFieldLinkRows(rows, "process_action_write", processUuid, fieldUuids, declaration.error?.write, "error")
  }
}

const pushReactionRows = (
  rows: CreateRows,
  src: string,
  fieldUuids: Map<string, string>,
  stateUuids: Map<string, string>,
  reactions: readonly WimpCreateReactionInput[],
): void => {
  for (const reaction of reactions) {
    const reactionUuid = crypto.randomUUID()
    rows.reactions.push([reactionUuid, src, reaction.key, reaction.label, reaction.desc ?? null, reaction.cond, reaction.src])

    for (const fieldKey of reaction.read ?? []) {
      const fieldUuid = fieldUuids.get(fieldKey)
      if (fieldUuid) rows.reactionRead.push([reactionUuid, fieldUuid])
    }
    for (const fieldKey of reaction.write ?? []) {
      const fieldUuid = fieldUuids.get(fieldKey)
      if (fieldUuid) rows.reactionWrite.push([reactionUuid, fieldUuid])
    }
    for (const stateName of reaction.states ?? []) {
      const stateUuid = stateUuids.get(stateName)
      if (stateUuid) rows.reactionStates.push([reactionUuid, stateUuid])
    }
  }
}

/**
 * Строит один SQL batch для создания WIMP-декларации.
 *
 * Функция не обращается к базе и не создает ORM-объекты. Она только переводит
 * `WimpCreateInput` в порядок `INSERT`-statement'ов, согласованный с FK-связями
 * таблиц: сначала корневой `wimp`, затем mass/fields/states/processes/reactions
 * и их дочерние строки.
 *
 * Если WIMP с таким `src` уже существует, batch должен упасть на `UNIQUE`, а не
 * перетирать существующую декларацию. Штатный поток проверяет существование до
 * вызова `create()`.
 *
 * @param src — адрес WIMP-декларации.
 * @param input — подготовленные данные для записи в SQL-таблицы.
 * @returns SQL batch, который можно выполнить одним вызовом внутри транзакции.
 */
export const buildWimpCreateSql = (src: string, input: WimpCreateInput): string => {
  const rows = createRows()

  if (input.mass !== undefined) pushMassRows(rows, src, input.mass, null, null, null)
  const fieldUuids = pushFieldRows(rows, src, input.fields ?? [])
  const stateUuids = pushStateRows(rows, src, fieldUuids, input.states ?? [])
  pushProcessRows(rows, src, fieldUuids, input.processes ?? [])
  pushReactionRows(rows, src, fieldUuids, stateUuids, input.reactions ?? [])

  return [
    `INSERT INTO wimp (src, name, desc, view_css)\nVALUES (${[src, input.name ?? null, input.desc ?? null, input.bulk?.view ?? null].map(sqlValue).join(", ")});`,
    insertRowsSql("wimp_mass_value", ["uuid", "wimp", "parent_value", "value_kind", "entry_key", "entry_order", "text_value", "number_value", "boolean_value"], rows.mass),
    insertRowsSql("field", ["uuid", "wimp", "key", "type", "required", "label"], rows.fields),
    insertRowsSql("field_enum_variant", ["uuid", "field", "position", "item_value"], rows.fieldEnumVariants),
    insertRowsSql("field_default", ["field"], rows.fieldDefaults),
    insertRowsSql("field_string_default", ["field", "default_value"], rows.fieldStringDefaults),
    insertRowsSql("field_number_default", ["field", "default_value"], rows.fieldNumberDefaults),
    insertRowsSql("field_boolean_default", ["field", "default_value"], rows.fieldBooleanDefaults),
    insertRowsSql("field_array_default_item", ["uuid", "field", "position", "item_value"], rows.fieldArrayDefaultItems),
    insertRowsSql("field_enum_default", ["field", "variant"], rows.fieldEnumDefaults),
    insertRowsSql("state", ["uuid", "wimp", "name", "position"], rows.states),
    insertRowsSql("transition", ["uuid", "from_state", "to_state", "position"], rows.transitions),
    insertRowsSql("condition", ["uuid", "transition", "field", "position"], rows.conditions),
    insertRowsSql("condition_predicate", ["uuid", "condition", "predicate_order", "subject_kind", "operator", "value_kind", "value_boolean", "value_number", "value_text", "value_variant"], rows.conditionPredicates),
    insertRowsSql("condition_list_item", ["predicate", "item_order", "value_kind", "value_boolean", "value_number", "value_text", "value_variant"], rows.conditionListItems),
    insertRowsSql("process", ["uuid", "wimp", "key", "type", "label", "desc"], rows.processes),
    insertRowsSql("process_env", ["process", "env"], rows.processEnv, {orIgnore: true}),
    insertRowsSql("process_action", ["process", "action", "action_import_specifier", "action_wrapper_src", "success", "error"], rows.processActions),
    insertRowsSql("process_finally", ["process", "before"], rows.processFinally),
    insertRowsSql("process_action_read", ["process", "field", "phase"], rows.processActionRead, {orIgnore: true}),
    insertRowsSql("process_action_write", ["process", "field", "phase"], rows.processActionWrite, {orIgnore: true}),
    insertRowsSql("process_finally_read", ["process", "field"], rows.processFinallyRead, {orIgnore: true}),
    insertRowsSql("reaction", ["uuid", "wimp", "key", "label", "desc", "cond_source", "update_source"], rows.reactions),
    insertRowsSql("reaction_read", ["reaction", "field"], rows.reactionRead, {orIgnore: true}),
    insertRowsSql("reaction_write", ["reaction", "field"], rows.reactionWrite, {orIgnore: true}),
    insertRowsSql("reaction_state", ["reaction", "state"], rows.reactionStates, {orIgnore: true}),
  ]
    .filter((statement): statement is string => statement !== null)
    .join("\n\n")
}

