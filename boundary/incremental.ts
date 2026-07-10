import type {ReservedSQL, SQL} from "bun"
import type {ForceMessage} from "@metafor/types/force/message"
import type {Particle} from "@metafor/types/force/particle"
import {resolveForceFieldsPayload} from "@metafor/types/force/fields"

type Database = SQL | ReservedSQL
type JsonRecord = Record<string, unknown>
type RuntimeRef = {kind: "actor" | "topology"; id: number; ownerActor: number}

const declarationSections = [
  "meta", "fields", "variants", "states", "transitions", "conditions",
  "processes", "reactions", "matter", "mass", "bulk",
] as const

type DeclarationSection = typeof declarationSections[number]

export type InflatonAddress = {
  src: string
  section: DeclarationSection
  localId: string
  path: string
}

export type BoundaryIncrementalCommit = {
  rootSrc: string | null
  messages: ForceMessage[]
}

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const clone = <T>(value: T): T => structuredClone(value)

const merge = (current: unknown, delta: unknown): unknown => {
  if (!isRecord(current) || !isRecord(delta)) return clone(delta)
  const next = clone(current)
  for (const [key, value] of Object.entries(delta)) {
    if (value === null) delete next[key]
    else next[key] = isRecord(value) && isRecord(next[key]) ? merge(next[key], value) : clone(value)
  }
  return next
}

const same = (left: unknown, right: unknown): boolean => {
  if (Object.is(left, right)) return true
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length &&
      left.every((item, index) => same(item, right[index]))
  }
  if (!isRecord(left) || !isRecord(right)) return false
  const keys = Object.keys(left)
  return keys.length === Object.keys(right).length && keys.every((key) => key in right && same(left[key], right[key]))
}

const delta = (previous: unknown, next: unknown): unknown => {
  if (same(previous, next)) return {}
  if (!isRecord(previous) || !isRecord(next)) return clone(next)
  const changed: JsonRecord = {}
  for (const key of new Set([...Object.keys(previous), ...Object.keys(next)])) {
    if (!(key in next)) changed[key] = null
    else if (!(key in previous)) changed[key] = clone(next[key])
    else if (!same(previous[key], next[key])) changed[key] = delta(previous[key], next[key])
  }
  return changed
}

/** Parses a Dark entity path from the right, preserving slash-bearing WIMP src. */
export const parseInflatonAddress = (path: Particle["path"]): InflatonAddress | null => {
  if (typeof path !== "string") return null
  const sections = declarationSections.join("|")
  const match = new RegExp(`^(.+)/(${sections})(?:/([^/]+))?$`).exec(path.replace(/^\/+/, ""))
  if (!match) return null
  const section = match[2]! as DeclarationSection
  const localId = match[3] ?? "0"
  const singleton = section === "meta" || section === "mass" || section === "bulk"
  if (singleton !== (localId === "0")) return null
  return {
    src: match[1]!,
    section,
    localId,
    path: `${match[1]!}/${section}${singleton ? "" : `/${localId}`}`,
  }
}

export const gravitonDeclarationPath = ({src, section, localId}: InflatonAddress): string =>
  `declaration/${src}/${section}${localId === "0" ? "" : `/${localId}`}`

/** Stable 52-bit identity scoped by declaration table and entity path. */
export const boundaryEntityId = (path: string): number => {
  let hash = 0xcbf29ce484222325n
  for (const codeUnit of path) {
    hash ^= BigInt(codeUnit.charCodeAt(0))
    hash = BigInt.asUintN(64, hash * 0x100000001b3n)
  }
  return Number(hash & 0xfffffffffffffn) || 1
}

const numericLocal = (address: InflatonAddress): number => address.localId === "0" ? 0 : Number(address.localId)

const particleMessage = (particle: Particle): ForceMessage => ({parts: [particle]})

const actorParentKey = (parent: RuntimeRef): string => `${parent.kind}/${parent.id}`

const valueRecord = (id: number, value: unknown): JsonRecord => {
  if (value === null || value === undefined) return {id, kind: "null"}
  if (typeof value === "boolean") return {id, kind: "boolean", boolean: value}
  if (typeof value === "number") return {id, kind: "number", number: value}
  if (Array.isArray(value)) return {id, kind: "list"}
  return {id, kind: "string", text: String(value)}
}

/** Boundary-owned canonical store and local runtime dependency projection. */
export class BoundaryIncrementalStore {
  readonly declarations = new Map<string, unknown>()
  readonly childrenByParent = new Map<string, Set<string>>()
  readonly actorIdsByDeclaration = new Map<string, Set<number>>()
  readonly instanceIdsByTopology = new Map<string, Set<number>>()
  readonly originByInstance = new Map<string, string>()
  readonly parentByInstance = new Map<string, string>()

  constructor(readonly sql: SQL) {}

