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
import {applyForceDelta, forceValueEqual, replaceForceRecord} from "@metafor/types/force/delta"

const sections = ["meta", "fields", "variants", "states", "transitions", "conditions", "processes", "reactions", "matter", "mass", "bulk"] as const
type Section = typeof sections[number]
type Address =
  | {kind: "actor"; id: number}
  | {kind: "topology"; id: number}
  | {kind: "declaration"; src: string; section: Section; localId: string}

export type BulkProjectionChange = {changed: boolean; affectedActorIds: number[]; structural: boolean}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const clone = <T>(value: T): T => structuredClone(value)

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
    section: declaration[2]! as Section,
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

/** Exact local source for the live Bulk scene. */
export class BulkRuntimeProjectionStore {
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
  readonly declarations = new Map<string, Map<Section, Map<string, Record<string, unknown>>>>()
  readonly childrenByParent = new Map<string, Set<string>>()
  readonly actorIdsByWimp = new Map<string, Set<number>>()
  private nextValueId = 1

  apply(part: Particle): BulkProjectionChange {
    if (part.part === "gluon" || part.part === "higgs") return this.applyField(part)
    if (part.part !== "graviton") return {changed: false, affectedActorIds: [], structural: false}
    const target = parseAddress(part.path)
    if (!target) return {changed: false, affectedActorIds: [], structural: false}
    if (part.op === "test") {
      if (part.value !== undefined && !forceValueEqual(this.read(target), part.value)) {
        throw new Error(`Bulk projection test failed at ${String(part.path)}`)
      }
      return {changed: false, affectedActorIds: [], structural: false}
    }
    if (part.op === "move" || part.op === "copy") return this.transfer(part, target)
    if (part.op === "remove") return this.remove(target)
    if (part.op !== "add" && part.op !== "replace") return {changed: false, affectedActorIds: [], structural: false}
    return this.upsert(target, part.value, part.op)
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

  private upsert(target: Address, value: unknown, op: "add" | "replace"): BulkProjectionChange {
    if (target.kind === "actor") return this.upsertActor(target.id, value, op)
    if (target.kind === "topology") return this.upsertTopology(target.id, value, op)
    if (!isRecord(value)) return {changed: false, affectedActorIds: [], structural: false}
    let bySection = this.declarations.get(target.src)
    if (!bySection) {
      bySection = new Map()
      this.declarations.set(target.src, bySection)
    }
    let records = bySection.get(target.section)
    if (!records) {
      records = new Map()
      bySection.set(target.section, records)
    }
    const current = records.get(target.localId)
    if (current) {
      const before = clone(current)
      if (op === "add") replaceForceRecord(current, value)
      else applyForceDelta(current, value)
      if (forceValueEqual(before, current)) return {changed: false, affectedActorIds: [], structural: false}
      this.projectDeclaration(target, current, true)
    } else {
      const created = clone(value)
      records.set(target.localId, created)
      this.projectDeclaration(target, created, false)
    }
    return {changed: true, affectedActorIds: [...(this.actorIdsByWimp.get(target.src) ?? [])], structural: true}
  }

  private upsertActor(id: number, value: unknown, op: "add" | "replace"): BulkProjectionChange {
    if (!isRecord(value)) return {changed: false, affectedActorIds: [], structural: false}
    const raw = isRecord(value.actor) ? value.actor : value
    if (!isRecord(raw)) return {changed: false, affectedActorIds: [], structural: false}
    const current = this.actors.get(id)
    let changed = false
    if (current) {
      const before = clone(current)
      this.unlink("actor", id, current)
      if (op === "add") replaceForceRecord(current as unknown as Record<string, unknown>, raw)
      else applyForceDelta(current as unknown as Record<string, unknown>, raw)
      this.link("actor", id, current)
      changed = !forceValueEqual(before, current)
    } else {
      if (raw.id !== id || typeof raw.wimp !== "string") return {changed: false, affectedActorIds: [], structural: false}
      const actor = clone(raw as unknown as ActorRecord)
      this.actors.set(id, actor)
      this.link("actor", id, actor)
      changed = true
    }
    if (op === "add" && Array.isArray(value.values) && Array.isArray(value.valueRecords)) {
      changed = this.projectActorValuesExact(id, value) || changed
    }
    return {changed, affectedActorIds: changed ? [id] : [], structural: changed}
  }

  private upsertTopology(id: number, value: unknown, op: "add" | "replace"): BulkProjectionChange {
    if (!isRecord(value)) return {changed: false, affectedActorIds: [], structural: false}
    const current = this.topologies.get(id)
    if (current) {
      const before = clone(current)
      this.unlink("topology", id, current)
      if (op === "add") replaceForceRecord(current as unknown as Record<string, unknown>, value)
      else applyForceDelta(current as unknown as Record<string, unknown>, value)
      this.link("topology", id, current)
      const changed = !forceValueEqual(before, current)
      return {changed, affectedActorIds: changed ? this.descendantActors(`topology:${id}`) : [], structural: changed}
    }
    if (value.id !== id) return {changed: false, affectedActorIds: [], structural: false}
    const topology = clone(value as unknown as TopologyRecord)
    this.topologies.set(id, topology)
    this.link("topology", id, topology)
    return {changed: true, affectedActorIds: [], structural: true}
  }

  private projectActorValuesExact(actorId: number, payload: Record<string, unknown>): boolean {
    let changed = false
    const nextBindings = new Set<string>()
    const records = new Map((payload.valueRecords as Array<Record<string, unknown>>).map((record) => [Number(record.id), record]))
    const nextValueIds = new Set<number>()
    for (const binding of payload.values as Array<Record<string, unknown>>) {
      const field = Number(binding.field)
      const valueId = Number(binding.value)
      if (!Number.isSafeInteger(field) || !Number.isSafeInteger(valueId)) continue
      const record = records.get(valueId)
      if (!record) continue
      const projected = this.projectRuntimeValue(valueId, record)
      const current = this.values.get(valueId)
      if (current) {
        const before = clone(current)
        replaceForceRecord(current as unknown as Record<string, unknown>, projected as unknown as Record<string, unknown>)
        changed = !forceValueEqual(before, current) || changed
      } else {
        this.values.set(valueId, projected)
        changed = true
      }
      nextValueIds.add(valueId)
      const key = `${actorId}\0${field}`
      nextBindings.add(key)
      const currentBinding = this.actorValues.get(key)
      if (!currentBinding) {
        this.actorValues.set(key, {actor: actorId, field, value: valueId})
        changed = true
      } else if (currentBinding.value !== valueId) {
        currentBinding.value = valueId
        changed = true
      }
      this.nextValueId = Math.max(this.nextValueId, valueId + 1)
    }
    for (const [key, binding] of [...this.actorValues]) {
      if (binding.actor !== actorId || nextBindings.has(key)) continue
      this.actorValues.delete(key)
      this.dropUnreferencedValue(binding.value)
      changed = true
    }
    const nextItems = new Set<string>()
    for (const item of Array.isArray(payload.valueItems) ? payload.valueItems as ValueItemRecord[] : []) {
      const key = `${item.value}\0${item.position}`
      nextItems.add(key)
      const current = this.valueItems.get(key)
      if (!current) {
        this.valueItems.set(key, clone(item))
        changed = true
      } else if (!forceValueEqual(current, item)) {
        replaceForceRecord(current as unknown as Record<string, unknown>, item as unknown as Record<string, unknown>)
        changed = true
      }
    }
    for (const key of [...this.valueItems.keys()]) {
      const [rawValue] = key.split("\0")
      if (!nextValueIds.has(Number(rawValue)) || nextItems.has(key)) continue
      this.valueItems.delete(key)
      changed = true
    }
    return changed
  }

  private projectRuntimeValue(id: number, record: Record<string, unknown>): BulkRuntimeValue {
    const kind = record.kind
    return {
      id,
      kind: kind === "boolean" || kind === "number" || kind === "string" || kind === "enum" || kind === "list" ? kind : "null",
      booleanValue: kind === "boolean" ? (record.boolean === true ? 1 : 0) : null,
      numberValue: kind === "number" && typeof record.number === "number" ? record.number : null,
      textValue: kind === "string" && typeof record.text === "string" ? record.text : null,
      enumValue: kind === "enum" ? this.variants.get(Number(record.variant))?.itemValue ?? null : null,
    }
  }

  private projectDeclaration(target: Extract<Address, {kind: "declaration"}>, record: Record<string, unknown>, existing: boolean): void {
    if (target.section === "meta") {
      const next = {src: target.src, name: typeof record.name === "string" ? record.name : null}
      const current = this.wimps.get(target.src)
      if (current) replaceForceRecord(current as unknown as Record<string, unknown>, next)
      else this.wimps.set(target.src, next)
      return
    }
    const id = Number(record.id)
    if (!Number.isSafeInteger(id)) return
    if (target.section === "fields") {
      const next = clone(record as unknown as BulkRuntimeField)
      const current = this.fields.get(id)
      if (current) replaceForceRecord(current as unknown as Record<string, unknown>, next as unknown as Record<string, unknown>)
      else this.fields.set(id, next)
      return
    }
    if (target.section === "variants") {
      const next = {...record, itemValue: record.itemValue ?? record.value} as unknown as FieldEnumVariantRecord
      const current = this.variants.get(id)
      if (current) replaceForceRecord(current as unknown as Record<string, unknown>, next as unknown as Record<string, unknown>)
      else this.variants.set(id, clone(next))
      return
    }
    if (target.section === "matter") {
      const next = clone(record as unknown as BulkRuntimeMatterParticle)
      const current = this.matterParticles.get(id)
      if (current) replaceForceRecord(current as unknown as Record<string, unknown>, next as unknown as Record<string, unknown>)
      else this.matterParticles.set(id, next)
      this.projectMatterBindings(record, existing)
    }
  }

  private projectMatterBindings(record: Record<string, unknown>, exact: boolean): void {
    const id = Number(record.id)
    if (exact) {
      for (const key of [...this.matterTopologyBindingPaths.keys()]) if (key.startsWith(`${id}\0`)) this.matterTopologyBindingPaths.delete(key)
      for (const key of [...this.matterChildWimpBindingPaths.keys()]) if (key.startsWith(`${id}\0`)) this.matterChildWimpBindingPaths.delete(key)
    }
    for (const binding of Array.isArray(record.topologyBindingPaths) ? record.topologyBindingPaths as BulkRuntimeMatterBindingPath[] : []) {
      this.matterTopologyBindingPaths.set(`${id}\0${binding.depOrder}`, clone(binding))
    }
    for (const binding of Array.isArray(record.childWimpBindingPaths) ? record.childWimpBindingPaths as BulkRuntimeMatterChildBindingPath[] : []) {
      this.matterChildWimpBindingPaths.set(`${id}\0${binding.childOrder}\0${binding.depOrder}`, clone(binding))
    }
  }

  private applyField(part: Particle): BulkProjectionChange {
    if (typeof part.path !== "number" || !this.actors.has(part.path)) return {changed: false, affectedActorIds: [], structural: false}
    const fields = resolveForceFieldsPayload(part.value)
    if (!fields || Object.keys(fields).length !== 1) return {changed: false, affectedActorIds: [], structural: false}
    const [rawField, rawValue] = Object.entries(fields)[0]!
    const field = resolveForceFieldId(rawField)
    if (field === null) return {changed: false, affectedActorIds: [], structural: false}
    const key = `${part.path}\0${field}`
    const binding = this.actorValues.get(key)
    if (part.op === "test") {
      if (!forceValueEqual(currentRawValue(binding && this.values.get(binding.value), this.valueItems), rawValue)) {
        throw new Error(`Bulk value test failed for actor ${part.path}, field ${field}`)
      }
      return {changed: false, affectedActorIds: [], structural: false}
    }
    if (part.op === "remove") {
      if (!binding) return {changed: false, affectedActorIds: [], structural: false}
      this.actorValues.delete(key)
      this.dropUnreferencedValue(binding.value)
      return {changed: true, affectedActorIds: [part.path], structural: false}
    }
    if (part.op !== "add" && part.op !== "replace") return {changed: false, affectedActorIds: [], structural: false}
    if (forceValueEqual(currentRawValue(binding && this.values.get(binding.value), this.valueItems), rawValue)) {
      return {changed: false, affectedActorIds: [], structural: false}
    }
    const valueId = binding?.value ?? this.nextValueId++
    const next = runtimeValue(valueId, rawValue)
    const current = this.values.get(valueId)
    if (current) replaceForceRecord(current as unknown as Record<string, unknown>, next as unknown as Record<string, unknown>)
    else this.values.set(valueId, next)
    if (!binding) this.actorValues.set(key, {actor: part.path, field, value: valueId})
    for (const itemKey of [...this.valueItems.keys()]) if (itemKey.startsWith(`${valueId}\0`)) this.valueItems.delete(itemKey)
    if (Array.isArray(rawValue)) rawValue.forEach((item, position) => this.valueItems.set(`${valueId}\0${position}`, {value: valueId, position, itemValue: String(item)}))
    return {changed: true, affectedActorIds: [part.path], structural: part.part === "higgs"}
  }

  private remove(target: Address): BulkProjectionChange {
    if (target.kind === "actor" || target.kind === "topology") {
      const node = `${target.kind}:${target.id}`
      const exists = target.kind === "actor" ? this.actors.has(target.id) : this.topologies.has(target.id)
      if (!exists) return {changed: false, affectedActorIds: [], structural: false}
      const affected = this.descendantActors(node)
      this.removeBranch(node)
      return {changed: true, affectedActorIds: affected, structural: true}
    }
    const records = this.declarations.get(target.src)?.get(target.section)
    const record = records?.get(target.localId)
    if (!record || !records?.delete(target.localId)) return {changed: false, affectedActorIds: [], structural: false}
    const id = Number(record.id)
    if (target.section === "fields") this.fields.delete(id)
    if (target.section === "variants") this.variants.delete(id)
    if (target.section === "matter") {
      this.matterParticles.delete(id)
      for (const key of [...this.matterTopologyBindingPaths.keys()]) if (key.startsWith(`${id}\0`)) this.matterTopologyBindingPaths.delete(key)
      for (const key of [...this.matterChildWimpBindingPaths.keys()]) if (key.startsWith(`${id}\0`)) this.matterChildWimpBindingPaths.delete(key)
    }
    if (target.section === "meta") this.wimps.delete(target.src)
    return {changed: true, affectedActorIds: [...(this.actorIdsByWimp.get(target.src) ?? [])], structural: true}
  }

  private transfer(part: Particle, target: Address): BulkProjectionChange {
    const source = parseAddress(part.from)
    if (!source || source.kind !== target.kind) return {changed: false, affectedActorIds: [], structural: false}
    const current = this.read(source)
    if (current === undefined) return {changed: false, affectedActorIds: [], structural: false}
    const copied = clone(current)
    if (target.kind === "actor" && isRecord(copied)) copied.id = target.id
    if (target.kind === "topology" && isRecord(copied)) copied.id = target.id
    if (part.op === "copy") return this.upsert(target, copied, "add")
    const removed = this.remove(source)
    const added = this.upsert(target, copied, "add")
    return {
      changed: removed.changed || added.changed,
      affectedActorIds: [...new Set([...removed.affectedActorIds, ...added.affectedActorIds])],
      structural: removed.structural || added.structural,
    }
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

  private descendantActors(node: string): number[] {
    const ids: number[] = []
    const visit = (next: string): void => {
      if (next.startsWith("actor:")) ids.push(Number(next.slice(6)))
      for (const child of this.childrenByParent.get(next) ?? []) visit(child)
    }
    visit(node)
    return ids
  }

  private removeBranch(node: string): void {
    for (const child of [...(this.childrenByParent.get(node) ?? [])]) this.removeBranch(child)
    this.childrenByParent.delete(node)
    const [kind, rawId] = node.split(":") as ["actor" | "topology", string]
    const id = Number(rawId)
    if (kind === "actor") {
      const actor = this.actors.get(id)
      if (actor) this.unlink(kind, id, actor)
      this.actors.delete(id)
      for (const [key, binding] of [...this.actorValues]) {
        if (binding.actor !== id) continue
        this.actorValues.delete(key)
        this.dropUnreferencedValue(binding.value)
      }
    } else {
      const topology = this.topologies.get(id)
      if (topology) this.unlink(kind, id, topology)
      this.topologies.delete(id)
    }
  }

  private dropUnreferencedValue(valueId: number): void {
    if ([...this.actorValues.values()].some((binding) => binding.value === valueId)) return
    this.values.delete(valueId)
    for (const key of [...this.valueItems.keys()]) if (key.startsWith(`${valueId}\0`)) this.valueItems.delete(key)
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
