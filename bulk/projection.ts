import type {ActorRecord} from "@metafor/types/boundary/actor"
import type {ActorValueRecord, FieldEnumVariantRecord, ValueItemRecord} from "@metafor/types/boundary/value"
import type {TopologyRecord} from "@metafor/types/boundary/topology"
import type {
  BulkRuntimeField,
  BulkRuntimeMatterBindingPath,
  BulkRuntimeMatterChildBindingPath,
  BulkRuntimeMatterParticle,
  BulkRuntimeProjection,
  BulkRuntimeValue,
  BulkRuntimeWimp,
} from "@metafor/types/bulk/runtime"
import type {Particle} from "@metafor/types/force/particle"
import {resolveForceFieldId, resolveForceFieldsPayload} from "@metafor/types/force/fields"

const declarationSections = ["meta", "fields", "variants", "states", "transitions", "conditions", "processes", "reactions", "matter", "mass", "bulk"] as const
type DeclarationSection = typeof declarationSections[number]
type Address =
  | {kind: "actor"; id: number}
  | {kind: "topology"; id: number}
  | {kind: "declaration"; src: string; section: DeclarationSection; localId: string}

export type BulkProjectionChange = {changed: boolean; affectedActorIds: number[]; structural: boolean}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const clone = <T>(value: T): T => structuredClone(value)

const same = (left: unknown, right: unknown): boolean => {
  if (Object.is(left, right)) return true
  if (Array.isArray(left) && Array.isArray(right)) return left.length === right.length && left.every((item, index) => same(item, right[index]))
  if (!isRecord(left) || !isRecord(right)) return false
  const keys = Object.keys(left)
  return keys.length === Object.keys(right).length && keys.every((key) => key in right && same(left[key], right[key]))
}

const patch = (target: Record<string, unknown>, delta: Record<string, unknown>): void => {
  for (const [key, value] of Object.entries(delta)) {
    if (isRecord(value) && isRecord(target[key])) patch(target[key] as Record<string, unknown>, value)
    else target[key] = clone(value)
  }
}

const address = (raw: unknown): Address | null => {
  if (typeof raw !== "string") return null
  const path = raw.replace(/^\/+/, "")
  const actor = /^actor\/(\d+)$/.exec(path)
  if (actor) return {kind: "actor", id: Number(actor[1])}
  const topology = /^topology\/(\d+)$/.exec(path)
  if (topology) return {kind: "topology", id: Number(topology[1])}
  const declaration = new RegExp(`^declaration/(.+)/(${declarationSections.join("|")})(?:/([^/]+))?$`).exec(path)
  return declaration ? {
    kind: "declaration",
    src: declaration[1]!,
    section: declaration[2]! as DeclarationSection,
    localId: declaration[3] ?? "0",
  } : null
}

const parentKey = (entity: {parentActor?: unknown; parentTopology?: unknown}): string | null => {
  if (typeof entity.parentActor === "number") return `actor:${entity.parentActor}`
  return typeof entity.parentTopology === "number" ? `topology:${entity.parentTopology}` : null
}

const runtimeValue = (id: number, value: unknown): BulkRuntimeValue => {
  const kind: BulkRuntimeValue["kind"] = value === null
    ? "null"
    : typeof value === "boolean"
      ? "boolean"
      : typeof value === "number"
        ? "number"
        : Array.isArray(value)
          ? "list"
          : "string"
  return {
    id,
    kind,
    booleanValue: kind === "boolean" ? (value === true ? 1 : 0) : null,
    numberValue: kind === "number" ? value as number : null,
    textValue: kind === "string" ? String(value) : null,
    enumValue: null,
  }
}

/** Canonical local scene source. No method clears or replaces the projection. */
export class BulkProjectionStore {
  readonly actors = new Map<number, ActorRecord>()
  readonly topologies = new Map<number, TopologyRecord>()
  readonly wimps = new Map<string, BulkRuntimeWimp>()
  readonly fields = new Map<number, BulkRuntimeField>()
  readonly variants = new Map<number, FieldEnumVariantRecord>()
  readonly actorValues = new Map<string, ActorValueRecord>()
  readonly values = new Map<number, BulkRuntimeValue>()
  readonly valueItems = new Map<string, ValueItemRecord>()
  readonly matterParticles = new Map<number, BulkRuntimeMatterParticle>()
  readonly matterTopologyBindingPaths = new Map<string, BulkRuntimeMatterBindingPath>()
  readonly matterChildWimpBindingPaths = new Map<string, BulkRuntimeMatterChildBindingPath>()
  readonly declarations = new Map<string, Map<DeclarationSection, Map<string, Record<string, unknown>>>>()
  readonly childrenByParent = new Map<string, Set<string>>()
  readonly actorIdsByWimp = new Map<string, Set<number>>()
  private nextValueId = 1

