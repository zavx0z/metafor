import type { Database } from "bun:sqlite"
import type { MetaDSL, ParsedDestroy, ParsedProcess, ReactionsSchema } from "../.."
import type { MatterBindingValue, MatterParticlePlan } from "@dark/types/dark"
import type { MetaInit } from "@dark/types/strong"

type FieldRow = {
  uuid: string
  key: string
  type: "string" | "number" | "boolean" | "array" | "enum"
  required: number
  label: string | null
}

type PredicateRow = {
  uuid: string
  condition: string
  predicate_order: number
  operator: string
  value_kind: "null" | "boolean" | "number" | "string" | "enum" | "list"
  value_boolean: number | null
  value_number: number | null
  value_text: string | null
  value_variant: string | null
}

type MetaMassValueRow = {
  uuid: string
  parent_value: string | null
  value_kind: "object" | "array" | "string" | "number" | "boolean" | "null"
  entry_key: string | null
  entry_order: number | null
  text_value: string | null
  number_value: number | null
  boolean_value: number | null
}

type BindingRow = {
  uuid: string
  binding_kind: "static" | "variable" | "dynamic"
  literal_kind: "text" | "boolean" | null
  literal_text: string | null
  literal_boolean: number | null
  expr: string | null
}

type ParticleRow = {
  uuid: string
  parent_particle: string | null
  particle_kind: "wimp" | "fuzzy" | "axion" | "macho"
  edge_slot: "root" | "child" | "then" | "else" | "branch"
  particle_order: number
}

type WimpParticleRow = {
  particle: string
  src: string
  fields_binding: string | null
  mass_binding: string | null
}

type FuzzyParticleRow = {
  particle: string
  fuzzy_kind: "dynamic-meta" | "cond"
  predicate_binding: string | null
}

type AxionParticleRow = {
  particle: string
  predicate_binding: string
}

type MachoParticleRow = {
  particle: string
  collection_binding: string
}

type MetaRow = {
  src: string
  name: string | null
  desc: string | null
  view_css: string | null
  has_processes: number
  has_reactions: number
  has_matter: number
}

export interface DarkMetaParticleModel {
  meta: MetaInit
  particles: MatterParticlePlan[]
}

const hasKeys = (value: object): boolean => Object.keys(value).length > 0
const toMaybeArray = (values: string[]): string | string[] => (values.length === 1 ? values[0]! : values)
const particleEdgeSlotOrder: Record<ParticleRow["edge_slot"], number> = {
  root: 0,
  branch: 0,
  child: 0,
  then: 0,
  else: 1,
}

const decodeStoredScalar = (
  valueKind: PredicateRow["value_kind"],
  row: Pick<PredicateRow, "value_boolean" | "value_number" | "value_text" | "value_variant">,
  enumVariants: Map<string, string>,
): string | number | boolean | null => {
  switch (valueKind) {
    case "null":
      return null
    case "boolean":
      return row.value_boolean === 1
    case "number":
      return row.value_number ?? 0
    case "string":
      return row.value_text ?? ""
    case "enum":
      return row.value_variant ? (enumVariants.get(row.value_variant) ?? "") : ""
    default:
      return null
  }
}

const decodeOperatorKey = (operator: string): string => {
  switch (operator) {
    case "neq":
      return "notEq"
    case "not_in":
      return "notIn"
    case "not_include":
      return "notInclude"
    case "is_empty":
      return "isEmpty"
    default:
      return operator
  }
}

