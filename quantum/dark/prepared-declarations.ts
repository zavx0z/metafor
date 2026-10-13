import type {MetaDSL} from "@metafor/types/metafor/schema"
import type {Particle} from "shared/protocol/force/particle"
import type {BoundaryMetaReadReceipt} from "shared/protocol/boundary/declaration"
import type {BoundaryInitialProjectionEntry} from "shared/protocol/boundary/initial"
import {preparedDeclarationEntities} from "./dark"
import {loadMetaDeclarationGraph, type LoadedMetaDeclaration, type MetaLoader} from "./graph/declaration"

export interface PreparedDeclarationsInput {
  operationId: string
  releaseDigest: string
  root: string
  expectedFrontier: {cutId: string; throughSequence: number}
  /** Только native caller: loader выбранного verified installed digest, никогда source fallback. */
  readMeta: MetaLoader
}
export interface PreparedDeclarationsReceipt {
  operationId: string
  releaseDigest: string
  phase: "complete" | "uncertain"
  planned: number
  accepted: number
  frontier: {cutId: string; throughSequence: number} | null
  error: string | null
}
export type PreparedDeclarationSnapshot = {root: string; frontier: {cutId: string; throughSequence: number}; canonical: BoundaryMetaReadReceipt; busy: boolean}
const canonical = (item: unknown): unknown => Array.isArray(item) ? item.map(canonical) : item !== null && typeof item === "object"
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, canonical((item as Record<string, unknown>)[key])])) : item
const same = (left: unknown, right: unknown) => JSON.stringify(canonical(left)) === JSON.stringify(canonical(right))
const reject = (message: string): never => {throw new Error(`Prepared declarations incompatible: ${message}`)}
const fields = (meta: MetaDSL) => meta.fields.map(field => {
  const value = {...field} as Record<string, unknown>
  delete value.label
  if (value.required !== true) {delete value.required; if (value.default === null) delete value.default}
  return value
})
const prefix = <T>(before: readonly T[], after: readonly T[], identity: (value: T) => unknown, label: string) => {
  if (after.length < before.length || before.some((value, index) => !same(identity(value), identity(after[index]!)))) reject(`${label} must retain all existing local identities and order`)
}

/** Этот профиль отвергает исторические gaps/reorders до вычисления первого Particle. */
export function assertPreparedCanonicalLocalIds(entries: readonly BoundaryInitialProjectionEntry[], current: BoundaryMetaReadReceipt): void {
  for (const meta of current.declarations) {
    const entities = preparedDeclarationEntities(meta.address, meta.meta)
    for (const kind of ["field", "variant", "state", "transition", "condition", "process", "mass", "reaction", "matter"]) {
      const expected = entities.filter(entity => entity.path === kind)
      const actual = entries.filter(entry => entry.path === kind && (entry.value as Record<string, unknown>)?.wimp === meta.address)
      if (actual.length !== expected.length) reject(`${meta.address} ${kind} projection count disagrees`)
      for (const entry of actual) {
        const value = entry.value as Record<string, unknown>
        const entity = expected.find(candidate => candidate.value.id === value.localId) ?? reject(`${meta.address} ${kind} local IDs are not append-compatible`)
        const keys = kind === "field" || kind === "mass" || kind === "reaction" ? ["key"] : kind === "state" ? ["name", "position"] : kind === "matter" ? ["kind", "src", "parent", "edgeSlot", "position"] : []
        if (keys.some(key => !same(value[key], entity.value[key])) || kind === "process" && value.state !== entity.value.key) reject(`${meta.address} ${kind} local identity reordered`)
      }
    }
  }
}

/**
Полный чистый preflight append-compatible profile. Existing names и positional
local IDs сохраняются; Fields и Mass не меняют свой тип/default/формат. Matter
может обновить только Field bindings существующего occurrence. Wave relations
перестраиваются после удаления прежних условий, сохраняя State и Atom identity.
См. [явную активацию](../../docs/META_PACKAGES.md#данные-и-исполняемый-код).
*/
export function planPreparedDeclarations(current: BoundaryMetaReadReceipt, prepared: readonly LoadedMetaDeclaration[]): Particle[] {
  const target = new Map(prepared.map(meta => [meta.address as string, meta.dsl]))
  const previous = new Map(current.declarations.map(meta => [meta.address as string, meta.meta]))
  for (const [address, before] of previous) {
    const after = target.get(address) ?? reject(`existing Meta ${address} was removed`)
    prefix(fields(before), fields(after), value => value, `${address} Fields`)
    prefix(before.superposition, after.superposition, state => state.name, `${address} States`)
    prefix(before.processes ?? [], after.processes ?? [], process => [process.key, process.declaration.type], `${address} Processes`)
    prefix(before.mass ?? [], after.mass ?? [], mass => [mass.key, mass.format], `${address} Mass`)
    prefix(before.reactions ?? [], after.reactions ?? [], reaction => reaction.key, `${address} Reactions`)
    if (!same(before.lifecycle, after.lifecycle)) reject(`${address} lifecycle changed`)
    const oldMatter = preparedDeclarationEntities(address, before).filter(entity => entity.path === "matter")
    const newMatter = preparedDeclarationEntities(address, after).filter(entity => entity.path === "matter")
    const matterIdentity = (entity: typeof oldMatter[number]) => {
      const {fieldsBinding: _fields, ...identity} = entity.value
      return identity
    }
    prefix(oldMatter, newMatter, matterIdentity, `${address} Matter`)
  }
  const particles: Particle[] = []
  for (const loaded of prepared) {
    const address = loaded.address
    const before = previous.get(address)
    const oldEntities = before ? preparedDeclarationEntities(address, before) : []
    const newEntities = preparedDeclarationEntities(address, loaded.dsl)
    const oldByKey = new Map(oldEntities.map(entity => [entity.key, entity]))
    const waves = (entity: typeof oldEntities[number]) => entity.path === "transition" || entity.path === "condition"
    const changedWaves = !same(oldEntities.filter(waves), newEntities.filter(waves))
    if (changedWaves) {
      for (const entity of oldEntities.filter(waves).toReversed()) particles.push({part: "inflaton", op: "remove", path: entity.path, ts: Date.now(), value: {wimp: address, id: entity.value.id}})
    }
    for (const entity of newEntities) {
      const existing = oldByKey.get(entity.key)
      if (waves(entity) ? !changedWaves : existing && same(existing.value, entity.value)) continue
      particles.push({part: "inflaton", op: existing && !(changedWaves && waves(entity)) ? "replace" : "add", path: entity.path, ts: Date.now(), value: entity.value})
    }
  }
  const rank: Record<string, number> = {wimp: 0, field: 1, variant: 2, state: 3, mass: 4, process: 5, reaction: 6, matter: 7, bulk: 8, transition: 9, condition: 10}
  const fresh = (particle: Particle) => {
    const value = particle.value as Record<string, unknown>
    return !previous.has(String(particle.path === "wimp" ? value.src : value.wimp))
  }
  const existing = particles.filter(particle => !fresh(particle)).sort((left, right) => {
    const order = (particle: Particle) => particle.op === "remove" ? particle.path === "condition" ? -2 : -1 : rank[String(particle.path)] ?? 20
    return order(left) - order(right)
  })
  // Сначала родительский Matter reference, затем новая WIMP: иначе Boundary
  // закономерно сочтёт ещё не связанный WIMP самостоятельным root Atom.
  return [...existing, ...particles.filter(fresh)]
}

