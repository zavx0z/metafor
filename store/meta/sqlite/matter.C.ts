import type { SQL } from "bun"
import type { MetaDSL, NodeType } from "../../.."
import type { BindingValue, EdgeSlot, FieldUuidByKey, ParticleKind } from "./matter.t.ts"

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

const createContinuationSrc = (expr: string | undefined, value: string | number): string => {
  if (!expr) return String(value)

  const escaped = expr.replaceAll("\\", "\\\\").replaceAll("`", "\\`")
  return String(new Function("_", `return \`${escaped}\``)([value]))
}

const resolveMatterEnumValues = (meta: MetaDSL, path: string): Array<string | number> => {
  if (!path.startsWith("/value/")) return []

  const fieldKey = path.slice("/value/".length)
  const field = meta.fields?.[fieldKey]
  if (!field || field.type !== "enum") return []
  return [...(field.values ?? [])]
}

const resolveDynamicMetaSrcs = (
  meta: MetaDSL,
  value: Exclude<BindingValue, string> | undefined,
): string[] => {
  if (!value || typeof value !== "object") return []

  const paths = toBindingPaths(value)
  const firstPath = paths[0]
  if (!firstPath) return []

  return resolveMatterEnumValues(meta, firstPath).map((variant) => createContinuationSrc(value.expr, variant))
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

const projectParticleChildren = async (
  sql: SQL,
  meta: MetaDSL,
  metaSrc: string,
  children: NodeType[] | undefined,
  parentParticle: string,
): Promise<void> => {
  if (!Array.isArray(children) || children.length === 0) return
  for (let index = 0; index < children.length; index++) {
    await projectParticleNode(sql, meta, metaSrc, children[index]!, parentParticle, "child", index)
  }
}

const projectParticleNode = async (
  sql: SQL,
  meta: MetaDSL,
  metaSrc: string,
  node: NodeType,
  parentParticle: string | null,
  edgeSlot: EdgeSlot,
  particleOrder: number,
): Promise<void> => {
  if (!["meta", "cond", "log", "map"].includes(node.type)) {
    throw new Error(`Unsupported matter node type "${node.type}" for canonical SQLite particle relation`)
  }

  if (node.type === "meta") {
    const metaNode = node as {
      src: BindingValue
      fields?: BindingValue
      mass?: BindingValue
      child?: NodeType[]
    }
    const fieldsBinding = await insertBinding(sql, metaSrc, metaNode.fields)
    const massBinding = await insertBinding(sql, metaSrc, metaNode.mass)

    if (typeof metaNode.src === "string") {
      const wimpParticle = await insertWimpParticle(
        sql,
        metaSrc,
        parentParticle,
        edgeSlot,
        particleOrder,
        metaNode.src,
        fieldsBinding,
        massBinding,
      )
      await projectParticleChildren(sql, meta, metaSrc, metaNode.child, wimpParticle)
      return
    }

    const fuzzyParticle = await insertDynamicMetaFuzzyParticle(sql, metaSrc, parentParticle, edgeSlot, particleOrder)
    const dynamicSrcs = resolveDynamicMetaSrcs(meta, metaNode.src)
    for (let branchOrder = 0; branchOrder < dynamicSrcs.length; branchOrder++) {
      const resolvedSrc = dynamicSrcs[branchOrder]!
      const branchWimp = await insertWimpParticle(
        sql,
        metaSrc,
        fuzzyParticle,
        "branch",
        branchOrder,
        resolvedSrc,
        fieldsBinding,
        massBinding,
      )
      await projectParticleChildren(sql, meta, metaSrc, metaNode.child, branchWimp)
    }
    return
  }

  if (node.type === "cond") {
    const conditionNode = node as { data: string | string[]; expr?: string; child?: NodeType[] }
    const predicateBinding = await insertBinding(
      sql,
      metaSrc,
      conditionNode.expr !== undefined ? { data: conditionNode.data, expr: conditionNode.expr } : { data: conditionNode.data },
    )
    if (!predicateBinding) {
      throw new Error(`Condition particle for meta "${metaSrc}" requires predicate binding`)
    }

    const fuzzyParticle = await insertCondFuzzyParticle(sql, metaSrc, parentParticle, edgeSlot, particleOrder, predicateBinding)
    if (Array.isArray(conditionNode.child)) {
      if (conditionNode.child[0]) await projectParticleNode(sql, meta, metaSrc, conditionNode.child[0], fuzzyParticle, "then", 0)
      if (conditionNode.child[1]) await projectParticleNode(sql, meta, metaSrc, conditionNode.child[1], fuzzyParticle, "else", 1)
    }
    return
  }

  if (node.type === "log") {
    const logicalNode = node as { data: string | string[]; expr?: string; child?: NodeType[] }
    const predicateBinding = await insertBinding(
      sql,
      metaSrc,
      logicalNode.expr !== undefined ? { data: logicalNode.data, expr: logicalNode.expr } : { data: logicalNode.data },
    )
    if (!predicateBinding) {
      throw new Error(`Logical particle for meta "${metaSrc}" requires predicate binding`)
    }

    const axionParticle = await insertParticle(sql, metaSrc, "axion", parentParticle, edgeSlot, particleOrder)
    await sql`
      INSERT INTO matter_particle_axion (particle, predicate_binding)
      VALUES (${axionParticle}, ${predicateBinding})
    `
    await projectParticleChildren(sql, meta, metaSrc, logicalNode.child, axionParticle)
    return
  }

  const mapNode = node as { data: string; child?: NodeType[] }
  const collectionBinding = await insertBinding(sql, metaSrc, { data: mapNode.data })
  if (!collectionBinding) {
    throw new Error(`Map particle for meta "${metaSrc}" requires collection binding`)
  }

  const machoParticle = await insertParticle(sql, metaSrc, "macho", parentParticle, edgeSlot, particleOrder)
  await sql`
    INSERT INTO matter_particle_macho (particle, collection_binding)
    VALUES (${machoParticle}, ${collectionBinding})
  `
  await projectParticleChildren(sql, meta, metaSrc, mapNode.child, machoParticle)
}

export async function createMatter(
  sql: SQL,
  meta: MetaDSL,
  src: string,
  _fieldUuids: FieldUuidByKey,
): Promise<void> {
  if (!meta.matter) return

  const matter = meta.matter ?? []
  for (let index = 0; index < matter.length; index++) {
    await projectParticleNode(sql, meta, src, matter[index]!, null, "root", index)
  }
}
