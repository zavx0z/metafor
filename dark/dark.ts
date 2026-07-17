import ".."
import type {MatterEdgeSlot, MatterParticle} from "@metafor/types/metafor/matter"
import type {MetaDSL} from "@metafor/types/metafor/schema"
import type {Particle} from "@metafor/types/force/particle"
import {parseForceReplayPath} from "@metafor/types/force/replay"
import {Force} from "force"
import {loadMeta} from "./load.ts"

type MetaLoader = (src: string) => Promise<MetaDSL>

type DeclarationEntity = {
  path: string
  section: string
  value: unknown
}

type WimpProjection = {
  entities: DeclarationEntity[]
  children: string[]
}

const force = new Force("dark")
const projection = new Map<string, WimpProjection>()
const roots = new Set<string>()

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const jsonValue = (value: unknown): unknown => {
  const json = JSON.stringify(value ?? null)
  if (json === undefined) return null
  return JSON.parse(json) as unknown
}

const equal = (left: unknown, right: unknown): boolean => {
  if (Object.is(left, right)) return true
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length &&
      left.every((item, index) => equal(item, right[index]))
  }
  if (!isRecord(left) || !isRecord(right)) return false
  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)
  return leftKeys.length === rightKeys.length &&
    leftKeys.every((key) => Object.hasOwn(right, key) && equal(left[key], right[key]))
}

const changedProperties = (previous: unknown, next: unknown): unknown => {
  if (!isRecord(previous) || !isRecord(next)) return next
  const changed: Record<string, unknown> = {}
  for (const key of new Set([...Object.keys(previous), ...Object.keys(next)])) {
    if (!Object.hasOwn(next, key)) changed[key] = null
    else if (!Object.hasOwn(previous, key) || !equal(previous[key], next[key])) changed[key] = next[key]
  }
  return changed
}

const entity = (src: string, section: string, value: unknown, id?: string): DeclarationEntity => ({
  path: id === undefined ? `${src}/${section}` : `${src}/${section}/${id}`,
  section,
  value: jsonValue(value),
})

