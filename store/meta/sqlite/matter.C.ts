import type { SQL } from "bun"
import type { BindingValue, EdgeSlot, MatterRelationParticle, ParticleKind } from "./matter.t.ts"

const toBindingPaths = (value: BindingValue): string[] => {
  if (!value || typeof value !== "object" || !("data" in value) || value.data === undefined) return []
  return Array.isArray(value.data) ? value.data : [value.data]
}

const insertBinding = async (sql: SQL, src: string, value: BindingValue | undefined): Promise<string | undefined> => {
  if (value === undefined) return

  const uuid = crypto.randomUUID()

  if (typeof value === "string") {
    await sql`
      INSERT INTO matter_binding (uuid, meta, binding_kind, literal_kind, literal_text)
      VALUES (${uuid}, ${src}, ${"static"}, ${"text"}, ${value})
    `
    return uuid
  }

  const paths = toBindingPaths(value)
  if (value.expr !== undefined) {
    await sql`
      INSERT INTO matter_binding (uuid, meta, binding_kind, expr)
      VALUES (${uuid}, ${src}, ${"dynamic"}, ${value.expr})
    `
  } else {
    await sql`
      INSERT INTO matter_binding (uuid, meta, binding_kind)
      VALUES (${uuid}, ${src}, ${"variable"})
    `
  }

  for (let index = 0; index < paths.length; index++) {
    const path = paths[index]!
    await sql`INSERT INTO matter_binding_dep (binding, dep_order, path) VALUES (${uuid}, ${index}, ${path})`
  }

  return uuid
}

const insertParticle = async (
  sql: SQL,
  metaSrc: string,
  particleKind: ParticleKind,
  parentParticle: string | null,
  edgeSlot: EdgeSlot,
  particleOrder: number,
): Promise<string> => {
  const particleUuid = crypto.randomUUID()
  await sql`
    INSERT INTO matter_particle (uuid, meta, parent_particle, particle_kind, edge_slot, particle_order)
    VALUES (${particleUuid}, ${metaSrc}, ${parentParticle}, ${particleKind}, ${edgeSlot}, ${particleOrder})
  `
  return particleUuid
}

const requireBinding = (binding: string | undefined, message: string): string => {
  if (!binding) throw new Error(message)
  return binding
}

const insertWimpParticle = async (
  sql: SQL,
  metaSrc: string,
  parentParticle: string | null,
  edgeSlot: EdgeSlot,
  particleOrder: number,
  wimpSrc: string,
  fieldsBinding: string | undefined,
  massBinding: string | undefined,
): Promise<string> => {
  const particleUuid = await insertParticle(sql, metaSrc, "wimp", parentParticle, edgeSlot, particleOrder)
  await sql`
    INSERT INTO matter_particle_wimp (particle, src, fields_binding, mass_binding)
    VALUES (${particleUuid}, ${wimpSrc}, ${fieldsBinding ?? null}, ${massBinding ?? null})
  `
  return particleUuid
}

const insertCondFuzzyParticle = async (
  sql: SQL,
  metaSrc: string,
  parentParticle: string | null,
  edgeSlot: EdgeSlot,
  particleOrder: number,
  predicateBinding: string,
): Promise<string> => {
  const particleUuid = await insertParticle(sql, metaSrc, "fuzzy", parentParticle, edgeSlot, particleOrder)
  await sql`
    INSERT INTO matter_particle_fuzzy (particle, fuzzy_kind, predicate_binding)
    VALUES (${particleUuid}, ${"cond"}, ${predicateBinding})
  `
  return particleUuid
}

const insertDynamicMetaFuzzyParticle = async (
  sql: SQL,
  metaSrc: string,
  parentParticle: string | null,
  edgeSlot: EdgeSlot,
  particleOrder: number,
): Promise<string> => {
  const particleUuid = await insertParticle(sql, metaSrc, "fuzzy", parentParticle, edgeSlot, particleOrder)
  await sql`
    INSERT INTO matter_particle_fuzzy (particle, fuzzy_kind, predicate_binding)
    VALUES (${particleUuid}, ${"dynamic-meta"}, ${null})
  `
  return particleUuid
}

const insertRelationParticle = async (
  sql: SQL,
  metaSrc: string,
  particle: MatterRelationParticle,
  parentParticle: string | null,
  edgeSlot: EdgeSlot,
  particleOrder: number,
): Promise<void> => {
  if (particle.kind === "wimp") {
    const fieldsBinding = await insertBinding(sql, metaSrc, particle.fieldsBinding)
    const massBinding = await insertBinding(sql, metaSrc, particle.massBinding)
    const particleUuid = await insertWimpParticle(
      sql,
      metaSrc,
      parentParticle,
      edgeSlot,
      particleOrder,
      particle.src,
      fieldsBinding,
      massBinding,
    )
    await insertRelationChildren(sql, metaSrc, particle.children, particleUuid)
    return
  }

  if (particle.kind === "fuzzy") {
    const predicateBinding = await insertBinding(sql, metaSrc, particle.predicateBinding)
    const particleUuid =
      particle.fuzzyKind === "cond"
        ? await insertCondFuzzyParticle(
            sql,
            metaSrc,
            parentParticle,
            edgeSlot,
            particleOrder,
            requireBinding(predicateBinding, `Condition particle for meta "${metaSrc}" requires predicate binding`),
          )
        : await insertDynamicMetaFuzzyParticle(sql, metaSrc, parentParticle, edgeSlot, particleOrder)
    await insertRelationChildren(sql, metaSrc, particle.children, particleUuid)
    return
  }

  if (particle.kind === "axion") {
    const predicateBinding = await insertBinding(sql, metaSrc, particle.predicateBinding)
    if (!predicateBinding) throw new Error(`Axion particle for meta "${metaSrc}" requires predicate binding`)

    const particleUuid = await insertParticle(sql, metaSrc, "axion", parentParticle, edgeSlot, particleOrder)
    await sql`
      INSERT INTO matter_particle_axion (particle, predicate_binding)
      VALUES (${particleUuid}, ${predicateBinding})
    `
    await insertRelationChildren(sql, metaSrc, particle.children, particleUuid)
    return
  }

  const collectionBinding = await insertBinding(sql, metaSrc, particle.collectionBinding)
  if (!collectionBinding) throw new Error(`Macho particle for meta "${metaSrc}" requires collection binding`)

  const particleUuid = await insertParticle(sql, metaSrc, "macho", parentParticle, edgeSlot, particleOrder)
  await sql`
    INSERT INTO matter_particle_macho (particle, collection_binding)
    VALUES (${particleUuid}, ${collectionBinding})
  `
  await insertRelationChildren(sql, metaSrc, particle.children, particleUuid)
}

const insertRelationChildren = async (
  sql: SQL,
  metaSrc: string,
  children: MatterRelationParticle["children"],
  parentParticle: string,
): Promise<void> => {
  if (!Array.isArray(children) || children.length === 0) return

  for (let index = 0; index < children.length; index++) {
    const child = children[index]!
    await insertRelationParticle(sql, metaSrc, child.particle, parentParticle, child.edgeSlot, index)
  }
}

export async function createMatter(
  sql: SQL,
  src: string,
  matter: MatterRelationParticle[],
): Promise<void> {
  for (let index = 0; index < matter.length; index++) {
    await insertRelationParticle(sql, src, matter[index]!, null, "root", index)
  }
}
