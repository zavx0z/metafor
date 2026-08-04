import type {ReservedSQL, SQL} from "bun"
import {
  isDeclarationPath,
  type DeclarationPath,
} from "shared/protocol/force/declaration"
import {resolveForceFieldsPayload} from "shared/protocol/force/fields"
import type {ForceMessage} from "shared/protocol/force/message"
import type {Particle} from "shared/protocol/force/particle"
import type {FieldInit, MatterBindingValue, MatterEdgeSlot, MatterParticleKind} from "@metafor/types/metafor/matter"
import {parseMetaAddress} from "@metafor/types/metafor/graph"
import type {MetaFieldDSL, MetaMassDSL} from "@metafor/types/metafor/schema"
import {
  insertFieldDefault,
  insertMatterBinding,
  insertPredicateGroup,
  validateRuntimeMatterBinding,
} from "./wimp/sqlite/create.ts"
import {writeBoundaryAtomValue} from "./world.ts"
import {BoundaryMassStore, type BoundaryMassDetachPlan} from "./mass.ts"
import {MassCatalog} from "../shared/mass.ts"

type Database = SQL | ReservedSQL
type JsonRecord = Record<string, unknown>
type RuntimeRef = {
  kind: "atom" | "topology"
  id: number
  ownerAtom: number
  scopeAtom: number
  occurrenceKey: string
}

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
const sameJson = (left: unknown, right: unknown): boolean =>
  JSON.stringify(left ?? null) === JSON.stringify(right ?? null)
const particleMessage = (particle: Particle): ForceMessage => ({parts: [particle]})
const isRootWimpSource = (src: string): boolean => src.split("/").length === 2
const belongsToWimpRoot = (src: string, root: string): boolean => src === root || src.startsWith(`${root}/`)
const processRestartPaths = new Set<DeclarationPath>([
  "wimp",
  "field",
  "variant",
  "state",
  "transition",
  "condition",
  "process",
  "matter",
])

const identityKey = (path: DeclarationPath, src: string, localId: number): string =>
  `${path}\u0000${src}\u0000${localId}`

const fieldBindingEntries = (expr: string): string[] => {
  const source = expr.trim()
  if (!source.startsWith("{") || !source.endsWith("}")) return []
  const body = source.slice(1, -1)
  const entries: string[] = []
  let start = 0
  let braces = 0
  let brackets = 0
  let parentheses = 0
  let quote: "\"" | "'" | "`" | null = null
  let escaped = false
  for (let index = 0; index < body.length; index++) {
    const character = body[index]!
    if (quote !== null) {
      if (escaped) escaped = false
      else if (character === "\\") escaped = true
      else if (character === quote) quote = null
      continue
    }
    if (character === "\"" || character === "'" || character === "`") {
      quote = character
      continue
    }
    if (character === "{") braces++
    else if (character === "}") braces--
    else if (character === "[") brackets++
    else if (character === "]") brackets--
    else if (character === "(") parentheses++
    else if (character === ")") parentheses--
    else if (character === "," && braces === 0 && brackets === 0 && parentheses === 0) {
      const entry = body.slice(start, index).trim()
      if (entry) entries.push(entry)
      start = index + 1
    }
  }
  const tail = body.slice(start).trim()
  if (tail) entries.push(tail)
  return entries
}

const directFieldBindingSources = (expr: string): Map<string, number> => {
  const result = new Map<string, number>()
  for (const entry of fieldBindingEntries(expr)) {
    const match = /^(?:([A-Za-z_$][\w$]*)|"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)')\s*:\s*_\[(\d+)\]$/.exec(entry)
    if (!match) continue
    const key = match[1] ?? match[2] ?? match[3]
    const dependency = Number(match[4])
    if (key !== undefined && Number.isSafeInteger(dependency)) result.set(key, dependency)
  }
  return result
}

const entangleableFieldType = (type: StoredField["type"]): boolean =>
  type === "string" || type === "number" || type === "boolean"

const deleteUnreferencedValue = async (sql: Database, value: number): Promise<void> => {
  await sql`DELETE FROM value WHERE id = ${value} AND NOT EXISTS (SELECT 1 FROM atom_value WHERE atom_value.value = ${value})`
}

const runtimeKey = (kind: "atom" | "topology", id: number): string => `${kind}/${id}`
const parentKey = (parent: RuntimeRef | null): string => parent ? runtimeKey(parent.kind, parent.id) : "root"

export const parseInflatonAddress = (path: Particle["path"], value?: unknown): InflatonAddress | null => {
  if (!isDeclarationPath(path) || !isRecord(value)) return null
  if (path === "wimp") {
    return typeof value.src === "string" && value.src.trim().length > 0
      ? {path, src: value.src, localId: 0}
      : null
  }
  const localId = Number.isSafeInteger(value.localId)
    ? Number(value.localId)
    : Number.isSafeInteger(value.id) ? Number(value.id) : null
  return typeof value.wimp === "string" && value.wimp.trim().length > 0 &&
      localId !== null && localId > 0
    ? {path, src: value.wimp, localId}
    : null
}

const parseMatterTransferSource = (value: unknown): InflatonAddress | null => {
  if (typeof value !== "string") return null
  const separator = value.lastIndexOf("#")
  if (separator <= 0) return null
  const src = value.slice(0, separator)
  const localId = Number(value.slice(separator + 1))
  return parseMetaAddress(src) !== null && Number.isSafeInteger(localId) && localId > 0
    ? {path: "matter", src, localId}
    : null
}

export const gravitonDeclarationPath = (address: InflatonAddress): DeclarationPath => address.path

const declarationTableByPath = Object.freeze({
  field: "field",
  variant: "field_enum_variant",
  state: "state",
  transition: "transition",
  condition: "condition",
  process: "process",
  reaction: "reaction",
  matter: "matter_particle",
} as const)

type NumericDeclarationPath = keyof typeof declarationTableByPath

const isNumericDeclarationPath = (path: DeclarationPath): path is NumericDeclarationPath =>
  path in declarationTableByPath

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
  energyBinding: number | null
  fuzzyKind: string | null
  predicateBinding: number | null
  collectionBinding: number | null
}

type DefaultResult = {ready: true; exists: boolean; value: unknown} | {ready: false}

/** Boundary owns only normalized relations. Temporary defaults exist solely while an enum waits for its variants. */
export class BoundaryIncrementalStore {
  readonly childrenByParent = new Map<string, Set<string>>()
  readonly atomIdsByDeclaration = new Map<string, Set<number>>()
  readonly instanceIdsByTopology = new Map<string, Set<number>>()
  readonly originByInstance = new Map<string, string>()
  readonly parentByInstance = new Map<string, string>()
  private readonly pendingEnumDefaults = new Map<string, unknown>()
  private massFence: ((request: {atom: number; declaration: number; key: string}) => Promise<void>) | undefined
  private massRelease: ((request: {atom: number; declaration: number; key: string}) => Promise<void>) | undefined

  readonly mass: BoundaryMassStore

  constructor(readonly sql: SQL, catalog = new MassCatalog()) {
    this.mass = new BoundaryMassStore(sql, catalog)
  }

  setMassFence(fence: (request: {atom: number; declaration: number; key: string}) => Promise<void>): void {
    this.massFence = fence
  }

  setMassRelease(release: (request: {atom: number; declaration: number; key: string}) => Promise<void>): void {
    this.massRelease = release
  }

  async init(): Promise<void> {
    await this.mass.init()
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
      -- WIMP MassDeclaration was replaced by the local EnergyMassStore.
      -- The legacy table has no canonical owner and must not survive restart.
      DROP TABLE IF EXISTS wimp_mass_value;
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
        scope_atom INTEGER NOT NULL,
        occurrence_key TEXT NOT NULL DEFAULT '',
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
    const originColumns = await this.sql.unsafe<Array<{name: string}>>(
      "PRAGMA table_info(boundary_runtime_origin)",
    )
    const hasScope = originColumns.some((column) => column.name === "scope_atom")
    const hasOccurrence = originColumns.some((column) => column.name === "occurrence_key")
    if (!hasScope || !hasOccurrence) {
      await this.sql.begin(async (tx) => {
        if (!hasScope) await tx`ALTER TABLE boundary_runtime_origin ADD COLUMN scope_atom INTEGER`
        if (!hasOccurrence) await tx`ALTER TABLE boundary_runtime_origin ADD COLUMN occurrence_key TEXT`
        const origins = await tx<Array<{
          kind: "atom" | "topology"; runtimeId: number; declarationKind: "wimp" | "matter";
          declarationWimp: string; parentKind: "root" | "atom" | "topology";
          parentRuntimeId: number; ownerAtom: number; ordinal: number; topologyKind: string | null
        }>>`
          SELECT origin.kind, origin.runtime_id AS runtimeId,
                 origin.declaration_kind AS declarationKind,
                 origin.declaration_wimp AS declarationWimp,
                 origin.parent_kind AS parentKind,
                 origin.parent_runtime_id AS parentRuntimeId,
                 origin.owner_atom AS ownerAtom, origin.ordinal,
                 topology.kind AS topologyKind
            FROM boundary_runtime_origin AS origin
            LEFT JOIN topology
              ON origin.kind = ${"topology"} AND topology.id = origin.runtime_id
           ORDER BY origin.sequence
        `
        const resolved = new Map<string, {
          kind: "atom" | "topology"; runtimeId: number; declarationWimp: string;
          scopeAtom: number; occurrenceKey: string; topologyKind: string | null
        }>()
        for (const origin of origins) {
          const parent = origin.parentKind === "root"
            ? undefined
            : resolved.get(runtimeKey(origin.parentKind, Number(origin.parentRuntimeId)))
          const sameDeclarationScope = parent?.declarationWimp === origin.declarationWimp
          const scopeAtom = origin.declarationKind === "wimp"
            ? Number(origin.runtimeId)
            : sameDeclarationScope
              ? parent!.scopeAtom
              : parent?.kind === "atom"
                ? parent.runtimeId
                : Number(origin.ownerAtom)
          const occurrenceKey = origin.declarationKind === "wimp" || !sameDeclarationScope
            ? ""
            : parent!.topologyKind === "macho"
              ? `${parent!.occurrenceKey}/${Number(origin.ordinal)}`
              : parent!.occurrenceKey
          await tx`
            UPDATE boundary_runtime_origin
               SET scope_atom = ${scopeAtom}, occurrence_key = ${occurrenceKey}
             WHERE kind = ${origin.kind} AND runtime_id = ${origin.runtimeId}
          `
          resolved.set(runtimeKey(origin.kind, Number(origin.runtimeId)), {
            kind: origin.kind,
            runtimeId: Number(origin.runtimeId),
            declarationWimp: origin.declarationWimp,
            scopeAtom,
            occurrenceKey,
            topologyKind: origin.topologyKind,
          })
        }
      })
    }
    await this.sql.unsafe(`
      CREATE INDEX IF NOT EXISTS boundary_origin_reconcile
        ON boundary_runtime_origin (
          declaration_kind, declaration_wimp, scope_atom,
          declaration_local_id, occurrence_key, kind
        );
    `)
    await this.mass.ensureIndependentMemberships(this.sql)
    await this.loadIndexes()
  }

  /**
   * Rebuilds disposable runtime indexes after an isolated SQL transaction.
   * This is not a materialization or live mutation surface.
   */
  async refreshRuntimeIndexesForOfflineProof(): Promise<void> {
    this.childrenByParent.clear()
    this.atomIdsByDeclaration.clear()
    this.instanceIdsByTopology.clear()
    this.originByInstance.clear()
    this.parentByInstance.clear()
    await this.loadIndexes()
  }