const declaration = (src: string, dsl: MetaDSL): WimpProjection => {
  const fields: Record<string, Record<string, unknown>> = {}
  const variants: Record<string, Record<string, unknown>> = {}
  const states: Record<string, Record<string, unknown>> = {}
  const transitions: Record<string, Record<string, unknown>> = {}
  const conditions: Record<string, Record<string, unknown>> = {}
  const processes: Record<string, Record<string, unknown>> = {}
  const reactions: Record<string, Record<string, unknown>> = {}
  const matter: Record<string, Record<string, unknown>> = {}
  const fieldIds = new Map<string, string>()
  const stateIds = new Map<string, string>()

  let variantNumber = 0
  for (let index = 0; index < dsl.fields.length; index++) {
    const field = dsl.fields[index]!
    const id = String(index + 1)
    fieldIds.set(field.key, id)

    if (field.type === "enum") {
      const {values, ...definition} = field
      fields[id] = definition
      for (let position = 0; position < (values?.length ?? 0); position++) {
        variants[String(++variantNumber)] = {
          field: id,
          position,
          value: values![position],
        }
      }
    } else {
      fields[id] = {...field}
    }
  }

  for (let index = 0; index < dsl.superposition.length; index++) {
    const state = dsl.superposition[index]!
    const id = String(index + 1)
    stateIds.set(state.name, id)
    states[id] = {name: state.name, position: index}
  }

  let transitionNumber = 0
  let conditionNumber = 0
  for (const state of dsl.superposition) {
    const from = stateIds.get(state.name)!
    if (!isRecord(state.transitions)) continue

    let position = 0
    for (const [toName, transitionConditions] of Object.entries(state.transitions)) {
      const to = stateIds.get(toName)
      if (!to) throw new Error(`Transition from "${state.name}" references unknown state "${toName}" in "${src}"`)

      const transition = String(++transitionNumber)
      transitions[transition] = {from, to, position}
      position++

      if (!isRecord(transitionConditions)) continue
      let conditionPosition = 0
      for (const [fieldKey, predicate] of Object.entries(transitionConditions)) {
        const field = fieldIds.get(fieldKey)
        if (!field) throw new Error(`Transition from "${state.name}" references unknown field "${fieldKey}" in "${src}"`)
        conditions[String(++conditionNumber)] = {
          transition,
          field,
          position: conditionPosition,
          predicate,
        }
        conditionPosition++
      }
    }
  }

  const fieldReferences = (keys: readonly string[] | undefined, owner: string): string[] =>
    (keys ?? []).map((key) => {
      const id = fieldIds.get(key)
      if (!id) throw new Error(`${owner} references unknown field "${key}" in "${src}"`)
      return id
    })

  for (let index = 0; index < (dsl.processes?.length ?? 0); index++) {
    const process = dsl.processes![index]!
    const processDeclaration = process.declaration
    const record: Record<string, unknown> = {
      key: process.key,
      type: processDeclaration.type,
      env: [...(processDeclaration.env ?? [])],
      label: processDeclaration.label ?? null,
      desc: processDeclaration.desc ?? null,
    }

    if (processDeclaration.type === "finally") {
      const {read, ...before} = processDeclaration.before
      record.before = {
        ...before,
        read: fieldReferences(read, `Process "${process.key}" before handler`),
      }
    } else {
      const {read: actionRead, ...action} = processDeclaration.action
      record.action = {
        ...action,
        read: fieldReferences(actionRead, `Process "${process.key}" action`),
      }
      record.success = null
      record.error = null
      if (processDeclaration.success) {
        const {read, write, ...handler} = processDeclaration.success
        record.success = {
          ...handler,
          read: fieldReferences(read, `Process "${process.key}" success handler`),
          write: fieldReferences(write, `Process "${process.key}" success handler`),
        }
      }
      if (processDeclaration.error) {
        const {read, write, ...handler} = processDeclaration.error
        record.error = {
          ...handler,
          read: fieldReferences(read, `Process "${process.key}" error handler`),
          write: fieldReferences(write, `Process "${process.key}" error handler`),
        }
      }
    }

    processes[String(index + 1)] = record
  }

  for (let index = 0; index < (dsl.reactions?.length ?? 0); index++) {
    const reaction = dsl.reactions![index]!
    reactions[String(index + 1)] = {
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
    }
  }

  const children: string[] = []
  let matterNumber = 0
  const addMatter = (
    particle: MatterParticle,
    parent: string | null,
    edgeSlot: MatterEdgeSlot,
    position: number,
  ): void => {
    const id = String(++matterNumber)
    const {children: particleChildren, ...definition} = particle
    matter[id] = {
      parent,
      edgeSlot,
      position,
      ...definition,
    }
    if (particle.kind === "wimp") children.push(particle.src)

    for (let index = 0; index < (particleChildren?.length ?? 0); index++) {
      const child = particleChildren![index]!
      addMatter(child.particle, id, child.edgeSlot, index)
    }
  }

  for (let index = 0; index < (dsl.matter?.length ?? 0); index++) {
    addMatter(dsl.matter![index]!, null, "root", index)
  }

  const entities = [entity(src, "meta", {name: dsl.name, desc: dsl.desc ?? null})]
  for (const [section, records] of [
    ["fields", fields],
    ["variants", variants],
    ["states", states],
    ["transitions", transitions],
    ["conditions", conditions],
    ["processes", processes],
    ["reactions", reactions],
    ["matter", matter],
  ] as const) {
    for (const [id, value] of Object.entries(records)) entities.push(entity(src, section, value, id))
  }
  if (dsl.mass !== undefined) entities.push(entity(src, "mass", dsl.mass))
  if (dsl.bulk !== undefined) entities.push(entity(src, "bulk", dsl.bulk))

  return {entities, children}
}

const emit = (particle: Particle): void => {
  const {by: _by, ...input} = particle
  force.impulse({parts: [input]})
}

const add = (item: DeclarationEntity): Particle => ({
  part: "inflaton",
  op: "add",
  path: item.path,
  ts: Date.now(),
  value: item.value,
})

const remove = (item: DeclarationEntity): Particle => ({
  part: "inflaton",
  op: "remove",
  path: item.path,
  ts: Date.now(),
})

