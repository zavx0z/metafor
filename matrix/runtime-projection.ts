import type {
  MatrixRuntimeActorEntity,
  MatrixRuntimeTopology,
  MatrixRuntimeValueRecord,
} from "@metafor/types/matrix/runtime"
import type {Particle} from "@metafor/types/force/particle"
import {resolveForceFieldId, resolveForceFieldsPayload} from "@metafor/types/force/fields"
import {applyForceDelta, forceValueEqual, replaceForceRecord} from "@metafor/types/force/delta"

const sections = [
  "meta", "fields", "variants", "states", "transitions", "conditions",
  "processes", "reactions", "matter", "mass", "bulk",
] as const

export type RuntimeDeclarationSection = typeof sections[number]
export type RuntimeDeclarationRecord = Record<string, unknown>
export type RuntimeProjectionChange = {changed: boolean; affectedActorIds: number[]}

type Address =
  | {kind: "actor"; id: number}
  | {kind: "topology"; id: number}
  | {kind: "declaration"; src: string; section: RuntimeDeclarationSection; localId: string}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const positiveId = (value: unknown): number | null =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null

const parseAddress = (raw: unknown): Address | null => {
  if (typeof raw !== "string") return null
  const path = raw.replace(/^\/+/, "")
  const actor = /^actor\/(\d+)$/.exec(path)
  if (actor) return {kind: "actor", id: Number(actor[1])}
  const topology = /^topology\/(\d+)$/.exec(path)
  if (topology) return {kind: "topology", id: Number(topology[1])}
  const declaration = new RegExp(`^declaration/(.+)/(${sections.join("|")})(?:/([^/]+))?$`).exec(path)
  return declaration ? {
    kind: "declaration",
    src: declaration[1]!,
    section: declaration[2]! as RuntimeDeclarationSection,
    localId: declaration[3] ?? "0",
  } : null
}

const clone = <T>(value: T): T => structuredClone(value)
const key = (kind: "actor" | "topology", id: number): string => `${kind}:${id}`

const parentKey = (entity: {parentActor?: unknown; parentTopology?: unknown}): string | null => {
  const actor = positiveId(entity.parentActor)
  if (actor !== null) return `actor:${actor}`
  const topology = positiveId(entity.parentTopology)
  return topology === null ? null : `topology:${topology}`
}

const actorEntity = (value: unknown, id: number): MatrixRuntimeActorEntity | null => {
  if (!isRecord(value) || !isRecord(value.actor) || positiveId(value.actor.id) !== id || typeof value.actor.wimp !== "string") return null
  return clone({
    actor: value.actor,
    values: Array.isArray(value.values) ? value.values : [],
    valueRecords: Array.isArray(value.valueRecords) ? value.valueRecords : [],
    valueItems: Array.isArray(value.valueItems) ? value.valueItems : [],
    state: typeof value.state === "string" ? value.state : null,
  } as unknown as MatrixRuntimeActorEntity)
}

const topologyEntity = (value: unknown, id: number): MatrixRuntimeTopology | null => {
  if (!isRecord(value) || positiveId(value.id) !== id) return null
  if (value.kind !== "fuzzy" && value.kind !== "axion" && value.kind !== "macho") return null
  return clone(value as unknown as MatrixRuntimeTopology)
}

/** Exact actor-centric projection feeding the packed Matrix store. */
export class MatrixRuntimeProjectionStore {
  readonly actors = new Map<number, MatrixRuntimeActorEntity>()
  readonly topologies = new Map<number, MatrixRuntimeTopology>()
  readonly childrenByParent = new Map<string, Set<string>>()
  readonly actorIdsByWimp = new Map<string, Set<number>>()
  readonly declarations = new Map<string, Map<RuntimeDeclarationSection, Map<string, RuntimeDeclarationRecord>>>()
  readonly fieldValuesByActorId = new Map<number, Map<number, unknown>>()

  apply(part: Particle): RuntimeProjectionChange {
    if (part.part !== "graviton") return {changed: false, affectedActorIds: []}
    const address = parseAddress(part.path)
    if (!address) return {changed: false, affectedActorIds: []}
    if (part.op === "test") {
      if (part.value !== undefined && !forceValueEqual(this.read(address), part.value)) {
        throw new Error(`Matrix projection test failed at ${String(part.path)}`)
      }
      return {changed: false, affectedActorIds: []}
    }
    if (part.op === "copy" || part.op === "move") return this.transfer(part, address)
    if (part.op === "remove") return this.remove(address)
    if (part.op !== "add" && part.op !== "replace") return {changed: false, affectedActorIds: []}
    return this.upsert(address, part.value, part.op)
  }

