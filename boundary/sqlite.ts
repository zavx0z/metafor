import {SQL, type ReservedSQL} from "bun"
import {mkdirSync} from "node:fs"
import {dirname} from "node:path"
import {BoundaryWimpSqlite} from "@boundary/wimp/sqlite"
import {BoundaryActorSqlite} from "@boundary/actor/sqlite"
import {BoundaryTopologySqlite} from "@boundary/topology/sqlite"
import {bulkRuntime as buildBulkRuntime} from "./runtime/bulk.ts"
import {energyRuntime as buildEnergyRuntime} from "./runtime/energy.ts"

import type {Boundary} from "./index.ts"
import {
  absorbForceMessage,
  closeForceChannel,
  entropyForceMessage,
  emitForceMessage,
  observeForceMessage,
} from "./force.ts"
import type {ForceBinding, ForceMessageListener, Particle, ParticleOperation, Part} from "./force.t.ts"

export type BoundaryPart = Part

export type BoundaryParticle = Particle

export type BoundaryUpdateMessage = {
  parts: BoundaryParticle[]
}

type Tx = SQL | ReservedSQL
type TopologyDomainPath = "fuzzy" | "axion" | "macho"

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const requireRecord = (value: unknown, path: string): Record<string, unknown> => {
  if (!isRecord(value)) throw new Error(`Particle ${path} requires object value`)
  return value
}

const optionalString = (value: unknown, key: string, path: string): string | null => {
  const v = (value as Record<string, unknown>)[key]
  if (v === undefined || v === null) return null
  if (typeof v !== "string") throw new Error(`Particle ${path}: "${key}" must be string`)
  return v
}

const optionalId = (value: unknown, key: string, path: string): number | null => {
  const v = (value as Record<string, unknown>)[key]
  if (v === undefined || v === null) return null
  if (typeof v === "number" && Number.isInteger(v) && v > 0) return v
  if (typeof v === "string" && /^\d+$/.test(v)) return Number(v)
  throw new Error(`Particle ${path}: "${key}" must be positive integer id`)
}

const optionalNumber = (value: unknown, key: string, path: string): number | null => {
  const v = (value as Record<string, unknown>)[key]
  if (v === undefined || v === null) return null
  if (typeof v !== "number") throw new Error(`Particle ${path}: "${key}" must be number`)
  return v
}

const optionalBoolean = (value: unknown, key: string, path: string): boolean | null => {
  const v = (value as Record<string, unknown>)[key]
  if (v === undefined || v === null) return null
  if (typeof v !== "boolean") throw new Error(`Particle ${path}: "${key}" must be boolean`)
  return v
}

const optionalObject = (value: unknown, key: string, path: string): Record<string, unknown> | null => {
  const v = (value as Record<string, unknown>)[key]
  if (v === undefined || v === null) return null
  if (!isRecord(v)) throw new Error(`Particle ${path}: "${key}" must be object`)
  return v
}

const requireArray = (value: unknown, key: string, path: string): unknown[] => {
  const v = (value as Record<string, unknown>)[key]
  if (!Array.isArray(v)) throw new Error(`Particle ${path}: "${key}" must be array`)
  return v
}

const requireString = (value: unknown, key: string, path: string): string => {
  const v = optionalString(value, key, path)
  if (v === null) throw new Error(`Particle ${path}: "${key}" is required`)
  return v
}

const requireId = (value: unknown, key: string, path: string): number => {
  const v = optionalId(value, key, path)
  if (v === null) throw new Error(`Particle ${path}: "${key}" is required`)
  return v
}

const requireNumber = (value: unknown, key: string, path: string): number => {
  const v = optionalNumber(value, key, path)
  if (v === null) throw new Error(`Particle ${path}: "${key}" is required`)
  return v
}

const notSupported = (op: ParticleOperation, path: string, part: BoundaryPart): never => {
  throw new Error(`Particle op "${op}" is not supported for "${path}" (part=${part})`)
}