  apply(part: Particle): BulkProjectionChange {
    if (part.part === "gluon") return this.applyGluon(part)
    if (part.part !== "graviton") return {changed: false, affectedActorIds: [], structural: false}
    const target = address(part.path)
    if (!target) return {changed: false, affectedActorIds: [], structural: false}
    if (part.op === "test") {
      if (part.value !== undefined && !same(this.read(target), part.value)) throw new Error(`Bulk projection test failed at ${String(part.path)}`)
      return {changed: false, affectedActorIds: [], structural: false}
    }
    if (part.op === "move" || part.op === "copy") return this.transfer(part, target)
    if (part.op === "remove") return this.remove(target)
    if (part.op !== "add" && part.op !== "replace") return {changed: false, affectedActorIds: [], structural: false}
    return this.upsert(target, part.value)
  }

  view(): BulkRuntimeProjection {
    return {
      actors: [...this.actors.values()],
      topologies: [...this.topologies.values()],
      wimps: [...this.wimps.values()],
      fields: [...this.fields.values()],
      fieldEnumVariants: [...this.variants.values()],
      actorValues: [...this.actorValues.values()],
      values: [...this.values.values()],
      valueItems: [...this.valueItems.values()],
      matterParticles: [...this.matterParticles.values()],
      matterTopologyBindingPaths: [...this.matterTopologyBindingPaths.values()],
      matterChildWimpBindingPaths: [...this.matterChildWimpBindingPaths.values()],
    }
  }

  private read(target: Address): unknown {
    if (target.kind === "actor") return this.actors.get(target.id)
    if (target.kind === "topology") return this.topologies.get(target.id)
    return this.declarations.get(target.src)?.get(target.section)?.get(target.localId)
  }

  private upsert(target: Address, value: unknown): BulkProjectionChange {
    if (target.kind === "actor") return this.upsertActor(target.id, value)
    if (target.kind === "topology") return this.upsertTopology(target.id, value)
    if (!isRecord(value)) return {changed: false, affectedActorIds: [], structural: false}
    let sections = this.declarations.get(target.src)
    if (!sections) {
      sections = new Map()
      this.declarations.set(target.src, sections)
    }
    let records = sections.get(target.section)
    if (!records) {
      records = new Map()
      sections.set(target.section, records)
    }
    const current = records.get(target.localId)
    if (current) {
      if (same(current, value)) return {changed: false, affectedActorIds: [], structural: false}
      patch(current, value)
    } else records.set(target.localId, clone(value))
    this.projectDeclaration(target, current ?? records.get(target.localId)!)
    return {changed: true, affectedActorIds: [...(this.actorIdsByWimp.get(target.src) ?? [])], structural: true}
  }

  private upsertActor(id: number, value: unknown): BulkProjectionChange {
    if (!isRecord(value)) return {changed: false, affectedActorIds: [], structural: false}
    const rawActor = isRecord(value.actor) ? value.actor : value
    const current = this.actors.get(id)
    let changed = false
    if (current) {
      if (!isRecord(rawActor)) return {changed: false, affectedActorIds: [], structural: false}
      if (!same(current, rawActor)) {
        this.unlink("actor", id, current)
        patch(current as unknown as Record<string, unknown>, rawActor)
        this.link("actor", id, current)
        changed = true
      }
    } else {
      if (!isRecord(rawActor) || rawActor.id !== id || typeof rawActor.wimp !== "string") return {changed: false, affectedActorIds: [], structural: false}
      const actor = clone(rawActor as unknown as ActorRecord)
      this.actors.set(id, actor)
      this.link("actor", id, actor)
      changed = true
    }
    if (Array.isArray(value.values) && Array.isArray(value.valueRecords)) changed = this.projectActorValues(id, value) || changed
    return {changed, affectedActorIds: changed ? [id] : [], structural: changed}
  }