  async init(): Promise<void> {
    await this.sql.unsafe(`
      CREATE TABLE IF NOT EXISTS boundary_declaration_entity (
        path TEXT PRIMARY KEY,
        src TEXT NOT NULL,
        section TEXT NOT NULL,
        local_id TEXT NOT NULL,
        value_json TEXT NOT NULL,
        canonical_json TEXT NOT NULL DEFAULT '{}'
      );
      CREATE TABLE IF NOT EXISTS boundary_root (
        src TEXT PRIMARY KEY
      );
      CREATE TABLE IF NOT EXISTS boundary_runtime_origin (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        kind TEXT NOT NULL CHECK (kind IN ('actor', 'topology')),
        runtime_id INTEGER NOT NULL,
        declaration_path TEXT NOT NULL,
        parent_key TEXT NOT NULL,
        owner_actor INTEGER NOT NULL,
        ordinal INTEGER NOT NULL DEFAULT 0,
        UNIQUE (kind, runtime_id),
        UNIQUE (kind, declaration_path, parent_key, ordinal)
      );
      CREATE TABLE IF NOT EXISTS boundary_actor_field (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        actor INTEGER NOT NULL,
        field INTEGER NOT NULL,
        value_json TEXT NOT NULL,
        UNIQUE (actor, field)
      );
      CREATE INDEX IF NOT EXISTS boundary_origin_by_declaration
        ON boundary_runtime_origin (declaration_path);
      CREATE INDEX IF NOT EXISTS boundary_origin_by_owner
        ON boundary_runtime_origin (owner_actor);
    `)
    const columns = await this.sql<Array<{name: string}>>`PRAGMA table_info(boundary_declaration_entity)`
    if (!columns.some((column) => column.name === "canonical_json")) {
      await this.sql.unsafe("ALTER TABLE boundary_declaration_entity ADD COLUMN canonical_json TEXT NOT NULL DEFAULT '{}'")
    }
    for (const row of await this.sql<Array<{path: string; value_json: string}>>`
      SELECT path, value_json FROM boundary_declaration_entity ORDER BY rowid
    `) this.declarations.set(row.path, JSON.parse(row.value_json) as unknown)
    await this.loadIndexes()
  }

  async apply(message: ForceMessage): Promise<BoundaryIncrementalCommit | null> {
    const part = message.parts[0]
    if (part.part === "higgs") return await this.applyHiggs(part)
    if (part.part !== "inflaton") return null
    if (part.op === "test") return await this.rememberRoot(part)
    if (part.op !== "add" && part.op !== "replace" && part.op !== "remove") {
      throw new Error(`inflaton/${part.op} is not supported by Boundary`)
    }
    const address = parseInflatonAddress(part.path)
    if (!address) throw new Error(`Invalid inflaton path: ${String(part.path)}`)
    const previous = this.declarations.get(address.path)
    if (part.op === "replace" && previous === undefined) throw new Error(`Cannot replace missing declaration ${address.path}`)
    const next = part.op === "remove" ? undefined : part.op === "replace" ? merge(previous, part.value) : clone(part.value)
    if (next !== undefined && !isRecord(next) && address.section !== "mass" && address.section !== "bulk") {
      throw new Error(`${address.path} must be an object`)
    }
    const operation: "add" | "replace" | "remove" = part.op

    const effects = await this.sql.begin(async (tx) => {
      const committed: Particle[] = []
      const previousCanonical = await this.canonicalFromRow(tx, address.path)

      if (part.op === "remove") {
        await this.removeLocalConsequences(tx, address, previous, committed)
        await tx`DELETE FROM boundary_declaration_entity WHERE path = ${address.path}`
        await this.persistRichDeclaration(tx, address, undefined)
        committed.push({part: "graviton", op: "remove", path: gravitonDeclarationPath(address)})
        return committed
      }

      const canonical = await this.canonicalDeclaration(tx, address, next)
      await tx`
        INSERT INTO boundary_declaration_entity (path, src, section, local_id, value_json, canonical_json)
        VALUES (${address.path}, ${address.src}, ${address.section}, ${address.localId}, ${JSON.stringify(next)}, ${JSON.stringify(canonical)})
        ON CONFLICT (path) DO UPDATE SET
          value_json = excluded.value_json,
          canonical_json = excluded.canonical_json
      `
      await this.persistRichDeclaration(tx, address, next)
      committed.push({
        part: "graviton",
        op: operation,
        path: gravitonDeclarationPath(address),
        value: operation === "replace" ? delta(previousCanonical, canonical) : canonical,
      })
      await this.addOrPatchLocalConsequences(tx, address, previous, next, operation as "add" | "replace", committed)
      return committed
    })

    if (next === undefined) this.declarations.delete(address.path)
    else this.declarations.set(address.path, next)
    await this.updateIndexes(effects)
    return {rootSrc: await this.rootSrc(), messages: effects.map(particleMessage)}
  }

  async replay(): Promise<ForceMessage[]> {
    const particles: Particle[] = []
    for (const row of await this.sql<Array<{path: string; src: string; section: DeclarationSection; local_id: string; canonical_json: string}>>`
      SELECT path, src, section, local_id, canonical_json
      FROM boundary_declaration_entity ORDER BY rowid
    `) {
      particles.push({
        part: "graviton",
        op: "add",
        path: gravitonDeclarationPath({src: row.src, section: row.section, localId: row.local_id, path: row.path}),
        value: JSON.parse(row.canonical_json) as unknown,
      })
    }
    for (const origin of await this.sql<Array<{kind: "actor" | "topology"; runtime_id: number}>>`
      SELECT kind, runtime_id FROM boundary_runtime_origin ORDER BY sequence
    `) {
      if (origin.kind === "actor") {
        const entity = await this.actorEntity(this.sql, Number(origin.runtime_id))
        if (entity) particles.push({part: "graviton", op: "add", path: `actor/${origin.runtime_id}`, value: entity})
      } else {
        const entity = await this.topologyEntity(this.sql, Number(origin.runtime_id))
        if (entity) particles.push({part: "graviton", op: "add", path: `topology/${origin.runtime_id}`, value: entity})
      }
    }
    return particles.map(particleMessage)
  }

