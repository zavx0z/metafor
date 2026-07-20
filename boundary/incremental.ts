import type {ReservedSQL, SQL} from "bun"
import {
  isDeclarationPath,
  type DeclarationPath,
} from "shared/protocol/force/declaration"
import {resolveForceFieldsPayload} from "shared/protocol/force/fields"
import type {ForceMessage} from "shared/protocol/force/message"
import type {Particle} from "shared/protocol/force/particle"
import type {MatterBindingValue, MatterEdgeSlot, MatterParticleKind} from "@metafor/types/metafor/matter"
import type {MetaFieldDSL} from "@metafor/types/metafor/schema"
import {
  insertFieldDefault,
  insertMassValue,
  insertMatterBinding,
  insertPredicateGroup,
} from "./wimp/sqlite/create.ts"

type Database = SQL | ReservedSQL
type JsonRecord = Record<string, unknown>
type RuntimeRef = {kind: "atom" | "topology"; id: number; ownerAtom: number}

export type InflatonAddress = {
  path: DeclarationPath
  src: string
  localId: number
}

export type BoundaryIncrementalCommit = {
  rootSrc: string | null
  messages: ForceMessage[]
}

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const record = (value: unknown, label: string): JsonRecord => {
  if (!isRecord(value)) throw new Error(`${label} must be an object`)
  return value
}

const requiredString = (value: unknown, label: string): string => {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${label} must be a non-empty string`)
  return value
}

const nullableString = (value: unknown, label: string): string | null => {
  if (value === undefined || value === null) return null
  return requiredString(value, label)
}

const positiveInteger = (value: unknown, label: string): number => {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) throw new Error(`${label} must be a positive integer`)
  return Number(value)
}

const nonNegativeInteger = (value: unknown, label: string): number => {
  if (!Number.isSafeInteger(value) || Number(value) < 0) throw new Error(`${label} must be a non-negative integer`)
  return Number(value)
}

const clone = <T>(value: T): T => structuredClone(value)
const particleMessage = (particle: Particle): ForceMessage => ({parts: [particle]})

const identityKey = (path: DeclarationPath, src: string, localId: number): string =>
  `${path}\u0000${src}\u0000${localId}`

const runtimeKey = (kind: "atom" | "topology", id: number): string => `${kind}/${id}`
const parentKey = (parent: RuntimeRef | null): string => parent ? runtimeKey(parent.kind, parent.id) : "root"

export const parseInflatonAddress = (path: Particle["path"], value?: unknown): InflatonAddress | null => {
  if (!isDeclarationPath(path) || !isRecord(value)) return null
  if (path === "wimp") {
    return typeof value.src === "string" && value.src.trim().length > 0
      ? {path, src: value.src, localId: 0}
      : null
  }
  return typeof value.wimp === "string" && value.wimp.trim().length > 0 &&
      Number.isSafeInteger(value.id) && Number(value.id) > 0
    ? {path, src: value.wimp, localId: Number(value.id)}
    : null
}

export const gravitonDeclarationPath = (address: InflatonAddress): DeclarationPath => address.path

const fieldId = async (sql: Database, src: string, localId: number): Promise<number> => {
  const row = (await sql<Array<{id: number}>>`
    SELECT id FROM field WHERE wimp = ${src} AND local_id = ${localId} LIMIT 1
  `)[0]
  if (!row) throw new Error(`Field ${src}#${localId} is not declared`)
  return Number(row.id)
}

const stateId = async (sql: Database, src: string, localId: number): Promise<number> => {
  const row = (await sql<Array<{id: number}>>`
    SELECT id FROM state WHERE wimp = ${src} AND local_id = ${localId} LIMIT 1
  `)[0]
  if (!row) throw new Error(`State ${src}#${localId} is not declared`)
  return Number(row.id)
}

const transitionId = async (sql: Database, src: string, localId: number): Promise<number> => {
  const row = (await sql<Array<{id: number}>>`
    SELECT id FROM transition WHERE wimp = ${src} AND local_id = ${localId} LIMIT 1
  `)[0]
  if (!row) throw new Error(`Transition ${src}#${localId} is not declared`)
  return Number(row.id)
}

const matterId = async (sql: Database, src: string, localId: number): Promise<number> => {
  const row = (await sql<Array<{id: number}>>`
    SELECT id FROM matter_particle WHERE wimp = ${src} AND local_id = ${localId} LIMIT 1
  `)[0]
  if (!row) throw new Error(`Matter ${src}#${localId} is not declared`)
  return Number(row.id)
}

const insertedId = async (rows: Promise<Array<{id: number}>>, label: string): Promise<number> => {
  const row = (await rows)[0]
  if (!row) throw new Error(`${label} did not return id`)
  return Number(row.id)
}

const storeBinding = async (sql: Database, src: string, value: unknown): Promise<number | null> => {
  if (value === undefined || value === null) return null
  if (typeof value === "boolean") {
    return await insertedId(sql<Array<{id: number}>>`
      INSERT INTO matter_binding (wimp, binding_kind, literal_kind, literal_boolean)
      VALUES (${src}, ${"static"}, ${"boolean"}, ${value ? 1 : 0}) RETURNING id
    `, "Matter boolean binding")
  }
  if (typeof value !== "string" && !isRecord(value)) throw new Error(`${src} Matter binding is invalid`)
  return await insertMatterBinding(sql, src, value as MatterBindingValue)
}

type StoredField = {
  id: number
  wimp: string
  localId: number
  key: string
  type: "string" | "number" | "boolean" | "array" | "enum"
  required: number
}

type StoredMatter = {
  id: number
  wimp: string
  localId: number
  parentLocalId: number | null
  kind: MatterParticleKind
  edgeSlot: MatterEdgeSlot
  position: number
  targetSrc: string | null
  fieldsBinding: number | null
  massBinding: number | null
  fuzzyKind: string | null
  predicateBinding: number | null
  collectionBinding: number | null
}

type DefaultResult = {ready: true; value: unknown} | {ready: false}

/** Boundary owns only normalized relations. Temporary defaults exist solely while an enum waits for its variants. */
export class BoundaryIncrementalStore {
  readonly childrenByParent = new Map<string, Set<string>>()
  readonly atomIdsByDeclaration = new Map<string, Set<number>>()
  readonly instanceIdsByTopology = new Map<string, Set<number>>()
  readonly originByInstance = new Map<string, string>()
  readonly parentByInstance = new Map<string, string>()
  private readonly pendingEnumDefaults = new Map<string, unknown>()

  constructor(readonly sql: SQL) {}

  async init(): Promise<void> {
    const legacyOriginColumns = await this.sql.unsafe<Array<{name: string}>>(
      "PRAGMA table_info(boundary_runtime_origin)",
    )
    if (legacyOriginColumns.some((column) => column.name === "declaration_path")) {
      await this.sql.begin(async (tx) => {
        // The legacy tables are a derived JSON mirror, not world state. Their
        // normalized fragments are incomplete, so the only deterministic
        // migration is to discard the old projection and let Dark replay the
        // external declaration through ordinary particles.
        await tx`DELETE FROM wimp`
        await tx`DELETE FROM value`
        await tx.unsafe(`
          DROP TABLE IF EXISTS boundary_atom_field;
          DROP TABLE IF EXISTS boundary_declaration_entity;
          DROP TABLE IF EXISTS boundary_root;
          DROP TABLE IF EXISTS boundary_runtime_origin;
        `)
      })
    }
    await this.sql.unsafe(`
      DROP TABLE IF EXISTS boundary_atom_field;
      DROP TABLE IF EXISTS boundary_declaration_entity;
      DROP TABLE IF EXISTS boundary_root;
    `)
    await this.sql.unsafe(`
      CREATE TABLE IF NOT EXISTS boundary_runtime_origin (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        kind TEXT NOT NULL CHECK (kind IN ('atom', 'topology')),
        runtime_id INTEGER NOT NULL,
        declaration_kind TEXT NOT NULL CHECK (declaration_kind IN ('wimp', 'matter')),
        declaration_wimp TEXT NOT NULL,
        declaration_local_id INTEGER NOT NULL CHECK (declaration_local_id >= 0),
        parent_kind TEXT NOT NULL CHECK (parent_kind IN ('root', 'atom', 'topology')),
        parent_runtime_id INTEGER NOT NULL CHECK (parent_runtime_id >= 0),
        owner_atom INTEGER NOT NULL,
        ordinal INTEGER NOT NULL DEFAULT 0,
        UNIQUE (kind, runtime_id),
        UNIQUE (
          kind, declaration_kind, declaration_wimp, declaration_local_id,
          parent_kind, parent_runtime_id, ordinal
        )
      );
      CREATE INDEX IF NOT EXISTS boundary_origin_by_declaration
        ON boundary_runtime_origin (declaration_kind, declaration_wimp, declaration_local_id);
      CREATE INDEX IF NOT EXISTS boundary_origin_by_owner
        ON boundary_runtime_origin (owner_atom);
    `)
    await this.loadIndexes()
  }

  async apply(message: ForceMessage): Promise<BoundaryIncrementalCommit | null> {
    const part = message.parts[0]
    if (part.part === "higgs") return await this.applyHiggs(part)
    if (part.part !== "inflaton" || part.op === "test") return null
    if (part.op !== "add" && part.op !== "replace" && part.op !== "remove") {
      throw new Error(`inflaton/${part.op} is not supported by Boundary`)
    }
    const address = parseInflatonAddress(part.path, part.value)
    if (!address) throw new Error(`Invalid categorical Inflaton identity: ${String(part.path)}`)
    const input = record(part.value, `${address.path} value`)

    const effects = await this.sql.begin(async (tx): Promise<Particle[]> => {
      const committed: Particle[] = []
      if (part.op === "remove") {
        const previous = await this.canonical(tx, address, input)
        await this.removeRuntimeConsequences(tx, address, committed)
        await this.removeDeclaration(tx, address)
        committed.push({
          part: "graviton",
          op: "remove",
          path: address.path,
          ts: Date.now(),
          value: previous ?? this.identity(address),
        })
        return committed
      }

      await this.persist(tx, address, input)
      const canonical = await this.canonical(tx, address, input)
      committed.push({
        part: "graviton",
        op: part.op,
        path: address.path,
        ts: Date.now(),
        value: canonical,
      })
      await this.addRuntimeConsequences(tx, address, input, committed)
      return committed
    })

    await this.updateIndexes(effects)
    return {rootSrc: await this.rootSrc(), messages: effects.map(particleMessage)}
  }

