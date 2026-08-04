import ".."
import type {DeclarationPath} from "shared/protocol/force/declaration"
import type {ForceMessage, ForceMessageInput} from "shared/protocol/force/message"
import type {Particle, SourcedParticle} from "shared/protocol/force/particle"
import type {MatterEdgeSlot, MatterParticle} from "@metafor/types/metafor/matter"
import type {MetaDSL} from "@metafor/types/metafor/schema"
import {canonicalMetaSource, loadMeta} from "./load.ts"
import {
  loadMetaDeclarationGraph,
  type MetaLoader,
} from "./graph.ts"

type DeclarationEntity = {
  key: string
  path: DeclarationPath
  value: Record<string, unknown>
}

type WimpProjection = {
  entities: DeclarationEntity[]
  children: string[]
}

const projection = new Map<string, WimpProjection>()
const roots = new Set<string>()

export type DarkForcePort = {
  impulse(message: ForceMessageInput): void
  onImpulse: (impulse: ForceMessage) => void | Promise<void>
}

let runtime: {force: DarkForcePort} | null = null

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const canonicalRootSource = (value: string): boolean =>
  value.split("/").length === 2 && canonicalMetaSource(value)

const jsonRecord = (value: Record<string, unknown>): Record<string, unknown> =>
  JSON.parse(JSON.stringify(value)) as Record<string, unknown>

const same = (left: unknown, right: unknown): boolean => {
  if (Object.is(left, right)) return true
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length &&
      left.every((item, index) => same(item, right[index]))
  }
  if (!isRecord(left) || !isRecord(right)) return false
  const keys = Object.keys(left)
  return keys.length === Object.keys(right).length &&
    keys.every((key) => Object.hasOwn(right, key) && same(left[key], right[key]))
}

const wimpEntity = (src: string, value: Record<string, unknown>): DeclarationEntity => ({
  key: `wimp\u0000${src}`,
  path: "wimp",
  value: jsonRecord({src, ...value}),
})

const localEntity = (
  path: Exclude<DeclarationPath, "wimp">,
  wimp: string,
  id: number,
  value: Record<string, unknown>,
): DeclarationEntity => ({
  key: `${path}\u0000${wimp}\u0000${id}`,
  path,
  value: jsonRecord({wimp, id, ...value}),
})

