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
  if (kind === "number") return {colorR: 0.49, colorG: 0.83, colorB: 1}
  if (kind === "bool") return {colorR: 0.55, colorG: 0.91, colorB: 0.6}
  if (kind === "text") return {colorR: 1, colorG: 0.61, colorB: 0.45}
  return {colorR: 1, colorG: 0.5, colorB: 0.5}
}

const fieldValueKind = (type: FieldRow["type"]): DbFieldValueKind => {
  if (type === "number") return "number"
  if (type === "boolean") return "bool"
  if (type === "string" || type === "array" || type === "enum") return "text"
  return "other"
}

const group = <T, K extends string>(rows: T[], key: (row: T) => K | null): Map<K, T[]> => {
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

const valueText = (
  valueId: string | undefined,
  valuesById: Map<string, ValueRow>,
  valueItemsById: Map<string, ValueListItemRow[]>,
): string | null => {
  if (!valueId) return null
  const value = valuesById.get(valueId)
  if (!value) return null

  if (value.kind === "boolean") return value.booleanValue === 1 ? "true" : "false"
  if (value.kind === "number") return value.numberValue === null ? null : String(value.numberValue)
  if (value.kind === "string") return value.textValue
  if (value.kind === "enum") return value.enumValue
  if (value.kind === "list") return (valueItemsById.get(value.uuid) ?? []).map((item) => item.itemValue).join(", ")
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

  const actorById = new Map(actors.map((actor) => [actor.uuid, actor] as const))
  const topologyById = new Map(topologies.map((topology) => [topology.uuid, topology] as const))
  const wimpBySrc = new Map(wimps.map((wimp) => [wimp.src, wimp] as const))
  const fieldsByWimp = group(fields, (field) => field.wimp)
  const fieldByWimpKey = new Map(fields.map((field) => [`${field.wimp}\0${field.key}`, field] as const))
  const enumVariantsByField = group(snapshot.fieldEnumVariants, (variant) => variant.field)
  const actorValueByActorField = new Map(actorValues.map((row) => [`${row.actor}\0${row.field}`, row.value] as const))
  const valuesById = new Map(values.map((value) => [value.uuid, value] as const))
  const valueItemsById = group(valueItems, (item) => item.value)
  const actorsByParentActor = group(actors, (actor) => actor.parentActor)
  const actorsByParentTopology = group(actors, (actor) => actor.parentTopology)
  const topologiesByParentActor = group(topologies, (topology) => topology.parentActor)
  const topologiesByParentTopology = group(topologies, (topology) => topology.parentTopology)
  const matterParticlesByWimpParent = group(
    matterParticles,
    (particle) => `${particle.wimp}\0${particle.parentParticle ?? ""}`,
  )
  const matterTopologyBindingPathsByParticle = group(matterTopologyBindingPaths, (row) => row.particle)
  const matterChildWimpBindingPathsByParticle = group(matterChildWimpBindingPaths, (row) => row.particle)
  const structuralFieldKeys = new Set<string>()
  const topologyLabelById = new Map<string, string>()
  const topologyPlanById = new Map<string, MatterParticleRow>()
  const topologyActorById = new Map<string, ActorRow>()
  const activityByParticleId = new Map<string, DbParticleActivity>()

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

  const matterTopologyChildren = (wimp: string, parentParticle: string | null): MatterParticleRow[] =>
    sortMatterParticles(matterParticlesByWimpParent.get(`${wimp}\0${parentParticle ?? ""}`) ?? [])
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
    const childPaths = sortBindingPaths(matterChildWimpBindingPathsByParticle.get(plan.uuid) ?? [])
      .map((row) => row.path)
    return firstFieldLabelFromPaths(wimp, sortBindingPaths(matterTopologyBindingPathsByParticle.get(plan.uuid) ?? []).map((row) => row.path)) ??
      firstFieldLabelFromPaths(wimp, childPaths)
  }

  const actorFieldValueText = (actor: ActorRow, fieldKey: string): string | null => {
    const field = fieldByWimpKey.get(`${actor.wimp}\0${fieldKey}`)
    if (!field) return null
    return valueText(actorValueByActorField.get(`${actor.uuid}\0${field.uuid}`), valuesById, valueItemsById)
  }

  const enumValuePosition = (field: FieldRow, value: string | null): number | null => {
    if (value === null) return null
    return enumVariantsByField.get(field.uuid)?.find((variant: FieldEnumVariantRow) => variant.itemValue === value)?.position ?? null
  }

  const assignTopologyLabels = (actor: ActorRow, runtimeTopologies: TopologyRow[], parentMatterParticle: string | null): void => {
    const wimp = actor.wimp
    const plans = matterTopologyChildren(wimp, parentMatterParticle)
    const runtime = sortByPosition(runtimeTopologies)
    for (let index = 0; index < runtime.length; index++) {
      const topology = runtime[index]!
      const plan = plans[index]
      if (!plan) continue
      topologyPlanById.set(topology.uuid, plan)
      topologyActorById.set(topology.uuid, actor)
      const label = topologyPlanLabel(wimp, plan)
      if (label !== null) topologyLabelById.set(topology.uuid, label)
      assignTopologyLabels(actor, topologiesByParentTopology.get(topology.uuid) ?? [], plan.uuid)
    }
  }

  for (const actor of actors) {
    assignTopologyLabels(actor, topologiesByParentActor.get(actor.uuid) ?? [], null)
  }

  for (const topology of topologies) {
    if (topology.kind !== "fuzzy") continue
    const plan = topologyPlanById.get(topology.uuid)
    const actor = topologyActorById.get(topology.uuid)
    if (!plan || !actor) continue
    const branchPlans = sortMatterParticles(matterParticlesByWimpParent.get(`${plan.wimp}\0${plan.uuid}`) ?? [])
      .filter((particle) => particle.edgeSlot === "branch" && particle.particleKind === "wimp")
    if (branchPlans.length === 0) continue
    const fieldKey = sortBindingPaths(matterTopologyBindingPathsByParticle.get(plan.uuid) ?? [])
      .map((row) => fieldKeyFromMatterPath(row.path))
      .find((key): key is string => key !== null)
    if (!fieldKey) continue
    const field = fieldByWimpKey.get(`${actor.wimp}\0${fieldKey}`)
    const activeIndex = field?.type === "enum" ? enumValuePosition(field, actorFieldValueText(actor, fieldKey)) : null
    const branchActors = sortByPosition(actorsByParentTopology.get(topology.uuid) ?? [])
    branchActors.forEach((branchActor, index) => {
      activityByParticleId.set(branchActor.uuid, activeIndex !== null && index === activeIndex ? "active" : "inactive")
    })
  }

  const descriptorField = (actor: ActorRow, field: FieldRow): DbWorldFieldDescriptor => {
    const kind = fieldValueKind(field.type)
    return {
      id: `${actor.uuid}:${field.uuid}`,
      fieldKey: field.key,
      fieldLabel: field.label ?? field.key,
      fieldValueKind: kind,
      valueText: valueText(actorValueByActorField.get(`${actor.uuid}\0${field.uuid}`), valuesById, valueItemsById),
      ...fieldColor(kind),
    }
  }

  const childDescriptors = (
    parent: {kind: "actor"; uuid: string} | {kind: "topology"; uuid: string},
    visited: Set<string>,
    inheritedActivity: DbParticleActivity,
  ): DbWorldParticleDescriptor[] => {
    const childActors = parent.kind === "actor" ? actorsByParentActor.get(parent.uuid) ?? [] : actorsByParentTopology.get(parent.uuid) ?? []
    const childTopologies = parent.kind === "actor"
      ? topologiesByParentActor.get(parent.uuid) ?? []
      : topologiesByParentTopology.get(parent.uuid) ?? []

    return [
      ...sortByPosition(childTopologies).map((topology) => topologyDescriptor(topology, visited, inheritedActivity)),
      ...sortByPosition(childActors).map((actor) => actorDescriptor(actor, visited, inheritedActivity)),
    ]
  }

  const actorDescriptor = (actor: ActorRow, visited: Set<string>, inheritedActivity: DbParticleActivity = "neutral"): DbWorldParticleDescriptor => {
    const key = `actor:${actor.uuid}`
    const activity = activityByParticleId.get(actor.uuid) ?? inheritedActivity
    if (visited.has(key)) {
      return {
        particleId: actor.uuid,
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
      particleId: actor.uuid,
      kind: "wimp",
      src: actor.wimp,
      metaSrc: actor.wimp,
      label: wimpBySrc.get(actor.wimp)?.name ?? actor.wimp,
      ...actorColor,
      activity,
      fields: (fieldsByWimp.get(actor.wimp) ?? [])
        .filter((field) => !structuralFieldKeys.has(`${actor.wimp}\0${field.key}`))
        .map((field) => descriptorField(actor, field)),
      children: childDescriptors({kind: "actor", uuid: actor.uuid}, visited, activity),
    }
  }

  const topologyDescriptor = (topology: TopologyRow, visited: Set<string>, inheritedActivity: DbParticleActivity = "neutral"): DbWorldParticleDescriptor => {
    const key = `topology:${topology.uuid}`
    const label = topologyLabelById.get(topology.uuid) ?? ""
    const activity = activityByParticleId.get(topology.uuid) ?? inheritedActivity
    if (visited.has(key)) {
      return {
        particleId: topology.uuid,
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
      particleId: topology.uuid,
      kind: topology.kind,
      src: null,
      metaSrc: null,
      label,
      ...topologyColors[topology.kind],
      activity,
      fields: [],
      children: childDescriptors({kind: "topology", uuid: topology.uuid}, visited, activity),
    }
  }

  const rootActors = actors.filter((actor) => actor.parentActor === null && actor.parentTopology === null)
  const preferredRoots = rootActors.filter((actor) => actor.wimp === rootSrc)
  const roots = preferredRoots.length > 0 ? preferredRoots : rootActors
  const descriptors = sortByPosition(roots)
    .filter((actor) => actorById.has(actor.uuid))
    .map((actor) => actorDescriptor(actor, new Set()))

  // Keep orphan topologies visible if they ever appear during manual debugging.
  for (const topology of sortByPosition(topologies.filter((item) => item.parentActor === null && item.parentTopology === null))) {
    if (topologyById.has(topology.uuid)) descriptors.push(topologyDescriptor(topology, new Set()))
  }

  return scaleDbWorldRowsToRootOuterDiameter(
    createDbWorldRowsFromParticleDescriptors(rootSrc, descriptors, settings),
    undefined,
    settings,
  )
}
