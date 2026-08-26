/**
Boundary-owned проекция одного coherent canonical cut в `Graph.runtime`.

Внутренние relational identities проецируются только как typed opaque refs;
SQLite rows и числовые foreign keys не становятся отдельным public contract.

@packageDocumentation
*/

import {
  parseMetaAddress,
  type AtomRef,
  type DocumentPointer,
  type JsonValue,
  type MassRef,
  type MetaAddress,
  type Graph,
  type ReactionRelationRef,
  type RuntimeAtom,
  type RuntimeMass,
  type RuntimeNode,
  type RuntimeReactionRelation,
  type RuntimeTopology,
  type TopologyRef,
} from "@metafor/types/metafor/graph"
import type {
  BoundaryInitialAtom,
  BoundaryInitialDeclaration,
  BoundaryInitialProjectionEntry,
} from "shared/protocol/boundary/initial"
import type {ReactionRelation} from "shared/protocol/force/reaction"
import type {BoundaryGraphProjection} from "shared/protocol/boundary/runtime"
import type {MetaRuntimeAtomLocator} from "shared/protocol/metafor/observation"
import type {BoundaryDatabase} from "../sqlite.ts"

type RecordValue = Record<string, unknown>
type RuntimeKey = `atom/${number}` | `topology/${number}`
type MatterKind = "wimp" | "fuzzy" | "axion" | "macho"

type MatterDeclaration = {
  wimp: MetaAddress
  localId: number
  parent: number | null
  position: number
  kind: MatterKind
  target?: MetaAddress
}

type FieldDeclaration = {
  id: number
  wimp: MetaAddress
  key: string
  type: "string" | "number" | "boolean" | "array" | "enum"
}

type VariantDeclaration = {
  id: number
  field: number
  value: string
}

type StateDeclaration = {
  id: number
  wimp: MetaAddress
  name: string
}

type RuntimeRecord = {
  key: RuntimeKey
  parent: RuntimeKey | "root"
  position: number
  sequence: number
  node: Omit<RuntimeAtom, "children"> | Omit<RuntimeTopology, "children">
}

const MATTER_KINDS = new Set<MatterKind>(["wimp", "fuzzy", "axion", "macho"])
const FIELD_TYPES = new Set<FieldDeclaration["type"]>(["string", "number", "boolean", "array", "enum"])

const record = (value: unknown, label: string): RecordValue => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`)
  }
  return value as RecordValue
}

const storedId = (value: unknown, label: string): number => {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw new Error(`${label} must be a positive integer`)
  }
  return Number(value)
}

const localId = (value: unknown, label: string): number => {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(`${label} must be a non-negative integer`)
  }
  return Number(value)
}

const position = (value: unknown, label: string): number => {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(`${label} must be a non-negative integer`)
  }
  return Number(value)
}

const nullableStoredId = (value: unknown, label: string): number | null =>
  value === null ? null : storedId(value, label)

const text = (value: unknown, label: string): string => {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} must be a non-empty string`)
  return value
}

const address = (value: unknown, label: string): MetaAddress => {
  const parsed = typeof value === "string" ? parseMetaAddress(value) : null
  if (!parsed) throw new Error(`${label} must be a canonical two-segment Meta address`)
  return parsed
}

const pointerToken = (value: string): string =>
  value.replaceAll("~", "~0").replaceAll("/", "~1")

const templatePointer = (value: MetaAddress): DocumentPointer =>
  `#/template/${pointerToken(value)}` as DocumentPointer

const atomRef = (id: number): AtomRef => `atom:${id}`
const topologyRef = (id: number): TopologyRef => `topology:${id}`
const massRef = (keyId: string): MassRef => `mass:${keyId}`
const reactionRelationRef = (key: string): ReactionRelationRef =>
  (key.startsWith("reaction:") ? key : `reaction:${key}`) as ReactionRelationRef

const matterKey = (wimp: MetaAddress, id: number): string => `${wimp}\u0000${id}`

const runtimeKey = (kind: "atom" | "topology", id: number): RuntimeKey =>
  `${kind}/${id}`

