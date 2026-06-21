import type {
  DbFieldValueKind,
  DbParticleActivity,
  DbParticleKind,
  DbWorldFieldDescriptor,
  DbWorldParticleDescriptor,
  DbWorldRows,
  BulkLayoutSettings,
} from "@bulk/gravity/layout"
import {
  createDbWorldRowsFromParticleDescriptors,
  scaleDbWorldRowsToRootOuterDiameter,
} from "@bulk/gravity/layout"
import type {BoundaryBulkRuntimeSnapshot} from "boundary"

type ActorRow = BoundaryBulkRuntimeSnapshot["actors"][number]
type TopologyRow = BoundaryBulkRuntimeSnapshot["topologies"][number]
type MatterParticleRow = BoundaryBulkRuntimeSnapshot["matterParticles"][number]
type FieldRow = BoundaryBulkRuntimeSnapshot["fields"][number]
type FieldEnumVariantRow = BoundaryBulkRuntimeSnapshot["fieldEnumVariants"][number]
type ValueRow = BoundaryBulkRuntimeSnapshot["values"][number]
type ValueListItemRow = BoundaryBulkRuntimeSnapshot["valueItems"][number]
type MatterBindingPathRow = BoundaryBulkRuntimeSnapshot["matterTopologyBindingPaths"][number]
type MatterChildBindingPathRow = BoundaryBulkRuntimeSnapshot["matterChildWimpBindingPaths"][number]

const actorColor = {colorR: 0.4, colorG: 0.45, colorB: 0.98}
const topologyColors: Record<DbParticleKind, {colorR: number; colorG: number; colorB: number}> = {
  wimp: actorColor,
  fuzzy: {colorR: 0.52, colorG: 0.88, colorB: 1},
  axion: {colorR: 1, colorG: 0.66, colorB: 0.36},
  macho: {colorR: 1, colorG: 0.38, colorB: 0.48},
}

const fieldColor = (kind: DbFieldValueKind): {colorR: number; colorG: number; colorB: number} => {
  if (kind === "string") return {colorR: 1, colorG: 0.08, colorB: 0.58}
  if (kind === "number") return {colorR: 1, colorG: 0.88, colorB: 0}
  if (kind === "boolean") return {colorR: 0, colorG: 0.9, colorB: 1}
  if (kind === "enum") return {colorR: 0.58, colorG: 0.32, colorB: 1}
  if (kind === "array") return {colorR: 1, colorG: 0.42, colorB: 0}
  return {colorR: 1, colorG: 0.16, colorB: 0.16}
}

const fieldValueKind = (type: FieldRow["type"]): DbFieldValueKind => {
  if (type === "string") return "string"
  if (type === "number") return "number"
  if (type === "boolean") return "boolean"
  if (type === "array") return "array"
  if (type === "enum") return "enum"
  return "other"
}

const group = <T, K extends string | number>(rows: T[], key: (row: T) => K | null): Map<K, T[]> => {
  const map = new Map<K, T[]>()
  for (const row of rows) {
    const groupKey = key(row)
    if (groupKey === null) continue
    const bucket = map.get(groupKey)
    if (bucket) bucket.push(row)
    else map.set(groupKey, [row])
  }
  return map
}

const matterParentKey = (wimp: string, parentParticle: number | null): string =>
  `${wimp}\0${parentParticle ?? ""}`

const particleNamespaceId = (id: number, offset: 0 | 1, label: string): number => {
  const particleId = id * 2 + offset
  if (!Number.isSafeInteger(particleId)) {
    throw new Error(`${label} particle id is not safe: ${id}`)
  }
  return particleId
}

const actorParticleId = (id: number): number => particleNamespaceId(id, 0, "Actor")
const topologyParticleId = (id: number): number => particleNamespaceId(id, 1, "Topology")

const fieldOrbitId = (actorId: number, fieldId: number): number => {
  const sum = actorId + fieldId
  const id = (sum * (sum + 1)) / 2 + fieldId
  if (!Number.isSafeInteger(id)) {
    throw new Error(`Field orbit id is not safe: actor=${actorId} field=${fieldId}`)
  }
  return id
}