export const readFields = (
  db: Database,
  src: string,
): {
  fields: NonNullable<MetaDSL["fields"]>
  fieldKeys: Map<string, string>
  enumVariants: Map<string, string>
} => {
  const fieldRows = db.query(`SELECT uuid, key, type, required, label FROM field WHERE meta = ? ORDER BY rowid`).all(src) as FieldRow[]
  const defaultFieldIds = new Set(
    (
      db.query(
        `SELECT field_default.field AS field
         FROM field_default
         INNER JOIN field ON field.uuid = field_default.field
         WHERE field.meta = ?`,
      ).all(src) as Array<{ field: string }>
    ).map((row) => row.field),
  )

  const stringDefaults = new Map(
    (
      db.query(
        `SELECT field_string_default.field AS field, field_string_default.default_value AS default_value
         FROM field_string_default
         INNER JOIN field ON field.uuid = field_string_default.field
         WHERE field.meta = ?`,
      ).all(src) as Array<{ field: string; default_value: string }>
    ).map((row) => [row.field, row.default_value]),
  )

  const numberDefaults = new Map(
    (
      db.query(
        `SELECT field_number_default.field AS field, field_number_default.default_value AS default_value
         FROM field_number_default
         INNER JOIN field ON field.uuid = field_number_default.field
         WHERE field.meta = ?`,
      ).all(src) as Array<{ field: string; default_value: number }>
    ).map((row) => [row.field, row.default_value]),
  )

  const booleanDefaults = new Map(
    (
      db.query(
        `SELECT field_boolean_default.field AS field, field_boolean_default.default_value AS default_value
         FROM field_boolean_default
         INNER JOIN field ON field.uuid = field_boolean_default.field
         WHERE field.meta = ?`,
      ).all(src) as Array<{ field: string; default_value: number }>
    ).map((row) => [row.field, row.default_value === 1]),
  )

  const arrayDefaultRows = db.query(
    `SELECT field_array_default_item.field AS field, field_array_default_item.item_value AS item_value
     FROM field_array_default_item
     INNER JOIN field ON field.uuid = field_array_default_item.field
     WHERE field.meta = ?
     ORDER BY field_array_default_item.position`,
  ).all(src) as Array<{ field: string; item_value: string }>

  const arrayDefaults = new Map<string, number[]>()
  for (const row of arrayDefaultRows) {
    const items = arrayDefaults.get(row.field) ?? []
    items.push(Number(row.item_value))
    arrayDefaults.set(row.field, items)
  }

  const enumVariantRows = db.query(
    `SELECT field_enum_variant.uuid AS uuid, field_enum_variant.field AS field, field_enum_variant.item_value AS item_value
     FROM field_enum_variant
     INNER JOIN field ON field.uuid = field_enum_variant.field
     WHERE field.meta = ?
     ORDER BY field_enum_variant.position`,
  ).all(src) as Array<{ uuid: string; field: string; item_value: string }>

  const enumValues = new Map<string, string[]>()
  const enumVariants = new Map<string, string>()
  for (const row of enumVariantRows) {
    const values = enumValues.get(row.field) ?? []
    values.push(row.item_value)
    enumValues.set(row.field, values)
    enumVariants.set(row.uuid, row.item_value)
  }

  const enumDefaults = new Map(
    (
      db.query(
        `SELECT field_enum_default.field AS field, field_enum_variant.item_value AS item_value
         FROM field_enum_default
         INNER JOIN field ON field.uuid = field_enum_default.field
         INNER JOIN field_enum_variant ON field_enum_variant.uuid = field_enum_default.variant
         WHERE field.meta = ?`,
      ).all(src) as Array<{ field: string; item_value: string }>
    ).map((row) => [row.field, row.item_value]),
  )

  const fields: NonNullable<MetaDSL["fields"]> = {}
  const fieldKeys = new Map<string, string>()

  for (const row of fieldRows) {
    fieldKeys.set(row.uuid, row.key)

    const field: Record<string, unknown> = { type: row.type }
    if (row.required === 1) field.required = true
    if (row.label !== null) field.label = row.label

    if (defaultFieldIds.has(row.uuid)) {
      if (row.type === "string" && stringDefaults.has(row.uuid)) field.default = stringDefaults.get(row.uuid)
      if (row.type === "number" && numberDefaults.has(row.uuid)) field.default = numberDefaults.get(row.uuid)
      if (row.type === "boolean" && booleanDefaults.has(row.uuid)) field.default = booleanDefaults.get(row.uuid)
      if (row.type === "array") field.default = arrayDefaults.get(row.uuid) ?? []
      if (row.type === "enum" && enumDefaults.has(row.uuid)) field.default = enumDefaults.get(row.uuid)
    }

    if (row.type === "enum") {
      field.values = enumValues.get(row.uuid) ?? []
    }

    fields[row.key] = field as NonNullable<MetaDSL["fields"]>[string]
  }

  return { fields, fieldKeys, enumVariants }
}