const applyWimpSnapshot = async (tx: Tx, op: ParticleOperation, value: unknown): Promise<void> => {
  const path = "wimp"
  const snapshot = requireRecord(value, path)
  const wimp = requireRecord(snapshot.wimp, path)
  const src = requireString(wimp, "src", path)

  if (op === "remove") {
    await tx`DELETE FROM wimp WHERE src = ${src}`
    return
  }
  if (op !== "add" && op !== "replace") {
    notSupported(op, path, "graviton")
  }

  await tx`
    INSERT INTO wimp (src, name, desc, view_css)
    VALUES (${src}, ${optionalString(wimp, "name", path)}, ${optionalString(wimp, "desc", path)}, ${optionalString(wimp, "view", path)})
    ON CONFLICT (src) DO UPDATE SET
      name = excluded.name,
      desc = excluded.desc,
      view_css = excluded.view_css
  `

  for (const item of requireArray(snapshot, "fields", path)) {
    const field = requireRecord(item, path)
    await tx`
      INSERT INTO field (id, wimp, key, type, required, label)
      VALUES (${requireId(field, "id", path)}, ${requireString(field, "wimp", path)}, ${requireString(field, "key", path)}, ${requireString(field, "type", path)}, ${optionalBoolean(field, "required", path) ? 1 : 0}, ${optionalString(field, "label", path)})
      ON CONFLICT (id) DO UPDATE SET
        wimp = excluded.wimp,
        key = excluded.key,
        type = excluded.type,
        required = excluded.required,
        label = excluded.label
    `
  }

  for (const item of requireArray(snapshot, "enumVariants", path)) {
    const variant = requireRecord(item, path)
    await tx`
      INSERT INTO field_enum_variant (id, field, position, item_value)
      VALUES (${requireId(variant, "id", path)}, ${requireId(variant, "field", path)}, ${requireNumber(variant, "position", path)}, ${requireString(variant, "itemValue", path)})
      ON CONFLICT (id) DO UPDATE SET
        field = excluded.field,
        position = excluded.position,
        item_value = excluded.item_value
    `
  }

  for (const item of requireArray(snapshot, "states", path)) {
    const state = requireRecord(item, path)
    await tx`
      INSERT INTO state (id, wimp, name, position)
      VALUES (${requireId(state, "id", path)}, ${requireString(state, "wimp", path)}, ${requireString(state, "name", path)}, ${requireNumber(state, "position", path)})
      ON CONFLICT (id) DO UPDATE SET
        wimp = excluded.wimp,
        name = excluded.name,
        position = excluded.position
    `
  }
}

// =============================================================================
// graviton — domain structural particles
// =============================================================================