  private async rememberRoot(part: Particle): Promise<BoundaryIncrementalCommit | null> {
    if (typeof part.path !== "string" || part.path.startsWith("force/replay/")) return null
    const src = part.path
    const effects: Particle[] = await this.sql.begin(async (tx): Promise<Particle[]> => {
      await tx`INSERT INTO boundary_root (src) VALUES (${src}) ON CONFLICT DO NOTHING`
      const exists = (await tx<Array<{ok: number}>>`SELECT 1 AS ok FROM wimp WHERE src = ${src}`)[0]
      return exists ? await this.ensureRootActor(tx, src) : []
    })
    await this.updateIndexes(effects)
    return effects.length === 0 ? null : {rootSrc: src, messages: effects.map(particleMessage)}
  }

  private async canonicalFromRow(sql: Database, path: string): Promise<unknown> {
    const row = (await sql<Array<{canonical_json: string}>>`
      SELECT canonical_json FROM boundary_declaration_entity WHERE path = ${path}
    `)[0]
    return row ? JSON.parse(row.canonical_json) as unknown : undefined
  }

  private async canonicalDeclaration(sql: Database, address: InflatonAddress, value: unknown): Promise<JsonRecord> {
    const raw = isRecord(value) ? value : {value}
    const id = boundaryEntityId(address.path)
    const base = {id, wimp: address.src, localId: numericLocal(address)}
    if (address.section === "meta") return {...base, ...raw}
    if (address.section === "fields") return {...base, ...raw}
    if (address.section === "variants") {
      const field = String(raw.field ?? "")
      return {...base, ...raw, field: boundaryEntityId(`${address.src}/fields/${field}`), itemValue: raw.value}
    }
    if (address.section === "states") return {...base, ...raw}
    if (address.section === "transitions") {
      return {
        ...base,
        ...raw,
        fromState: boundaryEntityId(`${address.src}/states/${String(raw.from ?? "")}`),
        toState: boundaryEntityId(`${address.src}/states/${String(raw.to ?? "")}`),
      }
    }
    if (address.section === "conditions") {
      return {
        ...base,
        ...raw,
        transition: boundaryEntityId(`${address.src}/transitions/${String(raw.transition ?? "")}`),
        field: boundaryEntityId(`${address.src}/fields/${String(raw.field ?? "")}`),
      }
    }
    if (address.section === "processes") return await this.canonicalProcess(sql, address, raw)
    if (address.section === "reactions") {
      const fieldIds = (items: unknown): number[] => Array.isArray(items)
        ? items.map((item) => boundaryEntityId(`${address.src}/fields/${String(item)}`))
        : []
      return {
        ...base,
        ...raw,
        read: fieldIds(raw.read),
        write: fieldIds(raw.write),
        states: Array.isArray(raw.states)
          ? raw.states.map((item) => boundaryEntityId(`${address.src}/states/${String(item)}`))
          : [],
      }
    }
    if (address.section === "matter") {
      return {
        ...base,
        ...raw,
        parentParticle: raw.parent == null ? null : boundaryEntityId(`${address.src}/matter/${String(raw.parent)}`),
        particleKind: raw.kind,
        edgeSlot: raw.edgeSlot,
        particleOrder: raw.position,
      }
    }
    return {...base, ...raw}
  }

  private async canonicalProcess(sql: Database, address: InflatonAddress, raw: JsonRecord): Promise<JsonRecord> {
    const fields = async (items: unknown): Promise<Array<[number, string]>> => {
      if (!Array.isArray(items)) return []
      const result: Array<[number, string]> = []
      for (const local of items) {
        const path = `${address.src}/fields/${String(local)}`
        const field = await this.rawFromRow(sql, path)
        result.push([boundaryEntityId(path), isRecord(field) && typeof field.key === "string" ? field.key : String(local)])
      }
      return result
    }
    const handler = async (value: unknown): Promise<JsonRecord | undefined> => {
      if (!isRecord(value) || typeof value.src !== "string") return undefined
      return {src: value.src, readFields: await fields(value.read), writeFields: await fields(value.write)}
    }
    const id = boundaryEntityId(address.path)
    const env = Array.isArray(raw.env) ? raw.env.filter((item): item is string => typeof item === "string") : []
    if (raw.type === "finally") {
      const before = isRecord(raw.before) ? raw.before : {}
      return {
        id,
        wimp: address.src,
        state: String(raw.key ?? address.localId),
        descriptor: {
          type: "finally",
          key: String(raw.key ?? address.localId),
          env,
          before: {src: String(before.src ?? ""), readFields: await fields(before.read)},
        },
      }
    }
    const action = isRecord(raw.action) ? raw.action : {}
    const success = await handler(raw.success)
    const error = await handler(raw.error)
    return {
      id,
      wimp: address.src,
      state: String(raw.key ?? address.localId),
      descriptor: {
        type: "action",
        key: String(raw.key ?? address.localId),
        env,
        action: {
          src: String(action.src ?? ""),
          ...(typeof action.importSpecifier === "string" ? {importSpecifier: action.importSpecifier} : {}),
          ...(typeof action.wrapperSrc === "string" ? {wrapperSrc: action.wrapperSrc} : {}),
          readFields: await fields(action.read),
        },
        ...(success ? {success} : {}),
        ...(error ? {error} : {}),
      },
    }
  }