export const readSuperposition = (
  db: Database,
  src: string,
  enumVariants: Map<string, string>,
): NonNullable<MetaDSL["superposition"]> | undefined => {
  const stateRows = db.query(`SELECT uuid, name FROM superposition WHERE meta = ? ORDER BY position`).all(src) as Array<{
    uuid: string
    name: string
  }>
  if (stateRows.length === 0) return

  const superposition: NonNullable<MetaDSL["superposition"]> = {}
  const stateNames = new Map<string, string>()
  for (const row of stateRows) {
    stateNames.set(row.uuid, row.name)
    superposition[row.name] = {}
  }

  const transitionRows = db.query(
    `SELECT uuid, from_superposition, to_superposition
     FROM transition
     WHERE from_superposition IN (SELECT uuid FROM superposition WHERE meta = ?)
     ORDER BY position`,
  ).all(src) as Array<{ uuid: string; from_superposition: string; to_superposition: string }>

  const transitions = new Map<string, Record<string, unknown>>()
  for (const row of transitionRows) {
    const fromName = stateNames.get(row.from_superposition)
    const toName = stateNames.get(row.to_superposition)
    if (!fromName || !toName) continue

    const conditionSet: Record<string, unknown> = {}
    superposition[fromName]![toName] = conditionSet
    transitions.set(row.uuid, conditionSet)
  }

  const conditionRows = db.query(
    `SELECT condition.uuid AS uuid, condition.transition AS transition, field.key AS field_key
     FROM condition
     INNER JOIN field ON field.uuid = condition.field
     WHERE condition.transition IN (
       SELECT transition.uuid
       FROM transition
       INNER JOIN superposition ON superposition.uuid = transition.from_superposition
       WHERE superposition.meta = ?
     )
     ORDER BY condition.position`,
  ).all(src) as Array<{ uuid: string; transition: string; field_key: string }>

  const predicateRows = db.query(
    `SELECT uuid, condition, predicate_order, operator, value_kind, value_boolean, value_number, value_text, value_variant
     FROM condition_predicate
     WHERE condition IN (
       SELECT condition.uuid
       FROM condition
       INNER JOIN transition ON transition.uuid = condition.transition
       INNER JOIN superposition ON superposition.uuid = transition.from_superposition
       WHERE superposition.meta = ?
     )
     ORDER BY predicate_order`,
  ).all(src) as PredicateRow[]

  const listItemRows = db.query(
    `SELECT condition_list_item.predicate AS predicate,
            condition_list_item.item_order AS item_order,
            condition_list_item.value_kind AS value_kind,
            condition_list_item.value_boolean AS value_boolean,
            condition_list_item.value_number AS value_number,
            condition_list_item.value_text AS value_text,
            condition_list_item.value_variant AS value_variant
     FROM condition_list_item
     WHERE condition_list_item.predicate IN (
       SELECT condition_predicate.uuid
       FROM condition_predicate
       INNER JOIN condition ON condition.uuid = condition_predicate.condition
       INNER JOIN transition ON transition.uuid = condition.transition
       INNER JOIN superposition ON superposition.uuid = transition.from_superposition
       WHERE superposition.meta = ?
     )
     ORDER BY condition_list_item.item_order`,
  ).all(src) as Array<{
    predicate: string
    item_order: number
    value_kind: PredicateRow["value_kind"]
    value_boolean: number | null
    value_number: number | null
    value_text: string | null
    value_variant: string | null
  }>

  const listItems = new Map<string, Array<string | number | boolean | null>>()
  for (const row of listItemRows) {
    const items = listItems.get(row.predicate) ?? []
    items.push(decodeStoredScalar(row.value_kind, row, enumVariants))
    listItems.set(row.predicate, items)
  }

  const predicatesByCondition = new Map<string, PredicateRow[]>()
  for (const row of predicateRows) {
    const rows = predicatesByCondition.get(row.condition) ?? []
    rows.push(row)
    predicatesByCondition.set(row.condition, rows)
  }

  for (const row of conditionRows) {
    const transition = transitions.get(row.transition)
    if (!transition) continue

    const predicateObject: Record<string, unknown> = {}
    for (const predicate of predicatesByCondition.get(row.uuid) ?? []) {
      if (predicate.value_kind === "null" && (predicate.operator === "eq" || predicate.operator === "neq")) {
        predicateObject.null = predicate.operator === "eq"
        continue
      }

      const value =
        predicate.value_kind === "list"
          ? listItems.get(predicate.uuid) ?? []
          : decodeStoredScalar(predicate.value_kind, predicate, enumVariants)

      predicateObject[decodeOperatorKey(predicate.operator)] = value
    }

    transition[row.field_key] =
      Object.keys(predicateObject).length === 1 && predicateObject.null === true ? null : predicateObject
  }

  return superposition
}

