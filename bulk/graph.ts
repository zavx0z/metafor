import type {
  DocumentPointer,
  JsonValue,
  MetaAddress,
  Graph,
  MetaMatterBinding,
  MetaMatterParticle,
  MetaTemplate,
  RuntimeNode,
  ValidationIssue,
} from "@metafor/types/metafor/graph"
import {validateGraph} from "@metafor/types/metafor/graph"
import type {
  BulkProjectionDeclaration,
  BulkProjectionSnapshot,
} from "@metafor/types/bulk/initial"
import type {
  BulkRuntimeMatterParticle,
  BulkRuntimeProcess,
  BulkRuntimeProjection,
  BulkRuntimeValue,
} from "@metafor/types/bulk/runtime"

const clone = <T>(value: T): T => structuredClone(value)

const paths = (binding: MetaMatterBinding | undefined): string[] => {
  if (typeof binding === "string") return [binding]
  if (binding?.data === undefined) return []
  return Array.isArray(binding.data) ? [...binding.data] : [binding.data]
}

const projectedBinding = (
  binding: MetaMatterBinding | undefined,
): {data: string | string[]; expr?: string} | undefined => {
  if (typeof binding === "string") return {data: binding}
  if (binding?.data === undefined) return undefined
  return binding.expr === undefined
    ? {data: clone(binding.data)}
    : {data: clone(binding.data), expr: binding.expr}
}

const stableId = (key: string, used: Set<number>): number => {
  let hash = 0x811c9dc5
  for (let index = 0; index < key.length; index += 1) {
    hash = Math.imul(hash ^ key.charCodeAt(index), 0x01000193)
  }
  let id = (hash >>> 0) % 1_000_000_000 + 1
  while (used.has(id)) id = id === 1_000_000_000 ? 1 : id + 1
  used.add(id)
  return id
}

const templateOrder = (document: Graph): MetaAddress[] => {
  const result: MetaAddress[] = []
  const seen = new Set<MetaAddress>()
  const pending: MetaAddress[] = [document.root]
  const enqueueMatter = (particle: MetaMatterParticle): void => {
    if (particle.kind === "wimp") pending.push(particle.src)
    for (const child of particle.children ?? []) enqueueMatter(child.particle)
  }
  while (pending.length > 0) {
    const address = pending.shift()!
    if (seen.has(address)) continue
    seen.add(address)
    result.push(address)
    for (const particle of document.template[address]?.matter ?? []) {
      enqueueMatter(particle)
    }
  }
  return result
}

const valueProjection = (
  id: number,
  value: JsonValue,
  enumField: boolean,
): BulkRuntimeValue => {
  const kind: BulkRuntimeValue["kind"] = value === null
    ? "null"
    : enumField
      ? "enum"
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
    textValue: kind === "string" ? value as string : null,
    enumValue: kind === "enum" ? value as string : null,
  }
}

const dependencyDescriptor = (
  declaration: MetaTemplate["processes"][number],
  fieldId: (key: string) => number,
): BulkRuntimeProcess["descriptor"] => {
  const descriptor = clone(declaration.declaration) as unknown as Record<string, unknown>
  const visit = (value: unknown): void => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return
    const record = value as Record<string, unknown>
    if (Array.isArray(record.read)) {
      record.readFields = record.read.map((key) => fieldId(String(key)))
    }
    if (Array.isArray(record.write)) {
      record.writeFields = record.write.map((key) => fieldId(String(key)))
    }
    for (const child of Object.values(record)) visit(child)
  }
  visit(descriptor)
  return {
    ...descriptor,
    type: declaration.declaration.type,
    key: declaration.key,
  }
}

/**
 * The only adapter from the public Graph world to Bulk's existing semantic
 * projection. Numeric identities are deterministic Bulk-local render keys;
 * they never claim to be Boundary Atom, Field or Value identities.
 */