const runtimePath = (
  atom: {parentAtom: number | null; parentTopology: number | null},
  label: string,
): RuntimeKey | "root" => {
  if (atom.parentAtom !== null && atom.parentTopology !== null) {
    throw new Error(`${label} cannot have both Atom and Topology parents`)
  }
  if (atom.parentAtom !== null) return runtimeKey("atom", atom.parentAtom)
  if (atom.parentTopology !== null) return runtimeKey("topology", atom.parentTopology)
  return "root"
}

const parseParams = (input: unknown): void => {
  const params = record(input, "Boundary Graph params")
  const prototype = Object.getPrototypeOf(params)
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error("Boundary Graph params must be a plain empty object")
  }
  const keys = Object.keys(params)
  if (keys.length !== 0) {
    throw new Error("Boundary Graph params must be empty")
  }
}

const declarations = <T>(
  input: BoundaryInitialDeclaration[],
  section: BoundaryInitialDeclaration["section"],
  map: (value: RecordValue, declaration: BoundaryInitialDeclaration) => T,
): T[] => input
  .filter((item) => item.section === section)
  .map((item) => map(record(item.value, `Boundary ${section} declaration`), item))

const fieldDeclarations = (input: BoundaryInitialDeclaration[]): Map<number, FieldDeclaration> => {
  const result = new Map<number, FieldDeclaration>()
  for (const declaration of declarations(input, "fields", (value, item) => ({
    value,
    src: item.src,
  }))) {
    const {value} = declaration
    const id = storedId(value.id, "Boundary Field id")
    const type = text(value.type, "Boundary Field type")
    if (!FIELD_TYPES.has(type as FieldDeclaration["type"])) {
      throw new Error(`Boundary Field ${id} has unsupported type: ${type}`)
    }
    const field: FieldDeclaration = {
      id,
      wimp: address(declaration.src, `Boundary Field ${id} wimp`),
      key: text(value.key, `Boundary Field ${id} key`),
      type: type as FieldDeclaration["type"],
    }
    if (result.has(id)) throw new Error(`Boundary Field id is duplicated: ${id}`)
    result.set(id, field)
  }
  return result
}

const variantDeclarations = (input: BoundaryInitialDeclaration[]): Map<number, VariantDeclaration> => {
  const result = new Map<number, VariantDeclaration>()
  for (const value of declarations(input, "variants", (item) => item)) {
    const id = storedId(value.id, "Boundary Variant id")
    const variant: VariantDeclaration = {
      id,
      field: storedId(value.field, `Boundary Variant ${id} Field`),
      value: text(value.itemValue, `Boundary Variant ${id} value`),
    }
    if (result.has(id)) throw new Error(`Boundary Variant id is duplicated: ${id}`)
    result.set(id, variant)
  }
  return result
}

const stateDeclarations = (input: BoundaryInitialDeclaration[]): Map<number, StateDeclaration> => {
  const result = new Map<number, StateDeclaration>()
  for (const declaration of declarations(input, "states", (value, item) => ({
    value,
    src: item.src,
  }))) {
    const {value} = declaration
    const id = storedId(value.id, "Boundary State id")
    const state: StateDeclaration = {
      id,
      wimp: address(declaration.src, `Boundary State ${id} wimp`),
      name: text(value.name, `Boundary State ${id} name`),
    }
    if (result.has(id)) throw new Error(`Boundary State id is duplicated: ${id}`)
    result.set(id, state)
  }
  return result
}

