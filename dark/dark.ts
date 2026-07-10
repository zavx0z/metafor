import ".."
import type {MatterEdgeSlot, MatterParticle} from "@metafor/types/metafor/matter"
import type {MetaDSL} from "@metafor/types/metafor/schema"
import type {Particle} from "@metafor/types/force/particle"
import {createForceDelta, forceValueEqual} from "@metafor/types/force/delta"
import {
  forceReplayBeginPath,
  forceReplayEndPath,
  parseForceReplayPath,
} from "@metafor/types/force/replay"
import {Force} from "force"
import {loadMeta} from "./load.ts"
import {
  DarkProjectionStore,
  stableLocalId,
  type DeclarationEntity,
  type WimpProjection,
} from "./projection.ts"

type MetaLoader = (src: string) => Promise<MetaDSL>

const force = new Force("dark")
const store = new DarkProjectionStore()
await store.load()
const projection = store.projection
const roots = store.roots

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const jsonValue = (value: unknown): unknown => {
  const json = JSON.stringify(value ?? null)
  if (json === undefined) return null
  return JSON.parse(json) as unknown
}

const entity = (src: string, section: string, value: unknown, id?: string): DeclarationEntity => ({
  path: id === undefined ? `${src}/${section}` : `${src}/${section}/${id}`,
  section,
  value: jsonValue(value),
})

