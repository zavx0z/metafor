import type {
  DbFieldValueKind,
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
import type {SQL} from "bun"

type ActorRow = {
  uuid: string
  parentActor: string | null
  parentTopology: string | null
  wimp: string
  position: number
}

type TopologyRow = {
  uuid: string
  parentActor: string | null
  parentTopology: string | null
  kind: DbParticleKind
  position: number
}

type MatterParticleRow = {
  uuid: string
  wimp: string
  parentParticle: string | null
  particleKind: DbParticleKind
  edgeSlot: "root" | "child" | "then" | "else" | "branch"
  particleOrder: number
}

type WimpRow = {
  src: string
  name: string | null
}

type FieldRow = {
  uuid: string
  wimp: string
  key: string
  type: "string" | "number" | "boolean" | "array" | "enum"
  label: string | null
}

type ActorValueRow = {
  actor: string
  field: string
  value: string
}

type ValueRow = {
  uuid: string
  kind: "null" | "boolean" | "number" | "string" | "enum" | "list"
  booleanValue: number | null
  numberValue: number | null
  textValue: string | null
  enumValue: string | null
}

type ValueListItemRow = {
  value: string
  position: number
  itemValue: string
}

type MatterBindingPathRow = {
  particle: string
  depOrder: number
  path: string
}

type MatterChildBindingPathRow = MatterBindingPathRow & {
  childOrder: number
}

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

const fieldKeyFromValuePath = (path: string): string | null =>
  path.startsWith("/value/") ? path.slice("/value/".length) : null

export async function buildBoundaryWorldRows(
  sql: SQL,
  rootSrc: string,
  settings: Partial<BulkLayoutSettings> = {},
): Promise<DbWorldRows> {
  const actors = await sql<ActorRow[]>`
    SELECT uuid,
           parent_actor AS parentActor,
           parent_topology AS parentTopology,
           wimp,
           position
      FROM actor
     ORDER BY rowid
  `
  const topologies = await sql<TopologyRow[]>`
    SELECT uuid,
           parent_actor AS parentActor,
           parent_topology AS parentTopology,
           kind,
           position
      FROM topology
     ORDER BY rowid
  `
  const wimps = await sql<WimpRow[]>`SELECT src, name FROM wimp`
  const fields = await sql<FieldRow[]>`SELECT uuid, wimp, key, type, label FROM field ORDER BY wimp, rowid`
  const actorValues = await sql<ActorValueRow[]>`SELECT actor, field, value FROM actor_value ORDER BY actor, field`
  const values = await sql<ValueRow[]>`
    SELECT value.uuid,
           value.kind,
           value_boolean.boolean AS booleanValue,
           value_number.number AS numberValue,
           value_string.text AS textValue,
           field_enum_variant.item_value AS enumValue
      FROM value
      LEFT JOIN value_boolean ON value_boolean.value = value.uuid
      LEFT JOIN value_number ON value_number.value = value.uuid
      LEFT JOIN value_string ON value_string.value = value.uuid
      LEFT JOIN value_enum ON value_enum.value = value.uuid
      LEFT JOIN field_enum_variant ON field_enum_variant.uuid = value_enum.variant
     ORDER BY value.rowid
  `
  const valueItems = await sql<ValueListItemRow[]>`
    SELECT value, position, item_value AS itemValue
      FROM value_list_item
     ORDER BY value, position
  `
  const matterParticles = await sql<MatterParticleRow[]>`
    SELECT uuid,
           wimp,
           parent_particle AS parentParticle,
           particle_kind AS particleKind,
           edge_slot AS edgeSlot,
           particle_order AS particleOrder
      FROM matter_particle
     ORDER BY wimp, rowid
  `
  const matterTopologyBindingPaths = await sql<MatterBindingPathRow[]>`
    SELECT matter_particle_fuzzy.particle AS particle,
           matter_binding_dep.dep_order AS depOrder,
           matter_binding_dep.path AS path
      FROM matter_particle_fuzzy
      JOIN matter_binding_dep ON matter_binding_dep.binding = matter_particle_fuzzy.predicate_binding
    UNION ALL
    SELECT matter_particle_axion.particle AS particle,
           matter_binding_dep.dep_order AS depOrder,
           matter_binding_dep.path AS path
      FROM matter_particle_axion
      JOIN matter_binding_dep ON matter_binding_dep.binding = matter_particle_axion.predicate_binding
    UNION ALL
    SELECT matter_particle_macho.particle AS particle,
           matter_binding_dep.dep_order AS depOrder,
           matter_binding_dep.path AS path
      FROM matter_particle_macho
      JOIN matter_binding_dep ON matter_binding_dep.binding = matter_particle_macho.collection_binding
     ORDER BY particle, depOrder
  `
  const matterChildWimpBindingPaths = await sql<MatterChildBindingPathRow[]>`
    SELECT matter_particle.parent_particle AS particle,
           matter_particle.particle_order AS childOrder,
           matter_binding_dep.dep_order AS depOrder,
           matter_binding_dep.path AS path
      FROM matter_particle
      JOIN matter_particle_wimp ON matter_particle_wimp.particle = matter_particle.uuid
      JOIN matter_binding_dep ON matter_binding_dep.binding = matter_particle_wimp.fields_binding
     WHERE matter_particle.parent_particle IS NOT NULL
     ORDER BY particle, childOrder, depOrder
  `

  const actorById = new Map(actors.map((actor) => [actor.uuid, actor] as const))
  const topologyById = new Map(topologies.map((topology) => [topology.uuid, topology] as const))
  const wimpBySrc = new Map(wimps.map((wimp) => [wimp.src, wimp] as const))
  const fieldsByWimp = group(fields, (field) => field.wimp)
  const fieldByWimpKey = new Map(fields.map((field) => [`${field.wimp}\0${field.key}`, field] as const))
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
  const topologyLabelById = new Map<string, string>()

  const matterTopologyChildren = (wimp: string, parentParticle: string | null): MatterParticleRow[] =>
    sortMatterParticles(matterParticlesByWimpParent.get(`${wimp}\0${parentParticle ?? ""}`) ?? [])
      .filter((particle) => particle.particleKind !== "wimp")

  const fieldLabelFromPath = (wimp: string, path: string): string | null => {
    const key = fieldKeyFromValuePath(path)
    if (!key) return null
    const field = fieldByWimpKey.get(`${wimp}\0${key}`)
    return field?.label ?? field?.key ?? key
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
    return firstFieldLabelFromPaths(wimp, childPaths) ??
      firstFieldLabelFromPaths(wimp, sortBindingPaths(matterTopologyBindingPathsByParticle.get(plan.uuid) ?? []).map((row) => row.path))
  }

  const assignTopologyLabels = (wimp: string, runtimeTopologies: TopologyRow[], parentMatterParticle: string | null): void => {
    const plans = matterTopologyChildren(wimp, parentMatterParticle)
    const runtime = sortByPosition(runtimeTopologies)
    for (let index = 0; index < runtime.length; index++) {
      const topology = runtime[index]!
      const plan = plans[index]
      if (!plan) continue
      const label = topologyPlanLabel(wimp, plan)
      if (label !== null) topologyLabelById.set(topology.uuid, label)
      assignTopologyLabels(wimp, topologiesByParentTopology.get(topology.uuid) ?? [], plan.uuid)
    }
  }

  for (const actor of actors) {
    assignTopologyLabels(actor.wimp, topologiesByParentActor.get(actor.uuid) ?? [], null)
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
  ): DbWorldParticleDescriptor[] => {
    const childActors = parent.kind === "actor" ? actorsByParentActor.get(parent.uuid) ?? [] : actorsByParentTopology.get(parent.uuid) ?? []
    const childTopologies = parent.kind === "actor"
      ? topologiesByParentActor.get(parent.uuid) ?? []
      : topologiesByParentTopology.get(parent.uuid) ?? []

    return [
      ...sortByPosition(childTopologies).map((topology) => topologyDescriptor(topology, visited)),
      ...sortByPosition(childActors).map((actor) => actorDescriptor(actor, visited)),
    ]
  }

  const actorDescriptor = (actor: ActorRow, visited: Set<string>): DbWorldParticleDescriptor => {
    const key = `actor:${actor.uuid}`
    if (visited.has(key)) {
      return {
        particleId: actor.uuid,
        kind: "wimp",
        src: actor.wimp,
        metaSrc: actor.wimp,
        label: wimpBySrc.get(actor.wimp)?.name ?? actor.wimp,
        ...actorColor,
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
      fields: (fieldsByWimp.get(actor.wimp) ?? []).map((field) => descriptorField(actor, field)),
      children: childDescriptors({kind: "actor", uuid: actor.uuid}, visited),
    }
  }

  const topologyDescriptor = (topology: TopologyRow, visited: Set<string>): DbWorldParticleDescriptor => {
    const key = `topology:${topology.uuid}`
    const label = topologyLabelById.get(topology.uuid) ?? topology.kind
    if (visited.has(key)) {
      return {
        particleId: topology.uuid,
        kind: topology.kind,
        src: null,
        metaSrc: null,
        label,
        ...topologyColors[topology.kind],
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
      fields: [],
      children: childDescriptors({kind: "topology", uuid: topology.uuid}, visited),
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
