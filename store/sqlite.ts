import {SQL, type ReservedSQL} from "bun"
import {mkdirSync} from "node:fs"
import {dirname} from "node:path"
import {StoreWimpSqlite} from "@store/wimp/sqlite"
import {StoreActorSqlite} from "@store/actor/sqlite"
import {StoreTopologySqlite} from "@store/topology/sqlite"

import type {Store} from "./index.ts"
import {
  closeForceChannel,
  emitForceMessage,
  emitForceParts,
  subscribeForceMessage,
  type ForceMessageListener,
  type ForceSubscription,
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

const decodeSegment = (segment: string): string => segment.replace(/~1/g, "/").replace(/~0/g, "~")

const splitPath = (path: string): string[] => {
  if (path === "") return []
  if (!path.startsWith("/")) throw new Error(`Particle path must start with "/": "${path}"`)
  return path.slice(1).split("/").map(decodeSegment)
}

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

// =============================================================================
// graviton — actor/topology structural rows
// =============================================================================

const applyActorRow = async (tx: Tx, op: ParticleOperation, segs: string[], value: unknown): Promise<void> => {
  // /actor/<uuid>
  const uuid = segs[1]!
  const path = `/actor/${uuid}`
  if (op === "remove") {
    await tx`DELETE FROM actor WHERE uuid = ${uuid}`
    return
  }
  if (op === "add") {
    const v = requireRecord(value, path)
    await tx`
      INSERT INTO actor (uuid, parent_actor, parent_topology, wimp, position)
      VALUES (${uuid},
              ${optionalString(v, "parentActor", path)},
              ${optionalString(v, "parentTopology", path)},
              ${requireString(v, "wimp", path)},
              ${requireNumber(v, "position", path)})
    `
    return
  }
  if (op === "replace") {
    const v = requireRecord(value, path)
    await tx`
      UPDATE actor
      SET parent_actor = ${optionalString(v, "parentActor", path)},
          parent_topology = ${optionalString(v, "parentTopology", path)},
          wimp = ${requireString(v, "wimp", path)},
          position = ${requireNumber(v, "position", path)}
      WHERE uuid = ${uuid}
    `
    return
  }
  notSupported(op, path, "graviton")
}

const applyTopologyRow = async (tx: Tx, op: ParticleOperation, segs: string[], value: unknown): Promise<void> => {
  // /topology/<uuid>
  const uuid = segs[1]!
  const path = `/topology/${uuid}`
  if (op === "remove") {
    await tx`DELETE FROM topology WHERE uuid = ${uuid}`
    return
  }
  if (op === "add") {
    const v = requireRecord(value, path)
    const kind = requireString(v, "kind", path)
    if (kind !== "fuzzy" && kind !== "axion" && kind !== "macho") {
      throw new Error(`Particle ${path}: unknown topology kind "${kind}"`)
    }
    await tx`
      INSERT INTO topology (uuid, parent_actor, parent_topology, kind, position)
      VALUES (${uuid},
              ${optionalString(v, "parentActor", path)},
              ${optionalString(v, "parentTopology", path)},
              ${kind},
              ${requireNumber(v, "position", path)})
    `
    return
  }
  notSupported(op, path, "graviton")
}

const applyGravitonParticle = async (tx: Tx, particle: StoreParticle): Promise<void> => {
  if (particle.op === "test") return
  if (particle.op === "move" || particle.op === "copy") {
    throw new Error(`Particle op "${particle.op}" is not supported by graviton`)
  }
  const segs = splitPath(particle.path)
  const value = "value" in particle ? particle.value : undefined

  if (segs[0] === "actor") {
    if (segs.length === 2) return applyActorRow(tx, particle.op, segs, value)
    throw new Error(`Unknown graviton path: ${particle.path}`)
  }

  if (segs[0] === "topology") {
    if (segs.length === 2) return applyTopologyRow(tx, particle.op, segs, value)
    throw new Error(`Unknown graviton path: ${particle.path}`)
  }

  throw new Error(`Unknown graviton path: ${particle.path}`)
}

// =============================================================================
// gluon — value records, value items, actor↔value links
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

const applyValueRow = async (tx: Tx, op: ParticleOperation, segs: string[], value: unknown): Promise<void> => {
  // /value/<uuid>
  const uuid = segs[1]!
  const path = `/value/${uuid}`
  if (op === "remove") {
    await tx`DELETE FROM value WHERE uuid = ${uuid}`
    return
  }
  if (op === "add") {
    const v = requireRecord(value, path)
    const kind = requireString(v, "kind", path)
    await tx`INSERT INTO value (uuid, kind) VALUES (${uuid}, ${kind})`
    await writeValueScalar(tx, uuid, kind, v, path)
    return
  }
  if (op === "replace") {
    const v = requireRecord(value, path)
    const kind = requireString(v, "kind", path)
    await tx`UPDATE value SET kind = ${kind} WHERE uuid = ${uuid}`
    await clearValueScalarTables(tx, uuid)
    await writeValueScalar(tx, uuid, kind, v, path)
    return
  }
  notSupported(op, path, "gluon")
}

const applyValueItem = async (tx: Tx, op: ParticleOperation, segs: string[], value: unknown): Promise<void> => {
  // /value/<uuid>/item/<position>
  const valueUuid = segs[1]!
  const position = Number(segs[3])
  const path = `/value/${valueUuid}/item/${position}`
  if (op === "remove") {
    await tx`DELETE FROM value_list_item WHERE value = ${valueUuid} AND position = ${position}`
    return
  }
  if (op === "add") {
    const v = requireRecord(value, path)
    await tx`
      INSERT INTO value_list_item (value, position, item_value)
      VALUES (${valueUuid}, ${position}, ${requireString(v, "text", path)})
    `
    return
  }
  if (op === "replace") {
    const v = requireRecord(value, path)
    await tx`UPDATE value_list_item SET item_value = ${requireString(v, "text", path)} WHERE value = ${valueUuid} AND position = ${position}`
    return
  }
  notSupported(op, path, "gluon")
}

const applyActorValue = async (tx: Tx, op: ParticleOperation, segs: string[], value: unknown): Promise<void> => {
  // /actor/<actorUuid>/value/<fieldUuid>
  const actorUuid = segs[1]!
  const fieldUuid = segs[3]!
  const path = `/actor/${actorUuid}/value/${fieldUuid}`
  if (op === "remove") {
    await tx`DELETE FROM actor_value WHERE actor = ${actorUuid} AND field = ${fieldUuid}`
    return
  }
  const v = requireRecord(value, path)
  const valueUuid = requireString(v, "value", path)
  if (op === "add") {
    await tx`INSERT INTO actor_value (actor, field, value) VALUES (${actorUuid}, ${fieldUuid}, ${valueUuid})`
    return
  }
  if (op === "replace") {
    await tx`UPDATE actor_value SET value = ${valueUuid} WHERE actor = ${actorUuid} AND field = ${fieldUuid}`
    return
  }
  notSupported(op, path, "gluon")
}

const applyGluonParticle = async (tx: Tx, particle: StoreParticle): Promise<void> => {
  if (particle.op === "test") return
  if (particle.op === "move" || particle.op === "copy") {
    throw new Error(`Particle op "${particle.op}" is not supported by gluon`)
  }
  const segs = splitPath(particle.path)
  const value = "value" in particle ? particle.value : undefined

  if (segs[0] === "value" && segs.length === 2) return applyValueRow(tx, particle.op, segs, value)
  if (segs[0] === "value" && segs.length === 4 && segs[2] === "item")
    return applyValueItem(tx, particle.op, segs, value)
  if (segs[0] === "actor" && segs.length === 4 && segs[2] === "value")
    return applyActorValue(tx, particle.op, segs, value)

  throw new Error(`Unknown gluon path: ${particle.path}`)
}

// =============================================================================
// photon — actor state
// =============================================================================

const applyActorState = async (tx: Tx, op: ParticleOperation, segs: string[], value: unknown): Promise<void> => {
  // /actor/<uuid>/state
  const actorUuid = segs[1]!
  const path = `/actor/${actorUuid}/state`
  if (op === "remove") {
    await tx`DELETE FROM actor_state WHERE actor = ${actorUuid}`
    return
  }
  const v = requireRecord(value, path)
  const metaState = optionalString(v, "metaState", path)
  if (op === "add") {
    await tx`INSERT INTO actor_state (actor, metaState) VALUES (${actorUuid}, ${metaState})`
    return
  }
  if (op === "replace") {
    await tx`
      INSERT INTO actor_state (actor, metaState) VALUES (${actorUuid}, ${metaState})
      ON CONFLICT (actor) DO UPDATE SET metaState = excluded.metaState
    `
    return
  }
  notSupported(op, path, "photon")
}

const applyPhotonParticle = async (tx: Tx, particle: StoreParticle): Promise<void> => {
  if (particle.op === "test") return
  if (particle.op === "move" || particle.op === "copy") {
    throw new Error(`Particle op "${particle.op}" is not supported by photon`)
  }
  const segs = splitPath(particle.path)
  const value = "value" in particle ? particle.value : undefined

  if (segs[0] === "actor" && segs.length === 3 && segs[2] === "state")
    return applyActorState(tx, particle.op, segs, value)

  throw new Error(`Unknown photon path: ${particle.path}`)
}

// =============================================================================
// dispatcher
// =============================================================================

const applyOneParticle = async (tx: Tx, particle: StoreParticle): Promise<void> => {
  switch (particle.part) {
    case "graviton":
      return applyGravitonParticle(tx, particle)
    case "gluon":
      return applyGluonParticle(tx, particle)
    case "photon":
      return applyPhotonParticle(tx, particle)
    case "higgs":
      throw new Error(`Particle part "higgs" is not implemented yet`)
    case "w":
      throw new Error(`Particle part "w" is not implemented yet`)
    case "-z":
      throw new Error(`Particle part "-z" is not implemented yet`)
    case "+z":
      throw new Error(`Particle part "+z" is not implemented yet`)
  }
}

const buildApplyMessage = (sql: SQL) => async (message: StoreUpdateMessage): Promise<void> => {
  if (message.parts.length === 0) return
  await sql.begin(async (tx) => {
    for (const part of message.parts) {
      await applyOneParticle(tx, part)
    }
  })
  emitForceParts(message.parts)
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

  return {
    subscribe(listener: ForceMessageListener): ForceSubscription {
      return subscribeForceMessage(listener)
    },
    wimp: await StoreWimpSqlite.open(sql),
    actor,
    topology,
    postMessage(message: StoreUpdateMessage) {
      emitForceMessage(message)
    },
    update: buildApplyMessage(sql),
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