const valueText = (
  valueId: number | undefined,
  valuesById: Map<number, ValueRow>,
  valueItemsById: Map<number, ValueListItemRow[]>,
): string | null => {
  if (valueId === undefined) return null
  const value = valuesById.get(valueId)
  if (!value) return null

  if (value.kind === "boolean") return value.booleanValue === 1 ? "true" : "false"
  if (value.kind === "number") return value.numberValue === null ? null : String(value.numberValue)
  if (value.kind === "string") return value.textValue
  if (value.kind === "enum") return value.enumValue
  if (value.kind === "list") return (valueItemsById.get(value.id) ?? []).map((item) => item.itemValue).join(", ")
  return null
}

const sortByPosition = <T extends {position: number}>(rows: T[]): T[] =>
  [...rows].sort((left, right) => left.position - right.position)

const matterEdgeSlotOrder: Record<MatterParticleRow["edgeSlot"], number> = {
  root: 0,
  branch: 0,
  child: 0,
  then: 0,
  else: 1,
}

const sortMatterParticles = (rows: MatterParticleRow[]): MatterParticleRow[] =>
  [...rows].sort((left, right) =>
    matterEdgeSlotOrder[left.edgeSlot] - matterEdgeSlotOrder[right.edgeSlot] ||
    left.particleOrder - right.particleOrder,
  )

const sortBindingPaths = <T extends {depOrder: number; childOrder?: number}>(rows: T[]): T[] =>
  [...rows].sort((left, right) => (left.childOrder ?? 0) - (right.childOrder ?? 0) || left.depOrder - right.depOrder)

const fieldKeyFromMatterPath = (path: string): string | null => {
  if (path.startsWith("/") || path.startsWith("[") || path.startsWith(".")) return null
  return path
}