  applyFields(part: Particle): RuntimeProjectionChange {
    if (part.part !== "gluon" && part.part !== "higgs") return {changed: false, affectedActorIds: []}
    const actorId = positiveId(part.path)
    const fields = resolveForceFieldsPayload(part.value)
    if (actorId === null || !fields || !this.actors.has(actorId) || Object.keys(fields).length !== 1) {
      return {changed: false, affectedActorIds: []}
    }
    const values = this.fieldValuesByActorId.get(actorId) ?? new Map<number, unknown>()
    this.fieldValuesByActorId.set(actorId, values)
    const [rawId, value] = Object.entries(fields)[0]!
    const fieldId = resolveForceFieldId(rawId)
    if (fieldId === null) return {changed: false, affectedActorIds: []}
    if (part.op === "test") {
      if (!forceValueEqual(values.get(fieldId), value)) throw new Error(`Matrix field test failed for actor ${actorId}, field ${fieldId}`)
      return {changed: false, affectedActorIds: []}
    }
    if (part.op === "remove") return {changed: values.delete(fieldId), affectedActorIds: values.has(fieldId) ? [] : [actorId]}
    if (part.op !== "add" && part.op !== "replace") return {changed: false, affectedActorIds: []}
    if (forceValueEqual(values.get(fieldId), value)) return {changed: false, affectedActorIds: []}
    values.set(fieldId, clone(value))
    return {changed: true, affectedActorIds: [actorId]}
  }

  actorIdsForWimp(src: string): number[] {
    return [...(this.actorIdsByWimp.get(src) ?? [])]
  }

  declaration(src: string, section: RuntimeDeclarationSection): RuntimeDeclarationRecord[] {
    return [...(this.declarations.get(src)?.get(section)?.values() ?? [])]
  }

  setActorState(actorId: number, state: string | null): boolean {
    const entity = this.actors.get(actorId)
    if (!entity || entity.state === state) return false
    entity.state = state
    return true
  }

  private read(address: Address): unknown {
    if (address.kind === "actor") return this.actors.get(address.id)
    if (address.kind === "topology") return this.topologies.get(address.id)
    return this.declarations.get(address.src)?.get(address.section)?.get(address.localId)
  }

  private upsert(address: Address, value: unknown, op: "add" | "replace"): RuntimeProjectionChange {
    if (address.kind === "actor") {
      const current = this.actors.get(address.id)
      if (current) {
        if (!isRecord(value)) return {changed: false, affectedActorIds: []}
        const before = clone(current)
        this.unlink("actor", address.id, current.actor)
        if (op === "add") replaceForceRecord(current as unknown as Record<string, unknown>, value)
        else applyForceDelta(current as unknown as Record<string, unknown>, value)
        this.link("actor", address.id, current.actor)
        this.indexActorValues(current, true)
        const changed = !forceValueEqual(before, current)
        return {changed, affectedActorIds: changed ? [address.id] : []}
      }
      const next = actorEntity(value, address.id)
      if (!next) return {changed: false, affectedActorIds: []}
      this.actors.set(address.id, next)
      this.link("actor", address.id, next.actor)
      this.indexActorValues(next, true)
      return {changed: true, affectedActorIds: [address.id]}
    }

    if (address.kind === "topology") {
      const current = this.topologies.get(address.id)
      if (current) {
        if (!isRecord(value)) return {changed: false, affectedActorIds: []}
        const before = clone(current)
        this.unlink("topology", address.id, current)
        if (op === "add") replaceForceRecord(current as unknown as Record<string, unknown>, value)
        else applyForceDelta(current as unknown as Record<string, unknown>, value)
        this.link("topology", address.id, current)
        const changed = !forceValueEqual(before, current)
        return {changed, affectedActorIds: changed ? this.descendantActors("topology", address.id) : []}
      }
      const next = topologyEntity(value, address.id)
      if (!next) return {changed: false, affectedActorIds: []}
      this.topologies.set(address.id, next)
      this.link("topology", address.id, next)
      return {changed: true, affectedActorIds: []}
    }

    if (!isRecord(value)) return {changed: false, affectedActorIds: []}
    let bySection = this.declarations.get(address.src)
    if (!bySection) {
      bySection = new Map()
      this.declarations.set(address.src, bySection)
    }
    let records = bySection.get(address.section)
    if (!records) {
      records = new Map()
      bySection.set(address.section, records)
    }
    const current = records.get(address.localId)
    if (current) {
      const before = clone(current)
      if (op === "add") replaceForceRecord(current, value)
      else applyForceDelta(current, value)
      const changed = !forceValueEqual(before, current)
      return {changed, affectedActorIds: changed ? this.actorIdsForWimp(address.src) : []}
    }
    records.set(address.localId, clone(value))
    return {changed: true, affectedActorIds: this.actorIdsForWimp(address.src)}
  }

  private remove(address: Address): RuntimeProjectionChange {
    if (address.kind === "actor") {
      if (!this.actors.has(address.id)) return {changed: false, affectedActorIds: []}
      const affected = this.descendantActors("actor", address.id)
      this.removeBranch("actor", address.id)
      return {changed: true, affectedActorIds: affected}
    }
    if (address.kind === "topology") {
      if (!this.topologies.has(address.id)) return {changed: false, affectedActorIds: []}
      const affected = this.descendantActors("topology", address.id)
      this.removeBranch("topology", address.id)
      return {changed: true, affectedActorIds: affected}
    }
    const records = this.declarations.get(address.src)?.get(address.section)
    if (!records?.delete(address.localId)) return {changed: false, affectedActorIds: []}
    if (records.size === 0) this.declarations.get(address.src)?.delete(address.section)
    return {changed: true, affectedActorIds: this.actorIdsForWimp(address.src)}
  }