  async replay(): Promise<ForceMessage[]> {
    const particles: Particle[] = []
    const append = (path: DeclarationPath, value: JsonRecord): void => {
      particles.push({part: "graviton", op: "add", path, ts: Date.now(), value})
    }
    for (const row of await this.sql<Array<{src: string; name: string | null; desc: string | null}>>`
      SELECT src, name, desc FROM wimp ORDER BY rowid
    `) append("wimp", row)
    for (const row of await this.sql<Array<{
      id: number; wimp: string; localId: number; key: string; type: StoredField["type"]; required: number; label: string | null
    }>>`
      SELECT id, wimp, local_id AS localId, key, type, required, label FROM field ORDER BY wimp, local_id
    `) {
      const defaultValue = await this.fieldDefault(this.sql, {...row, localId: Number(row.localId)})
      append("field", {...row, required: row.required === 1, ...(defaultValue.ready ? {default: defaultValue.value} : {})})
    }
    for (const row of await this.sql<Array<{id: number; wimp: string; localId: number; field: number; position: number; itemValue: string}>>`
      SELECT id, wimp, local_id AS localId, field, position, item_value AS itemValue
        FROM field_enum_variant ORDER BY wimp, local_id
    `) append("variant", row)
    for (const row of await this.sql<Array<{id: number; wimp: string; localId: number; name: string; position: number}>>`
      SELECT id, wimp, local_id AS localId, name, position FROM state ORDER BY wimp, local_id
    `) append("state", row)
    for (const row of await this.sql<Array<{id: number; wimp: string; localId: number; fromState: number; toState: number; position: number}>>`
      SELECT id, wimp, local_id AS localId, from_state AS fromState, to_state AS toState, position
        FROM transition ORDER BY wimp, local_id
    `) append("transition", row)
    for (const row of await this.sql<Array<{id: number; wimp: string; localId: number; transition: number; field: number; position: number}>>`
      SELECT id, wimp, local_id AS localId, transition, field, position
        FROM condition ORDER BY wimp, local_id
    `) append("condition", {...row, predicate: await this.conditionPredicate(this.sql, Number(row.id))})
    for (const row of await this.sql<Array<{wimp: string; localId: number}>>`
      SELECT wimp, local_id AS localId FROM process ORDER BY wimp, local_id
    `) {
      const entity = await this.canonicalProcess(this.sql, {path: "process", src: row.wimp, localId: Number(row.localId)})
      if (entity) append("process", entity)
    }
    for (const row of await this.sql<Array<{wimp: string; localId: number}>>`
      SELECT wimp, local_id AS localId FROM reaction ORDER BY wimp, local_id
    `) {
      const entity = await this.reactionEntity(this.sql, row.wimp, Number(row.localId))
      if (entity) append("reaction", entity)
    }
    for (const row of await this.sql<Array<{wimp: string; localId: number}>>`
      SELECT wimp, local_id AS localId FROM matter_particle ORDER BY wimp, local_id
    `) {
      const entity = await this.matterEntity(this.sql, row.wimp, Number(row.localId))
      if (entity) append("matter", entity)
    }
    for (const row of await this.sql<Array<{wimp: string}>>`
      SELECT DISTINCT wimp FROM wimp_mass_value ORDER BY wimp
    `) {
      const value = await this.massValue(this.sql, row.wimp, null)
      append("mass", {wimp: row.wimp, localId: 1, id: 1, value})
    }
    for (const row of await this.sql<Array<{src: string; view: string}>>`
      SELECT src, view_css AS view FROM wimp WHERE view_css IS NOT NULL ORDER BY rowid
    `) append("bulk", {wimp: row.src, localId: 1, id: 1, view: row.view})

    for (const origin of await this.sql<Array<{kind: "atom" | "topology"; runtimeId: number}>>`
      SELECT kind, runtime_id AS runtimeId FROM boundary_runtime_origin ORDER BY sequence
    `) {
      const id = Number(origin.runtimeId)
      const entity = origin.kind === "atom"
        ? await this.atomEntity(this.sql, id)
        : await this.topologyEntity(this.sql, id)
      if (entity) particles.push({part: "graviton", op: "add", path: `${origin.kind}/${id}`, ts: Date.now(), value: entity})
    }
    return particles.map(particleMessage)
  }

  async reconcileStateMatter(part: Particle): Promise<BoundaryIncrementalCommit | null> {
    if (
      part.part !== "photon" ||
      (part.op !== "replace" && part.op !== "test") ||
      typeof part.path !== "number" ||
      !Number.isSafeInteger(part.path)
    ) return null
    const atomId = part.path
    const effects = await this.sql.begin(async (tx): Promise<Particle[]> => {
      const committed: Particle[] = []
      const currentState = (await tx<Array<{name: string}>>`
        SELECT state.name FROM atom_state JOIN state ON state.id = atom_state.metaState
         WHERE atom_state.atom = ${atomId}
      `)[0]?.name ?? null

      for (const topology of await tx<Array<{runtimeId: number; wimp: string; localId: number}>>`
        SELECT origin.runtime_id AS runtimeId, origin.declaration_wimp AS wimp,
               origin.declaration_local_id AS localId
          FROM boundary_runtime_origin AS origin
          JOIN topology ON topology.id = origin.runtime_id
         WHERE origin.kind = ${"topology"} AND origin.owner_atom = ${atomId}
           AND topology.kind = ${"axion"}
         ORDER BY origin.sequence
      `) {
        const controller = await this.matter(tx, topology.wimp, Number(topology.localId))
        if (!controller) continue
        const parent: RuntimeRef = {kind: "topology", id: Number(topology.runtimeId), ownerAtom: atomId}
        const children = await this.matterChildren(tx, controller.id)
        const selected: number[] = []
        for (const child of children) if (await this.branchSelected(tx, parent, child)) selected.push(child.localId)
        const existing = (await tx<Array<{localId: number}>>`
          SELECT declaration_local_id AS localId FROM boundary_runtime_origin
           WHERE parent_kind = ${"topology"} AND parent_runtime_id = ${parent.id}
           ORDER BY declaration_local_id, ordinal
        `).map((origin) => Number(origin.localId))
        selected.sort((left, right) => left - right)
        if (selected.length === existing.length && selected.every((value, index) => value === existing[index])) continue

        for (const child of await tx<Array<{kind: "atom" | "topology"; runtimeId: number}>>`
          SELECT kind, runtime_id AS runtimeId FROM boundary_runtime_origin
           WHERE parent_kind = ${"topology"} AND parent_runtime_id = ${parent.id}
           ORDER BY sequence DESC
        `) committed.push(...await this.removeRuntimeBranch(tx, child.kind, Number(child.runtimeId)))
        committed.push({
          part: "higgs",
          op: "replace",
          path: `topology/${parent.id}`,
          ts: Date.now(),
          value: {state: currentState},
        })
        for (const child of children) {
          committed.push(...await this.materializeMatter(
            tx,
            {path: "matter", src: child.wimp, localId: child.localId},
            parent,
          ))
        }
      }
      return committed
    })
    if (effects.length === 0) return null
    await this.updateIndexes(effects)
    return {rootSrc: await this.rootSrc(), messages: effects.map(particleMessage)}
  }

  private identity(address: InflatonAddress): JsonRecord {
    return address.path === "wimp" ? {src: address.src} : {wimp: address.src, id: address.localId}
  }

  private async persist(sql: Database, address: InflatonAddress, value: JsonRecord): Promise<void> {
    if (address.path === "wimp") {
      await sql`
        INSERT INTO wimp (src, name, desc, view_css)
        VALUES (
          ${address.src}, ${nullableString(value.name, "wimp.name")},
          ${nullableString(value.desc, "wimp.desc")}, NULL
        )
        ON CONFLICT (src) DO UPDATE SET name = excluded.name, desc = excluded.desc
      `
      return
    }
    if (address.path === "field") {
      const type = requiredString(value.type, "field.type")
      if (type !== "string" && type !== "number" && type !== "boolean" && type !== "array" && type !== "enum") {
        throw new Error(`Unsupported field type ${type}`)
      }
      const rowId = await insertedId(sql<Array<{id: number}>>`
        INSERT INTO field (wimp, local_id, key, type, required, label)
        VALUES (
          ${address.src}, ${address.localId}, ${requiredString(value.key, "field.key")}, ${type},
          ${value.required === true ? 1 : 0}, ${nullableString(value.label, "field.label")}
        )
        ON CONFLICT (wimp, local_id) DO UPDATE SET
          key = excluded.key, type = excluded.type, required = excluded.required, label = excluded.label
        RETURNING id
      `, "Field")
      await sql`DELETE FROM field_default WHERE field = ${rowId}`
      const key = identityKey("field", address.src, address.localId)
      if (Object.hasOwn(value, "default")) this.pendingEnumDefaults.set(key, clone(value.default))
      else this.pendingEnumDefaults.delete(key)
      await this.flushFieldDefault(sql, address.src, address.localId)
      return
    }
    if (address.path === "variant") {
      const parentField = await fieldId(sql, address.src, positiveInteger(value.field, "variant.field"))
      await sql`
        INSERT INTO field_enum_variant (wimp, local_id, field, position, item_value)
        VALUES (
          ${address.src}, ${address.localId}, ${parentField},
          ${nonNegativeInteger(value.position, "variant.position")}, ${requiredString(value.value, "variant.value")}
        )
        ON CONFLICT (wimp, local_id) DO UPDATE SET
          field = excluded.field, position = excluded.position, item_value = excluded.item_value
      `
      await this.flushFieldDefault(sql, address.src, positiveInteger(value.field, "variant.field"))
      return
    }
    if (address.path === "state") {
      await sql`
        INSERT INTO state (wimp, local_id, name, position)
        VALUES (${address.src}, ${address.localId}, ${requiredString(value.name, "state.name")}, ${nonNegativeInteger(value.position, "state.position")})
        ON CONFLICT (wimp, local_id) DO UPDATE SET name = excluded.name, position = excluded.position
      `
      return
    }
    if (address.path === "transition") {
      await sql`
        INSERT INTO transition (wimp, local_id, from_state, to_state, position)
        VALUES (
          ${address.src}, ${address.localId},
          ${await stateId(sql, address.src, positiveInteger(value.from, "transition.from"))},
          ${await stateId(sql, address.src, positiveInteger(value.to, "transition.to"))},
          ${nonNegativeInteger(value.position, "transition.position")}
        )
        ON CONFLICT (wimp, local_id) DO UPDATE SET
          from_state = excluded.from_state, to_state = excluded.to_state, position = excluded.position
      `
      return
    }
    if (address.path === "condition") {
      const id = await insertedId(sql<Array<{id: number}>>`
        INSERT INTO condition (wimp, local_id, transition, field, position)
        VALUES (
          ${address.src}, ${address.localId},
          ${await transitionId(sql, address.src, positiveInteger(value.transition, "condition.transition"))},
          ${await fieldId(sql, address.src, positiveInteger(value.field, "condition.field"))},
          ${nonNegativeInteger(value.position, "condition.position")}
        )
        ON CONFLICT (wimp, local_id) DO UPDATE SET
          transition = excluded.transition, field = excluded.field, position = excluded.position
        RETURNING id
      `, "Condition")
      await sql`DELETE FROM condition_predicate WHERE condition = ${id}`
      await insertPredicateGroup(sql, id, value.predicate)
      return
    }
    if (address.path === "process") {
      await this.persistProcess(sql, address, value)
      return
    }
    if (address.path === "reaction") {
      await this.persistReaction(sql, address, value)
      return
    }
    if (address.path === "matter") {
      await this.persistMatter(sql, address, value)
      return
    }
    if (address.path === "mass") {
      await sql`DELETE FROM wimp_mass_value WHERE wimp = ${address.src}`
      const mass = Object.hasOwn(value, "value") ? value.value : value
      if (!isRecord(mass)) throw new Error(`${address.src} mass must be an object`)
      await insertMassValue(sql, address.src, mass, null, null, null)
      return
    }
    const view = typeof value.view === "string" ? value.view : null
    await sql`UPDATE wimp SET view_css = ${view} WHERE src = ${address.src}`
  }

