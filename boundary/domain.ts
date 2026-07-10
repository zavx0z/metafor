import type {ReservedSQL, SQL} from "bun"
import type {ForceMessage} from "@metafor/types/force/message"
import type {Particle} from "@metafor/types/force/particle"
import {applyForceDelta, createForceDelta, forceValueEqual} from "@metafor/types/force/delta"
import {resolveForceFieldsPayload} from "@metafor/types/force/fields"

export const declarationSections = [
  "meta", "fields", "variants", "states", "transitions", "conditions",
  "processes", "reactions", "matter", "mass", "bulk",
] as const

export type DeclarationSection = typeof declarationSections[number]
type Database = SQL | ReservedSQL
type JsonRecord = Record<string, unknown>

type RuntimeContext = {
  values: Record<string, unknown>
  state: string | null
  item?: unknown
  itemIndex?: number
}

type RuntimeRef = {
  kind: "actor" | "topology"
  id: number
  ownerActor: number
  context: RuntimeContext
}

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
const particleMessage = (particle: Particle): ForceMessage => ({parts: [particle]})
const parentKey = (ref: Pick<RuntimeRef, "kind" | "id">): string => `${ref.kind}/${ref.id}`

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

/** Stable positive 52-bit Boundary identity scoped by the complete declaration path. */
export const boundaryEntityId = (path: string): number => {
  let hash = 0xcbf29ce484222325n
  for (const codeUnit of path) {
    hash ^= BigInt(codeUnit.charCodeAt(0))
    hash = BigInt.asUintN(64, hash * 0x100000001b3n)
  }
  return Number(hash & 0xfffffffffffffn) || 1
}

const numericLocal = (address: InflatonAddress): number => {
  const value = Number(address.localId)
  if (!Number.isSafeInteger(value) || value <= 0) return boundaryEntityId(address.path)
  return value
}

const bindingPaths = (binding: unknown): string[] => {
  if (!isRecord(binding) || binding.data === undefined) return []
  return (Array.isArray(binding.data) ? binding.data : [binding.data])
    .filter((path): path is string => typeof path === "string")
}

const contextPathValue = (path: string, context: RuntimeContext): unknown => {
  if (path === "state") return context.state
  if (path === "item") return context.item
  if (path === "index") return context.itemIndex
  if (path.startsWith("/") || path.startsWith("[") || path.startsWith(".")) return undefined
  return context.values[path]
}

const evaluateBinding = (binding: unknown, context: RuntimeContext): unknown => {
  if (binding === undefined || typeof binding === "boolean") return binding
  if (typeof binding === "string") {
    return new Function("item", "index", "_", `return (${binding})`)(context.item, context.itemIndex, [])
  }
  if (!isRecord(binding)) return binding
  const values = bindingPaths(binding).map((path) => clone(contextPathValue(path, context)))
  if (typeof binding.expr !== "string") return values[0]
  return new Function("item", "index", "_", `return (${binding.expr})`)(context.item, context.itemIndex, values)
}

const evaluateDynamicSrc = (binding: unknown, context: RuntimeContext): unknown => {
  if (!isRecord(binding) || typeof binding.expr !== "string") return evaluateBinding(binding, context)
  const values = bindingPaths(binding).map((path) => clone(contextPathValue(path, context)))
  const template = binding.expr.replaceAll("\\", "\\\\").replaceAll("`", "\\`")
  return new Function("_", `return \`${template}\``)(values)
}

const fieldValues = (value: unknown, label: string): JsonRecord => {
  if (value === undefined) return {}
  if (!isRecord(value)) throw new Error(`${label} must resolve to an object`)
  return value
}

const valueRecord = (id: number, value: unknown): JsonRecord => {
  if (value === null || value === undefined) return {id, kind: "null"}
  if (typeof value === "boolean") return {id, kind: "boolean", boolean: value}
  if (typeof value === "number") return {id, kind: "number", number: value}
  if (Array.isArray(value)) return {id, kind: "list"}
  return {id, kind: "string", text: String(value)}
}

const itemIdentity = (value: unknown, occurrence: number): string => {
  const json = JSON.stringify(value)
  return `${boundaryEntityId(json === undefined ? String(value) : json)}:${occurrence}`
}

export class BoundaryIncrementalStore {
  readonly declarations = new Map<string, unknown>()
  readonly childrenByParent = new Map<string, Set<string>>()
  readonly actorIdsByDeclaration = new Map<string, Set<number>>()
  readonly instanceIdsByTopology = new Map<string, Set<number>>()
  readonly originByInstance = new Map<string, string>()
  readonly parentByInstance = new Map<string, string>()
  readonly replaySeen = new Map<string, Set<string>>()
  readonly replayRoots = new Map<string, Set<string>>()

  constructor(readonly sql: SQL) {}

  async init(): Promise<void> {
    await this.sql.unsafe(`
      CREATE TABLE IF NOT EXISTS boundary_declaration_entity (
        path TEXT PRIMARY KEY,
        src TEXT NOT NULL,
        section TEXT NOT NULL,
        local_id TEXT NOT NULL,
        value_json TEXT NOT NULL,
        canonical_json TEXT NOT NULL
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
        item_key TEXT NOT NULL DEFAULT '0',
        context_json TEXT NOT NULL DEFAULT '{}',
        UNIQUE (kind, runtime_id),
        UNIQUE (kind, declaration_path, parent_key, item_key)
      );
      CREATE TABLE IF NOT EXISTS boundary_actor_field (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        actor INTEGER NOT NULL,
        field INTEGER NOT NULL,
        value_json TEXT NOT NULL,
        UNIQUE (actor, field)
      );
      CREATE TABLE IF NOT EXISTS boundary_actor_state (
        actor INTEGER PRIMARY KEY,
        state TEXT
      );
      CREATE TABLE IF NOT EXISTS boundary_topology_dependency (
        topology INTEGER NOT NULL,
        field INTEGER,
        uses_state INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (topology, field, uses_state)
      );
      CREATE INDEX IF NOT EXISTS boundary_origin_by_declaration
        ON boundary_runtime_origin (declaration_path);
      CREATE INDEX IF NOT EXISTS boundary_origin_by_parent
        ON boundary_runtime_origin (parent_key);
      CREATE INDEX IF NOT EXISTS boundary_origin_by_owner
        ON boundary_runtime_origin (owner_actor);
      CREATE INDEX IF NOT EXISTS boundary_dependency_by_field
        ON boundary_topology_dependency (field, topology);
    `)
    await this.ensureColumn("boundary_runtime_origin", "item_key", "TEXT NOT NULL DEFAULT '0'")
    await this.ensureColumn("boundary_runtime_origin", "context_json", "TEXT NOT NULL DEFAULT '{}'")
    await this.migrateLegacy()
    for (const row of await this.sql<Array<{path: string; value_json: string}>>`
      SELECT path, value_json FROM boundary_declaration_entity ORDER BY rowid
    `) this.declarations.set(row.path, JSON.parse(row.value_json) as unknown)
    await this.loadIndexes()
  }

