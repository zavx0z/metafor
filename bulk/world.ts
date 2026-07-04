import type {
  BulkDarkParticleActivity,
  BulkDarkParticleInput,
  BulkDarkParticleKind,
  BulkFieldParticleInput,
  BulkFieldParticleKind,
  BulkLayoutSettings,
  BulkManifest,
} from "@bulk/gravity/layout"
import {
  createBulkManifestFromDarkParticleInputs,
  scaleBulkManifestToRootOuterDiameter,
} from "@bulk/gravity/layout"
import type {BoundaryBulkRuntimeSnapshot} from "boundary"

type BoundaryActorSnapshot = BoundaryBulkRuntimeSnapshot["actors"][number]
type BoundaryTopologySnapshot = BoundaryBulkRuntimeSnapshot["topologies"][number]
type BoundaryMatterParticleSnapshot = BoundaryBulkRuntimeSnapshot["matterParticles"][number]
type BoundaryFieldSnapshot = BoundaryBulkRuntimeSnapshot["fields"][number]
type BoundaryFieldEnumVariantSnapshot = BoundaryBulkRuntimeSnapshot["fieldEnumVariants"][number]
type BoundaryValueSnapshot = BoundaryBulkRuntimeSnapshot["values"][number]
type BoundaryValueListItemSnapshot = BoundaryBulkRuntimeSnapshot["valueItems"][number]
type BoundaryMatterBindingPathSnapshot = BoundaryBulkRuntimeSnapshot["matterTopologyBindingPaths"][number]
type BoundaryMatterChildBindingPathSnapshot = BoundaryBulkRuntimeSnapshot["matterChildWimpBindingPaths"][number]

const wimpDarkParticleColor = {colorR: 0.4, colorG: 0.45, colorB: 0.98}
const connectivityDarkParticleColors: Record<BulkDarkParticleKind, {colorR: number; colorG: number; colorB: number}> = {
  wimp: wimpDarkParticleColor,
  fuzzy: {colorR: 0.52, colorG: 0.88, colorB: 1},
  axion: {colorR: 1, colorG: 0.66, colorB: 0.36},
  macho: {colorR: 1, colorG: 0.38, colorB: 0.48},
}

const fieldParticleColor = (kind: BulkFieldParticleKind): {colorR: number; colorG: number; colorB: number} => {
  if (kind === "string") return {colorR: 1, colorG: 0.08, colorB: 0.58}
  if (kind === "number") return {colorR: 1, colorG: 0.88, colorB: 0}
  if (kind === "boolean") return {colorR: 0, colorG: 0.9, colorB: 1}
  // TODO: enum/array are connectivity particles and should be manifested as Fuzzy/MACHO, not ordinary field particles.
  if (kind === "enum") return {colorR: 0.58, colorG: 0.32, colorB: 1}
  if (kind === "array") return {colorR: 1, colorG: 0.42, colorB: 0}
  return {colorR: 1, colorG: 0.16, colorB: 0.16}
}

const fieldParticleKind = (type: BoundaryFieldSnapshot["type"]): BulkFieldParticleKind => {
  if (type === "string") return "string"
  if (type === "number") return "number"
  if (type === "boolean") return "boolean"
  if (type === "array") return "array"
  if (type === "enum") return "enum"
  return "other"
}

const group = <T, K extends string | number>(entries: T[], key: (entry: T) => K | null): Map<K, T[]> => {
  const map = new Map<K, T[]>()
  for (const entry of entries) {
    const groupKey = key(entry)
    if (groupKey === null) continue
    const bucket = map.get(groupKey)
    if (bucket) bucket.push(entry)
    else map.set(groupKey, [entry])
  }
  return map
}

const matterParentKey = (wimp: string, parentMatterParticle: number | null): string =>
  `${wimp}\0${parentMatterParticle ?? ""}`

const darkParticleNamespaceId = (id: number, offset: 0 | 1, label: string): number => {
  const darkParticleId = id * 2 + offset
  if (!Number.isSafeInteger(darkParticleId)) {
    throw new Error(`${label} dark particle id is not safe: ${id}`)
  }
  return darkParticleId
}

const wimpDarkParticleIdFromActorId = (id: number): number => darkParticleNamespaceId(id, 0, "Actor")
const connectivityDarkParticleIdFromTopologyId = (id: number): number => darkParticleNamespaceId(id, 1, "Topology")

const fieldParticleIdFromActorField = (actorId: number, fieldId: number): number => {
  const sum = actorId + fieldId
  const fieldParticleId = (sum * (sum + 1)) / 2 + fieldId
  if (!Number.isSafeInteger(fieldParticleId)) {
    throw new Error(`Field particle id is not safe: actor=${actorId} field=${fieldId}`)
  }
  return fieldParticleId
}