const declaration = (
  src: string,
  dsl: MetaDSL,
  children: string[],
): WimpProjection => {
  const entities: DeclarationEntity[] = [wimpEntity(src, {
    name: dsl.name,
    desc: dsl.desc ?? null,
    ...(Array.isArray(dsl.mass) ? {mass: dsl.mass} : {}),
  })]
  const fieldIds = new Map<string, number>()
  const stateIds = new Map<string, number>()

  let variantId = 0
  for (let index = 0; index < dsl.fields.length; index++) {
    const field = dsl.fields[index]!
    const id = index + 1
    fieldIds.set(field.key, id)
    if (field.type === "enum") {
      const {values, ...definition} = field
      entities.push(localEntity("field", src, id, definition as Record<string, unknown>))
      for (let position = 0; position < (values?.length ?? 0); position++) {
        entities.push(localEntity("variant", src, ++variantId, {
          field: id,
          position,
          value: values![position],
        }))
      }
    } else {
      entities.push(localEntity("field", src, id, {...field} as Record<string, unknown>))
    }
  }

  for (let index = 0; index < dsl.superposition.length; index++) {
    const state = dsl.superposition[index]!
    const id = index + 1
    stateIds.set(state.name, id)
    entities.push(localEntity("state", src, id, {name: state.name, position: index}))
  }

  let transitionId = 0
  let conditionId = 0
  for (const state of dsl.superposition) {
    const from = stateIds.get(state.name)!
    if (!isRecord(state.transitions)) continue
    let position = 0
    for (const [toName, transitionConditions] of Object.entries(state.transitions)) {
      const to = stateIds.get(toName)
      if (!to) throw new Error(`Transition from "${state.name}" references unknown state "${toName}" in "${src}"`)
      const currentTransition = ++transitionId
      entities.push(localEntity("transition", src, currentTransition, {from, to, position: position++}))
      if (!isRecord(transitionConditions)) continue
      let conditionPosition = 0
      for (const [fieldKey, predicate] of Object.entries(transitionConditions)) {
        const field = fieldIds.get(fieldKey)
        if (!field) throw new Error(`Transition from "${state.name}" references unknown field "${fieldKey}" in "${src}"`)
        entities.push(localEntity("condition", src, ++conditionId, {
          transition: currentTransition,
          field,
          position: conditionPosition++,
          predicate,
        }))
      }
    }
  }

  const fieldReferences = (keys: readonly string[] | undefined, owner: string): number[] =>
    (keys ?? []).map((key) => {
      const id = fieldIds.get(key)
      if (!id) throw new Error(`${owner} references unknown field "${key}" in "${src}"`)
      return id
    })

  for (let index = 0; index < (dsl.processes?.length ?? 0); index++) {
    const process = dsl.processes![index]!
    const input = process.declaration
    const value: Record<string, unknown> = {
      key: process.key,
      type: input.type,
      env: [...(input.env ?? [])],
      label: input.label ?? null,
      desc: input.desc ?? null,
    }
    if (input.type === "finally") {
      const {read, ...before} = input.before
      value.before = {...before, read: fieldReferences(read, `Process "${process.key}" before handler`)}
    } else {
      const {read, ...action} = input.action
      value.action = {...action, read: fieldReferences(read, `Process "${process.key}" action`)}
      value.success = null
      value.error = null
      if (input.success) {
        const {read: successRead, write, ...handler} = input.success
        value.success = {
          ...handler,
          read: fieldReferences(successRead, `Process "${process.key}" success handler`),
          write: fieldReferences(write, `Process "${process.key}" success handler`),
        }
      }
      if (input.error) {
        const {read: errorRead, write, ...handler} = input.error
        value.error = {
          ...handler,
          read: fieldReferences(errorRead, `Process "${process.key}" error handler`),
          write: fieldReferences(write, `Process "${process.key}" error handler`),
        }
      }
    }
    entities.push(localEntity("process", src, index + 1, value))
  }

  for (let index = 0; index < (dsl.reactions?.length ?? 0); index++) {
    const reaction = dsl.reactions![index]!
    entities.push(localEntity("reaction", src, index + 1, {
      key: reaction.key,
      label: reaction.label,
      desc: reaction.desc ?? null,
      cond: reaction.cond,
      src: reaction.src,
      read: fieldReferences(reaction.read, `Reaction "${reaction.key}"`),
      write: fieldReferences(reaction.write, `Reaction "${reaction.key}"`),
      states: (reaction.states ?? []).map((name) => {
        const id = stateIds.get(name)
        if (!id) throw new Error(`Reaction "${reaction.key}" references unknown state "${name}" in "${src}"`)
        return id
      }),
    }))
  }

  let matterId = 0
  const matterByParent = new Map<number | null, Array<{particle: MatterParticle; edgeSlot: MatterEdgeSlot; position: number}>>()
  matterByParent.set(null, (dsl.matter ?? []).map((particle, position) => ({particle, edgeSlot: "root", position})))
  let frontier: Array<{particle: MatterParticle; edgeSlot: MatterEdgeSlot; position: number; parent: number | null}> =
    (matterByParent.get(null) ?? []).map((item) => ({...item, parent: null}))
  while (frontier.length > 0) {
    const next: typeof frontier = []
    for (const item of frontier) {
      const id = ++matterId
      const {children: nested, ...definition} = item.particle
      entities.push(localEntity("matter", src, id, {
        parent: item.parent,
        edgeSlot: item.edgeSlot,
        position: item.position,
        ...definition,
      }))
      for (let position = 0; position < (nested?.length ?? 0); position++) {
        const child = nested![position]!
        next.push({particle: child.particle, edgeSlot: child.edgeSlot, position, parent: id})
      }
    }
    frontier = next
  }

  if (dsl.bulk !== undefined) entities.push(localEntity("bulk", src, 1, {...dsl.bulk}))
  return {entities, children}
}