const applyActorSnapshot = async (tx: Tx, op: ParticleOperation, value: unknown): Promise<void> => {
  const path = "actor"
  const snapshot = requireRecord(value, path)
  const actor = requireRecord(snapshot.actor, path)
  const id = requireId(actor, "id", path)

  if (op === "remove") {
    await tx`DELETE FROM actor WHERE id = ${id}`
    return
  }
  if (op !== "add" && op !== "replace") {
    notSupported(op, path, "graviton")
  }

  const parentActor = optionalId(actor, "parentActor", path)
  const parentTopology = optionalId(actor, "parentTopology", path)
  const position = optionalNumber(actor, "position", path) ?? (
    (await tx<Array<{count: number}>>`
      SELECT COUNT(*) AS count FROM actor
      WHERE parent_actor IS ${parentActor}
        AND parent_topology IS ${parentTopology}
    `)[0]?.count ?? 0
  )
  const oldValueIds = (await tx<Array<{value: number}>>`SELECT value FROM actor_value WHERE actor = ${id}`)
    .map((link) => link.value)

  await tx`DELETE FROM actor WHERE id = ${id}`
  await tx`
    INSERT INTO actor (id, parent_actor, parent_topology, wimp, position)
    VALUES (${id}, ${parentActor}, ${parentTopology}, ${requireString(actor, "wimp", path)}, ${Number(position)})
  `

  for (const item of requireArray(snapshot, "valueRecords", path)) {
    const record = requireRecord(item, path)
    const valueId = requireId(record, "id", path)
    const kind = requireString(record, "kind", path)
    await tx`
      INSERT INTO value (id, kind) VALUES (${valueId}, ${kind})
      ON CONFLICT (id) DO UPDATE SET kind = excluded.kind
    `
    await clearValueScalarTables(tx, valueId)
    await writeValueScalar(tx, valueId, kind, record, path)
  }

  const listValueIds = new Set(
    requireArray(snapshot, "valueRecords", path)
      .map((item) => requireRecord(item, path))
      .filter((record) => requireString(record, "kind", path) === "list")
      .map((record) => requireId(record, "id", path)),
  )
  for (const valueId of listValueIds) await tx`DELETE FROM value_list_item WHERE value = ${valueId}`
  for (const item of requireArray(snapshot, "valueItems", path)) {
    const valueItem = requireRecord(item, path)
    await tx`
      INSERT INTO value_list_item (value, position, item_value)
      VALUES (${requireId(valueItem, "value", path)}, ${requireNumber(valueItem, "position", path)}, ${requireString(valueItem, "itemValue", path)})
      ON CONFLICT (value, position) DO UPDATE SET item_value = excluded.item_value
    `
  }

  for (const item of requireArray(snapshot, "values", path)) {
    const link = requireRecord(item, path)
    await tx`
      INSERT INTO actor_value (actor, field, value)
      VALUES (${requireId(link, "actor", path)}, ${requireId(link, "field", path)}, ${requireId(link, "value", path)})
    `
  }

  const state = optionalObject(snapshot, "state", path)
  if (state !== null) {
    await tx`
      INSERT INTO actor_state (actor, metaState)
      VALUES (${requireId(state, "actor", path)}, ${optionalId(state, "metaState", path)})
    `
  }

  for (const valueId of oldValueIds) {
    await tx`
      DELETE FROM value WHERE id = ${valueId} AND NOT EXISTS (SELECT 1 FROM actor_value WHERE value = id)
    `
  }
}

const applyTopologySnapshot = async (
  tx: Tx,
  op: ParticleOperation,
  kind: TopologyDomainPath,
  value: unknown,
): Promise<void> => {
  const path = kind
  const topology = requireRecord(value, path)
  const id = requireId(topology, "id", path)
  if (op === "remove") {
    await tx`DELETE FROM topology WHERE id = ${id}`
    return
  }
  if (op !== "add" && op !== "replace") {
    notSupported(op, path, "graviton")
  }

  const parentActor = optionalId(topology, "parentActor", path)
  const parentTopology = optionalId(topology, "parentTopology", path)
  const position = optionalNumber(topology, "position", path) ?? (
    (await tx<Array<{count: number}>>`
      SELECT COUNT(*) AS count FROM topology
      WHERE parent_actor IS ${parentActor}
        AND parent_topology IS ${parentTopology}
    `)[0]?.count ?? 0
  )
  await tx`DELETE FROM topology WHERE id = ${id}`
  await tx`
    INSERT INTO topology (id, parent_actor, parent_topology, kind, position)
    VALUES (${id}, ${parentActor}, ${parentTopology}, ${kind}, ${Number(position)})
  `
}

const applyGravitonParticle = async (tx: Tx, particle: BoundaryParticle): Promise<boolean> => {
  if (particle.op === "test") return false
  if (particle.op === "move" || particle.op === "copy") {
    throw new Error(`Particle op "${particle.op}" is not supported by graviton`)
  }
  const value = "value" in particle ? particle.value : undefined

  if (particle.path === "wimp") {
    if (typeof value !== "object" || value === null) return false
    await applyWimpSnapshot(tx, particle.op, value)
    return true
  }

  if (particle.path === "actor") {
    await applyActorSnapshot(tx, particle.op, value)
    return true
  }

  if (particle.path === "fuzzy" || particle.path === "axion" || particle.path === "macho") {
    await applyTopologySnapshot(tx, particle.op, particle.path, value)
    return true
  }

  return false
}

// =============================================================================
// value helpers for actor snapshots
// =============================================================================