  beginReplay(requestPath: string): void {
    this.replaySeen.set(requestPath, new Set())
    this.replayRoots.set(requestPath, new Set())
  }

  async completeReplay(requestPath: string): Promise<BoundaryIncrementalCommit | null> {
    const seen = this.replaySeen.get(requestPath)
    const roots = this.replayRoots.get(requestPath)
    if (!seen || !roots) return null
    const messages: ForceMessage[] = []
    const stale = (await this.sql<Array<{path: string}>>`
      SELECT path FROM boundary_declaration_entity ORDER BY rowid DESC
    `).map((row) => row.path).filter((path) => !seen.has(path))
    for (const path of stale) {
      const commit = await this.apply({parts: [{part: "inflaton", op: "remove", path}]})
      if (commit) messages.push(...commit.messages)
    }
    await this.sql.begin(async (tx) => {
      await tx`DELETE FROM boundary_root`
      for (const src of roots) await tx`INSERT INTO boundary_root (src) VALUES (${src})`
    })
    for (const src of roots) {
      const effects = await this.sql.begin(async (tx) => await this.ensureRootActor(tx, src))
      await this.updateIndexes(effects)
      messages.push(...effects.map(particleMessage))
    }
    this.replaySeen.delete(requestPath)
    this.replayRoots.delete(requestPath)
    return messages.length === 0 ? null : {rootSrc: await this.rootSrc(), messages}
  }

