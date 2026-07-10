import type {
  MatrixRuntimeActorEntity,
  MatrixRuntimeTopology,
  MatrixRuntimeValueRecord,
} from "@metafor/types/matrix/runtime"
import type {Particle} from "@metafor/types/force/particle"
import {resolveForceFieldId, resolveForceFieldsPayload} from "@metafor/types/force/fields"

const declarationSections = [
  "meta", "fields", "variants", "states", "transitions", "conditions",
  "processes", "reactions", "matter", "mass", "bulk",
] as const

export type MatrixDeclarationSection = typeof declarationSections[number]
export type MatrixDeclarationRecord = Record<string, unknown>

type StructuralAddress =
  | {kind: "actor"; id: number}
  | {kind: "topology"; id: number}
  | {kind: "declaration"; src: string; section: MatrixDeclarationSection; localId: string}

export type MatrixProjectionChange = {
  changed: boolean
  affectedActorIds: number[]
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const positiveId = (value: unknown): number | null =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null

const structuralAddress = (rawPath: Particle["path"]): StructuralAddress | null => {
  if (typeof rawPath !== "string") return null
  const path = rawPath.replace(/^\/+/, "")
  const actor = /^actor\/(\d+)$/.exec(path)
  if (actor) return {kind: "actor", id: Number(actor[1])}
  const topology = /^topology\/(\d+)$/.exec(path)
  if (topology) return {kind: "topology", id: Number(topology[1])}
  const sections = declarationSections.join("|")
  const declaration = new RegExp(`^declaration/(.+)/(${sections})(?:/([^/]+))?$`).exec(path)
  if (!declaration) return null
  return {
    kind: "declaration",
    src: declaration[1]!,
    section: declaration[2]! as MatrixDeclarationSection,
    localId: declaration[3] ?? "0",
  }
}

const clone = <T>(value: T): T => structuredClone(value)

const same = (left: unknown, right: unknown): boolean => {
  if (Object.is(left, right)) return true
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((item, index) => same(item, right[index]))
  }
  if (isRecord(left) && isRecord(right)) {
    const leftKeys = Object.keys(left)
    const rightKeys = Object.keys(right)
    return leftKeys.length === rightKeys.length && leftKeys.every((key) => key in right && same(left[key], right[key]))
  }
  return false
}

/** Merge a replace delta while retaining object identity for the addressed entity. */
const patchRecord = (target: Record<string, unknown>, delta: Record<string, unknown>): void => {
  for (const [key, value] of Object.entries(delta)) {
    if (isRecord(value) && isRecord(target[key])) patchRecord(target[key] as Record<string, unknown>, value)
    else target[key] = clone(value)
  }
}

const parentKey = (entity: {parentActor?: unknown; parentTopology?: unknown}): string | null => {
  const parentActor = positiveId(entity.parentActor)
  if (parentActor !== null) return `actor:${parentActor}`
  const parentTopology = positiveId(entity.parentTopology)
  return parentTopology === null ? null : `topology:${parentTopology}`
}

const childKey = (kind: "actor" | "topology", id: number): string => `${kind}:${id}`

