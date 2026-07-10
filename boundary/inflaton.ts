import type {ReservedSQL, SQL} from "bun"
import type {ForceMessage} from "@metafor/types/force/message"
import type {Particle} from "@metafor/types/force/particle"
import type {MetaFieldDSL} from "@metafor/types/metafor/schema"
import type {MatterBindingValue, MatterEdgeSlot, MatterParticleKind} from "@metafor/types/metafor/matter"
import {insertFieldDefault, insertMassValue, insertMatterBinding, insertPredicateGroup} from "./wimp/sqlite/create.ts"

type Database = SQL | ReservedSQL
type RecordValue = Record<string, unknown>

interface DeclarationUpdate {
  src: string
  remove: boolean
  sections: Map<string, unknown>
}

const declarationSections = new Set([
  "meta", "fields", "variants", "states", "transitions", "conditions",
  "processes", "reactions", "matter", "mass", "bulk",
])

export interface InflatonCommit {
  rootSrc: string
  graviton: ForceMessage
}

export const migrateDeclarationIds = async (sql: SQL): Promise<void> => {
  const columns: Array<[string, string]> = [
    ["field", "local_id"],
    ["field_enum_variant", "wimp"],
    ["field_enum_variant", "local_id"],
    ["state", "local_id"],
    ["transition", "wimp"],
    ["transition", "local_id"],
    ["condition", "wimp"],
    ["condition", "local_id"],
    ["process", "local_id"],
    ["reaction", "local_id"],
    ["matter_particle", "local_id"],
  ]
  for (const [table, column] of columns) {
    const existing = await sql.unsafe<Array<{name: string}>>(`PRAGMA table_info(${table})`)
    if (!existing.some((item) => item.name === column)) {
      await sql.unsafe(`ALTER TABLE ${table} ADD COLUMN ${column} ${column === "wimp" ? "TEXT" : "INTEGER"}`)
    }
  }
  for (const [name, table] of [
    ["field_by_declaration", "field"],
    ["variant_by_declaration", "field_enum_variant"],
    ["state_by_declaration", "state"],
    ["transition_by_declaration", "transition"],
    ["condition_by_declaration", "condition"],
    ["process_by_declaration", "process"],
    ["reaction_by_declaration", "reaction"],
    ["matter_by_declaration", "matter_particle"],
  ] as const) {
    await sql.unsafe(`CREATE UNIQUE INDEX IF NOT EXISTS ${name} ON ${table} (wimp, local_id) WHERE local_id IS NOT NULL`)
  }
}

const isRecord = (value: unknown): value is RecordValue =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const record = (value: unknown, label: string): RecordValue => {
  if (!isRecord(value)) throw new Error(`${label} must be an object`)
  return value
}

const string = (value: unknown, label: string): string => {
  if (typeof value !== "string") throw new Error(`${label} must be a string`)
  return value
}

const nullableString = (value: unknown, label: string): string | null => {
  if (value === undefined || value === null) return null
  return string(value, label)
}