  async apply(message: ForceMessage): Promise<BoundaryIncrementalCommit | null> {
    const part = message.parts[0]
    if (part.part === "gluon" || part.part === "higgs") return await this.applyFieldParticle(part)
    if (part.part === "photon") return await this.applyPhoton(part)
    if (part.part !== "inflaton") return null
    if (part.op === "test") return await this.rememberRoot(part)
    if (part.op !== "add" && part.op !== "replace" && part.op !== "remove") {
      throw new Error(`inflaton/${part.op} is not supported by Boundary`)
    }
    const address = parseInflatonAddress(part.path)
    if (!address) throw new Error(`Invalid inflaton path: ${String(part.path)}`)
    const previous = this.declarations.get(address.path)
    if (part.op === "replace" && previous === undefined) throw new Error(`Cannot replace missing declaration ${address.path}`)
    let next: unknown | undefined
    if (part.op === "remove") next = undefined
    else if (part.op === "add") next = clone(part.value)
    else if (isRecord(previous) && isRecord(part.value)) {
      next = clone(previous)
      applyForceDelta(next as JsonRecord, part.value)
    } else next = clone(part.value)
    if (next !== undefined && !isRecord(next) && address.section !== "mass" && address.section !== "bulk") {
      throw new Error(`${address.path} must be an object`)
    }

    const effects = await this.sql.begin(async (tx) => {
      const committed: Particle[] = []
      const previousCanonical = await this.canonicalFromRow(tx, address.path)
      if (next === undefined) {
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
          src = excluded.src,
          section = excluded.section,
          local_id = excluded.local_id,
          value_json = excluded.value_json,
          canonical_json = excluded.canonical_json
      `
      await this.persistRichDeclaration(tx, address, next)
      committed.push({
        part: "graviton",
        op: part.op,
        path: gravitonDeclarationPath(address),
        value: part.op === "replace" ? createForceDelta(previousCanonical, canonical) : canonical,
      })
      await this.addOrPatchLocalConsequences(tx, address, previous, next, part.op, committed)
      return committed
    })

    if (next === undefined) this.declarations.delete(address.path)
    else this.declarations.set(address.path, next)
    if (typeof part.from === "string") this.replaySeen.get(part.from)?.add(address.path)
    await this.updateIndexes(effects)
    return {rootSrc: await this.rootSrc(), messages: effects.map(particleMessage)}
  }

  async replay(requestPath?: string): Promise<ForceMessage[]> {
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
        ...(requestPath ? {from: requestPath} : {}),
      })
    }
    for (const origin of await this.sql<Array<{kind: "actor" | "topology"; runtime_id: number}>>`
      SELECT kind, runtime_id FROM boundary_runtime_origin ORDER BY sequence
    `) {
      const value = origin.kind === "actor"
        ? await this.actorEntity(this.sql, Number(origin.runtime_id))
        : await this.topologyEntity(this.sql, Number(origin.runtime_id))
      if (value) particles.push({
        part: "graviton",
        op: "add",
        path: `${origin.kind}/${origin.runtime_id}`,
        value,
        ...(requestPath ? {from: requestPath} : {}),
      })
    }
    return particles.map(particleMessage)
  }

  private async rememberRoot(part: Particle): Promise<BoundaryIncrementalCommit | null> {
    if (typeof part.path !== "string" || part.path.startsWith("force/replay/")) return null
    if (typeof part.from === "string") this.replayRoots.get(part.from)?.add(part.path)
    const effects = await this.sql.begin(async (tx) => {
      await tx`INSERT INTO boundary_root (src) VALUES (${part.path}) ON CONFLICT DO NOTHING`
      const exists = (await tx<Array<{ok: number}>>`SELECT 1 AS ok FROM wimp WHERE src = ${part.path}`)[0]
      return exists ? await this.ensureRootActor(tx, part.path) : []
    })
    await this.updateIndexes(effects)
    return effects.length === 0 ? null : {rootSrc: part.path, messages: effects.map(particleMessage)}
  }

  private async canonicalFromRow(sql: Database, path: string): Promise<unknown> {
    const row = (await sql<Array<{canonical_json: string}>>`
      SELECT canonical_json FROM boundary_declaration_entity WHERE path = ${path}
    `)[0]
    return row ? JSON.parse(row.canonical_json) as unknown : undefined
  }

  private async rawFromRow(sql: Database, path: string): Promise<unknown> {
    const row = (await sql<Array<{value_json: string}>>`
      SELECT value_json FROM boundary_declaration_entity WHERE path = ${path}
    `)[0]
    return row ? JSON.parse(row.value_json) as unknown : undefined
  }

  private async canonicalDeclaration(sql: Database, address: InflatonAddress, value: unknown): Promise<JsonRecord> {
    const raw = isRecord(value) ? value : {value}
    const id = boundaryEntityId(address.path)
    const base = {id, wimp: address.src, localId: numericLocal(address)}
    if (address.section === "meta" || address.section === "fields" || address.section === "states") return {...base, ...raw}
    if (address.section === "variants") {
      const field = String(raw.field ?? "")
      return {...base, ...raw, field: boundaryEntityId(`${address.src}/fields/${field}`), itemValue: raw.value}
    }
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
      const ids = (section: "fields" | "states", items: unknown): number[] => Array.isArray(items)
        ? items.map((item) => boundaryEntityId(`${address.src}/${section}/${String(item)}`))
        : []
      return {...base, ...raw, read: ids("fields", raw.read), write: ids("fields", raw.write), states: ids("states", raw.states)}
    }
    if (address.section === "matter") {
      const topologyBindingPaths = [raw.predicateBinding, raw.collectionBinding]
        .flatMap((binding) => bindingPaths(binding))
        .map((path, depOrder) => ({particle: id, wimp: address.src, depOrder, path}))
      const childWimpBindingPaths = bindingPaths(raw.fieldsBinding)
        .map((path, depOrder) => ({particle: id, wimp: address.src, childOrder: 0, depOrder, path}))
      return {
        ...base,
        ...raw,
        parentParticle: raw.parent == null ? null : boundaryEntityId(`${address.src}/matter/${String(raw.parent)}`),
        particleKind: raw.kind,
        edgeSlot: raw.edgeSlot,
        particleOrder: raw.position,
        topologyBindingPaths,
        childWimpBindingPaths,
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
      if (!["string", "number", "boolean", "enum", "array"].includes(value.type)) {
        throw new Error(`${address.path}.type is not supported`)
      }
      await sql`
        INSERT INTO field (id, wimp, local_id, key, type, required, label)
        VALUES (${id}, ${address.src}, ${numericLocal(address)}, ${value.key}, ${value.type}, ${value.required === true ? 1 : 0}, ${typeof value.label === "string" ? value.label : null})
        ON CONFLICT (id) DO UPDATE SET key = excluded.key, type = excluded.type,
          required = excluded.required, label = excluded.label, local_id = excluded.local_id
      `
      return
    }
    if (address.section === "variants") {
      const id = boundaryEntityId(address.path)
      if (value === undefined) {
        await sql`DELETE FROM field_enum_variant WHERE id = ${id}`
        return
      }
      if (!isRecord(value)) return
      const field = boundaryEntityId(`${address.src}/fields/${String(value.field ?? "")}`)
      await sql`
        INSERT INTO field_enum_variant (id, field, position, item_value)
        VALUES (${id}, ${field}, ${Number(value.position ?? 0)}, ${String(value.value ?? "")})
        ON CONFLICT (id) DO UPDATE SET field = excluded.field, position = excluded.position, item_value = excluded.item_value
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
      if (requested) effects.push(...await this.ensureRootActor(sql, address.src))
      return
    }
    if (address.section === "fields") {
      await this.addFieldToActors(sql, address, next, effects)
      await this.reindexOwnerTopologies(sql, address.src)
      return
    }
    if (address.section === "states") {
      await this.initializeActorStates(sql, address.src, effects)
      return
    }
    if (address.section !== "matter") return
    if (op === "replace" && isRecord(previous) && isRecord(next)) {
      const structuralKeys = ["kind", "src", "parent", "edgeSlot"]
      if (structuralKeys.some((key) => !forceValueEqual(previous[key], next[key]))) {
        await this.removeMatterInstances(sql, address.path, effects)
        effects.push(...await this.materializeMatter(sql, address, next, undefined, new Set()))
        return
      }
      if (!forceValueEqual(previous.position, next.position)) await this.updateMatterPosition(sql, address.path, Number(next.position ?? 0), effects)
      for (const origin of await sql<Array<{kind: "actor" | "topology"; runtime_id: number}>>`
        SELECT kind, runtime_id FROM boundary_runtime_origin WHERE declaration_path = ${address.path}
      `) {
        if (origin.kind === "actor") await this.refreshBoundActor(sql, Number(origin.runtime_id), address, next, effects)
        else await this.refreshTopology(sql, Number(origin.runtime_id), effects, new Set())
      }
      return
    }
    effects.push(...await this.materializeMatter(sql, address, next, undefined, new Set()))
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
      await sql`DELETE FROM boundary_topology_dependency WHERE field = ${field}`
      return
    }
    if (address.section === "states" && isRecord(previous) && typeof previous.name === "string") {
      for (const actor of await sql<Array<{id: number}>>`SELECT id FROM actor WHERE wimp = ${address.src}`) {
        const state = (await sql<Array<{state: string | null}>>`SELECT state FROM boundary_actor_state WHERE actor = ${actor.id}`)[0]?.state
        if (state !== previous.name) continue
        const next = await this.initialState(sql, address.src, address.path)
        await sql`
          INSERT INTO boundary_actor_state (actor, state) VALUES (${actor.id}, ${next})
          ON CONFLICT (actor) DO UPDATE SET state = excluded.state
        `
        effects.push({part: "photon", op: "replace", path: Number(actor.id), value: next})
      }
      return
    }
    if (address.section === "meta") {
      for (const actor of await sql<Array<{id: number}>>`SELECT id FROM actor WHERE wimp = ${address.src}`) {
        effects.push(...await this.removeRuntimeBranch(sql, "actor", Number(actor.id)))
      }
      await sql`DELETE FROM boundary_root WHERE src = ${address.src}`
    }
  }

  private async ensureRootActor(sql: Database, src: string): Promise<Particle[]> {
    const found = (await sql<Array<{runtime_id: number}>>`
      SELECT runtime_id FROM boundary_runtime_origin
      WHERE kind = ${"actor"} AND declaration_path = ${`${src}/meta`} AND parent_key = ${"root"} LIMIT 1
    `)[0]
    if (found) return []
    return await this.createActor(sql, src, null, `${src}/meta`, "root", 0, {}, new Set())
  }

  private async createActor(
    sql: Database,
    src: string,
    parent: RuntimeRef | null,
    originPath: string,
    itemKey: string,
    position: number,
    boundValues: JsonRecord,
    lineage: Set<string>,
  ): Promise<Particle[]> {
    if (lineage.has(src)) return []
    const parentAddress = parent ? parentKey(parent) : "root"
    let actor = (await sql<Array<{runtime_id: number}>>`
      SELECT runtime_id FROM boundary_runtime_origin
      WHERE kind = ${"actor"} AND declaration_path = ${originPath}
        AND parent_key = ${parentAddress} AND item_key = ${itemKey}
    `)[0]?.runtime_id
    if (actor === undefined) {
      const adopted = (await sql<Array<{id: number}>>`
        SELECT actor.id FROM actor
        LEFT JOIN boundary_runtime_origin AS origin ON origin.kind = ${"actor"} AND origin.runtime_id = actor.id
        WHERE origin.runtime_id IS NULL AND actor.wimp = ${src}
          AND actor.parent_actor IS ${parent?.kind === "actor" ? parent.id : null}
          AND actor.parent_topology IS ${parent?.kind === "topology" ? parent.id : null}
        ORDER BY actor.position LIMIT 1
      `)[0]
      if (adopted) actor = Number(adopted.id)
    }
    const context: RuntimeContext = {
      values: {},
      state: null,
      ...(parent?.context && Object.hasOwn(parent.context, "item") ? {item: parent.context.item, itemIndex: parent.context.itemIndex} : {}),
    }
    let created = false
    if (actor === undefined) {
      actor = Number((await sql<Array<{id: number}>>`
        INSERT INTO actor (parent_actor, parent_topology, wimp, position)
        VALUES (${parent?.kind === "actor" ? parent.id : null}, ${parent?.kind === "topology" ? parent.id : null}, ${src}, ${position})
        RETURNING id
      `)[0]!.id)
      created = true
    } else {
      await sql`UPDATE actor SET position = ${position}, wimp = ${src} WHERE id = ${actor}`
    }
    await sql`
      INSERT INTO boundary_runtime_origin (kind, runtime_id, declaration_path, parent_key, owner_actor, ordinal, item_key, context_json)
      VALUES (${"actor"}, ${actor}, ${originPath}, ${parentAddress}, ${actor}, ${position}, ${itemKey}, ${JSON.stringify(context)})
      ON CONFLICT (kind, runtime_id) DO UPDATE SET declaration_path = excluded.declaration_path,
        parent_key = excluded.parent_key, owner_actor = excluded.owner_actor, ordinal = excluded.ordinal,
        item_key = excluded.item_key, context_json = excluded.context_json
    `
    const effects: Particle[] = []
    await this.populateActorFields(sql, actor, src, boundValues, effects)
    const state = await this.initialState(sql, src)
    context.values = await this.actorValuesByKey(sql, actor)
    context.state = (await sql<Array<{state: string | null}>>`SELECT state FROM boundary_actor_state WHERE actor = ${actor}`)[0]?.state ?? state
    await sql`
      INSERT INTO boundary_actor_state (actor, state) VALUES (${actor}, ${context.state})
      ON CONFLICT (actor) DO UPDATE SET state = COALESCE(boundary_actor_state.state, excluded.state)
    `
    await sql`UPDATE boundary_runtime_origin SET context_json = ${JSON.stringify(context)} WHERE kind = ${"actor"} AND runtime_id = ${actor}`
    const entity = await this.actorEntity(sql, actor)
    if (created && entity) effects.unshift({part: "graviton", op: "add", path: `actor/${actor}`, value: entity})
    else if (entity) effects.unshift({part: "graviton", op: "replace", path: `actor/${actor}`, value: {actor: entity.actor, state: entity.state}})
    const nextLineage = new Set(lineage)
    nextLineage.add(src)
    const ref: RuntimeRef = {kind: "actor", id: actor, ownerActor: actor, context}
    for (const row of await this.matterRows(sql, src, null)) effects.push(...await this.materializeMatter(sql, row.address, row.value, ref, nextLineage))
    return effects
  }

  private async createTopology(
    sql: Database,
    kind: "fuzzy" | "axion" | "macho",
    parent: RuntimeRef,
    originPath: string,
    itemKey: string,
    position: number,
    context: RuntimeContext,
  ): Promise<{id: number; created: boolean}> {
    const parentAddress = parentKey(parent)
    let id = (await sql<Array<{runtime_id: number}>>`
      SELECT runtime_id FROM boundary_runtime_origin
      WHERE kind = ${"topology"} AND declaration_path = ${originPath}
        AND parent_key = ${parentAddress} AND item_key = ${itemKey}
    `)[0]?.runtime_id
    let created = false
    if (id === undefined) {
      const adopted = (await sql<Array<{id: number}>>`
        SELECT topology.id FROM topology
        LEFT JOIN boundary_runtime_origin AS origin ON origin.kind = ${"topology"} AND origin.runtime_id = topology.id
        WHERE origin.runtime_id IS NULL AND topology.kind = ${kind}
          AND topology.parent_actor IS ${parent.kind === "actor" ? parent.id : null}
          AND topology.parent_topology IS ${parent.kind === "topology" ? parent.id : null}
        ORDER BY topology.position LIMIT 1
      `)[0]
      if (adopted) id = Number(adopted.id)
    }
    if (id === undefined) {
      id = Number((await sql<Array<{id: number}>>`
        INSERT INTO topology (parent_actor, parent_topology, kind, position)
        VALUES (${parent.kind === "actor" ? parent.id : null}, ${parent.kind === "topology" ? parent.id : null}, ${kind}, ${position})
        RETURNING id
      `)[0]!.id)
      created = true
    } else await sql`UPDATE topology SET position = ${position}, kind = ${kind} WHERE id = ${id}`
    await sql`
      INSERT INTO boundary_runtime_origin (kind, runtime_id, declaration_path, parent_key, owner_actor, ordinal, item_key, context_json)
      VALUES (${"topology"}, ${id}, ${originPath}, ${parentAddress}, ${parent.ownerActor}, ${position}, ${itemKey}, ${JSON.stringify(context)})
      ON CONFLICT (kind, runtime_id) DO UPDATE SET declaration_path = excluded.declaration_path,
        parent_key = excluded.parent_key, owner_actor = excluded.owner_actor, ordinal = excluded.ordinal,
        item_key = excluded.item_key, context_json = excluded.context_json
    `
    await this.indexTopologyDependencies(sql, id, parent.ownerActor, await this.rawFromRow(sql, originPath))
    return {id, created}
  }

  private async materializeMatter(
    sql: Database,
    address: InflatonAddress,
    value: unknown,
    explicitParent?: RuntimeRef,
    lineage = new Set<string>(),
    itemKey = "0",
    positionOverride?: number,
  ): Promise<Particle[]> {
    if (!isRecord(value)) return []
    const parents = explicitParent ? [explicitParent] : await this.matterParents(sql, address, value)
    const effects: Particle[] = []
    for (const parent of parents) {
      const position = positionOverride ?? Number(value.position ?? 0)
      if (value.kind === "wimp" && typeof value.src === "string") {
        const resolved = value.fieldsBinding === undefined
          ? {}
          : fieldValues(evaluateBinding(value.fieldsBinding, parent.context), `${value.src} fields binding`)
        effects.push(...await this.createActor(sql, value.src, parent, address.path, itemKey, position, resolved, lineage))
        continue
      }
      if (value.kind !== "fuzzy" && value.kind !== "axion" && value.kind !== "macho") continue
      const topology = await this.createTopology(sql, value.kind, parent, address.path, itemKey, position, parent.context)
      const entity = await this.topologyEntity(sql, topology.id)
      if (entity) effects.push({part: "graviton", op: topology.created ? "add" : "replace", path: `topology/${topology.id}`, value: topology.created ? entity : {position: entity.position}})
      effects.push(...await this.syncTopologyChildren(sql, topology.id, effects, lineage))
    }
    return effects
  }

  private async syncTopologyChildren(
    sql: Database,
    topologyId: number,
    _effects: Particle[],
    lineage: Set<string>,
  ): Promise<Particle[]> {
    const origin = (await sql<Array<{declaration_path: string; owner_actor: number; context_json: string}>>`
      SELECT declaration_path, owner_actor, context_json FROM boundary_runtime_origin
      WHERE kind = ${"topology"} AND runtime_id = ${topologyId}
    `)[0]
    if (!origin) return []
    const address = parseInflatonAddress(origin.declaration_path)
    const raw = await this.rawFromRow(sql, origin.declaration_path)
    if (!address || !isRecord(raw)) return []
    const topology = (await sql<Array<{kind: "fuzzy" | "axion" | "macho"}>>`SELECT kind FROM topology WHERE id = ${topologyId}`)[0]
    if (!topology) return []
    const context = JSON.parse(origin.context_json) as RuntimeContext
    context.values = await this.actorValuesByKey(sql, Number(origin.owner_actor))
    context.state = (await sql<Array<{state: string | null}>>`SELECT state FROM boundary_actor_state WHERE actor = ${origin.owner_actor}`)[0]?.state ?? null
    const children = await this.matterRows(sql, address.src, address.localId)
    let selected = children
    let repetitions: Array<{itemKey: string; context: RuntimeContext}> = [{itemKey: "0", context}]
    if (topology.kind === "fuzzy" && raw.fuzzyKind === "cond") {
      const slot = Boolean(evaluateBinding(raw.predicateBinding, context)) ? "then" : "else"
      selected = children.filter((child) => child.value.edgeSlot === slot)
    } else if (topology.kind === "fuzzy" && raw.fuzzyKind === "dynamic-meta") {
      const src = evaluateDynamicSrc(raw.predicateBinding, context)
      selected = children.filter((child) => child.value.kind === "wimp" && child.value.src === src)
    } else if (topology.kind === "axion") {
      if (!Boolean(evaluateBinding(raw.predicateBinding, context))) selected = []
    } else if (topology.kind === "macho") {
      const collection = evaluateBinding(raw.collectionBinding, context)
      const counts = new Map<string, number>()
      repetitions = Array.isArray(collection) ? collection.map((item, itemIndex) => {
        const signature = JSON.stringify(item) ?? String(item)
        const occurrence = counts.get(signature) ?? 0
        counts.set(signature, occurrence + 1)
        return {
          itemKey: itemIdentity(item, occurrence),
          context: {...context, item: clone(item), itemIndex},
        }
      }) : []
    }

    const desired = new Set<string>()
    const effects: Particle[] = []
    let position = 0
    for (const repetition of repetitions) {
      const parent: RuntimeRef = {kind: "topology", id: topologyId, ownerActor: Number(origin.owner_actor), context: repetition.context}
      for (const child of selected) {
        const key = `${child.address.path}\0${repetition.itemKey}`
        desired.add(key)
        effects.push(...await this.materializeMatter(sql, child.address, child.value, parent, lineage, repetition.itemKey, position++))
      }
    }
    for (const existing of await sql<Array<{kind: "actor" | "topology"; runtime_id: number; declaration_path: string; item_key: string}>>`
      SELECT kind, runtime_id, declaration_path, item_key FROM boundary_runtime_origin
      WHERE parent_key = ${`topology/${topologyId}`} ORDER BY sequence DESC
    `) {
      if (desired.has(`${existing.declaration_path}\0${existing.item_key}`)) continue
      effects.push(...await this.removeRuntimeBranch(sql, existing.kind, Number(existing.runtime_id)))
    }
    return effects
  }

  private async refreshTopology(sql: Database, topologyId: number, effects: Particle[], lineage: Set<string>): Promise<void> {
    const origin = (await sql<Array<{declaration_path: string; owner_actor: number}>>`
      SELECT declaration_path, owner_actor FROM boundary_runtime_origin WHERE kind = ${"topology"} AND runtime_id = ${topologyId}
    `)[0]
    if (!origin) return
    await this.indexTopologyDependencies(sql, topologyId, Number(origin.owner_actor), await this.rawFromRow(sql, origin.declaration_path))
    effects.push({part: "higgs", op: "replace", path: `topology/${topologyId}`, value: {ownerActor: Number(origin.owner_actor)}})
    effects.push(...await this.syncTopologyChildren(sql, topologyId, effects, lineage))
  }

  private async refreshBoundActor(sql: Database, actorId: number, address: InflatonAddress, raw: JsonRecord, effects: Particle[]): Promise<void> {
    const origin = (await sql<Array<{parent_key: string; context_json: string}>>`
      SELECT parent_key, context_json FROM boundary_runtime_origin WHERE kind = ${"actor"} AND runtime_id = ${actorId}
    `)[0]
    if (!origin || raw.kind !== "wimp" || typeof raw.src !== "string") return
    const context = JSON.parse(origin.context_json) as RuntimeContext
    const bound = raw.fieldsBinding === undefined ? {} : fieldValues(evaluateBinding(raw.fieldsBinding, context), `${raw.src} fields binding`)
    await this.populateActorFields(sql, actorId, raw.src, bound, effects, true)
    await sql`UPDATE boundary_runtime_origin SET context_json = ${JSON.stringify({...context, values: await this.actorValuesByKey(sql, actorId)})} WHERE kind = ${"actor"} AND runtime_id = ${actorId}`
    void address
  }

  private async applyFieldParticle(part: Particle): Promise<BoundaryIncrementalCommit | null> {
    if (typeof part.path !== "number") return null
    const fields = resolveForceFieldsPayload(part.value)
    if (!fields || Object.keys(fields).length !== 1 || !["add", "replace", "remove", "test"].includes(part.op)) return null
    const [rawField, value] = Object.entries(fields)[0]!
    const field = Number(rawField)
    if (!Number.isSafeInteger(field)) return null
    const effects = await this.sql.begin(async (tx) => {
      const current = (await tx<Array<{value_json: string}>>`
        SELECT value_json FROM boundary_actor_field WHERE actor = ${part.path} AND field = ${field}
      `)[0]
      const currentValue = current ? JSON.parse(current.value_json) as unknown : undefined
      if (part.op === "test") {
        if (!forceValueEqual(currentValue, value)) throw new Error(`Boundary field test failed for actor ${part.path}, field ${field}`)
        return [] as Particle[]
      }
      if (part.op === "remove") await tx`DELETE FROM boundary_actor_field WHERE actor = ${part.path} AND field = ${field}`
      else await tx`
        INSERT INTO boundary_actor_field (actor, field, value_json)
        VALUES (${part.path}, ${field}, ${JSON.stringify(value)})
        ON CONFLICT (actor, field) DO UPDATE SET value_json = excluded.value_json
      `
      const committed: Particle[] = [{part: part.part, op: part.op, path: part.path, value: {fields: {[String(field)]: clone(value)}}}]
      if (part.part === "higgs") {
        for (const row of await tx<Array<{topology: number}>>`
          SELECT topology FROM boundary_topology_dependency
          WHERE field = ${field} AND topology IN (
            SELECT runtime_id FROM boundary_runtime_origin WHERE kind = ${"topology"} AND owner_actor = ${part.path}
          )
        `) await this.refreshTopology(tx, Number(row.topology), committed, new Set())
      }
      return committed
    })
    await this.updateIndexes(effects)
    return effects.length === 0 ? null : {rootSrc: await this.rootSrc(), messages: effects.map(particleMessage)}
  }

  private async applyPhoton(part: Particle): Promise<BoundaryIncrementalCommit | null> {
    if (typeof part.path !== "number" || (part.op !== "add" && part.op !== "replace" && part.op !== "remove" && part.op !== "test")) return null
    const state = part.op === "remove" ? null : typeof part.value === "string" ? part.value : null
    const effects = await this.sql.begin(async (tx) => {
      const current = (await tx<Array<{state: string | null}>>`SELECT state FROM boundary_actor_state WHERE actor = ${part.path}`)[0]?.state ?? null
      if (part.op === "test") {
        if (current !== state) throw new Error(`Boundary state test failed for actor ${part.path}`)
        return [] as Particle[]
      }
      await tx`
        INSERT INTO boundary_actor_state (actor, state) VALUES (${part.path}, ${state})
        ON CONFLICT (actor) DO UPDATE SET state = excluded.state
      `
      const committed: Particle[] = [{part: "photon", op: "replace", path: part.path, value: state}]
      for (const row of await tx<Array<{topology: number}>>`
        SELECT dependency.topology
        FROM boundary_topology_dependency AS dependency
        JOIN boundary_runtime_origin AS origin ON origin.kind = ${"topology"} AND origin.runtime_id = dependency.topology
        WHERE dependency.uses_state = 1 AND origin.owner_actor = ${part.path}
      `) await this.refreshTopology(tx, Number(row.topology), committed, new Set())
      return committed
    })
    await this.updateIndexes(effects)
    return effects.length === 0 ? null : {rootSrc: await this.rootSrc(), messages: effects.map(particleMessage)}
  }

  private async populateActorFields(
    sql: Database,
    actor: number,
    src: string,
    boundValues: JsonRecord,
    effects: Particle[],
    boundOnly = false,
  ): Promise<void> {
    for (const row of await sql<Array<{path: string; value_json: string}>>`
      SELECT path, value_json FROM boundary_declaration_entity
      WHERE src = ${src} AND section = ${"fields"} ORDER BY rowid
    `) {
      const declaration = JSON.parse(row.value_json) as unknown
      if (!isRecord(declaration) || typeof declaration.key !== "string") continue
      const hasBound = Object.hasOwn(boundValues, declaration.key)
      if (boundOnly && !hasBound) continue
      const existing = (await sql<Array<{value_json: string}>>`
        SELECT value_json FROM boundary_actor_field WHERE actor = ${actor} AND field = ${boundaryEntityId(row.path)}
      `)[0]
      const next = hasBound ? boundValues[declaration.key] : Object.hasOwn(declaration, "default") ? declaration.default : null
      if (existing && !hasBound) continue
      if (existing && forceValueEqual(JSON.parse(existing.value_json), next)) continue
      const field = boundaryEntityId(row.path)
      await sql`
        INSERT INTO boundary_actor_field (actor, field, value_json)
        VALUES (${actor}, ${field}, ${JSON.stringify(next)})
        ON CONFLICT (actor, field) DO UPDATE SET value_json = excluded.value_json
      `
      effects.push({part: "gluon", op: existing ? "replace" : "add", path: actor, value: {fields: {[String(field)]: clone(next)}}})
    }
  }

  private async addFieldToActors(sql: Database, address: InflatonAddress, next: unknown, effects: Particle[]): Promise<void> {
    if (!isRecord(next)) return
    const field = boundaryEntityId(address.path)
    for (const actor of await sql<Array<{id: number}>>`SELECT id FROM actor WHERE wimp = ${address.src}`) {
      const found = (await sql<Array<{ok: number}>>`
        SELECT 1 AS ok FROM boundary_actor_field WHERE actor = ${actor.id} AND field = ${field}
      `)[0]
      if (found) continue
      const value = Object.hasOwn(next, "default") ? next.default : null
      await sql`INSERT INTO boundary_actor_field (actor, field, value_json) VALUES (${actor.id}, ${field}, ${JSON.stringify(value)})`
      effects.push({part: "gluon", op: "add", path: Number(actor.id), value: {fields: {[String(field)]: clone(value)}}})
    }
  }

  private async initializeActorStates(sql: Database, src: string, effects: Particle[]): Promise<void> {
    const initial = await this.initialState(sql, src)
    if (initial === null) return
    for (const actor of await sql<Array<{id: number}>>`SELECT id FROM actor WHERE wimp = ${src}`) {
      const current = (await sql<Array<{state: string | null}>>`SELECT state FROM boundary_actor_state WHERE actor = ${actor.id}`)[0]
      if (current?.state != null) continue
      await sql`
        INSERT INTO boundary_actor_state (actor, state) VALUES (${actor.id}, ${initial})
        ON CONFLICT (actor) DO UPDATE SET state = excluded.state
      `
      effects.push({part: "photon", op: "replace", path: Number(actor.id), value: initial})
    }
  }

  private async initialState(sql: Database, src: string, excludePath?: string): Promise<string | null> {
    for (const row of await sql<Array<{path: string; value_json: string}>>`
      SELECT path, value_json FROM boundary_declaration_entity
      WHERE src = ${src} AND section = ${"states"} ORDER BY rowid
    `) {
      if (row.path === excludePath) continue
      const value = JSON.parse(row.value_json) as unknown
      if (isRecord(value) && typeof value.name === "string") return value.name
    }
    return null
  }

  private async actorValuesByKey(sql: Database, actor: number): Promise<JsonRecord> {
    const head = (await sql<Array<{wimp: string}>>`SELECT wimp FROM actor WHERE id = ${actor}`)[0]
    if (!head) return {}
    const result: JsonRecord = {}
    for (const row of await sql<Array<{path: string; value_json: string}>>`
      SELECT path, value_json FROM boundary_declaration_entity WHERE src = ${head.wimp} AND section = ${"fields"}
    `) {
      const field = JSON.parse(row.value_json) as unknown
      if (!isRecord(field) || typeof field.key !== "string") continue
      const value = (await sql<Array<{value_json: string}>>`
        SELECT value_json FROM boundary_actor_field WHERE actor = ${actor} AND field = ${boundaryEntityId(row.path)}
      `)[0]
      if (value) result[field.key] = JSON.parse(value.value_json) as unknown
    }
    return result
  }

  private async contextForRef(sql: Database, kind: "actor" | "topology", id: number, ownerActor: number): Promise<RuntimeContext> {
    const origin = (await sql<Array<{context_json: string}>>`
      SELECT context_json FROM boundary_runtime_origin WHERE kind = ${kind} AND runtime_id = ${id}
    `)[0]
    const context = origin ? JSON.parse(origin.context_json) as RuntimeContext : {values: {}, state: null}
    context.values = await this.actorValuesByKey(sql, ownerActor)
    context.state = (await sql<Array<{state: string | null}>>`SELECT state FROM boundary_actor_state WHERE actor = ${ownerActor}`)[0]?.state ?? null
    return context
  }

  private async matterParents(sql: Database, address: InflatonAddress, value: JsonRecord): Promise<RuntimeRef[]> {
    if (value.parent == null) {
      const actors = await sql<Array<{id: number}>>`SELECT id FROM actor WHERE wimp = ${address.src}`
      const result: RuntimeRef[] = []
      for (const actor of actors) result.push({
        kind: "actor",
        id: Number(actor.id),
        ownerActor: Number(actor.id),
        context: await this.contextForRef(sql, "actor", Number(actor.id), Number(actor.id)),
      })
      return result
    }
    const path = `${address.src}/matter/${String(value.parent)}`
    const result: RuntimeRef[] = []
    for (const row of await sql<Array<{kind: "actor" | "topology"; runtime_id: number; owner_actor: number}>>`
      SELECT kind, runtime_id, owner_actor FROM boundary_runtime_origin WHERE declaration_path = ${path}
    `) result.push({
      kind: row.kind,
      id: Number(row.runtime_id),
      ownerActor: Number(row.owner_actor),
      context: await this.contextForRef(sql, row.kind, Number(row.runtime_id), Number(row.owner_actor)),
    })
    return result
  }

  private async matterRows(sql: Database, src: string, parent: string | null): Promise<Array<{address: InflatonAddress; value: JsonRecord}>> {
    const result: Array<{address: InflatonAddress; value: JsonRecord}> = []
    for (const row of await sql<Array<{path: string; local_id: string; value_json: string}>>`
      SELECT path, local_id, value_json FROM boundary_declaration_entity
      WHERE src = ${src} AND section = ${"matter"} ORDER BY rowid
    `) {
      const value = JSON.parse(row.value_json) as unknown
      if (!isRecord(value) || (value.parent == null ? null : String(value.parent)) !== parent) continue
      result.push({address: {src, section: "matter", localId: row.local_id, path: row.path}, value})
    }
    return result.sort((left, right) => Number(left.value.position ?? 0) - Number(right.value.position ?? 0))
  }

  private async indexTopologyDependencies(sql: Database, topology: number, ownerActor: number, raw: unknown): Promise<void> {
    await sql`DELETE FROM boundary_topology_dependency WHERE topology = ${topology}`
    if (!isRecord(raw)) return
    const paths = [...bindingPaths(raw.predicateBinding), ...bindingPaths(raw.collectionBinding)]
    const actor = (await sql<Array<{wimp: string}>>`SELECT wimp FROM actor WHERE id = ${ownerActor}`)[0]
    if (!actor) return
    for (const path of new Set(paths)) {
      if (path === "state") {
        await sql`INSERT OR IGNORE INTO boundary_topology_dependency (topology, field, uses_state) VALUES (${topology}, NULL, 1)`
        continue
      }
      const field = await this.fieldIdByKey(sql, actor.wimp, path)
      if (field !== null) await sql`INSERT OR IGNORE INTO boundary_topology_dependency (topology, field, uses_state) VALUES (${topology}, ${field}, 0)`
    }
  }

  private async reindexOwnerTopologies(sql: Database, src: string): Promise<void> {
    for (const row of await sql<Array<{runtime_id: number; owner_actor: number; declaration_path: string}>>`
      SELECT origin.runtime_id, origin.owner_actor, origin.declaration_path
      FROM boundary_runtime_origin AS origin
      JOIN actor ON actor.id = origin.owner_actor
      WHERE origin.kind = ${"topology"} AND actor.wimp = ${src}
    `) await this.indexTopologyDependencies(sql, Number(row.runtime_id), Number(row.owner_actor), await this.rawFromRow(sql, row.declaration_path))
  }

  private async fieldIdByKey(sql: Database, src: string, key: string): Promise<number | null> {
    for (const row of await sql<Array<{path: string; value_json: string}>>`
      SELECT path, value_json FROM boundary_declaration_entity WHERE src = ${src} AND section = ${"fields"}
    `) {
      const value = JSON.parse(row.value_json) as unknown
      if (isRecord(value) && value.key === key) return boundaryEntityId(row.path)
    }
    return null
  }

  private async updateMatterPosition(sql: Database, path: string, position: number, effects: Particle[]): Promise<void> {
    for (const origin of await sql<Array<{kind: "actor" | "topology"; runtime_id: number}>>`
      SELECT kind, runtime_id FROM boundary_runtime_origin WHERE declaration_path = ${path}
    `) {
      const table = origin.kind === "actor" ? "actor" : "topology"
      await sql.unsafe(`UPDATE ${table} SET position = ? WHERE id = ?`, [position, Number(origin.runtime_id)])
      effects.push({part: "graviton", op: "replace", path: `${origin.kind}/${origin.runtime_id}`, value: {position}})
    }
  }

  private async removeMatterInstances(sql: Database, path: string, effects: Particle[]): Promise<void> {
    for (const origin of await sql<Array<{kind: "actor" | "topology"; runtime_id: number}>>`
      SELECT kind, runtime_id FROM boundary_runtime_origin WHERE declaration_path = ${path} ORDER BY sequence DESC
    `) effects.push(...await this.removeRuntimeBranch(sql, origin.kind, Number(origin.runtime_id)))
  }

  private async removeRuntimeBranch(sql: Database, kind: "actor" | "topology", id: number): Promise<Particle[]> {
    const particles: Particle[] = []
    const visit = async (childKind: "actor" | "topology", childId: number): Promise<void> => {
      const key = `${childKind}/${childId}`
      for (const row of await sql<Array<{kind: "actor" | "topology"; runtime_id: number}>>`
        SELECT kind, runtime_id FROM boundary_runtime_origin WHERE parent_key = ${key} ORDER BY sequence DESC
      `) await visit(row.kind, Number(row.runtime_id))
      particles.push({part: "graviton", op: "remove", path: key})
      await sql`DELETE FROM boundary_runtime_origin WHERE kind = ${childKind} AND runtime_id = ${childId}`
      if (childKind === "actor") {
        await sql`DELETE FROM boundary_actor_field WHERE actor = ${childId}`
        await sql`DELETE FROM boundary_actor_state WHERE actor = ${childId}`
        await sql`DELETE FROM actor WHERE id = ${childId}`
      } else {
        await sql`DELETE FROM boundary_topology_dependency WHERE topology = ${childId}`
        await sql`DELETE FROM topology WHERE id = ${childId}`
      }
    }
    const exists = kind === "actor"
      ? (await sql<Array<{ok: number}>>`SELECT 1 AS ok FROM actor WHERE id = ${id}`)[0]
      : (await sql<Array<{ok: number}>>`SELECT 1 AS ok FROM topology WHERE id = ${id}`)[0]
    if (exists) await visit(kind, id)
    return particles
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
    const state = (await sql<Array<{state: string | null}>>`SELECT state FROM boundary_actor_state WHERE actor = ${id}`)[0]?.state ?? null
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
      state,
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
    return (await this.sql<Array<{src: string}>>`SELECT src FROM boundary_root ORDER BY rowid LIMIT 1`)[0]?.src ?? null
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
    const target = kind === "actor" ? this.actorIdsByDeclaration : this.instanceIdsByTopology
    const ids = target.get(origin)
    if (ids) ids.add(id)
    else target.set(origin, new Set([id]))
  }

  private unindexInstance(kind: "actor" | "topology", id: number): void {
    const key = `${kind}/${id}`
    const origin = this.originByInstance.get(key)
    const parent = this.parentByInstance.get(key)
    if (parent) {
      this.childrenByParent.get(parent)?.delete(key)
      if (this.childrenByParent.get(parent)?.size === 0) this.childrenByParent.delete(parent)
    }
    const target = kind === "actor" ? this.actorIdsByDeclaration : this.instanceIdsByTopology
    if (origin) {
      target.get(origin)?.delete(id)
      if (target.get(origin)?.size === 0) target.delete(origin)
    }
    this.originByInstance.delete(key)
    this.parentByInstance.delete(key)
  }

  private async ensureColumn(table: string, column: string, definition: string): Promise<void> {
    const columns = await this.sql<Array<{name: string}>>`PRAGMA table_info(${this.sql(table)})`
    if (!columns.some((entry) => entry.name === column)) await this.sql.unsafe(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
  }

  private async tableExists(name: string): Promise<boolean> {
    return Boolean((await this.sql<Array<{ok: number}>>`
      SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ${name}
    `)[0])
  }

  private async migrateLegacy(): Promise<void> {
    const existing = (await this.sql<Array<{ok: number}>>`SELECT 1 AS ok FROM boundary_declaration_entity LIMIT 1`)[0]
    if (existing) return
    if (await this.tableExists("wimp")) {
      for (const row of await this.sql<Array<{src: string; name: string | null; desc: string | null; view_css: string | null}>>`
        SELECT src, name, desc, view_css FROM wimp ORDER BY rowid
      `) {
        const address = parseInflatonAddress(`${row.src}/meta`)!
        const raw = {name: row.name, desc: row.desc}
        const canonical = await this.canonicalDeclaration(this.sql, address, raw)
        await this.sql`
          INSERT OR IGNORE INTO boundary_declaration_entity (path, src, section, local_id, value_json, canonical_json)
          VALUES (${address.path}, ${address.src}, ${address.section}, ${address.localId}, ${JSON.stringify(raw)}, ${JSON.stringify(canonical)})
        `
        if (row.view_css !== null) {
          const bulkAddress = parseInflatonAddress(`${row.src}/bulk`)!
          const bulk = {view: row.view_css}
          await this.sql`
            INSERT OR IGNORE INTO boundary_declaration_entity (path, src, section, local_id, value_json, canonical_json)
            VALUES (${bulkAddress.path}, ${bulkAddress.src}, ${bulkAddress.section}, ${bulkAddress.localId}, ${JSON.stringify(bulk)}, ${JSON.stringify({...await this.canonicalDeclaration(this.sql, bulkAddress, bulk)})})
          `
        }
      }
    }
    if (await this.tableExists("field")) {
      for (const row of await this.sql<Array<{id: number; wimp: string; local_id: number | null; key: string; type: string; required: number; label: string | null}>>`
        SELECT id, wimp, local_id, key, type, required, label FROM field ORDER BY rowid
      `) {
        const local = row.local_id ?? row.id
        const address = parseInflatonAddress(`${row.wimp}/fields/${local}`)!
        const raw = {key: row.key, type: row.type, required: row.required === 1, label: row.label}
        const canonical = {...await this.canonicalDeclaration(this.sql, address, raw), id: Number(row.id)}
        await this.sql`
          INSERT OR IGNORE INTO boundary_declaration_entity (path, src, section, local_id, value_json, canonical_json)
          VALUES (${address.path}, ${address.src}, ${address.section}, ${address.localId}, ${JSON.stringify(raw)}, ${JSON.stringify(canonical)})
        `
      }
    }
    if (await this.tableExists("actor")) {
      for (const row of await this.sql<Array<{id: number; parent_actor: number | null; parent_topology: number | null; wimp: string; position: number}>>`
        SELECT id, parent_actor, parent_topology, wimp, position FROM actor ORDER BY id
      `) {
        const parent = row.parent_actor !== null ? `actor/${row.parent_actor}` : row.parent_topology !== null ? `topology/${row.parent_topology}` : "root"
        await this.sql`
          INSERT OR IGNORE INTO boundary_runtime_origin
            (kind, runtime_id, declaration_path, parent_key, owner_actor, ordinal, item_key, context_json)
          VALUES (${"actor"}, ${row.id}, ${`legacy/actor/${row.id}`}, ${parent}, ${row.id}, ${row.position}, ${"legacy"}, ${JSON.stringify({values: {}, state: null})})
        `
        if (parent === "root") await this.sql`INSERT OR IGNORE INTO boundary_root (src) VALUES (${row.wimp})`
      }
    }
    if (await this.tableExists("topology")) {
      for (const row of await this.sql<Array<{id: number; parent_actor: number | null; parent_topology: number | null; position: number}>>`
        SELECT id, parent_actor, parent_topology, position FROM topology ORDER BY id
      `) {
        const parent = row.parent_actor !== null ? `actor/${row.parent_actor}` : `topology/${row.parent_topology}`
        const owner = row.parent_actor ?? (await this.sql<Array<{owner_actor: number}>>`
          SELECT owner_actor FROM boundary_runtime_origin WHERE kind = ${"topology"} AND runtime_id = ${row.parent_topology}
        `)[0]?.owner_actor
        if (owner === undefined || owner === null) continue
        await this.sql`
          INSERT OR IGNORE INTO boundary_runtime_origin
            (kind, runtime_id, declaration_path, parent_key, owner_actor, ordinal, item_key, context_json)
          VALUES (${"topology"}, ${row.id}, ${`legacy/topology/${row.id}`}, ${parent}, ${owner}, ${row.position}, ${"legacy"}, ${JSON.stringify({values: {}, state: null})})
        `
      }
    }
    if (await this.tableExists("actor_state")) {
      for (const row of await this.sql<Array<{actor: number; state: string | null}>>`
        SELECT actor_state.actor, state.name AS state
        FROM actor_state LEFT JOIN state ON state.id = actor_state.metaState
      `) await this.sql`INSERT OR REPLACE INTO boundary_actor_state (actor, state) VALUES (${row.actor}, ${row.state})`
    }
    if (await this.tableExists("actor_value") && await this.tableExists("value")) {
      for (const row of await this.sql<Array<{actor: number; field: number; value: number; kind: string}>>`
        SELECT actor_value.actor, actor_value.field, actor_value.value, value.kind
        FROM actor_value JOIN value ON value.id = actor_value.value
      `) {
        let value: unknown = null
        if (row.kind === "boolean") value = (await this.sql<Array<{value: number}>>`SELECT boolean AS value FROM value_boolean WHERE value = ${row.value}`)[0]?.value === 1
        else if (row.kind === "number") value = Number((await this.sql<Array<{value: number}>>`SELECT number AS value FROM value_number WHERE value = ${row.value}`)[0]?.value)
        else if (row.kind === "string") value = (await this.sql<Array<{value: string}>>`SELECT text AS value FROM value_string WHERE value = ${row.value}`)[0]?.value ?? ""
        else if (row.kind === "enum") value = (await this.sql<Array<{value: string}>>`
          SELECT field_enum_variant.item_value AS value FROM value_enum
          JOIN field_enum_variant ON field_enum_variant.id = value_enum.variant WHERE value_enum.value = ${row.value}
        `)[0]?.value ?? null
        else if (row.kind === "list") value = (await this.sql<Array<{value: string}>>`
          SELECT item_value AS value FROM value_list_item WHERE value = ${row.value} ORDER BY position
        `).map((entry) => entry.value)
        await this.sql`
          INSERT OR IGNORE INTO boundary_actor_field (actor, field, value_json)
          VALUES (${row.actor}, ${row.field}, ${JSON.stringify(value)})
        `
      }
    }
  }
}