  private async persistProcess(sql: Database, address: InflatonAddress, value: JsonRecord): Promise<void> {
    const type = requiredString(value.type, "process.type")
    if (type !== "action" && type !== "finally") throw new Error(`Unsupported process type ${type}`)
    const id = await insertedId(sql<Array<{id: number}>>`
      INSERT INTO process (wimp, local_id, key, type, label, desc)
      VALUES (
        ${address.src}, ${address.localId}, ${requiredString(value.key, "process.key")}, ${type},
        ${nullableString(value.label, "process.label")}, ${nullableString(value.desc, "process.desc")}
      )
      ON CONFLICT (wimp, local_id) DO UPDATE SET
        key = excluded.key, type = excluded.type, label = excluded.label, desc = excluded.desc
      RETURNING id
    `, "Process")
    await sql`DELETE FROM process_env WHERE process = ${id}`
    await sql`DELETE FROM process_action WHERE process = ${id}`
    await sql`DELETE FROM process_finally WHERE process = ${id}`
    for (const env of Array.isArray(value.env) ? value.env : []) {
      await sql`INSERT INTO process_env (process, env) VALUES (${id}, ${requiredString(env, "process.env")})`
    }
    if (type === "finally") {
      const before = record(value.before, "process.before")
      await sql`INSERT INTO process_finally (process, before) VALUES (${id}, ${requiredString(before.src, "process.before.src")})`
      await this.insertProcessFields(sql, address.src, id, "process_finally_read", before.read)
      return
    }
    const action = record(value.action, "process.action")
    const success = isRecord(value.success) ? value.success : null
    const error = isRecord(value.error) ? value.error : null
    await sql`
      INSERT INTO process_action (process, action, action_import_specifier, action_wrapper_src, success, error)
      VALUES (
        ${id}, ${requiredString(action.src, "process.action.src")},
        ${typeof action.importSpecifier === "string" ? action.importSpecifier : null},
        ${typeof action.wrapperSrc === "string" ? action.wrapperSrc : null},
        ${success ? requiredString(success.src, "process.success.src") : null},
        ${error ? requiredString(error.src, "process.error.src") : null}
      )
    `
    await this.insertProcessFields(sql, address.src, id, "process_action_read", action.read, "action")
    if (success) {
      await this.insertProcessFields(sql, address.src, id, "process_action_read", success.read, "success")
      await this.insertProcessFields(sql, address.src, id, "process_action_write", success.write, "success")
    }
    if (error) {
      await this.insertProcessFields(sql, address.src, id, "process_action_read", error.read, "error")
      await this.insertProcessFields(sql, address.src, id, "process_action_write", error.write, "error")
    }
  }

  private async insertProcessFields(
    sql: Database,
    src: string,
    process: number,
    table: "process_action_read" | "process_action_write" | "process_finally_read",
    values: unknown,
    phase?: "action" | "success" | "error",
  ): Promise<void> {
    if (values === undefined || values === null) return
    if (!Array.isArray(values)) throw new Error(`${table} must be an array`)
    for (const local of values) {
      const field = await fieldId(sql, src, positiveInteger(local, `${table}.field`))
      if (table === "process_action_read") {
        await sql`INSERT INTO process_action_read (process, field, phase) VALUES (${process}, ${field}, ${phase!})`
      } else if (table === "process_action_write") {
        await sql`INSERT INTO process_action_write (process, field, phase) VALUES (${process}, ${field}, ${phase!})`
      } else {
        await sql`INSERT INTO process_finally_read (process, field) VALUES (${process}, ${field})`
      }
    }
  }

  private async persistReaction(sql: Database, address: InflatonAddress, value: JsonRecord): Promise<void> {
    const id = await insertedId(sql<Array<{id: number}>>`
      INSERT INTO reaction (wimp, local_id, key, label, desc, cond_source, update_source)
      VALUES (
        ${address.src}, ${address.localId}, ${requiredString(value.key, "reaction.key")},
        ${requiredString(value.label, "reaction.label")}, ${nullableString(value.desc, "reaction.desc")},
        ${requiredString(value.cond, "reaction.cond")}, ${requiredString(value.src, "reaction.src")}
      )
      ON CONFLICT (wimp, local_id) DO UPDATE SET
        key = excluded.key, label = excluded.label, desc = excluded.desc,
        cond_source = excluded.cond_source, update_source = excluded.update_source
      RETURNING id
    `, "Reaction")
    await sql`DELETE FROM reaction_read WHERE reaction = ${id}`
    await sql`DELETE FROM reaction_write WHERE reaction = ${id}`
    await sql`DELETE FROM reaction_state WHERE reaction = ${id}`
    for (const [table, values] of [["reaction_read", value.read], ["reaction_write", value.write]] as const) {
      for (const local of Array.isArray(values) ? values : []) {
        await sql.unsafe(`INSERT INTO ${table} (reaction, field) VALUES (?, ?)`, [id, await fieldId(sql, address.src, positiveInteger(local, `${table}.field`))])
      }
    }
    for (const local of Array.isArray(value.states) ? value.states : []) {
      await sql`INSERT INTO reaction_state (reaction, state) VALUES (${id}, ${await stateId(sql, address.src, positiveInteger(local, "reaction.state"))})`
    }
  }

  private async persistMatter(sql: Database, address: InflatonAddress, value: JsonRecord): Promise<void> {
    const kind = requiredString(value.kind, "matter.kind") as MatterParticleKind
    if (kind !== "wimp" && kind !== "fuzzy" && kind !== "axion" && kind !== "macho") {
      throw new Error(`Unsupported Matter kind ${kind}`)
    }
    const old = (await sql<Array<{id: number}>>`
      SELECT id FROM matter_particle WHERE wimp = ${address.src} AND local_id = ${address.localId}
    `)[0]
    const bindings = old ? await this.matterBindingIds(sql, Number(old.id)) : []
    if (old) await sql`DELETE FROM matter_particle WHERE id = ${old.id}`
    for (const binding of bindings) await sql`DELETE FROM matter_binding WHERE id = ${binding}`
    const parent = value.parent === null ? null : await matterId(sql, address.src, positiveInteger(value.parent, "matter.parent"))
    const id = await insertedId(sql<Array<{id: number}>>`
      INSERT INTO matter_particle (wimp, local_id, parent_particle, particle_kind, edge_slot, particle_order)
      VALUES (
        ${address.src}, ${address.localId}, ${parent}, ${kind},
        ${requiredString(value.edgeSlot, "matter.edgeSlot") as MatterEdgeSlot},
        ${nonNegativeInteger(value.position, "matter.position")}
      ) RETURNING id
    `, "Matter")
    if (kind === "wimp") {
      await sql`
        INSERT INTO matter_particle_wimp (particle, src, fields_binding, mass_binding)
        VALUES (
          ${id}, ${requiredString(value.src, "matter.src")},
          ${await storeBinding(sql, address.src, value.fieldsBinding)},
          ${await storeBinding(sql, address.src, value.massBinding)}
        )
      `
    } else if (kind === "fuzzy") {
      const binding = await storeBinding(sql, address.src, value.predicateBinding)
      if (binding === null) throw new Error("Fuzzy predicateBinding is required")
      await sql`
        INSERT INTO matter_particle_fuzzy (particle, fuzzy_kind, predicate_binding)
        VALUES (${id}, ${requiredString(value.fuzzyKind, "matter.fuzzyKind")}, ${binding})
      `
    } else if (kind === "axion") {
      const binding = await storeBinding(sql, address.src, value.predicateBinding)
      if (binding === null) throw new Error("Axion predicateBinding is required")
      await sql`INSERT INTO matter_particle_axion (particle, predicate_binding) VALUES (${id}, ${binding})`
    } else {
      const binding = await storeBinding(sql, address.src, value.collectionBinding)
      if (binding === null) throw new Error("Macho collectionBinding is required")
      await sql`INSERT INTO matter_particle_macho (particle, collection_binding) VALUES (${id}, ${binding})`
    }
  }

  private async matterBindingIds(sql: Database, particle: number): Promise<number[]> {
    const row = (await sql<Array<{
      fields: number | null; mass: number | null; fuzzy: number | null; axion: number | null; macho: number | null
    }>>`
      SELECT w.fields_binding AS fields, w.mass_binding AS mass,
             f.predicate_binding AS fuzzy, a.predicate_binding AS axion,
             m.collection_binding AS macho
        FROM matter_particle AS p
        LEFT JOIN matter_particle_wimp AS w ON w.particle = p.id
        LEFT JOIN matter_particle_fuzzy AS f ON f.particle = p.id
        LEFT JOIN matter_particle_axion AS a ON a.particle = p.id
        LEFT JOIN matter_particle_macho AS m ON m.particle = p.id
       WHERE p.id = ${particle}
    `)[0]
    return row ? [row.fields, row.mass, row.fuzzy, row.axion, row.macho].filter((id): id is number => id !== null) : []
  }

  private async removeDeclaration(sql: Database, address: InflatonAddress): Promise<void> {
    if (address.path === "wimp") {
      await sql`DELETE FROM wimp WHERE src = ${address.src}`
      return
    }
    if (address.path === "field") {
      const row = (await sql<Array<{id: number}>>`SELECT id FROM field WHERE wimp = ${address.src} AND local_id = ${address.localId}`)[0]
      if (row) {
        const values = await sql<Array<{value: number}>>`SELECT value FROM atom_value WHERE field = ${row.id}`
        await sql`DELETE FROM field WHERE id = ${row.id}`
        for (const value of values) await sql`DELETE FROM value WHERE id = ${value.value}`
      }
      this.pendingEnumDefaults.delete(identityKey("field", address.src, address.localId))
      return
    }
    if (address.path === "variant") await sql`DELETE FROM field_enum_variant WHERE wimp = ${address.src} AND local_id = ${address.localId}`
    else if (address.path === "state") await sql`DELETE FROM state WHERE wimp = ${address.src} AND local_id = ${address.localId}`
    else if (address.path === "transition") await sql`DELETE FROM transition WHERE wimp = ${address.src} AND local_id = ${address.localId}`
    else if (address.path === "condition") await sql`DELETE FROM condition WHERE wimp = ${address.src} AND local_id = ${address.localId}`
    else if (address.path === "process") await sql`DELETE FROM process WHERE wimp = ${address.src} AND local_id = ${address.localId}`
    else if (address.path === "reaction") await sql`DELETE FROM reaction WHERE wimp = ${address.src} AND local_id = ${address.localId}`
    else if (address.path === "matter") {
      const row = (await sql<Array<{id: number}>>`SELECT id FROM matter_particle WHERE wimp = ${address.src} AND local_id = ${address.localId}`)[0]
      if (row) {
        const bindings = await this.matterBindingIds(sql, Number(row.id))
        await sql`DELETE FROM matter_particle WHERE id = ${row.id}`
        for (const binding of bindings) await sql`DELETE FROM matter_binding WHERE id = ${binding}`
      }
    } else if (address.path === "mass") await sql`DELETE FROM wimp_mass_value WHERE wimp = ${address.src}`
    else await sql`UPDATE wimp SET view_css = NULL WHERE src = ${address.src}`
  }