export const readProcesses = (
  db: Database,
  src: string,
  fieldKeys: Map<string, string>,
): NonNullable<MetaDSL["processes"]> | undefined => {
  const processRows = db.query(
    `SELECT uuid, key, type, label, desc
     FROM process
     WHERE meta = ?
     ORDER BY process.rowid`,
  ).all(src) as Array<{ uuid: string; key: string; type: "action" | "finally"; label: string | null; desc: string | null }>
  if (processRows.length === 0) return

  const envRows = db.query(
    `SELECT process, env
     FROM process_env
     WHERE process IN (SELECT uuid FROM process WHERE meta = ?)
     ORDER BY process_env.rowid`,
  ).all(src) as Array<{ process: string; env: string }>

  const envsByProcess = new Map<string, string[]>()
  for (const row of envRows) {
    const envs = envsByProcess.get(row.process) ?? []
    envs.push(row.env)
    envsByProcess.set(row.process, envs)
  }

  const actionRows = new Map(
    (
      db.query(
        `SELECT process, action, action_import_specifier, success, error
         FROM process_action
         WHERE process IN (SELECT uuid FROM process WHERE meta = ?)`,
      ).all(src) as Array<{
        process: string
        action: string
        action_import_specifier: string | null
        success: string | null
        error: string | null
      }>
    ).map((row) => [row.process, row]),
  )

  const actionReadRows = db.query(
    `SELECT process_action_read.process AS process, process_action_read.phase AS phase, process_action_read.field AS field
     FROM process_action_read
     INNER JOIN process ON process.uuid = process_action_read.process
     WHERE process.meta = ?
     ORDER BY process_action_read.rowid`,
  ).all(src) as Array<{ process: string; phase: "action" | "success" | "error"; field: string }>

  const actionWriteRows = db.query(
    `SELECT process_action_write.process AS process, process_action_write.phase AS phase, process_action_write.field AS field
     FROM process_action_write
     INNER JOIN process ON process.uuid = process_action_write.process
     WHERE process.meta = ?
     ORDER BY process_action_write.rowid`,
  ).all(src) as Array<{ process: string; phase: "success" | "error"; field: string }>

  const finallyRows = new Map(
    (
      db.query(
        `SELECT process, before
         FROM process_finally
         WHERE process IN (SELECT uuid FROM process WHERE meta = ?)`,
      ).all(src) as Array<{ process: string; before: string }>
    ).map((row) => [row.process, row]),
  )

  const finallyReadRows = db.query(
    `SELECT process_finally_read.process AS process, process_finally_read.field AS field
     FROM process_finally_read
     INNER JOIN process ON process.uuid = process_finally_read.process
     WHERE process.meta = ?
     ORDER BY process_finally_read.rowid`,
  ).all(src) as Array<{ process: string; field: string }>

  const readMap = new Map<string, Record<string, string[]>>()
  for (const row of actionReadRows) {
    const phases = readMap.get(row.process) ?? {}
    const fields = phases[row.phase] ?? []
    const fieldKey = fieldKeys.get(row.field)
    if (fieldKey) fields.push(fieldKey)
    phases[row.phase] = fields
    readMap.set(row.process, phases)
  }

  const writeMap = new Map<string, Record<string, string[]>>()
  for (const row of actionWriteRows) {
    const phases = writeMap.get(row.process) ?? {}
    const fields = phases[row.phase] ?? []
    const fieldKey = fieldKeys.get(row.field)
    if (fieldKey) fields.push(fieldKey)
    phases[row.phase] = fields
    writeMap.set(row.process, phases)
  }

  const finallyReads = new Map<string, string[]>()
  for (const row of finallyReadRows) {
    const fields = finallyReads.get(row.process) ?? []
    const fieldKey = fieldKeys.get(row.field)
    if (fieldKey) fields.push(fieldKey)
    finallyReads.set(row.process, fields)
  }

  const processes: NonNullable<MetaDSL["processes"]> = {}

  for (const row of processRows) {
    if (row.type === "finally") {
      const finallyRow = finallyRows.get(row.uuid)
      if (!finallyRow) continue

      const process: ParsedDestroy = {
        type: "finally",
        before: {
          src: finallyRow.before,
        },
      }

      const reads = finallyReads.get(row.uuid)
      if (reads && reads.length > 0) process.before.read = reads
      if (row.label !== null) process.label = row.label
      if (row.desc !== null) process.desc = row.desc

      const envs = envsByProcess.get(row.uuid)
      if (envs && envs.length > 0) process.env = envs as ParsedDestroy["env"]
      processes[row.key] = process
      continue
    }

    const actionRow = actionRows.get(row.uuid)
    if (!actionRow) continue

    const reads = readMap.get(row.uuid) ?? {}
    const writes = writeMap.get(row.uuid) ?? {}
    const process: ParsedProcess = {
      type: "action",
      action: {
        src: actionRow.action,
      },
    }

    if (actionRow.action_import_specifier !== null) {
      process.action.importSpecifier = actionRow.action_import_specifier
    }
    if ((reads.action ?? []).length > 0) process.action.read = reads.action

    if (actionRow.success !== null) {
      process.success = {
        src: actionRow.success,
      }
      if ((reads.success ?? []).length > 0) process.success.read = reads.success
      if ((writes.success ?? []).length > 0) process.success.write = writes.success
    }

    if (actionRow.error !== null) {
      process.error = {
        src: actionRow.error,
      }
      if ((reads.error ?? []).length > 0) process.error.read = reads.error
      if ((writes.error ?? []).length > 0) process.error.write = writes.error
    }

    if (row.label !== null) process.label = row.label
    if (row.desc !== null) process.desc = row.desc

    const envs = envsByProcess.get(row.uuid)
    if (envs && envs.length > 0) process.env = envs as ParsedProcess["env"]

    processes[row.key] = process
  }

  return processes
}