  private async rawFromRow(sql: Database, path: string): Promise<unknown> {
    const row = (await sql<Array<{value_json: string}>>`
      SELECT value_json FROM boundary_declaration_entity WHERE path = ${path}
    `)[0]
    return row ? JSON.parse(row.value_json) as unknown : undefined
  }

  private async persistRichDeclaration(sql: Database, address: InflatonAddress, value: unknown | undefined): Promise<void> {
    if (address.section === "meta") {
      if (value === undefined) {
        await sql`DELETE FROM wimp WHERE src = ${address.src}`
        return
      }
      const meta = isRecord(value) ? value : {}
      await sql`
        INSERT INTO wimp (src, name, desc, view_css)
        VALUES (${address.src}, ${typeof meta.name === "string" ? meta.name : null}, ${typeof meta.desc === "string" ? meta.desc : null}, NULL)
        ON CONFLICT (src) DO UPDATE SET name = excluded.name, desc = excluded.desc
      `
      return
    }
    if (address.section === "fields") {
      const id = boundaryEntityId(address.path)
      if (value === undefined) {
        await sql`DELETE FROM field WHERE id = ${id}`
        return
      }
      if (!isRecord(value) || typeof value.key !== "string" || typeof value.type !== "string") return
      await sql`
        INSERT INTO field (id, wimp, local_id, key, type, required, label)
        VALUES (${id}, ${address.src}, ${numericLocal(address)}, ${value.key}, ${value.type}, ${value.required === true ? 1 : 0}, ${typeof value.label === "string" ? value.label : null})
        ON CONFLICT (id) DO UPDATE SET key = excluded.key, type = excluded.type,
          required = excluded.required, label = excluded.label
      `
      return
    }
    if (address.section === "bulk") {
      const view = isRecord(value) && typeof value.view === "string" ? value.view : null
      await sql`UPDATE wimp SET view_css = ${view} WHERE src = ${address.src}`
    }
  }

  private async addOrPatchLocalConsequences(
    sql: Database,
    address: InflatonAddress,
    previous: unknown,
    next: unknown,
    op: "add" | "replace",
    effects: Particle[],
  ): Promise<void> {
    if (address.section === "meta") {
      const requested = (await sql<Array<{ok: number}>>`SELECT 1 AS ok FROM boundary_root WHERE src = ${address.src}`)[0]
      const anyRoot = (await sql<Array<{ok: number}>>`
        SELECT 1 AS ok FROM actor WHERE parent_actor IS NULL AND parent_topology IS NULL LIMIT 1
      `)[0]
      if (requested || !anyRoot) effects.push(...await this.ensureRootActor(sql, address.src))
      return
    }
    if (address.section === "fields") {
      if (!isRecord(next) || !Object.prototype.hasOwnProperty.call(next, "default")) return
      const fieldId = boundaryEntityId(address.path)
      for (const actor of await sql<Array<{id: number}>>`SELECT id FROM actor WHERE wimp = ${address.src}`) {
        const found = (await sql<Array<{ok: number}>>`
          SELECT 1 AS ok FROM boundary_actor_field WHERE actor = ${actor.id} AND field = ${fieldId}
        `)[0]
        if (found) continue
        await sql`
          INSERT INTO boundary_actor_field (actor, field, value_json)
          VALUES (${actor.id}, ${fieldId}, ${JSON.stringify(next.default)})
        `
        effects.push({part: "gluon", op: "add", path: Number(actor.id), value: {fields: {[String(fieldId)]: clone(next.default)}}})
      }
      return
    }
    if (address.section !== "matter") return
    if (op === "replace" && isRecord(previous) && isRecord(next)) {
      const structuralKeys = ["kind", "src", "parent", "edgeSlot"]
      if (structuralKeys.some((key) => !same(previous[key], next[key]))) {
        await this.removeMatterInstances(sql, address.path, effects)
        effects.push(...await this.materializeMatter(sql, address, next, effects))
        return
      }
      if (previous.position !== next.position) {
        for (const origin of await sql<Array<{kind: "actor" | "topology"; runtime_id: number}>>`
          SELECT kind, runtime_id FROM boundary_runtime_origin WHERE declaration_path = ${address.path}
        `) {
          const table = origin.kind === "actor" ? "actor" : "topology"
          await sql.unsafe(`UPDATE ${table} SET position = ? WHERE id = ?`, [Number(next.position ?? 0), Number(origin.runtime_id)])
          effects.push({part: "graviton", op: "replace", path: `${origin.kind}/${origin.runtime_id}`, value: {position: Number(next.position ?? 0)}})
        }
      }
      return
    }
    effects.push(...await this.materializeMatter(sql, address, next, effects))
  }