const integer = (value: unknown, label: string): number => {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer`)
  }
  return value
}

const localNumber = (value: string, label: string): number => {
  if (!/^[1-9]\d*$/.test(value)) throw new Error(`${label} must be a positive decimal local number`)
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed)) throw new Error(`${label} exceeds the safe integer range`)
  return parsed
}

/** Stable numeric projection of the declaration identity `(wimp src, local number)`. */
export const declarationId = (src: string, local: string | number): number => {
  const localText = String(typeof local === "number" ? local : localNumber(local, "declaration id"))
  let hash = 0xcbf29ce484222325n
  for (const codeUnit of `${src}\0${localText}`) {
    hash ^= BigInt(codeUnit.charCodeAt(0))
    hash = BigInt.asUintN(64, hash * 0x100000001b3n)
  }
  return Number(hash & 0xfffffffffffffn) || 1
}

const entries = (value: unknown, label: string): Array<[string, RecordValue]> =>
  Object.entries(record(value, label)).map(([local, item]) => {
    localNumber(local, `${label}.${local}`)
    return [local, record(item, `${label}.${local}`)]
  })

const referenceId = (src: string, value: unknown, label: string): number =>
  declarationId(src, string(value, label))

const collectUpdates = (message: ForceMessage): DeclarationUpdate[] => {
  const updates = new Map<string, DeclarationUpdate>()

  for (const part of message.parts) {
    if (part.part !== "inflaton" || part.op === "test") continue
    if (part.op !== "add" && part.op !== "replace" && part.op !== "remove") {
      throw new Error(`inflaton/${part.op} is not supported`)
    }
    const src = string(part.path, "inflaton.path")
    let update = updates.get(src)
    if (!update) {
      update = {src, remove: false, sections: new Map()}
      updates.set(src, update)
    }
    if (part.op === "remove") {
      update.remove = true
      update.sections.clear()
      continue
    }
    for (const [section, value] of Object.entries(record(part.value, `inflaton ${src}`))) {
      if (!declarationSections.has(section)) throw new Error(`Unknown inflaton declaration section "${section}"`)
      const previous = update.sections.get(section)
      update.sections.set(
        section,
        section !== "mass" && section !== "bulk" && isRecord(previous) && isRecord(value)
          ? {...previous, ...value}
          : value,
      )
    }
  }

  return [...updates.values()]
}

const replaceFields = async (
  sql: Database,
  src: string,
  value: unknown,
): Promise<Array<{id: number; field: MetaFieldDSL}>> => {
  const declarations = entries(value, `${src}.fields`)
  const declarationIds = new Set(declarations.map(([local]) => declarationId(src, local)))
  for (const row of await sql<Array<{id: number}>>`SELECT id FROM field WHERE wimp = ${src}`) {
    if (!declarationIds.has(Number(row.id))) await sql`DELETE FROM field WHERE id = ${row.id}`
  }
  const defaults: Array<{id: number; field: MetaFieldDSL}> = []

  for (const [local, item] of declarations) {
    const type = string(item.type, `${src}.fields.${local}.type`)
    if (type !== "string" && type !== "number" && type !== "boolean" && type !== "array" && type !== "enum") {
      throw new Error(`${src}.fields.${local}.type is not supported`)
    }
    const id = declarationId(src, local)
    const field: MetaFieldDSL = {
      key: string(item.key, `${src}.fields.${local}.key`),
      type,
      required: item.required === true,
      ...(item.label === undefined || item.label === null ? {} : {label: string(item.label, `${src}.fields.${local}.label`)}),
      ...(Object.prototype.hasOwnProperty.call(item, "default") ? {default: item.default} : {}),
    } as MetaFieldDSL
    await sql`
      INSERT INTO field (id, wimp, local_id, key, type, required, label)
      VALUES (${id}, ${src}, ${localNumber(local, "field local id")}, ${field.key}, ${field.type}, ${field.required ? 1 : 0}, ${field.label ?? null})
      ON CONFLICT (id) DO UPDATE SET
        wimp = excluded.wimp,
        local_id = excluded.local_id,
        key = excluded.key,
        type = excluded.type,
        required = excluded.required,
        label = excluded.label
    `
    await sql`DELETE FROM field_default WHERE field = ${id}`
    if (field.type !== "enum") await sql`DELETE FROM field_enum_variant WHERE field = ${id}`
    defaults.push({id, field})
  }

  return defaults
}

const replaceVariants = async (sql: Database, src: string, value: unknown): Promise<void> => {
  const declarations = entries(value, `${src}.variants`)
  const declarationIds = new Set(declarations.map(([local]) => declarationId(src, local)))
  for (const row of await sql<Array<{id: number}>>`
    SELECT id FROM field_enum_variant
    WHERE wimp = ${src} OR field IN (SELECT id FROM field WHERE wimp = ${src})
  `) {
    if (!declarationIds.has(Number(row.id))) await sql`DELETE FROM field_enum_variant WHERE id = ${row.id}`
  }
  for (const [local, item] of declarations) {
    await sql`
      INSERT INTO field_enum_variant (id, wimp, local_id, field, position, item_value)
      VALUES (
        ${declarationId(src, local)}, ${src}, ${localNumber(local, "variant local id")},
        ${referenceId(src, item.field, `${src}.variants.${local}.field`)},
        ${integer(item.position, `${src}.variants.${local}.position`)},
        ${string(item.value, `${src}.variants.${local}.value`)}
      )
      ON CONFLICT (id) DO UPDATE SET
        wimp = excluded.wimp,
        local_id = excluded.local_id,
        field = excluded.field,
        position = excluded.position,
        item_value = excluded.item_value
    `
  }
}

const writeFieldDefaults = async (
  sql: Database,
  defaults: Array<{id: number; field: MetaFieldDSL}>,
): Promise<void> => {
  for (const {id, field} of defaults) {
    const variants = new Map<string, number>()
    if (field.type === "enum") {
      for (const row of await sql<Array<{id: number; item_value: string}>>`
        SELECT id, item_value FROM field_enum_variant WHERE field = ${id}
      `) variants.set(row.item_value, Number(row.id))
    }
    await insertFieldDefault(sql, id, field, variants)
  }
}

const replaceStates = async (sql: Database, src: string, value: unknown): Promise<void> => {
  const declarations = entries(value, `${src}.states`)
  const declarationIds = new Set(declarations.map(([local]) => declarationId(src, local)))
  for (const row of await sql<Array<{id: number}>>`SELECT id FROM state WHERE wimp = ${src}`) {
    if (!declarationIds.has(Number(row.id))) await sql`DELETE FROM state WHERE id = ${row.id}`
  }
  for (const [local, item] of declarations) {
    await sql`
      INSERT INTO state (id, wimp, local_id, name, position)
      VALUES (
        ${declarationId(src, local)}, ${src}, ${localNumber(local, "state local id")},
        ${string(item.name, `${src}.states.${local}.name`)},
        ${integer(item.position, `${src}.states.${local}.position`)}
      )
      ON CONFLICT (id) DO UPDATE SET
        wimp = excluded.wimp,
        local_id = excluded.local_id,
        name = excluded.name,
        position = excluded.position
    `
  }
}

const replaceTransitions = async (sql: Database, src: string, value: unknown): Promise<void> => {
  const declarations = entries(value, `${src}.transitions`)
  const declarationIds = new Set(declarations.map(([local]) => declarationId(src, local)))
  for (const row of await sql<Array<{id: number}>>`
    SELECT id FROM transition
    WHERE wimp = ${src} OR from_state IN (SELECT id FROM state WHERE wimp = ${src})
  `) {
    if (!declarationIds.has(Number(row.id))) await sql`DELETE FROM transition WHERE id = ${row.id}`
  }
  for (const [local, item] of declarations) {
    await sql`
      INSERT INTO transition (id, wimp, local_id, from_state, to_state, position)
      VALUES (
        ${declarationId(src, local)}, ${src}, ${localNumber(local, "transition local id")},
        ${referenceId(src, item.from, `${src}.transitions.${local}.from`)},
        ${referenceId(src, item.to, `${src}.transitions.${local}.to`)},
        ${integer(item.position, `${src}.transitions.${local}.position`)}
      )
      ON CONFLICT (id) DO UPDATE SET
        wimp = excluded.wimp,
        local_id = excluded.local_id,
        from_state = excluded.from_state,
        to_state = excluded.to_state,
        position = excluded.position
    `
  }
}

const replaceConditions = async (sql: Database, src: string, value: unknown): Promise<void> => {
  const declarations = entries(value, `${src}.conditions`)
  const declarationIds = new Set(declarations.map(([local]) => declarationId(src, local)))
  for (const row of await sql<Array<{id: number}>>`
    SELECT id FROM condition
    WHERE wimp = ${src} OR transition IN (SELECT id FROM transition WHERE wimp = ${src})
  `) {
    if (!declarationIds.has(Number(row.id))) await sql`DELETE FROM condition WHERE id = ${row.id}`
  }
  for (const [local, item] of declarations) {
    const id = declarationId(src, local)
    await sql`
      INSERT INTO condition (id, wimp, local_id, transition, field, position)
      VALUES (
        ${id}, ${src}, ${localNumber(local, "condition local id")},
        ${referenceId(src, item.transition, `${src}.conditions.${local}.transition`)},
        ${referenceId(src, item.field, `${src}.conditions.${local}.field`)},
        ${integer(item.position, `${src}.conditions.${local}.position`)}
      )
      ON CONFLICT (id) DO UPDATE SET
        wimp = excluded.wimp,
        local_id = excluded.local_id,
        transition = excluded.transition,
        field = excluded.field,
        position = excluded.position
    `
    await sql`DELETE FROM condition_predicate WHERE condition = ${id}`
    await insertPredicateGroup(sql, id, item.predicate)
  }
}

const insertFieldLinks = async (
  sql: Database,
  src: string,
  process: number,
  table: "process_action_read" | "process_action_write" | "process_finally_read",
  values: unknown,
  phase?: "action" | "success" | "error",
): Promise<void> => {
  if (values === undefined || values === null) return
  if (!Array.isArray(values)) throw new Error(`${src}.${table} must be an array`)
  for (const value of values) {
    const field = referenceId(src, value, `${src}.${table}.field`)
    if (table === "process_action_read") {
      await sql`INSERT INTO process_action_read (process, field, phase) VALUES (${process}, ${field}, ${phase!})`
    } else if (table === "process_action_write") {
      await sql`INSERT INTO process_action_write (process, field, phase) VALUES (${process}, ${field}, ${phase!})`
    } else {
      await sql`INSERT INTO process_finally_read (process, field) VALUES (${process}, ${field})`
    }
  }
}

const replaceProcesses = async (sql: Database, src: string, value: unknown): Promise<void> => {
  const declarations = entries(value, `${src}.processes`)
  const declarationIds = new Set(declarations.map(([local]) => declarationId(src, local)))
  for (const row of await sql<Array<{id: number}>>`SELECT id FROM process WHERE wimp = ${src}`) {
    if (!declarationIds.has(Number(row.id))) await sql`DELETE FROM process WHERE id = ${row.id}`
  }
  for (const [local, item] of declarations) {
    const id = declarationId(src, local)
    const type = string(item.type, `${src}.processes.${local}.type`)
    if (type !== "action" && type !== "finally") throw new Error(`${src}.processes.${local}.type is not supported`)
    await sql`
      INSERT INTO process (id, wimp, local_id, key, type, label, desc)
      VALUES (
        ${id}, ${src}, ${localNumber(local, "process local id")},
        ${string(item.key, `${src}.processes.${local}.key`)}, ${type},
        ${nullableString(item.label, `${src}.processes.${local}.label`)},
        ${nullableString(item.desc, `${src}.processes.${local}.desc`)}
      )
      ON CONFLICT (id) DO UPDATE SET
        wimp = excluded.wimp,
        local_id = excluded.local_id,
        key = excluded.key,
        type = excluded.type,
        label = excluded.label,
        desc = excluded.desc
    `
    await sql`DELETE FROM process_env WHERE process = ${id}`
    await sql`DELETE FROM process_action WHERE process = ${id}`
    await sql`DELETE FROM process_finally WHERE process = ${id}`

    if (item.env !== undefined && item.env !== null) {
      if (!Array.isArray(item.env)) throw new Error(`${src}.processes.${local}.env must be an array`)
      for (const envValue of item.env) {
        const env = string(envValue, `${src}.processes.${local}.env`)
        await sql`INSERT INTO process_env (process, env) VALUES (${id}, ${env})`
      }
    }

    if (type === "finally") {
      const before = record(item.before, `${src}.processes.${local}.before`)
      await sql`INSERT INTO process_finally (process, before) VALUES (${id}, ${string(before.src, `${src}.processes.${local}.before.src`)})`
      await insertFieldLinks(sql, src, id, "process_finally_read", before.read)
      continue
    }

    const action = record(item.action, `${src}.processes.${local}.action`)
    const success = item.success === undefined || item.success === null ? null : record(item.success, `${src}.processes.${local}.success`)
    const error = item.error === undefined || item.error === null ? null : record(item.error, `${src}.processes.${local}.error`)
    await sql`
      INSERT INTO process_action (process, action, action_import_specifier, action_wrapper_src, success, error)
      VALUES (
        ${id}, ${string(action.src, `${src}.processes.${local}.action.src`)},
        ${nullableString(action.importSpecifier, `${src}.processes.${local}.action.importSpecifier`)},
        ${nullableString(action.wrapperSrc, `${src}.processes.${local}.action.wrapperSrc`)},
        ${success ? string(success.src, `${src}.processes.${local}.success.src`) : null},
        ${error ? string(error.src, `${src}.processes.${local}.error.src`) : null}
      )
    `
    await insertFieldLinks(sql, src, id, "process_action_read", action.read, "action")
    if (success) {
      await insertFieldLinks(sql, src, id, "process_action_read", success.read, "success")
      await insertFieldLinks(sql, src, id, "process_action_write", success.write, "success")
    }
    if (error) {
      await insertFieldLinks(sql, src, id, "process_action_read", error.read, "error")
      await insertFieldLinks(sql, src, id, "process_action_write", error.write, "error")
    }
  }
}

const replaceReactions = async (sql: Database, src: string, value: unknown): Promise<void> => {
  const declarations = entries(value, `${src}.reactions`)
  const declarationIds = new Set(declarations.map(([local]) => declarationId(src, local)))
  for (const row of await sql<Array<{id: number}>>`SELECT id FROM reaction WHERE wimp = ${src}`) {
    if (!declarationIds.has(Number(row.id))) await sql`DELETE FROM reaction WHERE id = ${row.id}`
  }
  for (const [local, item] of declarations) {
    const id = declarationId(src, local)
    await sql`
      INSERT INTO reaction (id, wimp, local_id, key, label, desc, cond_source, update_source)
      VALUES (
        ${id}, ${src}, ${localNumber(local, "reaction local id")},
        ${string(item.key, `${src}.reactions.${local}.key`)},
        ${string(item.label, `${src}.reactions.${local}.label`)},
        ${nullableString(item.desc, `${src}.reactions.${local}.desc`)},
        ${string(item.cond, `${src}.reactions.${local}.cond`)},
        ${string(item.src, `${src}.reactions.${local}.src`)}
      )
      ON CONFLICT (id) DO UPDATE SET
        wimp = excluded.wimp,
        local_id = excluded.local_id,
        key = excluded.key,
        label = excluded.label,
        desc = excluded.desc,
        cond_source = excluded.cond_source,
        update_source = excluded.update_source
    `
    await sql`DELETE FROM reaction_read WHERE reaction = ${id}`
    await sql`DELETE FROM reaction_write WHERE reaction = ${id}`
    await sql`DELETE FROM reaction_state WHERE reaction = ${id}`
    for (const [table, values] of [["reaction_read", item.read], ["reaction_write", item.write]] as const) {
      if (values === undefined || values === null) continue
      if (!Array.isArray(values)) throw new Error(`${src}.reactions.${local}.${table} must be an array`)
      for (const field of values) {
        await sql.unsafe(`INSERT INTO ${table} (reaction, field) VALUES (?, ?)`, [id, referenceId(src, field, `${src}.${table}.field`)])
      }
    }
    if (item.states !== undefined && item.states !== null) {
      if (!Array.isArray(item.states)) throw new Error(`${src}.reactions.${local}.states must be an array`)
      for (const state of item.states) {
        await sql`INSERT INTO reaction_state (reaction, state) VALUES (${id}, ${referenceId(src, state, `${src}.reaction_state.state`)})`
      }
    }
  }
}

const storeBinding = async (sql: Database, src: string, value: unknown): Promise<number | null> => {
  if (value === undefined || value === null) return null
  if (typeof value === "boolean") {
    const row = (await sql<Array<{id: number}>>`
      INSERT INTO matter_binding (wimp, binding_kind, literal_kind, literal_boolean)
      VALUES (${src}, ${"static"}, ${"boolean"}, ${value ? 1 : 0}) RETURNING id
    `)[0]
    if (!row) throw new Error(`${src}.matter binding insert did not return id`)
    return Number(row.id)
  }
  if (typeof value !== "string" && !isRecord(value)) throw new Error(`${src}.matter binding is invalid`)
  return insertMatterBinding(sql, src, value as MatterBindingValue)
}

const replaceMatter = async (sql: Database, src: string, value: unknown): Promise<void> => {
  await sql`DELETE FROM matter_particle WHERE wimp = ${src}`
  await sql`DELETE FROM matter_binding WHERE wimp = ${src}`
  const pending = entries(value, `${src}.matter`)
  const inserted = new Set<string>()

  while (pending.length > 0) {
    const index = pending.findIndex(([, item]) => item.parent === null || inserted.has(string(item.parent, `${src}.matter.parent`)))
    if (index < 0) throw new Error(`${src}.matter contains an unknown or cyclic parent`)
    const next = pending.splice(index, 1)[0]
    if (!next) throw new Error(`${src}.matter insert queue is empty`)
    const [local, item] = next
    const kind = string(item.kind, `${src}.matter.${local}.kind`) as MatterParticleKind
    if (kind !== "wimp" && kind !== "fuzzy" && kind !== "axion" && kind !== "macho") {
      throw new Error(`${src}.matter.${local}.kind is not supported`)
    }
    const parent = item.parent === null ? null : referenceId(src, item.parent, `${src}.matter.${local}.parent`)
    const edgeSlot = string(item.edgeSlot, `${src}.matter.${local}.edgeSlot`) as MatterEdgeSlot
    const id = declarationId(src, local)
    await sql`
      INSERT INTO matter_particle (id, wimp, local_id, parent_particle, particle_kind, edge_slot, particle_order)
      VALUES (
        ${id}, ${src}, ${localNumber(local, "matter local id")}, ${parent}, ${kind}, ${edgeSlot},
        ${integer(item.position, `${src}.matter.${local}.position`)}
      )
    `
    if (kind === "wimp") {
      await sql`
        INSERT INTO matter_particle_wimp (particle, src, fields_binding, mass_binding)
        VALUES (
          ${id}, ${string(item.src, `${src}.matter.${local}.src`)},
          ${await storeBinding(sql, src, item.fieldsBinding)}, ${await storeBinding(sql, src, item.massBinding)}
        )
      `
    } else if (kind === "fuzzy") {
      const fuzzyKind = string(item.fuzzyKind, `${src}.matter.${local}.fuzzyKind`)
      await sql`
        INSERT INTO matter_particle_fuzzy (particle, fuzzy_kind, predicate_binding)
        VALUES (${id}, ${fuzzyKind}, ${await storeBinding(sql, src, item.predicateBinding)})
      `
    } else if (kind === "axion") {
      const binding = await storeBinding(sql, src, item.predicateBinding)
      if (binding === null) throw new Error(`${src}.matter.${local}.predicateBinding is required`)
      await sql`INSERT INTO matter_particle_axion (particle, predicate_binding) VALUES (${id}, ${binding})`
    } else {
      const binding = await storeBinding(sql, src, item.collectionBinding)
      if (binding === null) throw new Error(`${src}.matter.${local}.collectionBinding is required`)
      await sql`INSERT INTO matter_particle_macho (particle, collection_binding) VALUES (${id}, ${binding})`
    }
    inserted.add(local)
  }
}

const replaceMass = async (sql: Database, src: string, value: unknown): Promise<void> => {
  await sql`DELETE FROM wimp_mass_value WHERE wimp = ${src}`
  if (value === null || value === undefined) return
  if (!isRecord(value)) throw new Error(`${src}.mass must be an object or null`)
  await insertMassValue(sql, src, value, null, null, null)
}

const replaceBulk = async (sql: Database, src: string, value: unknown): Promise<void> => {
  if (value === null || value === undefined) {
    await sql`UPDATE wimp SET view_css = NULL WHERE src = ${src}`
    return
  }
  const bulk = record(value, `${src}.bulk`)
  await sql`UPDATE wimp SET view_css = ${nullableString(bulk.view, `${src}.bulk.view`)} WHERE src = ${src}`
}

const resetDeclarations = async (sql: Database, updates: DeclarationUpdate[]): Promise<void> => {
  for (const update of updates) {
    if (update.remove) {
      await sql`DELETE FROM wimp WHERE src = ${update.src}`
      continue
    }
    if (!update.sections.has("meta")) {
      const found = (await sql<Array<{ok: number}>>`SELECT 1 AS ok FROM wimp WHERE src = ${update.src} LIMIT 1`)[0]
      if (!found) throw new Error(`inflaton declaration ${update.src} must start with meta`)
      continue
    }
    const meta = record(update.sections.get("meta"), `${update.src}.meta`)
    await sql`
      INSERT INTO wimp (src, name, desc, view_css)
      VALUES (
        ${update.src}, ${nullableString(meta.name, `${update.src}.meta.name`)},
        ${nullableString(meta.desc, `${update.src}.meta.desc`)}, NULL
      )
      ON CONFLICT (src) DO UPDATE SET
        name = excluded.name,
        desc = excluded.desc
    `
  }
}

const applyDeclarations = async (sql: Database, updates: DeclarationUpdate[]): Promise<void> => {
  await resetDeclarations(sql, updates)
  const defaults = new Map<string, Array<{id: number; field: MetaFieldDSL}>>()

  for (const update of updates) {
    if (!update.remove && update.sections.has("fields")) {
      defaults.set(update.src, await replaceFields(sql, update.src, update.sections.get("fields")))
    }
  }
  for (const update of updates) {
    if (!update.remove && update.sections.has("variants")) {
      await replaceVariants(sql, update.src, update.sections.get("variants"))
    }
  }
  for (const update of updates) await writeFieldDefaults(sql, defaults.get(update.src) ?? [])

  for (const section of ["states", "transitions", "conditions", "processes", "reactions", "matter"] as const) {
    for (const update of updates) {
      if (update.remove || !update.sections.has(section)) continue
      const value = update.sections.get(section)
      if (section === "states") await replaceStates(sql, update.src, value)
      else if (section === "transitions") await replaceTransitions(sql, update.src, value)
      else if (section === "conditions") await replaceConditions(sql, update.src, value)
      else if (section === "processes") await replaceProcesses(sql, update.src, value)
      else if (section === "reactions") await replaceReactions(sql, update.src, value)
      else await replaceMatter(sql, update.src, value)
    }
  }
  for (const update of updates) {
    if (update.remove) continue
    if (update.sections.has("mass")) await replaceMass(sql, update.src, update.sections.get("mass"))
    if (update.sections.has("bulk")) await replaceBulk(sql, update.src, update.sections.get("bulk"))
  }
}

type ValueRecord =
  | {id: number; kind: "null"}
  | {id: number; kind: "boolean"; boolean: boolean}
  | {id: number; kind: "number"; number: number}
  | {id: number; kind: "string"; text: string}
  | {id: number; kind: "enum"; variant: number}
  | {id: number; kind: "list"}

interface ActorSnapshot {
  actor: {id: number; parentActor: number | null; parentTopology: number | null; wimp: string; position: number}
  values: Array<{actor: number; field: number; value: number}>
  valueRecords: ValueRecord[]
  valueItems: Array<{value: number; position: number; itemValue: string}>
  state: {actor: number; metaState: number | null}
}

interface ActorContext {
  actor: number
  values: Map<string, unknown>
  valueIds: Map<string, number>
  fieldTypes: Map<string, string>
  state: string | null
  item?: unknown
  itemIndex?: number
}

type Binding = string | boolean | {data?: string | string[]; expr?: string}

interface MatterPlan {
  id: number
  kind: MatterParticleKind
  edgeSlot: MatterEdgeSlot
  position: number
  src?: string
  fieldsBinding?: Binding | undefined
  massBinding?: Binding | undefined
  fuzzyKind?: "dynamic-meta" | "cond"
  predicateBinding?: Binding | undefined
  collectionBinding?: Binding | undefined
  children: MatterPlan[]
}

interface MaterializationState {
  actors: ActorSnapshot[]
  topologies: Array<{id: number; parentActor: number | null; parentTopology: number | null; kind: "fuzzy" | "axion" | "macho"; position: number}>
  matterByWimp: Map<string, MatterPlan[]>
  bindingById: Map<number, Binding | undefined>
}

const insertedId = async (rows: Promise<Array<{id: number}>>, label: string): Promise<number> => {
  const row = (await rows)[0]
  if (!row) throw new Error(`${label} did not return id`)
  return Number(row.id)
}

const storedValue = async (sql: Database, valueId: number): Promise<{record: ValueRecord; items: ActorSnapshot["valueItems"]}> => {
  const head = (await sql<Array<{kind: ValueRecord["kind"]}>>`SELECT kind FROM value WHERE id = ${valueId}`)[0]
  if (!head) throw new Error(`value ${valueId} is missing`)
  if (head.kind === "null") return {record: {id: valueId, kind: "null"}, items: []}
  if (head.kind === "boolean") {
    const row = (await sql<Array<{boolean: number}>>`SELECT boolean FROM value_boolean WHERE value = ${valueId}`)[0]
    return {record: {id: valueId, kind: "boolean", boolean: row?.boolean === 1}, items: []}
  }
  if (head.kind === "number") {
    const row = (await sql<Array<{number: number}>>`SELECT number FROM value_number WHERE value = ${valueId}`)[0]
    return {record: {id: valueId, kind: "number", number: Number(row?.number)}, items: []}
  }
  if (head.kind === "string") {
    const row = (await sql<Array<{text: string}>>`SELECT text FROM value_string WHERE value = ${valueId}`)[0]
    return {record: {id: valueId, kind: "string", text: row?.text ?? ""}, items: []}
  }
  if (head.kind === "enum") {
    const row = (await sql<Array<{variant: number}>>`SELECT variant FROM value_enum WHERE value = ${valueId}`)[0]
    if (!row) throw new Error(`enum value ${valueId} is missing its variant`)
    return {record: {id: valueId, kind: "enum", variant: Number(row.variant)}, items: []}
  }
  const items = await sql<Array<{value: number; position: number; itemValue: string}>>`
    SELECT value, position, item_value AS itemValue FROM value_list_item WHERE value = ${valueId} ORDER BY position
  `
  return {record: {id: valueId, kind: "list"}, items}
}

const fieldDefault = async (
  sql: Database,
  field: {id: number; key: string; type: string; required: number},
): Promise<unknown> => {
  const exists = (await sql<Array<{ok: number}>>`SELECT 1 AS ok FROM field_default WHERE field = ${field.id}`)[0]
  if (!exists) {
    if (field.required === 1) throw new Error(`Field "${field.key}" is required but has no default`)
    return null
  }
  if (field.type === "string") return (await sql<Array<{value: string}>>`
    SELECT default_value AS value FROM field_string_default WHERE field = ${field.id}
  `)[0]?.value ?? ""
  if (field.type === "number") return Number((await sql<Array<{value: number}>>`
    SELECT default_value AS value FROM field_number_default WHERE field = ${field.id}
  `)[0]?.value)
  if (field.type === "boolean") return (await sql<Array<{value: number}>>`
    SELECT default_value AS value FROM field_boolean_default WHERE field = ${field.id}
  `)[0]?.value === 1
  if (field.type === "enum") return (await sql<Array<{value: string}>>`
    SELECT variant.item_value AS value
    FROM field_enum_default AS default_value
    JOIN field_enum_variant AS variant ON variant.id = default_value.variant
    WHERE default_value.field = ${field.id}
  `)[0]?.value ?? null
  return (await sql<Array<{value: string}>>`
    SELECT item_value AS value FROM field_array_default_item WHERE field = ${field.id} ORDER BY position
  `).map((row) => row.value)
}

const writeActorValue = async (
  sql: Database,
  field: {id: number; type: string},
  raw: unknown,
): Promise<{raw: unknown; record: ValueRecord; items: ActorSnapshot["valueItems"]}> => {
  if (raw === null || raw === undefined) {
    const id = await insertedId(sql<Array<{id: number}>>`INSERT INTO value (kind) VALUES (${"null"}) RETURNING id`, "null value")
    return {raw: null, record: {id, kind: "null"}, items: []}
  }
  if (field.type === "boolean") {
    const id = await insertedId(sql<Array<{id: number}>>`INSERT INTO value (kind) VALUES (${"boolean"}) RETURNING id`, "boolean value")
    const value = Boolean(raw)
    await sql`INSERT INTO value_boolean (value, boolean) VALUES (${id}, ${value ? 1 : 0})`
    return {raw: value, record: {id, kind: "boolean", boolean: value}, items: []}
  }
  if (field.type === "number") {
    const id = await insertedId(sql<Array<{id: number}>>`INSERT INTO value (kind) VALUES (${"number"}) RETURNING id`, "number value")
    const value = Number(raw)
    await sql`INSERT INTO value_number (value, number) VALUES (${id}, ${value})`
    return {raw: value, record: {id, kind: "number", number: value}, items: []}
  }
  if (field.type === "string") {
    const id = await insertedId(sql<Array<{id: number}>>`INSERT INTO value (kind) VALUES (${"string"}) RETURNING id`, "string value")
    const value = String(raw)
    await sql`INSERT INTO value_string (value, text) VALUES (${id}, ${value})`
    return {raw: value, record: {id, kind: "string", text: value}, items: []}
  }
  if (field.type === "enum") {
    const variant = (await sql<Array<{id: number; value: string}>>`
      SELECT id, item_value AS value FROM field_enum_variant WHERE field = ${field.id} AND item_value = ${String(raw)} LIMIT 1
    `)[0]
    if (!variant) throw new Error(`Unknown enum variant "${String(raw)}" for field ${field.id}`)
    const id = await insertedId(sql<Array<{id: number}>>`INSERT INTO value (kind) VALUES (${"enum"}) RETURNING id`, "enum value")
    await sql`INSERT INTO value_enum (value, variant) VALUES (${id}, ${variant.id})`
    return {raw: variant.value, record: {id, kind: "enum", variant: Number(variant.id)}, items: []}
  }
  const id = await insertedId(sql<Array<{id: number}>>`INSERT INTO value (kind) VALUES (${"list"}) RETURNING id`, "list value")
  const values = Array.isArray(raw) ? raw : []
  const items = values.map((item, position) => ({value: id, position, itemValue: String(item)}))
  for (const item of items) {
    await sql`INSERT INTO value_list_item (value, position, item_value) VALUES (${item.value}, ${item.position}, ${item.itemValue})`
  }
  return {raw: values, record: {id, kind: "list"}, items}
}

const loadBinding = async (
  sql: Database,
  id: number | null,
  state: MaterializationState,
): Promise<Binding | undefined> => {
  if (id === null) return undefined
  if (state.bindingById.has(id)) return state.bindingById.get(id)
  const row = (await sql<Array<{
    binding_kind: "static" | "variable" | "dynamic"
    literal_kind: "text" | "boolean" | null
    literal_text: string | null
    literal_boolean: number | null
    expr: string | null
  }>>`
    SELECT binding_kind, literal_kind, literal_text, literal_boolean, expr
    FROM matter_binding WHERE id = ${id}
  `)[0]
  if (!row) return undefined
  let binding: Binding
  if (row.binding_kind === "static") {
    binding = row.literal_kind === "boolean" ? row.literal_boolean === 1 : row.literal_text ?? ""
  } else {
    const paths = (await sql<Array<{path: string}>>`
      SELECT path FROM matter_binding_dep WHERE binding = ${id} ORDER BY dep_order
    `).map((item) => item.path)
    binding = {
      ...(paths.length === 0 ? {} : {data: paths.length === 1 ? paths[0] : paths}),
      ...(row.expr === null ? {} : {expr: row.expr}),
    }
  }
  state.bindingById.set(id, binding)
  return binding
}

const loadMatter = async (sql: Database, src: string, state: MaterializationState): Promise<MatterPlan[]> => {
  const cached = state.matterByWimp.get(src)
  if (cached) return cached
  const rows = await sql<Array<{
    id: number
    parent: number | null
    kind: MatterParticleKind
    edgeSlot: MatterEdgeSlot
    position: number
    childSrc: string | null
    fieldsBinding: number | null
    massBinding: number | null
    fuzzyKind: "dynamic-meta" | "cond" | null
    fuzzyBinding: number | null
    axionBinding: number | null
    machoBinding: number | null
  }>>`
    SELECT
      particle.id,
      particle.parent_particle AS parent,
      particle.particle_kind AS kind,
      particle.edge_slot AS edgeSlot,
      particle.particle_order AS position,
      wimp_particle.src AS childSrc,
      wimp_particle.fields_binding AS fieldsBinding,
      wimp_particle.mass_binding AS massBinding,
      fuzzy.fuzzy_kind AS fuzzyKind,
      fuzzy.predicate_binding AS fuzzyBinding,
      axion.predicate_binding AS axionBinding,
      macho.collection_binding AS machoBinding
    FROM matter_particle AS particle
    LEFT JOIN matter_particle_wimp AS wimp_particle ON wimp_particle.particle = particle.id
    LEFT JOIN matter_particle_fuzzy AS fuzzy ON fuzzy.particle = particle.id
    LEFT JOIN matter_particle_axion AS axion ON axion.particle = particle.id
    LEFT JOIN matter_particle_macho AS macho ON macho.particle = particle.id
    WHERE particle.wimp = ${src}
    ORDER BY particle.particle_order, particle.id
  `
  const plans = new Map<number, MatterPlan>()
  for (const row of rows) {
    plans.set(Number(row.id), {
      id: Number(row.id),
      kind: row.kind,
      edgeSlot: row.edgeSlot,
      position: Number(row.position),
      ...(row.childSrc === null ? {} : {src: row.childSrc}),
      ...(row.fieldsBinding === null ? {} : {fieldsBinding: await loadBinding(sql, Number(row.fieldsBinding), state)}),
      ...(row.massBinding === null ? {} : {massBinding: await loadBinding(sql, Number(row.massBinding), state)}),
      ...(row.fuzzyKind === null ? {} : {fuzzyKind: row.fuzzyKind}),
      ...(row.fuzzyBinding === null ? {} : {predicateBinding: await loadBinding(sql, Number(row.fuzzyBinding), state)}),
      ...(row.axionBinding === null ? {} : {predicateBinding: await loadBinding(sql, Number(row.axionBinding), state)}),
      ...(row.machoBinding === null ? {} : {collectionBinding: await loadBinding(sql, Number(row.machoBinding), state)}),
      children: [],
    })
  }
  const roots: MatterPlan[] = []
  for (const row of rows) {
    const plan = plans.get(Number(row.id))!
    if (row.parent === null) roots.push(plan)
    else plans.get(Number(row.parent))?.children.push(plan)
  }
  state.matterByWimp.set(src, roots)
  return roots
}

const bindingPaths = (binding: Exclude<Binding, string | boolean>): string[] => {
  if (binding.data === undefined) return []
  return Array.isArray(binding.data) ? binding.data : [binding.data]
}

const pathValue = (path: string, context: ActorContext): unknown => {
  if (path === "state") return context.state
  if (path === "item") return context.item
  if (path.startsWith("/") || path.startsWith("[") || path.startsWith(".")) return undefined
  return context.values.get(path)
}

const evaluateBinding = (binding: Binding | undefined, context: ActorContext): unknown => {
  if (binding === undefined || typeof binding === "boolean") return binding
  if (typeof binding === "string") {
    return new Function("item", "index", "_", `return (${binding})`)(context.item, context.itemIndex, [])
  }
  const values = bindingPaths(binding).map((path) => structuredClone(pathValue(path, context)))
  if (binding.expr === undefined) return values[0]
  return new Function("item", "index", "_", `return (${binding.expr})`)(context.item, context.itemIndex, values)
}

const evaluateDynamicSrc = (binding: Binding | undefined, context: ActorContext): unknown => {
  if (!isRecord(binding) || typeof binding.expr !== "string") return evaluateBinding(binding, context)
  const values = bindingPaths(binding).map((path) => structuredClone(pathValue(path, context)))
  const template = binding.expr.replaceAll("\\", "\\\\").replaceAll("`", "\\`")
  return new Function("_", `return \`${template}\``)(values)
}