export const readReactions = (
  db: Database,
  src: string,
  fieldKeys: Map<string, string>,
): ReactionsSchema | undefined => {
  const reactionRows = db.query(
    `SELECT uuid, key, label, desc, cond_source, update_source
     FROM reaction
     WHERE meta = ?
     ORDER BY reaction.rowid`,
  ).all(src) as Array<{
    uuid: string
    key: string
    label: string
    desc: string | null
    cond_source: string
    update_source: string
  }>
  if (reactionRows.length === 0) return

  const reactionReads = db.query(
    `SELECT reaction_read.reaction AS reaction, reaction_read.field AS field
     FROM reaction_read
     INNER JOIN reaction ON reaction.uuid = reaction_read.reaction
     WHERE reaction.meta = ?
     ORDER BY reaction_read.rowid`,
  ).all(src) as Array<{ reaction: string; field: string }>

  const reactionWrites = db.query(
    `SELECT reaction_write.reaction AS reaction, reaction_write.field AS field
     FROM reaction_write
     INNER JOIN reaction ON reaction.uuid = reaction_write.reaction
     WHERE reaction.meta = ?
     ORDER BY reaction_write.rowid`,
  ).all(src) as Array<{ reaction: string; field: string }>

  const reactionStates = db.query(
    `SELECT reaction_superposition.reaction AS reaction, superposition.name AS state_name
     FROM reaction_superposition
     INNER JOIN reaction ON reaction.uuid = reaction_superposition.reaction
     INNER JOIN superposition ON superposition.uuid = reaction_superposition.superposition
     WHERE reaction.meta = ?
     ORDER BY reaction_superposition.rowid`,
  ).all(src) as Array<{ reaction: string; state_name: string }>

  const readsByReaction = new Map<string, string[]>()
  for (const row of reactionReads) {
    const reads = readsByReaction.get(row.reaction) ?? []
    const fieldKey = fieldKeys.get(row.field)
    if (fieldKey) reads.push(fieldKey)
    readsByReaction.set(row.reaction, reads)
  }

  const writesByReaction = new Map<string, string[]>()
  for (const row of reactionWrites) {
    const writes = writesByReaction.get(row.reaction) ?? []
    const fieldKey = fieldKeys.get(row.field)
    if (fieldKey) writes.push(fieldKey)
    writesByReaction.set(row.reaction, writes)
  }

  const statesByReaction = new Map<string, string[]>()
  for (const row of reactionStates) {
    const states = statesByReaction.get(row.reaction) ?? []
    states.push(row.state_name)
    statesByReaction.set(row.reaction, states)
  }

  const reactions: ReactionsSchema = {
    reactions: {},
    superposition: {},
  }

  for (const row of reactionRows) {
    const reaction: ReactionsSchema["reactions"][string] = {
      label: row.label,
      cond: row.cond_source,
      src: row.update_source,
    }

    const reads = readsByReaction.get(row.uuid)
    const writes = writesByReaction.get(row.uuid)
    if (row.desc !== null) reaction.desc = row.desc
    if (reads && reads.length > 0) reaction.read = reads
    if (writes && writes.length > 0) reaction.write = writes

    reactions.reactions[row.key] = reaction

    for (const stateName of statesByReaction.get(row.uuid) ?? []) {
      const reactionKeys = reactions.superposition[stateName] ?? []
      reactionKeys.push(row.key)
      reactions.superposition[stateName] = reactionKeys
    }
  }

  return reactions
}