const emit = (particle: Particle): void => {
  if (!runtime) throw new Error("Dark runtime has not been born")
  const {by: _by, ...input} = particle
  runtime.force.impulse({parts: [input]})
}

const add = (item: DeclarationEntity, ts = Date.now()): Particle => ({
  part: "inflaton",
  op: "add",
  path: item.path,
  ts,
  value: item.value,
})

const remove = (item: DeclarationEntity): Particle => ({
  part: "inflaton",
  op: "remove",
  path: item.path,
  ts: Date.now(),
  value: item.path === "wimp" ? {src: item.value.src} : {wimp: item.value.wimp, id: item.value.id},
})

const change = (previous: Map<string, DeclarationEntity>, item: DeclarationEntity): Particle | undefined => {
  const current = previous.get(item.key)
  if (!current) return add(item)
  if (same(current.value, item.value)) return
  return {part: "inflaton", op: "replace", path: item.path, ts: Date.now(), value: item.value}
}

const projectionOrder = (store: Map<string, WimpProjection>, includeUnreachable = true): string[] => {
  const seen = new Set<string>()
  const order: string[] = []
  const visit = (src: string): void => {
    if (seen.has(src)) return
    const current = store.get(src)
    if (!current) return
    seen.add(src)
    order.push(src)
    for (const child of current.children) visit(child)
  }
  for (const root of roots) visit(root)
  if (includeUnreachable) for (const src of store.keys()) visit(src)
  return order
}

/**
 * Reads external WIMP declarations breadth-first. Every locally ready entity,
 * including a WIMP Matter reference, is yielded before the next WIMP layer is read.
 */
export async function* matterParticles(
  src: string,
  readMeta: MetaLoader = loadMeta,
): AsyncGenerator<Particle, void, void> {
  roots.add(src)
  const next = new Map<string, WimpProjection>()
  for await (const {address, dsl, references} of loadMetaDeclarationGraph(src, readMeta)) {
    const current = declaration(address, dsl, references)
    next.set(address, current)
    const previous = projection.get(address)
    const previousByKey = new Map(previous?.entities.map((item) => [item.key, item]))
    const nextKeys = new Set(current.entities.map((item) => item.key))

    for (const item of previous?.entities.toReversed() ?? []) {
      if (!nextKeys.has(item.key)) yield remove(item)
    }
    for (const item of current.entities) {
      const particle = change(previousByKey, item)
      if (particle) yield particle
    }
  }

  const target = new Map(projection)
  for (const [address, current] of next) target.set(address, current)
  const retained = new Set(projectionOrder(target, false))
  const previousOrder = projectionOrder(projection)
  // First detach every outgoing Matter edge in parent-to-child order. Only
  // then remove the now unreachable WIMPs in child-to-parent order. This keeps
  // the stream causal without needing a terminal barrier.
  for (const address of previousOrder) {
    if (retained.has(address)) continue
    const previous = projection.get(address)
    if (!previous) continue
    for (const item of previous.entities.toReversed()) if (item.path === "matter") yield remove(item)
  }
  for (const address of previousOrder.toReversed()) {
    if (retained.has(address)) continue
    const previous = projection.get(address)
    if (!previous) continue
    for (const item of previous.entities.toReversed()) if (item.path !== "matter") yield remove(item)
  }
  for (const address of previousOrder) if (!retained.has(address)) projection.delete(address)
  for (const [address, current] of next) projection.set(address, current)
}

/** Reads one root external Meta package and emits each ready Particle immediately. */
export async function matter(src: string, readMeta: MetaLoader = loadMeta): Promise<void> {
  for await (const particle of matterParticles(src, readMeta)) emit(particle)
}

