import type {
  EnergyAtomContinuation,
  EnergyAtomEntity,
  EnergyFieldEntity,
  EnergyMassArtifact,
  EnergyProcessEntity,
  EnergyVariantEntity,
} from "@metafor/types/energy/catalog"
import type {Particle} from "shared/protocol/force/particle"

type Address =
  | {kind: "atom"; id: number}
  | {kind: "topology"; id: number}
  | {kind: "field"; id: number}
  | {kind: "variant"; id: number}
  | {kind: "process"; src: string; localId: string}

export type EnergyCatalogChange = {changed: boolean; affectedAtomIds: number[]}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const address = (path: unknown, value?: unknown): Address | null => {
  if (typeof path !== "string") return null
  const normalized = path.replace(/^\/+/, "")
  const atom = /^atom\/(\d+)$/.exec(normalized)
  if (atom) return {kind: "atom", id: Number(atom[1])}
  const topology = /^topology\/(\d+)$/.exec(normalized)
  if (topology) return {kind: "topology", id: Number(topology[1])}
  if (
    (normalized === "field" || normalized === "variant") && isRecord(value) &&
    Number.isSafeInteger(value.id) && Number(value.id) > 0
  ) return {kind: normalized, id: Number(value.id)}
  if (
    normalized === "process" && isRecord(value) && typeof value.wimp === "string" &&
    Number.isSafeInteger(value.localId) && Number(value.localId) > 0
  ) return {kind: "process", src: value.wimp, localId: String(value.localId)}
  return null
}

const clone = <T>(value: T): T => structuredClone(value)