  async apply(message: ForceMessage): Promise<BoundaryIncrementalCommit | null> {
    const part = message.parts[0]
    if (part.part === "higgs") return await this.applyHiggs(part)
    if (part.part !== "inflaton" || part.op === "test") return null
    if (part.op !== "add" && part.op !== "replace" && part.op !== "remove" &&
        part.op !== "move" && part.op !== "copy") {
      throw new Error(`inflaton/${part.op} is not supported by Boundary`)
    }
    if (part.op === "move" || part.op === "copy") {
      return await this.applyDeclarationTransfer(part)
    }
    const address = parseInflatonAddress(part.path, part.value)
    if (!address) throw new Error(`Invalid categorical Inflaton identity: ${String(part.path)}`)
    const activeRootTable = (await this.sql<Array<{count: number}>>`
      SELECT COUNT(*) AS count
        FROM sqlite_master
       WHERE type = ${"table"} AND name = ${"boundary_active_root"}
    `).at(0)?.count ?? 0
    const rootTransition = Number(activeRootTable) === 1
      ? (await this.sql<Array<{activeSrc: string; previousSrc: string | null}>>`
          SELECT active_src AS activeSrc, previous_src AS previousSrc
            FROM boundary_active_root
           WHERE singleton = 1
        `).at(0)
      : undefined
    if (
      rootTransition !== undefined &&
      address.src === rootTransition.previousSrc &&
      part.op !== "remove"
    ) {
      throw new Error(
        `Previous root ${rootTransition.previousSrc} structural role is retired by active root ${rootTransition.activeSrc}`,
      )
    }
    const input = record(part.value, `${address.path} value`)
    let detachPlans: BoundaryMassDetachPlan[] = []
    try { detachPlans = await this.preflightMassDetach(address, part.op, input) }
    catch (error) { throw error }
    const repositoryRemoval = part.op === "remove" && address.path === "wimp" && isRootWimpSource(address.src)
      ? await this.repositoryRemovalEffects(address.src)
      : null

    let effects: Particle[]
    try { effects = await this.sql.begin(async (tx): Promise<Particle[]> => {
      const committed: Particle[] = []
      const supersedeCommittedWimps = async (): Promise<void> => {
        const wimps = new Set<string>()
        for (const effect of committed) {
          if (effect.part !== "graviton" || typeof effect.path !== "string") continue
          const path = effect.path.replace(/^\/+/, "") as DeclarationPath
          if (!processRestartPaths.has(path) || !isRecord(effect.value)) continue
          const src = path === "wimp" ? effect.value.src : effect.value.wimp
          if (typeof src === "string") wimps.add(src)
        }
        for (const src of wimps) {
          await tx`
            UPDATE boundary_process_execution
               SET status = ${"superseded"}
             WHERE status = ${"pending"}
               AND atom IN (SELECT id FROM atom WHERE wimp = ${src})
          `
        }
      }
      if (part.op === "remove") {
        if (repositoryRemoval) {
          const runtime = await this.repositoryRuntimeRefs(tx, address.src)
          const valueIds: Array<{id: number}> = []
          for (const ref of runtime) {
            if (ref.kind === "atom") {
              valueIds.push(...await tx<Array<{id: number}>>`
                SELECT value AS id FROM atom_value WHERE atom = ${ref.runtimeId}
              `)
              await this.retireProcessExecutions(tx, ref.runtimeId)
            }
            await tx`
              DELETE FROM boundary_runtime_origin
               WHERE kind = ${ref.kind} AND runtime_id = ${ref.runtimeId}
            `
          }
          await tx`
            DELETE FROM boundary_runtime_origin
             WHERE declaration_wimp = ${address.src}
                OR substr(declaration_wimp, 1, ${address.src.length + 1}) = ${`${address.src}/`}
          `
          await tx`
            DELETE FROM wimp
             WHERE src = ${address.src}
                OR substr(src, 1, ${address.src.length + 1}) = ${`${address.src}/`}
          `
          for (const value of valueIds) await deleteUnreferencedValue(tx, Number(value.id))
          return repositoryRemoval
        }
        const previous = await this.canonical(tx, address, input)
        await this.removeRuntimeConsequences(tx, address, committed)
        await this.removeDeclaration(tx, address)
        if (previous) {
          committed.push({
            part: "graviton",
            op: "remove",
            path: address.path,
            ts: Date.now(),
            value: previous,
          })
        }
        await supersedeCommittedWimps()
        return committed
      }

      const previous = await this.canonical(tx, address, input)
      const rebindMatterFields = part.op === "replace" && address.path === "matter"

      const restoredEnumDefault = address.path === "variant"
        ? this.pendingEnumDefaults.has(identityKey(
          "field",
          address.src,
          positiveInteger(input.field, "variant.field"),
        ))
        : false
      await this.persist(tx, address, input)
      for (const plan of detachPlans) await this.mass.commitDetachIn(tx, plan)
      await this.mass.ensureIndependentMemberships(tx)
      await this.reconcileMassBindingSources(tx)
      const canonical = await this.canonical(tx, address, input)
      const declarationChanged = !sameJson(previous, canonical)
      if (declarationChanged) {
        committed.push({
          part: "graviton",
          op: part.op,
          path: address.path,
          ts: Date.now(),
          value: canonical,
        })
      }
      if (address.path === "variant" && restoredEnumDefault) {
        const localField = positiveInteger(input.field, "variant.field")
        const key = identityKey("field", address.src, localField)
        if (!this.pendingEnumDefaults.has(key)) {
          const field = await this.canonical(tx, {path: "field", src: address.src, localId: localField}, {})
          if (field) committed.push({
            part: "graviton",
            op: "replace",
            path: "field",
            ts: Date.now(),
            value: field,
          })
        }
      }
      if (declarationChanged) await this.addRuntimeConsequences(tx, address, input, committed)
      await this.mass.ensureIndependentMemberships(tx)
      // Materializing a Matter child can create the membership only after its
      // declaration was persisted.  Reconcile the already-persisted direct
      // relation once those child rows exist; no dependency path or expr is
      // consulted here.
      await this.reconcileMassBindingSources(tx)
      for (const effect of committed) {
        if (effect.part !== "graviton" || effect.op === "remove" || typeof effect.path !== "string") continue
        const match = /^atom\/(\d+)$/.exec(effect.path)
        if (!match) continue
        const entity = await this.atomEntity(tx, Number(match[1]))
        if (entity) effect.value = entity
      }
      if (declarationChanged && rebindMatterFields) {
        await this.rebindMatterFieldValues(tx, address)
        for (const effect of committed) {
          if (effect.part !== "graviton" || typeof effect.path !== "string") continue
          const match = /^atom\/(\d+)$/.exec(effect.path)
          if (!match || effect.op === "remove") continue
          const entity = await this.atomEntity(tx, Number(match[1]))
          if (entity) effect.value = entity
        }
      }
      await supersedeCommittedWimps()
      return committed
    }) } catch (error) {
      for (const plan of detachPlans) {
        await this.mass.catalog.cleanupSafe(plan.nextKey, plan.format)
        await this.massRelease?.({atom: plan.childAtom, declaration: plan.childDeclaration, key: plan.sourceKey})
      }
      throw error
    }

    await this.updateIndexes(effects)
    if (repositoryRemoval) {
      for (const key of [...this.pendingEnumDefaults.keys()]) {
        const src = key.split("\u0000")[1]
        if (src && belongsToWimpRoot(src, address.src)) this.pendingEnumDefaults.delete(key)
      }
    }
    return {rootSrc: await this.rootSrc(), messages: effects.map(particleMessage)}
  }

