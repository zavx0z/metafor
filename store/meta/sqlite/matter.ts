import type { Database } from "bun:sqlite"
import type { MetaDSL, NodeType } from "../../.."

type BindingValue =
  | string
  | {
      data?: string | string[]
      expr?: string
    }

type ParticleKind = "wimp" | "fuzzy" | "axion" | "macho"
type EdgeSlot = "root" | "child" | "then" | "else" | "branch"

const toBindingPaths = (value: BindingValue): string[] => {
  if (!value || typeof value !== "object" || !("data" in value) || value.data === undefined) return []
  return Array.isArray(value.data) ? value.data : [value.data]
}

const insertBinding = (db: Database, src: string, value: BindingValue | undefined): string | undefined => {
  if (value === undefined) return

  const uuid = crypto.randomUUID()

  if (typeof value === "string") {
    db.query(
      "INSERT INTO matter_binding (uuid, meta, binding_kind, literal_kind, literal_text) VALUES (?, ?, ?, ?, ?)",
    ).run(uuid, src, "static", "text", value)
    return uuid
  }

  const paths = toBindingPaths(value)
  if (value.expr !== undefined) {
    db.query("INSERT INTO matter_binding (uuid, meta, binding_kind, expr) VALUES (?, ?, ?, ?)")
      .run(uuid, src, "dynamic", value.expr)
  } else {
    db.query("INSERT INTO matter_binding (uuid, meta, binding_kind) VALUES (?, ?, ?)")
      .run(uuid, src, "variable")
  }

  paths.forEach((path, index) => {
    db.query("INSERT INTO matter_binding_dep (binding, dep_order, path) VALUES (?, ?, ?)")
      .run(uuid, index, path)
  })

  return uuid
}