const matterDeclarations = (
  input: BoundaryInitialProjectionEntry[],
): {
  byKey: Map<string, MatterDeclaration>
  pointers: Map<string, DocumentPointer>
} => {
  const byKey = new Map<string, MatterDeclaration>()
  for (const entry of input) {
    if (entry.path !== "matter") continue
    const value = record(entry.value, "Boundary Matter declaration")
    const wimp = address(value.wimp, "Boundary Matter wimp")
    const id = localId(value.localId, `Boundary Matter ${wimp} localId`)
    const kind = text(value.kind, `Boundary Matter ${wimp}/${id} kind`)
    if (!MATTER_KINDS.has(kind as MatterKind)) {
      throw new Error(`Boundary Matter ${wimp}/${id} has unsupported kind: ${kind}`)
    }
    const parent = value.parent === null
      ? null
      : localId(value.parent, `Boundary Matter ${wimp}/${id} parent`)
    const declaration: MatterDeclaration = {
      wimp,
      localId: id,
      parent,
      position: position(value.position, `Boundary Matter ${wimp}/${id} position`),
      kind: kind as MatterKind,
      ...(kind === "wimp" ? {target: address(value.src, `Boundary Matter ${wimp}/${id} target`)} : {}),
    }
    const key = matterKey(wimp, id)
    if (byKey.has(key)) throw new Error(`Boundary Matter declaration is duplicated: ${wimp}/${id}`)
    byKey.set(key, declaration)
  }

  const pointers = new Map<string, DocumentPointer>()
  const children = new Map<string, MatterDeclaration[]>()
  const roots = new Map<MetaAddress, MatterDeclaration[]>()
  for (const declaration of byKey.values()) {
    if (declaration.parent === null) {
      const items = roots.get(declaration.wimp)
      if (items) items.push(declaration)
      else roots.set(declaration.wimp, [declaration])
      continue
    }
    const parentKey = matterKey(declaration.wimp, declaration.parent)
    if (!byKey.has(parentKey)) {
      throw new Error(`Boundary Matter ${declaration.wimp}/${declaration.localId} has unknown parent ${declaration.parent}`)
    }
    const items = children.get(parentKey)
    if (items) items.push(declaration)
    else children.set(parentKey, [declaration])
  }

  const sort = (items: MatterDeclaration[]): MatterDeclaration[] =>
    items.sort((left, right) => left.position - right.position || left.localId - right.localId)
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const visit = (declaration: MatterDeclaration, pointer: DocumentPointer): void => {
    const key = matterKey(declaration.wimp, declaration.localId)
    if (visiting.has(key)) throw new Error(`Boundary Matter cycle at ${declaration.wimp}/${declaration.localId}`)
    if (visited.has(key)) throw new Error(`Boundary Matter occurrence is reached twice: ${declaration.wimp}/${declaration.localId}`)
    visiting.add(key)
    pointers.set(key, pointer)
    for (const [index, child] of sort(children.get(key) ?? []).entries()) {
      visit(child, `${pointer}/children/${index}/particle` as DocumentPointer)
    }
    visiting.delete(key)
    visited.add(key)
  }

  for (const [wimp, items] of roots) {
    for (const [index, declaration] of sort(items).entries()) {
      visit(declaration, `${templatePointer(wimp)}/matter/${index}` as DocumentPointer)
    }
  }
  if (visited.size !== byKey.size) throw new Error("Boundary Matter graph contains an unreachable declaration")
  return {byKey, pointers}
}

const resolveValue = (
  raw: unknown,
  field: FieldDeclaration,
  variants: Map<number, VariantDeclaration>,
): JsonValue => {
  if (raw === null) return null
  if (field.type === "string") {
    if (typeof raw !== "string") throw new Error(`Boundary Field ${field.wimp}.${field.key} value must be a string`)
    return raw
  }
  if (field.type === "number") {
    if (typeof raw !== "number" || !Number.isFinite(raw)) {
      throw new Error(`Boundary Field ${field.wimp}.${field.key} value must be a finite number`)
    }
    return raw
  }
  if (field.type === "boolean") {
    if (typeof raw !== "boolean") throw new Error(`Boundary Field ${field.wimp}.${field.key} value must be a boolean`)
    return raw
  }
  if (field.type === "array") {
    if (!Array.isArray(raw)) throw new Error(`Boundary Field ${field.wimp}.${field.key} value must be an array`)
    return raw.map((item) => {
      const value = typeof item === "number" ? item : typeof item === "string" ? Number(item) : Number.NaN
      if (!Number.isFinite(value)) {
        throw new Error(`Boundary Field ${field.wimp}.${field.key} contains a non-numeric array item`)
      }
      return value
    })
  }
  const reference = record(raw, `Boundary enum Field ${field.wimp}.${field.key} value`)
  if (reference.kind !== "enum") {
    throw new Error(`Boundary enum Field ${field.wimp}.${field.key} value must be a Variant reference`)
  }
  const variant = variants.get(storedId(reference.variant, `Boundary enum Field ${field.wimp}.${field.key} Variant`))
  if (!variant || variant.field !== field.id) {
    throw new Error(`Boundary enum Field ${field.wimp}.${field.key} references a foreign Variant`)
  }
  return variant.value
}

