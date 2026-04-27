import type { SQL } from "bun"
import type { MetaDSL, ParsedDestroy, ParsedProcess, ReactionsSchema } from "../../.."
import { getMass, getMetaRow, hasMatter, hasProcesses, hasReactions } from "./meta.G.ts"
import { getMatterParticles } from "./matter.G.ts"
import type { FieldRow, GetFieldsResult, MetaFieldSchema } from "./fields.t.ts"
import type { ConditionListItemRow, PredicateRow } from "./superposition.t.ts"
import type { ProcessActionReadRow, ProcessActionRow, ProcessActionWriteRow, ProcessRow } from "./process.t.ts"
import type { ReactionRow } from "./reactions.t.ts"
import type { DarkMetaParticleModel } from "./read.t.ts"

const hasKeys = (value: object): boolean => Object.keys(value).length > 0

const getFields = async (sql: SQL, src: string): Promise<GetFieldsResult> => {
  const fieldRows = await sql<FieldRow[]>`SELECT uuid, key, type, required, label FROM field WHERE meta = ${src} ORDER BY rowid`
  const defaultFieldIds = new Set(
    (
      await sql<Array<{ field: string }>>`
        SELECT field_default.field AS field
        FROM field_default
        INNER JOIN field ON field.uuid = field_default.field
        WHERE field.meta = ${src}
      `
    ).map((row) => row.field),
  )

  const stringDefaults = new Map(
    (
      await sql<Array<{ field: string; default_value: string }>>`
        SELECT field_string_default.field AS field, field_string_default.default_value AS default_value
        FROM field_string_default
        INNER JOIN field ON field.uuid = field_string_default.field
        WHERE field.meta = ${src}
      `
    ).map((row) => [row.field, row.default_value]),
  )

  const numberDefaults = new Map(
    (
      await sql<Array<{ field: string; default_value: number }>>`
        SELECT field_number_default.field AS field, field_number_default.default_value AS default_value
        FROM field_number_default
        INNER JOIN field ON field.uuid = field_number_default.field
        WHERE field.meta = ${src}
      `
    ).map((row) => [row.field, row.default_value]),
  )

  const booleanDefaults = new Map(
    (
      await sql<Array<{ field: string; default_value: number }>>`
        SELECT field_boolean_default.field AS field, field_boolean_default.default_value AS default_value
        FROM field_boolean_default
        INNER JOIN field ON field.uuid = field_boolean_default.field
        WHERE field.meta = ${src}
      `
    ).map((row) => [row.field, row.default_value === 1]),
  )

  const arrayDefaultRows = await sql<Array<{ field: string; item_value: string }>>`
    SELECT field_array_default_item.field AS field, field_array_default_item.item_value AS item_value
    FROM field_array_default_item
    INNER JOIN field ON field.uuid = field_array_default_item.field
    WHERE field.meta = ${src}
    ORDER BY field_array_default_item.position
  `

  const arrayDefaults = new Map<string, number[]>()
  for (const row of arrayDefaultRows) {
    const items = arrayDefaults.get(row.field) ?? []
    items.push(Number(row.item_value))
    arrayDefaults.set(row.field, items)
  }

  const enumVariantRows = await sql<Array<{ uuid: string; field: string; item_value: string }>>`
    SELECT field_enum_variant.uuid AS uuid, field_enum_variant.field AS field, field_enum_variant.item_value AS item_value
    FROM field_enum_variant
    INNER JOIN field ON field.uuid = field_enum_variant.field
    WHERE field.meta = ${src}
    ORDER BY field_enum_variant.position
  `

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
      await sql<Array<{ field: string; item_value: string }>>`
        SELECT field_enum_default.field AS field, field_enum_variant.item_value AS item_value
        FROM field_enum_default
        INNER JOIN field ON field.uuid = field_enum_default.field
        INNER JOIN field_enum_variant ON field_enum_variant.uuid = field_enum_default.variant
        WHERE field.meta = ${src}
      `
    ).map((row) => [row.field, row.item_value]),
  )

  const fields: GetFieldsResult["fields"] = {}
  const fieldKeys = new Map<string, string>()

  for (const row of fieldRows) {
    fieldKeys.set(row.uuid, row.key)

    const field = { type: row.type } as unknown as MetaFieldSchema
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

    fields[row.key] = field
  }

  return { fields, fieldKeys, enumVariants }
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

