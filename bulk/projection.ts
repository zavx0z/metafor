import type {AtomRecord} from "@metafor/types/boundary/atom"
import type {AtomValueRecord, FieldEnumVariantRecord, ValueItemRecord} from "@metafor/types/boundary/value"
import type {TopologyRecord} from "@metafor/types/boundary/topology"
import type {
  BulkRuntimeAtomState,
  BulkRuntimeCondition,
  BulkRuntimeField,
  BulkRuntimeMatterBindingPath,
  BulkRuntimeMatterChildBindingPath,
  BulkRuntimeMatterParticle,
  BulkRuntimeProjection,
  BulkRuntimeProcess,
  BulkRuntimeReaction,
  BulkRuntimeState,
  BulkRuntimeTransition,
  BulkRuntimeValue,
  BulkRuntimeWimp,
} from "@metafor/types/bulk/runtime"
import type {Particle} from "@metafor/types/force/particle"
import {resolveForceFieldId, resolveForceFieldsPayload} from "@metafor/types/force/fields"

const declarationSections = ["meta", "fields", "variants", "states", "transitions", "conditions", "processes", "reactions", "matter", "mass", "bulk"] as const
type DeclarationSection = typeof declarationSections[number]
type Address =
  | {kind: "atom"; id: number}
  | {kind: "topology"; id: number}
  | {kind: "declaration"; src: string; section: DeclarationSection; localId: string}

export type BulkProjectionChange = {changed: boolean; affectedAtomIds: number[]; structural: boolean}

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

const categoricalSection: Record<string, DeclarationSection> = {
  wimp: "meta",
  field: "fields",
  variant: "variants",
  state: "states",
  transition: "transitions",
  condition: "conditions",
  process: "processes",
  reaction: "reactions",
  matter: "matter",
  mass: "mass",
  bulk: "bulk",
}

const address = (raw: unknown, value?: unknown): Address | null => {
  if (typeof raw !== "string") return null
  const path = raw.replace(/^\/+/, "")
  const atom = /^atom\/(\d+)$/.exec(path)
  if (atom) return {kind: "atom", id: Number(atom[1])}
  const topology = /^topology\/(\d+)$/.exec(path)
  if (topology) return {kind: "topology", id: Number(topology[1])}
  const section = categoricalSection[path]
  if (!section || !isRecord(value)) return null
  if (path === "wimp") {
    return typeof value.src === "string" ? {kind: "declaration", src: value.src, section, localId: "0"} : null
  }
  const localId = Number.isSafeInteger(value.localId) ? Number(value.localId) : null
  return typeof value.wimp === "string" && localId !== null && localId > 0
    ? {kind: "declaration", src: value.wimp, section, localId: String(localId)}
    : null
}

