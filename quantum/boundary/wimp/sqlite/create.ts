import type {SQL, ReservedSQL} from "bun"
import type { WimpCreateInput, WimpCreateProcessInput } from "@boundary/types/wimp"
import type {MetaFieldDSL, MetaReactionDSL, MetaSuperpositionDSL} from "@metafor/types/metafor/schema"
import type { MatterBindingValue, MatterEdgeSlot, MatterParticle } from "@metafor/types/metafor/matter"

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const isRegExpDescriptor = (value: unknown): value is {source: string; flags: string} =>
  isRecord(value) &&
  Object.keys(value).length === 2 &&
  typeof value.source === "string" &&
  typeof value.flags === "string"

const EXECUTABLE_BINDING_RE = /=>|\bfunction\b|\bnew\s+|(?:\b[$A-Z_a-z][$\w]*|\]|\))\s*(?:\?\.)?\s*\(/

export const validateRuntimeMatterBinding = (
  value: unknown,
  domain: "mass" | "energy",
  label: string,
): void => {
  if (value === undefined || value === null) return
  if (typeof value === "string") {
    if (domain === "mass") throw new Error(`${label} must include normalized directMass metadata`)
    const source = value.trim()
    if (!source.startsWith("{") || !source.endsWith("}") || EXECUTABLE_BINDING_RE.test(source)) {
      throw new Error(`${label} must be a pure object projection`)
    }
    return
  }
  if (!isRecord(value)) throw new Error(`${label} must be a binding descriptor`)

  const rawPaths = value.data === undefined
    ? []
    : Array.isArray(value.data) ? value.data : [value.data]
  if (rawPaths.length === 0 || rawPaths.some((path) => typeof path !== "string")) {
    throw new Error(`${label} must declare a /${domain} dependency`)
  }
  for (const path of rawPaths as string[]) {
    const validRoot = path === `/${domain}` || path.startsWith(`/${domain}/`)
    if (!validRoot || path.includes("[item]") || path.includes("[index]") || path.includes("../")) {
      throw new Error(`${label} dependency must use /${domain}[/...] without map-relative context`)
    }
  }
  if (value.expr !== undefined && (
    typeof value.expr !== "string" || EXECUTABLE_BINDING_RE.test(value.expr)
  )) throw new Error(`${label} must not create executable resources`)

  if (domain === "energy") {
    if (value.directMass !== undefined) throw new Error(`${label} must not declare directMass metadata`)
    return
  }

  const direct = value.directMass
  if (!isRecord(direct)) throw new Error(`${label} must include normalized directMass metadata`)
  if (direct.kind === "whole") {
    if (rawPaths.length !== 1 || rawPaths[0] !== "/mass" || value.expr !== undefined) {
      throw new Error(`${label} whole directMass must depend only on /mass`)
    }
    return
  }
  if (direct.kind !== "keys" || !Array.isArray(direct.entries) || direct.entries.length === 0) {
    throw new Error(`${label} directMass must be whole or a non-empty key mapping`)
  }

  const sources = new Set(
    (rawPaths as string[])
      .filter((path) => /^\/mass\/[^/]+$/.test(path))
      .map((path) => path.slice("/mass/".length)),
  )
  const targets = new Set<string>()
  const mappedSources = new Set<string>()
  for (const entry of direct.entries) {
    if (
      !isRecord(entry) ||
      typeof entry.target !== "string" ||
      typeof entry.source !== "string" ||
      !/^[A-Za-z_$][\w$]*$/.test(entry.target) ||
      !/^[A-Za-z_$][\w$]*$/.test(entry.source) ||
      targets.has(entry.target) ||
      mappedSources.has(entry.source) ||
      !sources.has(entry.source)
    ) {
      throw new Error(`${label} directMass key mapping is invalid`)
    }
    targets.add(entry.target)
    mappedSources.add(entry.source)
  }
  if (mappedSources.size !== sources.size || direct.entries.length !== rawPaths.length) {
    throw new Error(`${label} directMass must map every declared /mass/<key> dependency exactly once`)
  }
}

const insertId = async (rows: Promise<Array<{id: number}>>, label: string): Promise<number> => {
  const row = (await rows)[0]
  if (!row) throw new Error(`${label}: insert did not return id`)
  return row.id
}

export const insertFieldDefault = async (
  sql: SQL | ReservedSQL,
  fieldId: number,
  field: MetaFieldDSL,
  enumVariants: Map<string, number>,
): Promise<void> => {
  if (field.default === undefined) return

  await sql`INSERT INTO field_default (field) VALUES (${fieldId})`

  if (field.type === "string") {
    await sql`INSERT INTO field_string_default (field, default_value) VALUES (${fieldId}, ${String(field.default)})`
  } else if (field.type === "number") {
    await sql`INSERT INTO field_number_default (field, default_value) VALUES (${fieldId}, ${Number(field.default)})`
  } else if (field.type === "boolean") {
    await sql`INSERT INTO field_boolean_default (field, default_value) VALUES (${fieldId}, ${field.default ? 1 : 0})`
  } else if (field.type === "array") {
    const values = Array.isArray(field.default) ? field.default : []
    for (let position = 0; position < values.length; position++) {
      await sql`
        INSERT INTO field_array_default_item (field, position, item_value)
        VALUES (${fieldId}, ${position}, ${String(values[position])})
      `
    }
  } else if (field.type === "enum") {
    const variantId = enumVariants.get(String(field.default))
    if (!variantId) throw new Error(`Enum default "${String(field.default)}" is not registered for field "${field.key}"`)
    await sql`INSERT INTO field_enum_default (field, variant) VALUES (${fieldId}, ${variantId})`
  }
}

const insertFields = async (
  sql: SQL | ReservedSQL,
  src: string,
  fields: readonly MetaFieldDSL[],
): Promise<Map<string, number>> => {
  const fieldIds = new Map<string, number>()

  for (const field of fields) {
    const fieldId = await insertId(sql<Array<{id: number}>>`
      INSERT INTO field (wimp, key, type, required, label)
      VALUES (${src}, ${field.key}, ${field.type}, ${field.required ? 1 : 0}, ${field.label ?? null})
      RETURNING id
    `, "insertFields")
    fieldIds.set(field.key, fieldId)

    const enumVariants = new Map<string, number>()
    if (field.type === "enum" && field.values !== undefined) {
      for (let position = 0; position < field.values.length; position++) {
        const value = String(field.values[position])
        const variantId = await insertId(sql<Array<{id: number}>>`
          INSERT INTO field_enum_variant (field, position, item_value)
          VALUES (${fieldId}, ${position}, ${value})
          RETURNING id
        `, "insertFields.enumVariant")
        enumVariants.set(value, variantId)
      }
    }

    await insertFieldDefault(sql, fieldId, field, enumVariants)
  }

  return fieldIds
}

const normalizePredicate = (predicate: unknown): Record<string, unknown> | undefined => {
  if (predicate === null) return {null: true}
  if (predicate instanceof RegExp) {
    return {pattern: {source: predicate.source, flags: predicate.flags}}
  }
  if (isRegExpDescriptor(predicate)) return {pattern: predicate}
  if (typeof predicate === "boolean" || typeof predicate === "number" || typeof predicate === "string") {
    return {eq: predicate}
  }
  if (Array.isArray(predicate)) return {eq: predicate}
  if (isRecord(predicate)) return predicate
  return undefined
}

const normalizeOperator = (operator: string): string => {
  if (operator === "logicalEq") return "eq"
  if (operator === "notEq") return "neq"
  if (operator === "notGt") return "lte"
  if (operator === "notGte") return "lt"
  if (operator === "notLt") return "gte"
  if (operator === "notLte") return "gt"
  if (operator === "oneOf") return "in"
  if (operator === "notIn" || operator === "notOneOf") return "not_in"
  if (operator === "includes") return "include"
  if (operator === "notInclude" || operator === "notIncludes") return "not_include"
  if (operator === "isEmpty") return "is_empty"
  if (operator === "startsWith") return "starts_with"
  if (operator === "endsWith") return "ends_with"
  if (operator === "notStartsWith") return "not_starts_with"
  if (operator === "notEndsWith") return "not_ends_with"
  return operator
}

const normalizeListItem = async (sql: SQL | ReservedSQL, fieldId: number | undefined, value: unknown): Promise<{
  kind: "null" | "boolean" | "number" | "string" | "enum"
  booleanValue: number | null
  numberValue: number | null
  textValue: string | null
  variantValue: number | null
}> => {
  if (value === null) return {kind: "null", booleanValue: null, numberValue: null, textValue: null, variantValue: null}
  if (typeof value === "boolean") return {kind: "boolean", booleanValue: value ? 1 : 0, numberValue: null, textValue: null, variantValue: null}
  if (typeof value === "number") return {kind: "number", booleanValue: null, numberValue: value, textValue: null, variantValue: null}
  if (fieldId !== undefined) {
    const variant = (await sql<Array<{id: number}>>`
      SELECT id FROM field_enum_variant WHERE field = ${fieldId} AND item_value = ${String(value)} LIMIT 1
    `)[0]
    if (variant) {
      return {kind: "enum", booleanValue: null, numberValue: null, textValue: null, variantValue: Number(variant.id)}
    }
  }
  return {kind: "string", booleanValue: null, numberValue: null, textValue: String(value), variantValue: null}
}

export const insertConditionPredicate = async (
  sql: SQL | ReservedSQL,
  conditionId: number,
  predicateOrder: number,
  op: string,
  value: unknown,
  fieldId?: number,
): Promise<number> => {
  let operator = normalizeOperator(op)
  let valueKind: "null" | "boolean" | "number" | "string" | "enum" | "list" | "json" = "null"
  let valueBoolean: number | null = null
  let valueNumber: number | null = null
  let valueText: string | null = null
  let valueVariant: number | null = null
  let valueJson: string | null = null

  if (op === "null") {
    operator = value === false ? "neq" : "eq"
  } else if (Array.isArray(value)) {
    valueKind = "list"
  } else if (typeof value === "boolean") {
    valueKind = "boolean"
    valueBoolean = value ? 1 : 0
  } else if (typeof value === "number") {
    valueKind = "number"
    valueNumber = value
  } else if (typeof value === "string") {
    const variant = fieldId === undefined ? undefined : (await sql<Array<{id: number}>>`
      SELECT id FROM field_enum_variant WHERE field = ${fieldId} AND item_value = ${value} LIMIT 1
    `)[0]
    if (variant) {
      valueKind = "enum"
      valueVariant = Number(variant.id)
    } else {
      valueKind = "string"
      valueText = value
    }
  } else if (value instanceof RegExp) {
    valueKind = "json"
    valueJson = JSON.stringify({source: value.source, flags: value.flags})
  } else if (isRecord(value)) {
    valueKind = "json"
    valueJson = JSON.stringify(value)
  } else {
    throw new Error(`Unsupported Boundary condition operand for '${op}'`)
  }

  const predicateId = await insertId(sql<Array<{id: number}>>`
    INSERT INTO condition_predicate (condition, predicate_order, subject_kind, operator,
                                     value_kind, value_boolean, value_number, value_text,
                                     value_variant, value_json)
    VALUES (${conditionId}, ${predicateOrder}, ${"value"}, ${operator},
            ${valueKind}, ${valueBoolean}, ${valueNumber}, ${valueText}, ${valueVariant}, ${valueJson})
    RETURNING id
  `, "insertPredicate")

  if (valueKind === "list" && Array.isArray(value)) {
    for (let itemOrder = 0; itemOrder < value.length; itemOrder++) {
      const item = await normalizeListItem(sql, fieldId, value[itemOrder])
      await sql`
        INSERT INTO condition_list_item
          (predicate, item_order, value_kind, value_boolean, value_number, value_text, value_variant)
        VALUES (${predicateId}, ${itemOrder}, ${item.kind}, ${item.booleanValue}, ${item.numberValue}, ${item.textValue}, ${item.variantValue})
      `
    }
  }
  return predicateId
}

export const insertPredicateGroup = async (
  sql: SQL | ReservedSQL,
  conditionId: number,
  predicateDsl: unknown,
  fieldId?: number,
): Promise<void> => {
  const normalized = normalizePredicate(predicateDsl)
  if (!normalized) {
    throw new Error("Boundary condition must be a scalar, array, RegExp or operator object")
  }
  if (Object.keys(normalized).length === 0) {
    throw new Error("Boundary condition must contain at least one operator")
  }

  let predicateOrder = 0
  for (const [op, value] of Object.entries(normalized)) {
    await insertConditionPredicate(sql, conditionId, predicateOrder, op, value, fieldId)
    predicateOrder++
  }
}

const insertConditions = async (
  sql: SQL | ReservedSQL,
  fieldIds: Map<string, number>,
  transitionId: number,
  conditions: unknown,
): Promise<void> => {
  if (!isRecord(conditions)) {
    throw new Error("Boundary Transition conditions must be an object")
  }

  let position = 0
  for (const [fieldKey, predicate] of Object.entries(conditions)) {
    const fieldId = fieldIds.get(fieldKey)
    if (!fieldId) {
      throw new Error(`Boundary condition references unknown Field '${fieldKey}'`)
    }

    const conditionId = await insertId(sql<Array<{id: number}>>`
      INSERT INTO condition (transition, field, position)
      VALUES (${transitionId}, ${fieldId}, ${position})
      RETURNING id
    `, "insertConditions")
    await insertPredicateGroup(sql, conditionId, predicate, fieldId)
    position++
  }
}

const insertStates = async (
  sql: SQL | ReservedSQL,
  src: string,
  fieldIds: Map<string, number>,
  states: readonly MetaSuperpositionDSL[],
): Promise<Map<string, number>> => {
  const stateIds = new Map<string, number>()

  for (let position = 0; position < states.length; position++) {
    const state = states[position]!
    const stateId = await insertId(sql<Array<{id: number}>>`
      INSERT INTO state (wimp, name, position)
      VALUES (${src}, ${state.name}, ${position})
      RETURNING id
    `, "insertStates")
    stateIds.set(state.name, stateId)
  }

  for (const state of states) {
    const fromId = stateIds.get(state.name)
    if (!fromId || !isRecord(state.transitions)) continue

    let position = 0
    for (const [toName, conditions] of Object.entries(state.transitions)) {
      const toId = stateIds.get(toName)
      if (!toId) continue

      const transitionId = await insertId(sql<Array<{id: number}>>`
        INSERT INTO transition (from_state, to_state, position)
        VALUES (${fromId}, ${toId}, ${position})
        RETURNING id
      `, "insertStates.transition")
      await insertConditions(sql, fieldIds, transitionId, conditions)
      position++
    }
  }

  return stateIds
}

const insertProcessFieldLinks = async (
  sql: SQL | ReservedSQL,
  table: "process_action_read" | "process_action_write" | "process_finally_read",
  processId: number,
  fieldIds: Map<string, number>,
  fieldKeys: readonly string[] | undefined,
  phase?: "action" | "success" | "error",
): Promise<void> => {
  for (const fieldKey of fieldKeys ?? []) {
    const fieldId = fieldIds.get(fieldKey)
    if (!fieldId) continue

    if (table === "process_action_read") {
      await sql`INSERT OR IGNORE INTO process_action_read (process, field, phase) VALUES (${processId}, ${fieldId}, ${phase ?? null})`
    } else if (table === "process_action_write") {
      await sql`INSERT OR IGNORE INTO process_action_write (process, field, phase) VALUES (${processId}, ${fieldId}, ${phase ?? null})`
    } else {
      await sql`INSERT OR IGNORE INTO process_finally_read (process, field) VALUES (${processId}, ${fieldId})`
    }
  }
}

const insertProcesses = async (
  sql: SQL | ReservedSQL,
  src: string,
  fieldIds: Map<string, number>,
  processes: readonly WimpCreateProcessInput[],
): Promise<void> => {
  for (const {key, declaration} of processes) {
    const type = declaration.type === "finally" ? "finally" : "action"
    const processId = await insertId(sql<Array<{id: number}>>`
      INSERT INTO process (wimp, key, type, label, desc)
      VALUES (${src}, ${key}, ${type}, ${declaration.label ?? null}, ${declaration.desc ?? null})
      RETURNING id
    `, "insertProcesses")

    for (const env of declaration.env ?? []) {
      await sql`INSERT OR IGNORE INTO process_env (process, env) VALUES (${processId}, ${env})`
    }

    if (declaration.type === "finally") {
      await sql`INSERT INTO process_finally (process, before) VALUES (${processId}, ${declaration.before.src})`
      await insertProcessFieldLinks(sql, "process_finally_read", processId, fieldIds, declaration.before.read)
      continue
    }

    await sql`
      INSERT INTO process_action (process, action, action_import_specifier, action_wrapper_src, success, error)
      VALUES (${processId}, ${declaration.action.src}, ${declaration.action.importSpecifier ?? null},
              ${declaration.action.wrapperSrc ?? null}, ${declaration.success?.src ?? null}, ${declaration.error?.src ?? null})
    `
    await insertProcessFieldLinks(sql, "process_action_read", processId, fieldIds, declaration.action.read, "action")
    await insertProcessFieldLinks(sql, "process_action_read", processId, fieldIds, declaration.success?.read, "success")
    await insertProcessFieldLinks(sql, "process_action_read", processId, fieldIds, declaration.error?.read, "error")
    await insertProcessFieldLinks(sql, "process_action_write", processId, fieldIds, declaration.success?.write, "success")
    await insertProcessFieldLinks(sql, "process_action_write", processId, fieldIds, declaration.error?.write, "error")
  }
}

const insertReactions = async (
  sql: SQL | ReservedSQL,
  src: string,
  fieldIds: Map<string, number>,
  stateIds: Map<string, number>,
  reactions: readonly MetaReactionDSL[],
): Promise<void> => {
  for (const reaction of reactions) {
    const reactionId = await insertId(sql<Array<{id: number}>>`
      INSERT INTO reaction (wimp, key, label, desc, sources_json, update_source)
      VALUES (${src}, ${reaction.key}, ${reaction.label}, ${reaction.desc ?? null}, ${JSON.stringify(reaction.sources)}, ${reaction.src})
      RETURNING id
    `, "insertReactions")

    for (let selectorOrder = 0; selectorOrder < reaction.sources.length; selectorOrder++) {
      const selector = reaction.sources[selectorOrder]!
      await sql`
        INSERT INTO reaction_source_selector (reaction, selector_order, atom_ref, meta, relation)
        VALUES (${reactionId}, ${selectorOrder}, ${selector.atom ?? null}, ${selector.meta ?? null}, ${selector.relation ?? null})
      `
      for (let stateOrder = 0; stateOrder < selector.states.length; stateOrder++) {
        await sql`
          INSERT INTO reaction_source_state (reaction, selector_order, state_order, state)
          VALUES (${reactionId}, ${selectorOrder}, ${stateOrder}, ${selector.states[stateOrder]!})
        `
      }
    }

    for (const fieldKey of reaction.read ?? []) {
      const fieldId = fieldIds.get(fieldKey)
      if (!fieldId) throw new Error(`Reaction "${reaction.key}" references unavailable Field "${fieldKey}"`)
      await sql`INSERT OR IGNORE INTO reaction_read (reaction, field) VALUES (${reactionId}, ${fieldId})`
    }
    for (const fieldKey of reaction.write ?? []) {
      const fieldId = fieldIds.get(fieldKey)
      if (!fieldId) continue
      const type = (await sql<Array<{type: string}>>`SELECT type FROM field WHERE id = ${fieldId}`)[0]?.type
      if (type === "enum" || type === "array") {
        throw new Error(`Reaction "${reaction.key}" cannot write topology Field "${fieldKey}"`)
      }
      await sql`INSERT OR IGNORE INTO reaction_write (reaction, field) VALUES (${reactionId}, ${fieldId})`
    }
    for (const [table, keys] of [
      ["reaction_mass_read", reaction.massRead ?? []],
      ["reaction_mass_write", reaction.massWrite ?? []],
    ] as const) for (const key of keys) {
      const mass = (await sql<Array<{id: number}>>`
        SELECT id FROM mass_declaration
         WHERE wimp = ${src} AND local_key = ${key} AND active = 1
         LIMIT 1
      `)[0]
      if (!mass) throw new Error(`Reaction "${reaction.key}" references unavailable Mass "${key}"`)
      await sql.unsafe(`INSERT OR IGNORE INTO ${table} (reaction, mass) VALUES (?, ?)`, [reactionId, mass.id])
    }
    for (const stateName of reaction.states ?? []) {
      const stateId = stateIds.get(stateName)
      if (!stateId) throw new Error(`Reaction "${reaction.key}" references unavailable target State "${stateName}"`)
      await sql`INSERT OR IGNORE INTO reaction_state (reaction, state) VALUES (${reactionId}, ${stateId})`
    }
  }
}

const matterBindingPaths = (value: MatterBindingValue): string[] => {
  if (typeof value === "string" || value.data === undefined) return []
  return Array.isArray(value.data) ? value.data : [value.data]
}

export const insertMatterBinding = async (
  sql: SQL | ReservedSQL,
  src: string,
  value: MatterBindingValue | undefined,
): Promise<number | null> => {
  if (value === undefined) return null

  if (typeof value === "string") {
    return insertId(sql<Array<{id: number}>>`
      INSERT INTO matter_binding (wimp, binding_kind, literal_kind, literal_text)
      VALUES (${src}, ${"static"}, ${"text"}, ${value})
      RETURNING id
    `, "insertMatterBinding.static")
  }

  const id = await insertId(sql<Array<{id: number}>>`
    INSERT INTO matter_binding (wimp, binding_kind, expr)
    VALUES (${src}, ${value.expr !== undefined ? "dynamic" : "variable"}, ${value.expr ?? null})
    RETURNING id
  `, "insertMatterBinding")

  const paths = matterBindingPaths(value)
  for (let index = 0; index < paths.length; index++) {
    await sql`INSERT INTO matter_binding_dep (binding, dep_order, path) VALUES (${id}, ${index}, ${paths[index]!})`
  }
  if (value.directMass !== undefined) {
    await sql`INSERT INTO matter_binding_direct_mass (binding, kind) VALUES (${id}, ${value.directMass.kind})`
    if (value.directMass.kind === "keys") for (const [index, entry] of value.directMass.entries.entries()) {
      await sql`INSERT INTO matter_binding_direct_mass_key (binding, key_order, target_key, source_key) VALUES (${id}, ${index}, ${entry.target}, ${entry.source})`
    }
  }

  return id
}

const insertMatterParticle = async (
  sql: SQL | ReservedSQL,
  src: string,
  particle: MatterParticle,
  parentParticle: number | null,
  edgeSlot: MatterEdgeSlot,
  particleOrder: number,
): Promise<number> => {
  const id = await insertId(sql<Array<{id: number}>>`
    INSERT INTO matter_particle (wimp, parent_particle, particle_kind, edge_slot, particle_order)
    VALUES (${src}, ${parentParticle}, ${particle.kind}, ${edgeSlot}, ${particleOrder})
    RETURNING id
  `, "insertMatterParticle")

  if (particle.kind === "wimp") {
    validateRuntimeMatterBinding(particle.massBinding, "mass", "Matter massBinding")
    validateRuntimeMatterBinding(particle.energyBinding, "energy", "Matter energyBinding")
    await sql`
      INSERT INTO matter_particle_wimp (particle, src, fields_binding, mass_binding, energy_binding)
      VALUES (
        ${id}, ${particle.src},
        ${await insertMatterBinding(sql, src, particle.fieldsBinding)},
        ${await insertMatterBinding(sql, src, particle.massBinding)},
        ${await insertMatterBinding(sql, src, particle.energyBinding)}
      )
    `
  } else if (particle.kind === "fuzzy") {
    await sql`
      INSERT INTO matter_particle_fuzzy (particle, fuzzy_kind, predicate_binding)
      VALUES (${id}, ${particle.fuzzyKind}, ${await insertMatterBinding(sql, src, particle.predicateBinding)})
    `
  } else if (particle.kind === "axion") {
    await sql`
      INSERT INTO matter_particle_axion (particle, predicate_binding)
      VALUES (${id}, ${await insertMatterBinding(sql, src, particle.predicateBinding)})
    `
  } else {
    await sql`
      INSERT INTO matter_particle_macho (particle, collection_binding)
      VALUES (${id}, ${await insertMatterBinding(sql, src, particle.collectionBinding)})
    `
  }

  for (let index = 0; index < (particle.children?.length ?? 0); index++) {
    const child = particle.children![index]!
    await insertMatterParticle(sql, src, child.particle, id, child.edgeSlot, index)
  }

  return id
}

const insertMatter = async (sql: SQL | ReservedSQL, src: string, matter: readonly MatterParticle[]): Promise<void> => {
  for (let index = 0; index < matter.length; index++) {
    await insertMatterParticle(sql, src, matter[index]!, null, "root", index)
  }
}

export const writeWimpCreate = async (sql: SQL | ReservedSQL, src: string, input: WimpCreateInput): Promise<void> => {
  await sql`
    INSERT INTO wimp (src, name, desc, view_css)
    VALUES (${src}, ${input.name ?? null}, ${input.desc ?? null}, ${input.bulk?.view ?? null})
  `

  const fieldIds = await insertFields(sql, src, input.fields ?? [])
  const stateIds = await insertStates(sql, src, fieldIds, input.superposition ?? [])
  await insertProcesses(sql, src, fieldIds, input.processes ?? [])
  await insertReactions(sql, src, fieldIds, stateIds, input.reactions ?? [])
  await insertMatter(sql, src, input.matter ?? [])
}
