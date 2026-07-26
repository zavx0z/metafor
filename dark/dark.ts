import ".."
import type {DeclarationPath} from "shared/protocol/force/declaration"
import type {ForceMessage, ForceMessageInput} from "shared/protocol/force/message"
import type {Particle} from "shared/protocol/force/particle"
import type {MatterEdgeSlot, MatterParticle} from "@metafor/types/metafor/matter"
import type {MetaDSL} from "@metafor/types/metafor/schema"
import {canonicalMetaSource, loadMeta} from "./load.ts"
import {
  loadMetaDeclarationGraph,
  type MetaLoader,
} from "./meta-json.ts"

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