const writeValueScalar = async (tx: Tx, id: number, kind: string, v: Record<string, unknown>, path: string): Promise<void> => {
  switch (kind) {
    case "null":
    case "list":
      return
    case "boolean": {
      const b = optionalBoolean(v, "boolean", path)
      if (b === null) throw new Error(`Particle ${path}: "boolean" is required for kind=boolean`)
      await tx`INSERT INTO value_boolean (value, boolean) VALUES (${id}, ${b ? 1 : 0})`
      return
    }
    case "number":
      await tx`INSERT INTO value_number (value, number) VALUES (${id}, ${requireNumber(v, "number", path)})`
      return
    case "string":
      await tx`INSERT INTO value_string (value, text) VALUES (${id}, ${requireString(v, "text", path)})`
      return
    case "enum":
      await tx`INSERT INTO value_enum (value, variant) VALUES (${id}, ${requireId(v, "variant", path)})`
      return
    default:
      throw new Error(`Particle ${path}: unknown value kind "${kind}"`)
  }
}

const clearValueScalarTables = async (tx: Tx, id: number): Promise<void> => {
  await tx`DELETE FROM value_boolean WHERE value = ${id}`
  await tx`DELETE FROM value_number WHERE value = ${id}`
  await tx`DELETE FROM value_string WHERE value = ${id}`
  await tx`DELETE FROM value_enum WHERE value = ${id}`
}

// =============================================================================
// dispatcher
// =============================================================================

const applyOneParticle = async (tx: Tx, particle: BoundaryParticle): Promise<boolean> => {
  switch (particle.part) {
    case "graviton":
      return applyGravitonParticle(tx, particle)
    case "gluon":
    case "photon":
    case "higgs":
      return false
    case "w+":
    case "w-":
    case "z":
      return false
  }
}

const applyMessageToDatabase = async (sql: SQL, message: BoundaryUpdateMessage): Promise<boolean> => {
  if (message.parts.length === 0) return false
  let applied = false
  await sql.begin(async (tx) => {
    for (const part of message.parts) {
      applied = await applyOneParticle(tx, part) || applied
    }
  })
  return applied
}

export const open = async (filename?: string): Promise<Boundary> => {
  const fileBacked = filename !== undefined && filename !== ":memory:"

  if (fileBacked) {
    mkdirSync(dirname(filename), {recursive: true})
  }

  const sql = new SQL(fileBacked ? `sqlite://${filename}` : "sqlite::memory:")
  await sql.unsafe("PRAGMA foreign_keys = ON;")
  if (fileBacked) {
    await sql.unsafe("PRAGMA journal_mode = WAL;")
    await sql.unsafe("PRAGMA synchronous = NORMAL;")
    await sql.unsafe("PRAGMA busy_timeout = 5000;")
  }

  // ВАЖНО: topology поднимаем ДО actor — у actor есть FK parent_topology → topology(id).
  // SQLite позволяет создавать circular FK при foreign_keys=ON, но table-target должна
  // существовать к моменту первого INSERT.
  const topology = await BoundaryTopologySqlite.open(sql)
  const actor = await BoundaryActorSqlite.open(sql)
  let absorbQueue = Promise.resolve()

  return {
    observe(listener: ForceMessageListener): ForceBinding {
      return observeForceMessage(listener)
    },
    entropy(listener: ForceMessageListener): ForceBinding {
      return entropyForceMessage(listener)
    },
    wimp: await BoundaryWimpSqlite.open(sql),
    actor,
    topology,
    bulkRuntime() {
      return buildBulkRuntime(sql)
    },
    energyRuntime() {
      return buildEnergyRuntime(sql)
    },
    emit(message: BoundaryUpdateMessage) {
      emitForceMessage(message)
    },
    absorb(message: BoundaryUpdateMessage) {
      const task = absorbQueue.then(async () => {
        await applyMessageToDatabase(sql, message)
        absorbForceMessage(message)
      })
      absorbQueue = task.catch(() => {})
      return task
    },
    async close() {
      try {
        closeForceChannel()
        if (fileBacked) await sql.unsafe("PRAGMA wal_checkpoint(TRUNCATE);")
        await sql.close()
      } catch {
        // ignore double-close
      }
    },
  }
}