  private async canonical(sql: Database, address: InflatonAddress, input: JsonRecord): Promise<JsonRecord | null> {
    if (address.path === "wimp") {
      const row = (await sql<Array<{src: string; name: string | null; desc: string | null}>>`
        SELECT src, name, desc FROM wimp WHERE src = ${address.src}
      `)[0]
      return row ?? null
    }
    const base = {wimp: address.src, localId: address.localId}
    if (address.path === "field") {
      const row = (await sql<Array<{id: number; key: string; type: string; required: number; label: string | null}>>`
        SELECT id, key, type, required, label FROM field WHERE wimp = ${address.src} AND local_id = ${address.localId}
      `)[0]
      return row ? {...base, ...row, required: row.required === 1, ...(Object.hasOwn(input, "default") ? {default: clone(input.default)} : {})} : null
    }
    if (address.path === "variant") {
      const row = (await sql<Array<{id: number; field: number; position: number; itemValue: string}>>`
        SELECT id, field, position, item_value AS itemValue FROM field_enum_variant
         WHERE wimp = ${address.src} AND local_id = ${address.localId}
      `)[0]
      return row ? {...base, ...row} : null
    }
    if (address.path === "state") {
      const row = (await sql<Array<{id: number; name: string; position: number}>>`
        SELECT id, name, position FROM state WHERE wimp = ${address.src} AND local_id = ${address.localId}
      `)[0]
      return row ? {...base, ...row} : null
    }
    if (address.path === "transition") {
      const row = (await sql<Array<{id: number; fromState: number; toState: number; position: number}>>`
        SELECT id, from_state AS fromState, to_state AS toState, position FROM transition
         WHERE wimp = ${address.src} AND local_id = ${address.localId}
      `)[0]
      return row ? {...base, ...row} : null
    }
    if (address.path === "condition") {
      const row = (await sql<Array<{id: number; transition: number; field: number; position: number}>>`
        SELECT id, transition, field, position FROM condition
         WHERE wimp = ${address.src} AND local_id = ${address.localId}
      `)[0]
      return row ? {...base, ...row, predicate: clone(input.predicate)} : null
    }
    if (address.path === "process") return await this.canonicalProcess(sql, address)
    if (address.path === "reaction") return await this.reactionEntity(sql, address.src, address.localId)
    if (address.path === "matter") return await this.matterEntity(sql, address.src, address.localId)
    return {...base, ...input}
  }

  private async conditionPredicate(sql: Database, condition: number): Promise<JsonRecord> {
    const result: JsonRecord = {}
    for (const row of await sql<Array<{
      id: number; operator: string; valueKind: string; valueBoolean: number | null;
      valueNumber: number | null; valueText: string | null; valueVariant: number | null;
    }>>`
      SELECT id, operator, value_kind AS valueKind, value_boolean AS valueBoolean,
             value_number AS valueNumber, value_text AS valueText, value_variant AS valueVariant
        FROM condition_predicate WHERE condition = ${condition} ORDER BY predicate_order
    `) {
      const operator = row.operator === "neq" ? "notEq"
        : row.operator === "not_in" ? "notIn"
          : row.operator === "not_include" ? "notInclude"
            : row.operator === "is_empty" ? "isEmpty"
              : row.operator
      let value: unknown = null
      if (row.valueKind === "boolean") value = row.valueBoolean === 1
      else if (row.valueKind === "number") value = row.valueNumber
      else if (row.valueKind === "string") value = row.valueText
      else if (row.valueKind === "enum") value = (await sql<Array<{value: string}>>`
        SELECT item_value AS value FROM field_enum_variant WHERE id = ${row.valueVariant}
      `)[0]?.value ?? null
      else if (row.valueKind === "list") value = (await sql<Array<{
        valueKind: string; valueBoolean: number | null; valueNumber: number | null;
        valueText: string | null; valueVariant: number | null;
      }>>`
        SELECT value_kind AS valueKind, value_boolean AS valueBoolean, value_number AS valueNumber,
               value_text AS valueText, value_variant AS valueVariant
          FROM condition_list_item WHERE predicate = ${row.id} ORDER BY item_order
      `).map((item) => item.valueKind === "boolean" ? item.valueBoolean === 1
        : item.valueKind === "number" ? item.valueNumber
          : item.valueKind === "string" ? item.valueText
            : item.valueKind === "enum" ? item.valueVariant
              : null)
      result[operator] = value
    }
    return result
  }

  private async reactionEntity(sql: Database, src: string, localId: number): Promise<JsonRecord | null> {
    const row = (await sql<Array<{
      id: number; key: string; label: string; desc: string | null; cond: string; updateSource: string;
    }>>`
      SELECT id, key, label, desc, cond_source AS cond, update_source AS updateSource
        FROM reaction WHERE wimp = ${src} AND local_id = ${localId}
    `)[0]
    if (!row) return null
    return {
      id: Number(row.id),
      wimp: src,
      localId,
      key: row.key,
      label: row.label,
      desc: row.desc,
      cond: row.cond,
      src: row.updateSource,
      read: (await sql<Array<{field: number}>>`SELECT field FROM reaction_read WHERE reaction = ${row.id} ORDER BY field`).map((item) => Number(item.field)),
      write: (await sql<Array<{field: number}>>`SELECT field FROM reaction_write WHERE reaction = ${row.id} ORDER BY field`).map((item) => Number(item.field)),
      states: (await sql<Array<{state: number}>>`SELECT state FROM reaction_state WHERE reaction = ${row.id} ORDER BY state`).map((item) => Number(item.state)),
    }
  }

  private async canonicalProcess(sql: Database, address: InflatonAddress): Promise<JsonRecord | null> {
    const row = (await sql<Array<{
      id: number; key: string; type: "action" | "finally"; label: string | null; desc: string | null
    }>>`
      SELECT id, key, type, label, desc FROM process WHERE wimp = ${address.src} AND local_id = ${address.localId}
    `)[0]
    if (!row) return null
    const env = (await sql<Array<{env: string}>>`SELECT env FROM process_env WHERE process = ${row.id} ORDER BY env`).map((item) => item.env)
    const fields = async (table: "process_action_read" | "process_action_write" | "process_finally_read", phase?: string) => {
      const rows = table === "process_finally_read"
        ? await sql<Array<{id: number; key: string}>>`
            SELECT field.id, field.key FROM process_finally_read AS link JOIN field ON field.id = link.field
             WHERE link.process = ${row.id} ORDER BY field.id
          `
        : await sql.unsafe<Array<{id: number; key: string}>>(
            `SELECT field.id, field.key FROM ${table} AS link JOIN field ON field.id = link.field WHERE link.process = ? AND link.phase = ? ORDER BY field.id`,
            [row.id, phase],
          )
      return rows.map((field) => [Number(field.id), field.key] as [number, string])
    }
    if (row.type === "finally") {
      const before = (await sql<Array<{src: string}>>`SELECT before AS src FROM process_finally WHERE process = ${row.id}`)[0]
      return {
        id: Number(row.id), wimp: address.src, localId: address.localId, state: row.key,
        descriptor: {type: "finally", key: row.key, label: row.label, desc: row.desc, env, before: {src: before?.src ?? "", readFields: await fields("process_finally_read")}},
      }
    }
    const action = (await sql<Array<{action: string; importSpecifier: string | null; wrapperSrc: string | null; success: string | null; error: string | null}>>`
      SELECT action, action_import_specifier AS importSpecifier, action_wrapper_src AS wrapperSrc, success, error
        FROM process_action WHERE process = ${row.id}
    `)[0]
    if (!action) return null
    const handler = async (phase: "success" | "error", src: string | null) => src === null ? undefined : ({
      src,
      readFields: await fields("process_action_read", phase),
      writeFields: await fields("process_action_write", phase),
    })
    const success = await handler("success", action.success)
    const error = await handler("error", action.error)
    return {
      id: Number(row.id), wimp: address.src, localId: address.localId, state: row.key,
      descriptor: {
        type: "action", key: row.key, label: row.label, desc: row.desc, env,
        action: {
          src: action.action,
          ...(action.importSpecifier ? {importSpecifier: action.importSpecifier} : {}),
          ...(action.wrapperSrc ? {wrapperSrc: action.wrapperSrc} : {}),
          readFields: await fields("process_action_read", "action"),
        },
        ...(success ? {success} : {}),
        ...(error ? {error} : {}),
      },
    }
  }

  private async addRuntimeConsequences(
    sql: Database,
    address: InflatonAddress,
    value: JsonRecord,
    effects: Particle[],
  ): Promise<void> {
    if (address.path === "wimp") {
      const references = await sql<Array<{wimp: string; localId: number}>>`
        SELECT particle.wimp, particle.local_id AS localId
          FROM matter_particle_wimp AS edge
          JOIN matter_particle AS particle ON particle.id = edge.particle
         WHERE edge.src = ${address.src}
         ORDER BY particle.id
      `
      for (const reference of references) {
        effects.push(...await this.materializeMatter(sql, {path: "matter", src: reference.wimp, localId: Number(reference.localId)}))
      }
      const existing = (await sql<Array<{ok: number}>>`SELECT 1 AS ok FROM atom WHERE wimp = ${address.src} LIMIT 1`)[0]
      if (references.length === 0 && !existing) effects.push(...await this.ensureRootAtom(sql, address.src))
      return
    }
    if (address.path === "field") {
      effects.push(...await this.materializeFieldForAtoms(sql, address.src, address.localId))
      for (const reference of await sql<Array<{wimp: string; localId: number}>>`
        SELECT particle.wimp, particle.local_id AS localId
          FROM matter_particle_wimp AS edge
          JOIN matter_particle AS particle ON particle.id = edge.particle
         WHERE edge.src = ${address.src}
         ORDER BY particle.id
      `) effects.push(...await this.materializeMatter(sql, {
        path: "matter", src: reference.wimp, localId: Number(reference.localId),
      }))
      return
    }
    if (address.path === "variant") {
      const localField = positiveInteger(value.field, "variant.field")
      effects.push(...await this.materializeFieldForAtoms(sql, address.src, localField))
      return
    }
    if (address.path === "state") {
      return
    }
    if (address.path === "matter") effects.push(...await this.materializeMatter(sql, address))
  }