const directFieldSources = (binding: Binding | undefined, context: ActorContext): Map<string, number> => {
  if (!isRecord(binding) || typeof binding.expr !== "string") return new Map()
  const normalized = binding.expr.trim()
  if (!normalized.startsWith("{") || !normalized.endsWith("}")) return new Map()
  const paths = bindingPaths(binding)
  const sources = new Map<string, number>()
  const pattern = /(?:^|,)\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*:\s*_\[(\d+)\]\s*(?=,|$)/g
  for (const match of normalized.slice(1, -1).matchAll(pattern)) {
    const childKey = match[1]
    const parentKey = paths[Number(match[2])]
    if (!childKey || !parentKey) continue
    const type = context.fieldTypes.get(parentKey)
    if (type === "enum" || type === "array") continue
    const valueId = context.valueIds.get(parentKey)
    if (valueId !== undefined) sources.set(childKey, valueId)
  }
  return sources
}

const toFieldValues = (value: unknown, label: string): RecordValue => {
  if (!isRecord(value)) throw new Error(`${label} must resolve to an object`)
  return value
}

const materializeActor = async (
  sql: Database,
  src: string,
  parent: {actor: number | null; topology: number | null},
  state: MaterializationState,
  lineage: Set<string>,
  inherited?: {values: RecordValue; shared: Map<string, number>; item?: unknown; itemIndex?: number},
): Promise<{ref: {kind: "actor"; id: number}; context: ActorContext}> => {
  const exists = (await sql<Array<{ok: number}>>`SELECT 1 AS ok FROM wimp WHERE src = ${src} LIMIT 1`)[0]
  if (!exists) throw new Error(`Cannot materialize undeclared WIMP ${src}`)
  const position = Number((await sql<Array<{count: number}>>`
    SELECT COUNT(*) AS count FROM actor
    WHERE parent_actor IS ${parent.actor} AND parent_topology IS ${parent.topology}
  `)[0]?.count ?? 0)
  const actor = await insertedId(sql<Array<{id: number}>>`
    INSERT INTO actor (parent_actor, parent_topology, wimp, position)
    VALUES (${parent.actor}, ${parent.topology}, ${src}, ${position}) RETURNING id
  `, `actor ${src}`)
  const snapshot: ActorSnapshot = {
    actor: {id: actor, parentActor: parent.actor, parentTopology: parent.topology, wimp: src, position},
    values: [], valueRecords: [], valueItems: [], state: {actor, metaState: null},
  }
  const context: ActorContext = {
    actor, values: new Map(), valueIds: new Map(), fieldTypes: new Map(), state: null,
    ...(inherited && Object.prototype.hasOwnProperty.call(inherited, "item") ? {item: inherited.item, itemIndex: inherited.itemIndex} : {}),
  }
  const fields = await sql<Array<{id: number; key: string; type: string; required: number}>>`
    SELECT id, key, type, required FROM field WHERE wimp = ${src} ORDER BY COALESCE(local_id, id), id
  `
  for (const field of fields) {
    context.fieldTypes.set(field.key, field.type)
    const shared = inherited?.shared.get(field.key)
    if (shared !== undefined && field.type !== "enum" && field.type !== "array") {
      const stored = await storedValue(sql, shared)
      snapshot.values.push({actor, field: Number(field.id), value: shared})
      snapshot.valueRecords.push(stored.record)
      snapshot.valueItems.push(...stored.items)
      context.valueIds.set(field.key, shared)
      context.values.set(field.key, inherited?.values[field.key] ?? null)
      await sql`INSERT INTO actor_value (actor, field, value) VALUES (${actor}, ${field.id}, ${shared})`
      continue
    }
    const raw = inherited && Object.prototype.hasOwnProperty.call(inherited.values, field.key)
      ? inherited.values[field.key]
      : await fieldDefault(sql, field)
    const stored = await writeActorValue(sql, field, raw)
    snapshot.values.push({actor, field: Number(field.id), value: stored.record.id})
    snapshot.valueRecords.push(stored.record)
    snapshot.valueItems.push(...stored.items)
    context.valueIds.set(field.key, stored.record.id)
    context.values.set(field.key, stored.raw)
    await sql`INSERT INTO actor_value (actor, field, value) VALUES (${actor}, ${field.id}, ${stored.record.id})`
  }
  await sql`INSERT INTO actor_state (actor, metaState) VALUES (${actor}, NULL)`
  state.actors.push(snapshot)

  const nextLineage = new Set(lineage)
  nextLineage.add(src)
  for (const plan of await loadMatter(sql, src, state)) {
    await materializePlan(sql, plan, {kind: "actor", id: actor}, context, state, nextLineage)
  }
  return {ref: {kind: "actor", id: actor}, context}
}

