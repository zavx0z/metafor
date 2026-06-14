import {SQL, type ReservedSQL} from "bun"
import {mkdirSync} from "node:fs"
import {dirname} from "node:path"
import {StoreWimpSqlite} from "@store/wimp/sqlite"
import {StoreActorSqlite} from "@store/actor/sqlite"
import {StoreTopologySqlite} from "@store/topology/sqlite"

import type {Store} from "./index.ts"
import {
  absorbForceMessage,
  closeForceChannel,
  entropyForceMessage,
  emitForceMessage,
  observeForceMessage,
  type ForceBinding,
  type ForceMessageListener,
  type ParticleOperation,
  type Part,
  type Particle,
} from "./force.ts"

export type StorePart = Part

export type StoreParticle = Particle

export type StoreUpdateMessage = {
  parts: StoreParticle[]
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

const requireNumber = (value: unknown, key: string, path: string): number => {
  const v = optionalNumber(value, key, path)
  if (v === null) throw new Error(`Particle ${path}: "${key}" is required`)
  return v
}

const notSupported = (op: ParticleOperation, path: string, part: StorePart): never => {
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
      INSERT INTO field (uuid, wimp, key, type, required, label)
      VALUES (${requireString(field, "uuid", path)}, ${requireString(field, "wimp", path)}, ${requireString(field, "key", path)}, ${requireString(field, "type", path)}, ${optionalBoolean(field, "required", path) ? 1 : 0}, ${optionalString(field, "label", path)})
      ON CONFLICT (uuid) DO UPDATE SET
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
      INSERT INTO field_enum_variant (uuid, field, position, item_value)
      VALUES (${requireString(variant, "uuid", path)}, ${requireString(variant, "field", path)}, ${requireNumber(variant, "position", path)}, ${requireString(variant, "itemValue", path)})
      ON CONFLICT (uuid) DO UPDATE SET
        field = excluded.field,
        position = excluded.position,
        item_value = excluded.item_value
    `
  }

  for (const item of requireArray(snapshot, "states", path)) {
    const state = requireRecord(item, path)
    await tx`
      INSERT INTO state (uuid, wimp, name, position)
      VALUES (${requireString(state, "uuid", path)}, ${requireString(state, "wimp", path)}, ${requireString(state, "name", path)}, ${requireNumber(state, "position", path)})
      ON CONFLICT (uuid) DO UPDATE SET
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
  const uuid = requireString(actor, "uuid", path)

  if (op === "remove") {
    await tx`DELETE FROM actor WHERE uuid = ${uuid}`
    return
  }
  if (op !== "add" && op !== "replace") {
    notSupported(op, path, "graviton")
  }

  const parentActor = optionalString(actor, "parentActor", path)
  const parentTopology = optionalString(actor, "parentTopology", path)
  const position = optionalNumber(actor, "position", path) ?? (
    (await tx<Array<{count: number}>>`
      SELECT COUNT(*) AS count FROM actor
      WHERE parent_actor IS ${parentActor}
        AND parent_topology IS ${parentTopology}
    `)[0]?.count ?? 0
  )
  const oldValueIds = (await tx<Array<{value: string}>>`SELECT value FROM actor_value WHERE actor = ${uuid}`)
    .map((link) => link.value)

  await tx`DELETE FROM actor WHERE uuid = ${uuid}`
  await tx`
    INSERT INTO actor (uuid, parent_actor, parent_topology, wimp, position)
    VALUES (${uuid}, ${parentActor}, ${parentTopology}, ${requireString(actor, "wimp", path)}, ${Number(position)})
  `

  for (const item of requireArray(snapshot, "valueRecords", path)) {
    const record = requireRecord(item, path)
    const valueUuid = requireString(record, "uuid", path)
    const kind = requireString(record, "kind", path)
    await tx`
      INSERT INTO value (uuid, kind) VALUES (${valueUuid}, ${kind})
      ON CONFLICT (uuid) DO UPDATE SET kind = excluded.kind
    `
    await clearValueScalarTables(tx, valueUuid)
    await writeValueScalar(tx, valueUuid, kind, record, path)
  }

  const listValueIds = new Set(
    requireArray(snapshot, "valueRecords", path)
      .map((item) => requireRecord(item, path))
      .filter((record) => requireString(record, "kind", path) === "list")
      .map((record) => requireString(record, "uuid", path)),
  )
  for (const valueUuid of listValueIds) await tx`DELETE FROM value_list_item WHERE value = ${valueUuid}`
  for (const item of requireArray(snapshot, "valueItems", path)) {
    const valueItem = requireRecord(item, path)
    await tx`
      INSERT INTO value_list_item (value, position, item_value)
      VALUES (${requireString(valueItem, "value", path)}, ${requireNumber(valueItem, "position", path)}, ${requireString(valueItem, "itemValue", path)})
      ON CONFLICT (value, position) DO UPDATE SET item_value = excluded.item_value
    `
  }

  for (const item of requireArray(snapshot, "values", path)) {
    const link = requireRecord(item, path)
    await tx`
      INSERT INTO actor_value (actor, field, value)
      VALUES (${requireString(link, "actor", path)}, ${requireString(link, "field", path)}, ${requireString(link, "value", path)})
    `
  }

  const state = optionalObject(snapshot, "state", path)
  if (state !== null) {
    await tx`
      INSERT INTO actor_state (actor, metaState)
      VALUES (${requireString(state, "actor", path)}, ${optionalString(state, "metaState", path)})
    `
  }

  for (const valueId of oldValueIds) {
    await tx`
      DELETE FROM value WHERE uuid = ${valueId} AND NOT EXISTS (SELECT 1 FROM actor_value WHERE value = uuid)
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
  const uuid = requireString(topology, "uuid", path)
  if (op === "remove") {
    await tx`DELETE FROM topology WHERE uuid = ${uuid}`
    return
  }
  if (op !== "add" && op !== "replace") {
    notSupported(op, path, "graviton")
  }

  const parentActor = optionalString(topology, "parentActor", path)
  const parentTopology = optionalString(topology, "parentTopology", path)
  const position = optionalNumber(topology, "position", path) ?? (
    (await tx<Array<{count: number}>>`
      SELECT COUNT(*) AS count FROM topology
      WHERE parent_actor IS ${parentActor}
        AND parent_topology IS ${parentTopology}
    `)[0]?.count ?? 0
  )
  await tx`DELETE FROM topology WHERE uuid = ${uuid}`
  await tx`
    INSERT INTO topology (uuid, parent_actor, parent_topology, kind, position)
    VALUES (${uuid}, ${parentActor}, ${parentTopology}, ${kind}, ${Number(position)})
  `
}

const applyGravitonParticle = async (tx: Tx, particle: StoreParticle): Promise<boolean> => {
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

const writeValueScalar = async (tx: Tx, uuid: string, kind: string, v: Record<string, unknown>, path: string): Promise<void> => {
  switch (kind) {
    case "null":
    case "list":
      return
    case "boolean": {
      const b = optionalBoolean(v, "boolean", path)
      if (b === null) throw new Error(`Particle ${path}: "boolean" is required for kind=boolean`)
      await tx`INSERT INTO value_boolean (value, boolean) VALUES (${uuid}, ${b ? 1 : 0})`
      return
    }
    case "number":
      await tx`INSERT INTO value_number (value, number) VALUES (${uuid}, ${requireNumber(v, "number", path)})`
      return
    case "string":
      await tx`INSERT INTO value_string (value, text) VALUES (${uuid}, ${requireString(v, "text", path)})`
      return
    case "enum":
      await tx`INSERT INTO value_enum (value, variant) VALUES (${uuid}, ${requireString(v, "variant", path)})`
      return
    default:
      throw new Error(`Particle ${path}: unknown value kind "${kind}"`)
  }
}

const clearValueScalarTables = async (tx: Tx, uuid: string): Promise<void> => {
  await tx`DELETE FROM value_boolean WHERE value = ${uuid}`
  await tx`DELETE FROM value_number WHERE value = ${uuid}`
  await tx`DELETE FROM value_string WHERE value = ${uuid}`
  await tx`DELETE FROM value_enum WHERE value = ${uuid}`
}

// =============================================================================
// dispatcher
// =============================================================================

const applyOneParticle = async (tx: Tx, particle: StoreParticle): Promise<boolean> => {
  switch (particle.part) {
    case "graviton":
      return applyGravitonParticle(tx, particle)
    case "gluon":
    case "photon":
    case "higgs":
      return false
    case "w":
      return false
    case "-z":
      return false
    case "+z":
      return false
  }
}

const applyMessageToDatabase = async (sql: SQL, message: StoreUpdateMessage): Promise<boolean> => {
  if (message.parts.length === 0) return false
  let applied = false
  await sql.begin(async (tx) => {
    for (const part of message.parts) {
      applied = await applyOneParticle(tx, part) || applied
    }
  })
  return applied
}

export const open = async (filename?: string): Promise<Store> => {
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

  // ВАЖНО: topology поднимаем ДО actor — у actor есть FK parent_topology → topology(uuid).
  // SQLite позволяет создавать circular FK при foreign_keys=ON, но table-target должна
  // существовать к моменту первого INSERT.
  const topology = await StoreTopologySqlite.open(sql)
  const actor = await StoreActorSqlite.open(sql)
  let absorbQueue = Promise.resolve()

  return {
    observe(listener: ForceMessageListener): ForceBinding {
      return observeForceMessage(listener)
    },
    entropy(listener: ForceMessageListener): ForceBinding {
      return entropyForceMessage(listener)
    },
    wimp: await StoreWimpSqlite.open(sql),
    actor,
    topology,
    emit(message: StoreUpdateMessage) {
      emitForceMessage(message)
    },
    absorb(message: StoreUpdateMessage) {
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