  private transfer(part: Particle, target: Address): RuntimeProjectionChange {
    const source = parseAddress(part.from)
    if (!source || source.kind !== target.kind) return {changed: false, affectedActorIds: []}
    const current = this.read(source)
    if (current === undefined) return {changed: false, affectedActorIds: []}
    if (part.op === "copy") {
      const copied = clone(current)
      if (source.kind === "actor" && target.kind === "actor") (copied as MatrixRuntimeActorEntity).actor.id = target.id
      if (source.kind === "topology" && target.kind === "topology") (copied as MatrixRuntimeTopology).id = target.id
      return this.upsert(target, copied, "add")
    }
    const removed = this.remove(source)
    const moved = clone(current)
    if (target.kind === "actor" && isRecord(moved) && isRecord(moved.actor)) moved.actor.id = target.id
    if (target.kind === "topology" && isRecord(moved)) moved.id = target.id
    const added = this.upsert(target, moved, "add")
    return {changed: removed.changed || added.changed, affectedActorIds: [...new Set([...removed.affectedActorIds, ...added.affectedActorIds])]}
  }

  private indexActorValues(entity: MatrixRuntimeActorEntity, exact: boolean): void {
    const fields = exact ? new Map<number, unknown>() : this.fieldValuesByActorId.get(entity.actor.id) ?? new Map<number, unknown>()
    const records = new Map(entity.valueRecords.map((record) => [record.id, record] as const))
    const items = new Map<number, string[]>()
    for (const item of entity.valueItems) {
      const current = items.get(item.value) ?? []
      current[item.position] = item.itemValue
      items.set(item.value, current)
    }
    for (const binding of entity.values) {
      const record = records.get(binding.value)
      if (record) fields.set(binding.field, this.decode(record, items.get(record.id)))
    }
    this.fieldValuesByActorId.set(entity.actor.id, fields)
  }

  private decode(record: MatrixRuntimeValueRecord, items: string[] | undefined): unknown {
    if (record.kind === "boolean") return record.boolean === true
    if (record.kind === "number") return record.number ?? 0
    if (record.kind === "string") return record.text ?? ""
    if (record.kind === "list") return items ?? []
    if (record.kind === "enum") {
      for (const declarations of this.declarations.values()) {
        for (const variant of declarations.get("variants")?.values() ?? []) {
          if (positiveId(variant.id) === record.variant) return variant.itemValue ?? variant.value ?? null
        }
      }
      return record.variant ?? null
    }
    return null
  }

  private link(kind: "actor" | "topology", id: number, entity: {parentActor?: unknown; parentTopology?: unknown; wimp?: unknown}): void {
    const parent = parentKey(entity)
    if (parent) {
      const children = this.childrenByParent.get(parent)
      if (children) children.add(key(kind, id))
      else this.childrenByParent.set(parent, new Set([key(kind, id)]))
    }
    if (kind === "actor" && typeof entity.wimp === "string") {
      const ids = this.actorIdsByWimp.get(entity.wimp)
      if (ids) ids.add(id)
      else this.actorIdsByWimp.set(entity.wimp, new Set([id]))
    }
  }

  private unlink(kind: "actor" | "topology", id: number, entity: {parentActor?: unknown; parentTopology?: unknown; wimp?: unknown}): void {
    const parent = parentKey(entity)
    if (parent) {
      this.childrenByParent.get(parent)?.delete(key(kind, id))
      if (this.childrenByParent.get(parent)?.size === 0) this.childrenByParent.delete(parent)
    }
    if (kind === "actor" && typeof entity.wimp === "string") {
      this.actorIdsByWimp.get(entity.wimp)?.delete(id)
      if (this.actorIdsByWimp.get(entity.wimp)?.size === 0) this.actorIdsByWimp.delete(entity.wimp)
    }
  }

  private descendantActors(kind: "actor" | "topology", id: number): number[] {
    const found: number[] = []
    const visit = (node: string): void => {
      if (node.startsWith("actor:")) found.push(Number(node.slice(6)))
      for (const child of this.childrenByParent.get(node) ?? []) visit(child)
    }
    visit(key(kind, id))
    return found
  }

  private removeBranch(kind: "actor" | "topology", id: number): void {
    const node = key(kind, id)
    for (const child of [...(this.childrenByParent.get(node) ?? [])]) {
      const [childKind, rawId] = child.split(":") as ["actor" | "topology", string]
      this.removeBranch(childKind, Number(rawId))
    }
    this.childrenByParent.delete(node)
    if (kind === "actor") {
      const entity = this.actors.get(id)
      if (entity) this.unlink(kind, id, entity.actor)
      this.actors.delete(id)
      this.fieldValuesByActorId.delete(id)
    } else {
      const entity = this.topologies.get(id)
      if (entity) this.unlink(kind, id, entity)
      this.topologies.delete(id)
    }
  }
}