export function buildBoundaryWorldRows(
  snapshot: BoundaryBulkRuntimeSnapshot,
  rootSrc: string,
  settings: Partial<BulkLayoutSettings> = {},
): DbWorldRows {
  const {
    actors,
    topologies,
    wimps,
    fields,
    actorValues,
    values,
    valueItems,
    matterParticles,
    matterTopologyBindingPaths,
    matterChildWimpBindingPaths,
  } = snapshot

  const actorById = new Map(actors.map((actor) => [actor.id, actor] as const))
  const topologyById = new Map(topologies.map((topology) => [topology.id, topology] as const))
  const wimpBySrc = new Map(wimps.map((wimp) => [wimp.src, wimp] as const))
  const fieldsByWimp = group(fields, (field) => field.wimp)
  const fieldByWimpKey = new Map(fields.map((field) => [`${field.wimp}\0${field.key}`, field] as const))
  const enumVariantsByField = group(snapshot.fieldEnumVariants, (variant) => variant.field)
  const actorValueByActorField = new Map(actorValues.map((row) => [`${row.actor}\0${row.field}`, row.value] as const))
  const valuesById = new Map(values.map((value) => [value.id, value] as const))
  const valueItemsById = group(valueItems, (item) => item.value)
  const actorsByParentActor = group(actors, (actor) => actor.parentActor)
  const actorsByParentTopology = group(actors, (actor) => actor.parentTopology)
  const topologiesByParentActor = group(topologies, (topology) => topology.parentActor)
  const topologiesByParentTopology = group(topologies, (topology) => topology.parentTopology)
  const matterParticlesByWimpParent = group(
    matterParticles,
    (particle) => matterParentKey(particle.wimp, particle.parentParticle),
  )
  const matterTopologyBindingPathsByParticle = group(matterTopologyBindingPaths, (row) => row.particle)
  const matterChildWimpBindingPathsByParticle = group(matterChildWimpBindingPaths, (row) => row.particle)
  const structuralFieldKeys = new Set<string>()
  const topologyLabelById = new Map<number, string>()
  const topologyPlanById = new Map<number, MatterParticleRow>()
  const topologyActorById = new Map<number, ActorRow>()
  const activityByParticleId = new Map<number, DbParticleActivity>()

  const collectStructuralFieldKeys = (rows: MatterBindingPathRow[]): void => {
    for (const row of rows) {
      const key = fieldKeyFromMatterPath(row.path)
      if (key === null) continue
      const field = fieldByWimpKey.get(`${row.wimp}\0${key}`)
      if (field?.type === "enum" || field?.type === "array") structuralFieldKeys.add(`${row.wimp}\0${key}`)
    }
  }

  collectStructuralFieldKeys(matterTopologyBindingPaths)
  collectStructuralFieldKeys(matterChildWimpBindingPaths)

  const matterTopologyChildren = (wimp: string, parentParticle: number | null): MatterParticleRow[] =>
    sortMatterParticles(matterParticlesByWimpParent.get(matterParentKey(wimp, parentParticle)) ?? [])
      .filter((particle) => particle.particleKind !== "wimp")

  const fieldLabelFromPath = (wimp: string, path: string): string | null => {
    const key = fieldKeyFromMatterPath(path)
    if (!key) return null
    const field = fieldByWimpKey.get(`${wimp}\0${key}`)
    const label = field?.label?.trim()
    return label && label.length > 0 ? label : field?.key ?? key
  }

  const firstFieldLabelFromPaths = (wimp: string, paths: string[]): string | null => {
    for (const path of paths) {
      const label = fieldLabelFromPath(wimp, path)
      if (label !== null) return label
    }
    return null
  }

  const topologyPlanLabel = (wimp: string, plan: MatterParticleRow): string | null => {
    const childPaths = sortBindingPaths(matterChildWimpBindingPathsByParticle.get(plan.id) ?? [])
      .map((row) => row.path)
    return firstFieldLabelFromPaths(wimp, sortBindingPaths(matterTopologyBindingPathsByParticle.get(plan.id) ?? []).map((row) => row.path)) ??
      firstFieldLabelFromPaths(wimp, childPaths)
  }

  const actorFieldValueText = (actor: ActorRow, fieldKey: string): string | null => {
    const field = fieldByWimpKey.get(`${actor.wimp}\0${fieldKey}`)
    if (!field) return null
    return valueText(actorValueByActorField.get(`${actor.id}\0${field.id}`), valuesById, valueItemsById)
  }

  const enumValuePosition = (field: FieldRow, value: string | null): number | null => {
    if (value === null) return null
    return enumVariantsByField.get(field.id)?.find((variant: FieldEnumVariantRow) => variant.itemValue === value)?.position ?? null
  }

  const assignTopologyLabels = (actor: ActorRow, runtimeTopologies: TopologyRow[], parentMatterParticle: number | null): void => {
    const wimp = actor.wimp
    const plans = matterTopologyChildren(wimp, parentMatterParticle)
    const runtime = sortByPosition(runtimeTopologies)
    for (let index = 0; index < runtime.length; index++) {
      const topology = runtime[index]!
      const plan = plans[index]
      if (!plan) continue
      topologyPlanById.set(topology.id, plan)
      topologyActorById.set(topology.id, actor)
      const label = topologyPlanLabel(wimp, plan)
      if (label !== null) topologyLabelById.set(topology.id, label)
      assignTopologyLabels(actor, topologiesByParentTopology.get(topology.id) ?? [], plan.id)
    }
  }

  for (const actor of actors) {
    assignTopologyLabels(actor, topologiesByParentActor.get(actor.id) ?? [], null)
  }

  for (const topology of topologies) {
    if (topology.kind !== "fuzzy") continue
    const plan = topologyPlanById.get(topology.id)
    const actor = topologyActorById.get(topology.id)
    if (!plan || !actor) continue
    const branchPlans = sortMatterParticles(matterParticlesByWimpParent.get(matterParentKey(plan.wimp, plan.id)) ?? [])
      .filter((particle) => particle.edgeSlot === "branch" && particle.particleKind === "wimp")
    if (branchPlans.length === 0) continue
    const fieldKey = sortBindingPaths(matterTopologyBindingPathsByParticle.get(plan.id) ?? [])
      .map((row) => fieldKeyFromMatterPath(row.path))
      .find((key): key is string => key !== null)
    if (!fieldKey) continue
    const field = fieldByWimpKey.get(`${actor.wimp}\0${fieldKey}`)
    const activeIndex = field?.type === "enum" ? enumValuePosition(field, actorFieldValueText(actor, fieldKey)) : null
    const branchActors = sortByPosition(actorsByParentTopology.get(topology.id) ?? [])
    branchActors.forEach((branchActor, index) => {
      activityByParticleId.set(actorParticleId(branchActor.id), activeIndex !== null && index === activeIndex ? "active" : "inactive")
    })
  }

  const descriptorField = (actor: ActorRow, field: FieldRow): DbWorldFieldDescriptor => {
    const kind = fieldValueKind(field.type)
    return {
      id: fieldOrbitId(actor.id, field.id),
      fieldKey: field.key,
      fieldLabel: field.label ?? field.key,
      fieldValueKind: kind,
      valueText: valueText(actorValueByActorField.get(`${actor.id}\0${field.id}`), valuesById, valueItemsById),
      ...fieldColor(kind),
    }
  }

  const childDescriptors = (
    parent: {kind: "actor"; id: number} | {kind: "topology"; id: number},
    visited: Set<string>,
    inheritedActivity: DbParticleActivity,
  ): DbWorldParticleDescriptor[] => {
    const childActors = parent.kind === "actor" ? actorsByParentActor.get(parent.id) ?? [] : actorsByParentTopology.get(parent.id) ?? []
    const childTopologies = parent.kind === "actor"
      ? topologiesByParentActor.get(parent.id) ?? []
      : topologiesByParentTopology.get(parent.id) ?? []

    return [
      ...sortByPosition(childTopologies).map((topology) => topologyDescriptor(topology, visited, inheritedActivity)),
      ...sortByPosition(childActors).map((actor) => actorDescriptor(actor, visited, inheritedActivity)),
    ]
  }

  const actorDescriptor = (actor: ActorRow, visited: Set<string>, inheritedActivity: DbParticleActivity = "neutral"): DbWorldParticleDescriptor => {
    const key = `actor:${actor.id}`
    const particleId = actorParticleId(actor.id)
    const activity = activityByParticleId.get(particleId) ?? inheritedActivity
    if (visited.has(key)) {
      return {
        particleId,
        kind: "wimp",
        src: actor.wimp,
        metaSrc: actor.wimp,
        label: wimpBySrc.get(actor.wimp)?.name ?? actor.wimp,
        ...actorColor,
        activity,
        fields: [],
        children: [],
      }
    }

    visited.add(key)
    return {
      particleId,
      kind: "wimp",
      src: actor.wimp,
      metaSrc: actor.wimp,
      label: wimpBySrc.get(actor.wimp)?.name ?? actor.wimp,
      ...actorColor,
      activity,
      fields: (fieldsByWimp.get(actor.wimp) ?? [])
        .filter((field) => !structuralFieldKeys.has(`${actor.wimp}\0${field.key}`))
        .map((field) => descriptorField(actor, field)),
      children: childDescriptors({kind: "actor", id: actor.id}, visited, activity),
    }
  }

  const topologyDescriptor = (topology: TopologyRow, visited: Set<string>, inheritedActivity: DbParticleActivity = "neutral"): DbWorldParticleDescriptor => {
    const key = `topology:${topology.id}`
    const label = topologyLabelById.get(topology.id) ?? ""
    const particleId = topologyParticleId(topology.id)
    const activity = activityByParticleId.get(particleId) ?? inheritedActivity
    if (visited.has(key)) {
      return {
        particleId,
        kind: topology.kind,
        src: null,
        metaSrc: null,
        label,
        ...topologyColors[topology.kind],
        activity,
        fields: [],
        children: [],
      }
    }

    visited.add(key)
    return {
      particleId,
      kind: topology.kind,
      src: null,
      metaSrc: null,
      label,
      ...topologyColors[topology.kind],
      activity,
      fields: [],
      children: childDescriptors({kind: "topology", id: topology.id}, visited, activity),
    }
  }

  const rootActors = actors.filter((actor) => actor.parentActor === null && actor.parentTopology === null)
  const preferredRoots = rootActors.filter((actor) => actor.wimp === rootSrc)
  const roots = preferredRoots.length > 0 ? preferredRoots : rootActors
  const descriptors = sortByPosition(roots)
    .filter((actor) => actorById.has(actor.id))
    .map((actor) => actorDescriptor(actor, new Set()))

  // Keep orphan topologies visible if they ever appear during manual debugging.
  for (const topology of sortByPosition(topologies.filter((item) => item.parentActor === null && item.parentTopology === null))) {
    if (topologyById.has(topology.id)) descriptors.push(topologyDescriptor(topology, new Set()))
  }

  return scaleDbWorldRowsToRootOuterDiameter(
    createDbWorldRowsFromParticleDescriptors(rootSrc, descriptors, settings),
    undefined,
    settings,
  )
}