  private async removeLocalConsequences(
    sql: Database,
    address: InflatonAddress,
    previous: unknown,
    effects: Particle[],
  ): Promise<void> {
    if (address.section === "matter") {
      await this.removeMatterInstances(sql, address.path, effects)
      return
    }
    if (address.section === "fields") {
      const field = boundaryEntityId(address.path)
      for (const row of await sql<Array<{actor: number}>>`SELECT actor FROM boundary_actor_field WHERE field = ${field}`) {
        effects.push({part: "gluon", op: "remove", path: Number(row.actor), value: {fields: {[String(field)]: null}}})
      }
      await sql`DELETE FROM boundary_actor_field WHERE field = ${field}`
      return
    }
    if (address.section === "meta") {
      for (const actor of await sql<Array<{id: number}>>`SELECT id FROM actor WHERE wimp = ${address.src}`) {
        effects.push(...await this.removeRuntimeBranch(sql, "actor", Number(actor.id)))
      }
      await sql`DELETE FROM boundary_root WHERE src = ${address.src}`
      return
    }
    void previous
  }

  private async ensureRootActor(sql: Database, src: string): Promise<Particle[]> {
    const existing = (await sql<Array<{id: number}>>`
      SELECT id FROM actor WHERE wimp = ${src} AND parent_actor IS NULL AND parent_topology IS NULL LIMIT 1
    `)[0]
    if (existing) return []
    return await this.createActor(sql, src, null, `${src}/meta`, 0)
  }

  private async createActor(
    sql: Database,
    src: string,
    parent: RuntimeRef | null,
    originPath: string,
    ordinal: number,
  ): Promise<Particle[]> {
    const parentKey = parent ? actorParentKey(parent) : "root"
    const found = (await sql<Array<{runtime_id: number}>>`
      SELECT runtime_id FROM boundary_runtime_origin
      WHERE kind = ${"actor"} AND declaration_path = ${originPath} AND parent_key = ${parentKey} AND ordinal = ${ordinal}
    `)[0]
    if (found) return []
    const position = Number((await sql<Array<{count: number}>>`
      SELECT COUNT(*) AS count FROM actor
      WHERE parent_actor IS ${parent?.kind === "actor" ? parent.id : null}
        AND parent_topology IS ${parent?.kind === "topology" ? parent.id : null}
    `)[0]?.count ?? 0)
    const actor = Number((await sql<Array<{id: number}>>`
      INSERT INTO actor (parent_actor, parent_topology, wimp, position)
      VALUES (${parent?.kind === "actor" ? parent.id : null}, ${parent?.kind === "topology" ? parent.id : null}, ${src}, ${position})
      RETURNING id
    `)[0]!.id)
    await sql`
      INSERT INTO boundary_runtime_origin (kind, runtime_id, declaration_path, parent_key, owner_actor, ordinal)
      VALUES (${"actor"}, ${actor}, ${originPath}, ${parentKey}, ${actor}, ${ordinal})
    `
    for (const row of await sql<Array<{path: string; value_json: string}>>`
      SELECT path, value_json FROM boundary_declaration_entity
      WHERE src = ${src} AND section = ${"fields"} ORDER BY CAST(local_id AS INTEGER)
    `) {
      const field = JSON.parse(row.value_json) as unknown
      if (!isRecord(field) || !Object.prototype.hasOwnProperty.call(field, "default")) continue
      await sql`
        INSERT INTO boundary_actor_field (actor, field, value_json)
        VALUES (${actor}, ${boundaryEntityId(row.path)}, ${JSON.stringify(field.default)})
      `
    }
    const entity = await this.actorEntity(sql, actor)
    const effects: Particle[] = entity ? [{part: "graviton", op: "add", path: `actor/${actor}`, value: entity}] : []
    for (const row of await this.matterRows(sql, src, null)) {
      effects.push(...await this.materializeMatter(sql, row.address, row.value, effects, {kind: "actor", id: actor, ownerActor: actor}))
    }
    return effects
  }

  private async createTopology(
    sql: Database,
    kind: "fuzzy" | "axion" | "macho",
    parent: RuntimeRef,
    originPath: string,
    ordinal: number,
  ): Promise<Particle[]> {
    const parentKey = actorParentKey(parent)
    const found = (await sql<Array<{runtime_id: number}>>`
      SELECT runtime_id FROM boundary_runtime_origin
      WHERE kind = ${"topology"} AND declaration_path = ${originPath} AND parent_key = ${parentKey} AND ordinal = ${ordinal}
    `)[0]
    if (found) return []
    const position = Number((await sql<Array<{count: number}>>`
      SELECT COUNT(*) AS count FROM topology
      WHERE parent_actor IS ${parent.kind === "actor" ? parent.id : null}
        AND parent_topology IS ${parent.kind === "topology" ? parent.id : null}
    `)[0]?.count ?? 0)
    const id = Number((await sql<Array<{id: number}>>`
      INSERT INTO topology (parent_actor, parent_topology, kind, position)
      VALUES (${parent.kind === "actor" ? parent.id : null}, ${parent.kind === "topology" ? parent.id : null}, ${kind}, ${position})
      RETURNING id
    `)[0]!.id)
    await sql`
      INSERT INTO boundary_runtime_origin (kind, runtime_id, declaration_path, parent_key, owner_actor, ordinal)
      VALUES (${"topology"}, ${id}, ${originPath}, ${parentKey}, ${parent.ownerActor}, ${ordinal})
    `
    const entity = await this.topologyEntity(sql, id)
    return entity ? [{part: "graviton", op: "add", path: `topology/${id}`, value: entity}] : []
  }