const materializePlan = async (
  sql: Database,
  plan: MatterPlan,
  parent: {kind: "actor" | "topology"; id: number},
  context: ActorContext,
  state: MaterializationState,
  lineage: Set<string>,
): Promise<Array<{kind: "actor" | "topology"; id: number}>> => {
  if (plan.kind === "wimp") {
    if (!plan.src || lineage.has(plan.src)) return []
    const resolved = plan.fieldsBinding === undefined ? {} : toFieldValues(evaluateBinding(plan.fieldsBinding, context), `${plan.src} fields binding`)
    const shared = directFieldSources(plan.fieldsBinding, context)
    const child = await materializeActor(
      sql,
      plan.src,
      {actor: parent.kind === "actor" ? parent.id : null, topology: parent.kind === "topology" ? parent.id : null},
      state,
      lineage,
      {values: resolved, shared, ...(Object.prototype.hasOwnProperty.call(context, "item") ? {item: context.item, itemIndex: context.itemIndex} : {})},
    )
    return [child.ref]
  }

  const topologyPosition = Number((await sql<Array<{count: number}>>`
    SELECT COUNT(*) AS count FROM topology
    WHERE parent_actor IS ${parent.kind === "actor" ? parent.id : null}
      AND parent_topology IS ${parent.kind === "topology" ? parent.id : null}
  `)[0]?.count ?? 0)
  const topology = await insertedId(sql<Array<{id: number}>>`
    INSERT INTO topology (parent_actor, parent_topology, kind, position)
    VALUES (
      ${parent.kind === "actor" ? parent.id : null}, ${parent.kind === "topology" ? parent.id : null},
      ${plan.kind}, ${topologyPosition}
    ) RETURNING id
  `, `${plan.kind} topology`)
  state.topologies.push({
    id: topology,
    parentActor: parent.kind === "actor" ? parent.id : null,
    parentTopology: parent.kind === "topology" ? parent.id : null,
    kind: plan.kind,
    position: topologyPosition,
  })
  const topologyRef = {kind: "topology" as const, id: topology}

  let children = plan.children
  let repetitions: Array<{item?: unknown; itemIndex?: number}> = [{}]
  if (plan.kind === "fuzzy" && plan.fuzzyKind === "cond") {
    const selected = Boolean(evaluateBinding(plan.predicateBinding, context)) ? "then" : "else"
    children = children.filter((child) => child.edgeSlot === selected)
  } else if (plan.kind === "fuzzy" && plan.fuzzyKind === "dynamic-meta") {
    const selected = evaluateDynamicSrc(plan.predicateBinding, context)
    children = children.filter((child) => child.kind === "wimp" && child.src === selected)
  } else if (plan.kind === "axion") {
    if (!Boolean(evaluateBinding(plan.predicateBinding, context))) children = []
  } else if (plan.kind === "macho") {
    const collection = evaluateBinding(plan.collectionBinding, context)
    repetitions = Array.isArray(collection) ? collection.map((item, itemIndex) => ({item, itemIndex})) : []
  }

  const created: Array<{kind: "actor" | "topology"; id: number}> = []
  for (const repetition of repetitions) {
    const repeatedContext: ActorContext = {...context, ...repetition}
    for (const child of children) {
      created.push(...await materializePlan(sql, child, topologyRef, repeatedContext, state, lineage))
    }
  }
  if (plan.kind === "fuzzy") {
    const selected = created[0]
    await sql`
      INSERT INTO topology_fuzzy_state (topology, selected_actor, selected_topology)
      VALUES (${topology}, ${selected?.kind === "actor" ? selected.id : null}, ${selected?.kind === "topology" ? selected.id : null})
    `
  }
  return [topologyRef]
}