  private async removeRuntimeConsequences(sql: Database, address: InflatonAddress, effects: Particle[]): Promise<void> {
    if (address.path === "matter") {
      effects.push(...await this.removeMatterInstances(sql, address))
      return
    }
    if (address.path === "wimp") {
      for (const atom of await sql<Array<{id: number}>>`SELECT id FROM atom WHERE wimp = ${address.src} ORDER BY id DESC`) {
        effects.push(...await this.removeRuntimeBranch(sql, "atom", Number(atom.id)))
      }
      return
    }
    if (address.path === "field") {
      const row = (await sql<Array<{id: number}>>`SELECT id FROM field WHERE wimp = ${address.src} AND local_id = ${address.localId}`)[0]
      if (!row) return
      for (const atom of await sql<Array<{atom: number}>>`SELECT atom FROM atom_value WHERE field = ${row.id}`) {
        effects.push({part: "gluon", op: "remove", path: Number(atom.atom), ts: Date.now(), value: {fields: {[String(row.id)]: null}}})
      }
    }
  }

  private async flushFieldDefault(sql: Database, src: string, localId: number): Promise<boolean> {
    const key = identityKey("field", src, localId)
    if (!this.pendingEnumDefaults.has(key)) return true
    const field = (await sql<Array<StoredField>>`
      SELECT id, wimp, local_id AS localId, key, type, required FROM field
       WHERE wimp = ${src} AND local_id = ${localId}
    `)[0]
    if (!field) return false
    const raw = this.pendingEnumDefaults.get(key)
    const variants = new Map<string, number>()
    if (field.type === "enum") {
      for (const row of await sql<Array<{id: number; item: string}>>`
        SELECT id, item_value AS item FROM field_enum_variant WHERE field = ${field.id}
      `) variants.set(row.item, Number(row.id))
      if (!variants.has(String(raw))) return false
    }
    await sql`DELETE FROM field_default WHERE field = ${field.id}`
    await insertFieldDefault(sql, Number(field.id), {
      key: field.key,
      type: field.type,
      required: field.required === 1,
      default: raw,
    } as MetaFieldDSL, variants)
    this.pendingEnumDefaults.delete(key)
    return true
  }

  private async fieldDefault(sql: Database, field: StoredField): Promise<DefaultResult> {
    if (this.pendingEnumDefaults.has(identityKey("field", field.wimp, field.localId))) return {ready: false}
    const exists = (await sql<Array<{ok: number}>>`SELECT 1 AS ok FROM field_default WHERE field = ${field.id}`)[0]
    if (!exists) return {ready: true, value: null}
    if (field.type === "string") return {ready: true, value: (await sql<Array<{value: string}>>`
      SELECT default_value AS value FROM field_string_default WHERE field = ${field.id}
    `)[0]?.value ?? ""}
    if (field.type === "number") return {ready: true, value: Number((await sql<Array<{value: number}>>`
      SELECT default_value AS value FROM field_number_default WHERE field = ${field.id}
    `)[0]?.value ?? 0)}
    if (field.type === "boolean") return {ready: true, value: (await sql<Array<{value: number}>>`
      SELECT default_value AS value FROM field_boolean_default WHERE field = ${field.id}
    `)[0]?.value === 1}
    if (field.type === "enum") return {ready: true, value: (await sql<Array<{value: string}>>`
      SELECT variant.item_value AS value FROM field_enum_default AS default_value
      JOIN field_enum_variant AS variant ON variant.id = default_value.variant
      WHERE default_value.field = ${field.id}
    `)[0]?.value ?? null}
    return {ready: true, value: (await sql<Array<{value: string}>>`
      SELECT item_value AS value FROM field_array_default_item WHERE field = ${field.id} ORDER BY position
    `).map((row) => row.value)}
  }

  private async ensureRootAtom(sql: Database, src: string): Promise<Particle[]> {
    const existing = (await sql<Array<{id: number}>>`
      SELECT id FROM atom WHERE wimp = ${src} AND parent_atom IS NULL AND parent_topology IS NULL LIMIT 1
    `)[0]
    return existing ? [] : await this.createAtom(sql, src, null, "wimp", src, 0, 0)
  }

  private async createAtom(
    sql: Database,
    src: string,
    parent: RuntimeRef | null,
    declarationKind: "wimp" | "matter",
    declarationWimp: string,
    declarationLocalId: number,
    ordinal: number,
    initialFields: JsonRecord = {},
  ): Promise<Particle[]> {
    const parentKind = parent?.kind ?? "root"
    const parentRuntimeId = parent?.id ?? 0
    const found = (await sql<Array<{runtime_id: number}>>`
      SELECT runtime_id FROM boundary_runtime_origin
       WHERE kind = ${"atom"} AND declaration_kind = ${declarationKind}
         AND declaration_wimp = ${declarationWimp} AND declaration_local_id = ${declarationLocalId}
         AND parent_kind = ${parentKind} AND parent_runtime_id = ${parentRuntimeId} AND ordinal = ${ordinal}
    `)[0]
    if (found) return []
    const exists = (await sql<Array<{ok: number}>>`SELECT 1 AS ok FROM wimp WHERE src = ${src}`)[0]
    if (!exists) return []
    const suppliedKeys = Object.keys(initialFields)
    if (suppliedKeys.length > 0) {
      const declaredKeys = new Set((await sql<Array<{key: string}>>`
        SELECT key FROM field WHERE wimp = ${src}
      `).map((field) => field.key))
      if (suppliedKeys.some((key) => !declaredKeys.has(key))) return []
    }
    const position = Number((await sql<Array<{count: number}>>`
      SELECT COUNT(*) AS count FROM atom
       WHERE parent_atom IS ${parent?.kind === "atom" ? parent.id : null}
         AND parent_topology IS ${parent?.kind === "topology" ? parent.id : null}
    `)[0]?.count ?? 0)
    const atom = await insertedId(sql<Array<{id: number}>>`
      INSERT INTO atom (parent_atom, parent_topology, wimp, position)
      VALUES (${parent?.kind === "atom" ? parent.id : null}, ${parent?.kind === "topology" ? parent.id : null}, ${src}, ${position})
      RETURNING id
    `, `Atom ${src}`)
    await sql`
      INSERT INTO boundary_runtime_origin (
        kind, runtime_id, declaration_kind, declaration_wimp, declaration_local_id,
        parent_kind, parent_runtime_id, owner_atom, ordinal
      ) VALUES (
        ${"atom"}, ${atom}, ${declarationKind}, ${declarationWimp}, ${declarationLocalId},
        ${parentKind}, ${parentRuntimeId}, ${atom}, ${ordinal}
      )
    `
    const remaining = new Set(Object.keys(initialFields))
    for (const field of await sql<Array<StoredField>>`
      SELECT id, wimp, local_id AS localId, key, type, required FROM field WHERE wimp = ${src} ORDER BY local_id
    `) {
      const supplied = Object.hasOwn(initialFields, field.key)
      if (supplied) remaining.delete(field.key)
      if (supplied) {
        await this.setAtomValue(sql, atom, field, initialFields[field.key])
        continue
      }
      const fallback = await this.fieldDefault(sql, field)
      if (!fallback.ready) continue
      await this.setAtomValue(sql, atom, field, fallback.value)
    }
    if (remaining.size > 0) throw new Error(`Matter field preflight diverged for ${src}: ${[...remaining].join(", ")}`)
    const initialState = (await sql<Array<{id: number}>>`
      SELECT id FROM state WHERE wimp = ${src} ORDER BY position LIMIT 1
    `)[0]?.id ?? null
    await sql`INSERT INTO atom_state (atom, metaState) VALUES (${atom}, ${initialState})`
    const entity = await this.atomEntity(sql, atom)
    const effects: Particle[] = entity ? [{part: "graviton", op: "add", path: `atom/${atom}`, ts: Date.now(), value: entity}] : []
    for (const row of await sql<Array<{localId: number}>>`
      SELECT local_id AS localId FROM matter_particle WHERE wimp = ${src} AND parent_particle IS NULL ORDER BY particle_order
    `) effects.push(...await this.materializeMatter(sql, {path: "matter", src, localId: Number(row.localId)}))
    return effects
  }

  private async materializeFieldForAtoms(sql: Database, src: string, localId: number): Promise<Particle[]> {
    const field = (await sql<Array<StoredField>>`
      SELECT id, wimp, local_id AS localId, key, type, required FROM field
       WHERE wimp = ${src} AND local_id = ${localId}
    `)[0]
    if (!field) return []
    const defaultValue = await this.fieldDefault(sql, field)
    if (!defaultValue.ready) return []
    const effects: Particle[] = []
    for (const atom of await sql<Array<{id: number}>>`SELECT id FROM atom WHERE wimp = ${src}`) {
      const exists = (await sql<Array<{ok: number}>>`SELECT 1 AS ok FROM atom_value WHERE atom = ${atom.id} AND field = ${field.id}`)[0]
      if (exists) continue
      await this.setAtomValue(sql, Number(atom.id), field, defaultValue.value)
      effects.push({part: "gluon", op: "add", path: Number(atom.id), ts: Date.now(), value: {fields: {[String(field.id)]: clone(defaultValue.value)}}})
    }
    return effects
  }

  private async setAtomValue(sql: Database, atom: number, field: StoredField, raw: unknown): Promise<number> {
    const previous = (await sql<Array<{value: number}>>`SELECT value FROM atom_value WHERE atom = ${atom} AND field = ${field.id}`)[0]
    if (previous) await sql`DELETE FROM atom_value WHERE atom = ${atom} AND field = ${field.id}`
    const value = await insertedId(sql<Array<{id: number}>>`INSERT INTO value (kind) VALUES (${this.valueKind(field.type, raw)}) RETURNING id`, "Atom value")
    if (raw !== null && raw !== undefined) {
      if (field.type === "boolean") await sql`INSERT INTO value_boolean (value, boolean) VALUES (${value}, ${raw ? 1 : 0})`
      else if (field.type === "number") await sql`INSERT INTO value_number (value, number) VALUES (${value}, ${Number(raw)})`
      else if (field.type === "string") await sql`INSERT INTO value_string (value, text) VALUES (${value}, ${String(raw)})`
      else if (field.type === "enum") {
        const variant = (await sql<Array<{id: number}>>`
          SELECT id FROM field_enum_variant WHERE field = ${field.id} AND item_value = ${String(raw)} LIMIT 1
        `)[0]
        if (!variant) throw new Error(`Unknown enum variant "${String(raw)}" for field ${field.id}`)
        await sql`INSERT INTO value_enum (value, variant) VALUES (${value}, ${variant.id})`
      } else {
        for (let position = 0; position < (Array.isArray(raw) ? raw.length : 0); position++) {
          await sql`INSERT INTO value_list_item (value, position, item_value) VALUES (${value}, ${position}, ${String((raw as unknown[])[position])})`
        }
      }
    }
    await sql`INSERT INTO atom_value (atom, field, value) VALUES (${atom}, ${field.id}, ${value})`
    if (previous) await sql`DELETE FROM value WHERE id = ${previous.value}`
    return value
  }