  private async materializeMatter(
    sql: Database,
    address: InflatonAddress,
    value: unknown,
    effects: Particle[],
    explicitParent?: RuntimeRef,
  ): Promise<Particle[]> {
    if (!isRecord(value)) return []
    const parents = explicitParent ? [explicitParent] : await this.matterParents(sql, address, value)
    const created: Particle[] = []
    for (const parent of parents) {
      if (!await this.branchSelected(sql, parent, value)) continue
      const repeats = await this.repetitionCount(sql, parent)
      for (let ordinal = 0; ordinal < repeats; ordinal++) {
        if (value.kind === "wimp" && typeof value.src === "string") {
          created.push(...await this.createActor(sql, value.src, parent, address.path, ordinal))
          continue
        }
        if (value.kind !== "fuzzy" && value.kind !== "axion" && value.kind !== "macho") continue
        const topologyEffects = await this.createTopology(sql, value.kind, parent, address.path, ordinal)
        created.push(...topologyEffects)
        const topologyPart = topologyEffects.find((part) => typeof part.path === "string" && part.path.startsWith("topology/"))
        const topologyId = topologyPart ? Number(String(topologyPart.path).slice("topology/".length)) : null
        if (topologyId === null) continue
        for (const child of await this.matterRows(sql, address.src, address.localId)) {
          created.push(...await this.materializeMatter(sql, child.address, child.value, effects, {
            kind: "topology", id: topologyId, ownerActor: parent.ownerActor,
          }))
        }
      }
    }
    return created
  }

  private async matterParents(sql: Database, address: InflatonAddress, value: JsonRecord): Promise<RuntimeRef[]> {
    if (value.parent == null) {
      return (await sql<Array<{id: number}>>`SELECT id FROM actor WHERE wimp = ${address.src}`).map((row) => ({
        kind: "actor" as const, id: Number(row.id), ownerActor: Number(row.id),
      }))
    }
    const path = `${address.src}/matter/${String(value.parent)}`
    return (await sql<Array<{kind: "actor" | "topology"; runtime_id: number; owner_actor: number}>>`
      SELECT kind, runtime_id, owner_actor FROM boundary_runtime_origin WHERE declaration_path = ${path}
    `).map((row) => ({kind: row.kind, id: Number(row.runtime_id), ownerActor: Number(row.owner_actor)}))
  }

  private async matterRows(sql: Database, src: string, parent: string | null): Promise<Array<{address: InflatonAddress; value: JsonRecord}>> {
    const result: Array<{address: InflatonAddress; value: JsonRecord}> = []
    for (const row of await sql<Array<{path: string; local_id: string; value_json: string}>>`
      SELECT path, local_id, value_json FROM boundary_declaration_entity
      WHERE src = ${src} AND section = ${"matter"} ORDER BY CAST(local_id AS INTEGER)
    `) {
      const value = JSON.parse(row.value_json) as unknown
      if (!isRecord(value) || (value.parent == null ? null : String(value.parent)) !== parent) continue
      result.push({address: {src, section: "matter", localId: row.local_id, path: row.path}, value})
    }
    return result
  }

  private async repetitionCount(sql: Database, parent: RuntimeRef): Promise<number> {
    if (parent.kind !== "topology") return 1
    const topology = (await sql<Array<{kind: string}>>`SELECT kind FROM topology WHERE id = ${parent.id}`)[0]
    if (topology?.kind !== "macho") return 1
    const origin = (await sql<Array<{declaration_path: string; owner_actor: number}>>`
      SELECT declaration_path, owner_actor FROM boundary_runtime_origin WHERE kind = ${"topology"} AND runtime_id = ${parent.id}
    `)[0]
    if (!origin) return 0
    const raw = await this.rawFromRow(sql, origin.declaration_path)
    const binding = isRecord(raw) && isRecord(raw.collectionBinding) ? raw.collectionBinding : null
    const value = binding && typeof binding.data === "string"
      ? await this.actorFieldByKey(sql, Number(origin.owner_actor), binding.data)
      : []
    return Array.isArray(value) ? value.length : 0
  }

  private async branchSelected(sql: Database, parent: RuntimeRef, child: JsonRecord): Promise<boolean> {
    if (parent.kind !== "topology") return true
    const topology = (await sql<Array<{kind: string}>>`SELECT kind FROM topology WHERE id = ${parent.id}`)[0]
    if (!topology || topology.kind === "macho") return true
    const origin = (await sql<Array<{declaration_path: string; owner_actor: number}>>`
      SELECT declaration_path, owner_actor FROM boundary_runtime_origin WHERE kind = ${"topology"} AND runtime_id = ${parent.id}
    `)[0]
    if (!origin) return false
    const raw = await this.rawFromRow(sql, origin.declaration_path)
    if (!isRecord(raw)) return false
    const binding = isRecord(raw.predicateBinding) ? raw.predicateBinding : null
    const current = binding && typeof binding.data === "string"
      ? await this.actorFieldByKey(sql, Number(origin.owner_actor), binding.data)
      : undefined
    if (topology.kind === "axion") return Boolean(current)
    if (raw.fuzzyKind === "cond") return child.edgeSlot === (Boolean(current) ? "then" : "else")
    if (raw.fuzzyKind === "dynamic-meta") {
      const expression = binding && typeof binding.expr === "string" ? binding.expr : String(current ?? "")
      const selected = expression.replace(/\$\{_\[0\]\}/g, String(current ?? ""))
      return child.kind === "wimp" && child.src === selected
    }
    return true
  }