const oldWorldParts = async (sql: Database): Promise<Particle[]> => {
  const actors = await sql<Array<{id: number}>>`SELECT id FROM actor ORDER BY id DESC`
  const topologies = await sql<Array<{id: number; kind: "fuzzy" | "axion" | "macho"}>>`SELECT id, kind FROM topology ORDER BY id DESC`
  return [
    ...actors.map((actor): Particle => ({part: "graviton", op: "remove", path: "actor", value: {actor: {id: Number(actor.id)}}})),
    ...topologies.map((topology): Particle => ({part: "graviton", op: "remove", path: topology.kind, value: {id: Number(topology.id)}})),
  ]
}

export const applyInflaton = async (sql: Database, message: ForceMessage): Promise<InflatonCommit | null> => {
  const updates = collectUpdates(message)
  if (updates.length === 0) return null
  const currentRoot = (await sql<Array<{wimp: string}>>`
    SELECT wimp FROM actor
    WHERE parent_actor IS NULL AND parent_topology IS NULL
    ORDER BY rowid LIMIT 1
  `)[0]?.wimp
  const completeCatalog = updates.every((update) =>
    !update.remove && [...declarationSections].every((section) => update.sections.has(section)),
  )
  const rootSrc = completeCatalog || currentRoot === undefined ? updates[0]!.src : currentRoot
  const removed = await oldWorldParts(sql)
  await sql`DELETE FROM actor WHERE parent_actor IS NULL AND parent_topology IS NULL`
  await sql`DELETE FROM topology WHERE parent_actor IS NULL AND parent_topology IS NULL`
  await sql`DELETE FROM value WHERE NOT EXISTS (SELECT 1 FROM actor_value WHERE actor_value.value = value.id)`
  await applyDeclarations(sql, updates)

  const rootRemoved = updates.some((update) => update.src === rootSrc && update.remove)
  const state: MaterializationState = {actors: [], topologies: [], matterByWimp: new Map(), bindingById: new Map()}
  if (!rootRemoved) await materializeActor(sql, rootSrc, {actor: null, topology: null}, state, new Set())

  const added: Particle[] = [
    ...state.actors.map((actor): Particle => ({part: "graviton", op: "add", path: "actor", value: actor})),
    ...state.topologies.map((topology): Particle => ({part: "graviton", op: "add", path: topology.kind, value: topology})),
  ]
  return {rootSrc, graviton: {parts: [...removed, ...added]}}
}