  private valueKind(type: StoredField["type"], raw: unknown): "null" | "boolean" | "number" | "string" | "enum" | "list" {
    if (raw === null || raw === undefined) return "null"
    if (type === "boolean") return "boolean"
    if (type === "number") return "number"
    if (type === "enum") return "enum"
    if (type === "array") return "list"
    return "string"
  }

  private async materializeMatter(
    sql: Database,
    address: InflatonAddress,
    explicitParent?: RuntimeRef,
  ): Promise<Particle[]> {
    const matter = await this.matter(sql, address.src, address.localId)
    if (!matter) return []
    const parents = explicitParent ? [explicitParent] : await this.matterParents(sql, matter)
    const effects: Particle[] = []

    for (const parent of parents) {
      if (!await this.branchSelected(sql, parent, matter)) continue
      const repeats = await this.repetitionCount(sql, parent)
      for (let ordinal = 0; ordinal < repeats; ordinal++) {
        if (matter.kind === "wimp") {
          if (!matter.targetSrc) continue
          const target = (await sql<Array<{ok: number}>>`SELECT 1 AS ok FROM wimp WHERE src = ${matter.targetSrc}`)[0]
          if (!target) continue
          const initialFields = await this.resolveInitialFields(sql, matter.fieldsBinding, parent.ownerAtom)
          effects.push(...await this.createAtom(
            sql,
            matter.targetSrc,
            parent,
            "matter",
            matter.wimp,
            matter.localId,
            ordinal,
            initialFields,
          ))
          continue
        }

        const topology = await this.createTopology(sql, matter, parent, ordinal)
        effects.push(...topology.effects)
        const topologyParent: RuntimeRef = {kind: "topology", id: topology.id, ownerAtom: parent.ownerAtom}
        for (const child of await this.matterChildren(sql, matter.id)) {
          effects.push(...await this.materializeMatter(
            sql,
            {path: "matter", src: child.wimp, localId: child.localId},
            topologyParent,
          ))
        }
      }
    }
    return effects
  }

  private async matter(sql: Database, src: string, localId: number): Promise<StoredMatter | null> {
    const row = (await sql<Array<{
      id: number; wimp: string; localId: number; parentLocalId: number | null;
      kind: MatterParticleKind; edgeSlot: MatterEdgeSlot; position: number;
      targetSrc: string | null; fieldsBinding: number | null; massBinding: number | null;
      fuzzyKind: string | null; fuzzyBinding: number | null; axionBinding: number | null;
      collectionBinding: number | null;
    }>>`
      SELECT particle.id, particle.wimp, particle.local_id AS localId,
             parent.local_id AS parentLocalId,
             particle.particle_kind AS kind, particle.edge_slot AS edgeSlot,
             particle.particle_order AS position,
             wimp_edge.src AS targetSrc, wimp_edge.fields_binding AS fieldsBinding,
             wimp_edge.mass_binding AS massBinding,
             fuzzy.fuzzy_kind AS fuzzyKind, fuzzy.predicate_binding AS fuzzyBinding,
             axion.predicate_binding AS axionBinding,
             macho.collection_binding AS collectionBinding
        FROM matter_particle AS particle
        LEFT JOIN matter_particle AS parent ON parent.id = particle.parent_particle
        LEFT JOIN matter_particle_wimp AS wimp_edge ON wimp_edge.particle = particle.id
        LEFT JOIN matter_particle_fuzzy AS fuzzy ON fuzzy.particle = particle.id
        LEFT JOIN matter_particle_axion AS axion ON axion.particle = particle.id
        LEFT JOIN matter_particle_macho AS macho ON macho.particle = particle.id
       WHERE particle.wimp = ${src} AND particle.local_id = ${localId}
    `)[0]
    return row ? {
      id: Number(row.id),
      wimp: row.wimp,
      localId: Number(row.localId),
      parentLocalId: row.parentLocalId === null ? null : Number(row.parentLocalId),
      kind: row.kind,
      edgeSlot: row.edgeSlot,
      position: Number(row.position),
      targetSrc: row.targetSrc,
      fieldsBinding: row.fieldsBinding === null ? null : Number(row.fieldsBinding),
      massBinding: row.massBinding === null ? null : Number(row.massBinding),
      fuzzyKind: row.fuzzyKind,
      predicateBinding: row.fuzzyBinding === null
        ? row.axionBinding === null ? null : Number(row.axionBinding)
        : Number(row.fuzzyBinding),
      collectionBinding: row.collectionBinding === null ? null : Number(row.collectionBinding),
    } : null
  }

  private async matterEntity(sql: Database, src: string, localId: number): Promise<JsonRecord | null> {
    const matter = await this.matter(sql, src, localId)
    if (!matter) return null
    const parentParticle = matter.parentLocalId === null
      ? null
      : (await sql<Array<{id: number}>>`
          SELECT id FROM matter_particle WHERE wimp = ${src} AND local_id = ${matter.parentLocalId}
        `)[0]?.id ?? null
    const result: JsonRecord = {
      id: matter.id,
      wimp: matter.wimp,
      localId: matter.localId,
      parentParticle: parentParticle === null ? null : Number(parentParticle),
      particleKind: matter.kind,
      edgeSlot: matter.edgeSlot,
      particleOrder: matter.position,
      kind: matter.kind,
      parent: matter.parentLocalId,
      position: matter.position,
    }
    if (matter.kind === "wimp") {
      result.src = matter.targetSrc
      const fieldsBinding = await this.bindingDeclaration(sql, matter.fieldsBinding)
      const massBinding = await this.bindingDeclaration(sql, matter.massBinding)
      if (fieldsBinding !== undefined) result.fieldsBinding = fieldsBinding
      if (massBinding !== undefined) result.massBinding = massBinding
    } else if (matter.kind === "fuzzy") {
      result.fuzzyKind = matter.fuzzyKind
      result.predicateBinding = await this.bindingDeclaration(sql, matter.predicateBinding)
    } else if (matter.kind === "axion") {
      result.predicateBinding = await this.bindingDeclaration(sql, matter.predicateBinding)
    } else {
      result.collectionBinding = await this.bindingDeclaration(sql, matter.collectionBinding)
    }
    return result
  }

  private async bindingDeclaration(sql: Database, bindingId: number | null): Promise<unknown> {
    if (bindingId === null) return undefined
    const row = (await sql<Array<{
      kind: "static" | "variable" | "dynamic"; literalKind: "text" | "boolean" | null;
      literalText: string | null; literalBoolean: number | null; expr: string | null;
    }>>`
      SELECT binding_kind AS kind, literal_kind AS literalKind,
             literal_text AS literalText, literal_boolean AS literalBoolean, expr
        FROM matter_binding WHERE id = ${bindingId}
    `)[0]
    if (!row) return undefined
    if (row.kind === "static") return row.literalKind === "boolean" ? row.literalBoolean === 1 : row.literalText
    const paths = (await sql<Array<{path: string}>>`
      SELECT path FROM matter_binding_dep WHERE binding = ${bindingId} ORDER BY dep_order
    `).map((dependency) => dependency.path)
    return {
      ...(paths.length === 0 ? {} : {data: paths.length === 1 ? paths[0] : paths}),
      ...(row.kind === "dynamic" ? {expr: row.expr} : {}),
    }
  }

  private async matterChildren(sql: Database, parent: number): Promise<StoredMatter[]> {
    const result: StoredMatter[] = []
    for (const row of await sql<Array<{wimp: string; localId: number}>>`
      SELECT wimp, local_id AS localId FROM matter_particle
       WHERE parent_particle = ${parent} ORDER BY particle_order, local_id
    `) {
      const child = await this.matter(sql, row.wimp, Number(row.localId))
      if (child) result.push(child)
    }
    return result
  }

  private async matterParents(sql: Database, matter: StoredMatter): Promise<RuntimeRef[]> {
    if (matter.parentLocalId === null) {
      return (await sql<Array<{id: number}>>`SELECT id FROM atom WHERE wimp = ${matter.wimp} ORDER BY id`).map((atom) => ({
        kind: "atom", id: Number(atom.id), ownerAtom: Number(atom.id),
      }))
    }
    return (await sql<Array<{kind: "atom" | "topology"; runtimeId: number; ownerAtom: number}>>`
      SELECT kind, runtime_id AS runtimeId, owner_atom AS ownerAtom
        FROM boundary_runtime_origin
       WHERE declaration_kind = ${"matter"}
         AND declaration_wimp = ${matter.wimp}
         AND declaration_local_id = ${matter.parentLocalId}
       ORDER BY sequence
    `).map((origin) => ({
      kind: origin.kind,
      id: Number(origin.runtimeId),
      ownerAtom: Number(origin.ownerAtom),
    }))
  }

  private async createTopology(
    sql: Database,
    matter: StoredMatter,
    parent: RuntimeRef,
    ordinal: number,
  ): Promise<{id: number; effects: Particle[]}> {
    if (matter.kind === "wimp") throw new Error("WIMP Matter cannot create Topology")
    const found = (await sql<Array<{runtimeId: number}>>`
      SELECT runtime_id AS runtimeId FROM boundary_runtime_origin
       WHERE kind = ${"topology"} AND declaration_kind = ${"matter"}
         AND declaration_wimp = ${matter.wimp} AND declaration_local_id = ${matter.localId}
         AND parent_kind = ${parent.kind} AND parent_runtime_id = ${parent.id} AND ordinal = ${ordinal}
    `)[0]
    if (found) return {id: Number(found.runtimeId), effects: []}
    const position = Number((await sql<Array<{count: number}>>`
      SELECT COUNT(*) AS count FROM topology
       WHERE parent_atom IS ${parent.kind === "atom" ? parent.id : null}
         AND parent_topology IS ${parent.kind === "topology" ? parent.id : null}
    `)[0]?.count ?? 0)
    const id = await insertedId(sql<Array<{id: number}>>`
      INSERT INTO topology (parent_atom, parent_topology, kind, position)
      VALUES (
        ${parent.kind === "atom" ? parent.id : null},
        ${parent.kind === "topology" ? parent.id : null},
        ${matter.kind}, ${position}
      ) RETURNING id
    `, `Topology ${matter.kind}`)
    await sql`
      INSERT INTO boundary_runtime_origin (
        kind, runtime_id, declaration_kind, declaration_wimp, declaration_local_id,
        parent_kind, parent_runtime_id, owner_atom, ordinal
      ) VALUES (
        ${"topology"}, ${id}, ${"matter"}, ${matter.wimp}, ${matter.localId},
        ${parent.kind}, ${parent.id}, ${parent.ownerAtom}, ${ordinal}
      )
    `
    const entity = await this.topologyEntity(sql, id)
    return {
      id,
      effects: entity ? [{part: "graviton", op: "add", path: `topology/${id}`, ts: Date.now(), value: entity}] : [],
    }
  }