export const projectBulkGraph = (
  document: Graph,
  revision = 0,
): BulkProjectionSnapshot => {
  const validation = validateGraph(document)
  if (!validation.ok) throw new BulkGraphValidationError(validation.issues)
  const graph = validation.value
  const order = templateOrder(graph)
  const declarationIds = new Set<number>()
  const atomIds = new Set<number>()
  const topologyIds = new Set<number>()
  const matterIds = new Set<number>()
  const valueIds = new Set<number>()
  const id = (kind: string, owner: MetaAddress, key: string): number =>
    stableId(`${kind}:${owner}:${key}`, declarationIds)
  const fieldIds = new Map<string, number>()
  const stateIds = new Map<string, number>()
  const fieldId = (owner: MetaAddress, key: string): number => {
    const address = `${owner}\0${key}`
    const existing = fieldIds.get(address)
    if (existing !== undefined) return existing
    const next = id("field", owner, key)
    fieldIds.set(address, next)
    return next
  }
  const stateId = (owner: MetaAddress, name: string): number => {
    const address = `${owner}\0${name}`
    const existing = stateIds.get(address)
    if (existing !== undefined) return existing
    const next = id("state", owner, name)
    stateIds.set(address, next)
    return next
  }

  const projection: BulkRuntimeProjection = {
    atoms: [],
    topologies: [],
    wimps: [],
    fields: [],
    states: [],
    transitions: [],
    conditions: [],
    processes: [],
    reactions: [],
    atomStates: [],
    fieldEnumVariants: [],
    atomValues: [],
    values: [],
    valueItems: [],
    matterParticles: [],
    matterTopologyBindingPaths: [],
    matterChildWimpBindingPaths: [],
  }
  const declarations: BulkProjectionDeclaration[] = []

  for (const owner of order) {
    const template = graph.template[owner]!
    projection.wimps.push({src: owner, name: template.name})
    declarations.push({src: owner, section: "meta", localId: "0", value: {src: owner, name: template.name}})
    template.fields.forEach((field, position) => {
      const currentId = fieldId(owner, field.key)
      const projected = {
        id: currentId,
        wimp: owner,
        key: field.key,
        type: field.type,
        label: field.label ?? null,
      }
      projection.fields.push(projected)
      declarations.push({src: owner, section: "fields", localId: String(position + 1), value: clone(projected)})
      if (field.type === "enum") {
        field.values.forEach((itemValue, variantPosition) => {
          const variant = {
            id: id("variant", owner, `${field.key}:${itemValue}`),
            field: currentId,
            position: variantPosition,
            itemValue,
          }
          projection.fieldEnumVariants.push(variant)
          declarations.push({src: owner, section: "variants", localId: `${position + 1}:${variantPosition + 1}`, value: clone(variant)})
        })
      }
    })
    template.superposition.forEach((state, position) => {
      const projected = {
        id: stateId(owner, state.name),
        wimp: owner,
        name: state.name,
        position,
      }
      projection.states.push(projected)
      declarations.push({src: owner, section: "states", localId: String(position + 1), value: clone(projected)})
      Object.entries(state.transitions ?? {}).forEach(([target, wave], transitionPosition) => {
        const transition = {
          id: id("transition", owner, `${state.name}:${target}`),
          wimp: owner,
          fromState: stateId(owner, state.name),
          toState: stateId(owner, target),
          position: transitionPosition,
        }
        projection.transitions.push(transition)
        declarations.push({src: owner, section: "transitions", localId: `${position + 1}:${transitionPosition + 1}`, value: clone(transition)})
        Object.entries(wave).forEach(([field, predicate], conditionPosition) => {
          const condition = {
            id: id("condition", owner, `${state.name}:${target}:${field}`),
            wimp: owner,
            transition: transition.id,
            field: fieldId(owner, field),
            position: conditionPosition,
            predicate: clone(predicate),
          }
          projection.conditions.push(condition)
          declarations.push({src: owner, section: "conditions", localId: `${position + 1}:${transitionPosition + 1}:${conditionPosition + 1}`, value: clone(condition) as Record<string, unknown>})
        })
      })
    })
    template.processes.forEach((process, position) => {
      const projected = {
        id: id("process", owner, `${position}:${process.key}`),
        wimp: owner,
        state: process.key,
        descriptor: dependencyDescriptor(process, (key) => fieldId(owner, key)),
      }
      projection.processes.push(projected)
      declarations.push({src: owner, section: "processes", localId: String(position + 1), value: clone(projected)})
    })
    for (const [position, reaction] of (template.reactions ?? []).entries()) {
      const projected = {
        id: id("reaction", owner, `${position}:${reaction.key}`),
        wimp: owner,
        key: reaction.key,
        label: reaction.label,
        desc: reaction.desc,
        read: reaction.read.map((key) => fieldId(owner, key)),
        write: reaction.write.map((key) => fieldId(owner, key)),
        states: reaction.states.map((name) => stateId(owner, name)),
      }
      projection.reactions.push(projected)
      declarations.push({src: owner, section: "reactions", localId: String(position + 1), value: clone(projected)})
    }

    const visitMatter = (
      particle: MetaMatterParticle,
      pointer: string,
      parentParticle: number | null,
      edgeSlot: BulkRuntimeMatterParticle["edgeSlot"],
      particleOrder: number,
    ): void => {
      const currentId = stableId(`matter:${owner}:${pointer}`, matterIds)
      const record: BulkRuntimeMatterParticle = {
        id: currentId,
        wimp: owner,
        parentParticle,
        particleKind: particle.kind,
        edgeSlot,
        particleOrder,
      }
      if (particle.kind === "wimp") {
        record.targetSrc = particle.src
        const fieldsBinding = projectedBinding(particle.fieldsBinding)
        if (fieldsBinding !== undefined) record.fieldsBinding = fieldsBinding
        if (particle.massBinding !== undefined) {
          record.massBinding = clone(particle.massBinding)
        }
        if (particle.energyBinding !== undefined) {
          record.energyBinding = clone(particle.energyBinding)
        }
        paths(particle.fieldsBinding).forEach((path, depOrder) => {
          projection.matterChildWimpBindingPaths.push({
            wimp: owner,
            particle: currentId,
            childOrder: 0,
            depOrder,
            path,
          })
        })
      } else {
        const binding = particle.kind === "macho"
          ? particle.collectionBinding
          : particle.predicateBinding
        const predicate = projectedBinding(binding)
        if (predicate !== undefined) record.predicateBinding = predicate
        paths(binding).forEach((path, depOrder) => {
          projection.matterTopologyBindingPaths.push({
            wimp: owner,
            particle: currentId,
            depOrder,
            path,
          })
        })
      }
      projection.matterParticles.push(record)
      declarations.push({src: owner, section: "matter", localId: pointer, value: clone(record) as unknown as Record<string, unknown>})
      particle.children?.forEach((child, childPosition) => {
        visitMatter(
          child.particle,
          `${pointer}/children/${childPosition}/particle`,
          currentId,
          child.edgeSlot,
          childPosition,
        )
      })
    }
    template.matter?.forEach((particle, position) => {
      visitMatter(particle, String(position), null, "root", position)
    })
    if (template.bulk !== undefined) {
      declarations.push({src: owner, section: "bulk", localId: "0", value: clone(template.bulk)})
    }
  }

  const atomOccurrence = new Map<MetaAddress, number>()
  const topologyOccurrence = new Map<DocumentPointer, number>()
  const visitRuntime = (
    node: RuntimeNode,
    parent: {kind: "atom" | "topology"; id: number} | null,
    position: number,
  ): void => {
    if (node.kind === "atom") {
      const occurrence = atomOccurrence.get(node.meta) ?? 0
      atomOccurrence.set(node.meta, occurrence + 1)
      const atomId = stableId(`atom:${node.meta}:${occurrence}`, atomIds)
      projection.atoms.push({
        id: atomId,
        parentAtom: parent?.kind === "atom" ? parent.id : null,
        parentTopology: parent?.kind === "topology" ? parent.id : null,
        wimp: node.meta,
        position,
      })
      projection.atomStates.push({
        atom: atomId,
        state: node.state === null ? null : stateId(node.meta, node.state),
      })
      const template = graph.template[node.meta]!
      for (const [field, value] of Object.entries(node.values)) {
        const fieldDeclaration = template.fields.find(({key}) => key === field)!
        const currentFieldId = fieldId(node.meta, field)
        const valueId = stableId(`value:${node.meta}:${occurrence}:${field}`, valueIds)
        projection.atomValues.push({atom: atomId, field: currentFieldId, value: valueId})
        projection.values.push(valueProjection(valueId, value, fieldDeclaration.type === "enum"))
        if (Array.isArray(value)) {
          value.forEach((itemValue, itemPosition) => {
            projection.valueItems.push({
              value: valueId,
              position: itemPosition,
              itemValue: itemValue as number,
            })
          })
        }
      }
      node.children?.forEach((child, childPosition) => {
        visitRuntime(child, {kind: "atom", id: atomId}, childPosition)
      })
      return
    }
    const occurrence = topologyOccurrence.get(node.declaration) ?? 0
    topologyOccurrence.set(node.declaration, occurrence + 1)
    const topologyId = stableId(
      `topology:${node.declaration}:${occurrence}`,
      topologyIds,
    )
    projection.topologies.push({
      id: topologyId,
      parentAtom: parent?.kind === "atom" ? parent.id : null,
      parentTopology: parent?.kind === "topology" ? parent.id : null,
      kind: node.topology,
      position,
    })
    node.children?.forEach((child, childPosition) => {
      visitRuntime(child, {kind: "topology", id: topologyId}, childPosition)
    })
  }
  graph.runtime.roots.forEach((root, position) => visitRuntime(root, null, position))

  return {runtime: projection, declarations, revision}
}