  private upsertTopology(id: number, value: unknown): BulkProjectionChange {
    if (!isRecord(value)) return {changed: false, affectedActorIds: [], structural: false}
    const current = this.topologies.get(id)
    if (current) {
      if (same(current, value)) return {changed: false, affectedActorIds: [], structural: false}
      this.unlink("topology", id, current)
      patch(current as unknown as Record<string, unknown>, value)
      this.link("topology", id, current)
    } else {
      if (value.id !== id) return {changed: false, affectedActorIds: [], structural: false}
      const topology = clone(value as unknown as TopologyRecord)
      this.topologies.set(id, topology)
      this.link("topology", id, topology)
    }
    return {changed: true, affectedActorIds: this.descendantActors(`topology:${id}`), structural: true}
  }

  private projectActorValues(actorId: number, payload: Record<string, unknown>): boolean {
    let changed = false
    const records = new Map((payload.valueRecords as Array<Record<string, unknown>>).map((record) => [Number(record.id), record]))
    for (const binding of payload.values as Array<Record<string, unknown>>) {
      const field = Number(binding.field)
      const valueId = Number(binding.value)
      if (!Number.isSafeInteger(field) || !Number.isSafeInteger(valueId)) continue
      const record = records.get(valueId)
      if (!record) continue
      const kind = record.kind
      const projected: BulkRuntimeValue = {
        id: valueId,
        kind: kind === "boolean" || kind === "number" || kind === "string" || kind === "enum" || kind === "list" ? kind : "null",
        booleanValue: kind === "boolean" ? (record.boolean === true ? 1 : 0) : null,
        numberValue: kind === "number" && typeof record.number === "number" ? record.number : null,
        textValue: kind === "string" && typeof record.text === "string" ? record.text : null,
        enumValue: kind === "enum" ? this.variants.get(Number(record.variant))?.itemValue ?? null : null,
      }
      const currentValue = this.values.get(valueId)
      if (currentValue) {
        if (!same(currentValue, projected)) {
          patch(currentValue as unknown as Record<string, unknown>, projected as unknown as Record<string, unknown>)
          changed = true
        }
      } else {
        this.values.set(valueId, projected)
        changed = true
      }
      const key = `${actorId}\0${field}`
      const actorValue = this.actorValues.get(key)
      if (actorValue) {
        if (actorValue.value !== valueId) {
          actorValue.value = valueId
          changed = true
        }
      } else {
        this.actorValues.set(key, {actor: actorId, field, value: valueId})
        changed = true
      }
      this.nextValueId = Math.max(this.nextValueId, valueId + 1)
    }
    for (const item of Array.isArray(payload.valueItems) ? payload.valueItems as ValueItemRecord[] : []) {
      const key = `${item.value}\0${item.position}`
      const current = this.valueItems.get(key)
      if (!current) {
        this.valueItems.set(key, clone(item))
        changed = true
      } else if (!same(current, item)) {
        patch(current as unknown as Record<string, unknown>, item as unknown as Record<string, unknown>)
        changed = true
      }
    }
    return changed
  }

  private projectDeclaration(target: Extract<Address, {kind: "declaration"}>, record: Record<string, unknown>): void {
    if (target.section === "meta") {
      const current = this.wimps.get(target.src)
      const delta = {src: target.src, name: typeof record.name === "string" ? record.name : null}
      if (current) patch(current as unknown as Record<string, unknown>, delta)
      else this.wimps.set(target.src, delta)
      return
    }
    const id = Number(record.id)
    if (!Number.isSafeInteger(id)) return
    if (target.section === "fields") {
      const current = this.fields.get(id)
      if (current) patch(current as unknown as Record<string, unknown>, record)
      else this.fields.set(id, clone(record as unknown as BulkRuntimeField))
    } else if (target.section === "variants") {
      const normalized = {...record, itemValue: record.itemValue ?? record.value} as unknown as FieldEnumVariantRecord
      const current = this.variants.get(id)
      if (current) patch(current as unknown as Record<string, unknown>, normalized as unknown as Record<string, unknown>)
      else this.variants.set(id, clone(normalized))
    } else if (target.section === "matter") {
      const current = this.matterParticles.get(id)
      if (current) patch(current as unknown as Record<string, unknown>, record)
      else this.matterParticles.set(id, clone(record as unknown as BulkRuntimeMatterParticle))
      this.projectMatterBindings(record)
    }
  }

  private projectMatterBindings(record: Record<string, unknown>): void {
    const id = Number(record.id)
    for (const binding of Array.isArray(record.topologyBindingPaths) ? record.topologyBindingPaths as BulkRuntimeMatterBindingPath[] : []) {
      this.matterTopologyBindingPaths.set(`${id}\0${binding.depOrder}`, clone(binding))
    }
    for (const binding of Array.isArray(record.childWimpBindingPaths) ? record.childWimpBindingPaths as BulkRuntimeMatterChildBindingPath[] : []) {
      this.matterChildWimpBindingPaths.set(`${id}\0${binding.childOrder}\0${binding.depOrder}`, clone(binding))
    }
  }