const actorEntity = (value: unknown, id: number): MatrixRuntimeActorEntity | null => {
  if (!isRecord(value) || !isRecord(value.actor)) return null
  const actorId = positiveId(value.actor.id)
  if (actorId !== id || typeof value.actor.wimp !== "string") return null
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

/**
 * Actor-centric Matrix projection. It is deliberately independent from the
 * packed weak-runtime arrays: a local structural patch never replaces another
 * actor record and reconnect replay only upserts the addressed entity.
 */
export class MatrixProjectionStore {
  readonly actors = new Map<number, MatrixRuntimeActorEntity>()
  readonly topologies = new Map<number, MatrixRuntimeTopology>()
  readonly childrenByParent = new Map<string, Set<string>>()
  readonly actorIdsByWimp = new Map<string, Set<number>>()
  readonly declarations = new Map<string, Map<MatrixDeclarationSection, Map<string, MatrixDeclarationRecord>>>()
  readonly fieldValuesByActorId = new Map<number, Map<number, unknown>>()

  apply(part: Particle): MatrixProjectionChange {
    if (part.part !== "graviton") return {changed: false, affectedActorIds: []}
    const address = structuralAddress(part.path)
    if (!address) return {changed: false, affectedActorIds: []}
    if (part.op === "test") {
      if (part.value === undefined) return {changed: false, affectedActorIds: []}
      const current = this.read(address)
      if (!same(current, part.value)) throw new Error(`Matrix projection test failed at ${String(part.path)}`)
      return {changed: false, affectedActorIds: []}
    }
    if (part.op === "move" || part.op === "copy") return this.applyTransfer(part, address)
    if (part.op === "remove") return this.remove(address)
    if (part.op !== "add" && part.op !== "replace") return {changed: false, affectedActorIds: []}
    return this.upsert(address, part.value, part.op)
  }

  applyFields(part: Particle): MatrixProjectionChange {
    if (part.part !== "gluon" && part.part !== "higgs") return {changed: false, affectedActorIds: []}
    const actorId = positiveId(part.path)
    const fields = resolveForceFieldsPayload(part.value)
    if (actorId === null || fields === null || !this.actors.has(actorId)) return {changed: false, affectedActorIds: []}
    if (part.op !== "add" && part.op !== "replace" && part.op !== "remove" && part.op !== "test") {
      return {changed: false, affectedActorIds: []}
    }
    const values = this.fieldValuesByActorId.get(actorId) ?? new Map<number, unknown>()
    this.fieldValuesByActorId.set(actorId, values)
    let changed = false
    for (const [rawId, value] of Object.entries(fields)) {
      const fieldId = resolveForceFieldId(rawId)
      if (fieldId === null) continue
      if (part.op === "test") {
        if (!same(values.get(fieldId), value)) throw new Error(`Matrix field test failed for actor ${actorId}, field ${fieldId}`)
      } else if (part.op === "remove") {
        changed = values.delete(fieldId) || changed
      } else if (!same(values.get(fieldId), value)) {
        values.set(fieldId, clone(value))
        changed = true
      }
    }
    return {changed, affectedActorIds: changed ? [actorId] : []}
  }

  actorIdsForWimp(src: string): number[] {
    return [...(this.actorIdsByWimp.get(src) ?? [])]
  }

  declaration(src: string, section: MatrixDeclarationSection): MatrixDeclarationRecord[] {
    return [...(this.declarations.get(src)?.get(section)?.values() ?? [])]
  }

  setActorState(actorId: number, state: string | null): boolean {
    const entity = this.actors.get(actorId)
    if (!entity || entity.state === state) return false
    entity.state = state
    return true
  }

  private read(address: StructuralAddress): unknown {
    if (address.kind === "actor") return this.actors.get(address.id)
    if (address.kind === "topology") return this.topologies.get(address.id)
    return this.declarations.get(address.src)?.get(address.section)?.get(address.localId)
  }

  private upsert(address: StructuralAddress, value: unknown, op: "add" | "replace"): MatrixProjectionChange {
    if (address.kind === "actor") {
      const current = this.actors.get(address.id)
      if (current) {
        if (!isRecord(value) || same(current, value)) return {changed: false, affectedActorIds: []}
        this.unlink("actor", address.id, current.actor)
        patchRecord(current as unknown as Record<string, unknown>, value)
        this.link("actor", address.id, current.actor)
        this.indexActorValues(current)
        return {changed: true, affectedActorIds: [address.id]}
      }
      const next = actorEntity(value, address.id)
      if (!next) return {changed: false, affectedActorIds: []}
      this.actors.set(address.id, next)
      this.link("actor", address.id, next.actor)
      this.indexActorValues(next)
      return {changed: true, affectedActorIds: [address.id]}
    }

    if (address.kind === "topology") {
      const current = this.topologies.get(address.id)
      if (current) {
        if (!isRecord(value) || same(current, value)) return {changed: false, affectedActorIds: []}
        this.unlink("topology", address.id, current)
        patchRecord(current as unknown as Record<string, unknown>, value)
        this.link("topology", address.id, current)
        return {changed: true, affectedActorIds: this.descendantActorIds("topology", address.id)}
      }
      const next = topologyEntity(value, address.id)
      if (!next) return {changed: false, affectedActorIds: []}
      this.topologies.set(address.id, next)
      this.link("topology", address.id, next)
      return {changed: true, affectedActorIds: []}
    }

    if (!isRecord(value)) return {changed: false, affectedActorIds: []}
    let sections = this.declarations.get(address.src)
    if (!sections) {
      sections = new Map()
      this.declarations.set(address.src, sections)
    }
    let records = sections.get(address.section)
    if (!records) {
      records = new Map()
      sections.set(address.section, records)
    }
    const current = records.get(address.localId)
    if (current) {
      if (same(current, value)) return {changed: false, affectedActorIds: []}
      patchRecord(current, value)
    } else {
      records.set(address.localId, clone(value))
    }
    return {changed: true, affectedActorIds: this.actorIdsForWimp(address.src)}
  }

  private remove(address: StructuralAddress): MatrixProjectionChange {
    if (address.kind === "actor") {
      const affected = this.descendantActorIds("actor", address.id)
      if (!affected.includes(address.id) && !this.actors.has(address.id)) return {changed: false, affectedActorIds: []}
      this.removeBranch("actor", address.id)
      return {changed: true, affectedActorIds: affected}
    }
    if (address.kind === "topology") {
      if (!this.topologies.has(address.id)) return {changed: false, affectedActorIds: []}
      const affected = this.descendantActorIds("topology", address.id)
      this.removeBranch("topology", address.id)
      return {changed: true, affectedActorIds: affected}
    }
    const records = this.declarations.get(address.src)?.get(address.section)
    if (!records?.delete(address.localId)) return {changed: false, affectedActorIds: []}
    if (records.size === 0) this.declarations.get(address.src)?.delete(address.section)
    return {changed: true, affectedActorIds: this.actorIdsForWimp(address.src)}
  }

  private applyTransfer(part: Particle, target: StructuralAddress): MatrixProjectionChange {
    const source = structuralAddress(part.from ?? "")
    if (!source || source.kind !== target.kind) return {changed: false, affectedActorIds: []}
    const value = this.read(source)
    if (value === undefined) return {changed: false, affectedActorIds: []}
    if (part.op === "copy") {
      const copied = clone(value)
      if (source.kind === "actor" && target.kind === "actor") (copied as MatrixRuntimeActorEntity).actor.id = target.id
      if (source.kind === "topology" && target.kind === "topology") (copied as MatrixRuntimeTopology).id = target.id
      return this.upsert(target, copied, "add")
    }

    if (source.kind === "actor" && target.kind === "actor") {
      const entity = value as MatrixRuntimeActorEntity
      const fields = this.fieldValuesByActorId.get(source.id)
      const affected = this.descendantActorIds("actor", source.id)
      this.unlink("actor", source.id, entity.actor)
      this.actors.delete(source.id)
      this.fieldValuesByActorId.delete(source.id)
      entity.actor.id = target.id
      this.actors.set(target.id, entity)
      this.link("actor", target.id, entity.actor)
      if (fields) this.fieldValuesByActorId.set(target.id, fields)
      else this.indexActorValues(entity)
      this.rekeyChildren("actor", source.id, target.id)
      return {changed: true, affectedActorIds: [...new Set([source.id, target.id, ...affected.filter((id) => id !== source.id)])]}
    }
    if (source.kind === "topology" && target.kind === "topology") {
      const entity = value as MatrixRuntimeTopology
      const affected = this.descendantActorIds("topology", source.id)
      this.unlink("topology", source.id, entity)
      this.topologies.delete(source.id)
      entity.id = target.id
      this.topologies.set(target.id, entity)
      this.link("topology", target.id, entity)
      this.rekeyChildren("topology", source.id, target.id)
      return {changed: true, affectedActorIds: affected}
    }
    if (source.kind === "declaration" && target.kind === "declaration") {
      const removed = this.remove(source)
      const added = this.upsert(target, value, "add")
      return {changed: removed.changed || added.changed, affectedActorIds: [...new Set([...removed.affectedActorIds, ...added.affectedActorIds])]}
    }
    return {changed: false, affectedActorIds: []}
  }

  private indexActorValues(entity: MatrixRuntimeActorEntity): void {
    const valueById = new Map(entity.valueRecords.map((value) => [value.id, value] as const))
    const itemsByValue = new Map<number, string[]>()
    for (const item of entity.valueItems) {
      const items = itemsByValue.get(item.value)
      if (items) items[item.position] = item.itemValue
      else itemsByValue.set(item.value, [item.itemValue])
    }
    const fields = this.fieldValuesByActorId.get(entity.actor.id) ?? new Map<number, unknown>()
    this.fieldValuesByActorId.set(entity.actor.id, fields)
    for (const binding of entity.values) {
      const record = valueById.get(binding.value)
      if (record) fields.set(binding.field, this.decodeValue(record, itemsByValue.get(record.id)))
    }
  }

  private decodeValue(record: MatrixRuntimeValueRecord, items: string[] | undefined): unknown {
    if (record.kind === "boolean") return record.boolean === true
    if (record.kind === "number") return record.number ?? 0
    if (record.kind === "string") return record.text ?? ""
    if (record.kind === "list") return items ?? []
    if (record.kind === "enum") {
      for (const sections of this.declarations.values()) {
        for (const variant of sections.get("variants")?.values() ?? []) {
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
      if (children) children.add(childKey(kind, id))
      else this.childrenByParent.set(parent, new Set([childKey(kind, id)]))
    }
    if (kind === "actor" && typeof entity.wimp === "string") {
      const actorIds = this.actorIdsByWimp.get(entity.wimp)
      if (actorIds) actorIds.add(id)
      else this.actorIdsByWimp.set(entity.wimp, new Set([id]))
    }
  }

  private unlink(kind: "actor" | "topology", id: number, entity: {parentActor?: unknown; parentTopology?: unknown; wimp?: unknown}): void {
    const parent = parentKey(entity)
    if (parent) {
      this.childrenByParent.get(parent)?.delete(childKey(kind, id))
      if (this.childrenByParent.get(parent)?.size === 0) this.childrenByParent.delete(parent)
    }
    if (kind === "actor" && typeof entity.wimp === "string") {
      this.actorIdsByWimp.get(entity.wimp)?.delete(id)
      if (this.actorIdsByWimp.get(entity.wimp)?.size === 0) this.actorIdsByWimp.delete(entity.wimp)
    }
  }

  private descendantActorIds(kind: "actor" | "topology", id: number): number[] {
    const found: number[] = []
    const visit = (key: string): void => {
      if (key.startsWith("actor:")) found.push(Number(key.slice(6)))
      for (const child of this.childrenByParent.get(key) ?? []) visit(child)
    }
    visit(childKey(kind, id))
    return found
  }

  private rekeyChildren(kind: "actor" | "topology", sourceId: number, targetId: number): void {
    const sourceKey = childKey(kind, sourceId)
    const targetKey = childKey(kind, targetId)
    const children = this.childrenByParent.get(sourceKey)
    if (!children) return
    this.childrenByParent.delete(sourceKey)
    this.childrenByParent.set(targetKey, children)
    for (const child of children) {
      const [childKind, rawId] = child.split(":") as ["actor" | "topology", string]
      const entity = childKind === "actor" ? this.actors.get(Number(rawId))?.actor : this.topologies.get(Number(rawId))
      if (!entity) continue
      if (kind === "actor") entity.parentActor = targetId
      else entity.parentTopology = targetId
    }
  }

  private removeBranch(kind: "actor" | "topology", id: number): void {
    const key = childKey(kind, id)
    for (const child of [...(this.childrenByParent.get(key) ?? [])]) {
      const [childKind, rawId] = child.split(":") as ["actor" | "topology", string]
      this.removeBranch(childKind, Number(rawId))
    }
    this.childrenByParent.delete(key)
    if (kind === "actor") {
      const entity = this.actors.get(id)
      if (!entity) return
      this.unlink(kind, id, entity.actor)
      this.actors.delete(id)
      this.fieldValuesByActorId.delete(id)
    } else {
      const entity = this.topologies.get(id)
      if (!entity) return
      this.unlink(kind, id, entity)
      this.topologies.delete(id)
    }
  }
}
