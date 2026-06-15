import type {SQL} from "bun"

export type BoundaryBulkParticleKind = "wimp" | "fuzzy" | "axion" | "macho"

export type BoundaryBulkRuntimeActor = {
  uuid: string
  parentActor: string | null
  parentTopology: string | null
  wimp: string
  position: number
}

export type BoundaryBulkRuntimeTopology = {
  uuid: string
  parentActor: string | null
  parentTopology: string | null
  kind: BoundaryBulkParticleKind
  position: number
}

export type BoundaryBulkRuntimeMatterParticle = {
  uuid: string
  wimp: string
  parentParticle: string | null
  particleKind: BoundaryBulkParticleKind
  edgeSlot: "root" | "child" | "then" | "else" | "branch"
  particleOrder: number
}

export type BoundaryBulkRuntimeWimp = {
  src: string
  name: string | null
}

export type BoundaryBulkRuntimeField = {
  uuid: string
  wimp: string
  key: string
  type: "string" | "number" | "boolean" | "array" | "enum"
  label: string | null
}

export type BoundaryBulkRuntimeFieldEnumVariant = {
  uuid: string
  field: string
  position: number
  itemValue: string
}

export type BoundaryBulkRuntimeActorValue = {
  actor: string
  field: string
  value: string
}

export type BoundaryBulkRuntimeValue = {
  uuid: string
  kind: "null" | "boolean" | "number" | "string" | "enum" | "list"
  booleanValue: number | null
  numberValue: number | null
  textValue: string | null
  enumValue: string | null
}

export type BoundaryBulkRuntimeValueListItem = {
  value: string
  position: number
  itemValue: string
}

export type BoundaryBulkRuntimeMatterBindingPath = {
  wimp: string
  particle: string
  depOrder: number
  path: string
}

export type BoundaryBulkRuntimeMatterChildBindingPath = BoundaryBulkRuntimeMatterBindingPath & {
  childOrder: number
}

export type BoundaryBulkRuntimeSnapshot = {
  version: 1
  actors: BoundaryBulkRuntimeActor[]
  topologies: BoundaryBulkRuntimeTopology[]
  wimps: BoundaryBulkRuntimeWimp[]
  fields: BoundaryBulkRuntimeField[]
  fieldEnumVariants: BoundaryBulkRuntimeFieldEnumVariant[]
  actorValues: BoundaryBulkRuntimeActorValue[]
  values: BoundaryBulkRuntimeValue[]
  valueItems: BoundaryBulkRuntimeValueListItem[]
  matterParticles: BoundaryBulkRuntimeMatterParticle[]
  matterTopologyBindingPaths: BoundaryBulkRuntimeMatterBindingPath[]
  matterChildWimpBindingPaths: BoundaryBulkRuntimeMatterChildBindingPath[]
}

export async function bulkRuntime(sql: SQL): Promise<BoundaryBulkRuntimeSnapshot> {
  const actors = await sql<BoundaryBulkRuntimeActor[]>`
    SELECT uuid,
           parent_actor AS parentActor,
           parent_topology AS parentTopology,
           wimp,
           position
      FROM actor
     ORDER BY rowid
  `
  const topologies = await sql<BoundaryBulkRuntimeTopology[]>`
    SELECT uuid,
           parent_actor AS parentActor,
           parent_topology AS parentTopology,
           kind,
           position
      FROM topology
     ORDER BY rowid
  `
  const wimps = await sql<BoundaryBulkRuntimeWimp[]>`SELECT src, name FROM wimp`
  const fields = await sql<BoundaryBulkRuntimeField[]>`SELECT uuid, wimp, key, type, label FROM field ORDER BY wimp, rowid`
  const fieldEnumVariants = await sql<BoundaryBulkRuntimeFieldEnumVariant[]>`
    SELECT uuid, field, position, item_value AS itemValue
      FROM field_enum_variant
     ORDER BY field, position
  `
  const actorValues = await sql<BoundaryBulkRuntimeActorValue[]>`SELECT actor, field, value FROM actor_value ORDER BY actor, field`
  const values = await sql<BoundaryBulkRuntimeValue[]>`
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
  const valueItems = await sql<BoundaryBulkRuntimeValueListItem[]>`
    SELECT value, position, item_value AS itemValue
      FROM value_list_item
     ORDER BY value, position
  `
  const matterParticles = await sql<BoundaryBulkRuntimeMatterParticle[]>`
    SELECT uuid,
           wimp,
           parent_particle AS parentParticle,
           particle_kind AS particleKind,
           edge_slot AS edgeSlot,
           particle_order AS particleOrder
      FROM matter_particle
     ORDER BY wimp, rowid
  `
  const matterTopologyBindingPaths = await sql<BoundaryBulkRuntimeMatterBindingPath[]>`
    SELECT matter_particle.wimp AS wimp,
           matter_particle_fuzzy.particle AS particle,
           matter_binding_dep.dep_order AS depOrder,
           matter_binding_dep.path AS path
      FROM matter_particle_fuzzy
      JOIN matter_particle ON matter_particle.uuid = matter_particle_fuzzy.particle
      JOIN matter_binding_dep ON matter_binding_dep.binding = matter_particle_fuzzy.predicate_binding
    UNION ALL
    SELECT matter_particle.wimp AS wimp,
           matter_particle_axion.particle AS particle,
           matter_binding_dep.dep_order AS depOrder,
           matter_binding_dep.path AS path
      FROM matter_particle_axion
      JOIN matter_particle ON matter_particle.uuid = matter_particle_axion.particle
      JOIN matter_binding_dep ON matter_binding_dep.binding = matter_particle_axion.predicate_binding
    UNION ALL
    SELECT matter_particle.wimp AS wimp,
           matter_particle_macho.particle AS particle,
           matter_binding_dep.dep_order AS depOrder,
           matter_binding_dep.path AS path
      FROM matter_particle_macho
      JOIN matter_particle ON matter_particle.uuid = matter_particle_macho.particle
      JOIN matter_binding_dep ON matter_binding_dep.binding = matter_particle_macho.collection_binding
     ORDER BY particle, depOrder
  `
  const matterChildWimpBindingPaths = await sql<BoundaryBulkRuntimeMatterChildBindingPath[]>`
    SELECT matter_particle.wimp AS wimp,
           matter_particle.parent_particle AS particle,
           matter_particle.particle_order AS childOrder,
           matter_binding_dep.dep_order AS depOrder,
           matter_binding_dep.path AS path
      FROM matter_particle
      JOIN matter_particle_wimp ON matter_particle_wimp.particle = matter_particle.uuid
      JOIN matter_binding_dep ON matter_binding_dep.binding = matter_particle_wimp.fields_binding
     WHERE matter_particle.parent_particle IS NOT NULL
     ORDER BY particle, childOrder, depOrder
  `

  return {
    version: 1,
    actors,
    topologies,
    wimps,
    fields,
    fieldEnumVariants,
    actorValues,
    values,
    valueItems,
    matterParticles,
    matterTopologyBindingPaths,
    matterChildWimpBindingPaths,
  }
}