const authoredMatterTarget = (part: SourcedParticle): {wimp: string; id: number; value: Record<string, unknown>} => {
  if (
    part.by !== "dark" ||
    part.part !== "inflaton" ||
    part.path !== "matter" ||
    (part.op !== "add" && part.op !== "move" && part.op !== "remove") ||
    !isRecord(part.value) ||
    typeof part.value.wimp !== "string" ||
    !canonicalMetaSource(part.value.wimp) ||
    typeof part.value.id !== "number" ||
    !Number.isSafeInteger(part.value.id) ||
    part.value.id <= 0
  ) throw new Error("Accepted Matter authoring Particle is invalid")
  return {wimp: part.value.wimp, id: part.value.id, value: part.value}
}

const authoredMatterSource = (part: SourcedParticle): {wimp: string; id: number} | null => {
  if (part.op !== "move") return null
  if (typeof part.from !== "string") throw new Error("Accepted Matter move source is invalid")
  const separator = part.from.lastIndexOf("#")
  const wimp = part.from.slice(0, separator)
  const id = Number(part.from.slice(separator + 1))
  if (separator <= 0 || !canonicalMetaSource(wimp) || !Number.isSafeInteger(id) || id <= 0) {
    throw new Error("Accepted Matter move source is invalid")
  }
  return {wimp, id}
}

const refreshProjectionChildren = (current: WimpProjection): void => {
  current.children = [...new Set(current.entities.flatMap((entity) =>
    entity.path === "matter" && entity.value.kind === "wimp" && typeof entity.value.src === "string"
      ? [entity.value.src]
      : [],
  ))]
}

const projectionRoot = (address: string): string | null => {
  const contains = (current: string, seen: Set<string>): boolean => {
    if (current === address) return true
    if (seen.has(current)) return false
    seen.add(current)
    return projection.get(current)?.children.some((child) => contains(child, seen)) ?? false
  }
  for (const root of roots) if (contains(root, new Set())) return root
  return null
}

const ensureAuthoredMatterParent = async (
  address: string,
  readMeta: MetaLoader,
): Promise<void> => {
  if (projection.has(address)) return
  const owner = projectionRoot(address)
  const stream = loadMetaDeclarationGraph(address, readMeta)
  const first = await stream.next()
  if (first.done || first.value.address !== address) {
    throw new Error(`Accepted Matter parent source is unavailable: ${address}`)
  }
  projection.set(address, declaration(address, first.value.dsl, first.value.references))
  if (!owner) roots.add(address)
  await stream.return(undefined)
}

export type AuthoredMatterProjectionChange = {
  root: string
  operation: "add" | "move" | "remove"
  child: string
}

const authoredWimpChild = (entity: DeclarationEntity | undefined, location: string): string => {
  if (
    !entity ||
    entity.path !== "matter" ||
    entity.value.kind !== "wimp" ||
    typeof entity.value.src !== "string" ||
    !canonicalMetaSource(entity.value.src)
  ) throw new Error(`Accepted Matter child is unavailable in Dark projection: ${location}`)
  return entity.value.src
}