  private async actorFieldByKey(sql: Database, actor: number, key: string): Promise<unknown> {
    const head = (await sql<Array<{wimp: string}>>`SELECT wimp FROM actor WHERE id = ${actor}`)[0]
    if (!head) return undefined
    for (const row of await sql<Array<{path: string; value_json: string}>>`
      SELECT path, value_json FROM boundary_declaration_entity WHERE src = ${head.wimp} AND section = ${"fields"}
    `) {
      const field = JSON.parse(row.value_json) as unknown
      if (!isRecord(field) || field.key !== key) continue
      const value = (await sql<Array<{value_json: string}>>`
        SELECT value_json FROM boundary_actor_field WHERE actor = ${actor} AND field = ${boundaryEntityId(row.path)}
      `)[0]
      return value ? JSON.parse(value.value_json) as unknown : undefined
    }
    return undefined
  }

  private async removeMatterInstances(sql: Database, path: string, effects: Particle[]): Promise<void> {
    for (const origin of await sql<Array<{kind: "actor" | "topology"; runtime_id: number}>>`
      SELECT kind, runtime_id FROM boundary_runtime_origin WHERE declaration_path = ${path} ORDER BY sequence DESC
    `) {
      const table = origin.kind === "actor" ? "actor" : "topology"
      const exists = (await sql.unsafe<Array<{ok: number}>>(`SELECT 1 AS ok FROM ${table} WHERE id = ?`, [origin.runtime_id]))[0]
      if (!exists) continue
      effects.push(...await this.removeRuntimeBranch(sql, origin.kind, Number(origin.runtime_id)))
    }
  }

  private async removeRuntimeBranch(sql: Database, kind: "actor" | "topology", id: number): Promise<Particle[]> {
    const particles: Particle[] = []
    const visit = async (childKind: "actor" | "topology", childId: number): Promise<void> => {
      for (const row of await sql<Array<{id: number}>>`
        SELECT id FROM actor
        WHERE parent_actor IS ${childKind === "actor" ? childId : null}
          AND parent_topology IS ${childKind === "topology" ? childId : null}
        ORDER BY id
      `) await visit("actor", Number(row.id))
      for (const row of await sql<Array<{id: number}>>`
        SELECT id FROM topology
        WHERE parent_actor IS ${childKind === "actor" ? childId : null}
          AND parent_topology IS ${childKind === "topology" ? childId : null}
        ORDER BY id
      `) await visit("topology", Number(row.id))
      particles.push({part: "graviton", op: "remove", path: `${childKind}/${childId}`})
      await sql`DELETE FROM boundary_runtime_origin WHERE kind = ${childKind} AND runtime_id = ${childId}`
      if (childKind === "actor") await sql`DELETE FROM boundary_actor_field WHERE actor = ${childId}`
    }
    await visit(kind, id)
    if (kind === "actor") await sql`DELETE FROM actor WHERE id = ${id}`
    else await sql`DELETE FROM topology WHERE id = ${id}`
    return particles
  }

  private async applyHiggs(part: Particle): Promise<BoundaryIncrementalCommit | null> {
    if (typeof part.path !== "number") return null
    const fields = resolveForceFieldsPayload(part.value)
    if (!fields || (part.op !== "add" && part.op !== "replace" && part.op !== "remove")) return null
    const effects = await this.sql.begin(async (tx) => {
      const committed: Particle[] = []
      for (const [rawField, value] of Object.entries(fields)) {
        const field = Number(rawField)
        if (!Number.isSafeInteger(field)) continue
        if (part.op === "remove") await tx`DELETE FROM boundary_actor_field WHERE actor = ${part.path} AND field = ${field}`
        else {
          await tx`
            INSERT INTO boundary_actor_field (actor, field, value_json)
            VALUES (${part.path}, ${field}, ${JSON.stringify(value)})
            ON CONFLICT (actor, field) DO UPDATE SET value_json = excluded.value_json
          `
        }
      }
      committed.push(clone(part))
      for (const topology of await tx<Array<{runtime_id: number; declaration_path: string}>>`
        SELECT runtime_id, declaration_path FROM boundary_runtime_origin
        WHERE kind = ${"topology"} AND owner_actor = ${part.path}
      `) {
        const raw = await this.rawFromRow(tx, topology.declaration_path)
        const serialized = JSON.stringify(raw)
        const affected = Object.keys(fields).some((field) => serialized.includes(String(field))) || Object.keys(fields).length > 0
        if (!affected) continue
        for (const actor of await tx<Array<{id: number}>>`SELECT id FROM actor WHERE parent_topology = ${topology.runtime_id}`) {
          committed.push(...await this.removeRuntimeBranch(tx, "actor", Number(actor.id)))
        }
        for (const nested of await tx<Array<{id: number}>>`SELECT id FROM topology WHERE parent_topology = ${topology.runtime_id}`) {
          committed.push(...await this.removeRuntimeBranch(tx, "topology", Number(nested.id)))
        }
        committed.push({part: "higgs", op: "replace", path: `topology/${topology.runtime_id}`, value: {fields: clone(fields)}})
        const address = parseInflatonAddress(topology.declaration_path)
        if (!address) continue
        for (const child of await this.matterRows(tx, address.src, address.localId)) {
          committed.push(...await this.materializeMatter(tx, child.address, child.value, committed, {
            kind: "topology", id: Number(topology.runtime_id), ownerActor: Number(part.path),
          }))
        }
      }
      return committed
    })
    await this.updateIndexes(effects)
    return {rootSrc: await this.rootSrc(), messages: effects.map(particleMessage)}
  }