/** Validation failure raised before a Graph cut can enter Bulk's Store. */
export class BulkGraphValidationError extends Error {
  constructor(readonly issues: readonly ValidationIssue[]) {
    super(`Bulk rejected Graph: ${issues.map(({path, code}) => `${path || "/"} [${code}]`).join("; ")}`)
    this.name = "BulkGraphValidationError"
  }
}

export type BulkGraphCut = Readonly<{
  document: Graph
  projection: BulkProjectionSnapshot
}>

/**
 * Bulk's sole server-side world Store. It retains validated full Graph cuts
 * returned by Dark and atomically replaces the current cut after invalidation.
 */
export class BulkGraphStore {
  #document: Graph | null = null
  #revision = 0

  get revision(): number {
    return this.#revision
  }

  get ready(): boolean {
    return this.#document !== null
  }

  /** Validates and atomically installs one complete Dark-owned read result. */
  replace(input: unknown, expectedRoot: MetaAddress): BulkGraphCut {
    const validation = validateGraph(input)
    if (!validation.ok) throw new BulkGraphValidationError(validation.issues)
    if (validation.value.root !== expectedRoot) {
      throw new Error(`Bulk Graph root mismatch: expected "${expectedRoot}", received "${validation.value.root}"`)
    }
    const next = clone(validation.value)
    const nextRevision = this.#revision + 1
    const projection = projectBulkGraph(next, nextRevision)
    this.#document = next
    this.#revision = nextRevision
    return {document: clone(next), projection}
  }

  /** Returns a detached current full document; callers cannot mutate the Store. */
  read(): Graph {
    if (this.#document === null) throw new Error("Bulk Graph Store is not prepared")
    return clone(this.#document)
  }

  /** Derives the existing Bulk projection from the current Graph cut. */
  projection(): BulkProjectionSnapshot {
    return projectBulkGraph(this.read(), this.#revision)
  }
}