const runtimeMass = (value: unknown, atomId: number): RuntimeMass[] => {
  if (value === undefined) return []
  if (!Array.isArray(value)) throw new Error(`Boundary Atom ${atomId} Mass must be an array`)
  const keys = new Set<string>()
  return value.map((raw, index) => {
    const item = record(raw, `Boundary Atom ${atomId} Mass ${index}`)
    const key = text(item.key, `Boundary Atom ${atomId} Mass ${index} key`)
    if (keys.has(key)) throw new Error(`Boundary Atom ${atomId} Mass key is duplicated: ${key}`)
    keys.add(key)
    const keyId = text(item.keyId, `Boundary Atom ${atomId} Mass ${key} key identity`)
    const format = text(item.format, `Boundary Atom ${atomId} Mass ${key} format`)
    if (format !== "json" && format !== "binary") {
      throw new Error(`Boundary Atom ${atomId} Mass ${key} format is unsupported: ${format}`)
    }
    const label = item.label === null ? null : text(item.label, `Boundary Atom ${atomId} Mass ${key} label`)
    const description = item.description === null
      ? null
      : text(item.description, `Boundary Atom ${atomId} Mass ${key} description`)
    return {
      ref: massRef(keyId),
      key,
      format,
      label,
      description,
      content: "lazy",
    }
  })
}

const atomNode = (
  atom: BoundaryInitialAtom,
  declaration: DocumentPointer,
  fields: Map<number, FieldDeclaration>,
  variants: Map<number, VariantDeclaration>,
  states: Map<number, StateDeclaration>,
  mass: unknown,
): Omit<RuntimeAtom, "children"> => {
  const meta = address(atom.wimp, `Boundary Atom ${atom.id} Meta`)
  const values: {[field: string]: JsonValue} = {}
  for (const current of atom.values) {
    const field = fields.get(storedId(current.field, `Boundary Atom ${atom.id} Field`))
    if (!field || field.wimp !== meta) {
      throw new Error(`Boundary Atom ${atom.id} references a Field outside ${meta}`)
    }
    values[field.key] = resolveValue(current.value, field, variants)
  }
  const state = atom.state === null ? null : states.get(storedId(atom.state, `Boundary Atom ${atom.id} State`))
  if (atom.state !== null && (!state || state.wimp !== meta)) {
    throw new Error(`Boundary Atom ${atom.id} references a State outside ${meta}`)
  }
  return {
    ref: atomRef(atom.id),
    kind: "atom",
    declaration,
    meta,
    state: state?.name ?? null,
    values,
    mass: runtimeMass(mass, atom.id),
  }
}

const originPointer = (
  origin: string,
  kind: "atom" | "topology",
  metaOrTopology: MetaAddress | RuntimeTopology["topology"],
  parent: RuntimeKey | "root",
  matters: ReturnType<typeof matterDeclarations>,
): DocumentPointer => {
  const parts = origin.split("\u0000")
  if (parts.length !== 3) throw new Error(`Boundary ${kind} origin is malformed`)
  const [originKind, rawWimp, rawLocalId] = parts
  const wimp = address(rawWimp, `Boundary ${kind} origin wimp`)
  const id = localId(Number(rawLocalId), `Boundary ${kind} origin localId`)
  if (originKind === "wimp") {
    if (kind !== "atom" || parent !== "root" || id !== 0 || metaOrTopology !== wimp) {
      throw new Error(`Boundary ${kind} has an invalid root WIMP origin`)
    }
    return templatePointer(wimp)
  }
  if (originKind !== "matter") throw new Error(`Boundary ${kind} origin kind is unsupported: ${originKind}`)
  const key = matterKey(wimp, id)
  const matter = matters.byKey.get(key)
  const pointer = matters.pointers.get(key)
  if (!matter || !pointer) throw new Error(`Boundary ${kind} origin Matter is unavailable: ${wimp}/${id}`)
  if (kind === "atom") {
    if (matter.kind !== "wimp" || matter.target !== metaOrTopology) {
      throw new Error(`Boundary Atom origin does not produce its Meta at ${wimp}/${id}`)
    }
  } else if (matter.kind !== metaOrTopology) {
    throw new Error(`Boundary Topology origin kind does not match ${wimp}/${id}`)
  }
  return pointer
}