const getSuperposition = async (
  sql: SQL,
  src: string,
  enumVariants: Map<string, string>,
): Promise<NonNullable<MetaDSL["superposition"]> | undefined> => {
  const stateRows = await sql<Array<{ uuid: string; name: string }>>`
    SELECT uuid, name FROM superposition WHERE meta = ${src} ORDER BY position
  `
  if (stateRows.length === 0) return

  const superposition: NonNullable<MetaDSL["superposition"]> = {}
  const stateNames = new Map<string, string>()
  for (const row of stateRows) {
    stateNames.set(row.uuid, row.name)
    superposition[row.name] = {}
  }

  const transitionRows = await sql<Array<{ uuid: string; from_superposition: string; to_superposition: string }>>`
    SELECT uuid, from_superposition, to_superposition
    FROM transition
    WHERE from_superposition IN (SELECT uuid FROM superposition WHERE meta = ${src})
    ORDER BY position
  `

  const transitions = new Map<string, Record<string, unknown>>()
  for (const row of transitionRows) {
    const fromName = stateNames.get(row.from_superposition)
    const toName = stateNames.get(row.to_superposition)
    if (!fromName || !toName) continue

    const conditionSet: Record<string, unknown> = {}
    ;(superposition[fromName] as Record<string, unknown>)[toName] = conditionSet
    transitions.set(row.uuid, conditionSet)
  }

  const conditionRows = await sql<Array<{ uuid: string; transition: string; field_key: string }>>`
    SELECT condition.uuid AS uuid, condition.transition AS transition, field.key AS field_key
    FROM condition
    INNER JOIN field ON field.uuid = condition.field
    WHERE condition.transition IN (
      SELECT transition.uuid
      FROM transition
      INNER JOIN superposition ON superposition.uuid = transition.from_superposition
      WHERE superposition.meta = ${src}
    )
    ORDER BY condition.position
  `

  const predicateRows = await sql<PredicateRow[]>`
    SELECT uuid, condition, predicate_order, operator, value_kind, value_boolean, value_number, value_text, value_variant
    FROM condition_predicate
    WHERE condition IN (
      SELECT condition.uuid
      FROM condition
      INNER JOIN transition ON transition.uuid = condition.transition
      INNER JOIN superposition ON superposition.uuid = transition.from_superposition
      WHERE superposition.meta = ${src}
    )
    ORDER BY predicate_order
  `

  const listItemRows = await sql<ConditionListItemRow[]>`
    SELECT condition_list_item.predicate AS predicate,
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
      WHERE superposition.meta = ${src}
    )
    ORDER BY condition_list_item.item_order
  `

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

const getProcesses = async (
  sql: SQL,
  src: string,
  fieldKeys: Map<string, string>,
): Promise<NonNullable<MetaDSL["processes"]> | undefined> => {
  const processRows = await sql<ProcessRow[]>`
    SELECT uuid, key, type, label, desc
    FROM process
    WHERE meta = ${src}
    ORDER BY process.rowid
  `
  if (processRows.length === 0) return

  const envRows = await sql<Array<{ process: string; env: string }>>`
    SELECT process, env
    FROM process_env
    WHERE process IN (SELECT uuid FROM process WHERE meta = ${src})
    ORDER BY process_env.rowid
  `

  const envsByProcess = new Map<string, string[]>()
  for (const row of envRows) {
    const envs = envsByProcess.get(row.process) ?? []
    envs.push(row.env)
    envsByProcess.set(row.process, envs)
  }

  const actionRows = new Map(
    (
      await sql<ProcessActionRow[]>`
        SELECT process, action, action_import_specifier, action_wrapper_src, success, error
        FROM process_action
        WHERE process IN (SELECT uuid FROM process WHERE meta = ${src})
      `
    ).map((row) => [row.process, row]),
  )

  const actionReadRows = await sql<ProcessActionReadRow[]>`
    SELECT process_action_read.process AS process, process_action_read.phase AS phase, process_action_read.field AS field
    FROM process_action_read
    INNER JOIN process ON process.uuid = process_action_read.process
    WHERE process.meta = ${src}
    ORDER BY process_action_read.rowid
  `

  const actionWriteRows = await sql<ProcessActionWriteRow[]>`
    SELECT process_action_write.process AS process, process_action_write.phase AS phase, process_action_write.field AS field
    FROM process_action_write
    INNER JOIN process ON process.uuid = process_action_write.process
    WHERE process.meta = ${src}
    ORDER BY process_action_write.rowid
  `

  const finallyRows = new Map(
    (
      await sql<Array<{ process: string; before: string }>>`
        SELECT process, before
        FROM process_finally
        WHERE process IN (SELECT uuid FROM process WHERE meta = ${src})
      `
    ).map((row) => [row.process, row]),
  )

  const finallyReadRows = await sql<Array<{ process: string; field: string }>>`
    SELECT process_finally_read.process AS process, process_finally_read.field AS field
    FROM process_finally_read
    INNER JOIN process ON process.uuid = process_finally_read.process
    WHERE process.meta = ${src}
    ORDER BY process_finally_read.rowid
  `

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
      if (envs && envs.length > 0) process.env = envs as NonNullable<ParsedDestroy["env"]>
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
    if (actionRow.action_wrapper_src !== null) {
      process.action.wrapperSrc = actionRow.action_wrapper_src
    }
    const actionReads = reads.action
    if (actionReads && actionReads.length > 0) process.action.read = actionReads

    if (actionRow.success !== null) {
      process.success = {
        src: actionRow.success,
      }
      const successReads = reads.success
      const successWrites = writes.success
      if (successReads && successReads.length > 0) process.success.read = successReads
      if (successWrites && successWrites.length > 0) process.success.write = successWrites
    }

    if (actionRow.error !== null) {
      process.error = {
        src: actionRow.error,
      }
      const errorReads = reads.error
      const errorWrites = writes.error
      if (errorReads && errorReads.length > 0) process.error.read = errorReads
      if (errorWrites && errorWrites.length > 0) process.error.write = errorWrites
    }

    if (row.label !== null) process.label = row.label
    if (row.desc !== null) process.desc = row.desc

    const envs = envsByProcess.get(row.uuid)
    if (envs && envs.length > 0) process.env = envs as NonNullable<ParsedProcess["env"]>

    processes[row.key] = process
  }

  return processes
}

