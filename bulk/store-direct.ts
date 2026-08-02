import type {BulkRuntimeProjection} from "@metafor/types/bulk/runtime"
import type {AtomRecord} from "@metafor/types/boundary/atom"
import type {TopologyRecord} from "@metafor/types/boundary/topology"
import type {BoundaryInitialProjectionEntry} from "@metafor/types/boundary/initial"
import {
  BULK_STORE_FLAG_ACTIVE,
  BULK_STORE_FLAG_CURRENT,
  BULK_STORE_FLAG_TORUS,
  type BulkStore,
} from "@metafor/types/bulk/store"
import {
  BULK_STORE_DARK_KIND,
  BULK_STORE_ENDPOINT_KIND,
  BULK_STORE_FIELD_KIND,
  BULK_STORE_ORBITAL_KIND,
  BULK_STORE_RELATION_KIND,
} from "./store.ts"
import {fillDirectBulkStoreGeometry} from "./store-direct-layout.ts"

type DirectOrbitalKind = "state" | "process" | "reaction" | "finally"

type DirectOrbital = Readonly<{
  active: boolean
  anchor: number
  current: boolean
  key: string
  kind: DirectOrbitalKind
  label: string
  owner: number
  related: readonly number[]
  sleeve: number
  source: number
}>

export type DirectStoreBuild = Readonly<{
  store: BulkStore
  projection: BulkRuntimeProjection
  darkActivity: readonly ("active" | "inactive" | "neutral")[]
  orbitalKey: readonly string[]
  proxyKey: readonly string[]
}>

type NumericColumns<T> = {[K in keyof T]: number[]}
type MutableWireStore = Omit<
  BulkStore,
  | "wimp"
  | "fieldSource"
  | "stateSource"
  | "transitionSource"
  | "conditionSource"
  | "processSource"
  | "processField"
  | "reactionSource"
  | "reactionField"
  | "reactionState"
  | "dark"
  | "field"
  | "fieldAlias"
  | "orbital"
  | "orbitalRelatedState"
  | "proxy"
  | "transition"
  | "relation"
  | "batch"
> & {
  wimp: {src: string[]; name: number[]; flags: number[]}
  fieldSource: NumericColumns<BulkStore["fieldSource"]>
  stateSource: NumericColumns<BulkStore["stateSource"]>
  transitionSource: NumericColumns<BulkStore["transitionSource"]>
  conditionSource: NumericColumns<BulkStore["conditionSource"]>
  processSource: NumericColumns<BulkStore["processSource"]>
  processField: number[]
  reactionSource: NumericColumns<BulkStore["reactionSource"]>
  reactionField: number[]
  reactionState: number[]
  dark: NumericColumns<BulkStore["dark"]>
  field: NumericColumns<BulkStore["field"]>
  fieldAlias: NumericColumns<BulkStore["fieldAlias"]>
  orbital: NumericColumns<BulkStore["orbital"]>
  orbitalRelatedState: number[]
  proxy: NumericColumns<BulkStore["proxy"]>
  transition: NumericColumns<BulkStore["transition"]>
  relation: NumericColumns<BulkStore["relation"]>
  batch: NumericColumns<BulkStore["batch"]>
}

const group = <T, K extends string | number>(
  entries: readonly T[],
  key: (entry: T) => K | null,
): Map<K, T[]> => {
  const result = new Map<K, T[]>()
  for (const entry of entries) {
    const id = key(entry)
    if (id === null) continue
    const held = result.get(id)
    if (held) held.push(entry)
    else result.set(id, [entry])
  }
  return result
}

const byPosition = <T extends {position: number; id?: number}>(
  left: T,
  right: T,
): number => left.position - right.position

const fieldKind = (
  value: BulkRuntimeProjection["fields"][number]["type"],
): number => BULK_STORE_FIELD_KIND[value] ?? BULK_STORE_FIELD_KIND.other

const darkIdForAtom = (id: number): number => id * 2
const darkIdForTopology = (id: number): number => id * 2 + 1
const matterParentKey = (wimp: string, parent: number | null): string =>
  `${wimp}\0${parent ?? ""}`

const fieldKeyFromMatterPath = (path: string): string | null =>
  path.startsWith("/") || path.startsWith("[") || path.startsWith(".")
    ? null
    : path

const emptyStore = (root: number): MutableWireStore => ({
  root,
  text: [""],
  wimp: {src: [], name: [], flags: []},
  fieldSource: {id: [], wimp: [], localId: [], kind: [], key: [], label: [], flags: []},
  stateSource: {id: [], wimp: [], position: [], name: [], flags: []},
  transitionSource: {
    id: [], wimp: [], fromState: [], toState: [], position: [], flags: [],
  },
  conditionSource: {
    id: [], wimp: [], transition: [], field: [], position: [], flags: [],
  },
  processSource: {
    id: [], wimp: [], state: [], kind: [], label: [], readStart: [], readCount: [],
    writeStart: [], writeCount: [], flags: [],
  },
  processField: [],
  reactionSource: {
    id: [], wimp: [], label: [], readStart: [], readCount: [], writeStart: [],
    writeCount: [], stateStart: [], stateCount: [], allStates: [], flags: [],
  },
  reactionField: [],
  reactionState: [],
  dark: {
    id: [], parent: [], wimp: [], order: [], kind: [], flags: [], label: [],
    position: [], form: [], material: [],
  },
  field: {
    id: [], field: [], owner: [], kind: [], flags: [], key: [], label: [],
    value: [], valueText: [], position: [], form: [], material: [],
  },
  fieldAlias: {
    id: [], flags: [], atom: [], field: [], value: [], marker: [], order: [], orbit: [],
    valueText: [],
  },
  orbital: {
    id: [], source: [], owner: [], kind: [], flags: [], anchor: [], sleeve: [],
    relatedStart: [], relatedCount: [], label: [], position: [], form: [], material: [],
  },
  orbitalRelatedState: [],
  proxy: {
    id: [], field: [], sourceField: [], owner: [], state: [], paint: [],
    kind: [], flags: [], label: [], position: [], form: [], material: [],
  },
  transition: {
    id: [], source: [], owner: [], from: [], to: [], flags: [], batch: [], control: [],
  },
  relation: {
    id: [], owner: [], kind: [], flags: [], aKind: [], a: [], bKind: [], b: [],
    batch: [], controlStart: [], control: [],
  },
  batch: {id: [], owner: [], kind: [], flags: [], material: []},
})