  private async resolveInitialFields(sql: Database, bindingId: number | null, ownerAtom: number): Promise<JsonRecord> {
    if (bindingId === null) return {}
    const binding = await this.binding(sql, bindingId, ownerAtom)
    if (isRecord(binding)) return binding
    if (typeof binding === "string") {
      const indirect = await this.atomFieldByKey(sql, ownerAtom, binding)
      return isRecord(indirect) ? indirect : {}
    }
    return {}
  }

  private async bindingValues(sql: Database, bindingId: number, ownerAtom: number): Promise<unknown[]> {
    const values: unknown[] = []
    for (const dependency of await sql<Array<{path: string}>>`
      SELECT path FROM matter_binding_dep WHERE binding = ${bindingId} ORDER BY dep_order
    `) {
      if (dependency.path === "/state") {
        values.push((await sql<Array<{name: string}>>`
          SELECT state.name FROM atom_state JOIN state ON state.id = atom_state.metaState
           WHERE atom_state.atom = ${ownerAtom}
        `)[0]?.name)
      } else values.push(await this.atomFieldByKey(sql, ownerAtom, dependency.path))
    }
    return values
  }

  private async binding(sql: Database, bindingId: number, ownerAtom: number): Promise<unknown> {
    const binding = (await sql<Array<{
      kind: "static" | "variable" | "dynamic"; literalKind: "text" | "boolean" | null;
      literalText: string | null; literalBoolean: number | null; expr: string | null;
    }>>`
      SELECT binding_kind AS kind, literal_kind AS literalKind,
             literal_text AS literalText, literal_boolean AS literalBoolean, expr
        FROM matter_binding WHERE id = ${bindingId}
    `)[0]
    if (!binding) return undefined
    if (binding.kind === "static") return binding.literalKind === "boolean" ? binding.literalBoolean === 1 : binding.literalText
    const values = await this.bindingValues(sql, bindingId, ownerAtom)
    if (binding.kind === "variable") return values.length <= 1 ? values[0] : values
    return new Function("_", `"use strict"; return (${binding.expr ?? "undefined"})`)(values) as unknown
  }

  private async repetitionCount(sql: Database, parent: RuntimeRef): Promise<number> {
    if (parent.kind !== "topology") return 1
    const origin = (await sql<Array<{wimp: string; localId: number}>>`
      SELECT declaration_wimp AS wimp, declaration_local_id AS localId
        FROM boundary_runtime_origin
       WHERE kind = ${"topology"} AND runtime_id = ${parent.id}
    `)[0]
    if (!origin) return 0
    const controller = await this.matter(sql, origin.wimp, Number(origin.localId))
    if (!controller || controller.kind !== "macho" || controller.collectionBinding === null) return 1
    const collection = await this.binding(sql, controller.collectionBinding, parent.ownerAtom)
    return Array.isArray(collection) ? collection.length : 0
  }

  private async branchSelected(sql: Database, parent: RuntimeRef, child: StoredMatter): Promise<boolean> {
    if (parent.kind !== "topology") return true
    const origin = (await sql<Array<{wimp: string; localId: number}>>`
      SELECT declaration_wimp AS wimp, declaration_local_id AS localId
        FROM boundary_runtime_origin
       WHERE kind = ${"topology"} AND runtime_id = ${parent.id}
    `)[0]
    if (!origin) return false
    const controller = await this.matter(sql, origin.wimp, Number(origin.localId))
    if (!controller || controller.kind === "macho") return true
    if (controller.predicateBinding === null) return false

    if (controller.kind === "axion") {
      const selected = Boolean(await this.binding(sql, controller.predicateBinding, parent.ownerAtom))
      if (child.edgeSlot === "then") return selected
      if (child.edgeSlot === "else") return !selected
      return selected
    }

    const binding = (await sql<Array<{expr: string | null}>>`
      SELECT expr FROM matter_binding WHERE id = ${controller.predicateBinding}
    `)[0]
    const values = await this.bindingValues(sql, controller.predicateBinding, parent.ownerAtom)
    const selected = binding?.expr?.includes("${")
      ? binding.expr.replace(/\$\{_\[(\d+)\]\}/g, (_match, index: string) => String(values[Number(index)] ?? ""))
      : String(await this.binding(sql, controller.predicateBinding, parent.ownerAtom) ?? "")
    return child.kind === "wimp" && child.targetSrc === selected
  }

  private async atomFieldByKey(sql: Database, atom: number, key: string): Promise<unknown> {
    const row = (await sql<Array<{value: number; type: StoredField["type"]}>>`
      SELECT atom_value.value, field.type
        FROM atom_value JOIN field ON field.id = atom_value.field
       WHERE atom_value.atom = ${atom} AND field.key = ${key}
    `)[0]
    return row ? await this.readValue(sql, Number(row.value), row.type) : undefined
  }

  private async readValue(sql: Database, id: number, type?: StoredField["type"]): Promise<unknown> {
    const kind = (await sql<Array<{kind: string}>>`SELECT kind FROM value WHERE id = ${id}`)[0]?.kind
    if (kind === "null" || kind === undefined) return null
    if (kind === "boolean") return (await sql<Array<{value: number}>>`SELECT boolean AS value FROM value_boolean WHERE value = ${id}`)[0]?.value === 1
    if (kind === "number") return Number((await sql<Array<{value: number}>>`SELECT number AS value FROM value_number WHERE value = ${id}`)[0]?.value)
    if (kind === "string") return (await sql<Array<{value: string}>>`SELECT text AS value FROM value_string WHERE value = ${id}`)[0]?.value ?? ""
    if (kind === "enum") return (await sql<Array<{value: string}>>`
      SELECT variant.item_value AS value FROM value_enum JOIN field_enum_variant AS variant ON variant.id = value_enum.variant
       WHERE value_enum.value = ${id}
    `)[0]?.value ?? null
    const items = (await sql<Array<{value: string}>>`SELECT item_value AS value FROM value_list_item WHERE value = ${id} ORDER BY position`).map((row) => row.value)
    if (type === "array") return items
    return items
  }

  private async massValue(sql: Database, src: string, parent: number | null): Promise<unknown> {
    const rows = await sql<Array<{
      id: number; kind: string; entryKey: string | null; entryOrder: number | null;
      textValue: string | null; numberValue: number | null; booleanValue: number | null;
    }>>`
      SELECT id, value_kind AS kind, entry_key AS entryKey, entry_order AS entryOrder,
             text_value AS textValue, number_value AS numberValue, boolean_value AS booleanValue
        FROM wimp_mass_value
       WHERE wimp = ${src} AND parent_value IS ${parent}
       ORDER BY COALESCE(entry_order, 0), id
    `
    const decode = async (row: typeof rows[number]): Promise<unknown> => {
      if (row.kind === "string") return row.textValue ?? ""
      if (row.kind === "number") return Number(row.numberValue ?? 0)
      if (row.kind === "boolean") return row.booleanValue === 1
      if (row.kind === "null") return null
      if (row.kind === "array") return await this.massValue(sql, src, Number(row.id))
      const object: JsonRecord = {}
      for (const child of await sql<Array<{entryKey: string | null; id: number}>>`
        SELECT entry_key AS entryKey, id FROM wimp_mass_value
         WHERE wimp = ${src} AND parent_value = ${row.id} ORDER BY id
      `) {
        if (child.entryKey === null) continue
        const value = await this.massValueById(sql, Number(child.id))
        object[child.entryKey] = value
      }
      return object
    }
    if (parent !== null) return await Promise.all(rows.map(decode))
    return rows[0] ? await decode(rows[0]) : null
  }

  private async massValueById(sql: Database, id: number): Promise<unknown> {
    const row = (await sql<Array<{
      wimp: string; kind: string; textValue: string | null; numberValue: number | null; booleanValue: number | null;
    }>>`
      SELECT wimp, value_kind AS kind, text_value AS textValue,
             number_value AS numberValue, boolean_value AS booleanValue
        FROM wimp_mass_value WHERE id = ${id}
    `)[0]
    if (!row) return null
    if (row.kind === "string") return row.textValue ?? ""
    if (row.kind === "number") return Number(row.numberValue ?? 0)
    if (row.kind === "boolean") return row.booleanValue === 1
    if (row.kind === "null") return null
    const children = await sql<Array<{id: number; entryKey: string | null}>>`
      SELECT id, entry_key AS entryKey FROM wimp_mass_value WHERE parent_value = ${id}
       ORDER BY COALESCE(entry_order, 0), id
    `
    if (row.kind === "array") return await Promise.all(children.map((child) => this.massValueById(sql, Number(child.id))))
    const object: JsonRecord = {}
    for (const child of children) if (child.entryKey !== null) object[child.entryKey] = await this.massValueById(sql, Number(child.id))
    return object
  }

  private async removeMatterInstances(sql: Database, address: InflatonAddress): Promise<Particle[]> {
    const effects: Particle[] = []
    for (const origin of await sql<Array<{kind: "atom" | "topology"; runtime_id: number}>>`
      SELECT kind, runtime_id FROM boundary_runtime_origin
       WHERE declaration_kind = ${"matter"} AND declaration_wimp = ${address.src}
         AND declaration_local_id = ${address.localId} ORDER BY sequence DESC
    `) effects.push(...await this.removeRuntimeBranch(sql, origin.kind, Number(origin.runtime_id)))
    return effects
  }

  private async removeRuntimeBranch(sql: Database, kind: "atom" | "topology", id: number): Promise<Particle[]> {
    const effects: Particle[] = []
    const visit = async (childKind: "atom" | "topology", childId: number): Promise<void> => {
      for (const row of await sql<Array<{id: number}>>`
        SELECT id FROM atom WHERE parent_atom IS ${childKind === "atom" ? childId : null}
          AND parent_topology IS ${childKind === "topology" ? childId : null}
      `) await visit("atom", Number(row.id))
      for (const row of await sql<Array<{id: number}>>`
        SELECT id FROM topology WHERE parent_atom IS ${childKind === "atom" ? childId : null}
          AND parent_topology IS ${childKind === "topology" ? childId : null}
      `) await visit("topology", Number(row.id))
      effects.push({part: "graviton", op: "remove", path: `${childKind}/${childId}`, ts: Date.now()})
      const values = childKind === "atom" ? await sql<Array<{value: number}>>`SELECT value FROM atom_value WHERE atom = ${childId}` : []
      await sql`DELETE FROM boundary_runtime_origin WHERE kind = ${childKind} AND runtime_id = ${childId}`
      if (childKind === "atom") await sql`DELETE FROM atom WHERE id = ${childId}`
      else await sql`DELETE FROM topology WHERE id = ${childId}`
      for (const value of values) await sql`DELETE FROM value WHERE id = ${value.value}`
    }
    await visit(kind, id)
    return effects
  }

