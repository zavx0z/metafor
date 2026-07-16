import type {EnergyAtomEntity, EnergyProcessEntity} from "@metafor/types/energy/catalog"
import type {Particle} from "@metafor/types/force/particle"

type Address =
  | {kind: "atom"; id: number}
  | {kind: "topology"; id: number}
  | {kind: "process"; src: string; localId: string}

export type EnergyCatalogChange = {changed: boolean; affectedAtomIds: number[]}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const address = (path: unknown): Address | null => {
  if (typeof path !== "string") return null
  const normalized = path.replace(/^\/+/, "")
  const atom = /^atom\/(\d+)$/.exec(normalized)
  if (atom) return {kind: "atom", id: Number(atom[1])}
  const topology = /^topology\/(\d+)$/.exec(normalized)
  if (topology) return {kind: "topology", id: Number(topology[1])}
  const process = /^declaration\/(.+)\/processes\/([^/]+)$/.exec(normalized)
  return process ? {kind: "process", src: process[1]!, localId: process[2]!} : null
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

const processFromValue = (value: unknown): EnergyProcessEntity | null => {
  if (!isRecord(value) || typeof value.id !== "number" || typeof value.wimp !== "string" || typeof value.state !== "string" || !isRecord(value.descriptor)) return null
  return clone(value as unknown as EnergyProcessEntity)
}

const parentKey = (entity: {parentAtom?: unknown; parentTopology?: unknown}): string | null => {
  if (typeof entity.parentAtom === "number") return `atom:${entity.parentAtom}`
  return typeof entity.parentTopology === "number" ? `topology:${entity.parentTopology}` : null
}

/** Incremental process/atom catalog owned by one Energy runtime. */
export class EnergyCatalogStore {
  readonly atoms = new Map<number, EnergyAtomEntity>()
  readonly topologies = new Map<number, Record<string, unknown>>()
  readonly processes = new Map<string, EnergyProcessEntity>()
  readonly atomIdsByWimp = new Map<string, Set<number>>()
  readonly processKeysByWimp = new Map<string, Set<string>>()
  readonly childrenByParent = new Map<string, Set<string>>()

  apply(part: Particle): EnergyCatalogChange {
    if (part.part !== "graviton") return {changed: false, affectedAtomIds: []}
    const target = address(part.path)
    if (!target) return {changed: false, affectedAtomIds: []}
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

  process(wimp: string, state: string): EnergyProcessEntity | undefined {
    for (const key of this.processKeysByWimp.get(wimp) ?? []) {
      const process = this.processes.get(key)
      if (process?.state === state) return process
    }
    return undefined
  }

  private read(target: Address): unknown {
    if (target.kind === "atom") return this.atoms.get(target.id)
    if (target.kind === "topology") return this.topologies.get(target.id)
    return this.processes.get(`${target.src}\0${target.localId}`)
  }

  private upsert(target: Address, value: unknown): EnergyCatalogChange {
    if (target.kind === "atom") {
      const next = atomFromValue(value)
      const current = this.atoms.get(target.id)
      if (current) {
        const delta = isRecord(value) && isRecord(value.atom) ? value.atom : value
        if (!isRecord(delta) || same(current, delta)) return {changed: false, affectedAtomIds: []}
        this.unlinkAtom(current)
        patch(current as unknown as Record<string, unknown>, delta)
        this.linkAtom(current)
        return {changed: true, affectedAtomIds: [target.id]}
      }
      if (!next || next.id !== target.id) return {changed: false, affectedAtomIds: []}
      this.atoms.set(target.id, next)
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
      return {changed: true, affectedAtomIds: this.descendantAtoms(`topology:${target.id}`)}
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
      return this.upsert(target, copied)
    }
    if (source.kind === "atom" && target.kind === "atom") {
      const atom = current as EnergyAtomEntity
      const affected = this.descendantAtoms(`atom:${source.id}`)
      this.unlinkAtom(atom)
      this.atoms.delete(source.id)
      atom.id = target.id
      this.atoms.set(target.id, atom)
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
      return {changed: true, affectedAtomIds: this.descendantAtoms(`topology:${target.id}`)}
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
      if (next.startsWith("atom:")) found.push(Number(next.slice(6)))
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
    } else {
      const topology = this.topologies.get(id)
      if (topology) this.unlinkChild(kind, id, topology)
      this.topologies.delete(id)
    }
  }
}
