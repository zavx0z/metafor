import type {EnergyActorEntity, EnergyProcessEntity} from "@metafor/types/energy/catalog"
import type {Particle} from "@metafor/types/force/particle"

type Address =
  | {kind: "actor"; id: number}
  | {kind: "topology"; id: number}
  | {kind: "process"; src: string; localId: string}

export type EnergyCatalogChange = {changed: boolean; affectedActorIds: number[]}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const address = (path: unknown): Address | null => {
  if (typeof path !== "string") return null
  const normalized = path.replace(/^\/+/, "")
  const actor = /^actor\/(\d+)$/.exec(normalized)
  if (actor) return {kind: "actor", id: Number(actor[1])}
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

const actorFromValue = (value: unknown): EnergyActorEntity | null => {
  const actor = isRecord(value) && isRecord(value.actor) ? value.actor : value
  if (!isRecord(actor) || typeof actor.id !== "number" || typeof actor.wimp !== "string") return null
  return clone(actor as unknown as EnergyActorEntity)
}

const processFromValue = (value: unknown): EnergyProcessEntity | null => {
  if (!isRecord(value) || typeof value.id !== "number" || typeof value.wimp !== "string" || typeof value.state !== "string" || !isRecord(value.descriptor)) return null
  return clone(value as unknown as EnergyProcessEntity)
}

const parentKey = (entity: {parentActor?: unknown; parentTopology?: unknown}): string | null => {
  if (typeof entity.parentActor === "number") return `actor:${entity.parentActor}`
  return typeof entity.parentTopology === "number" ? `topology:${entity.parentTopology}` : null
}

/** Incremental process/actor catalog owned by one Energy runtime. */
export class EnergyCatalogStore {
  readonly actors = new Map<number, EnergyActorEntity>()
  readonly topologies = new Map<number, Record<string, unknown>>()
  readonly processes = new Map<string, EnergyProcessEntity>()
  readonly actorIdsByWimp = new Map<string, Set<number>>()
  readonly processKeysByWimp = new Map<string, Set<string>>()
  readonly childrenByParent = new Map<string, Set<string>>()

  apply(part: Particle): EnergyCatalogChange {
    if (part.part !== "graviton") return {changed: false, affectedActorIds: []}
    const target = address(part.path)
    if (!target) return {changed: false, affectedActorIds: []}
    if (part.op === "test") {
      if (part.value !== undefined && !same(this.read(target), part.value)) throw new Error(`Energy catalog test failed at ${String(part.path)}`)
      return {changed: false, affectedActorIds: []}
    }
    if (part.op === "move" || part.op === "copy") return this.transfer(part, target)
    if (part.op === "remove") return this.remove(target)
    if (part.op !== "add" && part.op !== "replace") return {changed: false, affectedActorIds: []}
    return this.upsert(target, part.value)
  }

  actorWimp(actorId: number): string | undefined {
    return this.actors.get(actorId)?.wimp
  }

  process(wimp: string, state: string): EnergyProcessEntity | undefined {
    for (const key of this.processKeysByWimp.get(wimp) ?? []) {
      const process = this.processes.get(key)
      if (process?.state === state) return process
    }
    return undefined
  }

  private read(target: Address): unknown {
    if (target.kind === "actor") return this.actors.get(target.id)
    if (target.kind === "topology") return this.topologies.get(target.id)
    return this.processes.get(`${target.src}\0${target.localId}`)
  }

  private upsert(target: Address, value: unknown): EnergyCatalogChange {
    if (target.kind === "actor") {
      const next = actorFromValue(value)
      const current = this.actors.get(target.id)
      if (current) {
        const delta = isRecord(value) && isRecord(value.actor) ? value.actor : value
        if (!isRecord(delta) || same(current, delta)) return {changed: false, affectedActorIds: []}
        this.unlinkActor(current)
        patch(current as unknown as Record<string, unknown>, delta)
        this.linkActor(current)
        return {changed: true, affectedActorIds: [target.id]}
      }
      if (!next || next.id !== target.id) return {changed: false, affectedActorIds: []}
      this.actors.set(target.id, next)
      this.linkActor(next)
      return {changed: true, affectedActorIds: [target.id]}
    }
    if (target.kind === "topology") {
      if (!isRecord(value)) return {changed: false, affectedActorIds: []}
      const current = this.topologies.get(target.id)
      if (current) {
        if (same(current, value)) return {changed: false, affectedActorIds: []}
        this.unlinkChild("topology", target.id, current)
        patch(current, value)
        this.linkChild("topology", target.id, current)
      } else {
        const next = clone(value)
        this.topologies.set(target.id, next)
        this.linkChild("topology", target.id, next)
      }
      return {changed: true, affectedActorIds: this.descendantActors(`topology:${target.id}`)}
    }
    const next = processFromValue(value)
    const key = `${target.src}\0${target.localId}`
    const current = this.processes.get(key)
    if (current) {
      if (!isRecord(value) || same(current, value)) return {changed: false, affectedActorIds: []}
      const previousWimp = current.wimp
      patch(current as unknown as Record<string, unknown>, value)
      if (previousWimp !== current.wimp) {
        this.processKeysByWimp.get(previousWimp)?.delete(key)
        this.indexProcess(key, current)
      }
      return {changed: true, affectedActorIds: [...(this.actorIdsByWimp.get(current.wimp) ?? [])]}
    }
    if (!next) return {changed: false, affectedActorIds: []}
    this.processes.set(key, next)
    this.indexProcess(key, next)
    return {changed: true, affectedActorIds: [...(this.actorIdsByWimp.get(next.wimp) ?? [])]}
  }

  private remove(target: Address): EnergyCatalogChange {
    if (target.kind === "process") {
      const key = `${target.src}\0${target.localId}`
      const current = this.processes.get(key)
      if (!current) return {changed: false, affectedActorIds: []}
      this.processes.delete(key)
      this.processKeysByWimp.get(current.wimp)?.delete(key)
      return {changed: true, affectedActorIds: [...(this.actorIdsByWimp.get(current.wimp) ?? [])]}
    }
    const key = `${target.kind}:${target.id}`
    const affected = this.descendantActors(key)
    if (target.kind === "actor" && !this.actors.has(target.id)) return {changed: false, affectedActorIds: []}
    if (target.kind === "topology" && !this.topologies.has(target.id)) return {changed: false, affectedActorIds: []}
    this.removeBranch(key)
    return {changed: true, affectedActorIds: affected}
  }

  private transfer(part: Particle, target: Address): EnergyCatalogChange {
    const source = address(part.from)
    if (!source || source.kind !== target.kind) return {changed: false, affectedActorIds: []}
    const current = this.read(source)
    if (current === undefined) return {changed: false, affectedActorIds: []}
    if (part.op === "copy") {
      const copied = clone(current)
      if ((target.kind === "actor" || target.kind === "topology") && isRecord(copied)) copied.id = target.id
      return this.upsert(target, copied)
    }
    if (source.kind === "actor" && target.kind === "actor") {
      const actor = current as EnergyActorEntity
      const affected = this.descendantActors(`actor:${source.id}`)
      this.unlinkActor(actor)
      this.actors.delete(source.id)
      actor.id = target.id
      this.actors.set(target.id, actor)
      this.linkActor(actor)
      this.rekeyChildren("actor", source.id, target.id)
      return {changed: true, affectedActorIds: [...new Set([source.id, target.id, ...affected.filter((id) => id !== source.id)])]}
    }
    if (source.kind === "topology" && target.kind === "topology") {
      const topology = current as Record<string, unknown>
      this.unlinkChild("topology", source.id, topology)
      this.topologies.delete(source.id)
      topology.id = target.id
      this.topologies.set(target.id, topology)
      this.linkChild("topology", target.id, topology)
      this.rekeyChildren("topology", source.id, target.id)
      return {changed: true, affectedActorIds: this.descendantActors(`topology:${target.id}`)}
    }
    if (source.kind === "process" && target.kind === "process") {
      const sourceKey = `${source.src}\0${source.localId}`
      const targetKey = `${target.src}\0${target.localId}`
      const process = current as EnergyProcessEntity
      this.processes.delete(sourceKey)
      this.processKeysByWimp.get(process.wimp)?.delete(sourceKey)
      this.processes.set(targetKey, process)
      this.indexProcess(targetKey, process)
      return {changed: true, affectedActorIds: [...(this.actorIdsByWimp.get(process.wimp) ?? [])]}
    }
    return {changed: false, affectedActorIds: []}
  }

  private indexProcess(key: string, process: EnergyProcessEntity): void {
    const keys = this.processKeysByWimp.get(process.wimp)
    if (keys) keys.add(key)
    else this.processKeysByWimp.set(process.wimp, new Set([key]))
  }

  private linkActor(actor: EnergyActorEntity): void {
    const ids = this.actorIdsByWimp.get(actor.wimp)
    if (ids) ids.add(actor.id)
    else this.actorIdsByWimp.set(actor.wimp, new Set([actor.id]))
    this.linkChild("actor", actor.id, actor)
  }

  private unlinkActor(actor: EnergyActorEntity): void {
    this.actorIdsByWimp.get(actor.wimp)?.delete(actor.id)
    if (this.actorIdsByWimp.get(actor.wimp)?.size === 0) this.actorIdsByWimp.delete(actor.wimp)
    this.unlinkChild("actor", actor.id, actor)
  }

  private linkChild(kind: "actor" | "topology", id: number, entity: Record<string, unknown> | EnergyActorEntity): void {
    const parent = parentKey(entity)
    if (!parent) return
    const children = this.childrenByParent.get(parent)
    if (children) children.add(`${kind}:${id}`)
    else this.childrenByParent.set(parent, new Set([`${kind}:${id}`]))
  }

  private unlinkChild(kind: "actor" | "topology", id: number, entity: Record<string, unknown> | EnergyActorEntity): void {
    const parent = parentKey(entity)
    if (!parent) return
    this.childrenByParent.get(parent)?.delete(`${kind}:${id}`)
    if (this.childrenByParent.get(parent)?.size === 0) this.childrenByParent.delete(parent)
  }

  private descendantActors(key: string): number[] {
    const found: number[] = []
    const visit = (next: string): void => {
      if (next.startsWith("actor:")) found.push(Number(next.slice(6)))
      for (const child of this.childrenByParent.get(next) ?? []) visit(child)
    }
    visit(key)
    return found
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
      if (actor) this.unlinkActor(actor)
      this.actors.delete(id)
    } else {
      const topology = this.topologies.get(id)
      if (topology) this.unlinkChild(kind, id, topology)
      this.topologies.delete(id)
    }
  }
}