const emitChanges = (
  previous: WimpProjection | undefined,
  next: WimpProjection,
  section: "matter" | "declaration",
): void => {
  const matches = (item: DeclarationEntity): boolean =>
    section === "matter" ? item.section === "matter" : item.section !== "matter"
  const previousByPath = new Map(previous?.entities.map((item) => [item.path, item]))
  const nextPaths = new Set(next.entities.map((item) => item.path))

  if (previous) {
    for (const item of previous.entities.toReversed()) {
      if (matches(item) && !nextPaths.has(item.path)) emit(remove(item))
    }
  }

  for (const item of next.entities) {
    if (!matches(item)) continue
    const current = previousByPath.get(item.path)
    if (!current) {
      emit(add(item))
      continue
    }
    if (equal(current.value, item.value)) continue
    emit({
      part: "inflaton",
      op: "replace",
      path: item.path,
      ts: Date.now(),
      value: changedProperties(current.value, item.value),
    })
  }
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
 * Reads a root declaration into Dark's local projection and emits only the
 * declaration entities that changed since the previous read.
 */
export async function matter(src: string, readMeta: MetaLoader = loadMeta): Promise<void> {
  const next = new Map<string, WimpProjection>()
  const order: string[] = []

  const read = async (address: string): Promise<void> => {
    if (next.has(address)) return
    const result = declaration(address, await readMeta(address))
    next.set(address, result)
    order.push(address)
    for (const child of result.children) await read(child)
  }

  await read(src)
  const target = new Map(projection)
  for (const [address, current] of next) target.set(address, current)
  roots.add(src)
  const retained = new Set(projectionOrder(target, false))
  const previousOrder = projectionOrder(projection)

  // Referenced WIMP declarations must exist before any matter edge points at them.
  for (const address of order) {
    const current = next.get(address)!
    emitChanges(projection.get(address), current, "declaration")
  }
  for (const address of order) {
    const current = next.get(address)!
    emitChanges(projection.get(address), current, "matter")
  }

  // Detach every outgoing edge before deleting an unreachable WIMP declaration.
  for (const address of previousOrder) {
    if (retained.has(address)) continue
    const previous = projection.get(address)
    if (!previous) continue
    for (const item of previous.entities.toReversed()) {
      if (item.section === "matter") emit(remove(item))
    }
  }
  for (const address of previousOrder.toReversed()) {
    if (retained.has(address)) continue
    const previous = projection.get(address)
    if (!previous) continue
    for (const item of previous.entities.toReversed()) {
      if (item.section !== "matter") emit(remove(item))
    }
  }

  for (const address of previousOrder) if (!retained.has(address)) projection.delete(address)
  for (const [address, current] of next) projection.set(address, current)
  emit({part: "inflaton", op: "test", path: src, ts: Date.now()})
}

const replay = (): void => {
  const order = projectionOrder(projection, false)
  for (const src of order) {
    const current = projection.get(src)
    if (!current) continue
    for (const item of current.entities) {
      if (item.section !== "matter") emit(add(item))
    }
  }
  for (const src of order) {
    const current = projection.get(src)
    if (!current) continue
    for (const item of current.entities) {
      if (item.section === "matter") emit(add(item))
    }
  }
  for (const root of roots) emit({part: "inflaton", op: "test", path: root, ts: Date.now()})
}

/**
 * Applies the first trusted external declaration to Dark's local projection.
 * The same minimal Patch is then emitted by Dark; `ts` is deliberately kept.
 */
export const applyAgentInflaton = (part: Particle): boolean => {
  if (
    part.by !== "agent" ||
    part.part !== "inflaton" ||
    part.op !== "add" ||
    typeof part.path !== "string" ||
    !part.path.endsWith("/meta") ||
    !isRecord(part.value) ||
    typeof part.value.name !== "string" ||
    part.value.name.trim().length === 0
  ) return false

  const src = part.path.slice(0, -"/meta".length)
  if (!src) return false
  const current = projection.get(src)
  const meta = entity(src, "meta", part.value)
  projection.set(src, {
    entities: [...(current?.entities.filter((item) => item.path !== meta.path) ?? []), meta],
    children: current?.children ?? [],
  })
  roots.add(src)
  emit({
    part: part.part,
    op: part.op,
    path: part.path,
    ts: part.ts,
    value: meta.value,
  })
  emit({part: "inflaton", op: "test", path: src, ts: part.ts})
  return true
}

force.onImpulse = async (impulse) => {
  for (const part of impulse.parts) {
    if (applyAgentInflaton(part)) continue
    if (part.part === "inflaton" && part.op === "test" && typeof part.path === "string") {
      await matter(part.path)
      continue
    }
    if (part.part !== "z" || part.op !== "test") continue
    const request = parseForceReplayPath(part.path)
    if (request?.domain === "boundary") replay()
  }
}