const insertParticle = (
  db: Database,
  metaSrc: string,
  particleKind: ParticleKind,
  parentParticle: string | null,
  edgeSlot: EdgeSlot,
  particleOrder: number,
): string => {
  const particleUuid = crypto.randomUUID()
  db.query(
    `INSERT INTO matter_particle (uuid, meta, parent_particle, particle_kind, edge_slot, particle_order)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(particleUuid, metaSrc, parentParticle, particleKind, edgeSlot, particleOrder)
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

const insertWimpParticle = (
  db: Database,
  metaSrc: string,
  parentParticle: string | null,
  edgeSlot: EdgeSlot,
  particleOrder: number,
  wimpSrc: string,
  fieldsBinding: string | undefined,
  massBinding: string | undefined,
): string => {
  const particleUuid = insertParticle(db, metaSrc, "wimp", parentParticle, edgeSlot, particleOrder)
  db.query(
    `INSERT INTO matter_particle_wimp (particle, src, fields_binding, mass_binding)
     VALUES (?, ?, ?, ?)`,
  ).run(particleUuid, wimpSrc, fieldsBinding ?? null, massBinding ?? null)
  return particleUuid
}

const insertCondFuzzyParticle = (
  db: Database,
  metaSrc: string,
  parentParticle: string | null,
  edgeSlot: EdgeSlot,
  particleOrder: number,
  predicateBinding: string,
): string => {
  const particleUuid = insertParticle(db, metaSrc, "fuzzy", parentParticle, edgeSlot, particleOrder)
  db.query(
    `INSERT INTO matter_particle_fuzzy (particle, fuzzy_kind, predicate_binding)
     VALUES (?, ?, ?)`,
  ).run(particleUuid, "cond", predicateBinding)
  return particleUuid
}

const insertDynamicMetaFuzzyParticle = (
  db: Database,
  metaSrc: string,
  parentParticle: string | null,
  edgeSlot: EdgeSlot,
  particleOrder: number,
): string => {
  const particleUuid = insertParticle(db, metaSrc, "fuzzy", parentParticle, edgeSlot, particleOrder)
  db.query(
    `INSERT INTO matter_particle_fuzzy (particle, fuzzy_kind, predicate_binding)
     VALUES (?, ?, ?)`,
  ).run(particleUuid, "dynamic-meta", null)
  return particleUuid
}

const projectParticleChildren = (
  db: Database,
  meta: MetaDSL,
  metaSrc: string,
  children: NodeType[] | undefined,
  parentParticle: string,
): void => {
  if (!Array.isArray(children) || children.length === 0) return
  children.forEach((child, index) => {
    projectParticleNode(db, meta, metaSrc, child, parentParticle, "child", index)
  })
}

const projectParticleNode = (
  db: Database,
  meta: MetaDSL,
  metaSrc: string,
  node: NodeType,
  parentParticle: string | null,
  edgeSlot: EdgeSlot,
  particleOrder: number,
): void => {
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
    const fieldsBinding = insertBinding(db, metaSrc, metaNode.fields)
    const massBinding = insertBinding(db, metaSrc, metaNode.mass)

    if (typeof metaNode.src === "string") {
      const wimpParticle = insertWimpParticle(
        db,
        metaSrc,
        parentParticle,
        edgeSlot,
        particleOrder,
        metaNode.src,
        fieldsBinding,
        massBinding,
      )
      projectParticleChildren(db, meta, metaSrc, metaNode.child, wimpParticle)
      return
    }

    const fuzzyParticle = insertDynamicMetaFuzzyParticle(db, metaSrc, parentParticle, edgeSlot, particleOrder)
    resolveDynamicMetaSrcs(meta, metaNode.src).forEach((resolvedSrc, branchOrder) => {
      const branchWimp = insertWimpParticle(
        db,
        metaSrc,
        fuzzyParticle,
        "branch",
        branchOrder,
        resolvedSrc,
        fieldsBinding,
        massBinding,
      )
      projectParticleChildren(db, meta, metaSrc, metaNode.child, branchWimp)
    })
    return
  }

  if (node.type === "cond") {
    const conditionNode = node as { data: string | string[]; expr?: string; child?: NodeType[] }
    const predicateBinding = insertBinding(
      db,
      metaSrc,
      conditionNode.expr !== undefined ? { data: conditionNode.data, expr: conditionNode.expr } : { data: conditionNode.data },
    )
    if (!predicateBinding) {
      throw new Error(`Condition particle for meta "${metaSrc}" requires predicate binding`)
    }

    const fuzzyParticle = insertCondFuzzyParticle(db, metaSrc, parentParticle, edgeSlot, particleOrder, predicateBinding)
    if (Array.isArray(conditionNode.child)) {
      if (conditionNode.child[0]) projectParticleNode(db, meta, metaSrc, conditionNode.child[0], fuzzyParticle, "then", 0)
      if (conditionNode.child[1]) projectParticleNode(db, meta, metaSrc, conditionNode.child[1], fuzzyParticle, "else", 1)
    }
    return
  }

  if (node.type === "log") {
    const logicalNode = node as { data: string | string[]; expr?: string; child?: NodeType[] }
    const predicateBinding = insertBinding(
      db,
      metaSrc,
      logicalNode.expr !== undefined ? { data: logicalNode.data, expr: logicalNode.expr } : { data: logicalNode.data },
    )
    if (!predicateBinding) {
      throw new Error(`Logical particle for meta "${metaSrc}" requires predicate binding`)
    }

    const axionParticle = insertParticle(db, metaSrc, "axion", parentParticle, edgeSlot, particleOrder)
    db.query(
      `INSERT INTO matter_particle_axion (particle, predicate_binding)
       VALUES (?, ?)`,
    ).run(axionParticle, predicateBinding)
    projectParticleChildren(db, meta, metaSrc, logicalNode.child, axionParticle)
    return
  }

  const mapNode = node as { data: string; child?: NodeType[] }
  const collectionBinding = insertBinding(db, metaSrc, { data: mapNode.data })
  if (!collectionBinding) {
    throw new Error(`Map particle for meta "${metaSrc}" requires collection binding`)
  }

  const machoParticle = insertParticle(db, metaSrc, "macho", parentParticle, edgeSlot, particleOrder)
  db.query(
    `INSERT INTO matter_particle_macho (particle, collection_binding)
     VALUES (?, ?)`,
  ).run(machoParticle, collectionBinding)
  projectParticleChildren(db, meta, metaSrc, mapNode.child, machoParticle)
}

export function relationMatter(
  db: Database,
  meta: MetaDSL,
  src: string,
  _fieldUuids: Map<string, string>,
): void {
  if (!meta.matter) return

  const matter = meta.matter ?? []
  matter.forEach((node: NodeType, index: number) => {
    projectParticleNode(db, meta, src, node, null, "root", index)
  })
}