const runtimeRecords = (
  originByInstance: ReadonlyMap<string, string>,
  parentByInstance: ReadonlyMap<string, string>,
  entries: BoundaryInitialProjectionEntry[],
  atoms: BoundaryInitialAtom[],
  declarationRows: BoundaryInitialDeclaration[],
  matters: ReturnType<typeof matterDeclarations>,
): Map<RuntimeKey, RuntimeRecord> => {
  const atomById = new Map(atoms.map((atom) => [atom.id, atom]))
  const fields = fieldDeclarations(declarationRows)
  const variants = variantDeclarations(declarationRows)
  const states = stateDeclarations(declarationRows)
  const result = new Map<RuntimeKey, RuntimeRecord>()

  for (const [sequence, entry] of entries.entries()) {
    if (typeof entry.path !== "string") continue
    const match = /^(atom|topology)\/([1-9]\d*)$/.exec(entry.path)
    if (!match) continue
    const kind = match[1] as "atom" | "topology"
    const id = storedId(Number(match[2]), `Boundary ${kind} path id`)
    const key = runtimeKey(kind, id)
    if (result.has(key)) throw new Error(`Boundary runtime entry is duplicated: ${key}`)
    const value = record(entry.value, `Boundary runtime ${key}`)
    const indexedParent = parentByInstance.get(key)
    const origin = originByInstance.get(key)
    if (!indexedParent || !origin) throw new Error(`Boundary runtime indexes are incomplete for ${key}`)

    if (kind === "atom") {
      const head = record(value.atom, `Boundary runtime ${key} Atom`)
      if (storedId(head.id, `Boundary runtime ${key} Atom id`) !== id) {
        throw new Error(`Boundary runtime ${key} Atom id does not match its path`)
      }
      const parent = runtimePath({
        parentAtom: nullableStoredId(head.parentAtom, `Boundary runtime ${key} parent Atom`),
        parentTopology: nullableStoredId(head.parentTopology, `Boundary runtime ${key} parent Topology`),
      }, `Boundary runtime ${key}`)
      if (indexedParent !== parent) throw new Error(`Boundary runtime ${key} parent index is stale`)
      const meta = address(head.wimp, `Boundary runtime ${key} Meta`)
      const current = atomById.get(id)
      if (!current || current.wimp !== meta) throw new Error(`Boundary current Atom data is unavailable for ${key}`)
      const declaration = originPointer(origin, "atom", meta, parent, matters)
      result.set(key, {
        key,
        parent,
        position: position(head.position, `Boundary runtime ${key} position`),
        sequence,
        node: atomNode(current, declaration, fields, variants, states, value.mass),
      })
      continue
    }

    const parent = runtimePath({
      parentAtom: nullableStoredId(value.parentAtom, `Boundary runtime ${key} parent Atom`),
      parentTopology: nullableStoredId(value.parentTopology, `Boundary runtime ${key} parent Topology`),
    }, `Boundary runtime ${key}`)
    if (parent === "root") throw new Error(`Boundary runtime ${key} Topology cannot be a root`)
    if (indexedParent !== parent) throw new Error(`Boundary runtime ${key} parent index is stale`)
    const topology = text(value.kind, `Boundary runtime ${key} kind`)
    if (topology !== "fuzzy" && topology !== "axion" && topology !== "macho") {
      throw new Error(`Boundary runtime ${key} has unsupported Topology kind: ${topology}`)
    }
    result.set(key, {
      key,
      parent,
      position: position(value.position, `Boundary runtime ${key} position`),
      sequence,
      node: {
        ref: topologyRef(id),
        kind: "topology",
        declaration: originPointer(origin, "topology", topology, parent, matters),
        topology,
      },
    })
  }
  for (const atom of atoms) {
    if (!result.has(runtimeKey("atom", atom.id))) {
      throw new Error(`Boundary runtime projection is missing Atom ${atom.id}`)
    }
  }
  return result
}