const processFieldDependencies = (
  descriptor: Record<string, unknown>,
): Readonly<{read: readonly number[]; write: readonly number[]}> => {
  const read = new Set<number>()
  const write = new Set<number>()
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit)
      return
    }
    if (typeof value !== "object" || value === null) return
    for (const [key, child] of Object.entries(value)) {
      if ((key === "readFields" || key === "writeFields") && Array.isArray(child)) {
        const target = key === "readFields" ? read : write
        for (const item of child) {
          const id = Array.isArray(item) ? item[0] : item
          if (typeof id === "number" && Number.isSafeInteger(id)) target.add(id)
        }
      } else visit(child)
    }
  }
  visit(descriptor)
  return {read: [...read], write: [...write]}
}

const record = (value: unknown, label: string): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`)
  }
  return value as Record<string, unknown>
}

/**
 * Projects the normalized Boundary RPC rows into the exact calculation arrays
 * used by the direct Store writer. It retains no mutable hydration Store and
 * does not clone the already-consistent RPC cut.
 */
export const boundaryRowsRuntimeProjection = (
  entries: readonly BoundaryInitialProjectionEntry[],
): BulkRuntimeProjection => {
  const atoms: AtomRecord[] = []
  const topologies: TopologyRecord[] = []
  const wimps: BulkRuntimeProjection["wimps"] = []
  const fields: BulkRuntimeProjection["fields"] = []
  const states: BulkRuntimeProjection["states"] = []
  const transitions: BulkRuntimeProjection["transitions"] = []
  const conditions: BulkRuntimeProjection["conditions"] = []
  const processes: BulkRuntimeProjection["processes"] = []
  const reactions: BulkRuntimeProjection["reactions"] = []
  const fieldEnumVariants: BulkRuntimeProjection["fieldEnumVariants"] = []
  const matterParticles: BulkRuntimeProjection["matterParticles"] = []
  const matterTopologyBindingPaths: BulkRuntimeProjection["matterTopologyBindingPaths"] = []
  const matterChildWimpBindingPaths: BulkRuntimeProjection["matterChildWimpBindingPaths"] = []
  const atomStates: BulkRuntimeProjection["atomStates"] = []
  const atomValues: BulkRuntimeProjection["atomValues"] = []
  const values = new Map<number, BulkRuntimeProjection["values"][number]>()
  const valueItems = new Map<string, BulkRuntimeProjection["valueItems"][number]>()
  const variantById = new Map<number, BulkRuntimeProjection["fieldEnumVariants"][number]>()

  for (const entry of entries) {
    if (entry.part !== "graviton" || entry.op !== "add" || typeof entry.path !== "string") {
      throw new Error("Bulk Store initial RPC must contain normalized Graviton add rows")
    }
    if (entry.path.startsWith("atom/") || entry.path.startsWith("topology/")) continue
    const value = record(entry.value, `Bulk Store initial ${entry.path}`)
    if (entry.path === "wimp") {
      if (typeof value.src !== "string") throw new Error("Bulk Store initial WIMP has no src")
      wimps.push({src: value.src, name: typeof value.name === "string" ? value.name : null})
      continue
    }
    if (entry.path === "bulk") continue
    const id = Number(value.id)
    if (!Number.isSafeInteger(id) || id <= 0) {
      throw new Error(`Bulk Store initial ${entry.path} has no numeric id`)
    }
    if (entry.path === "field") fields.push(value as unknown as BulkRuntimeProjection["fields"][number])
    else if (entry.path === "variant") {
      const variant = {
        ...value,
        itemValue: value.itemValue ?? value.value,
      } as unknown as BulkRuntimeProjection["fieldEnumVariants"][number]
      fieldEnumVariants.push(variant)
      variantById.set(id, variant)
    } else if (entry.path === "state") states.push(value as unknown as BulkRuntimeProjection["states"][number])
    else if (entry.path === "transition") transitions.push(value as unknown as BulkRuntimeProjection["transitions"][number])
    else if (entry.path === "condition") conditions.push(value as unknown as BulkRuntimeProjection["conditions"][number])
    else if (entry.path === "process") processes.push(value as unknown as BulkRuntimeProjection["processes"][number])
    else if (entry.path === "reaction") reactions.push(value as unknown as BulkRuntimeProjection["reactions"][number])
    else if (entry.path === "matter") {
      matterParticles.push(value as unknown as BulkRuntimeProjection["matterParticles"][number])
      for (const binding of Array.isArray(value.topologyBindingPaths)
        ? value.topologyBindingPaths
        : []) {
        matterTopologyBindingPaths.push(
          binding as BulkRuntimeProjection["matterTopologyBindingPaths"][number],
        )
      }
      for (const binding of Array.isArray(value.childWimpBindingPaths)
        ? value.childWimpBindingPaths
        : []) {
        matterChildWimpBindingPaths.push(
          binding as BulkRuntimeProjection["matterChildWimpBindingPaths"][number],
        )
      }
    } else {
      throw new Error(`Bulk Store initial declaration path ${entry.path} is unsupported`)
    }
  }

  for (const entry of entries) {
    if (typeof entry.path !== "string") continue
    const atomMatch = /^atom\/([1-9]\d*)$/.exec(entry.path)
    const topologyMatch = /^topology\/([1-9]\d*)$/.exec(entry.path)
    if (!atomMatch && !topologyMatch) continue
    const value = record(entry.value, `Bulk Store initial ${entry.path}`)
    if (topologyMatch) {
      topologies.push(value as unknown as TopologyRecord)
      continue
    }
    const atomId = Number(atomMatch![1])
    const atom = record(value.atom, `Bulk Store initial Atom ${atomId}`) as unknown as AtomRecord
    if (atom.id !== atomId) throw new Error(`Bulk Store initial Atom ${atomId} id is inconsistent`)
    atoms.push(atom)
    const state = value.state
    if (typeof state === "object" && state !== null && !Array.isArray(state)) {
      const current = (state as Record<string, unknown>).metaState
      if (current === null || Number.isSafeInteger(current)) {
        atomStates.push({atom: atomId, state: current as number | null})
      }
    }
    const records = new Map<number, Record<string, unknown>>()
    for (const source of Array.isArray(value.valueRecords) ? value.valueRecords : []) {
      const current = record(source, `Bulk Store initial Atom ${atomId} Value`)
      records.set(Number(current.id), current)
    }
    for (const source of Array.isArray(value.values) ? value.values : []) {
      const binding = record(source, `Bulk Store initial Atom ${atomId} binding`)
      const field = Number(binding.field)
      const valueId = Number(binding.value)
      const current = records.get(valueId)
      if (!Number.isSafeInteger(field) || !Number.isSafeInteger(valueId) || !current) continue
      atomValues.push({atom: atomId, field, value: valueId})
      if (!values.has(valueId)) {
        const kind = current.kind
        values.set(valueId, {
          id: valueId,
          kind: kind === "boolean" || kind === "number" || kind === "string" ||
            kind === "enum" || kind === "list" ? kind : "null",
          booleanValue: kind === "boolean" ? (current.boolean === true ? 1 : 0) : null,
          numberValue: kind === "number" && typeof current.number === "number"
            ? current.number
            : null,
          textValue: kind === "string" && typeof current.text === "string"
            ? current.text
            : null,
          enumValue: kind === "enum"
            ? variantById.get(Number(current.variant))?.itemValue ?? null
            : null,
        })
      }
    }
    for (const source of Array.isArray(value.valueItems) ? value.valueItems : []) {
      const item = record(source, `Bulk Store initial Atom ${atomId} list item`)
      const projected = {
        value: Number(item.value),
        position: Number(item.position),
        itemValue: Number(item.itemValue),
      }
      valueItems.set(`${projected.value}:${projected.position}`, projected)
    }
  }
  return {
    atoms,
    topologies,
    wimps,
    fields,
    states,
    transitions,
    conditions,
    processes,
    reactions,
    atomStates,
    fieldEnumVariants,
    atomValues,
    values: [...values.values()],
    valueItems: [...valueItems.values()],
    matterParticles,
    matterTopologyBindingPaths,
    matterChildWimpBindingPaths,
  }
}

/**
 * Builds only semantic numeric rows. Geometry/material/control columns remain
 * allocated in their final Store and are filled by the direct centered writer.
 * Synthesized string identities live only in short-lived lookup maps here;
 * none enters Store or the browser payload.
 */
export const buildDirectBulkStoreRows = (
  projection: BulkRuntimeProjection,
  rootAtomId: number,
): DirectStoreBuild => {
  const rootDarkId = darkIdForAtom(rootAtomId)
  const store = emptyStore(rootDarkId)
  const textSlot = new Map<string, number>()
  const text = (value: string | null): number => {
    if (value === null || value.length === 0) return 0
    const held = textSlot.get(value)
    if (held !== undefined) return held
    const slot = store.text.length
    store.text.push(value)
    textSlot.set(value, slot)
    return slot
  }

  const wimpSlotBySrc = new Map<string, number>()
  for (const wimp of projection.wimps) {
    if (wimpSlotBySrc.has(wimp.src)) continue
    const slot = store.wimp.src.length
    store.wimp.src.push(wimp.src)
    store.wimp.name.push(text(wimp.name))
    store.wimp.flags.push(0)
    wimpSlotBySrc.set(wimp.src, slot)
  }
  for (const atom of projection.atoms) {
    if (wimpSlotBySrc.has(atom.wimp)) continue
    const slot = store.wimp.src.length
    store.wimp.src.push(atom.wimp)
    store.wimp.name.push(0)
    store.wimp.flags.push(0)
    wimpSlotBySrc.set(atom.wimp, slot)
  }

  for (const field of projection.fields) {
    const wimp = wimpSlotBySrc.get(field.wimp)
    if (wimp === undefined) throw new Error(`Bulk Store Field ${field.id} WIMP is absent`)
    store.fieldSource.id.push(field.id)
    store.fieldSource.wimp.push(wimp + 1)
    store.fieldSource.localId.push(Number(
      (field as BulkRuntimeProjection["fields"][number] & {localId?: number}).localId ?? field.id,
    ))
    store.fieldSource.kind.push(fieldKind(field.type))
    store.fieldSource.key.push(text(field.key))
    store.fieldSource.label.push(text(field.label ?? field.key))
    store.fieldSource.flags.push(0)
  }

  for (const state of projection.states) {
    const wimp = wimpSlotBySrc.get(state.wimp)
    if (wimp === undefined) throw new Error(`Bulk Store State ${state.id} WIMP is absent`)
    store.stateSource.id.push(state.id)
    store.stateSource.wimp.push(wimp + 1)
    store.stateSource.position.push(state.position)
    store.stateSource.name.push(text(state.name))
    store.stateSource.flags.push(0)
  }
  for (const transition of projection.transitions) {
    const wimp = wimpSlotBySrc.get(transition.wimp)
    if (wimp === undefined) throw new Error(`Bulk Store Transition ${transition.id} WIMP is absent`)
    store.transitionSource.id.push(transition.id)
    store.transitionSource.wimp.push(wimp + 1)
    store.transitionSource.fromState.push(transition.fromState)
    store.transitionSource.toState.push(transition.toState)
    store.transitionSource.position.push(transition.position)
    store.transitionSource.flags.push(0)
  }
  for (const condition of projection.conditions) {
    const wimp = wimpSlotBySrc.get(condition.wimp)
    if (wimp === undefined) throw new Error(`Bulk Store Condition ${condition.id} WIMP is absent`)
    store.conditionSource.id.push(condition.id)
    store.conditionSource.wimp.push(wimp + 1)
    store.conditionSource.transition.push(condition.transition)
    store.conditionSource.field.push(condition.field)
    store.conditionSource.position.push(condition.position)
    store.conditionSource.flags.push(0)
  }
  for (const process of projection.processes) {
    const wimp = wimpSlotBySrc.get(process.wimp)
    if (wimp === undefined) throw new Error(`Bulk Store Process ${process.id} WIMP is absent`)
    const dependencies = processFieldDependencies(process.descriptor)
    store.processSource.id.push(process.id)
    store.processSource.wimp.push(wimp + 1)
    store.processSource.state.push(text(process.state))
    store.processSource.kind.push(process.descriptor.type === "finally" ? 1 : 0)
    store.processSource.label.push(text(String(
      process.descriptor.label ?? process.descriptor.key ?? process.state,
    )))
    store.processSource.readStart.push(store.processField.length)
    store.processSource.readCount.push(dependencies.read.length)
    store.processField.push(...dependencies.read)
    store.processSource.writeStart.push(store.processField.length)
    store.processSource.writeCount.push(dependencies.write.length)
    store.processField.push(...dependencies.write)
    store.processSource.flags.push(0)
  }
  for (const reaction of projection.reactions) {
    const wimp = wimpSlotBySrc.get(reaction.wimp)
    if (wimp === undefined) throw new Error(`Bulk Store Reaction ${reaction.id} WIMP is absent`)
    store.reactionSource.id.push(reaction.id)
    store.reactionSource.wimp.push(wimp + 1)
    store.reactionSource.label.push(text(reaction.label?.trim() || reaction.key))
    store.reactionSource.readStart.push(store.reactionField.length)
    store.reactionSource.readCount.push(reaction.read.length)
    store.reactionField.push(...reaction.read)
    store.reactionSource.writeStart.push(store.reactionField.length)
    store.reactionSource.writeCount.push(reaction.write.length)
    store.reactionField.push(...reaction.write)
    store.reactionSource.stateStart.push(store.reactionState.length)
    store.reactionSource.stateCount.push(reaction.states.length)
    store.reactionState.push(...reaction.states)
    store.reactionSource.allStates.push(reaction.states.length === 0 ? 1 : 0)
    store.reactionSource.flags.push(0)
  }

  const atomById = new Map(projection.atoms.map((atom) => [atom.id, atom] as const))
  const atomsByParentAtom = group(projection.atoms, (atom) => atom.parentAtom)
  const atomsByParentTopology = group(projection.atoms, (atom) => atom.parentTopology)
  const topologiesByParentAtom = group(projection.topologies, (entry) => entry.parentAtom)
  const topologiesByParentTopology = group(projection.topologies, (entry) => entry.parentTopology)
  const wimpName = new Map(projection.wimps.map((wimp) => [wimp.src, wimp.name] as const))
  const fieldsByWimp = group(projection.fields, (field) => field.wimp)
  const statesByWimp = group(projection.states, (state) => state.wimp)
  const transitionsByWimp = group(projection.transitions, (entry) => entry.wimp)
  const conditionsByTransition = group(projection.conditions, (entry) => entry.transition)
  const processesByWimp = group(projection.processes, (entry) => entry.wimp)
  const reactionsByWimp = group(projection.reactions, (entry) => entry.wimp)
  const atomState = new Map(projection.atomStates.map((entry) => [entry.atom, entry.state] as const))
  const atomValue = new Map(projection.atomValues.map((entry) => [`${entry.atom}:${entry.field}`, entry.value] as const))
  const valueById = new Map(projection.values.map((entry) => [entry.id, entry] as const))
  const valueItems = group(projection.valueItems, (entry) => entry.value)
  const fieldByWimpKey = new Map(projection.fields.map((field) =>
    [`${field.wimp}\0${field.key}`, field] as const))
  const enumVariantsByField = group(projection.fieldEnumVariants, (entry) => entry.field)
  const matterByParent = group(projection.matterParticles, (entry) =>
    matterParentKey(entry.wimp, entry.parentParticle))
  const topologyBindings = group(projection.matterTopologyBindingPaths, (entry) => entry.particle)
  const childBindings = group(projection.matterChildWimpBindingPaths, (entry) => entry.particle)

  const valueText = (id: number): string | null => {
    if (id === 0) return null
    const value = valueById.get(id)
    if (!value) return null
    if (value.kind === "boolean") return value.booleanValue === 1 ? "true" : "false"
    if (value.kind === "number") return value.numberValue === null ? null : String(value.numberValue)
    if (value.kind === "string") return value.textValue
    if (value.kind === "enum") return value.enumValue
    if (value.kind === "list") {
      return (valueItems.get(value.id) ?? [])
        .map((entry) => String(entry.itemValue))
        .join(", ")
    }
    return null
  }

  const edgeSlotOrder = {root: 0, branch: 0, child: 0, then: 0, else: 1} as const
  const sortMatter = (
    entries: readonly BulkRuntimeProjection["matterParticles"][number][],
  ) => entries.toSorted((left, right) =>
    edgeSlotOrder[left.edgeSlot] - edgeSlotOrder[right.edgeSlot] ||
    left.particleOrder - right.particleOrder)
  const sortBindings = <T extends {depOrder: number; childOrder?: number}>(
    entries: readonly T[],
  ) => entries.toSorted((left, right) =>
    (left.childOrder ?? 0) - (right.childOrder ?? 0) ||
    left.depOrder - right.depOrder)
  const matterTopologyChildren = (wimp: string, parent: number | null) =>
    sortMatter(matterByParent.get(matterParentKey(wimp, parent)) ?? [])
      .filter((entry) => entry.particleKind !== "wimp")
  const fieldLabelFromPath = (wimp: string, path: string): string | null => {
    const key = fieldKeyFromMatterPath(path)
    if (key === null) return null
    const field = fieldByWimpKey.get(`${wimp}\0${key}`)
    const label = field?.label?.trim()
    return label && label.length > 0 ? label : field?.key ?? key
  }
  const topologyPlanLabel = (
    wimp: string,
    plan: BulkRuntimeProjection["matterParticles"][number],
  ): string | null => {
    const childPaths = sortBindings(childBindings.get(plan.id) ?? [])
      .map((entry) => entry.path)
    const predicatePaths = plan.predicateBinding === undefined
      ? []
      : Array.isArray(plan.predicateBinding.data)
        ? plan.predicateBinding.data
        : [plan.predicateBinding.data]
    for (const path of [
      ...sortBindings(topologyBindings.get(plan.id) ?? []).map((entry) => entry.path),
      ...predicatePaths,
      ...childPaths,
    ]) {
      const label = fieldLabelFromPath(wimp, path)
      if (label !== null) return label
    }
    if (plan.particleKind !== "axion" || !predicatePaths.includes("/state")) return null
    const stateMatch = /===\s*["']([^"']+)["']/.exec(plan.predicateBinding?.expr ?? "")
    if (!stateMatch) return "Axion · State"
    let stateName = stateMatch[1]!
    if (stateName.includes("\\u")) {
      try {
        stateName = JSON.parse(`"${stateName.replaceAll('"', '\\"')}"`) as string
      } catch {
        // Preserve the declared predicate text when it is not a JSON escape.
      }
    }
    return `Axion · ${stateName}`
  }
  const topologyLabelById = new Map<number, string>()
  const topologyPlanById = new Map<number, BulkRuntimeProjection["matterParticles"][number]>()
  const topologyAtomById = new Map<number, AtomRecord>()
  const assignTopologyLabels = (
    atom: AtomRecord,
    runtimeTopologies: readonly TopologyRecord[],
    parentMatter: number | null,
  ): void => {
    const plans = matterTopologyChildren(atom.wimp, parentMatter)
    const runtime = runtimeTopologies.toSorted(byPosition)
    for (let index = 0; index < runtime.length; index++) {
      const topology = runtime[index]!
      const plan = plans[index]
      if (!plan) continue
      topologyPlanById.set(topology.id, plan)
      topologyAtomById.set(topology.id, atom)
      const label = topologyPlanLabel(atom.wimp, plan)
      if (label !== null) topologyLabelById.set(topology.id, label)
      assignTopologyLabels(
        atom,
        topologiesByParentTopology.get(topology.id) ?? [],
        plan.id,
      )
    }
  }
  for (const atom of projection.atoms) {
    assignTopologyLabels(atom, topologiesByParentAtom.get(atom.id) ?? [], null)
  }
  const activityByDarkId = new Map<number, "active" | "inactive">()
  for (const topology of projection.topologies) {
    if (topology.kind !== "fuzzy") continue
    const plan = topologyPlanById.get(topology.id)
    const atom = topologyAtomById.get(topology.id)
    if (!plan || !atom) continue
    const branchPlans = sortMatter(
      matterByParent.get(matterParentKey(plan.wimp, plan.id)) ?? [],
    ).filter((entry) => entry.edgeSlot === "branch" && entry.particleKind === "wimp")
    if (branchPlans.length === 0) continue
    const fieldKey = sortBindings(topologyBindings.get(plan.id) ?? [])
      .map((entry) => fieldKeyFromMatterPath(entry.path))
      .find((key): key is string => key !== null)
    if (!fieldKey) continue
    const field = fieldByWimpKey.get(`${atom.wimp}\0${fieldKey}`)
    const valueId = field ? atomValue.get(`${atom.id}:${field.id}`) ?? 0 : 0
    const current = field?.type === "enum" ? valueText(valueId) : null
    const activeIndex = current === null || !field
      ? null
      : enumVariantsByField.get(field.id)?.find((variant) =>
        variant.itemValue === current)?.position ?? null
    const branchAtoms = (atomsByParentTopology.get(topology.id) ?? [])
      .toSorted(byPosition)
    branchAtoms.forEach((branchAtom, index) => {
      activityByDarkId.set(
        darkIdForAtom(branchAtom.id),
        activeIndex !== null && index === activeIndex ? "active" : "inactive",
      )
    })
  }

  const darkSlotById = new Map<number, number>()
  const darkActivity: Array<"active" | "inactive" | "neutral"> = []
  let aliasOrder = 0
  const appendDark = (
    id: number,
    parent: number,
    wimp: number,
    order: number,
    kind: number,
    label: string,
    activity: "active" | "inactive" | "neutral",
  ): boolean => {
    const slot = store.dark.id.length
    if (darkSlotById.has(id)) return false
    darkSlotById.set(id, slot)
    darkActivity.push(activity)
    store.dark.id.push(id)
    store.dark.parent.push(parent)
    store.dark.wimp.push(wimp)
    store.dark.order.push(order)
    store.dark.kind.push(kind)
    store.dark.flags.push(activity === "inactive" ? 0 : BULK_STORE_FLAG_ACTIVE)
    store.dark.label.push(text(label))
    store.dark.position.push(0, 0, 0)
    store.dark.form.push(0, 0)
    store.dark.material.push(0, 0, 0, 0, 0, 0)
    return true
  }

  const appendFields = (atom: AtomRecord, owner: number): void => {
    for (const field of fieldsByWimp.get(atom.wimp) ?? []) {
      const value = atomValue.get(`${atom.id}:${field.id}`) ?? 0
      const id = store.fieldAlias.id.length + 1
      store.fieldAlias.id.push(id)
      store.fieldAlias.flags.push(0)
      store.fieldAlias.atom.push(atom.id)
      store.fieldAlias.field.push(field.id)
      store.fieldAlias.value.push(value)
      store.fieldAlias.marker.push(id)
      store.fieldAlias.order.push(++aliasOrder)
      store.fieldAlias.orbit.push(0)
      store.fieldAlias.valueText.push(text(valueText(value)))
    }
  }

  const appendTree = (
    parentKind: "atom" | "topology",
    parentId: number,
    parentDark: number,
    inheritedActivity: "active" | "inactive" | "neutral",
  ): void => {
    const topologies = (parentKind === "atom"
      ? topologiesByParentAtom.get(parentId) ?? []
      : topologiesByParentTopology.get(parentId) ?? []).toSorted(byPosition)
    const atoms = (parentKind === "atom"
      ? atomsByParentAtom.get(parentId) ?? []
      : atomsByParentTopology.get(parentId) ?? []).toSorted(byPosition)
    let order = 0
    for (const topology of topologies) {
      if (topology.kind === "axion") continue
      const id = darkIdForTopology(topology.id)
      const activity = activityByDarkId.get(id) ?? inheritedActivity
      if (appendDark(
        id,
        parentDark,
        0,
        order++,
        BULK_STORE_DARK_KIND[topology.kind],
        topologyLabelById.get(topology.id) ?? "",
        activity,
      )) {
        appendTree("topology", topology.id, id, activity)
      }
    }
    for (const atom of atoms) {
      const id = darkIdForAtom(atom.id)
      const activity = activityByDarkId.get(id) ?? inheritedActivity
      const wimpSlot = wimpSlotBySrc.get(atom.wimp)
      if (wimpSlot === undefined) throw new Error(`Bulk Store Atom ${atom.id} WIMP is absent`)
      if (appendDark(id, parentDark, wimpSlot + 1, order++, BULK_STORE_DARK_KIND.atom, wimpName.get(atom.wimp) ?? "", activity)) {
        appendFields(atom, id)
        appendTree("atom", atom.id, id, activity)
      }
    }
  }

  const root = atomById.get(rootAtomId)
  if (!root || root.parentAtom !== null || root.parentTopology !== null) {
    throw new Error(`Bulk Store root Atom ${rootAtomId} is absent or nested`)
  }
  const rootWimpSlot = wimpSlotBySrc.get(root.wimp)
  if (rootWimpSlot === undefined) throw new Error(`Bulk Store root Atom ${root.id} WIMP is absent`)
  appendDark(rootDarkId, 0, rootWimpSlot + 1, 0, BULK_STORE_DARK_KIND.atom, wimpName.get(root.wimp) ?? "", "neutral")
  appendFields(root, rootDarkId)
  appendTree("atom", root.id, rootDarkId, "neutral")

  const sourceOrder = new Map(
    Array.from({length: store.fieldAlias.id.length}, (_, slot) => ({
      identity: `atom:${store.fieldAlias.atom[slot]}:field:${store.fieldAlias.field[slot]}`,
      slot,
    }))
      .toSorted((left, right) => left.identity.localeCompare(right.identity))
      .map((entry, index) => [entry.slot, index + 1] as const),
  )
  for (let slot = 0; slot < store.fieldAlias.id.length; slot++) {
    store.fieldAlias.order[slot] = sourceOrder.get(slot)!
  }

  const aliasByAtomField = new Map<string, number>()
  for (let slot = 0; slot < store.fieldAlias.id.length; slot++) {
    aliasByAtomField.set(
      `${store.fieldAlias.atom[slot]}:${store.fieldAlias.field[slot]}`,
      store.fieldAlias.id[slot]!,
    )
  }

  const orbitalKey: string[] = []
  const orbitalIdByKey = new Map<string, number>()
  const appendOrbital = (entry: Omit<DirectOrbital, "anchor"> & {anchorKey: string | null}): number => {
    const held = orbitalIdByKey.get(entry.key)
    if (held !== undefined) return held
    const anchor = entry.anchorKey === null ? 0 : orbitalIdByKey.get(entry.anchorKey) ?? 0
    if (entry.anchorKey !== null && anchor === 0) {
      throw new Error(`Bulk Store orbital ${entry.key} has no anchor`)
    }
    const id = store.orbital.id.length + 1
    orbitalKey.push(entry.key)
    orbitalIdByKey.set(entry.key, id)
    store.orbital.id.push(id)
    store.orbital.source.push(entry.source)
    store.orbital.owner.push(entry.owner)
    store.orbital.kind.push(BULK_STORE_ORBITAL_KIND[entry.kind])
    store.orbital.flags.push(
      (entry.current ? BULK_STORE_FLAG_CURRENT : 0) |
      (entry.active ? BULK_STORE_FLAG_ACTIVE : 0) |
      (entry.kind === "state" || entry.kind === "process" || entry.kind === "finally" ? BULK_STORE_FLAG_TORUS : 0),
    )
    store.orbital.anchor.push(anchor)
    store.orbital.sleeve.push(entry.sleeve)
    store.orbital.relatedStart.push(store.orbitalRelatedState.length)
    store.orbital.relatedCount.push(entry.related.length)
    store.orbitalRelatedState.push(...entry.related)
    store.orbital.label.push(text(entry.label))
    store.orbital.position.push(0, 0, 0)
    store.orbital.form.push(0, 0)
    store.orbital.material.push(0, 0, 0, 0, 0, 0)
    return id
  }

  const proxyKey: string[] = []
  const proxyByKey = new Map<string, number>()
  const relationProjection = new Set<string>()
  const appendRelation = (
    owner: number,
    kind: keyof typeof BULK_STORE_RELATION_KIND,
    aKind: number,
    a: number,
    bKind: number,
    b: number,
    active: boolean,
  ): void => {
    const symmetric = kind === "field-entanglement" &&
      (aKind > bKind || (aKind === bKind && a > b))
    const id = store.relation.id.length + 1
    store.relation.id.push(id)
    store.relation.owner.push(owner)
    store.relation.kind.push(BULK_STORE_RELATION_KIND[kind])
    store.relation.flags.push(active ? BULK_STORE_FLAG_ACTIVE : 0)
    store.relation.aKind.push(symmetric ? bKind : aKind)
    store.relation.a.push(symmetric ? b : a)
    store.relation.bKind.push(symmetric ? aKind : bKind)
    store.relation.b.push(symmetric ? a : b)
    store.relation.batch.push(0)
    store.relation.controlStart.push(-1)
  }

  const ensureProxy = (
    atom: AtomRecord,
    stateKey: string,
    fieldId: number,
    active: boolean,
  ): number => {
    const key = `${stateKey}/field/${fieldId}`
    const held = proxyByKey.get(key)
    if (held !== undefined) return held
    const state = orbitalKey.indexOf(stateKey) + 1
    const alias = aliasByAtomField.get(`${atom.id}:${fieldId}`)
    if (state <= 0 || alias === undefined) return 0
    const id = store.proxy.id.length + 1
    proxyKey.push(key)
    proxyByKey.set(key, id)
    store.proxy.id.push(id)
    store.proxy.field.push(alias)
    store.proxy.sourceField.push(fieldId)
    store.proxy.owner.push(darkIdForAtom(atom.id))
    store.proxy.state.push(state)
    store.proxy.paint.push(0)
    store.proxy.kind.push(0)
    store.proxy.flags.push(0)
    store.proxy.label.push(0)
    store.proxy.position.push(0, 0, 0)
    store.proxy.form.push(0, 0)
    store.proxy.material.push(0, 0, 0, 0, 0, 0)
    if (!relationProjection.has(key)) {
      relationProjection.add(key)
      appendRelation(
        darkIdForAtom(atom.id),
        "field-projection",
        BULK_STORE_ENDPOINT_KIND.field,
        alias,
        BULK_STORE_ENDPOINT_KIND["field-proxy"],
        id,
        active,
      )
    }
    return id
  }

  const appendDirectedRelation = (
    owner: number,
    kind: keyof typeof BULK_STORE_RELATION_KIND,
    fromKind: number,
    from: number,
    toKind: number,
    to: number,
    active: boolean,
  ): void => {
    if (from <= 0 || to <= 0) return
    appendRelation(owner, kind, fromKind, from, toKind, to, active)
  }

  const appendAtomSemantics = (atom: AtomRecord): void => {
    const owner = darkIdForAtom(atom.id)
    if (!darkSlotById.has(owner)) return
    const states = (statesByWimp.get(atom.wimp) ?? []).toSorted(byPosition)
    const transitions = (transitionsByWimp.get(atom.wimp) ?? []).toSorted(byPosition)
    const stateById = new Map(states.map((state) => [state.id, state] as const))
    const outgoing = group(transitions, (entry) => entry.fromState)
    const current = atomState.get(atom.id) ?? null
    const occurrencesByState = new Map<number, string[]>()

    for (const rootState of states) {
      const onPath = new Map<number, string>()
      const visit = (stateId: number, path: readonly number[]): string => {
        const state = stateById.get(stateId)
        if (!state) return ""
        const key = `atom/${atom.id}/sleeve/${rootState.id}/state/${state.id}/path/${path.join("-") || "root"}`
        const active = rootState.id === current
        appendOrbital({
          key, source: state.id, owner, kind: "state", label: state.name,
          current: active && path.length === 0, active, anchorKey: null,
          sleeve: rootState.id, related: [state.id],
        })
        const occurrences = occurrencesByState.get(state.id)
        if (occurrences) occurrences.push(key)
        else occurrencesByState.set(state.id, [key])
        onPath.set(state.id, key)
        for (const transition of outgoing.get(state.id) ?? []) {
          const target = onPath.get(transition.toState) ?? visit(
            transition.toState,
            [...path, transition.id],
          )
          if (target.length === 0) continue
          const conditions = (conditionsByTransition.get(transition.id) ?? []).toSorted(byPosition)
          for (const condition of conditions) ensureProxy(atom, key, condition.field, active)
          const transitionId = store.transition.id.length + 1
          store.transition.id.push(transitionId)
          store.transition.source.push(transition.id)
          store.transition.owner.push(owner)
          store.transition.from.push(orbitalKey.indexOf(key) + 1)
          store.transition.to.push(orbitalKey.indexOf(target) + 1)
          store.transition.flags.push(active ? BULK_STORE_FLAG_ACTIVE : 0)
          store.transition.batch.push(0)
          store.transition.control.push(...new Array(12).fill(0))
        }
        onPath.delete(state.id)
        return key
      }
      visit(rootState.id, [])
    }

    const preferredOccurrence = (stateIds: readonly number[]): string | null => {
      const ordered = current !== null && stateIds.includes(current)
        ? [current, ...stateIds.filter((id) => id !== current)]
        : [...stateIds]
      for (const stateId of ordered) {
        const occurrences = occurrencesByState.get(stateId) ?? []
        const preferred = occurrences.find((key) => key.endsWith("/root")) ?? occurrences[0]
        if (preferred) return preferred
      }
      return null
    }

    const appendCausal = (input: Readonly<{
      baseKey: string
      source: number
      kind: DirectOrbitalKind
      label: string
      active: boolean
      everyOccurrence: boolean
      related: readonly number[]
    }>): readonly string[] => {
      const unique = [...new Set(input.related)]
      const preferred = preferredOccurrence(unique)
      if (preferred === null) return []
      const all = unique.flatMap((id) => occurrencesByState.get(id) ?? [])
      const selected = input.everyOccurrence
        ? [preferred, ...all.filter((key) => key !== preferred)]
        : [preferred]
      return selected.map((anchorKey) => {
        const key = anchorKey === preferred
          ? input.baseKey
          : `${input.baseKey}/occurrence/${anchorKey}`
        const anchorSlot = orbitalKey.indexOf(anchorKey)
        const branchActive = anchorSlot >= 0 &&
          (store.orbital.flags[anchorSlot]! & BULK_STORE_FLAG_ACTIVE) !== 0
        appendOrbital({
          key, source: input.source, owner, kind: input.kind, label: input.label,
          current: false,
          active: input.everyOccurrence ? input.active && branchActive : input.active,
          anchorKey, sleeve: store.orbital.sleeve[anchorSlot] ?? 0, related: unique,
        })
        return key
      })
    }

    for (const process of processesByWimp.get(atom.wimp) ?? []) {
      const related = states.find((state) => state.name === process.state)?.id
      if (related === undefined) continue
      const kind = process.descriptor.type === "finally" ? "finally" : "process"
      const occurrences = appendCausal({
        baseKey: `atom/${atom.id}/${process.descriptor.type}/${process.id}`,
        source: process.id,
        kind,
        label: String(process.descriptor.label ?? process.descriptor.key ?? process.state),
        active: related === current,
        everyOccurrence: true,
        related: [related],
      })
      const dependencies = processFieldDependencies(process.descriptor)
      for (const orbital of occurrences) {
        const orbitalId = orbitalKey.indexOf(orbital) + 1
        const anchorId = store.orbital.anchor[orbitalId - 1]!
        const anchorKey = orbitalKey[anchorId - 1]!
        const anchorActive =
          (store.orbital.flags[anchorId - 1]! & BULK_STORE_FLAG_ACTIVE) !== 0
        const processActive =
          (store.orbital.flags[orbitalId - 1]! & BULK_STORE_FLAG_ACTIVE) !== 0
        for (const fieldId of dependencies.read) {
          const proxy = ensureProxy(atom, anchorKey, fieldId, anchorActive)
          appendDirectedRelation(owner, "process-read", BULK_STORE_ENDPOINT_KIND["field-proxy"], proxy, BULK_STORE_ENDPOINT_KIND.orbital, orbitalId, processActive)
          if (proxy > 0) store.proxy.paint[proxy - 1] = orbitalId
        }
        for (const fieldId of dependencies.write) {
          const proxy = ensureProxy(atom, anchorKey, fieldId, anchorActive)
          appendDirectedRelation(owner, "process-write", BULK_STORE_ENDPOINT_KIND.orbital, orbitalId, BULK_STORE_ENDPOINT_KIND["field-proxy"], proxy, processActive)
          if (proxy > 0) store.proxy.paint[proxy - 1] = orbitalId
        }
      }
    }

    for (const reaction of reactionsByWimp.get(atom.wimp) ?? []) {
      const related = reaction.states.length > 0
        ? reaction.states
        : states.map((state) => state.id)
      const active = reaction.states.length === 0 ||
        (current !== null && reaction.states.includes(current))
      const occurrences = appendCausal({
        baseKey: `atom/${atom.id}/reaction/${reaction.id}`,
        source: reaction.id,
        kind: "reaction",
        label: reaction.label?.trim() || reaction.key,
        active,
        everyOccurrence: false,
        related,
      })
      for (const orbital of occurrences) {
        const orbitalId = orbitalKey.indexOf(orbital) + 1
        const anchorId = store.orbital.anchor[orbitalId - 1]!
        const anchorKey = orbitalKey[anchorId - 1]!
        const anchorActive =
          (store.orbital.flags[anchorId - 1]! & BULK_STORE_FLAG_ACTIVE) !== 0
        const reactionActive =
          (store.orbital.flags[orbitalId - 1]! & BULK_STORE_FLAG_ACTIVE) !== 0
        for (const fieldId of reaction.read) {
          const proxy = ensureProxy(atom, anchorKey, fieldId, anchorActive)
          appendDirectedRelation(owner, "reaction-read", BULK_STORE_ENDPOINT_KIND["field-proxy"], proxy, BULK_STORE_ENDPOINT_KIND.orbital, orbitalId, reactionActive)
        }
        for (const fieldId of reaction.write) {
          const proxy = ensureProxy(atom, anchorKey, fieldId, anchorActive)
          appendDirectedRelation(owner, "reaction-write", BULK_STORE_ENDPOINT_KIND.orbital, orbitalId, BULK_STORE_ENDPOINT_KIND["field-proxy"], proxy, reactionActive)
        }
      }
    }
  }

  const visitSemantic = (darkId: number): void => {
    if (darkId % 2 === 0) {
      const atom = atomById.get(darkId / 2)
      if (atom) appendAtomSemantics(atom)
    }
    for (let slot = 0; slot < store.dark.id.length; slot++) {
      if (store.dark.parent[slot] === darkId) visitSemantic(store.dark.id[slot]!)
    }
  }
  const aliasByOwnerValue = new Map<string, number>()
  const fieldKindById = new Map(projection.fields.map((field) =>
    [field.id, fieldKind(field.type)] as const))
  for (let slot = 0; slot < store.fieldAlias.id.length; slot++) {
    const value = store.fieldAlias.value[slot]!
    const kind = fieldKindById.get(store.fieldAlias.field[slot]!) ?? BULK_STORE_FIELD_KIND.other
    if (
      value <= 0 ||
      (
        kind !== BULK_STORE_FIELD_KIND.string &&
        kind !== BULK_STORE_FIELD_KIND.number &&
        kind !== BULK_STORE_FIELD_KIND.boolean
      )
    ) continue
    const owner = store.fieldAlias.atom[slot]! * 2
    const key = `${owner}:${value}`
    if (!aliasByOwnerValue.has(key)) aliasByOwnerValue.set(key, store.fieldAlias.id[slot]!)
  }
  for (let slot = 0; slot < store.fieldAlias.id.length; slot++) {
    const value = store.fieldAlias.value[slot]!
    if (value <= 0) continue
    let owner = store.fieldAlias.atom[slot]! * 2
    let parent = store.dark.parent[darkSlotById.get(owner)!] ?? 0
    while (parent !== 0) {
      const source = aliasByOwnerValue.get(`${parent}:${value}`)
      if (source !== undefined) {
        appendRelation(
          parent,
          "field-entanglement",
          BULK_STORE_ENDPOINT_KIND.field,
          source,
          BULK_STORE_ENDPOINT_KIND.field,
          store.fieldAlias.id[slot]!,
          (store.dark.flags[darkSlotById.get(owner)!]! & BULK_STORE_FLAG_ACTIVE) !== 0,
        )
        break
      }
      parent = store.dark.parent[darkSlotById.get(parent)!] ?? 0
    }
  }

  visitSemantic(rootDarkId)

  const result = {store, projection, darkActivity, orbitalKey, proxyKey}
  fillDirectBulkStoreGeometry(result)
  return result
}

/** Production entrypoint: the calculation sidecars die with this call. */
export const buildDirectBulkStore = (
  projection: BulkRuntimeProjection,
  rootAtomId: number,
): BulkStore => buildDirectBulkStoreRows(projection, rootAtomId).store