const same = (left: unknown, right: unknown): boolean => {
  if (Object.is(left, right)) return true
  if (Array.isArray(left) && Array.isArray(right)) return left.length === right.length && left.every((item, i) => same(item, right[i]))
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

const atomFromValue = (value: unknown): EnergyAtomEntity | null => {
  const atom = isRecord(value) && isRecord(value.atom) ? value.atom : value
  if (!isRecord(atom) || typeof atom.id !== "number" || typeof atom.wimp !== "string") return null
  return clone(atom as unknown as EnergyAtomEntity)
}

const continuationFromValue = (value: unknown): EnergyAtomContinuation | undefined => {
  if (!isRecord(value) || !isRecord(value.continuation)) return
  return clone(value.continuation as EnergyAtomContinuation)
}

const massFromValue = (value: unknown): EnergyMassArtifact[] => {
  if (!isRecord(value) || !Array.isArray(value.mass)) return []
  return value.mass.filter((item): item is EnergyMassArtifact => isRecord(item) &&
    Number.isSafeInteger(item.id) && typeof item.key === "string" && typeof item.keyId === "string" &&
    (item.format === "json" || item.format === "binary") && typeof item.mime === "string" &&
    (typeof item.label === "string" || item.label === null) && (typeof item.description === "string" || item.description === null),
  ).map((item) => structuredClone(item))
}

const isCanonicalAtomEnvelope = (value: unknown): boolean =>
  isRecord(value) && isRecord(value.atom) && Array.isArray(value.values) &&
  Array.isArray(value.valueRecords) && isRecord(value.state)

const processFromValue = (value: unknown): EnergyProcessEntity | null => {
  if (!isRecord(value) || typeof value.id !== "number" || typeof value.wimp !== "string" || typeof value.state !== "string" || !isRecord(value.descriptor)) return null
  return clone(value as unknown as EnergyProcessEntity)
}

const fieldFromValue = (value: unknown): EnergyFieldEntity | null => {
  if (
    !isRecord(value) || typeof value.id !== "number" || typeof value.wimp !== "string" ||
    typeof value.localId !== "number" || typeof value.key !== "string" ||
    !["string", "number", "boolean", "array", "enum"].includes(String(value.type)) ||
    typeof value.required !== "boolean"
  ) return null
  return clone(value as unknown as EnergyFieldEntity)
}

const variantFromValue = (value: unknown): EnergyVariantEntity | null => {
  if (
    !isRecord(value) || typeof value.id !== "number" || typeof value.wimp !== "string" ||
    typeof value.localId !== "number" || typeof value.field !== "number" ||
    typeof value.position !== "number" || typeof value.itemValue !== "string"
  ) return null
  return clone(value as unknown as EnergyVariantEntity)
}

const parentKey = (entity: {parentAtom?: unknown; parentTopology?: unknown}): string | null => {
  if (typeof entity.parentAtom === "number") return `atom:${entity.parentAtom}`
  return typeof entity.parentTopology === "number" ? `topology:${entity.parentTopology}` : null
}

/** Incremental process/atom catalog owned by one Energy runtime. */
export class EnergyCatalogStore {
  readonly atoms = new Map<number, EnergyAtomEntity>()
  readonly continuations = new Map<number, EnergyAtomContinuation>()
  readonly massArtifacts = new Map<number, EnergyMassArtifact[]>()
  readonly topologies = new Map<number, Record<string, unknown>>()
  readonly fields = new Map<number, EnergyFieldEntity>()
  readonly variants = new Map<number, EnergyVariantEntity>()
  readonly processes = new Map<string, EnergyProcessEntity>()
  readonly atomIdsByWimp = new Map<string, Set<number>>()
  readonly processKeysByWimp = new Map<string, Set<string>>()
  readonly fieldIdsByWimp = new Map<string, Set<number>>()
  readonly variantIdsByField = new Map<number, Set<number>>()
  readonly childrenByParent = new Map<string, Set<string>>()

  /** Atom bindings whose local runtime projection can change with this Graviton. */
  affectedAtomIds(part: Particle): number[] {
    if (part.part !== "graviton") return []
    if (part.op !== "add" && part.op !== "replace" && part.op !== "remove" && part.op !== "move" && part.op !== "copy") return []
    const target = address(part.path, part.value)
    if (target?.kind === "atom") {
      return part.op === "add" || part.op === "replace"
        ? [target.id]
        : this.descendantAtoms(`atom:${target.id}`)
    }
    if (target?.kind === "topology") {
      return part.op === "remove" ? this.descendantAtoms(`topology:${target.id}`) : []
    }

    if (target?.kind === "field") {
      const wimp = this.fields.get(target.id)?.wimp ?? this.wimpFromValue(part.value)
      return wimp === undefined ? [] : [...(this.atomIdsByWimp.get(wimp) ?? [])]
    }
    if (target?.kind === "variant") {
      const wimp = this.variants.get(target.id)?.wimp ?? this.wimpFromValue(part.value)
      return wimp === undefined ? [] : [...(this.atomIdsByWimp.get(wimp) ?? [])]
    }
    if (target?.kind === "process") {
      const current = this.processes.get(`${target.src}\0${target.localId}`)
      const wimp = current?.wimp ?? this.wimpFromValue(part.value)
      return wimp === undefined ? [] : [...(this.atomIdsByWimp.get(wimp) ?? [])]
    }

    const wimp = this.wimpFromValue(part.value)
    return wimp === undefined ? [] : [...(this.atomIdsByWimp.get(wimp) ?? [])]
  }

  /** Running Process slots invalidated by the same declaration scope as Matrix. */
  invalidatedProcessAtomIds(part: Particle): number[] {
    if (part.part !== "graviton") return []
    if (part.op !== "add" && part.op !== "replace" && part.op !== "remove") return []
    const target = address(part.path, part.value)
    if (target?.kind === "atom") {
      if (part.op === "remove") return this.descendantAtoms(`atom:${target.id}`)
      const current = this.atoms.get(target.id)
      const next = atomFromValue(part.value)
      return current && next && (
        current.wimp !== next.wimp ||
        (part.op === "replace" && isCanonicalAtomEnvelope(part.value))
      )
        ? [target.id]
        : []
    }
    if (target?.kind === "topology") return []
    if (target?.kind === "field") {
      const wimp = this.fields.get(target.id)?.wimp ?? this.wimpFromValue(part.value)
      return wimp === undefined ? [] : [...(this.atomIdsByWimp.get(wimp) ?? [])]
    }
    if (target?.kind === "variant") {
      const wimp = this.variants.get(target.id)?.wimp ?? this.wimpFromValue(part.value)
      return wimp === undefined ? [] : [...(this.atomIdsByWimp.get(wimp) ?? [])]
    }
    if (target?.kind === "process") {
      const current = this.processes.get(`${target.src}\0${target.localId}`)
      const wimp = current?.wimp ?? this.wimpFromValue(part.value)
      return wimp === undefined ? [] : [...(this.atomIdsByWimp.get(wimp) ?? [])]
    }

    const path = typeof part.path === "string" ? part.path.replace(/^\/+/, "") : ""
    if (path !== "wimp" && path !== "matter" && path !== "state" && path !== "transition" && path !== "condition") return []
    const wimp = this.wimpFromValue(part.value)
    return wimp === undefined ? [] : [...(this.atomIdsByWimp.get(wimp) ?? [])]
  }

  apply(part: Particle): EnergyCatalogChange {
    if (part.part !== "graviton") return {changed: false, affectedAtomIds: []}
    const target = address(part.path, part.value)
    if (!target) {
      const affectedAtomIds = this.affectedAtomIds(part)
      return affectedAtomIds.length === 0
        ? {changed: false, affectedAtomIds: []}
        : {changed: true, affectedAtomIds}
    }
    if (part.op === "test") {
      if (part.value !== undefined && !same(this.read(target), part.value)) throw new Error(`Energy catalog test failed at ${String(part.path)}`)
      return {changed: false, affectedAtomIds: []}
    }
    if (part.op === "move" || part.op === "copy") return this.transfer(part, target)
    if (part.op === "remove") return this.remove(target)
    if (part.op !== "add" && part.op !== "replace") return {changed: false, affectedAtomIds: []}
    return this.upsert(target, part.value)
  }

  atomWimp(atomId: number): string | undefined {
    return this.atoms.get(atomId)?.wimp
  }

  /** Nearest owning parent Atom, including children born below a topology node. */
  parentAtom(atomId: number): EnergyAtomEntity | undefined {
    const atom = this.atoms.get(atomId)
    if (!atom) return
    if (typeof atom.parentAtom === "number") return this.atoms.get(atom.parentAtom)
    if (typeof atom.parentTopology !== "number") return

    const visited = new Set<number>()
    let topologyId: number | undefined = atom.parentTopology
    while (topologyId !== undefined && !visited.has(topologyId)) {
      visited.add(topologyId)
      const topology = this.topologies.get(topologyId)
      if (!topology) return
      if (typeof topology.parentAtom === "number") return this.atoms.get(topology.parentAtom)
      topologyId = typeof topology.parentTopology === "number" ? topology.parentTopology : undefined
    }
  }

  continuation(atomId: number): EnergyAtomContinuation | undefined {
    return this.continuations.get(atomId)
  }

  mass(atomId: number): readonly EnergyMassArtifact[] {
    return this.massArtifacts.get(atomId) ?? []
  }

  process(wimp: string, state: string): EnergyProcessEntity | undefined {
    for (const key of this.processKeysByWimp.get(wimp) ?? []) {
      const process = this.processes.get(key)
      if (process?.state === state) return process
    }
    return undefined
  }

  /** Teardown hooks declared by this WIMP, in canonical declaration order. */
  destroyProcesses(wimp: string): EnergyProcessEntity[] {
    const result: EnergyProcessEntity[] = []
    const keys = [...(this.processKeysByWimp.get(wimp) ?? [])]
      .sort((left, right) => Number(left.slice(left.lastIndexOf("\0") + 1)) - Number(right.slice(right.lastIndexOf("\0") + 1)))
    for (const key of keys) {
      const process = this.processes.get(key)
      if (process?.descriptor.type === "finally") result.push(clone(process))
    }
    return result
  }

  fieldSchema(wimp: string): Record<string, Record<string, unknown>> {
    const schema: Record<string, Record<string, unknown>> = {}
    for (const id of this.fieldIdsByWimp.get(wimp) ?? []) {
      const field = this.fields.get(id)
      if (!field) continue
      const definition: Record<string, unknown> = {
        type: field.type,
        ...(field.required ? {required: true} : {}),
        ...(field.default !== undefined ? {default: clone(field.default)} : {}),
        ...(typeof field.label === "string" ? {label: field.label} : {}),
      }
      if (field.type === "enum") {
        definition.values = [...(this.variantIdsByField.get(field.id) ?? [])]
          .map((variantId) => this.variants.get(variantId))
          .filter((variant): variant is EnergyVariantEntity => variant !== undefined)
          .sort((left, right) => left.position - right.position)
          .map((variant) => variant.itemValue)
      }
      schema[field.key] = definition
    }
    return schema
  }

  private wimpFromValue(value: unknown): string | undefined {
    if (!isRecord(value)) return
    if (typeof value.wimp === "string") return value.wimp
    return typeof value.src === "string" ? value.src : undefined
  }

  private read(target: Address): unknown {
    if (target.kind === "atom") return this.atoms.get(target.id)
    if (target.kind === "topology") return this.topologies.get(target.id)
    if (target.kind === "field") return this.fields.get(target.id)
    if (target.kind === "variant") return this.variants.get(target.id)
    return this.processes.get(`${target.src}\0${target.localId}`)
  }

  private upsert(target: Address, value: unknown): EnergyCatalogChange {
    if (target.kind === "atom") {
      const next = atomFromValue(value)
      const nextContinuation = continuationFromValue(value)
      const canonicalEnvelope = isCanonicalAtomEnvelope(value)
      const current = this.atoms.get(target.id)
      if (current) {
        const delta = isRecord(value) && isRecord(value.atom) ? value.atom : value
        const continuationChanged = canonicalEnvelope
          ? !same(this.continuations.get(target.id), nextContinuation)
          : nextContinuation !== undefined && !same(this.continuations.get(target.id), nextContinuation)
        if (!isRecord(delta)) return {changed: false, affectedAtomIds: []}
        if (same(current, delta) && !continuationChanged) {
          return canonicalEnvelope
            ? {changed: true, affectedAtomIds: [target.id]}
            : {changed: false, affectedAtomIds: []}
        }
        this.unlinkAtom(current)
        if (!same(current, delta)) patch(current as unknown as Record<string, unknown>, delta)
        if (nextContinuation !== undefined) this.continuations.set(target.id, nextContinuation)
        else if (canonicalEnvelope) this.continuations.delete(target.id)
        if (canonicalEnvelope) this.massArtifacts.set(target.id, massFromValue(value))
        this.linkAtom(current)
        return {changed: true, affectedAtomIds: [target.id]}
      }
      if (!next || next.id !== target.id) return {changed: false, affectedAtomIds: []}
      this.atoms.set(target.id, next)
      if (nextContinuation !== undefined) this.continuations.set(target.id, nextContinuation)
      this.massArtifacts.set(target.id, massFromValue(value))
      this.linkAtom(next)
      return {changed: true, affectedAtomIds: [target.id]}
    }
    if (target.kind === "topology") {
      if (!isRecord(value)) return {changed: false, affectedAtomIds: []}
      const current = this.topologies.get(target.id)
      if (current) {
        if (same(current, value)) return {changed: false, affectedAtomIds: []}
        this.unlinkChild("topology", target.id, current)
        patch(current, value)
        this.linkChild("topology", target.id, current)
      } else {
        const next = clone(value)
        this.topologies.set(target.id, next)
        this.linkChild("topology", target.id, next)
      }
      return {changed: true, affectedAtomIds: []}
    }
    if (target.kind === "field") {
      const next = fieldFromValue(value)
      const current = this.fields.get(target.id)
      if (current) {
        if (!isRecord(value) || same(current, value)) return {changed: false, affectedAtomIds: []}
        this.unindexField(current)
        patch(current as unknown as Record<string, unknown>, value)
        this.indexField(current)
        return {changed: true, affectedAtomIds: [...(this.atomIdsByWimp.get(current.wimp) ?? [])]}
      }
      if (!next || next.id !== target.id) return {changed: false, affectedAtomIds: []}
      this.fields.set(target.id, next)
      this.indexField(next)
      return {changed: true, affectedAtomIds: [...(this.atomIdsByWimp.get(next.wimp) ?? [])]}
    }
    if (target.kind === "variant") {
      const next = variantFromValue(value)
      const current = this.variants.get(target.id)
      if (current) {
        if (!isRecord(value) || same(current, value)) return {changed: false, affectedAtomIds: []}
        this.unindexVariant(current)
        patch(current as unknown as Record<string, unknown>, value)
        this.indexVariant(current)
        return {changed: true, affectedAtomIds: [...(this.atomIdsByWimp.get(current.wimp) ?? [])]}
      }
      if (!next || next.id !== target.id) return {changed: false, affectedAtomIds: []}
      this.variants.set(target.id, next)
      this.indexVariant(next)
      return {changed: true, affectedAtomIds: [...(this.atomIdsByWimp.get(next.wimp) ?? [])]}
    }
    const next = processFromValue(value)
    const key = `${target.src}\0${target.localId}`
    const current = this.processes.get(key)
    if (current) {
      if (!isRecord(value) || same(current, value)) return {changed: false, affectedAtomIds: []}
      const previousWimp = current.wimp
      patch(current as unknown as Record<string, unknown>, value)
      if (previousWimp !== current.wimp) {
        this.processKeysByWimp.get(previousWimp)?.delete(key)
        this.indexProcess(key, current)
      }
      return {changed: true, affectedAtomIds: [...(this.atomIdsByWimp.get(current.wimp) ?? [])]}
    }
    if (!next) return {changed: false, affectedAtomIds: []}
    this.processes.set(key, next)
    this.indexProcess(key, next)
    return {changed: true, affectedAtomIds: [...(this.atomIdsByWimp.get(next.wimp) ?? [])]}
  }

  private remove(target: Address): EnergyCatalogChange {
    if (target.kind === "field") {
      const current = this.fields.get(target.id)
      if (!current) return {changed: false, affectedAtomIds: []}
      this.unindexField(current)
      this.fields.delete(target.id)
      for (const variantId of [...(this.variantIdsByField.get(target.id) ?? [])]) {
        const variant = this.variants.get(variantId)
        if (variant) this.unindexVariant(variant)
        this.variants.delete(variantId)
      }
      return {changed: true, affectedAtomIds: [...(this.atomIdsByWimp.get(current.wimp) ?? [])]}
    }
    if (target.kind === "variant") {
      const current = this.variants.get(target.id)
      if (!current) return {changed: false, affectedAtomIds: []}
      this.unindexVariant(current)
      this.variants.delete(target.id)
      return {changed: true, affectedAtomIds: [...(this.atomIdsByWimp.get(current.wimp) ?? [])]}
    }
    if (target.kind === "process") {
      const key = `${target.src}\0${target.localId}`
      const current = this.processes.get(key)
      if (!current) return {changed: false, affectedAtomIds: []}
      this.processes.delete(key)
      this.processKeysByWimp.get(current.wimp)?.delete(key)
      return {changed: true, affectedAtomIds: [...(this.atomIdsByWimp.get(current.wimp) ?? [])]}
    }
    const key = `${target.kind}:${target.id}`
    const affected = this.descendantAtoms(key)
    if (target.kind === "atom" && !this.atoms.has(target.id)) return {changed: false, affectedAtomIds: []}
    if (target.kind === "topology" && !this.topologies.has(target.id)) return {changed: false, affectedAtomIds: []}
    this.removeBranch(key)
    return {changed: true, affectedAtomIds: affected}
  }

  private transfer(part: Particle, target: Address): EnergyCatalogChange {
    const source = address(part.from)
    if (!source || source.kind !== target.kind) return {changed: false, affectedAtomIds: []}
    const current = this.read(source)
    if (current === undefined) return {changed: false, affectedAtomIds: []}
    if (part.op === "copy") {
      const copied = clone(current)
      if ((target.kind === "atom" || target.kind === "topology") && isRecord(copied)) copied.id = target.id
      return target.kind === "atom" && source.kind === "atom"
        ? this.upsert(target, {
            atom: copied,
            ...(this.continuations.has(source.id) ? {continuation: clone(this.continuations.get(source.id)!)} : {}),
          })
        : this.upsert(target, copied)
    }
    if (source.kind === "atom" && target.kind === "atom") {
      const atom = current as EnergyAtomEntity
      const affected = this.descendantAtoms(`atom:${source.id}`)
      this.unlinkAtom(atom)
      this.atoms.delete(source.id)
      const continuation = this.continuations.get(source.id)
      this.continuations.delete(source.id)
      const mass = this.massArtifacts.get(source.id)
      this.massArtifacts.delete(source.id)
      atom.id = target.id
      this.atoms.set(target.id, atom)
      if (continuation !== undefined) this.continuations.set(target.id, continuation)
      if (mass !== undefined) this.massArtifacts.set(target.id, mass)
      this.linkAtom(atom)
      this.rekeyChildren("atom", source.id, target.id)
      return {changed: true, affectedAtomIds: [...new Set([source.id, target.id, ...affected.filter((id) => id !== source.id)])]}
    }
    if (source.kind === "topology" && target.kind === "topology") {
      const topology = current as Record<string, unknown>
      this.unlinkChild("topology", source.id, topology)
      this.topologies.delete(source.id)
      topology.id = target.id
      this.topologies.set(target.id, topology)
      this.linkChild("topology", target.id, topology)
      this.rekeyChildren("topology", source.id, target.id)
      return {changed: true, affectedAtomIds: []}
    }
    if (source.kind === "field" || source.kind === "variant" || target.kind === "field" || target.kind === "variant") {
      return {changed: false, affectedAtomIds: []}
    }
    if (source.kind === "process" && target.kind === "process") {
      const sourceKey = `${source.src}\0${source.localId}`
      const targetKey = `${target.src}\0${target.localId}`
      const process = current as EnergyProcessEntity
      this.processes.delete(sourceKey)
      this.processKeysByWimp.get(process.wimp)?.delete(sourceKey)
      this.processes.set(targetKey, process)
      this.indexProcess(targetKey, process)
      return {changed: true, affectedAtomIds: [...(this.atomIdsByWimp.get(process.wimp) ?? [])]}
    }
    return {changed: false, affectedAtomIds: []}
  }

  private indexProcess(key: string, process: EnergyProcessEntity): void {
    const keys = this.processKeysByWimp.get(process.wimp)
    if (keys) keys.add(key)
    else this.processKeysByWimp.set(process.wimp, new Set([key]))
  }

  private indexField(field: EnergyFieldEntity): void {
    const ids = this.fieldIdsByWimp.get(field.wimp)
    if (ids) ids.add(field.id)
    else this.fieldIdsByWimp.set(field.wimp, new Set([field.id]))
  }

  private unindexField(field: EnergyFieldEntity): void {
    this.fieldIdsByWimp.get(field.wimp)?.delete(field.id)
    if (this.fieldIdsByWimp.get(field.wimp)?.size === 0) this.fieldIdsByWimp.delete(field.wimp)
  }

  private indexVariant(variant: EnergyVariantEntity): void {
    const ids = this.variantIdsByField.get(variant.field)
    if (ids) ids.add(variant.id)
    else this.variantIdsByField.set(variant.field, new Set([variant.id]))
  }

  private unindexVariant(variant: EnergyVariantEntity): void {
    this.variantIdsByField.get(variant.field)?.delete(variant.id)
    if (this.variantIdsByField.get(variant.field)?.size === 0) this.variantIdsByField.delete(variant.field)
  }

  private linkAtom(atom: EnergyAtomEntity): void {
    const ids = this.atomIdsByWimp.get(atom.wimp)
    if (ids) ids.add(atom.id)
    else this.atomIdsByWimp.set(atom.wimp, new Set([atom.id]))
    this.linkChild("atom", atom.id, atom)
  }

  private unlinkAtom(atom: EnergyAtomEntity): void {
    this.atomIdsByWimp.get(atom.wimp)?.delete(atom.id)
    if (this.atomIdsByWimp.get(atom.wimp)?.size === 0) this.atomIdsByWimp.delete(atom.wimp)
    this.unlinkChild("atom", atom.id, atom)
  }

  private linkChild(kind: "atom" | "topology", id: number, entity: Record<string, unknown> | EnergyAtomEntity): void {
    const parent = parentKey(entity)
    if (!parent) return
    const children = this.childrenByParent.get(parent)
    if (children) children.add(`${kind}:${id}`)
    else this.childrenByParent.set(parent, new Set([`${kind}:${id}`]))
  }

  private unlinkChild(kind: "atom" | "topology", id: number, entity: Record<string, unknown> | EnergyAtomEntity): void {
    const parent = parentKey(entity)
    if (!parent) return
    this.childrenByParent.get(parent)?.delete(`${kind}:${id}`)
    if (this.childrenByParent.get(parent)?.size === 0) this.childrenByParent.delete(parent)
  }

  private descendantAtoms(key: string): number[] {
    const found: number[] = []
    const visit = (next: string): void => {
      if (next.startsWith("atom:")) found.push(Number(next.slice(5)))
      for (const child of this.childrenByParent.get(next) ?? []) visit(child)
    }
    visit(key)
    return found
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
      if (atom) this.unlinkAtom(atom)
      this.atoms.delete(id)
      this.continuations.delete(id)
      this.massArtifacts.delete(id)
    } else {
      const topology = this.topologies.get(id)
      if (topology) this.unlinkChild(kind, id, topology)
      this.topologies.delete(id)
    }
  }
}