const compareMassRows = (left: MetaMassValueRow, right: MetaMassValueRow): number => {
  if (left.entry_order !== null || right.entry_order !== null) {
    return (left.entry_order ?? 0) - (right.entry_order ?? 0)
  }

  return (left.entry_key ?? "").localeCompare(right.entry_key ?? "")
}

const decodeMassValue = (
  row: MetaMassValueRow,
  childrenByParent: Map<string, MetaMassValueRow[]>,
): unknown => {
  if (row.value_kind === "object") {
    return Object.fromEntries(
      (childrenByParent.get(row.uuid) ?? [])
        .sort(compareMassRows)
        .map((child) => [child.entry_key ?? "", decodeMassValue(child, childrenByParent)]),
    )
  }

  if (row.value_kind === "array") {
    return (childrenByParent.get(row.uuid) ?? []).sort(compareMassRows).map((child) => decodeMassValue(child, childrenByParent))
  }

  if (row.value_kind === "string") return row.text_value ?? ""
  if (row.value_kind === "number") return row.number_value ?? 0
  if (row.value_kind === "boolean") return row.boolean_value === 1
  return null
}

export const readMass = (db: Database, src: string): MetaDSL["mass"] | undefined => {
  const rows = db.query(
    `SELECT uuid, parent_value, value_kind, entry_key, entry_order, text_value, number_value, boolean_value
     FROM meta_mass_value
     WHERE meta = ?
     ORDER BY CASE WHEN parent_value IS NULL THEN 0 ELSE 1 END, entry_order, entry_key, rowid`,
  ).all(src) as MetaMassValueRow[]

  const root = rows.find((row) => row.parent_value === null)
  if (!root) return

  const childrenByParent = new Map<string, MetaMassValueRow[]>()
  for (const row of rows) {
    if (row.parent_value === null) continue

    const children = childrenByParent.get(row.parent_value) ?? []
    children.push(row)
    childrenByParent.set(row.parent_value, children)
  }

  return decodeMassValue(root, childrenByParent) as MetaDSL["mass"]
}

const readParticleBindings = (db: Database, src: string) => {
  const bindingRows = new Map(
    (
      db.query(
        `SELECT uuid, binding_kind, literal_kind, literal_text, literal_boolean, expr
         FROM matter_binding
         WHERE meta = ?`,
      ).all(src) as BindingRow[]
    ).map((row) => [row.uuid, row]),
  )

  const bindingDeps = new Map<string, string[]>()
  const depRows = db.query(
    `SELECT binding, dep_order, path
     FROM matter_binding_dep
     WHERE binding IN (SELECT uuid FROM matter_binding WHERE meta = ?)
     ORDER BY dep_order`,
  ).all(src) as Array<{ binding: string; dep_order: number; path: string }>

  for (const row of depRows) {
    const deps = bindingDeps.get(row.binding) ?? []
    deps.push(row.path)
    bindingDeps.set(row.binding, deps)
  }

  const cache = new Map<string, MatterBindingValue | undefined>()
  const readBinding = (bindingId: string | null | undefined): MatterBindingValue | undefined => {
    if (!bindingId) return
    if (cache.has(bindingId)) return cache.get(bindingId)

    const row = bindingRows.get(bindingId)
    if (!row) return

    let value: MatterBindingValue | undefined
    if (row.binding_kind === "static") {
      value = row.literal_kind === "boolean" ? row.literal_boolean === 1 : row.literal_text ?? ""
    } else {
      const deps = bindingDeps.get(bindingId) ?? []
      value = row.expr !== null ? { ...(deps.length > 0 ? { data: toMaybeArray(deps) } : {}), expr: row.expr } : { data: toMaybeArray(deps) }
    }

    cache.set(bindingId, value)
    return value
  }

  return { readBinding }
}