export const applyAuthoredMatterProjection = async (
  part: SourcedParticle,
  readMeta: MetaLoader = loadMeta,
): Promise<AuthoredMatterProjectionChange> => {
  const target = authoredMatterTarget(part)
  const source = authoredMatterSource(part)
  const operation: AuthoredMatterProjectionChange["operation"] = part.op === "add"
    ? "add"
    : part.op === "move"
      ? "move"
      : "remove"
  if (source) await ensureAuthoredMatterParent(source.wimp, readMeta)
  await ensureAuthoredMatterParent(target.wimp, readMeta)
  const root = projectionRoot(source?.wimp ?? target.wimp) ?? projectionRoot(target.wimp)
  if (!root) throw new Error(`Accepted Matter parent is outside the current Dark projection: ${target.wimp}`)
  let child = typeof target.value.src === "string" && canonicalMetaSource(target.value.src)
    ? target.value.src
    : null

  if (part.op === "move") {
    if (!child) throw new Error("Accepted Matter target has no canonical child source")
    const sourceProjection = projection.get(source!.wimp)
    const targetProjection = projection.get(target.wimp)
    if (!sourceProjection) throw new Error(`Accepted Matter source is unavailable in Dark projection: ${source!.wimp}`)
    if (!targetProjection) throw new Error(`Accepted Matter target is unavailable in Dark projection: ${target.wimp}`)
    const sourceKey = `matter\u0000${source!.wimp}\u0000${source!.id}`
    const targetKey = `matter\u0000${target.wimp}\u0000${target.id}`
    const sourceEntity = sourceProjection.entities.find((entity) => entity.key === sourceKey)
    if (!sourceEntity) {
      const targetEntity = targetProjection.entities.find((entity) => entity.key === targetKey)
      if (targetEntity && same(targetEntity.value, target.value)) {
        return {root, operation, child}
      }
    }
    const sourceChild = authoredWimpChild(
      sourceEntity,
      `${source!.wimp}#${source!.id}`,
    )
    if (child !== sourceChild) throw new Error("Accepted Matter move changes its child source")
    child = sourceChild
    sourceProjection.entities = sourceProjection.entities.filter((entity) =>
      entity.key !== sourceKey
    )
    refreshProjectionChildren(sourceProjection)
  } else if (part.op === "remove") {
    const current = projection.get(target.wimp)
    if (!current) throw new Error(`Accepted Matter source is unavailable in Dark projection: ${target.wimp}`)
    const key = `matter\u0000${target.wimp}\u0000${target.id}`
    child = child ?? authoredWimpChild(
      current.entities.find((entity) => entity.key === key),
      `${target.wimp}#${target.id}`,
    )
    current.entities = current.entities.filter((entity) =>
      entity.key !== key
    )
    refreshProjectionChildren(current)
    return {root, operation, child}
  }

  if (!child) throw new Error("Accepted Matter target has no canonical child source")
  const current = projection.get(target.wimp)
  if (!current) throw new Error(`Accepted Matter target is unavailable in Dark projection: ${target.wimp}`)
  const entity: DeclarationEntity = {
    key: `matter\u0000${target.wimp}\u0000${target.id}`,
    path: "matter",
    value: jsonRecord(target.value),
  }
  const existing = current.entities.find((candidate) => candidate.key === entity.key)
  if (existing && !same(existing.value, entity.value)) {
    throw new Error(`Accepted Matter target conflicts in Dark projection: ${target.wimp}#${target.id}`)
  }
  if (!existing) current.entities.push(entity)
  refreshProjectionChildren(current)
  return {root, operation, child}
}