  private async preflightMassDetach(address: InflatonAddress, op: Particle["op"], input: JsonRecord): Promise<BoundaryMassDetachPlan[]> {
    if (op !== "replace" || address.path !== "matter") return []
    const next = input.massBinding
    const direct = isRecord(next) && isRecord(next.directMass) ? next.directMass : undefined
    const directTargets = direct && direct.kind === "keys" && Array.isArray(direct.entries)
      ? new Set(direct.entries.filter(isRecord).map((entry) => entry.target).filter((key): key is string => typeof key === "string"))
      : undefined
    const stale = await this.sql<Array<{atom: number; declaration: number; key: string; childKey: string}>>`
      SELECT source.child_atom AS atom, source.child_declaration AS declaration, membership.key
             , declaration.local_key AS childKey
        FROM mass_key_source AS source
        JOIN boundary_runtime_origin AS origin
          ON origin.kind = ${"atom"} AND origin.runtime_id = source.child_atom
        JOIN mass_membership AS membership
          ON membership.atom = source.child_atom AND membership.declaration = source.child_declaration
        JOIN mass_declaration AS declaration ON declaration.id = source.child_declaration
       WHERE origin.declaration_kind = ${"matter"}
         AND origin.declaration_wimp = ${address.src}
         AND origin.declaration_local_id = ${address.localId}
    `
    const plans: BoundaryMassDetachPlan[] = []
    const fenced: Array<{atom: number; declaration: number; key: string}> = []
    try { for (const request of stale) {
      if (direct && (direct.kind === "whole" || directTargets?.has(request.childKey))) continue
      const identity = {atom: Number(request.atom), declaration: Number(request.declaration), key: request.key}
      await this.massFence?.(identity)
      fenced.push(identity)
      const plan = await this.mass.prepareDetach(this.sql, Number(request.atom), Number(request.declaration))
      plans.push(plan)
      await this.mass.catalog.copy(plan.sourceKey, plan.nextKey, plan.format)
    } } catch (error) {
      for (const plan of plans) {
        await this.mass.catalog.cleanupSafe(plan.nextKey, plan.format)
      }
      for (const identity of fenced) await this.massRelease?.(identity)
      throw error
    }
    return plans
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
      append("field", {
        ...row,
        required: row.required === 1,
        ...(defaultValue.ready && defaultValue.exists ? {default: defaultValue.value} : {}),
      })
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

  private async repositoryRemovalEffects(root: string): Promise<Particle[]> {
    const runtimePaths = new Set((await this.repositoryRuntimeRefs(this.sql, root))
      .map((row) => `${row.kind}/${row.runtimeId}`))
    const sourceOf = (part: Particle): string | null => {
      if (!isRecord(part.value)) return null
      if (part.path === "wimp") return typeof part.value.src === "string" ? part.value.src : null
      return typeof part.value.wimp === "string" ? part.value.wimp : null
    }
    const scoped = (await this.replay())
      .map((message) => message.parts[0])
      .filter((part) =>
        (typeof part.path === "string" && runtimePaths.has(part.path)) ||
        (sourceOf(part) !== null && belongsToWimpRoot(sourceOf(part)!, root)),
      )
    return scoped.toReversed().map((part) => ({
      ...clone(part),
      op: "remove",
      ts: Date.now(),
    }))
  }

  private async repositoryRuntimeRefs(
    sql: Database,
    root: string,
  ): Promise<Array<{kind: "atom" | "topology"; runtimeId: number}>> {
    const rows = await sql<Array<{kind: "atom" | "topology"; runtimeId: number}>>`
      WITH RECURSIVE runtime(kind, runtime_id) AS (
        SELECT ${"atom"}, atom.id
          FROM atom
         WHERE atom.wimp = ${root}
            OR substr(atom.wimp, 1, ${root.length + 1}) = ${`${root}/`}
        UNION
        SELECT ${"atom"}, child.id
          FROM runtime AS parent
          JOIN atom AS child
            ON (parent.kind = ${"atom"} AND child.parent_atom = parent.runtime_id)
            OR (parent.kind = ${"topology"} AND child.parent_topology = parent.runtime_id)
        UNION
        SELECT ${"topology"}, child.id
          FROM runtime AS parent
          JOIN topology AS child
            ON (parent.kind = ${"atom"} AND child.parent_atom = parent.runtime_id)
            OR (parent.kind = ${"topology"} AND child.parent_topology = parent.runtime_id)
      )
      SELECT runtime.kind, runtime.runtime_id AS runtimeId
        FROM runtime
        LEFT JOIN boundary_runtime_origin AS origin
          ON origin.kind = runtime.kind AND origin.runtime_id = runtime.runtime_id
       ORDER BY origin.sequence
    `
    return rows.map((row) => ({kind: row.kind, runtimeId: Number(row.runtimeId)}))
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
      const reconcileScopes = new Map<string, {wimp: string; scopeAtom: number}>()
      const currentState = (await tx<Array<{name: string}>>`
        SELECT state.name FROM atom_state JOIN state ON state.id = atom_state.metaState
         WHERE atom_state.atom = ${atomId}
      `)[0]?.name ?? null

      for (const topology of await tx<Array<{
        runtimeId: number; wimp: string; localId: number; scopeAtom: number; occurrenceKey: string
      }>>`
        SELECT origin.runtime_id AS runtimeId, origin.declaration_wimp AS wimp,
               origin.declaration_local_id AS localId, origin.scope_atom AS scopeAtom,
               origin.occurrence_key AS occurrenceKey
          FROM boundary_runtime_origin AS origin
          JOIN topology ON topology.id = origin.runtime_id
         WHERE origin.kind = ${"topology"} AND origin.owner_atom = ${atomId}
           AND topology.kind = ${"axion"}
         ORDER BY origin.sequence
      `) {
        const controller = await this.matter(tx, topology.wimp, Number(topology.localId))
        if (!controller) continue
        const parent: RuntimeRef = {
          kind: "topology",
          id: Number(topology.runtimeId),
          ownerAtom: atomId,
          scopeAtom: Number(topology.scopeAtom),
          occurrenceKey: topology.occurrenceKey,
        }
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

        committed.push({
          part: "higgs",
          op: "replace",
          path: `topology/${parent.id}`,
          ts: Date.now(),
          value: {state: currentState},
        })
        reconcileScopes.set(`${controller.wimp}\0${parent.scopeAtom}`, {
          wimp: controller.wimp,
          scopeAtom: parent.scopeAtom,
        })
      }
      for (const scope of reconcileScopes.values()) {
        await this.reconcileMatterScope(tx, scope.wimp, scope.scopeAtom, committed)
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

  private async declarationAddressByRowId(
    sql: Database,
    path: NumericDeclarationPath,
    id: number,
  ): Promise<InflatonAddress> {
    const table = declarationTableByPath[path]
    const row = (await sql.unsafe<Array<{wimp: string; localId: number}>>(
      `SELECT wimp, local_id AS localId FROM ${table} WHERE id = ? LIMIT 1`,
      [id],
    ))[0]
    if (!row || !Number.isSafeInteger(Number(row.localId)) || Number(row.localId) <= 0) {
      throw new Error(`Boundary ${path} source row ${id} is absent or has no canonical local_id`)
    }
    return {path, src: row.wimp, localId: Number(row.localId)}
  }

  private async declarationRowId(
    sql: Database,
    address: InflatonAddress,
  ): Promise<number> {
    if (!isNumericDeclarationPath(address.path)) {
      throw new Error(`Boundary ${address.path} has no persisted numeric row`)
    }
    const table = declarationTableByPath[address.path]
    const row = (await sql.unsafe<Array<{id: number}>>(
      `SELECT id FROM ${table} WHERE wimp = ? AND local_id = ? LIMIT 1`,
      [address.src, address.localId],
    ))[0]
    if (!row || !Number.isSafeInteger(Number(row.id)) || Number(row.id) <= 0) {
      throw new Error(`Boundary ${address.path} source ${address.src}#${address.localId} is absent`)
    }
    return Number(row.id)
  }

  private async fieldLocalIdByRowId(sql: Database, id: number): Promise<number> {
    const row = (await sql<Array<{localId: number}>>`
      SELECT local_id AS localId FROM field WHERE id = ${id} LIMIT 1
    `)[0]
    if (!row || !Number.isSafeInteger(Number(row.localId)) || Number(row.localId) <= 0) {
      throw new Error(`Boundary Field row ${id} has no canonical local_id`)
    }
    return Number(row.localId)
  }

  private async cloneFieldDefault(sql: Database, source: number, target: number): Promise<void> {
    const exists = (await sql<Array<{ok: number}>>`
      SELECT 1 AS ok FROM field_default WHERE field = ${source} LIMIT 1
    `)[0]
    if (!exists) return
    await sql`INSERT INTO field_default (field) VALUES (${target})`
    await sql`
      INSERT INTO field_string_default (field, default_value)
      SELECT ${target}, default_value FROM field_string_default WHERE field = ${source}
    `
    await sql`
      INSERT INTO field_number_default (field, default_value)
      SELECT ${target}, default_value FROM field_number_default WHERE field = ${source}
    `
    await sql`
      INSERT INTO field_boolean_default (field, default_value)
      SELECT ${target}, default_value FROM field_boolean_default WHERE field = ${source}
    `
    await sql`
      INSERT INTO field_array_default_item (field, position, item_value)
      SELECT ${target}, position, item_value FROM field_array_default_item WHERE field = ${source}
    `
    await sql`
      INSERT INTO field_enum_default (field, variant)
      SELECT ${target}, variant FROM field_enum_default WHERE field = ${source}
    `
  }

  private async writeCanonicalFieldDefault(
    sql: Database,
    field: number,
    type: StoredField["type"],
    value: unknown,
  ): Promise<void> {
    await sql`DELETE FROM field_default WHERE field = ${field}`
    if (value === undefined) return
    await sql`INSERT INTO field_default (field) VALUES (${field})`
    if (type === "string") {
      await sql`INSERT INTO field_string_default (field, default_value) VALUES (${field}, ${String(value)})`
    } else if (type === "number") {
      if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("field.default must be a finite number")
      await sql`INSERT INTO field_number_default (field, default_value) VALUES (${field}, ${value})`
    } else if (type === "boolean") {
      if (typeof value !== "boolean") throw new Error("field.default must be a boolean")
      await sql`INSERT INTO field_boolean_default (field, default_value) VALUES (${field}, ${value ? 1 : 0})`
    } else if (type === "array") {
      if (!Array.isArray(value)) throw new Error("field.default must be an array")
      for (let position = 0; position < value.length; position++) {
        await sql`
          INSERT INTO field_array_default_item (field, position, item_value)
          VALUES (${field}, ${position}, ${String(value[position])})
        `
      }
    } else {
      const descriptor = record(value, "field.default")
      const variant = positiveInteger(descriptor.variant, "field.default.variant")
      await sql`INSERT INTO field_enum_default (field, variant) VALUES (${field}, ${variant})`
    }
  }

  private async cloneConditionPredicates(sql: Database, source: number, target: number): Promise<void> {
    for (const row of await sql<Array<{
      id: number; predicateOrder: number; subjectKind: string; operator: string; valueKind: string;
      valueBoolean: number | null; valueNumber: number | null; valueText: string | null;
      valueVariant: number | null; valueJson: string | null;
    }>>`
      SELECT id, predicate_order AS predicateOrder, subject_kind AS subjectKind,
             operator, value_kind AS valueKind, value_boolean AS valueBoolean,
             value_number AS valueNumber, value_text AS valueText,
             value_variant AS valueVariant, value_json AS valueJson
        FROM condition_predicate WHERE condition = ${source} ORDER BY predicate_order
    `) {
      const predicate = await insertedId(sql<Array<{id: number}>>`
        INSERT INTO condition_predicate (
          condition, predicate_order, subject_kind, operator, value_kind,
          value_boolean, value_number, value_text, value_variant, value_json
        ) VALUES (
          ${target}, ${row.predicateOrder}, ${row.subjectKind}, ${row.operator}, ${row.valueKind},
          ${row.valueBoolean}, ${row.valueNumber}, ${row.valueText}, ${row.valueVariant}, ${row.valueJson}
        ) RETURNING id
      `, "Condition predicate")
      await sql`
        INSERT INTO condition_list_item (
          predicate, item_order, value_kind, value_boolean, value_number, value_text, value_variant
        )
        SELECT ${predicate}, item_order, value_kind, value_boolean, value_number, value_text, value_variant
          FROM condition_list_item WHERE predicate = ${row.id}
      `
    }
  }

  private processFieldIds(value: unknown, label: string): number[] {
    if (value === undefined || value === null) return []
    if (!Array.isArray(value)) throw new Error(`${label} must be an array`)
    return value.map((entry, index) => positiveInteger(
      Array.isArray(entry) ? entry[0] : entry,
      `${label}[${index}]`,
    ))
  }

  private async writeRelationalProcess(
    sql: Database,
    id: number,
    descriptorValue: unknown,
  ): Promise<void> {
    const descriptor = record(descriptorValue, "process.descriptor")
    const type = requiredString(descriptor.type, "process.type")
    if (type !== "action" && type !== "finally") throw new Error(`Unsupported process type ${type}`)
    await sql`DELETE FROM process_env WHERE process = ${id}`
    await sql`DELETE FROM process_action WHERE process = ${id}`
    await sql`DELETE FROM process_finally WHERE process = ${id}`
    for (const env of Array.isArray(descriptor.env) ? descriptor.env : []) {
      await sql`INSERT INTO process_env (process, env) VALUES (${id}, ${requiredString(env, "process.env")})`
    }
    if (type === "finally") {
      const before = record(descriptor.before, "process.before")
      await sql`INSERT INTO process_finally (process, before) VALUES (${id}, ${requiredString(before.src, "process.before.src")})`
      for (const field of this.processFieldIds(before.readFields ?? before.read, "process.before.read")) {
        await sql`INSERT INTO process_finally_read (process, field) VALUES (${id}, ${field})`
      }
      return
    }
    const action = record(descriptor.action, "process.action")
    const success = isRecord(descriptor.success) ? descriptor.success : null
    const error = isRecord(descriptor.error) ? descriptor.error : null
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
    for (const field of this.processFieldIds(action.readFields ?? action.read, "process.action.read")) {
      await sql`INSERT INTO process_action_read (process, field, phase) VALUES (${id}, ${field}, ${"action"})`
    }
    for (const [phase, handler] of [["success", success], ["error", error]] as const) {
      if (!handler) continue
      for (const field of this.processFieldIds(handler.readFields ?? handler.read, `process.${phase}.read`)) {
        await sql`INSERT INTO process_action_read (process, field, phase) VALUES (${id}, ${field}, ${phase})`
      }
      for (const field of this.processFieldIds(handler.writeFields ?? handler.write, `process.${phase}.write`)) {
        await sql`INSERT INTO process_action_write (process, field, phase) VALUES (${id}, ${field}, ${phase})`
      }
    }
  }

  private async persistNumericDeclarationTransfer(
    sql: Database,
    op: "move" | "copy",
    source: InflatonAddress,
    sourceId: number,
    sourceValue: JsonRecord,
    target: InflatonAddress,
    targetInput: JsonRecord,
  ): Promise<number> {
    if (!isNumericDeclarationPath(source.path) || source.path !== target.path) {
      throw new Error("Boundary declaration transfer table is inconsistent")
    }
    const merged: JsonRecord = {...sourceValue, ...targetInput, wimp: target.src, localId: target.localId}
    const copy = op === "copy"

    if (source.path === "field") {
      const type = requiredString(merged.type, "field.type") as StoredField["type"]
      if (type !== "string" && type !== "number" && type !== "boolean" && type !== "array" && type !== "enum") {
        throw new Error(`Unsupported field type ${type}`)
      }
      const id = copy
        ? await insertedId(sql<Array<{id: number}>>`
            INSERT INTO field (wimp, local_id, key, type, required, label)
            VALUES (
              ${target.src}, ${target.localId}, ${requiredString(merged.key, "field.key")}, ${type},
              ${merged.required === true ? 1 : 0}, ${nullableString(merged.label, "field.label")}
            ) RETURNING id
          `, "Field copy")
        : sourceId
      if (!copy) await sql`
        UPDATE field SET wimp = ${target.src}, local_id = ${target.localId},
          key = ${requiredString(merged.key, "field.key")}, type = ${type},
          required = ${merged.required === true ? 1 : 0}, label = ${nullableString(merged.label, "field.label")}
        WHERE id = ${sourceId}
      `
      if (copy && !Object.hasOwn(targetInput, "default")) await this.cloneFieldDefault(sql, sourceId, id)
      else if (Object.hasOwn(targetInput, "default")) {
        await this.writeCanonicalFieldDefault(sql, id, type, targetInput.default)
      }
      return id
    }

    if (source.path === "variant") {
      const field = positiveInteger(merged.field, "variant.field")
      const position = nonNegativeInteger(merged.position, "variant.position")
      const itemValue = requiredString(merged.itemValue ?? merged.value, "variant.itemValue")
      if (copy) return await insertedId(sql<Array<{id: number}>>`
        INSERT INTO field_enum_variant (wimp, local_id, field, position, item_value)
        VALUES (${target.src}, ${target.localId}, ${field}, ${position}, ${itemValue}) RETURNING id
      `, "Variant copy")
      await sql`
        UPDATE field_enum_variant SET wimp = ${target.src}, local_id = ${target.localId},
          field = ${field}, position = ${position}, item_value = ${itemValue}
        WHERE id = ${sourceId}
      `
      return sourceId
    }

    if (source.path === "state") {
      const name = requiredString(merged.name, "state.name")
      const position = nonNegativeInteger(merged.position, "state.position")
      if (copy) return await insertedId(sql<Array<{id: number}>>`
        INSERT INTO state (wimp, local_id, name, position)
        VALUES (${target.src}, ${target.localId}, ${name}, ${position}) RETURNING id
      `, "State copy")
      await sql`
        UPDATE state SET wimp = ${target.src}, local_id = ${target.localId},
          name = ${name}, position = ${position} WHERE id = ${sourceId}
      `
      return sourceId
    }

    if (source.path === "transition") {
      const from = positiveInteger(merged.fromState ?? merged.from, "transition.fromState")
      const to = positiveInteger(merged.toState ?? merged.to, "transition.toState")
      const position = nonNegativeInteger(merged.position, "transition.position")
      if (copy) return await insertedId(sql<Array<{id: number}>>`
        INSERT INTO transition (wimp, local_id, from_state, to_state, position)
        VALUES (${target.src}, ${target.localId}, ${from}, ${to}, ${position}) RETURNING id
      `, "Transition copy")
      await sql`
        UPDATE transition SET wimp = ${target.src}, local_id = ${target.localId},
          from_state = ${from}, to_state = ${to}, position = ${position} WHERE id = ${sourceId}
      `
      return sourceId
    }

    if (source.path === "condition") {
      const transition = positiveInteger(merged.transition, "condition.transition")
      const field = positiveInteger(merged.field, "condition.field")
      const position = nonNegativeInteger(merged.position, "condition.position")
      const id = copy
        ? await insertedId(sql<Array<{id: number}>>`
            INSERT INTO condition (wimp, local_id, transition, field, position)
            VALUES (${target.src}, ${target.localId}, ${transition}, ${field}, ${position}) RETURNING id
          `, "Condition copy")
        : sourceId
      if (!copy) await sql`
        UPDATE condition SET wimp = ${target.src}, local_id = ${target.localId},
          transition = ${transition}, field = ${field}, position = ${position} WHERE id = ${sourceId}
      `
      if (copy && !Object.hasOwn(targetInput, "predicate")) await this.cloneConditionPredicates(sql, sourceId, id)
      else if (Object.hasOwn(targetInput, "predicate")) {
        await sql`DELETE FROM condition_predicate WHERE condition = ${id}`
        await insertPredicateGroup(sql, id, targetInput.predicate, field)
      }
      return id
    }

    if (source.path === "process") {
      const sourceDescriptor = record(sourceValue.descriptor, "process.descriptor")
      const targetDescriptor = isRecord(targetInput.descriptor)
        ? targetInput.descriptor
        : Object.hasOwn(targetInput, "type") ? targetInput : {}
      const descriptor = {...sourceDescriptor, ...targetDescriptor}
      const type = requiredString(descriptor.type, "process.type")
      if (type !== "action" && type !== "finally") throw new Error(`Unsupported process type ${type}`)
      const key = requiredString(descriptor.key, "process.key")
      const id = copy
        ? await insertedId(sql<Array<{id: number}>>`
            INSERT INTO process (wimp, local_id, key, type, label, desc)
            VALUES (
              ${target.src}, ${target.localId}, ${key}, ${type},
              ${nullableString(descriptor.label, "process.label")},
              ${nullableString(descriptor.desc, "process.desc")}
            ) RETURNING id
          `, "Process copy")
        : sourceId
      if (!copy) await sql`
        UPDATE process SET wimp = ${target.src}, local_id = ${target.localId},
          key = ${key}, type = ${type}, label = ${nullableString(descriptor.label, "process.label")},
          desc = ${nullableString(descriptor.desc, "process.desc")} WHERE id = ${sourceId}
      `
      await this.writeRelationalProcess(sql, id, descriptor)
      return id
    }

    if (source.path === "reaction") {
      const key = requiredString(merged.key, "reaction.key")
      const label = requiredString(merged.label, "reaction.label")
      const desc = nullableString(merged.desc, "reaction.desc")
      const cond = requiredString(merged.cond, "reaction.cond")
      const update = requiredString(merged.src, "reaction.src")
      const id = copy
        ? await insertedId(sql<Array<{id: number}>>`
            INSERT INTO reaction (wimp, local_id, key, label, desc, cond_source, update_source)
            VALUES (${target.src}, ${target.localId}, ${key}, ${label}, ${desc}, ${cond}, ${update}) RETURNING id
          `, "Reaction copy")
        : sourceId
      if (!copy) await sql`
        UPDATE reaction SET wimp = ${target.src}, local_id = ${target.localId},
          key = ${key}, label = ${label}, desc = ${desc}, cond_source = ${cond}, update_source = ${update}
        WHERE id = ${sourceId}
      `
      await sql`DELETE FROM reaction_read WHERE reaction = ${id}`
      await sql`DELETE FROM reaction_write WHERE reaction = ${id}`
      await sql`DELETE FROM reaction_state WHERE reaction = ${id}`
      for (const field of this.processFieldIds(merged.read, "reaction.read")) {
        await sql`INSERT INTO reaction_read (reaction, field) VALUES (${id}, ${field})`
      }
      for (const field of this.processFieldIds(merged.write, "reaction.write")) {
        await sql`INSERT INTO reaction_write (reaction, field) VALUES (${id}, ${field})`
      }
      for (const state of this.processFieldIds(merged.states, "reaction.states")) {
        await sql`INSERT INTO reaction_state (reaction, state) VALUES (${id}, ${state})`
      }
      return id
    }

    const particleKind = requiredString(merged.particleKind ?? merged.kind, "matter.particleKind") as MatterParticleKind
    if (particleKind !== "wimp" && particleKind !== "fuzzy" && particleKind !== "axion" && particleKind !== "macho") {
      throw new Error(`Unsupported Matter kind ${particleKind}`)
    }
    const parent = Object.hasOwn(targetInput, "parentParticle")
      ? targetInput.parentParticle === null ? null : positiveInteger(targetInput.parentParticle, "matter.parentParticle")
      : Object.hasOwn(targetInput, "parent")
        ? targetInput.parent === null ? null : await matterId(sql, target.src, positiveInteger(targetInput.parent, "matter.parent"))
        : sourceValue.parentParticle === null ? null : positiveInteger(sourceValue.parentParticle, "matter.parentParticle")
    const edgeSlot = requiredString(merged.edgeSlot, "matter.edgeSlot") as MatterEdgeSlot
    const position = nonNegativeInteger(merged.particleOrder ?? merged.position, "matter.particleOrder")
    const oldBindings = copy ? [] : await this.matterBindingIds(sql, sourceId)
    const id = copy
      ? await insertedId(sql<Array<{id: number}>>`
          INSERT INTO matter_particle (wimp, local_id, parent_particle, particle_kind, edge_slot, particle_order)
          VALUES (${target.src}, ${target.localId}, ${parent}, ${particleKind}, ${edgeSlot}, ${position}) RETURNING id
        `, "Matter copy")
      : sourceId
    if (!copy) {
      await this.assertMatterParentIsAcyclic(sql, target, id, parent)
      await sql`DELETE FROM matter_particle_wimp WHERE particle = ${id}`
      await sql`DELETE FROM matter_particle_fuzzy WHERE particle = ${id}`
      await sql`DELETE FROM matter_particle_axion WHERE particle = ${id}`
      await sql`DELETE FROM matter_particle_macho WHERE particle = ${id}`
      await sql`
        UPDATE matter_particle SET wimp = ${target.src}, local_id = ${target.localId},
          parent_particle = ${parent}, particle_kind = ${particleKind}, edge_slot = ${edgeSlot},
          particle_order = ${position} WHERE id = ${id}
      `
      for (const binding of oldBindings) await sql`DELETE FROM matter_binding WHERE id = ${binding}`
    }
    if (particleKind === "wimp") {
      validateRuntimeMatterBinding(merged.massBinding, "mass", "matter.massBinding")
      validateRuntimeMatterBinding(merged.energyBinding, "energy", "matter.energyBinding")
      await sql`
        INSERT INTO matter_particle_wimp (particle, src, fields_binding, mass_binding, energy_binding)
        VALUES (
          ${id}, ${requiredString(merged.src, "matter.src")},
          ${await storeBinding(sql, target.src, merged.fieldsBinding)},
          ${await storeBinding(sql, target.src, merged.massBinding)},
          ${await storeBinding(sql, target.src, merged.energyBinding)}
        )
      `
    } else if (particleKind === "fuzzy") {
      const binding = await storeBinding(sql, target.src, merged.predicateBinding)
      if (binding === null) throw new Error("Fuzzy predicateBinding is required")
      await sql`
        INSERT INTO matter_particle_fuzzy (particle, fuzzy_kind, predicate_binding)
        VALUES (${id}, ${requiredString(merged.fuzzyKind, "matter.fuzzyKind")}, ${binding})
      `
    } else if (particleKind === "axion") {
      const binding = await storeBinding(sql, target.src, merged.predicateBinding)
      if (binding === null) throw new Error("Axion predicateBinding is required")
      await sql`INSERT INTO matter_particle_axion (particle, predicate_binding) VALUES (${id}, ${binding})`
    } else {
      const binding = await storeBinding(sql, target.src, merged.collectionBinding)
      if (binding === null) throw new Error("Macho collectionBinding is required")
      await sql`INSERT INTO matter_particle_macho (particle, collection_binding) VALUES (${id}, ${binding})`
    }
    return id
  }

  private async applyWimpTransfer(
    sql: Database,
    op: "move" | "copy",
    source: InflatonAddress,
    target: InflatonAddress,
    targetInput: JsonRecord,
  ): Promise<Particle[]> {
    const sourceRow = (await sql<Array<{
      src: string; name: string | null; desc: string | null; viewCss: string | null
    }>>`
      SELECT src, name, desc, view_css AS viewCss FROM wimp WHERE src = ${source.src} LIMIT 1
    `)[0]
    if (!sourceRow) throw new Error(`Boundary WIMP source ${source.src} is absent`)
    const occupied = (await sql<Array<{ok: number}>>`
      SELECT 1 AS ok FROM wimp WHERE src = ${target.src} LIMIT 1
    `)[0]
    if (occupied) throw new Error(`Boundary WIMP target ${target.src} already exists`)
    const name = Object.hasOwn(targetInput, "name")
      ? nullableString(targetInput.name, "wimp.name")
      : sourceRow.name
    const desc = Object.hasOwn(targetInput, "desc")
      ? nullableString(targetInput.desc, "wimp.desc")
      : sourceRow.desc
    await sql`
      INSERT INTO wimp (src, name, desc, view_css)
      VALUES (${target.src}, ${name}, ${desc}, ${sourceRow.viewCss})
    `
    const effects: Particle[] = []
    if (op === "copy") {
      const declarations = Array.isArray(targetInput.mass)
        ? targetInput.mass
        : await this.mass.declarations(source.src, sql)
      await this.mass.synchronizeDeclarations(sql, target.src, declarations as MetaMassDSL[])
      const canonical = await this.canonical(sql, target, targetInput)
      effects.push({
        part: "graviton", op, path: "wimp", from: source.src,
        ts: Date.now(), value: canonical,
      })
      await this.addRuntimeConsequences(sql, target, targetInput, effects)
      return effects
    }

    for (const table of [
      "field", "field_enum_variant", "state", "transition", "condition",
      "process", "reaction", "matter_binding", "matter_particle", "atom",
    ] as const) {
      await sql.unsafe(`UPDATE ${table} SET wimp = ? WHERE wimp = ?`, [target.src, source.src])
    }
    await sql`UPDATE mass_declaration SET wimp = ${target.src} WHERE wimp = ${source.src}`
    await sql`
      UPDATE boundary_runtime_origin SET declaration_wimp = ${target.src}
       WHERE declaration_wimp = ${source.src}
    `
    await sql`UPDATE matter_particle_wimp SET src = ${target.src} WHERE src = ${source.src}`
    const hasActiveRoot = Number((await sql<Array<{count: number}>>`
      SELECT COUNT(*) AS count FROM sqlite_master
       WHERE type = ${"table"} AND name = ${"boundary_active_root"}
    `)[0]?.count ?? 0) > 0
    if (hasActiveRoot) {
      await sql`
        UPDATE boundary_active_root
           SET active_src = CASE WHEN active_src = ${source.src} THEN ${target.src} ELSE active_src END,
               previous_src = CASE WHEN previous_src = ${source.src} THEN ${target.src} ELSE previous_src END
         WHERE active_src = ${source.src} OR previous_src = ${source.src}
      `
    }
    await sql`DELETE FROM wimp WHERE src = ${source.src}`
    if (Array.isArray(targetInput.mass)) {
      await this.mass.synchronizeDeclarations(sql, target.src, targetInput.mass as MetaMassDSL[])
    }
    const canonical = await this.canonical(sql, target, targetInput)
    effects.push({
      part: "graviton", op, path: "wimp", from: source.src,
      ts: Date.now(), value: canonical,
    })
    for (const atom of await sql<Array<{id: number}>>`
      SELECT id FROM atom WHERE wimp = ${target.src} ORDER BY id
    `) {
      const entity = await this.atomEntity(sql, Number(atom.id))
      if (entity) effects.push({
        part: "graviton", op: "replace", path: `atom/${Number(atom.id)}`,
        ts: Date.now(), value: entity,
      })
    }
    return effects
  }

  private async prepareCanonicalMatterMove(
    sql: Database,
    source: InflatonAddress,
    target: InflatonAddress,
    sourceValue: JsonRecord,
    targetInput: JsonRecord,
  ): Promise<Array<{runtimeAtom: number; targetAtom: number}>> {
    if (
      source.path !== "matter" || target.path !== "matter" ||
      sourceValue.kind !== "wimp" || (targetInput.kind ?? targetInput.particleKind) !== "wimp" ||
      sourceValue.parent !== null || targetInput.parent !== null ||
      sourceValue.fieldsBinding !== undefined || sourceValue.massBinding !== undefined ||
      sourceValue.energyBinding !== undefined || targetInput.fieldsBinding !== undefined ||
      targetInput.massBinding !== undefined || targetInput.energyBinding !== undefined
    ) {
      throw new Error("Boundary canonical Matter move supports one inert root WIMP occurrence")
    }
    const origins = await sql<Array<{runtimeAtom: number; scopeAtom: number}>>`
      SELECT runtime_id AS runtimeAtom, scope_atom AS scopeAtom
        FROM boundary_runtime_origin
       WHERE kind = ${"atom"} AND declaration_kind = ${"matter"}
         AND declaration_wimp = ${source.src} AND declaration_local_id = ${source.localId}
       ORDER BY sequence
    `
    const result: Array<{runtimeAtom: number; targetAtom: number}> = []
    const usedTargets = new Set<number>()
    for (const origin of origins) {
      const candidates = await sql<Array<{targetAtom: number}>>`
        SELECT target.id AS targetAtom
          FROM atom AS target
          JOIN boundary_runtime_origin AS target_origin
            ON target_origin.kind = ${"atom"} AND target_origin.runtime_id = target.id
         WHERE target.wimp = ${target.src}
           AND target_origin.scope_atom = ${origin.scopeAtom}
         ORDER BY target_origin.sequence
      `
      if (candidates.length !== 1) {
        throw new Error(
          `Boundary Matter move ${source.src}#${source.localId} has no unique runtime target in ${target.src}`,
        )
      }
      const runtimeAtom = Number(origin.runtimeAtom)
      const targetAtom = Number(candidates[0]!.targetAtom)
      if (usedTargets.has(targetAtom) || await this.runtimeAtomContains(sql, runtimeAtom, targetAtom)) {
        throw new Error(`Boundary Matter move ${source.src}#${source.localId} has an ambiguous or cyclic runtime target`)
      }
      usedTargets.add(targetAtom)
      result.push({runtimeAtom, targetAtom})
    }
    return result
  }

  private async runtimeAtomContains(sql: Database, ancestor: number, target: number): Promise<boolean> {
    const found = (await sql<Array<{found: number}>>`
      WITH RECURSIVE ancestors(kind, runtime_id) AS (
        SELECT ${"atom"} AS kind, ${target} AS runtime_id
        UNION ALL
        SELECT origin.parent_kind, origin.parent_runtime_id
          FROM boundary_runtime_origin AS origin
          JOIN ancestors
            ON origin.kind = ancestors.kind AND origin.runtime_id = ancestors.runtime_id
         WHERE origin.parent_kind <> ${"root"}
      )
      SELECT 1 AS found FROM ancestors
       WHERE kind = ${"atom"} AND runtime_id = ${ancestor}
       LIMIT 1
    `)[0]
    return found !== undefined
  }

  private async applyDeclarationTransfer(part: Particle): Promise<BoundaryIncrementalCommit> {
    if ((part.op !== "move" && part.op !== "copy") || !isDeclarationPath(part.path)) {
      throw new Error("Boundary declaration transfer requires categorical move/copy")
    }
    const op: "move" | "copy" = part.op
    const path: DeclarationPath = part.path
    if (path === "bulk") {
      throw new Error("Boundary bulk/view_css is excluded from Bulk Store declaration transfer")
    }
    const input = record(part.value, `${path} transfer value`)
    const target = parseInflatonAddress(path, input)
    if (!target) throw new Error(`Invalid categorical Inflaton target identity: ${path}`)

    let source: InflatonAddress
    let sourceId: string | number
    let canonicalMatterMove = false
    if (path === "wimp") {
      sourceId = requiredString(part.from, "wimp transfer from")
      source = {path: "wimp", src: sourceId, localId: 0}
    } else if (path === "matter" && part.op === "move" && typeof part.from === "string") {
      const parsed = parseMatterTransferSource(part.from)
      if (!parsed) throw new Error("Boundary Matter move source must be canonical <owner>/<repository>#<localId>")
      sourceId = part.from
      source = parsed
      canonicalMatterMove = true
    } else {
      if (!isNumericDeclarationPath(path)) {
        throw new Error(`Boundary declaration transfer path ${path} has no persisted table`)
      }
      sourceId = positiveInteger(part.from, `${path} transfer from`)
      source = await this.declarationAddressByRowId(this.sql, path, sourceId)
    }
    if (source.src === target.src && source.localId === target.localId) {
      throw new Error(`Boundary ${path} transfer source and target are identical`)
    }

    const effects = await this.sql.begin(async (tx): Promise<Particle[]> => {
      if (path === "wimp") return await this.applyWimpTransfer(tx, op, source, target, input)
      if (!isNumericDeclarationPath(path)) {
        throw new Error(`Boundary declaration transfer path ${path} has no persisted table`)
      }
      const resolvedSourceId = canonicalMatterMove
        ? await this.declarationRowId(tx, source)
        : Number(sourceId)
      const sourceValue = await this.canonical(tx, source, {})
      if (!sourceValue) throw new Error(`Boundary ${path} source row ${resolvedSourceId} is absent`)
      const table = declarationTableByPath[path]
      const targetRow = (await tx.unsafe<Array<{id: number}>>(
        `SELECT id FROM ${table} WHERE wimp = ? AND local_id = ? LIMIT 1`,
        [target.src, target.localId],
      ))[0]
      if (targetRow && Number(targetRow.id) !== resolvedSourceId) {
        throw new Error(`Boundary ${path} target ${target.src}#${target.localId} already exists`)
      }

      const runtimeEffects: Particle[] = []
      const matterMove = canonicalMatterMove
        ? await this.prepareCanonicalMatterMove(tx, source, target, sourceValue, input)
        : []
      if (op === "move") {
        if (!canonicalMatterMove) await this.removeRuntimeConsequences(tx, source, runtimeEffects)
        if (path === "field") {
          const values = await tx<Array<{value: number}>>`
            SELECT value FROM atom_value WHERE field = ${resolvedSourceId}
          `
          await tx`DELETE FROM atom_value WHERE field = ${resolvedSourceId}`
          for (const value of values) await deleteUnreferencedValue(tx, Number(value.value))
        }
      }
      const resultId = await this.persistNumericDeclarationTransfer(
        tx, op, source, resolvedSourceId, sourceValue, target, input,
      )
      if (canonicalMatterMove) {
        for (const placement of matterMove) {
          await tx`
            UPDATE boundary_runtime_origin
               SET declaration_wimp = ${target.src}, declaration_local_id = ${target.localId},
                   scope_atom = ${placement.targetAtom}, occurrence_key = ${""}, ordinal = ${0}
             WHERE kind = ${"atom"} AND runtime_id = ${placement.runtimeAtom}
          `
        }
      } else if (path === "matter" && op === "move") {
        await tx`
          UPDATE boundary_runtime_origin
             SET declaration_wimp = ${target.src}, declaration_local_id = ${target.localId}
           WHERE declaration_kind = ${"matter"}
             AND declaration_wimp = ${source.src}
             AND declaration_local_id = ${source.localId}
        `
      }
      const canonical = await this.canonical(tx, target, input)
      if (!canonical || Number(canonical.id) !== resultId) {
        throw new Error(`Boundary ${path} transfer did not materialize canonical target`)
      }
      const committed: Particle[] = [{
        part: "graviton", op, path, from: resolvedSourceId,
        ts: Date.now(), value: canonical,
      }, ...runtimeEffects]
      let consequenceInput: JsonRecord = canonical
      if (path === "variant") {
        consequenceInput = {
          ...canonical,
          field: await this.fieldLocalIdByRowId(tx, positiveInteger(canonical.field, "variant.field")),
        }
      }
      await this.addRuntimeConsequences(tx, target, consequenceInput, committed)
      await this.mass.ensureIndependentMemberships(tx)
      await this.reconcileMassBindingSources(tx)
      return committed
    })

    await this.updateIndexes(effects)
    return {rootSrc: await this.rootSrc(), messages: effects.map(particleMessage)}
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
      const declarations = Array.isArray(value.mass) ? value.mass : []
      await this.mass.synchronizeDeclarations(sql, address.src, declarations as MetaMassDSL[])
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
      const previous = (await sql<Array<{field: number}>>`
        SELECT field FROM field_enum_variant WHERE wimp = ${address.src} AND local_id = ${address.localId}
      `)[0]
      if (previous && Number(previous.field) !== parentField) {
        throw new Error(`Cannot move Variant ${address.src}/${address.localId} to another Field`)
      }
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
      const conditionFieldId = await fieldId(sql, address.src, positiveInteger(value.field, "condition.field"))
      const id = await insertedId(sql<Array<{id: number}>>`
        INSERT INTO condition (wimp, local_id, transition, field, position)
        VALUES (
          ${address.src}, ${address.localId},
          ${await transitionId(sql, address.src, positiveInteger(value.transition, "condition.transition"))},
          ${conditionFieldId},
          ${nonNegativeInteger(value.position, "condition.position")}
        )
        ON CONFLICT (wimp, local_id) DO UPDATE SET
          transition = excluded.transition, field = excluded.field, position = excluded.position
        RETURNING id
      `, "Condition")
      await sql`DELETE FROM condition_predicate WHERE condition = ${id}`
      await insertPredicateGroup(sql, id, value.predicate, conditionFieldId)
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
    const parent = value.parent === null
      ? null
      : await matterId(sql, address.src, positiveInteger(value.parent, "matter.parent"))
    const edgeSlot = requiredString(value.edgeSlot, "matter.edgeSlot") as MatterEdgeSlot
    const position = nonNegativeInteger(value.position, "matter.position")
    const old = (await sql<Array<{id: number; kind: MatterParticleKind}>>`
      SELECT id, particle_kind AS kind
        FROM matter_particle
       WHERE wimp = ${address.src} AND local_id = ${address.localId}
    `)[0]
    const bindings = old ? await this.matterBindingIds(sql, Number(old.id)) : []
    let id: number
    if (old) {
      id = Number(old.id)
      await this.assertMatterParentIsAcyclic(sql, address, id, parent)
      if (old.kind === "wimp") await sql`DELETE FROM matter_particle_wimp WHERE particle = ${id}`
      else if (old.kind === "fuzzy") await sql`DELETE FROM matter_particle_fuzzy WHERE particle = ${id}`
      else if (old.kind === "axion") await sql`DELETE FROM matter_particle_axion WHERE particle = ${id}`
      else await sql`DELETE FROM matter_particle_macho WHERE particle = ${id}`
      await sql`
        UPDATE matter_particle
           SET parent_particle = ${parent}, particle_kind = ${kind},
               edge_slot = ${edgeSlot}, particle_order = ${position}
         WHERE id = ${id}
      `
      for (const binding of bindings) await sql`DELETE FROM matter_binding WHERE id = ${binding}`
    } else {
      id = await insertedId(sql<Array<{id: number}>>`
        INSERT INTO matter_particle (wimp, local_id, parent_particle, particle_kind, edge_slot, particle_order)
        VALUES (${address.src}, ${address.localId}, ${parent}, ${kind}, ${edgeSlot}, ${position})
        RETURNING id
      `, "Matter")
    }
    if (kind === "wimp") {
      validateRuntimeMatterBinding(value.massBinding, "mass", "matter.massBinding")
      validateRuntimeMatterBinding(value.energyBinding, "energy", "matter.energyBinding")
      await sql`
        INSERT INTO matter_particle_wimp (particle, src, fields_binding, mass_binding, energy_binding)
        VALUES (
          ${id}, ${requiredString(value.src, "matter.src")},
          ${await storeBinding(sql, address.src, value.fieldsBinding)},
          ${await storeBinding(sql, address.src, value.massBinding)},
          ${await storeBinding(sql, address.src, value.energyBinding)}
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

  private async assertMatterParentIsAcyclic(
    sql: Database,
    address: InflatonAddress,
    particle: number,
    parent: number | null,
  ): Promise<void> {
    if (parent === null) return
    const cycle = (await sql<Array<{found: number}>>`
      WITH RECURSIVE ancestors(id, parent_particle) AS (
        SELECT id, parent_particle FROM matter_particle WHERE id = ${parent}
        UNION
        SELECT candidate.id, candidate.parent_particle
          FROM matter_particle AS candidate
          JOIN ancestors ON candidate.id = ancestors.parent_particle
      )
      SELECT 1 AS found FROM ancestors WHERE id = ${particle} LIMIT 1
    `)[0]
    if (cycle) throw new Error(`Matter ${address.src}#${address.localId} cannot be its own ancestor`)
  }

  private async matterBindingIds(sql: Database, particle: number): Promise<number[]> {
    const row = (await sql<Array<{
      fields: number | null; mass: number | null; energy: number | null;
      fuzzy: number | null; axion: number | null; macho: number | null
    }>>`
      SELECT w.fields_binding AS fields, w.mass_binding AS mass, w.energy_binding AS energy,
             f.predicate_binding AS fuzzy, a.predicate_binding AS axion,
             m.collection_binding AS macho
        FROM matter_particle AS p
        LEFT JOIN matter_particle_wimp AS w ON w.particle = p.id
        LEFT JOIN matter_particle_fuzzy AS f ON f.particle = p.id
        LEFT JOIN matter_particle_axion AS a ON a.particle = p.id
        LEFT JOIN matter_particle_macho AS m ON m.particle = p.id
       WHERE p.id = ${particle}
    `)[0]
    return row
      ? [row.fields, row.mass, row.energy, row.fuzzy, row.axion, row.macho].filter((id): id is number => id !== null)
      : []
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
        for (const value of values) await deleteUnreferencedValue(sql, Number(value.value))
      }
      this.pendingEnumDefaults.delete(identityKey("field", address.src, address.localId))
      return
    }
    if (address.path === "variant") {
      const variant = (await sql<Array<{id: number}>>`
        SELECT id FROM field_enum_variant WHERE wimp = ${address.src} AND local_id = ${address.localId}
      `)[0]
      if (variant) {
        const references = (await sql<Array<{count: number}>>`
          SELECT
            (SELECT COUNT(*) FROM value_enum WHERE variant = ${variant.id}) +
            (SELECT COUNT(*) FROM field_enum_default WHERE variant = ${variant.id}) +
            (SELECT COUNT(*) FROM condition_predicate WHERE value_variant = ${variant.id}) +
            (SELECT COUNT(*) FROM condition_list_item WHERE value_variant = ${variant.id}) AS count
        `)[0]?.count ?? 0
        if (Number(references) > 0) {
          throw new Error(`Cannot remove referenced Variant ${address.src}/${address.localId}`)
        }
      }
      await sql`DELETE FROM field_enum_variant WHERE wimp = ${address.src} AND local_id = ${address.localId}`
    } else if (address.path === "state") await sql`DELETE FROM state WHERE wimp = ${address.src} AND local_id = ${address.localId}`
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
    } else await sql`UPDATE wimp SET view_css = NULL WHERE src = ${address.src}`
  }

  private async canonical(sql: Database, address: InflatonAddress, input: JsonRecord): Promise<JsonRecord | null> {
    if (address.path === "wimp") {
      const row = (await sql<Array<{src: string; name: string | null; desc: string | null}>>`
        SELECT src, name, desc FROM wimp WHERE src = ${address.src}
      `)[0]
      return row ? {...row, mass: await this.mass.declarations(address.src, sql)} : null
    }
    const base = {wimp: address.src, localId: address.localId}
    if (address.path === "field") {
      const row = (await sql<Array<{id: number; key: string; type: string; required: number; label: string | null}>>`
        SELECT id, key, type, required, label FROM field WHERE wimp = ${address.src} AND local_id = ${address.localId}
      `)[0]
      if (!row) return null
      const fallback = await this.fieldDefault(sql, {
        ...row,
        wimp: address.src,
        localId: address.localId,
      } as StoredField)
      return {
        ...base,
        ...row,
        required: row.required === 1,
        ...(fallback.ready && fallback.exists ? {default: fallback.value} : {}),
      }
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
      return row ? {...base, ...row, predicate: await this.conditionPredicate(sql, Number(row.id))} : null
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
      valueJson: string | null;
    }>>`
      SELECT id, operator, value_kind AS valueKind, value_boolean AS valueBoolean,
             value_number AS valueNumber, value_text AS valueText, value_variant AS valueVariant,
             value_json AS valueJson
        FROM condition_predicate WHERE condition = ${condition} ORDER BY predicate_order
    `) {
      const operator = row.valueKind === "null" && (row.operator === "eq" || row.operator === "neq")
        ? "null"
        : row.operator === "neq" ? "notEq"
        : row.operator === "not_in" ? "notIn"
          : row.operator === "not_include" ? "notInclude"
            : row.operator === "is_empty" ? "isEmpty"
              : row.operator === "starts_with" ? "startsWith"
                : row.operator === "ends_with" ? "endsWith"
                  : row.operator === "not_starts_with" ? "notStartsWith"
                    : row.operator === "not_ends_with" ? "notEndsWith"
                      : row.operator
      let value: unknown = row.valueKind === "null" ? row.operator === "eq" : null
      if (row.valueKind === "boolean") value = row.valueBoolean === 1
      else if (row.valueKind === "number") value = row.valueNumber
      else if (row.valueKind === "string") value = row.valueText
      else if (row.valueKind === "json") value = JSON.parse(row.valueJson ?? "null")
      else if (row.valueKind === "enum") value = row.valueVariant === null
        ? null
        : {kind: "enum", variant: Number(row.valueVariant)}
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
            : item.valueKind === "enum" && item.valueVariant !== null
              ? {kind: "enum", variant: Number(item.valueVariant)}
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
        await this.reconcileWimpMatter(sql, reference.wimp, effects)
      }
      const existing = (await sql<Array<{ok: number}>>`SELECT 1 AS ok FROM atom WHERE wimp = ${address.src} LIMIT 1`)[0]
      if (references.length === 0 && !existing) effects.push(...await this.ensureRootAtom(sql, address.src))
      await this.reconcileWimpMatter(sql, address.src, effects)
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
      `) await this.reconcileWimpMatter(sql, reference.wimp, effects)
      await this.reconcileWimpMatter(sql, address.src, effects)
      return
    }
    if (address.path === "variant") {
      const localField = positiveInteger(value.field, "variant.field")
      effects.push(...await this.materializeFieldForAtoms(sql, address.src, localField))
      await this.reconcileWimpMatter(sql, address.src, effects)
      return
    }
    if (address.path === "state") {
      return
    }
    if (address.path === "matter") {
      await this.reconcileWimpMatter(sql, address.src, effects)
      const emitted = new Set(effects.flatMap((effect) =>
        effect.part === "graviton" && typeof effect.path === "string" && effect.path.startsWith("atom/")
          ? [effect.path]
          : [],
      ))
      for (const origin of await sql<Array<{runtimeId: number}>>`
        SELECT runtime_id AS runtimeId FROM boundary_runtime_origin
         WHERE kind = ${"atom"} AND declaration_kind = ${"matter"}
           AND declaration_wimp = ${address.src} AND declaration_local_id = ${address.localId}
         ORDER BY sequence
      `) {
        const path = `atom/${Number(origin.runtimeId)}`
        await sql`
          UPDATE boundary_process_execution SET status = ${"superseded"}
           WHERE atom = ${origin.runtimeId} AND status = ${"pending"}
        `
        if (emitted.has(path)) continue
        const entity = await this.atomEntity(sql, Number(origin.runtimeId))
        if (entity) effects.push({part: "graviton", op: "replace", path, ts: Date.now(), value: entity})
      }
    }
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
      for (const atom of await sql<Array<{atom: number; valueId: number}>>`
        SELECT atom, value AS valueId FROM atom_value WHERE field = ${row.id}
      `) {
        effects.push({
          part: "gluon",
          op: "remove",
          path: Number(atom.atom),
          ts: Date.now(),
          value: {fields: {[String(row.id)]: {valueId: Number(atom.valueId), value: null}}},
        })
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
    if (!exists) return {ready: true, exists: false, value: null}
    if (field.type === "string") return {ready: true, exists: true, value: (await sql<Array<{value: string}>>`
      SELECT default_value AS value FROM field_string_default WHERE field = ${field.id}
    `)[0]?.value ?? ""}
    if (field.type === "number") return {ready: true, exists: true, value: Number((await sql<Array<{value: number}>>`
      SELECT default_value AS value FROM field_number_default WHERE field = ${field.id}
    `)[0]?.value ?? 0)}
    if (field.type === "boolean") return {ready: true, exists: true, value: (await sql<Array<{value: number}>>`
      SELECT default_value AS value FROM field_boolean_default WHERE field = ${field.id}
    `)[0]?.value === 1}
    if (field.type === "enum") {
      const variant = (await sql<Array<{variant: number}>>`
        SELECT variant FROM field_enum_default WHERE field = ${field.id}
      `)[0]?.variant
      return {
        ready: true,
        exists: true,
        value: variant === undefined ? null : {kind: "enum", variant: Number(variant)},
      }
    }
    return {ready: true, exists: true, value: (await sql<Array<{value: string}>>`
      SELECT item_value AS value FROM field_array_default_item WHERE field = ${field.id} ORDER BY position
    `).map((row) => Number(row.value))}
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
    fieldInits: FieldInit[] = [],
    desiredPosition?: number,
    occurrenceKey = parent?.occurrenceKey ?? "",
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
    const initialFields = new Map(fieldInits.map((field) => [field.key, field] as const))
    const suppliedKeys = [...initialFields.keys()]
    const declaredFields = await sql<Array<StoredField>>`
      SELECT id, wimp, local_id AS localId, key, type, required FROM field WHERE wimp = ${src} ORDER BY local_id
    `
    if (suppliedKeys.length > 0) {
      const declaredKeys = new Set(declaredFields.map((field) => field.key))
      if (suppliedKeys.some((key) => !declaredKeys.has(key))) return []
    }
    const sourceByTarget = new Map<string, {field: StoredField; value: number}>()
    for (const init of fieldInits) {
      if (!init.source) continue
      const target = declaredFields.find((field) => field.key === init.key)
      const source = (await sql<Array<StoredField & {value: number}>>`
        SELECT field.id, field.wimp, field.local_id AS localId, field.key, field.type, field.required,
               atom_value.value
          FROM field
          JOIN atom_value ON atom_value.field = field.id
         WHERE atom_value.atom = ${init.source.parentAtomId}
           AND field.key = ${init.source.parentFieldKey}
         LIMIT 1
      `)[0]
      if (!target || !source) return []
      if (!entangleableFieldType(target.type) || !entangleableFieldType(source.type)) {
        throw new Error(`Matter Field binding ${init.source.parentFieldKey} -> ${init.key} cannot entangle topology Fields`)
      }
      if (target.type !== source.type) {
        throw new Error(`Matter Field binding ${init.source.parentFieldKey} -> ${init.key} requires the same Field type`)
      }
      sourceByTarget.set(init.key, {field: source, value: Number(source.value)})
    }
    const position = desiredPosition ?? Number((await sql<Array<{count: number}>>`
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
        parent_kind, parent_runtime_id, owner_atom, scope_atom, occurrence_key, ordinal
      ) VALUES (
        ${"atom"}, ${atom}, ${declarationKind}, ${declarationWimp}, ${declarationLocalId},
        ${parentKind}, ${parentRuntimeId}, ${atom}, ${parent?.scopeAtom ?? atom}, ${occurrenceKey}, ${ordinal}
      )
    `
    const remaining = new Set(initialFields.keys())
    for (const field of declaredFields) {
      const supplied = initialFields.has(field.key)
      if (supplied) remaining.delete(field.key)
      if (supplied) {
        const init = initialFields.get(field.key)!
        const source = sourceByTarget.get(field.key)
        if (source) {
          await sql`INSERT INTO atom_value (atom, field, value) VALUES (${atom}, ${field.id}, ${source.value})`
          await sql`
            INSERT INTO atom_field_source (child_atom, child_field, parent_atom, parent_field)
            VALUES (${atom}, ${field.id}, ${init.source!.parentAtomId}, ${source.field.id})
          `
        } else await this.setAtomValue(sql, atom, field, init.value)
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
    const atomParent: RuntimeRef = {
      kind: "atom",
      id: atom,
      ownerAtom: atom,
      scopeAtom: atom,
      occurrenceKey: "",
    }
    for (const row of await sql<Array<{localId: number}>>`
      SELECT local_id AS localId FROM matter_particle WHERE wimp = ${src} AND parent_particle IS NULL ORDER BY particle_order
    `) effects.push(...await this.materializeMatter(
      sql,
      {path: "matter", src, localId: Number(row.localId)},
      atomParent,
    ))
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
      const valueId = await this.setAtomValue(sql, Number(atom.id), field, defaultValue.value)
      effects.push({
        part: "gluon",
        op: "add",
        path: Number(atom.id),
        ts: Date.now(),
        value: {fields: {[String(field.id)]: {valueId, value: clone(defaultValue.value)}}},
      })
    }
    return effects
  }

  private async setAtomValue(sql: Database, atom: number, field: StoredField, raw: unknown): Promise<number> {
    return await writeBoundaryAtomValue(sql, atom, field, raw)
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
        const occurrenceKey = await this.childOccurrenceKey(sql, parent, ordinal)
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
            undefined,
            occurrenceKey,
          ))
          const childAtom = (await sql<Array<{id: number}>>`
            SELECT runtime_id AS id FROM boundary_runtime_origin
             WHERE kind = ${"atom"} AND declaration_kind = ${"matter"}
               AND declaration_wimp = ${matter.wimp}
               AND declaration_local_id = ${matter.localId}
               AND scope_atom = ${parent.scopeAtom}
               AND occurrence_key = ${occurrenceKey}
             LIMIT 1
          `)[0]
          if (childAtom) {
            const atomParent: RuntimeRef = {
              kind: "atom",
              id: Number(childAtom.id),
              ownerAtom: Number(childAtom.id),
              scopeAtom: parent.scopeAtom,
              occurrenceKey,
            }
            for (const child of await this.matterChildren(sql, matter.id)) {
              effects.push(...await this.materializeMatter(
                sql,
                {path: "matter", src: child.wimp, localId: child.localId},
                atomParent,
              ))
            }
          }
          continue
        }

        const topology = await this.createTopology(sql, matter, parent, ordinal, undefined, occurrenceKey)
        effects.push(...topology.effects)
        const topologyParent: RuntimeRef = {
          kind: "topology",
          id: topology.id,
          ownerAtom: parent.ownerAtom,
          scopeAtom: parent.scopeAtom,
          occurrenceKey,
        }
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

  private async reconcileWimpMatter(sql: Database, src: string, effects: Particle[]): Promise<void> {
    for (const atom of await sql<Array<{id: number}>>`
      SELECT id FROM atom WHERE wimp = ${src} ORDER BY id
    `) await this.reconcileMatterScope(sql, src, Number(atom.id), effects)
  }

  private async reconcileMatterScope(
    sql: Database,
    src: string,
    scopeAtom: number,
    effects: Particle[],
  ): Promise<void> {
    const owner = (await sql<Array<{ok: number}>>`
      SELECT 1 AS ok FROM atom WHERE id = ${scopeAtom} AND wimp = ${src}
    `)[0]
    if (!owner) return

    const used = new Set<string>()
    const parent: RuntimeRef = {
      kind: "atom",
      id: scopeAtom,
      ownerAtom: scopeAtom,
      scopeAtom,
      occurrenceKey: "",
    }
    const roots: StoredMatter[] = []
    for (const row of await sql<Array<{localId: number}>>`
      SELECT local_id AS localId
        FROM matter_particle
       WHERE wimp = ${src} AND parent_particle IS NULL
       ORDER BY particle_order, local_id
    `) {
      const matter = await this.matter(sql, src, Number(row.localId))
      if (matter) roots.push(matter)
    }
    await this.reconcileMatterChildren(sql, parent, roots, used, effects)

    for (const origin of await sql<Array<{kind: "atom" | "topology"; runtimeId: number}>>`
      SELECT kind, runtime_id AS runtimeId
        FROM boundary_runtime_origin
       WHERE declaration_kind = ${"matter"}
         AND declaration_wimp = ${src}
         AND scope_atom = ${scopeAtom}
       ORDER BY sequence DESC
    `) {
      const key = runtimeKey(origin.kind, Number(origin.runtimeId))
      if (used.has(key)) continue
      const exists = (await sql<Array<{ok: number}>>`
        SELECT 1 AS ok FROM boundary_runtime_origin
         WHERE kind = ${origin.kind} AND runtime_id = ${origin.runtimeId}
      `)[0]
      if (exists) effects.push(...await this.removeRuntimeBranch(sql, origin.kind, Number(origin.runtimeId)))
    }
  }

  private async reconcileMatterChildren(
    sql: Database,
    parent: RuntimeRef,
    matters: StoredMatter[],
    used: Set<string>,
    effects: Particle[],
    rebindBindings = false,
  ): Promise<void> {
    let position = 0
    for (const matter of matters) {
      if (!await this.branchSelected(sql, parent, matter)) continue
      const repeats = await this.repetitionCount(sql, parent)
      for (let ordinal = 0; ordinal < repeats; ordinal++) {
        const occurrenceKey = await this.childOccurrenceKey(sql, parent, ordinal)
        await this.reconcileMatterPlacement(
          sql,
          parent,
          matter,
          ordinal,
          occurrenceKey,
          position++,
          used,
          effects,
          rebindBindings,
        )
      }
    }
  }

  private async reconcileMatterPlacement(
    sql: Database,
    parent: RuntimeRef,
    matter: StoredMatter,
    ordinal: number,
    occurrenceKey: string,
    position: number,
    used: Set<string>,
    effects: Particle[],
    rebindBindings: boolean,
  ): Promise<void> {
    const desiredKind = matter.kind === "wimp" ? "atom" : "topology"
    let candidates = await sql<Array<{
      kind: "atom" | "topology"; runtimeId: number; parentKind: "root" | "atom" | "topology";
      parentRuntimeId: number; ownerAtom: number; occurrenceKey: string
    }>>`
      SELECT kind, runtime_id AS runtimeId, parent_kind AS parentKind,
             parent_runtime_id AS parentRuntimeId, owner_atom AS ownerAtom,
             occurrence_key AS occurrenceKey
        FROM boundary_runtime_origin
       WHERE declaration_kind = ${"matter"}
         AND declaration_wimp = ${matter.wimp}
         AND declaration_local_id = ${matter.localId}
         AND scope_atom = ${parent.scopeAtom}
         AND occurrence_key = ${occurrenceKey}
       ORDER BY CASE WHEN kind = ${desiredKind} THEN 0 ELSE 1 END, sequence
    `
    if (candidates.length === 0) {
      candidates = (await sql<typeof candidates>`
        SELECT kind, runtime_id AS runtimeId, parent_kind AS parentKind,
               parent_runtime_id AS parentRuntimeId, owner_atom AS ownerAtom,
               occurrence_key AS occurrenceKey
          FROM boundary_runtime_origin
         WHERE kind = ${desiredKind} AND declaration_kind = ${"matter"}
           AND declaration_wimp = ${matter.wimp}
           AND declaration_local_id = ${matter.localId}
           AND scope_atom = ${parent.scopeAtom}
         ORDER BY CASE
           WHEN parent_kind = ${parent.kind} AND parent_runtime_id = ${parent.id} THEN 0
           ELSE 1
         END, sequence
      `).filter((candidate) => !used.has(runtimeKey(candidate.kind, Number(candidate.runtimeId)))).slice(0, 1)
    }
    let current = candidates[0]
    for (const duplicate of candidates.slice(1)) {
      effects.push(...await this.removeRuntimeBranch(sql, duplicate.kind, Number(duplicate.runtimeId)))
    }
    if (current && current.kind !== desiredKind) {
      effects.push(...await this.removeRuntimeBranch(sql, current.kind, Number(current.runtimeId)))
      current = undefined
    }

    if (matter.kind === "wimp") {
      if (!matter.targetSrc) return
      const target = (await sql<Array<{ok: number}>>`SELECT 1 AS ok FROM wimp WHERE src = ${matter.targetSrc}`)[0]
      if (!target) {
        if (current) used.add(runtimeKey(current.kind, Number(current.runtimeId)))
        return
      }
      const initialFields = await this.resolveInitialFields(sql, matter.fieldsBinding, parent.ownerAtom)
      if (!current) {
        effects.push(...await this.createAtom(
          sql,
          matter.targetSrc,
          parent,
          "matter",
          matter.wimp,
          matter.localId,
          ordinal,
          initialFields,
          position,
          occurrenceKey,
        ))
        current = (await sql<Array<typeof candidates[number]>>`
          SELECT kind, runtime_id AS runtimeId, parent_kind AS parentKind,
                 parent_runtime_id AS parentRuntimeId, owner_atom AS ownerAtom,
                 occurrence_key AS occurrenceKey
            FROM boundary_runtime_origin
           WHERE kind = ${"atom"} AND declaration_kind = ${"matter"}
             AND declaration_wimp = ${matter.wimp}
             AND declaration_local_id = ${matter.localId}
             AND scope_atom = ${parent.scopeAtom} AND occurrence_key = ${occurrenceKey}
        `)[0]
        if (!current) return
      }
      const atomId = Number(current.runtimeId)
      const atom = (await sql<Array<{
        wimp: string; parentAtom: number | null; parentTopology: number | null; position: number
      }>>`
        SELECT wimp, parent_atom AS parentAtom, parent_topology AS parentTopology, position
          FROM atom WHERE id = ${atomId}
      `)[0]
      if (!atom) return
      const moved = atom.parentAtom !== (parent.kind === "atom" ? parent.id : null) ||
        atom.parentTopology !== (parent.kind === "topology" ? parent.id : null) ||
        Number(atom.position) !== position
      const retargeted = atom.wimp !== matter.targetSrc
      if (retargeted) {
        if (!await this.retargetAtom(sql, atomId, matter.targetSrc, initialFields, effects)) {
          used.add(runtimeKey("atom", atomId))
          return
        }
      }
      if (moved) {
        await sql`
          UPDATE atom
             SET parent_atom = ${parent.kind === "atom" ? parent.id : null},
                 parent_topology = ${parent.kind === "topology" ? parent.id : null},
                 position = ${position}
           WHERE id = ${atomId}
        `
      }
      const originChanged = current.occurrenceKey !== occurrenceKey ||
        current.parentKind !== parent.kind || Number(current.parentRuntimeId) !== parent.id ||
        Number(current.ownerAtom) !== atomId
      if (moved || originChanged) {
        await sql`
          UPDATE boundary_runtime_origin
             SET parent_kind = ${parent.kind}, parent_runtime_id = ${parent.id},
                 owner_atom = ${atomId}, scope_atom = ${parent.scopeAtom},
                 occurrence_key = ${occurrenceKey}, ordinal = ${ordinal}
           WHERE kind = ${"atom"} AND runtime_id = ${atomId}
        `
      }
      let bindingsChanged = false
      if (!retargeted && rebindBindings) {
        const fields = await sql<Array<StoredField>>`
          SELECT id, wimp, local_id AS localId, key, type, required
            FROM field WHERE wimp = ${matter.targetSrc} ORDER BY local_id
        `
        bindingsChanged = await this.rebindAtomFieldValues(sql, atomId, fields, initialFields)
      }
      const runtimeBindingChanged = !retargeted && rebindBindings &&
        (matter.massBinding !== null || matter.energyBinding !== null)
      const executionBindingChanged = bindingsChanged || runtimeBindingChanged
      if (executionBindingChanged) await sql`
          UPDATE boundary_process_execution SET status = ${"superseded"}
           WHERE atom = ${atomId} AND status = ${"pending"}
      `
      if (moved || retargeted || originChanged || executionBindingChanged) {
        const entity = await this.atomEntity(sql, atomId)
        if (entity) effects.push({part: "graviton", op: "replace", path: `atom/${atomId}`, ts: Date.now(), value: entity})
      }
      used.add(runtimeKey("atom", atomId))
      const atomParent: RuntimeRef = {
        kind: "atom",
        id: atomId,
        ownerAtom: atomId,
        scopeAtom: parent.scopeAtom,
        occurrenceKey,
      }
      await this.reconcileMatterChildren(
        sql,
        atomParent,
        await this.matterChildren(sql, matter.id),
        used,
        effects,
        executionBindingChanged,
      )
      return
    }

    if (!current) {
      const created = await this.createTopology(sql, matter, parent, ordinal, position, occurrenceKey)
      effects.push(...created.effects)
      current = {
        kind: "topology",
        runtimeId: created.id,
        parentKind: parent.kind,
        parentRuntimeId: parent.id,
        ownerAtom: parent.ownerAtom,
        occurrenceKey,
      }
    }
    const topologyId = Number(current.runtimeId)
    const topology = (await sql<Array<{
      kind: string; parentAtom: number | null; parentTopology: number | null; position: number
    }>>`
      SELECT kind, parent_atom AS parentAtom, parent_topology AS parentTopology, position
        FROM topology WHERE id = ${topologyId}
    `)[0]
    if (!topology) return
    const ownerChanged = Number(current.ownerAtom) !== parent.ownerAtom
    const changed = topology.kind !== matter.kind ||
      topology.parentAtom !== (parent.kind === "atom" ? parent.id : null) ||
      topology.parentTopology !== (parent.kind === "topology" ? parent.id : null) ||
      Number(topology.position) !== position || current.parentKind !== parent.kind ||
      Number(current.parentRuntimeId) !== parent.id || Number(current.ownerAtom) !== parent.ownerAtom ||
      current.occurrenceKey !== occurrenceKey
    if (changed) {
      await sql`
        UPDATE topology
           SET parent_atom = ${parent.kind === "atom" ? parent.id : null},
               parent_topology = ${parent.kind === "topology" ? parent.id : null},
               kind = ${matter.kind}, position = ${position}
         WHERE id = ${topologyId}
      `
      await sql`
        UPDATE boundary_runtime_origin
           SET parent_kind = ${parent.kind}, parent_runtime_id = ${parent.id},
               owner_atom = ${parent.ownerAtom}, scope_atom = ${parent.scopeAtom},
               occurrence_key = ${occurrenceKey}, ordinal = ${ordinal}
         WHERE kind = ${"topology"} AND runtime_id = ${topologyId}
      `
      const entity = await this.topologyEntity(sql, topologyId)
      if (entity) effects.push({part: "graviton", op: "replace", path: `topology/${topologyId}`, ts: Date.now(), value: entity})
    }
    used.add(runtimeKey("topology", topologyId))
    const topologyParent: RuntimeRef = {
      kind: "topology",
      id: topologyId,
      ownerAtom: parent.ownerAtom,
      scopeAtom: parent.scopeAtom,
      occurrenceKey,
    }
    await this.reconcileMatterChildren(
      sql,
      topologyParent,
      await this.matterChildren(sql, matter.id),
      used,
      effects,
      rebindBindings || ownerChanged,
    )
  }

  private async retargetAtom(
    sql: Database,
    atomId: number,
    targetSrc: string,
    fieldInits: FieldInit[],
    effects: Particle[],
  ): Promise<boolean> {
    const declaredFields = await sql<Array<StoredField>>`
      SELECT id, wimp, local_id AS localId, key, type, required
        FROM field WHERE wimp = ${targetSrc} ORDER BY local_id
    `
    const fieldByKey = new Map(declaredFields.map((field) => [field.key, field]))
    if (fieldInits.some((init) => !fieldByKey.has(init.key))) return false

    const oldFields = new Map<string, {type: StoredField["type"]; value: unknown}>()
    const oldValueIds: number[] = []
    for (const row of await sql<Array<{key: string; type: StoredField["type"]; value: number}>>`
      SELECT field.key, field.type, atom_value.value
        FROM atom_value JOIN field ON field.id = atom_value.field
       WHERE atom_value.atom = ${atomId}
    `) {
      oldFields.set(row.key, {type: row.type, value: await this.readValue(sql, Number(row.value), row.type)})
      oldValueIds.push(Number(row.value))
    }
    const oldState = (await sql<Array<{name: string}>>`
      SELECT state.name FROM atom_state JOIN state ON state.id = atom_state.metaState
       WHERE atom_state.atom = ${atomId}
    `)[0]?.name ?? null

    const sourceByTarget = new Map<string, {field: StoredField; value: number}>()
    for (const init of fieldInits) {
      if (!init.source) continue
      const target = fieldByKey.get(init.key)
      const source = (await sql<Array<StoredField & {value: number}>>`
        SELECT field.id, field.wimp, field.local_id AS localId, field.key, field.type, field.required,
               atom_value.value
          FROM field JOIN atom_value ON atom_value.field = field.id
         WHERE atom_value.atom = ${init.source.parentAtomId}
           AND field.key = ${init.source.parentFieldKey}
         LIMIT 1
      `)[0]
      if (!target || !source || target.type !== source.type ||
          !entangleableFieldType(target.type) || !entangleableFieldType(source.type)) return false
      sourceByTarget.set(init.key, {field: source, value: Number(source.value)})
    }

    for (const child of await sql<Array<{kind: "atom" | "topology"; runtimeId: number}>>`
      SELECT kind, runtime_id AS runtimeId FROM boundary_runtime_origin
       WHERE parent_kind = ${"atom"} AND parent_runtime_id = ${atomId}
       ORDER BY sequence DESC
    `) effects.push(...await this.removeRuntimeBranch(sql, child.kind, Number(child.runtimeId)))
    await sql`
      UPDATE boundary_process_execution SET status = ${"superseded"}
       WHERE atom = ${atomId} AND status = ${"pending"}
    `
    await sql`DELETE FROM atom_value WHERE atom = ${atomId}`
    await sql`UPDATE atom SET wimp = ${targetSrc} WHERE id = ${atomId}`

    const supplied = new Map(fieldInits.map((init) => [init.key, init] as const))
    for (const field of declaredFields) {
      const init = supplied.get(field.key)
      const source = sourceByTarget.get(field.key)
      if (init && source) {
        await sql`INSERT INTO atom_value (atom, field, value) VALUES (${atomId}, ${field.id}, ${source.value})`
        await sql`
          INSERT INTO atom_field_source (child_atom, child_field, parent_atom, parent_field)
          VALUES (${atomId}, ${field.id}, ${init.source!.parentAtomId}, ${source.field.id})
        `
      } else if (init) await this.setAtomValue(sql, atomId, field, init.value)
      else {
        const old = oldFields.get(field.key)
        if (old?.type === field.type) await this.setAtomValue(sql, atomId, field, old.value)
        else {
          const fallback = await this.fieldDefault(sql, field)
          if (fallback.ready) await this.setAtomValue(sql, atomId, field, fallback.value)
        }
      }
    }
    for (const value of oldValueIds) await deleteUnreferencedValue(sql, value)
    const state = oldState === null
      ? null
      : (await sql<Array<{id: number}>>`
          SELECT id FROM state WHERE wimp = ${targetSrc} AND name = ${oldState} LIMIT 1
        `)[0]?.id ?? null
    const fallbackState = state ?? (await sql<Array<{id: number}>>`
      SELECT id FROM state WHERE wimp = ${targetSrc} ORDER BY position LIMIT 1
    `)[0]?.id ?? null
    await sql`UPDATE atom_state SET metaState = ${fallbackState} WHERE atom = ${atomId}`
    await this.reconcileMatterScope(sql, targetSrc, atomId, effects)
    return true
  }

  private async matter(sql: Database, src: string, localId: number): Promise<StoredMatter | null> {
    const row = (await sql<Array<{
      id: number; wimp: string; localId: number; parentLocalId: number | null;
      kind: MatterParticleKind; edgeSlot: MatterEdgeSlot; position: number;
      targetSrc: string | null; fieldsBinding: number | null; massBinding: number | null; energyBinding: number | null;
      fuzzyKind: string | null; fuzzyBinding: number | null; axionBinding: number | null;
      collectionBinding: number | null;
    }>>`
      SELECT particle.id, particle.wimp, particle.local_id AS localId,
             parent.local_id AS parentLocalId,
             particle.particle_kind AS kind, particle.edge_slot AS edgeSlot,
             particle.particle_order AS position,
             wimp_edge.src AS targetSrc, wimp_edge.fields_binding AS fieldsBinding,
             wimp_edge.mass_binding AS massBinding, wimp_edge.energy_binding AS energyBinding,
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
      energyBinding: row.energyBinding === null ? null : Number(row.energyBinding),
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
      const energyBinding = await this.bindingDeclaration(sql, matter.energyBinding)
      if (fieldsBinding !== undefined) result.fieldsBinding = fieldsBinding
      if (massBinding !== undefined) result.massBinding = massBinding
      if (energyBinding !== undefined) result.energyBinding = energyBinding
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
    const direct = (await sql<Array<{kind: "whole" | "keys"}>>`
      SELECT kind FROM matter_binding_direct_mass WHERE binding = ${bindingId}
    `)[0]
    const directMass = direct === undefined ? undefined : direct.kind === "whole"
      ? {kind: "whole" as const}
      : {kind: "keys" as const, entries: (await sql<Array<{target: string; source: string}>>`
          SELECT target_key AS target, source_key AS source
            FROM matter_binding_direct_mass_key
           WHERE binding = ${bindingId}
           ORDER BY key_order
        `).map((entry) => ({target: entry.target, source: entry.source}))}
    return {
      ...(paths.length === 0 ? {} : {data: paths.length === 1 ? paths[0] : paths}),
      ...(row.kind === "dynamic" ? {expr: row.expr} : {}),
      ...(directMass === undefined ? {} : {directMass}),
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
        kind: "atom", id: Number(atom.id), ownerAtom: Number(atom.id), scopeAtom: Number(atom.id), occurrenceKey: "",
      }))
    }
    return (await sql<Array<{
      kind: "atom" | "topology"; runtimeId: number; ownerAtom: number; scopeAtom: number; occurrenceKey: string
    }>>`
      SELECT kind, runtime_id AS runtimeId, owner_atom AS ownerAtom,
             scope_atom AS scopeAtom, occurrence_key AS occurrenceKey
        FROM boundary_runtime_origin
       WHERE declaration_kind = ${"matter"}
         AND declaration_wimp = ${matter.wimp}
         AND declaration_local_id = ${matter.parentLocalId}
       ORDER BY sequence
    `).map((origin) => ({
      kind: origin.kind,
      id: Number(origin.runtimeId),
      ownerAtom: Number(origin.ownerAtom),
      scopeAtom: Number(origin.scopeAtom),
      occurrenceKey: origin.occurrenceKey,
    }))
  }

  private async createTopology(
    sql: Database,
    matter: StoredMatter,
    parent: RuntimeRef,
    ordinal: number,
    desiredPosition?: number,
    occurrenceKey = parent.occurrenceKey,
  ): Promise<{id: number; effects: Particle[]}> {
    if (matter.kind === "wimp") throw new Error("WIMP Matter cannot create Topology")
    const found = (await sql<Array<{runtimeId: number}>>`
      SELECT runtime_id AS runtimeId FROM boundary_runtime_origin
       WHERE kind = ${"topology"} AND declaration_kind = ${"matter"}
         AND declaration_wimp = ${matter.wimp} AND declaration_local_id = ${matter.localId}
         AND parent_kind = ${parent.kind} AND parent_runtime_id = ${parent.id} AND ordinal = ${ordinal}
    `)[0]
    if (found) return {id: Number(found.runtimeId), effects: []}
    const position = desiredPosition ?? Number((await sql<Array<{count: number}>>`
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
        parent_kind, parent_runtime_id, owner_atom, scope_atom, occurrence_key, ordinal
      ) VALUES (
        ${"topology"}, ${id}, ${"matter"}, ${matter.wimp}, ${matter.localId},
        ${parent.kind}, ${parent.id}, ${parent.ownerAtom}, ${parent.scopeAtom}, ${occurrenceKey}, ${ordinal}
      )
    `
    const entity = await this.topologyEntity(sql, id)
    return {
      id,
      effects: entity ? [{part: "graviton", op: "add", path: `topology/${id}`, ts: Date.now(), value: entity}] : [],
    }
  }

  private async resolveInitialFields(sql: Database, bindingId: number | null, ownerAtom: number): Promise<FieldInit[]> {
    if (bindingId === null) return []
    const binding = await this.binding(sql, bindingId, ownerAtom)
    const indirect = typeof binding === "string"
      ? await this.atomFieldByKey(sql, ownerAtom, binding)
      : undefined
    const initial: JsonRecord = isRecord(binding) ? binding : isRecord(indirect) ? indirect : {}
    const sources = await this.directFieldSources(sql, bindingId)
    return Object.entries(initial).map(([key, value]) => ({
      key,
      value: clone(value),
      ...(sources.has(key) ? {source: {parentAtomId: ownerAtom, parentFieldKey: sources.get(key)!}} : {}),
    }))
  }

  private async rebindAtomFieldValues(
    sql: Database,
    atomId: number,
    fields: StoredField[],
    initial: FieldInit[],
  ): Promise<boolean> {
    const fieldByKey = new Map(fields.map((field) => [field.key, field]))
    const desiredFieldIds = new Set<number>()
    let changed = false

    for (const init of initial) {
      const target = fieldByKey.get(init.key)
      if (!target) throw new Error(`Matter Field binding target ${fields[0]?.wimp ?? "unknown"}.${init.key} is not declared`)
      desiredFieldIds.add(Number(target.id))
      const previous = (await sql<Array<{value: number}>>`
        SELECT value FROM atom_value WHERE atom = ${atomId} AND field = ${target.id}
      `)[0]
      const previousSource = (await sql<Array<{parentAtom: number; parentField: number}>>`
        SELECT parent_atom AS parentAtom, parent_field AS parentField
          FROM atom_field_source
         WHERE child_atom = ${atomId} AND child_field = ${target.id}
      `)[0]

      if (init.source) {
        const source = (await sql<Array<StoredField & {value: number}>>`
          SELECT field.id, field.wimp, field.local_id AS localId, field.key, field.type, field.required,
                 atom_value.value
            FROM field
            JOIN atom_value ON atom_value.field = field.id
           WHERE atom_value.atom = ${init.source.parentAtomId}
             AND field.key = ${init.source.parentFieldKey}
           LIMIT 1
        `)[0]
        if (!source) throw new Error(`Matter Field source ${init.source.parentFieldKey} is not materialized`)
        if (!entangleableFieldType(target.type) || !entangleableFieldType(source.type)) {
          throw new Error(`Matter Field binding ${init.source.parentFieldKey} -> ${init.key} cannot entangle topology Fields`)
        }
        if (target.type !== source.type) {
          throw new Error(`Matter Field binding ${init.source.parentFieldKey} -> ${init.key} requires the same Field type`)
        }
        const fieldChanged = !previous || Number(previous.value) !== Number(source.value) ||
          !previousSource || Number(previousSource.parentAtom) !== init.source.parentAtomId ||
          Number(previousSource.parentField) !== Number(source.id)
        if (!fieldChanged) continue
        changed = true
        await sql`
          INSERT INTO atom_value (atom, field, value)
          VALUES (${atomId}, ${target.id}, ${source.value})
          ON CONFLICT (atom, field) DO UPDATE SET value = excluded.value
        `
        await sql`
          INSERT INTO atom_field_source (child_atom, child_field, parent_atom, parent_field)
          VALUES (${atomId}, ${target.id}, ${init.source.parentAtomId}, ${source.id})
          ON CONFLICT (child_atom, child_field) DO UPDATE SET
            parent_atom = excluded.parent_atom,
            parent_field = excluded.parent_field
        `
      } else {
        const previousValue = previous
          ? await this.readValue(sql, Number(previous.value), target.type)
          : undefined
        if (previous && !previousSource && sameJson(previousValue, init.value)) continue
        changed = true
        await sql`DELETE FROM atom_field_source WHERE child_atom = ${atomId} AND child_field = ${target.id}`
        await sql`DELETE FROM atom_value WHERE atom = ${atomId} AND field = ${target.id}`
        await this.setAtomValue(sql, atomId, target, init.value)
      }
      if (previous) await deleteUnreferencedValue(sql, Number(previous.value))
    }

    for (const source of await sql<Array<{field: number; value: number}>>`
      SELECT relation.child_field AS field, atom_value.value
        FROM atom_field_source AS relation
        JOIN atom_value
          ON atom_value.atom = relation.child_atom
         AND atom_value.field = relation.child_field
       WHERE relation.child_atom = ${atomId}
    `) {
      const fieldId = Number(source.field)
      if (desiredFieldIds.has(fieldId)) continue
      const field = fields.find((candidate) => Number(candidate.id) === fieldId)
      if (!field) continue
      const value = await this.readValue(sql, Number(source.value), field.type)
      changed = true
      await sql`DELETE FROM atom_field_source WHERE child_atom = ${atomId} AND child_field = ${fieldId}`
      await sql`DELETE FROM atom_value WHERE atom = ${atomId} AND field = ${fieldId}`
      await this.setAtomValue(sql, atomId, field, value)
      await deleteUnreferencedValue(sql, Number(source.value))
    }
    return changed
  }

  private async rebindMatterFieldValues(sql: Database, address: InflatonAddress): Promise<void> {
    const matter = await this.matter(sql, address.src, address.localId)
    if (!matter || matter.kind !== "wimp") return

    for (const origin of await sql<Array<{atom: number; ownerAtom: number | null}>>`
      SELECT origin.runtime_id AS atom,
             COALESCE(child.parent_atom, topology_origin.owner_atom) AS ownerAtom
        FROM boundary_runtime_origin AS origin
        JOIN atom AS child ON child.id = origin.runtime_id
        LEFT JOIN boundary_runtime_origin AS topology_origin
          ON topology_origin.kind = ${"topology"}
         AND topology_origin.runtime_id = child.parent_topology
       WHERE origin.kind = ${"atom"}
         AND origin.declaration_kind = ${"matter"}
         AND origin.declaration_wimp = ${address.src}
         AND origin.declaration_local_id = ${address.localId}
       ORDER BY origin.sequence
    `) {
      const atomId = Number(origin.atom)
      if (origin.ownerAtom === null) continue
      const ownerAtom = Number(origin.ownerAtom)
      const atom = (await sql<Array<{wimp: string}>>`SELECT wimp FROM atom WHERE id = ${atomId}`)[0]
      if (!atom) continue
      const fields = await sql<Array<StoredField>>`
        SELECT id, wimp, local_id AS localId, key, type, required
          FROM field
         WHERE wimp = ${atom.wimp}
         ORDER BY local_id
      `
      const initial = await this.resolveInitialFields(sql, matter.fieldsBinding, ownerAtom)
      await this.rebindAtomFieldValues(sql, atomId, fields, initial)
    }
  }

  private async directFieldSources(sql: Database, bindingId: number): Promise<Map<string, string>> {
    const binding = (await sql<Array<{kind: string; expr: string | null}>>`
      SELECT binding_kind AS kind, expr FROM matter_binding WHERE id = ${bindingId}
    `)[0]
    if (binding?.kind !== "dynamic" || binding.expr === null) return new Map()
    const dependencies = new Map((await sql<Array<{order: number; path: string}>>`
      SELECT dep_order AS "order", path FROM matter_binding_dep WHERE binding = ${bindingId} ORDER BY dep_order
    `).map((dependency) => [Number(dependency.order), dependency.path] as const))
    const result = new Map<string, string>()
    for (const [target, dependency] of directFieldBindingSources(binding.expr)) {
      const path = dependencies.get(dependency)
      if (path && !path.startsWith("/") && !path.includes("/") && !path.includes("[")) result.set(target, path)
    }
    return result
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

  private async childOccurrenceKey(sql: Database, parent: RuntimeRef, ordinal: number): Promise<string> {
    if (parent.kind !== "topology") return parent.occurrenceKey
    const kind = (await sql<Array<{kind: string}>>`
      SELECT kind FROM topology WHERE id = ${parent.id}
    `)[0]?.kind
    return kind === "macho" ? `${parent.occurrenceKey}/${ordinal}` : parent.occurrenceKey
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
    const items = (await sql<Array<{value: string}>>`SELECT item_value AS value FROM value_list_item WHERE value = ${id} ORDER BY position`).map((row) => Number(row.value))
    if (type === "array") return items
    return items
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

  private async retireProcessExecutions(sql: Database, atomId: number): Promise<void> {
    await sql`
      INSERT OR IGNORE INTO boundary_retired_process_execution (
        execution_id, atom, process, state, energy
      )
      SELECT execution_id, atom, process, state, energy
        FROM boundary_process_execution
       WHERE atom = ${atomId} AND status IN (${"pending"}, ${"superseded"})
    `
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
      if (childKind === "atom") await this.retireProcessExecutions(sql, childId)
      await sql`DELETE FROM boundary_runtime_origin WHERE kind = ${childKind} AND runtime_id = ${childId}`
      if (childKind === "atom") await sql`DELETE FROM atom WHERE id = ${childId}`
      else await sql`DELETE FROM topology WHERE id = ${childId}`
      for (const value of values) await deleteUnreferencedValue(sql, Number(value.value))
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
      const reconcileScopes = new Map<string, {wimp: string; scopeAtom: number}>()
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
          if (previous) await deleteUnreferencedValue(tx, Number(previous.value))
        } else await this.setAtomValue(tx, atomId, field, raw)
      }
      committed.push({...clone(part), ts: Date.now()})

      for (const topology of await tx<Array<{
        runtimeId: number; wimp: string; localId: number; scopeAtom: number; occurrenceKey: string
      }>>`
        SELECT origin.runtime_id AS runtimeId, origin.declaration_wimp AS wimp,
               origin.declaration_local_id AS localId, origin.scope_atom AS scopeAtom,
               origin.occurrence_key AS occurrenceKey
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
          scopeAtom: Number(topology.scopeAtom),
          occurrenceKey: topology.occurrenceKey,
        }
        committed.push({
          part: "higgs",
          op: "replace",
          path: `topology/${parent.id}`,
          ts: Date.now(),
          value: {fields: clone(fields)},
        })
        reconcileScopes.set(`${controller.wimp}\0${parent.scopeAtom}`, {
          wimp: controller.wimp,
          scopeAtom: parent.scopeAtom,
        })
      }
      for (const scope of reconcileScopes.values()) {
        await this.reconcileMatterScope(tx, scope.wimp, scope.scopeAtom, committed)
      }
      return committed
    })
    await this.updateIndexes(effects)
    return {rootSrc: await this.rootSrc(), messages: effects.map(particleMessage)}
  }

  /** Reuses Boundary key identities for direct /mass and /mass/<key> Matter bindings. */
  private async reconcileMassBindingSources(sql: Database): Promise<void> {
    const bindings = await sql<Array<{childAtom: number; parentAtom: number; kind: string; target: string | null; source: string | null}>>`
      SELECT child.id AS childAtom, COALESCE(child.parent_atom, origin.owner_atom) AS parentAtom, direct.kind,
             entry.target_key AS target, entry.source_key AS source
        FROM boundary_runtime_origin AS origin
        JOIN atom AS child ON child.id = origin.runtime_id
        JOIN matter_particle_wimp AS edge
          ON edge.particle = (SELECT id FROM matter_particle
                                WHERE wimp = origin.declaration_wimp AND local_id = origin.declaration_local_id)
        JOIN matter_binding_direct_mass AS direct ON direct.binding = edge.mass_binding
        LEFT JOIN matter_binding_direct_mass_key AS entry ON entry.binding = direct.binding
       WHERE origin.kind = ${"atom"}
       ORDER BY child.id, direct.kind, entry.key_order
    `
    let childAtom: number | null = null
    for (const binding of bindings) {
      const nextChild = Number(binding.childAtom)
      if (childAtom !== nextChild) {
        childAtom = nextChild
        await this.mass.clearSourcesIn(sql, childAtom)
      }
      if (binding.kind === "whole") await this.mass.sourceMatchingKeys(sql, nextChild, Number(binding.parentAtom))
      else if (binding.target !== null && binding.source !== null) await this.mass.sourceMappedKey(sql, nextChild, Number(binding.parentAtom), binding.target, binding.source)
    }
  }

  private async atomEntity(sql: Database, id: number): Promise<JsonRecord | null> {
    const atom = (await sql<Array<{id: number; parent_atom: number | null; parent_topology: number | null; wimp: string; position: number}>>`
      SELECT id, parent_atom, parent_topology, wimp, position FROM atom WHERE id = ${id}
    `)[0]
    if (!atom) return null
    const values: Array<{atom: number; field: number; value: number}> = []
    const valueRecords: JsonRecord[] = []
    const valueItems: Array<{value: number; position: number; itemValue: number}> = []
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
        `) valueItems.push({value: Number(row.value), position: Number(item.position), itemValue: Number(item.itemValue)})
      }
    }
    const selected = (await sql<Array<{metaState: number | null}>>`SELECT metaState FROM atom_state WHERE atom = ${id}`)[0]?.metaState ?? null
    const origin = (await sql<Array<{
      declarationKind: "wimp" | "matter"; declarationWimp: string; declarationLocalId: number
    }>>`
      SELECT declaration_kind AS declarationKind, declaration_wimp AS declarationWimp,
             declaration_local_id AS declarationLocalId
        FROM boundary_runtime_origin
       WHERE kind = ${"atom"} AND runtime_id = ${id}
    `)[0]
    const continuation = origin?.declarationKind === "matter"
      ? await this.matter(sql, origin.declarationWimp, Number(origin.declarationLocalId))
      : null
    const massBinding = continuation?.kind === "wimp"
      ? await this.bindingDeclaration(sql, continuation.massBinding)
      : undefined
    const energyBinding = continuation?.kind === "wimp"
      ? await this.bindingDeclaration(sql, continuation.energyBinding)
      : undefined
    const fieldSources = await sql<Array<{
      childAtom: number; childField: number; parentAtom: number; parentField: number
    }>>`
      SELECT child_atom AS childAtom, child_field AS childField,
             parent_atom AS parentAtom, parent_field AS parentField
        FROM atom_field_source
       WHERE child_atom = ${id}
       ORDER BY child_field
    `
    return {
      atom: {
        id,
        parentAtom: atom.parent_atom === null ? null : Number(atom.parent_atom),
        parentTopology: atom.parent_topology === null ? null : Number(atom.parent_topology),
        wimp: atom.wimp,
        position: Number(atom.position),
      },
      ...(
        continuation?.kind === "wimp"
          ? {
              continuation: {
                ...(massBinding !== undefined ? {massBinding} : {}),
                ...(energyBinding !== undefined ? {energyBinding} : {}),
              },
            }
          : {}
      ),
      values,
      valueRecords,
      valueItems,
      ...(fieldSources.length > 0 ? {fieldSources} : {}),
      state: {atom: id, metaState: selected === null ? null : Number(selected)},
      mass: await this.mass.authorized(id, sql),
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