  private applyGluon(part: Particle): BulkProjectionChange {
    if (typeof part.path !== "number" || !this.actors.has(part.path)) return {changed: false, affectedActorIds: [], structural: false}
    const fields = resolveForceFieldsPayload(part.value)
    if (!fields) return {changed: false, affectedActorIds: [], structural: false}
    let changed = false
    for (const [rawField, rawValue] of Object.entries(fields)) {
      const field = resolveForceFieldId(rawField)
      if (field === null) continue
      const key = `${part.path}\0${field}`
      const binding = this.actorValues.get(key)
      if (part.op === "remove") {
        if (binding) {
          this.actorValues.delete(key)
          this.values.delete(binding.value)
          for (const itemKey of [...this.valueItems.keys()]) if (itemKey.startsWith(`${binding.value}\0`)) this.valueItems.delete(itemKey)
          changed = true
        }
      } else if (part.op === "add" || part.op === "replace") {
        const valueId = binding?.value ?? this.nextValueId++
        const next = runtimeValue(valueId, rawValue)
        const current = this.values.get(valueId)
        if (current) patch(current as unknown as Record<string, unknown>, next as unknown as Record<string, unknown>)
        else this.values.set(valueId, next)
        if (!binding) this.actorValues.set(key, {actor: part.path, field, value: valueId})
        for (const itemKey of [...this.valueItems.keys()]) if (itemKey.startsWith(`${valueId}\0`)) this.valueItems.delete(itemKey)
        if (Array.isArray(rawValue)) rawValue.forEach((item, position) => this.valueItems.set(`${valueId}\0${position}`, {value: valueId, position, itemValue: String(item)}))
        changed = true
      } else if (part.op === "test" && !same(currentRawValue(binding && this.values.get(binding.value), this.valueItems), rawValue)) {
        throw new Error(`Bulk value test failed for actor ${part.path}, field ${field}`)
      }
    }
    return {changed, affectedActorIds: changed ? [part.path] : [], structural: false}
  }

  private remove(target: Address): BulkProjectionChange {
    if (target.kind === "actor" || target.kind === "topology") {
      const key = `${target.kind}:${target.id}`
      const exists = target.kind === "actor" ? this.actors.has(target.id) : this.topologies.has(target.id)
      if (!exists) return {changed: false, affectedActorIds: [], structural: false}
      const affected = this.descendantActors(key)
      this.removeBranch(key)
      return {changed: true, affectedActorIds: affected, structural: true}
    }
    const records = this.declarations.get(target.src)?.get(target.section)
    const record = records?.get(target.localId)
    if (!record || !records?.delete(target.localId)) return {changed: false, affectedActorIds: [], structural: false}
    const id = Number(record.id)
    if (target.section === "fields") this.fields.delete(id)
    if (target.section === "variants") this.variants.delete(id)
    if (target.section === "matter") this.matterParticles.delete(id)
    if (target.section === "meta") this.wimps.delete(target.src)
    return {changed: true, affectedActorIds: [...(this.actorIdsByWimp.get(target.src) ?? [])], structural: true}
  }

  private transfer(part: Particle, target: Address): BulkProjectionChange {
    const source = address(part.from)
    if (!source || source.kind !== target.kind) return {changed: false, affectedActorIds: [], structural: false}
    const value = this.read(source)
    if (value === undefined) return {changed: false, affectedActorIds: [], structural: false}
    if (part.op === "copy") {
      const copied = clone(value)
      if ((target.kind === "actor" || target.kind === "topology") && isRecord(copied)) copied.id = target.id
      return this.upsert(target, copied)
    }
    if (source.kind === "actor" && target.kind === "actor") {
      const actor = value as ActorRecord
      const affected = this.descendantActors(`actor:${source.id}`)
      this.unlink("actor", source.id, actor)
      this.actors.delete(source.id)
      actor.id = target.id
      this.actors.set(target.id, actor)
      this.link("actor", target.id, actor)
      for (const [key, binding] of [...this.actorValues]) {
        if (binding.actor !== source.id) continue
        this.actorValues.delete(key)
        binding.actor = target.id
        this.actorValues.set(`${target.id}\0${binding.field}`, binding)
      }
      this.rekeyChildren("actor", source.id, target.id)
      return {changed: true, affectedActorIds: [...new Set([source.id, target.id, ...affected.filter((id) => id !== source.id)])], structural: true}
    }
    if (source.kind === "topology" && target.kind === "topology") {
      const topology = value as TopologyRecord
      this.unlink("topology", source.id, topology)
      this.topologies.delete(source.id)
      topology.id = target.id
      this.topologies.set(target.id, topology)
      this.link("topology", target.id, topology)
      this.rekeyChildren("topology", source.id, target.id)
      return {changed: true, affectedActorIds: this.descendantActors(`topology:${target.id}`), structural: true}
    }
    if (source.kind === "declaration" && target.kind === "declaration") {
      const sourceRecords = this.declarations.get(source.src)?.get(source.section)
      sourceRecords?.delete(source.localId)
      return this.upsert(target, value)
    }
    return {changed: false, affectedActorIds: [], structural: false}
  }