const nestedRuntime = (root: MetaAddress, records: Map<RuntimeKey, RuntimeRecord>): RuntimeNode[] => {
  const children = new Map<RuntimeKey | "root", RuntimeRecord[]>()
  for (const item of records.values()) {
    if (item.parent !== "root" && !records.has(item.parent)) {
      throw new Error(`Boundary runtime ${item.key} has an unavailable parent ${item.parent}`)
    }
    const siblings = children.get(item.parent)
    if (siblings) siblings.push(item)
    else children.set(item.parent, [item])
  }
  const sort = (items: RuntimeRecord[]): RuntimeRecord[] =>
    items.sort((left, right) => left.position - right.position || left.sequence - right.sequence)
  const visiting = new Set<RuntimeKey>()
  const visit = (item: RuntimeRecord): RuntimeNode => {
    if (visiting.has(item.key)) throw new Error(`Boundary runtime cycle at ${item.key}`)
    visiting.add(item.key)
    const descendants = sort(children.get(item.key) ?? []).map(visit)
    visiting.delete(item.key)
    return descendants.length === 0 ? item.node : {...item.node, children: descendants}
  }
  return sort(children.get("root") ?? [])
    .filter((item): item is RuntimeRecord & {node: Omit<RuntimeAtom, "children">} =>
      item.node.kind === "atom" && item.node.meta === root)
    .map(visit)
}

const currentRoot = (records: Map<RuntimeKey, RuntimeRecord>): MetaAddress => {
  const roots = [...records.values()].filter(
    (item): item is RuntimeRecord & {node: Omit<RuntimeAtom, "children">} =>
      item.parent === "root" && item.node.kind === "atom",
  )
  if (roots.length !== 1) {
    throw new Error(
      `Boundary Graph requires exactly one current root Atom; received ${roots.length}`,
    )
  }
  return roots[0]!.node.meta
}

const runtimeReactionRelations = (
  relations: readonly ReactionRelation[],
  records: ReadonlyMap<RuntimeKey, RuntimeRecord>,
  declarations: readonly BoundaryInitialDeclaration[],
): RuntimeReactionRelation[] => {
  const states = stateDeclarations([...declarations])
  return relations.map((relation) => {
    const source = records.get(runtimeKey("atom", storedId(relation.source.atomId, "Reaction source Atom")))
    const target = records.get(runtimeKey("atom", storedId(relation.target.atomId, "Reaction target Atom")))
    if (source?.node.kind !== "atom" || source.node.meta !== relation.source.wimp) {
      throw new Error(`Reaction relation ${relation.key} source Atom is unavailable`)
    }
    if (target?.node.kind !== "atom" || target.node.meta !== relation.target.wimp) {
      throw new Error(`Reaction relation ${relation.key} target Atom is unavailable`)
    }
    const sourceNode = source.node
    const targetNode = target.node
    const sourceStates = relation.source.states.map((state) => {
      const declaration = states.get(storedId(state.id, `Reaction relation ${relation.key} source State`))
      if (!declaration || declaration.wimp !== sourceNode.meta || declaration.name !== state.name) {
        throw new Error(`Reaction relation ${relation.key} source State is unavailable`)
      }
      return declaration.name
    })
    const targetStates = relation.target.stateIds.map((id) => {
      const declaration = states.get(storedId(id, `Reaction relation ${relation.key} target State`))
      if (!declaration || declaration.wimp !== targetNode.meta) {
        throw new Error(`Reaction relation ${relation.key} target State is unavailable`)
      }
      return declaration.name
    })
    return {
      ref: reactionRelationRef(text(relation.key, "Reaction relation key")),
      kind: "reaction",
      reaction: {
        meta: targetNode.meta,
        key: text(relation.reactionKey, `Reaction relation ${relation.key} declaration key`),
      },
      source: {
        atom: sourceNode.ref,
        states: sourceStates,
      },
      target: {
        atom: targetNode.ref,
        states: targetStates,
      },
      active: targetNode.state !== null && targetStates.includes(targetNode.state),
    }
  })
}