export const reconcileAuthoredMatterProjection = async (
  change: AuthoredMatterProjectionChange,
  accept: (input: ForceMessageInput) => Promise<void>,
  readMeta: MetaLoader = loadMeta,
): Promise<void> => {
  const send = async (particle: Particle): Promise<void> => {
    const {by: _by, ...input} = particle
    await accept({parts: [input]})
  }
  const load = async (address: string): Promise<WimpProjection> => {
    const stream = loadMetaDeclarationGraph(address, readMeta)
    const first = await stream.next()
    if (first.done || first.value.address !== address) {
      throw new Error(`Accepted Matter child source is unavailable: ${address}`)
    }
    await stream.return(undefined)
    return declaration(address, first.value.dsl, first.value.references)
  }
  const seedSubtree = async (emit: boolean): Promise<void> => {
    const pending = [change.child]
    const queued = new Set(pending)
    for (let index = 0; index < pending.length; index++) {
      const address = pending[index]!
      let current = projection.get(address)
      if (!current) {
        const loaded = await load(address)
        if (emit) {
          current = {entities: [], children: []}
          projection.set(address, current)
          for (const entity of loaded.entities) {
            await send(add(entity))
            current.entities.push(entity)
          }
          refreshProjectionChildren(current)
        } else {
          current = loaded
          projection.set(address, current)
        }
      }
      for (const child of current.children) {
        if (queued.has(child)) continue
        queued.add(child)
        pending.push(child)
      }
    }
  }

  if (change.operation === "add") {
    await seedSubtree(true)
    return
  }
  if (change.operation === "move") {
    await seedSubtree(false)
    return
  }

  if (!projection.has(change.child)) return
  if (projectionRoot(change.child)) return
  const order: string[] = []
  const visit = (address: string): void => {
    if (order.includes(address)) return
    order.push(address)
    for (const child of projection.get(address)?.children ?? []) visit(child)
  }
  visit(change.child)
  const retained = new Set(projectionOrder(projection, false))
  const dropping = order.filter((address) => !retained.has(address))
  for (const address of dropping) {
    const current = projection.get(address)
    if (!current) continue
    for (const entity of current.entities.toReversed()) {
      if (entity.path !== "matter") continue
      await send(remove(entity))
      current.entities = current.entities.filter((candidate) => candidate.key !== entity.key)
    }
  }
  for (const address of dropping.toReversed()) {
    const current = projection.get(address)
    if (!current) continue
    for (const entity of current.entities.toReversed()) {
      await send(remove(entity))
      current.entities = current.entities.filter((candidate) => candidate.key !== entity.key)
    }
    projection.delete(address)
  }
}

/** Applies the first trusted agent WIMP declaration and preserves its timestamp. */
export const applyAgentInflaton = (part: Particle): boolean => {
  if (
    part.by === "agent" && part.part === "inflaton" && part.op === "remove" && part.path === "wimp" &&
    isRecord(part.value) && typeof part.value.src === "string" && canonicalRootSource(part.value.src)
  ) {
    const src = part.value.src
    for (const address of [...projection.keys()]) {
      if (address === src || address.startsWith(`${src}/`)) projection.delete(address)
    }
    for (const root of [...roots]) {
      if (root === src || root.startsWith(`${src}/`)) roots.delete(root)
    }
    for (const current of projection.values()) {
      current.children = current.children.filter((child) => child !== src && !child.startsWith(`${src}/`))
    }
    emit({part: "inflaton", op: "remove", path: "wimp", ts: part.ts, value: {src}})
    return true
  }
  if (
    part.by !== "agent" || part.part !== "inflaton" || part.op !== "add" || part.path !== "wimp" ||
    !isRecord(part.value) || typeof part.value.src !== "string" || part.value.src.trim().length === 0 ||
    typeof part.value.name !== "string" || part.value.name.trim().length === 0
  ) return false

  const src = part.value.src
  const current = projection.get(src)
  const wimp = wimpEntity(src, {name: part.value.name, desc: part.value.desc ?? null})
  projection.set(src, {
    entities: [wimp, ...(current?.entities.filter((item) => item.path !== "wimp") ?? [])],
    children: current?.children ?? [],
  })
  roots.add(src)
  emit(add(wimp, part.ts))
  return true
}

/** Connects Dark Monad runtime to the in-process Dark Force adapter. */
export const startDarkRuntime = (force: DarkForcePort): DarkForcePort => {
  if (runtime) return runtime.force
  runtime = {force}
  force.onImpulse = async (impulse) => {
    for (const part of impulse.parts) {
      if (typeof part.by !== "string" || part.by.length === 0) {
        throw new Error("Dark received an unsourced Particle")
      }
      if (applyAgentInflaton(part)) continue
      if (part.part === "inflaton" && part.op === "test" && typeof part.path === "string") {
        await matter(part.path)
        continue
      }
    }
  }
  return force
}

/** Releases only the matching in-process adapter during full server shutdown. */
export const stopDarkRuntime = (force: DarkForcePort): void => {
  if (runtime?.force === force) runtime = null
}