  private async actorEntity(sql: Database, id: number): Promise<JsonRecord | null> {
    const actor = (await sql<Array<{id: number; parent_actor: number | null; parent_topology: number | null; wimp: string; position: number}>>`
      SELECT id, parent_actor, parent_topology, wimp, position FROM actor WHERE id = ${id}
    `)[0]
    if (!actor) return null
    const values: Array<{actor: number; field: number; value: number}> = []
    const records: JsonRecord[] = []
    const items: Array<{value: number; position: number; itemValue: string}> = []
    for (const row of await sql<Array<{id: number; field: number; value_json: string}>>`
      SELECT id, field, value_json FROM boundary_actor_field WHERE actor = ${id} ORDER BY field
    `) {
      const value = JSON.parse(row.value_json) as unknown
      values.push({actor: id, field: Number(row.field), value: Number(row.id)})
      records.push(valueRecord(Number(row.id), value))
      if (Array.isArray(value)) value.forEach((item, position) => items.push({value: Number(row.id), position, itemValue: String(item)}))
    }
    return {
      actor: {
        id,
        parentActor: actor.parent_actor === null ? null : Number(actor.parent_actor),
        parentTopology: actor.parent_topology === null ? null : Number(actor.parent_topology),
        wimp: actor.wimp,
        position: Number(actor.position),
      },
      values,
      valueRecords: records,
      valueItems: items,
      state: null,
    }
  }

  private async topologyEntity(sql: Database, id: number): Promise<JsonRecord | null> {
    const row = (await sql<Array<{id: number; parent_actor: number | null; parent_topology: number | null; kind: string; position: number}>>`
      SELECT id, parent_actor, parent_topology, kind, position FROM topology WHERE id = ${id}
    `)[0]
    return row ? {
      id,
      parentActor: row.parent_actor === null ? null : Number(row.parent_actor),
      parentTopology: row.parent_topology === null ? null : Number(row.parent_topology),
      kind: row.kind,
      position: Number(row.position),
    } : null
  }

  private async rootSrc(): Promise<string | null> {
    return (await this.sql<Array<{wimp: string}>>`
      SELECT wimp FROM actor WHERE parent_actor IS NULL AND parent_topology IS NULL ORDER BY id LIMIT 1
    `)[0]?.wimp ?? null
  }

  private async loadIndexes(): Promise<void> {
    for (const row of await this.sql<Array<{kind: "actor" | "topology"; runtime_id: number; declaration_path: string; parent_key: string}>>`
      SELECT kind, runtime_id, declaration_path, parent_key FROM boundary_runtime_origin ORDER BY sequence
    `) this.indexInstance(row.kind, Number(row.runtime_id), row.declaration_path, row.parent_key)
  }

  private async updateIndexes(effects: Particle[]): Promise<void> {
    for (const effect of effects) {
      if (effect.part !== "graviton" || typeof effect.path !== "string") continue
      const match = /^(actor|topology)\/(\d+)$/.exec(effect.path)
      if (!match) continue
      const kind = match[1]! as "actor" | "topology"
      const id = Number(match[2])
      if (effect.op === "remove") {
        this.unindexInstance(kind, id)
        continue
      }
      if (effect.op !== "add" && effect.op !== "replace") continue
      const origin = (await this.sql<Array<{declaration_path: string; parent_key: string}>>`
        SELECT declaration_path, parent_key FROM boundary_runtime_origin WHERE kind = ${kind} AND runtime_id = ${id}
      `)[0]
      if (origin) this.indexInstance(kind, id, origin.declaration_path, origin.parent_key)
    }
  }

  private indexInstance(kind: "actor" | "topology", id: number, origin: string, parent: string): void {
    this.unindexInstance(kind, id)
    const key = `${kind}/${id}`
    this.originByInstance.set(key, origin)
    this.parentByInstance.set(key, parent)
    if (parent !== "root") {
      const children = this.childrenByParent.get(parent)
      if (children) children.add(key)
      else this.childrenByParent.set(parent, new Set([key]))
    }
    if (kind === "actor") {
      const ids = this.actorIdsByDeclaration.get(origin)
      if (ids) ids.add(id)
      else this.actorIdsByDeclaration.set(origin, new Set([id]))
    } else {
      const ids = this.instanceIdsByTopology.get(origin)
      if (ids) ids.add(id)
      else this.instanceIdsByTopology.set(origin, new Set([id]))
    }
  }

  private unindexInstance(kind: "actor" | "topology", id: number): void {
    const key = `${kind}/${id}`
    const origin = this.originByInstance.get(key)
    const parent = this.parentByInstance.get(key)
    if (parent) {
      this.childrenByParent.get(parent)?.delete(key)
      if (this.childrenByParent.get(parent)?.size === 0) this.childrenByParent.delete(parent)
    }
    if (origin && kind === "actor") this.actorIdsByDeclaration.get(origin)?.delete(id)
    if (origin && kind === "topology") this.instanceIdsByTopology.get(origin)?.delete(id)
    this.originByInstance.delete(key)
    this.parentByInstance.delete(key)
  }
}