type CurrentGraphData = {
  records: Map<RuntimeKey, RuntimeRecord>
  reactions: RuntimeReactionRelation[]
}

const currentGraphData = async (
  boundary: BoundaryDatabase,
): Promise<CurrentGraphData> => {
  const snapshot = await boundary.graphSnapshot()
  const matters = matterDeclarations(snapshot.initialProjection.entries)
  const records = runtimeRecords(
    snapshot.originByInstance,
    snapshot.parentByInstance,
    snapshot.initialProjection.entries,
    snapshot.initialState.atoms,
    snapshot.initialState.declarations,
    matters,
  )
  return {
    records,
    reactions: runtimeReactionRelations(
      snapshot.initialState.reactionRelations,
      records,
      snapshot.initialState.declarations,
    ),
  }
}

const currentRecords = async (boundary: BoundaryDatabase): Promise<Map<RuntimeKey, RuntimeRecord>> =>
  (await currentGraphData(boundary)).records

const runtimeAtomRefs = (roots: readonly RuntimeNode[]): Set<AtomRef> => {
  const refs = new Set<AtomRef>()
  const visit = (node: RuntimeNode): void => {
    if (node.kind === "atom") refs.add(node.ref)
    node.children?.forEach(visit)
  }
  roots.forEach(visit)
  return refs
}

const scopedReactions = (
  reactions: readonly RuntimeReactionRelation[],
  roots: readonly RuntimeNode[],
): RuntimeReactionRelation[] => {
  const atoms = runtimeAtomRefs(roots)
  return reactions.filter((reaction) =>
    atoms.has(reaction.source.atom) && atoms.has(reaction.target.atom)
  )
}

/**
 * Reads the current Boundary world without storing or mutating a Graph mirror.
 * Internal storage identities are used only while resolving public names and paths.
 */
export async function readBoundaryGraphProjection(
  boundary: BoundaryDatabase,
  input: unknown,
): Promise<BoundaryGraphProjection> {
  parseParams(input)
  const current = await currentGraphData(boundary)
  const records = current.records
  const root = currentRoot(records)
  const roots = nestedRuntime(root, records)
  return {
    root,
    runtime: {roots, reactions: scopedReactions(current.reactions, roots)},
  }
}

/**
Resolves one stable public Atom ref against the current Boundary cut.

@returns Internal Atom ID only to the local Boundary caller, or `null` when the
locator is stale or violates its root/Meta guards.
*/
export async function resolveBoundaryRuntimeAtom(
  boundary: BoundaryDatabase,
  locator: MetaRuntimeAtomLocator,
): Promise<number | null> {
  const records = await currentRecords(boundary)
  if (currentRoot(records) !== locator.root) return null
  const match = /^atom:([1-9]\d*)$/.exec(locator.ref)
  if (!match) return null
  const id = Number(match[1])
  const selected = records.get(`atom/${id}`)
  if (!selected || selected.node.kind !== "atom" || selected.node.meta !== locator.meta ||
      selected.node.ref !== locator.ref) return null
  return id
}

/** Exact-root projection used only by detached checkpoint and dissolve proofs. */
export async function readBoundaryGraphProjectionForRoot(
  boundary: BoundaryDatabase,
  root: MetaAddress,
): Promise<BoundaryGraphProjection> {
  const current = await currentGraphData(boundary)
  const roots = nestedRuntime(root, current.records)
  return {
    root,
    runtime: {roots, reactions: scopedReactions(current.reactions, roots)},
  }
}
