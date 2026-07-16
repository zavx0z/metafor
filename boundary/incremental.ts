import type {ReservedSQL, SQL} from "bun"
import type {ForceMessage} from "@metafor/types/force/message"
import type {Particle} from "@metafor/types/force/particle"
import {resolveForceFieldsPayload} from "@metafor/types/force/fields"

type Database = SQL | ReservedSQL
type JsonRecord = Record<string, unknown>
type RuntimeRef = {kind: "atom" | "topology"; id: number; ownerAtom: number}

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

const atomParentKey = (parent: RuntimeRef): string => `${parent.kind}/${parent.id}`

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
  readonly atomIdsByDeclaration = new Map<string, Set<number>>()
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
        kind TEXT NOT NULL CHECK (kind IN ('atom', 'topology')),
        runtime_id INTEGER NOT NULL,
        declaration_path TEXT NOT NULL,
        parent_key TEXT NOT NULL,
        owner_atom INTEGER NOT NULL,
        ordinal INTEGER NOT NULL DEFAULT 0,
        UNIQUE (kind, runtime_id),
        UNIQUE (kind, declaration_path, parent_key, ordinal)
      );
      CREATE TABLE IF NOT EXISTS boundary_atom_field (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        atom INTEGER NOT NULL,
        field INTEGER NOT NULL,
        value_json TEXT NOT NULL,
        UNIQUE (atom, field)
      );
      CREATE INDEX IF NOT EXISTS boundary_origin_by_declaration
        ON boundary_runtime_origin (declaration_path);
      CREATE INDEX IF NOT EXISTS boundary_origin_by_owner
        ON boundary_runtime_origin (owner_atom);
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
    for (const origin of await this.sql<Array<{kind: "atom" | "topology"; runtime_id: number}>>`
      SELECT kind, runtime_id FROM boundary_runtime_origin ORDER BY sequence
    `) {
      if (origin.kind === "atom") {
        const entity = await this.atomEntity(this.sql, Number(origin.runtime_id))
        if (entity) particles.push({part: "graviton", op: "add", path: `atom/${origin.runtime_id}`, value: entity})
      } else {
        const entity = await this.topologyEntity(this.sql, Number(origin.runtime_id))
        if (entity) particles.push({part: "graviton", op: "add", path: `topology/${origin.runtime_id}`, value: entity})
      }
    }
    return particles.map(particleMessage)
  }

  /** Reconciles only State-driven Axion branches after Boundary commits Photon. */
  async reconcileStateMatter(part: Particle): Promise<BoundaryIncrementalCommit | null> {
    if (
      part.part !== "photon" ||
      (part.op !== "replace" && part.op !== "test") ||
      typeof part.path !== "number" ||
      !Number.isSafeInteger(part.path)
    ) return null
    const atomId = part.path

    const effects = await this.sql.begin(async (tx) => {
      const committed: Particle[] = []
      const currentState = (await tx<Array<{name: string}>>`
        SELECT state.name AS name
          FROM atom_state JOIN state ON state.id = atom_state.metaState
         WHERE atom_state.atom = ${atomId}
      `)[0]?.name

      for (const topology of await tx<Array<{runtime_id: number; declaration_path: string}>>`
        SELECT boundary_runtime_origin.runtime_id,
               boundary_runtime_origin.declaration_path
          FROM boundary_runtime_origin
          JOIN topology ON topology.id = boundary_runtime_origin.runtime_id
         WHERE boundary_runtime_origin.kind = ${"topology"}
           AND boundary_runtime_origin.owner_atom = ${atomId}
           AND topology.kind = ${"axion"}
         ORDER BY boundary_runtime_origin.sequence
      `) {
        const address = parseInflatonAddress(topology.declaration_path)
        if (!address) continue
        const parent: RuntimeRef = {kind: "topology", id: Number(topology.runtime_id), ownerAtom: atomId}
        const children = await this.matterRows(tx, address.src, address.localId)
        const selected: string[] = []
        for (const child of children) {
          if (await this.branchSelected(tx, parent, child.value)) selected.push(child.address.path)
        }
        const existing = (await tx<Array<{declaration_path: string}>>`
          SELECT declaration_path
            FROM boundary_runtime_origin
           WHERE parent_key = ${atomParentKey(parent)}
           ORDER BY declaration_path, ordinal
        `).map((row) => row.declaration_path)
        selected.sort()
        existing.sort()
        if (same(existing, selected)) continue

        for (const child of await tx<Array<{kind: "atom" | "topology"; runtime_id: number}>>`
          SELECT kind, runtime_id
            FROM boundary_runtime_origin
           WHERE parent_key = ${atomParentKey(parent)}
           ORDER BY sequence DESC
        `) committed.push(...await this.removeRuntimeBranch(tx, child.kind, Number(child.runtime_id)))

        committed.push({
          part: "higgs",
          op: "replace",
          path: `topology/${topology.runtime_id}`,
          value: {state: currentState ?? null},
        })
        for (const child of children) {
          committed.push(...await this.materializeMatter(tx, child.address, child.value, committed, parent))
        }
      }
      return committed
    })
    if (effects.length === 0) return null
    await this.updateIndexes(effects)
    return {rootSrc: await this.rootSrc(), messages: effects.map(particleMessage)}
  }

  private async rememberRoot(part: Particle): Promise<BoundaryIncrementalCommit | null> {
    if (typeof part.path !== "string" || part.path.startsWith("force/replay/")) return null
    const src = part.path
    const effects: Particle[] = await this.sql.begin(async (tx): Promise<Particle[]> => {
      await tx`INSERT INTO boundary_root (src) VALUES (${src}) ON CONFLICT DO NOTHING`
      const exists = (await tx<Array<{ok: number}>>`SELECT 1 AS ok FROM wimp WHERE src = ${src}`)[0]
      return exists ? await this.ensureRootAtom(tx, src) : []
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
          label: typeof raw.label === "string" ? raw.label : null,
          desc: typeof raw.desc === "string" ? raw.desc : null,
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
        label: typeof raw.label === "string" ? raw.label : null,
        desc: typeof raw.desc === "string" ? raw.desc : null,
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
        SELECT 1 AS ok FROM atom WHERE parent_atom IS NULL AND parent_topology IS NULL LIMIT 1
      `)[0]
      if (requested || !anyRoot) effects.push(...await this.ensureRootAtom(sql, address.src))
      return
    }
    if (address.section === "fields") {
      if (!isRecord(next) || !Object.prototype.hasOwnProperty.call(next, "default")) return
      const fieldId = boundaryEntityId(address.path)
      for (const atom of await sql<Array<{id: number}>>`SELECT id FROM atom WHERE wimp = ${address.src}`) {
        const found = (await sql<Array<{ok: number}>>`
          SELECT 1 AS ok FROM boundary_atom_field WHERE atom = ${atom.id} AND field = ${fieldId}
        `)[0]
        if (found) continue
        await sql`
          INSERT INTO boundary_atom_field (atom, field, value_json)
          VALUES (${atom.id}, ${fieldId}, ${JSON.stringify(next.default)})
        `
        effects.push({part: "gluon", op: "add", path: Number(atom.id), value: {fields: {[String(fieldId)]: clone(next.default)}}})
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
        for (const origin of await sql<Array<{kind: "atom" | "topology"; runtime_id: number}>>`
          SELECT kind, runtime_id FROM boundary_runtime_origin WHERE declaration_path = ${address.path}
        `) {
          const table = origin.kind === "atom" ? "atom" : "topology"
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
      for (const row of await sql<Array<{atom: number}>>`SELECT atom FROM boundary_atom_field WHERE field = ${field}`) {
        effects.push({part: "gluon", op: "remove", path: Number(row.atom), value: {fields: {[String(field)]: null}}})
      }
      await sql`DELETE FROM boundary_atom_field WHERE field = ${field}`
      return
    }
    if (address.section === "meta") {
      for (const atom of await sql<Array<{id: number}>>`SELECT id FROM atom WHERE wimp = ${address.src}`) {
        effects.push(...await this.removeRuntimeBranch(sql, "atom", Number(atom.id)))
      }
      await sql`DELETE FROM boundary_root WHERE src = ${address.src}`
      return
    }
    void previous
  }

  private async ensureRootAtom(sql: Database, src: string): Promise<Particle[]> {
    const existing = (await sql<Array<{id: number}>>`
      SELECT id FROM atom WHERE wimp = ${src} AND parent_atom IS NULL AND parent_topology IS NULL LIMIT 1
    `)[0]
    if (existing) return []
    return await this.createAtom(sql, src, null, `${src}/meta`, 0)
  }

  private async createAtom(
    sql: Database,
    src: string,
    parent: RuntimeRef | null,
    originPath: string,
    ordinal: number,
	initialFields?: JsonRecord,
  ): Promise<Particle[]> {
    const parentKey = parent ? atomParentKey(parent) : "root"
    const found = (await sql<Array<{runtime_id: number}>>`
      SELECT runtime_id FROM boundary_runtime_origin
      WHERE kind = ${"atom"} AND declaration_path = ${originPath} AND parent_key = ${parentKey} AND ordinal = ${ordinal}
    `)[0]
    if (found) return []
    const position = Number((await sql<Array<{count: number}>>`
      SELECT COUNT(*) AS count FROM atom
      WHERE parent_atom IS ${parent?.kind === "atom" ? parent.id : null}
        AND parent_topology IS ${parent?.kind === "topology" ? parent.id : null}
    `)[0]?.count ?? 0)
    const atom = Number((await sql<Array<{id: number}>>`
      INSERT INTO atom (parent_atom, parent_topology, wimp, position)
      VALUES (${parent?.kind === "atom" ? parent.id : null}, ${parent?.kind === "topology" ? parent.id : null}, ${src}, ${position})
      RETURNING id
    `)[0]!.id)
    await sql`
      INSERT INTO boundary_runtime_origin (kind, runtime_id, declaration_path, parent_key, owner_atom, ordinal)
      VALUES (${"atom"}, ${atom}, ${originPath}, ${parentKey}, ${atom}, ${ordinal})
    `
	const remainingInitialFields = new Set(Object.keys(initialFields ?? {}))
    for (const row of await sql<Array<{path: string; value_json: string}>>`
      SELECT path, value_json FROM boundary_declaration_entity
      WHERE src = ${src} AND section = ${"fields"} ORDER BY CAST(local_id AS INTEGER)
    `) {
      const field = JSON.parse(row.value_json) as unknown
	  if (!isRecord(field) || typeof field.key !== "string") continue
	  const hasInitial = Object.prototype.hasOwnProperty.call(initialFields ?? {}, field.key)
	  if (!hasInitial && !Object.prototype.hasOwnProperty.call(field, "default")) continue
	  const fieldValue = hasInitial ? initialFields?.[field.key] : field.default
	  remainingInitialFields.delete(field.key)
      await sql`
        INSERT INTO boundary_atom_field (atom, field, value_json)
		VALUES (${atom}, ${boundaryEntityId(row.path)}, ${JSON.stringify(fieldValue)})
      `
    }
	if (remainingInitialFields.size > 0) {
		throw new Error(`Matter fields for ${src} contain undeclared keys: ${[...remainingInitialFields].join(", ")}`)
	}
    const entity = await this.atomEntity(sql, atom)
    const effects: Particle[] = entity ? [{part: "graviton", op: "add", path: `atom/${atom}`, value: entity}] : []
    for (const row of await this.matterRows(sql, src, null)) {
      effects.push(...await this.materializeMatter(sql, row.address, row.value, effects, {kind: "atom", id: atom, ownerAtom: atom}))
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
    const parentKey = atomParentKey(parent)
    const found = (await sql<Array<{runtime_id: number}>>`
      SELECT runtime_id FROM boundary_runtime_origin
      WHERE kind = ${"topology"} AND declaration_path = ${originPath} AND parent_key = ${parentKey} AND ordinal = ${ordinal}
    `)[0]
    if (found) return []
    const position = Number((await sql<Array<{count: number}>>`
      SELECT COUNT(*) AS count FROM topology
      WHERE parent_atom IS ${parent.kind === "atom" ? parent.id : null}
        AND parent_topology IS ${parent.kind === "topology" ? parent.id : null}
    `)[0]?.count ?? 0)
    const id = Number((await sql<Array<{id: number}>>`
      INSERT INTO topology (parent_atom, parent_topology, kind, position)
      VALUES (${parent.kind === "atom" ? parent.id : null}, ${parent.kind === "topology" ? parent.id : null}, ${kind}, ${position})
      RETURNING id
    `)[0]!.id)
    await sql`
      INSERT INTO boundary_runtime_origin (kind, runtime_id, declaration_path, parent_key, owner_atom, ordinal)
      VALUES (${"topology"}, ${id}, ${originPath}, ${parentKey}, ${parent.ownerAtom}, ${ordinal})
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
		  const binding = value.fieldsBinding
		  let initialFields: JsonRecord | undefined
		  if (typeof binding === "string") {
			const resolved = await this.atomFieldByKey(sql, parent.ownerAtom, binding)
			if (isRecord(resolved)) initialFields = resolved
		  } else if (isRecord(binding)) {
			const paths = typeof binding.data === "string"
			  ? [binding.data]
			  : Array.isArray(binding.data)
				? binding.data.filter((path): path is string => typeof path === "string")
				: []
			const values: unknown[] = []
			for (const path of paths) {
			  if (path === "/state") {
				values.push((await sql<Array<{name: string}>>`
				  SELECT state.name AS name
					FROM atom_state JOIN state ON state.id = atom_state.metaState
				   WHERE atom_state.atom = ${parent.ownerAtom}
				`)[0]?.name)
			  } else {
				values.push(await this.atomFieldByKey(sql, parent.ownerAtom, path))
			  }
			}
			const resolved = typeof binding.expr === "string"
			  ? new Function("_", `"use strict"; return (${binding.expr})`)(values) as unknown
			  : values[0]
			if (isRecord(resolved)) initialFields = resolved
		  }
		  created.push(...await this.createAtom(sql, value.src, parent, address.path, ordinal, initialFields))
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
            kind: "topology", id: topologyId, ownerAtom: parent.ownerAtom,
          }))
        }
      }
    }
    return created
  }

  private async matterParents(sql: Database, address: InflatonAddress, value: JsonRecord): Promise<RuntimeRef[]> {
    if (value.parent == null) {
      return (await sql<Array<{id: number}>>`SELECT id FROM atom WHERE wimp = ${address.src}`).map((row) => ({
        kind: "atom" as const, id: Number(row.id), ownerAtom: Number(row.id),
      }))
    }
    const path = `${address.src}/matter/${String(value.parent)}`
    return (await sql<Array<{kind: "atom" | "topology"; runtime_id: number; owner_atom: number}>>`
      SELECT kind, runtime_id, owner_atom FROM boundary_runtime_origin WHERE declaration_path = ${path}
    `).map((row) => ({kind: row.kind, id: Number(row.runtime_id), ownerAtom: Number(row.owner_atom)}))
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
    const origin = (await sql<Array<{declaration_path: string; owner_atom: number}>>`
      SELECT declaration_path, owner_atom FROM boundary_runtime_origin WHERE kind = ${"topology"} AND runtime_id = ${parent.id}
    `)[0]
    if (!origin) return 0
    const raw = await this.rawFromRow(sql, origin.declaration_path)
    const binding = isRecord(raw) && isRecord(raw.collectionBinding) ? raw.collectionBinding : null
    const value = binding && typeof binding.data === "string"
      ? await this.atomFieldByKey(sql, Number(origin.owner_atom), binding.data)
      : []
    return Array.isArray(value) ? value.length : 0
  }

  private async branchSelected(sql: Database, parent: RuntimeRef, child: JsonRecord): Promise<boolean> {
    if (parent.kind !== "topology") return true
    const topology = (await sql<Array<{kind: string}>>`SELECT kind FROM topology WHERE id = ${parent.id}`)[0]
    if (!topology || topology.kind === "macho") return true
    const origin = (await sql<Array<{declaration_path: string; owner_atom: number}>>`
      SELECT declaration_path, owner_atom FROM boundary_runtime_origin WHERE kind = ${"topology"} AND runtime_id = ${parent.id}
    `)[0]
    if (!origin) return false
    const raw = await this.rawFromRow(sql, origin.declaration_path)
    if (!isRecord(raw)) return false
    const binding = isRecord(raw.predicateBinding) ? raw.predicateBinding : null
    const current = binding && binding.data === "/state"
      ? (await sql<Array<{name: string}>>`
          SELECT state.name AS name
            FROM atom_state JOIN state ON state.id = atom_state.metaState
           WHERE atom_state.atom = ${Number(origin.owner_atom)}
        `)[0]?.name
      : binding && typeof binding.data === "string"
        ? await this.atomFieldByKey(sql, Number(origin.owner_atom), binding.data)
        : undefined
    if (topology.kind === "axion") {
      const selected = binding && typeof binding.expr === "string"
        ? Boolean(new Function("_", `"use strict"; return (${binding.expr})`)([current]))
        : Boolean(current)
      if (child.edgeSlot === "then") return selected
      if (child.edgeSlot === "else") return !selected
      return selected
    }
    if (raw.fuzzyKind === "dynamic-meta") {
      const expression = binding && typeof binding.expr === "string" ? binding.expr : String(current ?? "")
      const selected = expression.replace(/\$\{_\[0\]\}/g, String(current ?? ""))
      return child.kind === "wimp" && child.src === selected
    }
    return true
  }

  private async atomFieldByKey(sql: Database, atom: number, key: string): Promise<unknown> {
    const head = (await sql<Array<{wimp: string}>>`SELECT wimp FROM atom WHERE id = ${atom}`)[0]
    if (!head) return undefined
    for (const row of await sql<Array<{path: string; value_json: string}>>`
      SELECT path, value_json FROM boundary_declaration_entity WHERE src = ${head.wimp} AND section = ${"fields"}
    `) {
      const field = JSON.parse(row.value_json) as unknown
      if (!isRecord(field) || field.key !== key) continue
      const value = (await sql<Array<{value_json: string}>>`
        SELECT value_json FROM boundary_atom_field WHERE atom = ${atom} AND field = ${boundaryEntityId(row.path)}
      `)[0]
      return value ? JSON.parse(value.value_json) as unknown : undefined
    }
    return undefined
  }

  private async removeMatterInstances(sql: Database, path: string, effects: Particle[]): Promise<void> {
    for (const origin of await sql<Array<{kind: "atom" | "topology"; runtime_id: number}>>`
      SELECT kind, runtime_id FROM boundary_runtime_origin WHERE declaration_path = ${path} ORDER BY sequence DESC
    `) {
      const table = origin.kind === "atom" ? "atom" : "topology"
      const exists = (await sql.unsafe<Array<{ok: number}>>(`SELECT 1 AS ok FROM ${table} WHERE id = ?`, [origin.runtime_id]))[0]
      if (!exists) continue
      effects.push(...await this.removeRuntimeBranch(sql, origin.kind, Number(origin.runtime_id)))
    }
  }

  private async removeRuntimeBranch(sql: Database, kind: "atom" | "topology", id: number): Promise<Particle[]> {
    const particles: Particle[] = []
    const visit = async (childKind: "atom" | "topology", childId: number): Promise<void> => {
      for (const row of await sql<Array<{id: number}>>`
        SELECT id FROM atom
        WHERE parent_atom IS ${childKind === "atom" ? childId : null}
          AND parent_topology IS ${childKind === "topology" ? childId : null}
        ORDER BY id
      `) await visit("atom", Number(row.id))
      for (const row of await sql<Array<{id: number}>>`
        SELECT id FROM topology
        WHERE parent_atom IS ${childKind === "atom" ? childId : null}
          AND parent_topology IS ${childKind === "topology" ? childId : null}
        ORDER BY id
      `) await visit("topology", Number(row.id))
      particles.push({part: "graviton", op: "remove", path: `${childKind}/${childId}`})
      await sql`DELETE FROM boundary_runtime_origin WHERE kind = ${childKind} AND runtime_id = ${childId}`
      if (childKind === "atom") await sql`DELETE FROM boundary_atom_field WHERE atom = ${childId}`
    }
    await visit(kind, id)
    if (kind === "atom") await sql`DELETE FROM atom WHERE id = ${id}`
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
        if (part.op === "remove") await tx`DELETE FROM boundary_atom_field WHERE atom = ${part.path} AND field = ${field}`
        else {
          await tx`
            INSERT INTO boundary_atom_field (atom, field, value_json)
            VALUES (${part.path}, ${field}, ${JSON.stringify(value)})
            ON CONFLICT (atom, field) DO UPDATE SET value_json = excluded.value_json
          `
        }
      }
      committed.push(clone(part))
      const changedFieldKeys = new Set<string>()
      const atom = (await tx<Array<{wimp: string}>>`SELECT wimp FROM atom WHERE id = ${part.path}`)[0]
      if (atom) {
        for (const field of await tx<Array<{path: string; value_json: string}>>`
          SELECT path, value_json FROM boundary_declaration_entity
           WHERE src = ${atom.wimp} AND section = ${"fields"}
        `) {
          if (!Object.prototype.hasOwnProperty.call(fields, String(boundaryEntityId(field.path)))) continue
          const value = JSON.parse(field.value_json) as unknown
          if (isRecord(value) && typeof value.key === "string") changedFieldKeys.add(value.key)
        }
      }
      for (const topology of await tx<Array<{runtime_id: number; declaration_path: string}>>`
        SELECT runtime_id, declaration_path FROM boundary_runtime_origin
        WHERE kind = ${"topology"} AND owner_atom = ${part.path}
      `) {
        const raw = await this.rawFromRow(tx, topology.declaration_path)
        if (!isRecord(raw) || raw.kind === "axion") continue
        const binding = raw.kind === "fuzzy" && isRecord(raw.predicateBinding)
          ? raw.predicateBinding
          : raw.kind === "macho" && isRecord(raw.collectionBinding)
            ? raw.collectionBinding
            : null
        if (!binding || typeof binding.data !== "string" || !changedFieldKeys.has(binding.data)) continue
        for (const atom of await tx<Array<{id: number}>>`SELECT id FROM atom WHERE parent_topology = ${topology.runtime_id}`) {
          committed.push(...await this.removeRuntimeBranch(tx, "atom", Number(atom.id)))
        }
        for (const nested of await tx<Array<{id: number}>>`SELECT id FROM topology WHERE parent_topology = ${topology.runtime_id}`) {
          committed.push(...await this.removeRuntimeBranch(tx, "topology", Number(nested.id)))
        }
        committed.push({part: "higgs", op: "replace", path: `topology/${topology.runtime_id}`, value: {fields: clone(fields)}})
        const address = parseInflatonAddress(topology.declaration_path)
        if (!address) continue
        for (const child of await this.matterRows(tx, address.src, address.localId)) {
          committed.push(...await this.materializeMatter(tx, child.address, child.value, committed, {
            kind: "topology", id: Number(topology.runtime_id), ownerAtom: Number(part.path),
          }))
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
    const atomState = (await sql<Array<{metaState: number | null}>>`
      SELECT metaState AS metaState FROM atom_state WHERE atom = ${id}
    `)[0]
    const values: Array<{atom: number; field: number; value: number}> = []
    const records: JsonRecord[] = []
    const items: Array<{value: number; position: number; itemValue: string}> = []
    for (const row of await sql<Array<{id: number; field: number; value_json: string}>>`
      SELECT id, field, value_json FROM boundary_atom_field WHERE atom = ${id} ORDER BY field
    `) {
      const value = JSON.parse(row.value_json) as unknown
      values.push({atom: id, field: Number(row.field), value: Number(row.id)})
      records.push(valueRecord(Number(row.id), value))
      if (Array.isArray(value)) value.forEach((item, position) => items.push({value: Number(row.id), position, itemValue: String(item)}))
    }
    return {
      atom: {
        id,
        parentAtom: atom.parent_atom === null ? null : Number(atom.parent_atom),
        parentTopology: atom.parent_topology === null ? null : Number(atom.parent_topology),
        wimp: atom.wimp,
        position: Number(atom.position),
      },
      values,
      valueRecords: records,
      valueItems: items,
      state: {atom: id, metaState: atomState?.metaState === null || atomState === undefined ? null : Number(atomState.metaState)},
    }
  }

  private async topologyEntity(sql: Database, id: number): Promise<JsonRecord | null> {
    const row = (await sql<Array<{id: number; parent_atom: number | null; parent_topology: number | null; kind: string; position: number}>>`
      SELECT id, parent_atom, parent_topology, kind, position FROM topology WHERE id = ${id}
    `)[0]
    return row ? {
      id,
      parentAtom: row.parent_atom === null ? null : Number(row.parent_atom),
      parentTopology: row.parent_topology === null ? null : Number(row.parent_topology),
      kind: row.kind,
      position: Number(row.position),
    } : null
  }

  private async rootSrc(): Promise<string | null> {
    return (await this.sql<Array<{wimp: string}>>`
      SELECT wimp FROM atom WHERE parent_atom IS NULL AND parent_topology IS NULL ORDER BY id LIMIT 1
    `)[0]?.wimp ?? null
  }

  private async loadIndexes(): Promise<void> {
    for (const row of await this.sql<Array<{kind: "atom" | "topology"; runtime_id: number; declaration_path: string; parent_key: string}>>`
      SELECT kind, runtime_id, declaration_path, parent_key FROM boundary_runtime_origin ORDER BY sequence
    `) this.indexInstance(row.kind, Number(row.runtime_id), row.declaration_path, row.parent_key)
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
      if (effect.op !== "add" && effect.op !== "replace") continue
      const origin = (await this.sql<Array<{declaration_path: string; parent_key: string}>>`
        SELECT declaration_path, parent_key FROM boundary_runtime_origin WHERE kind = ${kind} AND runtime_id = ${id}
      `)[0]
      if (origin) this.indexInstance(kind, id, origin.declaration_path, origin.parent_key)
    }
  }

  private indexInstance(kind: "atom" | "topology", id: number, origin: string, parent: string): void {
    this.unindexInstance(kind, id)
    const key = `${kind}/${id}`
    this.originByInstance.set(key, origin)
    this.parentByInstance.set(key, parent)
    if (parent !== "root") {
      const children = this.childrenByParent.get(parent)
      if (children) children.add(key)
      else this.childrenByParent.set(parent, new Set([key]))
    }
    if (kind === "atom") {
      const ids = this.atomIdsByDeclaration.get(origin)
      if (ids) ids.add(id)
      else this.atomIdsByDeclaration.set(origin, new Set([id]))
    } else {
      const ids = this.instanceIdsByTopology.get(origin)
      if (ids) ids.add(id)
      else this.instanceIdsByTopology.set(origin, new Set([id]))
    }
  }

  private unindexInstance(kind: "atom" | "topology", id: number): void {
    const key = `${kind}/${id}`
    const origin = this.originByInstance.get(key)
    const parent = this.parentByInstance.get(key)
    if (parent) {
      this.childrenByParent.get(parent)?.delete(key)
      if (this.childrenByParent.get(parent)?.size === 0) this.childrenByParent.delete(parent)
    }
    if (origin && kind === "atom") this.atomIdsByDeclaration.get(origin)?.delete(id)
    if (origin && kind === "topology") this.instanceIdsByTopology.get(origin)?.delete(id)
    this.originByInstance.delete(key)
    this.parentByInstance.delete(key)
  }
}