const semanticJson = (value: unknown): string => JSON.stringify(jsonValue(value))

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
  const fieldEntries = dsl.fields ?? []
  const stateEntries = dsl.superposition ?? []

  for (let position = 0; position < fieldEntries.length; position++) {
    const field = fieldEntries[position]!
    const id = stableLocalId(`${src}/fields`, field.key)
    fieldIds.set(field.key, id)
    if (field.type === "enum") {
      const {values, ...definition} = field
      fields[id] = {...definition, position}
      for (let variantPosition = 0; variantPosition < (values?.length ?? 0); variantPosition++) {
        const value = values![variantPosition]
        const variantId = stableLocalId(`${src}/variants`, `${field.key}\0${semanticJson(value)}`)
        variants[variantId] = {field: id, position: variantPosition, value}
      }
    } else {
      fields[id] = {...field, position}
    }
  }

  for (let position = 0; position < stateEntries.length; position++) {
    const state = stateEntries[position]!
    const id = stableLocalId(`${src}/states`, state.name)
    stateIds.set(state.name, id)
    states[id] = {name: state.name, position}
  }

  for (const state of stateEntries) {
    const from = stateIds.get(state.name)!
    if (!isRecord(state.transitions)) continue
    let position = 0
    for (const [toName, transitionConditions] of Object.entries(state.transitions)) {
      const to = stateIds.get(toName)
      if (!to) throw new Error(`Transition from "${state.name}" references unknown state "${toName}" in "${src}"`)
      const transitionId = stableLocalId(`${src}/transitions`, `${state.name}\0${toName}`)
      transitions[transitionId] = {from, to, position}
      position++
      if (!isRecord(transitionConditions)) continue
      let conditionPosition = 0
      for (const [fieldKey, predicate] of Object.entries(transitionConditions)) {
        const field = fieldIds.get(fieldKey)
        if (!field) throw new Error(`Transition from "${state.name}" references unknown field "${fieldKey}" in "${src}"`)
        const conditionId = stableLocalId(`${src}/conditions`, `${transitionId}\0${fieldKey}`)
        conditions[conditionId] = {
          transition: transitionId,
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

  for (const process of dsl.processes ?? []) {
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
      record.before = {...before, read: fieldReferences(read, `Process "${process.key}" before handler`)}
    } else {
      const {read: actionRead, ...action} = processDeclaration.action
      record.action = {...action, read: fieldReferences(actionRead, `Process "${process.key}" action`)}
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
    processes[stableLocalId(`${src}/processes`, process.key)] = record
  }

  for (const reaction of dsl.reactions ?? []) {
    reactions[stableLocalId(`${src}/reactions`, reaction.key)] = {
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
  const duplicateMatterKeys = new Map<string, number>()
  const addMatter = (
    particle: MatterParticle,
    parent: string | null,
    edgeSlot: MatterEdgeSlot,
    position: number,
  ): void => {
    const {children: particleChildren, ...definition} = particle
    const semantic = `${parent ?? "root"}\0${edgeSlot}\0${semanticJson(definition)}`
    const duplicate = duplicateMatterKeys.get(semantic) ?? 0
    duplicateMatterKeys.set(semantic, duplicate + 1)
    const id = stableLocalId(`${src}/matter`, `${semantic}\0${duplicate}`)
    matter[id] = {parent, edgeSlot, position, ...definition}
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

const emit = (particle: Particle): void => force.impulse({parts: [particle]})

const add = (item: DeclarationEntity, from?: string): Particle => ({
  part: "inflaton",
  op: "add",
  path: item.path,
  value: item.value,
  ...(from ? {from} : {}),
})

const remove = (item: DeclarationEntity): Particle => ({part: "inflaton", op: "remove", path: item.path})

const collectChanges = (
  previous: WimpProjection | undefined,
  next: WimpProjection,
  section: "matter" | "declaration",
): Particle[] => {
  const result: Particle[] = []
  const matches = (item: DeclarationEntity): boolean =>
    section === "matter" ? item.section === "matter" : item.section !== "matter"
  const previousByPath = new Map(previous?.entities.map((item) => [item.path, item]))
  const nextPaths = new Set(next.entities.map((item) => item.path))
  if (previous) {
    for (const item of previous.entities.toReversed()) {
      if (matches(item) && !nextPaths.has(item.path)) result.push(remove(item))
    }
  }
  for (const item of next.entities) {
    if (!matches(item)) continue
    const current = previousByPath.get(item.path)
    if (!current) {
      result.push(add(item))
      continue
    }
    if (forceValueEqual(current.value, item.value)) continue
    result.push({
      part: "inflaton",
      op: "replace",
      path: item.path,
      value: createForceDelta(current.value, item.value),
    })
  }
  return result
}

const projectionOrder = (source: Map<string, WimpProjection>, includeUnreachable = true): string[] => {
  const seen = new Set<string>()
  const order: string[] = []
  const visit = (src: string): void => {
    if (seen.has(src)) return
    const current = source.get(src)
    if (!current) return
    seen.add(src)
    order.push(src)
    for (const child of current.children) visit(child)
  }
  for (const root of roots) visit(root)
  if (includeUnreachable) for (const src of source.keys()) visit(src)
  return order
}

const reconcile = async (src: string, readMeta: MetaLoader): Promise<Particle[]> => {
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
  const particles: Particle[] = []

  // Referenced declarations precede the matter edges that point at them.
  for (const address of order) particles.push(...collectChanges(projection.get(address), next.get(address)!, "declaration"))
  for (const address of order) particles.push(...collectChanges(projection.get(address), next.get(address)!, "matter"))

  // Detach all outgoing edges before deleting an unreachable declaration.
  for (const address of previousOrder) {
    if (retained.has(address)) continue
    const previous = projection.get(address)
    if (!previous) continue
    for (const item of previous.entities.toReversed()) if (item.section === "matter") particles.push(remove(item))
  }
  for (const address of previousOrder.toReversed()) {
    if (retained.has(address)) continue
    const previous = projection.get(address)
    if (!previous) continue
    for (const item of previous.entities.toReversed()) if (item.section !== "matter") particles.push(remove(item))
  }

  for (const address of previousOrder) if (!retained.has(address)) projection.delete(address)
  for (const [address, current] of next) projection.set(address, current)
  await store.save()
  return particles
}

/** Reads a root declaration and emits only the entities that changed. */
export async function matter(src: string, readMeta: MetaLoader = loadMeta): Promise<void> {
  for (const particle of await reconcile(src, readMeta)) emit(particle)
  emit({part: "inflaton", op: "test", path: src})
}

const replay = async (requestPath: string): Promise<void> => {
  // Re-read durable roots before replay so source deletions survive a Dark restart.
  for (const root of [...roots]) await reconcile(root, loadMeta)
  const request = parseForceReplayPath(requestPath)
  if (!request) return
  emit({part: "z", op: "test", path: forceReplayBeginPath(request.domain, request.id)})
  const order = projectionOrder(projection, false)
  for (const src of order) {
    const current = projection.get(src)
    if (!current) continue
    for (const item of current.entities) if (item.section !== "matter") emit(add(item, requestPath))
  }
  for (const src of order) {
    const current = projection.get(src)
    if (!current) continue
    for (const item of current.entities) if (item.section === "matter") emit(add(item, requestPath))
  }
  for (const root of roots) emit({part: "inflaton", op: "test", path: root, from: requestPath})
  emit({part: "z", op: "test", path: forceReplayEndPath(request.domain, request.id)})
}

force.onImpulse = async (impulse) => {
  const part = impulse.parts[0]
  if (part.part === "inflaton" && part.op === "test" && typeof part.path === "string") {
    await matter(part.path)
    return
  }
  if (part.part !== "z" || part.op !== "test" || typeof part.path !== "string") return
  const request = parseForceReplayPath(part.path)
  if (request?.domain === "boundary") await replay(part.path)
}