/**
Явное native намерение; обычное restore его не вызывает. Cache одной incarnation
возвращает квитанцию без эффектов. После restart старый frontier не разрешает
повтор принятого prefix; неизвестный исход остаётся uncertain для owner review.
*/
export function createPreparedDeclarationActivation(deps: {
  gate<T>(operation: () => Promise<T>): Promise<T>
  read(root: string): Promise<PreparedDeclarationSnapshot>
  accept(particle: Particle): Promise<void>
  settle(): Promise<{cutId: string; throughSequence: number}>
  closeAdmission(): void
  openAdmission(): void
  install(root: string, declarations: LoadedMetaDeclaration[]): void
}) {
  const operations = new Map<string, {identity: string; result: Promise<PreparedDeclarationsReceipt>}>()
  return async (input: PreparedDeclarationsInput): Promise<PreparedDeclarationsReceipt> => {
    if (!/^[A-Za-z0-9][A-Za-z0-9:._-]{0,199}$/.test(input.operationId) || !/^[a-f0-9]{64}$/.test(input.releaseDigest) || !input.root || !input.expectedFrontier?.cutId || !Number.isSafeInteger(input.expectedFrontier.throughSequence) || input.expectedFrontier.throughSequence < 0) throw new Error("Invalid prepared declaration activation")
    const identity = JSON.stringify([input.releaseDigest, input.root, input.expectedFrontier.cutId, input.expectedFrontier.throughSequence])
    const previous = operations.get(input.operationId)
    if (previous) {
      if (previous.identity !== identity) throw new Error("Prepared activation operationId already binds another request")
      return structuredClone(await previous.result)
    }
    if (operations.size >= 256) throw new Error("Prepared activation operation capacity exceeded")
    const result = deps.gate(async () => {
      const observed = await deps.read(input.root)
      const verify = (snapshot: PreparedDeclarationSnapshot) => {
        if (snapshot.root !== input.root || snapshot.frontier.cutId !== input.expectedFrontier.cutId || snapshot.frontier.throughSequence !== input.expectedFrontier.throughSequence) throw new Error("Prepared activation frontier/world mismatch; do not retry automatically")
        if (snapshot.busy) throw new Error("Prepared activation requires no pending Process or active Agent")
      }
      verify(observed)
      const prepared: LoadedMetaDeclaration[] = []
      for await (const meta of loadMetaDeclarationGraph(input.root, input.readMeta, "graph")) prepared.push(meta)
      const plan = planPreparedDeclarations(observed.canonical, prepared)
      verify(await deps.read(input.root))
      let accepted = 0, attempted = false
      deps.closeAdmission()
      try {
        for (const particle of plan) {attempted = true; await deps.accept(particle); accepted++}
        const frontier = await deps.settle()
        deps.install(input.root, prepared)
        deps.openAdmission()
        return {operationId: input.operationId, releaseDigest: input.releaseDigest, phase: "complete" as const, planned: plan.length, accepted, frontier, error: null}
      } catch (error) {
        if (!attempted) {deps.openAdmission(); throw error}
        let frontier: PreparedDeclarationsReceipt["frontier"] = null
        try {frontier = await deps.settle()} catch {}
        deps.closeAdmission()
        return {operationId: input.operationId, releaseDigest: input.releaseDigest, phase: "uncertain" as const, planned: plan.length, accepted, frontier,
          error: `${error instanceof Error ? error.message : String(error)}; partial outcome requires owner inspection; automatic replay is forbidden`.slice(0, 4096)}
      }
    })
    operations.set(input.operationId, {identity, result})
    return structuredClone(await result)
  }
}