const getReactions = async (
  sql: SQL,
  src: string,
  fieldKeys: Map<string, string>,
): Promise<ReactionsSchema | undefined> => {
  const reactionRows = await sql<ReactionRow[]>`
    SELECT uuid, key, label, desc, cond_source, update_source
    FROM reaction
    WHERE meta = ${src}
    ORDER BY reaction.rowid
  `
  if (reactionRows.length === 0) return

  const reactionReads = await sql<Array<{ reaction: string; field: string }>>`
    SELECT reaction_read.reaction AS reaction, reaction_read.field AS field
    FROM reaction_read
    INNER JOIN reaction ON reaction.uuid = reaction_read.reaction
    WHERE reaction.meta = ${src}
    ORDER BY reaction_read.rowid
  `

  const reactionWrites = await sql<Array<{ reaction: string; field: string }>>`
    SELECT reaction_write.reaction AS reaction, reaction_write.field AS field
    FROM reaction_write
    INNER JOIN reaction ON reaction.uuid = reaction_write.reaction
    WHERE reaction.meta = ${src}
    ORDER BY reaction_write.rowid
  `

  const reactionStates = await sql<Array<{ reaction: string; state_name: string }>>`
    SELECT reaction_superposition.reaction AS reaction, superposition.name AS state_name
    FROM reaction_superposition
    INNER JOIN reaction ON reaction.uuid = reaction_superposition.reaction
    INNER JOIN superposition ON superposition.uuid = reaction_superposition.superposition
    WHERE reaction.meta = ${src}
    ORDER BY reaction_superposition.rowid
  `

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

export const readDarkParticleModel = async (sql: SQL, src: string): Promise<DarkMetaParticleModel | null> => {
  const metaRow = await getMetaRow(sql, src)

  if (!metaRow) return null

  const { fields, fieldKeys, enumVariants } = await getFields(sql, src)
  const metaMass = await getMass(sql, src)
  const superposition = await getSuperposition(sql, src, enumVariants)
  const processes = (await hasProcesses(sql, src)) ? ((await getProcesses(sql, src, fieldKeys)) ?? {}) : undefined
  const reactionsExist = await hasReactions(sql, src)
  const reactions = reactionsExist ? ((await getReactions(sql, src, fieldKeys)) ?? { reactions: {}, superposition: {} }) : undefined

  return {
    meta: {
      src,
      name: metaRow.name ?? src.split("/").pop() ?? src,
      fieldSchemas: fields,
      superposition: superposition ?? {},
      ...(processes !== undefined ? { processes } : {}),
      ...(reactions !== undefined ? { reactions } : {}),
      ...(metaRow.view_css !== null ? { bulk: { view: metaRow.view_css } as MetaDSL["bulk"] } : {}),
      ...(metaMass !== undefined && hasKeys(metaMass) ? { mass: metaMass } : {}),
    },
    particles: (await hasMatter(sql, src)) ? await getMatterParticles(sql, src) : [],
  }
}