  private link(kind: "actor" | "topology", id: number, entity: ActorRecord | TopologyRecord): void {
    const parent = parentKey(entity)
    if (parent) {
      const children = this.childrenByParent.get(parent)
      if (children) children.add(`${kind}:${id}`)
      else this.childrenByParent.set(parent, new Set([`${kind}:${id}`]))
    }
    if (kind === "actor") {
      const actor = entity as ActorRecord
      const ids = this.actorIdsByWimp.get(actor.wimp)
      if (ids) ids.add(id)
      else this.actorIdsByWimp.set(actor.wimp, new Set([id]))
    }
  }

  private unlink(kind: "actor" | "topology", id: number, entity: ActorRecord | TopologyRecord): void {
    const parent = parentKey(entity)
    if (parent) {
      this.childrenByParent.get(parent)?.delete(`${kind}:${id}`)
      if (this.childrenByParent.get(parent)?.size === 0) this.childrenByParent.delete(parent)
    }
    if (kind === "actor") {
      const actor = entity as ActorRecord
      this.actorIdsByWimp.get(actor.wimp)?.delete(id)
      if (this.actorIdsByWimp.get(actor.wimp)?.size === 0) this.actorIdsByWimp.delete(actor.wimp)
    }
  }

  private descendantActors(key: string): number[] {
    const ids: number[] = []
    const visit = (next: string): void => {
      if (next.startsWith("actor:")) ids.push(Number(next.slice(6)))
      for (const child of this.childrenByParent.get(next) ?? []) visit(child)
    }
    visit(key)
    return ids
  }

  private rekeyChildren(kind: "actor" | "topology", sourceId: number, targetId: number): void {
    const sourceKey = `${kind}:${sourceId}`
    const targetKey = `${kind}:${targetId}`
    const children = this.childrenByParent.get(sourceKey)
    if (!children) return
    this.childrenByParent.delete(sourceKey)
    this.childrenByParent.set(targetKey, children)
    for (const child of children) {
      const [childKind, rawId] = child.split(":") as ["actor" | "topology", string]
      const entity = childKind === "actor" ? this.actors.get(Number(rawId)) : this.topologies.get(Number(rawId))
      if (!entity) continue
      if (kind === "actor") entity.parentActor = targetId
      else entity.parentTopology = targetId
    }
  }

  private removeBranch(key: string): void {
    for (const child of [...(this.childrenByParent.get(key) ?? [])]) this.removeBranch(child)
    this.childrenByParent.delete(key)
    const [kind, rawId] = key.split(":") as ["actor" | "topology", string]
    const id = Number(rawId)
    if (kind === "actor") {
      const actor = this.actors.get(id)
      if (actor) this.unlink(kind, id, actor)
      this.actors.delete(id)
      for (const valueKey of [...this.actorValues.keys()]) if (valueKey.startsWith(`${id}\0`)) this.actorValues.delete(valueKey)
    } else {
      const topology = this.topologies.get(id)
      if (topology) this.unlink(kind, id, topology)
      this.topologies.delete(id)
    }
  }
}

const currentRawValue = (value: BulkRuntimeValue | undefined, items: Map<string, ValueItemRecord>): unknown => {
  if (!value || value.kind === "null") return null
  if (value.kind === "boolean") return value.booleanValue === 1
  if (value.kind === "number") return value.numberValue
  if (value.kind === "string") return value.textValue
  if (value.kind === "enum") return value.enumValue
  return [...items.values()].filter((item) => item.value === value.id).sort((a, b) => a.position - b.position).map((item) => item.itemValue)
}