const buildParticleModel = (
  row: ParticleRow,
  rowsByParent: Map<string | null, ParticleRow[]>,
  wimpRows: Map<string, WimpParticleRow>,
  fuzzyRows: Map<string, FuzzyParticleRow>,
  axionRows: Map<string, AxionParticleRow>,
  machoRows: Map<string, MachoParticleRow>,
  readBinding: (bindingId: string | null | undefined) => MatterBindingValue | undefined,
): MatterParticlePlan => {
  const children = (rowsByParent.get(row.uuid) ?? []).map((child) =>
    buildParticleModel(child, rowsByParent, wimpRows, fuzzyRows, axionRows, machoRows, readBinding),
  )

  if (row.particle_kind === "wimp") {
    const wimpRow = wimpRows.get(row.uuid)
    if (!wimpRow) throw new Error(`Wimp particle row "${row.uuid}" is not found in canonical SQLite projection`)

    return {
      kind: "wimp",
      src: wimpRow.src,
      ...(wimpRow.fields_binding !== null ? { fieldsBinding: readBinding(wimpRow.fields_binding) } : {}),
      ...(wimpRow.mass_binding !== null ? { massBinding: readBinding(wimpRow.mass_binding) } : {}),
      ...(children.length > 0 ? { children } : {}),
    }
  }

  if (row.particle_kind === "fuzzy") {
    const fuzzyRow = fuzzyRows.get(row.uuid)
    if (!fuzzyRow) throw new Error(`Fuzzy particle row "${row.uuid}" is not found in canonical SQLite projection`)

    return {
      kind: "fuzzy",
      fuzzyKind: fuzzyRow.fuzzy_kind,
      ...(fuzzyRow.predicate_binding !== null ? { predicateBinding: readBinding(fuzzyRow.predicate_binding) } : {}),
      ...(children.length > 0 ? { children } : {}),
    }
  }

  if (row.particle_kind === "axion") {
    const axionRow = axionRows.get(row.uuid)
    if (!axionRow) throw new Error(`Axion particle row "${row.uuid}" is not found in canonical SQLite projection`)

    return {
      kind: "axion",
      predicateBinding: readBinding(axionRow.predicate_binding) ?? { data: [] },
      ...(children.length > 0 ? { children } : {}),
    }
  }

  const machoRow = machoRows.get(row.uuid)
  if (!machoRow) throw new Error(`Macho particle row "${row.uuid}" is not found in canonical SQLite projection`)

  return {
    kind: "macho",
    collectionBinding: readBinding(machoRow.collection_binding) ?? { data: [] },
    ...(children.length > 0 ? { children } : {}),
  }
}