const valueText = (
  valueId: number | undefined,
  valuesById: Map<number, BoundaryValueSnapshot>,
  valueItemsById: Map<number, BoundaryValueListItemSnapshot[]>,
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

const sortByPosition = <T extends {position: number}>(entries: T[]): T[] =>
  [...entries].sort((left, right) => left.position - right.position)

const matterEdgeSlotOrder: Record<BoundaryMatterParticleSnapshot["edgeSlot"], number> = {
  root: 0,
  branch: 0,
  child: 0,
  then: 0,
  else: 1,
}

const sortMatterParticles = (entries: BoundaryMatterParticleSnapshot[]): BoundaryMatterParticleSnapshot[] =>
  [...entries].sort((left, right) =>
    matterEdgeSlotOrder[left.edgeSlot] - matterEdgeSlotOrder[right.edgeSlot] ||
    left.particleOrder - right.particleOrder,
  )

const sortBindingPaths = <T extends {depOrder: number; childOrder?: number}>(entries: T[]): T[] =>
  [...entries].sort((left, right) => (left.childOrder ?? 0) - (right.childOrder ?? 0) || left.depOrder - right.depOrder)

const fieldKeyFromMatterPath = (path: string): string | null => {
  if (path.startsWith("/") || path.startsWith("[") || path.startsWith(".")) return null
  return path
}

export function buildBoundaryBulkManifest(
  snapshot: BoundaryBulkRuntimeSnapshot,
  rootSrc: string,
  settings: Partial<BulkLayoutSettings> = {},
): BulkManifest {
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
  const actorValueByActorField = new Map(actorValues.map((entry) => [`${entry.actor}\0${entry.field}`, entry.value] as const))
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
  const matterTopologyBindingPathsByParticle = group(matterTopologyBindingPaths, (entry) => entry.particle)
  const matterChildWimpBindingPathsByParticle = group(matterChildWimpBindingPaths, (entry) => entry.particle)
  const connectivityFieldKeys = new Set<string>()
  const topologyLabelById = new Map<number, string>()
  const topologyPlanById = new Map<number, BoundaryMatterParticleSnapshot>()
  const topologyActorById = new Map<number, BoundaryActorSnapshot>()
  const activityByDarkParticleId = new Map<number, BulkDarkParticleActivity>()

  const collectConnectivityFieldKeys = (entries: BoundaryMatterBindingPathSnapshot[] | BoundaryMatterChildBindingPathSnapshot[]): void => {
    for (const entry of entries) {
      const key = fieldKeyFromMatterPath(entry.path)
      if (key === null) continue
      const field = fieldByWimpKey.get(`${entry.wimp}\0${key}`)
      if (field?.type === "enum" || field?.type === "array") connectivityFieldKeys.add(`${entry.wimp}\0${key}`)
    }
  }

  collectConnectivityFieldKeys(matterTopologyBindingPaths)
  collectConnectivityFieldKeys(matterChildWimpBindingPaths)

  const matterTopologyChildren = (wimp: string, parentMatterParticle: number | null): BoundaryMatterParticleSnapshot[] =>
    sortMatterParticles(matterParticlesByWimpParent.get(matterParentKey(wimp, parentMatterParticle)) ?? [])
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

  const topologyPlanLabel = (wimp: string, plan: BoundaryMatterParticleSnapshot): string | null => {
    const childPaths = sortBindingPaths(matterChildWimpBindingPathsByParticle.get(plan.id) ?? [])
      .map((entry) => entry.path)
    return firstFieldLabelFromPaths(wimp, sortBindingPaths(matterTopologyBindingPathsByParticle.get(plan.id) ?? []).map((entry) => entry.path)) ??
      firstFieldLabelFromPaths(wimp, childPaths)
  }

  const actorFieldValueText = (actor: BoundaryActorSnapshot, fieldKey: string): string | null => {
    const field = fieldByWimpKey.get(`${actor.wimp}\0${fieldKey}`)
    if (!field) return null
    return valueText(actorValueByActorField.get(`${actor.id}\0${field.id}`), valuesById, valueItemsById)
  }

  const enumValuePosition = (field: BoundaryFieldSnapshot, value: string | null): number | null => {
    if (value === null) return null
    return enumVariantsByField.get(field.id)?.find((variant: BoundaryFieldEnumVariantSnapshot) => variant.itemValue === value)?.position ?? null
  }

  const assignTopologyLabels = (actor: BoundaryActorSnapshot, runtimeTopologies: BoundaryTopologySnapshot[], parentMatterParticle: number | null): void => {
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
      .map((entry) => fieldKeyFromMatterPath(entry.path))
      .find((key): key is string => key !== null)
    if (!fieldKey) continue
    const field = fieldByWimpKey.get(`${actor.wimp}\0${fieldKey}`)
    const activeIndex = field?.type === "enum" ? enumValuePosition(field, actorFieldValueText(actor, fieldKey)) : null
    const branchActors = sortByPosition(actorsByParentTopology.get(topology.id) ?? [])
    branchActors.forEach((branchActor, index) => {
      const darkParticleId = wimpDarkParticleIdFromActorId(branchActor.id)
      activityByDarkParticleId.set(darkParticleId, activeIndex !== null && index === activeIndex ? "active" : "inactive")
    })
  }

  const fieldParticleInputFromBoundaryField = (actor: BoundaryActorSnapshot, field: BoundaryFieldSnapshot): BulkFieldParticleInput => {
    const kind = fieldParticleKind(field.type)
    return {
      fieldParticleId: fieldParticleIdFromActorField(actor.id, field.id),
      fieldId: field.id,
      fieldKey: field.key,
      fieldLabel: field.label ?? field.key,
      fieldParticleKind: kind,
      valueText: valueText(actorValueByActorField.get(`${actor.id}\0${field.id}`), valuesById, valueItemsById),
      ...fieldParticleColor(kind),
    }
  }

  const childDarkParticleInputs = (
    parent: {kind: "actor"; id: number} | {kind: "topology"; id: number},
    visited: Set<string>,
    inheritedActivity: BulkDarkParticleActivity,
  ): BulkDarkParticleInput[] => {
    const childActors = parent.kind === "actor" ? actorsByParentActor.get(parent.id) ?? [] : actorsByParentTopology.get(parent.id) ?? []
    const childTopologies = parent.kind === "actor"
      ? topologiesByParentActor.get(parent.id) ?? []
      : topologiesByParentTopology.get(parent.id) ?? []

    return [
      ...sortByPosition(childTopologies).map((topology) => connectivityDarkParticleInputFromTopology(topology, visited, inheritedActivity)),
      ...sortByPosition(childActors).map((actor) => wimpDarkParticleInputFromActor(actor, visited, inheritedActivity)),
    ]
  }

  const wimpDarkParticleInputFromActor = (actor: BoundaryActorSnapshot, visited: Set<string>, inheritedActivity: BulkDarkParticleActivity = "neutral"): BulkDarkParticleInput => {
    const key = `actor:${actor.id}`
    const darkParticleId = wimpDarkParticleIdFromActorId(actor.id)
    const activity = activityByDarkParticleId.get(darkParticleId) ?? inheritedActivity
    if (visited.has(key)) {
      return {
        darkParticleId,
        darkParticleKind: "wimp",
        src: actor.wimp,
        metaSrc: actor.wimp,
        label: wimpBySrc.get(actor.wimp)?.name ?? actor.wimp,
        ...wimpDarkParticleColor,
        activity,
        fieldParticles: [],
        children: [],
      }
    }

    visited.add(key)
    return {
      darkParticleId,
      darkParticleKind: "wimp",
      src: actor.wimp,
      metaSrc: actor.wimp,
      label: wimpBySrc.get(actor.wimp)?.name ?? actor.wimp,
      ...wimpDarkParticleColor,
      activity,
      fieldParticles: (fieldsByWimp.get(actor.wimp) ?? [])
        .filter((field) => !connectivityFieldKeys.has(`${actor.wimp}\0${field.key}`))
        .map((field) => fieldParticleInputFromBoundaryField(actor, field)),
      children: childDarkParticleInputs({kind: "actor", id: actor.id}, visited, activity),
    }
  }

  const connectivityDarkParticleInputFromTopology = (topology: BoundaryTopologySnapshot, visited: Set<string>, inheritedActivity: BulkDarkParticleActivity = "neutral"): BulkDarkParticleInput => {
    const key = `topology:${topology.id}`
    const label = topologyLabelById.get(topology.id) ?? ""
    const darkParticleId = connectivityDarkParticleIdFromTopologyId(topology.id)
    const activity = activityByDarkParticleId.get(darkParticleId) ?? inheritedActivity
    if (visited.has(key)) {
      return {
        darkParticleId,
        darkParticleKind: topology.kind,
        src: null,
        metaSrc: null,
        label,
        ...connectivityDarkParticleColors[topology.kind],
        activity,
        fieldParticles: [],
        children: [],
      }
    }

    visited.add(key)
    return {
      darkParticleId,
      darkParticleKind: topology.kind,
      src: null,
      metaSrc: null,
      label,
      ...connectivityDarkParticleColors[topology.kind],
      activity,
      fieldParticles: [],
      children: childDarkParticleInputs({kind: "topology", id: topology.id}, visited, activity),
    }
  }

  const rootActors = actors.filter((actor) => actor.parentActor === null && actor.parentTopology === null)
  const preferredRoots = rootActors.filter((actor) => actor.wimp === rootSrc)
  const roots = preferredRoots.length > 0 ? preferredRoots : rootActors
  const inputs = sortByPosition(roots)
    .filter((actor) => actorById.has(actor.id))
    .map((actor) => wimpDarkParticleInputFromActor(actor, new Set()))

  for (const topology of sortByPosition(topologies.filter((item) => item.parentActor === null && item.parentTopology === null))) {
    if (topologyById.has(topology.id)) inputs.push(connectivityDarkParticleInputFromTopology(topology, new Set()))
  }

  return scaleBulkManifestToRootOuterDiameter(
    createBulkManifestFromDarkParticleInputs(rootSrc, inputs, settings),
    undefined,
    settings,
  )
}