  private async applyHiggs(part: Particle): Promise<BoundaryIncrementalCommit | null> {
    if (typeof part.path !== "number") return null
    const atomId = part.path
    const fields = resolveForceFieldsPayload(part.value)
    if (!fields || (part.op !== "add" && part.op !== "replace" && part.op !== "remove")) return null
    const effects = await this.sql.begin(async (tx): Promise<Particle[]> => {
      const committed: Particle[] = []
      const atom = (await tx<Array<{wimp: string}>>`SELECT wimp FROM atom WHERE id = ${atomId}`)[0]
      if (!atom) throw new Error(`Unknown Atom ${atomId}`)
      const changedKeys = new Set<string>()
      for (const [rawField, raw] of Object.entries(fields)) {
        const id = Number(rawField)
        const field = (await tx<Array<StoredField>>`
          SELECT id, wimp, local_id AS localId, key, type, required FROM field WHERE id = ${id}
        `)[0]
        if (!field || field.wimp !== atom.wimp) throw new Error(`Field ${rawField} does not belong to Atom ${atomId}`)
        changedKeys.add(field.key)
        if (part.op === "remove") {
          const previous = (await tx<Array<{value: number}>>`SELECT value FROM atom_value WHERE atom = ${atomId} AND field = ${id}`)[0]
          await tx`DELETE FROM atom_value WHERE atom = ${atomId} AND field = ${id}`
          if (previous) await tx`DELETE FROM value WHERE id = ${previous.value}`
        } else await this.setAtomValue(tx, atomId, field, raw)
      }
      committed.push({...clone(part), ts: Date.now()})

      for (const topology of await tx<Array<{runtimeId: number; wimp: string; localId: number}>>`
        SELECT origin.runtime_id AS runtimeId, origin.declaration_wimp AS wimp,
               origin.declaration_local_id AS localId
          FROM boundary_runtime_origin AS origin
          JOIN topology ON topology.id = origin.runtime_id
         WHERE origin.kind = ${"topology"} AND origin.owner_atom = ${atomId}
         ORDER BY origin.sequence
      `) {
        const controller = await this.matter(tx, topology.wimp, Number(topology.localId))
        if (!controller) continue
        const bindingId = controller.kind === "macho"
          ? controller.collectionBinding
          : controller.kind === "fuzzy" || controller.kind === "axion"
            ? controller.predicateBinding
            : null
        if (bindingId === null) continue
        const dependencies = (await tx<Array<{path: string}>>`
          SELECT path FROM matter_binding_dep WHERE binding = ${bindingId}
        `).map((dependency) => dependency.path)
        if (!dependencies.some((path) => path !== "/state" && changedKeys.has(path))) continue

        const parent: RuntimeRef = {
          kind: "topology",
          id: Number(topology.runtimeId),
          ownerAtom: atomId,
        }
        for (const child of await tx<Array<{kind: "atom" | "topology"; runtimeId: number}>>`
          SELECT kind, runtime_id AS runtimeId FROM boundary_runtime_origin
           WHERE parent_kind = ${"topology"} AND parent_runtime_id = ${parent.id}
           ORDER BY sequence DESC
        `) committed.push(...await this.removeRuntimeBranch(tx, child.kind, Number(child.runtimeId)))
        committed.push({
          part: "higgs",
          op: "replace",
          path: `topology/${parent.id}`,
          ts: Date.now(),
          value: {fields: clone(fields)},
        })
        for (const child of await this.matterChildren(tx, controller.id)) {
          committed.push(...await this.materializeMatter(
            tx,
            {path: "matter", src: child.wimp, localId: child.localId},
            parent,
          ))
        }
      }
      return committed
    })
    await this.updateIndexes(effects)
    return {rootSrc: await this.rootSrc(), messages: effects.map(particleMessage)}
  }

  private async atomEntity(sql: Database, id: number): Promise<JsonRecord | null> {
    const atom = (await sql<Array<{id: number; parent_atom: number | null; parent_topology: number | null; wimp: string; position: number}>>`
      SELECT id, parent_atom, parent_topology, wimp, position FROM atom WHERE id = ${id}
    `)[0]
    if (!atom) return null
    const values: Array<{atom: number; field: number; value: number}> = []
    const valueRecords: JsonRecord[] = []
    const valueItems: Array<{value: number; position: number; itemValue: string}> = []
    for (const row of await sql<Array<{field: number; value: number; kind: string}>>`
      SELECT atom_value.field, atom_value.value, value.kind
        FROM atom_value JOIN value ON value.id = atom_value.value
       WHERE atom_value.atom = ${id} ORDER BY atom_value.field
    `) {
      values.push({atom: id, field: Number(row.field), value: Number(row.value)})
      const raw = await this.readValue(sql, Number(row.value))
      if (row.kind === "boolean") valueRecords.push({id: Number(row.value), kind: "boolean", boolean: Boolean(raw)})
      else if (row.kind === "number") valueRecords.push({id: Number(row.value), kind: "number", number: Number(raw)})
      else if (row.kind === "string") valueRecords.push({id: Number(row.value), kind: "string", text: String(raw)})
      else if (row.kind === "enum") {
        const variant = (await sql<Array<{variant: number}>>`SELECT variant FROM value_enum WHERE value = ${row.value}`)[0]?.variant
        valueRecords.push({id: Number(row.value), kind: "enum", variant: Number(variant)})
      } else valueRecords.push({id: Number(row.value), kind: row.kind})
      if (row.kind === "list") {
        for (const item of await sql<Array<{position: number; itemValue: string}>>`
          SELECT position, item_value AS itemValue FROM value_list_item WHERE value = ${row.value} ORDER BY position
        `) valueItems.push({value: Number(row.value), position: Number(item.position), itemValue: item.itemValue})
      }
    }
    const selected = (await sql<Array<{metaState: number | null}>>`SELECT metaState FROM atom_state WHERE atom = ${id}`)[0]?.metaState ?? null
    return {
      atom: {
        id,
        parentAtom: atom.parent_atom === null ? null : Number(atom.parent_atom),
        parentTopology: atom.parent_topology === null ? null : Number(atom.parent_topology),
        wimp: atom.wimp,
        position: Number(atom.position),
      },
      values,
      valueRecords,
      valueItems,
      state: {atom: id, metaState: selected === null ? null : Number(selected)},
    }
  }

  private async topologyEntity(sql: Database, id: number): Promise<JsonRecord | null> {
    const row = (await sql<Array<{
      id: number; parentAtom: number | null; parentTopology: number | null; kind: string; position: number
    }>>`
      SELECT id, parent_atom AS parentAtom, parent_topology AS parentTopology, kind, position
        FROM topology WHERE id = ${id}
    `)[0]
    return row ? {
      id: Number(row.id),
      parentAtom: row.parentAtom === null ? null : Number(row.parentAtom),
      parentTopology: row.parentTopology === null ? null : Number(row.parentTopology),
      kind: row.kind,
      position: Number(row.position),
    } : null
  }

  private async rootSrc(): Promise<string | null> {
    return (await this.sql<Array<{wimp: string}>>`
      SELECT wimp FROM atom WHERE parent_atom IS NULL AND parent_topology IS NULL ORDER BY id LIMIT 1
    `)[0]?.wimp ?? null
  }

  private originName(kind: "wimp" | "matter", wimp: string, localId: number): string {
    return `${kind}\u0000${wimp}\u0000${localId}`
  }

  private async loadIndexes(): Promise<void> {
    for (const row of await this.sql<Array<{
      kind: "atom" | "topology"; runtime_id: number; declaration_kind: "wimp" | "matter";
      declaration_wimp: string; declaration_local_id: number; parent_kind: "root" | "atom" | "topology"; parent_runtime_id: number
    }>>`
      SELECT kind, runtime_id, declaration_kind, declaration_wimp, declaration_local_id, parent_kind, parent_runtime_id
        FROM boundary_runtime_origin ORDER BY sequence
    `) {
      this.indexInstance(
        row.kind,
        Number(row.runtime_id),
        this.originName(row.declaration_kind, row.declaration_wimp, Number(row.declaration_local_id)),
        row.parent_kind === "root" ? "root" : `${row.parent_kind}/${row.parent_runtime_id}`,
      )
    }
  }

  private async updateIndexes(effects: Particle[]): Promise<void> {
    for (const effect of effects) {
      if (effect.part !== "graviton" || typeof effect.path !== "string") continue
      const match = /^(atom|topology)\/(\d+)$/.exec(effect.path)
      if (!match) continue
      const kind = match[1]! as "atom" | "topology"
      const id = Number(match[2])
      if (effect.op === "remove") {
        this.unindexInstance(kind, id)
        continue
      }
      const row = (await this.sql<Array<{
        declaration_kind: "wimp" | "matter"; declaration_wimp: string; declaration_local_id: number;
        parent_kind: "root" | "atom" | "topology"; parent_runtime_id: number
      }>>`
        SELECT declaration_kind, declaration_wimp, declaration_local_id, parent_kind, parent_runtime_id
          FROM boundary_runtime_origin WHERE kind = ${kind} AND runtime_id = ${id}
      `)[0]
      if (!row) continue
      this.indexInstance(
        kind,
        id,
        this.originName(row.declaration_kind, row.declaration_wimp, Number(row.declaration_local_id)),
        row.parent_kind === "root" ? "root" : `${row.parent_kind}/${row.parent_runtime_id}`,
      )
    }
  }

  private indexInstance(kind: "atom" | "topology", id: number, origin: string, parent: string): void {
    this.unindexInstance(kind, id)
    const key = runtimeKey(kind, id)
    this.originByInstance.set(key, origin)
    this.parentByInstance.set(key, parent)
    if (parent !== "root") {
      const children = this.childrenByParent.get(parent)
      if (children) children.add(key)
      else this.childrenByParent.set(parent, new Set([key]))
    }
    const target = kind === "atom" ? this.atomIdsByDeclaration : this.instanceIdsByTopology
    const ids = target.get(origin)
    if (ids) ids.add(id)
    else target.set(origin, new Set([id]))
  }

  private unindexInstance(kind: "atom" | "topology", id: number): void {
    const key = runtimeKey(kind, id)
    const origin = this.originByInstance.get(key)
    const parent = this.parentByInstance.get(key)
    if (parent) {
      this.childrenByParent.get(parent)?.delete(key)
      if (this.childrenByParent.get(parent)?.size === 0) this.childrenByParent.delete(parent)
    }
    if (origin) (kind === "atom" ? this.atomIdsByDeclaration : this.instanceIdsByTopology).get(origin)?.delete(id)
    this.originByInstance.delete(key)
    this.parentByInstance.delete(key)
  }
}