export const readDarkParticleModel = (db: Database, src: string): DarkMetaParticleModel => {
  const metaRow = db.query(
    `SELECT src, name, desc, view_css, has_processes, has_reactions, has_matter
     FROM meta
     WHERE src = ?`,
  ).get(src) as MetaRow | null

  if (!metaRow) {
    throw new Error(`Canonical meta "${src}" is not found in SQLite`)
  }

  const { fields, fieldKeys, enumVariants } = readFields(db, src)
  const metaMass = readMass(db, src)
  const superposition = readSuperposition(db, src, enumVariants)
  const processes = readProcesses(db, src, fieldKeys)
  const reactions = readReactions(db, src, fieldKeys)

  const { readBinding } = readParticleBindings(db, src)

  const particleRows = db.query(
    `SELECT uuid, parent_particle, particle_kind, edge_slot, particle_order
     FROM matter_particle
     WHERE meta = ?
     ORDER BY CASE WHEN parent_particle IS NULL THEN 0 ELSE 1 END, particle_order, rowid`,
  ).all(src) as ParticleRow[]

  const rowsByParent = new Map<string | null, ParticleRow[]>()
  for (const row of particleRows) {
    const rows = rowsByParent.get(row.parent_particle) ?? []
    rows.push(row)
    rowsByParent.set(row.parent_particle, rows)
  }

  rowsByParent.forEach((rows) => {
    rows.sort(
      (left, right) =>
        particleEdgeSlotOrder[left.edge_slot] - particleEdgeSlotOrder[right.edge_slot] ||
        left.particle_order - right.particle_order,
    )
  })

  const wimpRows = new Map(
    (
      db.query(
        `SELECT particle, src, fields_binding, mass_binding
         FROM matter_particle_wimp
         WHERE particle IN (SELECT uuid FROM matter_particle WHERE meta = ?)`,
      ).all(src) as WimpParticleRow[]
    ).map((row) => [row.particle, row]),
  )

  const fuzzyRows = new Map(
    (
      db.query(
        `SELECT particle, fuzzy_kind, predicate_binding
         FROM matter_particle_fuzzy
         WHERE particle IN (SELECT uuid FROM matter_particle WHERE meta = ?)`,
      ).all(src) as FuzzyParticleRow[]
    ).map((row) => [row.particle, row]),
  )

  const axionRows = new Map(
    (
      db.query(
        `SELECT particle, predicate_binding
         FROM matter_particle_axion
         WHERE particle IN (SELECT uuid FROM matter_particle WHERE meta = ?)`,
      ).all(src) as AxionParticleRow[]
    ).map((row) => [row.particle, row]),
  )

  const machoRows = new Map(
    (
      db.query(
        `SELECT particle, collection_binding
         FROM matter_particle_macho
         WHERE particle IN (SELECT uuid FROM matter_particle WHERE meta = ?)`,
      ).all(src) as MachoParticleRow[]
    ).map((row) => [row.particle, row]),
  )

  return {
    meta: {
      src,
      name: metaRow.name ?? src.split("/").pop() ?? src,
      fieldSchemas: fields,
      superposition: superposition ?? {},
      ...(metaRow.has_processes === 1 || processes !== undefined ? { processes: processes ?? {} } : {}),
      ...(metaRow.has_reactions === 1 || (reactions !== undefined && (hasKeys(reactions.reactions) || hasKeys(reactions.superposition)))
        ? { reactions: reactions ?? { reactions: {}, superposition: {} } }
        : {}),
      ...(metaRow.view_css !== null ? { bulk: { view: metaRow.view_css } as MetaDSL["bulk"] } : {}),
      ...(metaMass !== undefined && hasKeys(metaMass) ? { mass: metaMass } : {}),
    },
    particles: (rowsByParent.get(null) ?? []).map((row) =>
      buildParticleModel(row, rowsByParent, wimpRows, fuzzyRows, axionRows, machoRows, readBinding),
    ),
  }
}

export function readDarkBundle(db: Database, src: string): MetaDSL {
  const metaRow = db.query(
    `SELECT src, name, desc, view_css, has_processes, has_reactions, has_matter
     FROM meta
     WHERE src = ?`,
  ).get(src) as
    | {
        src: string
        name: string | null
        desc: string | null
        view_css: string | null
        has_processes: number
        has_reactions: number
        has_matter: number
      }
    | null

  if (!metaRow) {
    throw new Error(`Canonical meta "${src}" is not found in SQLite`)
  }

  const { fields, fieldKeys, enumVariants } = readFields(db, src)
  const superposition = readSuperposition(db, src, enumVariants)
  const processes = readProcesses(db, src, fieldKeys)
  const reactions = readReactions(db, src, fieldKeys)
  const mass = readMass(db, src)

  const bundle: MetaDSL = {
    name: metaRow.name ?? src.split("/").pop() ?? src,
    fields,
  }

  if (metaRow.desc !== null) bundle.desc = metaRow.desc
  if (metaRow.view_css !== null) bundle.bulk = { view: metaRow.view_css }
  if (mass !== undefined) bundle.mass = mass
  if (superposition !== undefined) bundle.superposition = superposition
  if (metaRow.has_processes === 1 || processes !== undefined) bundle.processes = processes ?? {}
  if (metaRow.has_reactions === 1 || (reactions !== undefined && (hasKeys(reactions.reactions) || hasKeys(reactions.superposition)))) {
    bundle.reactions = reactions ?? { reactions: {}, superposition: {} }
  }
  if (metaRow.has_matter === 1) {
    bundle.matter = []
  }

  if (bundle.superposition === undefined) bundle.superposition = {}
  if (bundle.mass === undefined) bundle.mass = {}

  return bundle
}