const parentKey = (entity: {parentAtom?: unknown; parentTopology?: unknown}): string | null => {
  if (typeof entity.parentAtom === "number") return `atom:${entity.parentAtom}`
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
  readonly atoms = new Map<number, AtomRecord>()
  readonly topologies = new Map<number, TopologyRecord>()
  readonly wimps = new Map<string, BulkRuntimeWimp>()
  readonly fields = new Map<number, BulkRuntimeField>()
  readonly states = new Map<number, BulkRuntimeState>()
  readonly transitions = new Map<number, BulkRuntimeTransition>()
  readonly conditions = new Map<number, BulkRuntimeCondition>()
  readonly processes = new Map<number, BulkRuntimeProcess>()
  readonly reactions = new Map<number, BulkRuntimeReaction>()
  readonly atomStates = new Map<number, BulkRuntimeAtomState>()
  readonly variants = new Map<number, FieldEnumVariantRecord>()
  readonly atomValues = new Map<string, AtomValueRecord>()
  readonly values = new Map<number, BulkRuntimeValue>()
  readonly valueItems = new Map<string, ValueItemRecord>()
  readonly matterParticles = new Map<number, BulkRuntimeMatterParticle>()
  readonly matterTopologyBindingPaths = new Map<string, BulkRuntimeMatterBindingPath>()
  readonly matterChildWimpBindingPaths = new Map<string, BulkRuntimeMatterChildBindingPath>()
  readonly declarations = new Map<string, Map<DeclarationSection, Map<string, Record<string, unknown>>>>()
  readonly childrenByParent = new Map<string, Set<string>>()
  readonly atomIdsByWimp = new Map<string, Set<number>>()
  private nextValueId = 1

  apply(part: Particle): BulkProjectionChange {
    if (part.part === "gluon") return this.applyGluon(part)
    if (part.part === "photon") return this.applyPhoton(part)
    if (part.part !== "graviton") return {changed: false, affectedAtomIds: [], structural: false}
    const target = address(part.path, part.value)
    if (!target) return {changed: false, affectedAtomIds: [], structural: false}
    if (part.op === "test") {
      if (part.value !== undefined && !same(this.read(target), part.value)) throw new Error(`Bulk projection test failed at ${String(part.path)}`)
      return {changed: false, affectedAtomIds: [], structural: false}
    }
    if (part.op === "move" || part.op === "copy") return this.transfer(part, target)
    if (part.op === "remove") return this.remove(target)
    if (part.op !== "add" && part.op !== "replace") return {changed: false, affectedAtomIds: [], structural: false}
    return this.upsert(target, part.value)
  }

  view(): BulkRuntimeProjection {
    return {
      atoms: [...this.atoms.values()],
      topologies: [...this.topologies.values()],
      wimps: [...this.wimps.values()],
      fields: [...this.fields.values()],
      states: [...this.states.values()],
      transitions: [...this.transitions.values()],
      conditions: [...this.conditions.values()],
      processes: [...this.processes.values()],
      reactions: [...this.reactions.values()],
      atomStates: [...this.atomStates.values()],
      fieldEnumVariants: [...this.variants.values()],
      atomValues: [...this.atomValues.values()],
      values: [...this.values.values()],
      valueItems: [...this.valueItems.values()],
      matterParticles: [...this.matterParticles.values()],
      matterTopologyBindingPaths: [...this.matterTopologyBindingPaths.values()],
      matterChildWimpBindingPaths: [...this.matterChildWimpBindingPaths.values()],
    }
  }

  private read(target: Address): unknown {
    if (target.kind === "atom") return this.atoms.get(target.id)
    if (target.kind === "topology") return this.topologies.get(target.id)
    return this.declarations.get(target.src)?.get(target.section)?.get(target.localId)
  }

  private upsert(target: Address, value: unknown): BulkProjectionChange {
    if (target.kind === "atom") return this.upsertAtom(target.id, value)
    if (target.kind === "topology") return this.upsertTopology(target.id, value)
    if (!isRecord(value)) return {changed: false, affectedAtomIds: [], structural: false}
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
      if (same(current, value)) return {changed: false, affectedAtomIds: [], structural: false}
      patch(current, value)
    } else records.set(target.localId, clone(value))
    this.projectDeclaration(target, current ?? records.get(target.localId)!)
    return {changed: true, affectedAtomIds: [...(this.atomIdsByWimp.get(target.src) ?? [])], structural: true}
  }

  private upsertAtom(id: number, value: unknown): BulkProjectionChange {
    if (!isRecord(value)) return {changed: false, affectedAtomIds: [], structural: false}
    const rawAtom = isRecord(value.atom) ? value.atom : value
    const current = this.atoms.get(id)
    let changed = false
    if (current) {
      if (!isRecord(rawAtom)) return {changed: false, affectedAtomIds: [], structural: false}
      if (!same(current, rawAtom)) {
        this.unlink("atom", id, current)
        patch(current as unknown as Record<string, unknown>, rawAtom)
        this.link("atom", id, current)
        changed = true
      }
    } else {
      if (!isRecord(rawAtom) || rawAtom.id !== id || typeof rawAtom.wimp !== "string") return {changed: false, affectedAtomIds: [], structural: false}
      const atom = clone(rawAtom as unknown as AtomRecord)
      this.atoms.set(id, atom)
      this.link("atom", id, atom)
      changed = true
    }
    if (Array.isArray(value.values) && Array.isArray(value.valueRecords)) changed = this.projectAtomValues(id, value) || changed
    if (isRecord(value.state)) {
      const metaState = value.state.metaState
      if (metaState === null || (typeof metaState === "number" && Number.isSafeInteger(metaState))) {
        const next = {atom: id, state: metaState as number | null}
        const currentState = this.atomStates.get(id)
        if (!currentState) {
          this.atomStates.set(id, next)
          changed = true
        } else if (currentState.state !== next.state) {
          currentState.state = next.state
          changed = true
        }
      }
    }
    return {changed, affectedAtomIds: changed ? [id] : [], structural: changed}
  }

  private upsertTopology(id: number, value: unknown): BulkProjectionChange {
    if (!isRecord(value)) return {changed: false, affectedAtomIds: [], structural: false}
    const current = this.topologies.get(id)
    if (current) {
      if (same(current, value)) return {changed: false, affectedAtomIds: [], structural: false}
      this.unlink("topology", id, current)
      patch(current as unknown as Record<string, unknown>, value)
      this.link("topology", id, current)
    } else {
      if (value.id !== id) return {changed: false, affectedAtomIds: [], structural: false}
      const topology = clone(value as unknown as TopologyRecord)
      this.topologies.set(id, topology)
      this.link("topology", id, topology)
    }
    return {changed: true, affectedAtomIds: this.descendantAtoms(`topology:${id}`), structural: true}
  }

  private projectAtomValues(atomId: number, payload: Record<string, unknown>): boolean {
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
      const key = `${atomId}\0${field}`
      const atomValue = this.atomValues.get(key)
      if (atomValue) {
        if (atomValue.value !== valueId) {
          atomValue.value = valueId
          changed = true
        }
      } else {
        this.atomValues.set(key, {atom: atomId, field, value: valueId})
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
    } else if (target.section === "states") {
      const current = this.states.get(id)
      if (current) patch(current as unknown as Record<string, unknown>, record)
      else this.states.set(id, clone(record as unknown as BulkRuntimeState))
    } else if (target.section === "transitions") {
      const current = this.transitions.get(id)
      if (current) patch(current as unknown as Record<string, unknown>, record)
      else this.transitions.set(id, clone(record as unknown as BulkRuntimeTransition))
    } else if (target.section === "conditions") {
      const current = this.conditions.get(id)
      if (current) patch(current as unknown as Record<string, unknown>, record)
      else this.conditions.set(id, clone(record as unknown as BulkRuntimeCondition))
    } else if (target.section === "processes") {
      const current = this.processes.get(id)
      if (current) patch(current as unknown as Record<string, unknown>, record)
      else this.processes.set(id, clone(record as unknown as BulkRuntimeProcess))
    } else if (target.section === "reactions") {
      const current = this.reactions.get(id)
      if (current) patch(current as unknown as Record<string, unknown>, record)
      else this.reactions.set(id, clone(record as unknown as BulkRuntimeReaction))
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
    if (typeof part.path !== "number" || !this.atoms.has(part.path)) return {changed: false, affectedAtomIds: [], structural: false}
    const fields = resolveForceFieldsPayload(part.value)
    if (!fields) return {changed: false, affectedAtomIds: [], structural: false}
    let changed = false
    for (const [rawField, rawValue] of Object.entries(fields)) {
      const field = resolveForceFieldId(rawField)
      if (field === null) continue
      const key = `${part.path}\0${field}`
      const binding = this.atomValues.get(key)
      if (part.op === "remove") {
        if (binding) {
          this.atomValues.delete(key)
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
        if (!binding) this.atomValues.set(key, {atom: part.path, field, value: valueId})
        for (const itemKey of [...this.valueItems.keys()]) if (itemKey.startsWith(`${valueId}\0`)) this.valueItems.delete(itemKey)
        if (Array.isArray(rawValue)) rawValue.forEach((item, position) => this.valueItems.set(`${valueId}\0${position}`, {value: valueId, position, itemValue: String(item)}))
        changed = true
      } else if (part.op === "test" && !same(currentRawValue(binding && this.values.get(binding.value), this.valueItems), rawValue)) {
        throw new Error(`Bulk value test failed for atom ${part.path}, field ${field}`)
      }
    }
    return {changed, affectedAtomIds: changed ? [part.path] : [], structural: false}
  }

  private applyPhoton(part: Particle): BulkProjectionChange {
    if (typeof part.path !== "number" || typeof part.value !== "string") {
      return {changed: false, affectedAtomIds: [], structural: false}
    }
    const atom = this.atoms.get(part.path)
    if (!atom) return {changed: false, affectedAtomIds: [], structural: false}
    const state = [...this.states.values()].find((entry) => entry.wimp === atom.wimp && entry.name === part.value)
    if (!state) return {changed: false, affectedAtomIds: [], structural: false}
    const current = this.atomStates.get(part.path)
    if (current?.state === state.id) return {changed: false, affectedAtomIds: [], structural: false}
    if (current) current.state = state.id
    else this.atomStates.set(part.path, {atom: part.path, state: state.id})
    return {changed: true, affectedAtomIds: [part.path], structural: false}
  }

  private remove(target: Address): BulkProjectionChange {
    if (target.kind === "atom" || target.kind === "topology") {
      const key = `${target.kind}:${target.id}`
      const exists = target.kind === "atom" ? this.atoms.has(target.id) : this.topologies.has(target.id)
      if (!exists) return {changed: false, affectedAtomIds: [], structural: false}
      const affected = this.descendantAtoms(key)
      this.removeBranch(key)
      return {changed: true, affectedAtomIds: affected, structural: true}
    }
    const records = this.declarations.get(target.src)?.get(target.section)
    const record = records?.get(target.localId)
    if (!record || !records?.delete(target.localId)) return {changed: false, affectedAtomIds: [], structural: false}
    const id = Number(record.id)
    if (target.section === "fields") this.fields.delete(id)
    if (target.section === "variants") this.variants.delete(id)
    if (target.section === "states") this.states.delete(id)
    if (target.section === "transitions") this.transitions.delete(id)
    if (target.section === "conditions") this.conditions.delete(id)
    if (target.section === "processes") this.processes.delete(id)
    if (target.section === "reactions") this.reactions.delete(id)
    if (target.section === "matter") this.matterParticles.delete(id)
    if (target.section === "meta") this.wimps.delete(target.src)
    return {changed: true, affectedAtomIds: [...(this.atomIdsByWimp.get(target.src) ?? [])], structural: true}
  }

  private transfer(part: Particle, target: Address): BulkProjectionChange {
    const source = address(part.from)
    if (!source || source.kind !== target.kind) return {changed: false, affectedAtomIds: [], structural: false}
    const value = this.read(source)
    if (value === undefined) return {changed: false, affectedAtomIds: [], structural: false}
    if (part.op === "copy") {
      const copied = clone(value)
      if ((target.kind === "atom" || target.kind === "topology") && isRecord(copied)) copied.id = target.id
      return this.upsert(target, copied)
    }
    if (source.kind === "atom" && target.kind === "atom") {
      const atom = value as AtomRecord
      const affected = this.descendantAtoms(`atom:${source.id}`)
      this.unlink("atom", source.id, atom)
      this.atoms.delete(source.id)
      atom.id = target.id
      this.atoms.set(target.id, atom)
      this.link("atom", target.id, atom)
      const atomState = this.atomStates.get(source.id)
      if (atomState) {
        this.atomStates.delete(source.id)
        atomState.atom = target.id
        this.atomStates.set(target.id, atomState)
      }
      for (const [key, binding] of [...this.atomValues]) {
        if (binding.atom !== source.id) continue
        this.atomValues.delete(key)
        binding.atom = target.id
        this.atomValues.set(`${target.id}\0${binding.field}`, binding)
      }
      this.rekeyChildren("atom", source.id, target.id)
      return {changed: true, affectedAtomIds: [...new Set([source.id, target.id, ...affected.filter((id) => id !== source.id)])], structural: true}
    }
    if (source.kind === "topology" && target.kind === "topology") {
      const topology = value as TopologyRecord
      this.unlink("topology", source.id, topology)
      this.topologies.delete(source.id)
      topology.id = target.id
      this.topologies.set(target.id, topology)
      this.link("topology", target.id, topology)
      this.rekeyChildren("topology", source.id, target.id)
      return {changed: true, affectedAtomIds: this.descendantAtoms(`topology:${target.id}`), structural: true}
    }
    if (source.kind === "declaration" && target.kind === "declaration") {
      const sourceRecords = this.declarations.get(source.src)?.get(source.section)
      sourceRecords?.delete(source.localId)
      return this.upsert(target, value)
    }
    return {changed: false, affectedAtomIds: [], structural: false}
  }

  private link(kind: "atom" | "topology", id: number, entity: AtomRecord | TopologyRecord): void {
    const parent = parentKey(entity)
    if (parent) {
      const children = this.childrenByParent.get(parent)
      if (children) children.add(`${kind}:${id}`)
      else this.childrenByParent.set(parent, new Set([`${kind}:${id}`]))
    }
    if (kind === "atom") {
      const atom = entity as AtomRecord
      const ids = this.atomIdsByWimp.get(atom.wimp)
      if (ids) ids.add(id)
      else this.atomIdsByWimp.set(atom.wimp, new Set([id]))
    }
  }

  private unlink(kind: "atom" | "topology", id: number, entity: AtomRecord | TopologyRecord): void {
    const parent = parentKey(entity)
    if (parent) {
      this.childrenByParent.get(parent)?.delete(`${kind}:${id}`)
      if (this.childrenByParent.get(parent)?.size === 0) this.childrenByParent.delete(parent)
    }
    if (kind === "atom") {
      const atom = entity as AtomRecord
      this.atomIdsByWimp.get(atom.wimp)?.delete(id)
      if (this.atomIdsByWimp.get(atom.wimp)?.size === 0) this.atomIdsByWimp.delete(atom.wimp)
    }
  }

  private descendantAtoms(key: string): number[] {
    const ids: number[] = []
    const visit = (next: string): void => {
      if (next.startsWith("atom:")) ids.push(Number(next.slice(6)))
      for (const child of this.childrenByParent.get(next) ?? []) visit(child)
    }
    visit(key)
    return ids
  }

  private rekeyChildren(kind: "atom" | "topology", sourceId: number, targetId: number): void {
    const sourceKey = `${kind}:${sourceId}`
    const targetKey = `${kind}:${targetId}`
    const children = this.childrenByParent.get(sourceKey)
    if (!children) return
    this.childrenByParent.delete(sourceKey)
    this.childrenByParent.set(targetKey, children)
    for (const child of children) {
      const [childKind, rawId] = child.split(":") as ["atom" | "topology", string]
      const entity = childKind === "atom" ? this.atoms.get(Number(rawId)) : this.topologies.get(Number(rawId))
      if (!entity) continue
      if (kind === "atom") entity.parentAtom = targetId
      else entity.parentTopology = targetId
    }
  }

  private removeBranch(key: string): void {
    for (const child of [...(this.childrenByParent.get(key) ?? [])]) this.removeBranch(child)
    this.childrenByParent.delete(key)
    const [kind, rawId] = key.split(":") as ["atom" | "topology", string]
    const id = Number(rawId)
    if (kind === "atom") {
      const atom = this.atoms.get(id)
      if (atom) this.unlink(kind, id, atom)
      this.atoms.delete(id)
      this.atomStates.delete(id)
      for (const valueKey of [...this.atomValues.keys()]) if (valueKey.startsWith(`${id}\0`)) this.atomValues.delete(valueKey)
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
