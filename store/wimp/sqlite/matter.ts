import type {SQL} from "bun"
import type {
  AxionParticleRow,
  BindingRow,
  BindingValue,
  EdgeSlot,
  FuzzyParticleRow,
  MachoParticleRow,
  MatterRelationBindingValue,
  MatterRelationParticle,
  ParticleKind,
  ParticleRow,
  WimpParticleRow,
} from "./matter.t.ts"
import type {Wimp} from "./wimp.ts"

const hasMatter = async (sql: SQL, src: string): Promise<boolean> => {
  const rows = await sql`SELECT 1 AS one FROM matter_particle WHERE wimp = ${src} LIMIT 1`
  return rows.length > 0
}

const toBindingPaths = (value: BindingValue): string[] => {
  if (!value || typeof value !== "object" || !("data" in value) || value.data === undefined) return []
  return Array.isArray(value.data) ? value.data : [value.data]
}

const insertBinding = async (sql: SQL, src: string, value: BindingValue | undefined): Promise<string | undefined> => {
  if (value === undefined) return

  const uuid = crypto.randomUUID()

  if (typeof value === "string") {
    await sql`
      INSERT INTO matter_binding (uuid, wimp, binding_kind, literal_kind, literal_text)
      VALUES (${uuid}, ${src}, ${"static"}, ${"text"}, ${value})
    `
    return uuid
  }

  const paths = toBindingPaths(value)
  if (value.expr !== undefined) {
    await sql`
      INSERT INTO matter_binding (uuid, wimp, binding_kind, expr)
      VALUES (${uuid}, ${src}, ${"dynamic"}, ${value.expr})
    `
  } else {
    await sql`
      INSERT INTO matter_binding (uuid, wimp, binding_kind)
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
  wimpSrc: string,
  particleKind: ParticleKind,
  parentParticle: string | null,
  edgeSlot: EdgeSlot,
  particleOrder: number,
): Promise<string> => {
  const particleUuid = crypto.randomUUID()
  await sql`
    INSERT INTO matter_particle (uuid, wimp, parent_particle, particle_kind, edge_slot, particle_order)
    VALUES (${particleUuid}, ${wimpSrc}, ${parentParticle}, ${particleKind}, ${edgeSlot}, ${particleOrder})
  `
  return particleUuid
}

const requireBinding = (binding: string | undefined, message: string): string => {
  if (!binding) throw new Error(message)
  return binding
}

const insertWimpParticle = async (
  sql: SQL,
  wimpSrc: string,
  parentParticle: string | null,
  edgeSlot: EdgeSlot,
  particleOrder: number,
  childWimpSrc: string,
  fieldsBinding: string | undefined,
  massBinding: string | undefined,
): Promise<string> => {
  const particleUuid = await insertParticle(sql, wimpSrc, "wimp", parentParticle, edgeSlot, particleOrder)
  await sql`
    INSERT INTO matter_particle_wimp (particle, src, fields_binding, mass_binding)
    VALUES (${particleUuid}, ${childWimpSrc}, ${fieldsBinding ?? null}, ${massBinding ?? null})
  `
  return particleUuid
}

const insertCondFuzzyParticle = async (
  sql: SQL,
  wimpSrc: string,
  parentParticle: string | null,
  edgeSlot: EdgeSlot,
  particleOrder: number,
  predicateBinding: string,
): Promise<string> => {
  const particleUuid = await insertParticle(sql, wimpSrc, "fuzzy", parentParticle, edgeSlot, particleOrder)
  await sql`
    INSERT INTO matter_particle_fuzzy (particle, fuzzy_kind, predicate_binding)
    VALUES (${particleUuid}, ${"cond"}, ${predicateBinding})
  `
  return particleUuid
}

const insertDynamicMetaFuzzyParticle = async (
  sql: SQL,
  wimpSrc: string,
  parentParticle: string | null,
  edgeSlot: EdgeSlot,
  particleOrder: number,
): Promise<string> => {
  const particleUuid = await insertParticle(sql, wimpSrc, "fuzzy", parentParticle, edgeSlot, particleOrder)
  await sql`
    INSERT INTO matter_particle_fuzzy (particle, fuzzy_kind, predicate_binding)
    VALUES (${particleUuid}, ${"dynamic-meta"}, ${null})
  `
  return particleUuid
}

const insertRelationParticle = async (
  sql: SQL,
  wimpSrc: string,
  particle: MatterRelationParticle,
  parentParticle: string | null,
  edgeSlot: EdgeSlot,
  particleOrder: number,
): Promise<void> => {
  if (particle.kind === "wimp") {
    const fieldsBinding = await insertBinding(sql, wimpSrc, particle.fieldsBinding)
    const massBinding = await insertBinding(sql, wimpSrc, particle.massBinding)
    const particleUuid = await insertWimpParticle(
      sql,
      wimpSrc,
      parentParticle,
      edgeSlot,
      particleOrder,
      particle.src,
      fieldsBinding,
      massBinding,
    )
    await insertRelationChildren(sql, wimpSrc, particle.children, particleUuid)
    return
  }

  if (particle.kind === "fuzzy") {
    const predicateBinding = await insertBinding(sql, wimpSrc, particle.predicateBinding)
    const particleUuid =
      particle.fuzzyKind === "cond"
        ? await insertCondFuzzyParticle(
            sql,
            wimpSrc,
            parentParticle,
            edgeSlot,
            particleOrder,
            requireBinding(predicateBinding, `Condition particle for meta "${wimpSrc}" requires predicate binding`),
          )
        : await insertDynamicMetaFuzzyParticle(sql, wimpSrc, parentParticle, edgeSlot, particleOrder)
    await insertRelationChildren(sql, wimpSrc, particle.children, particleUuid)
    return
  }

  if (particle.kind === "axion") {
    const predicateBinding = await insertBinding(sql, wimpSrc, particle.predicateBinding)
    if (!predicateBinding) throw new Error(`Axion particle for meta "${wimpSrc}" requires predicate binding`)

    const particleUuid = await insertParticle(sql, wimpSrc, "axion", parentParticle, edgeSlot, particleOrder)
    await sql`
      INSERT INTO matter_particle_axion (particle, predicate_binding)
      VALUES (${particleUuid}, ${predicateBinding})
    `
    await insertRelationChildren(sql, wimpSrc, particle.children, particleUuid)
    return
  }

  const collectionBinding = await insertBinding(sql, wimpSrc, particle.collectionBinding)
  if (!collectionBinding) throw new Error(`Macho particle for meta "${wimpSrc}" requires collection binding`)

  const particleUuid = await insertParticle(sql, wimpSrc, "macho", parentParticle, edgeSlot, particleOrder)
  await sql`
    INSERT INTO matter_particle_macho (particle, collection_binding)
    VALUES (${particleUuid}, ${collectionBinding})
  `
  await insertRelationChildren(sql, wimpSrc, particle.children, particleUuid)
}

const insertRelationChildren = async (
  sql: SQL,
  wimpSrc: string,
  children: MatterRelationParticle["children"],
  parentParticle: string,
): Promise<void> => {
  if (!Array.isArray(children) || children.length === 0) return

  for (let index = 0; index < children.length; index++) {
    const child = children[index]!
    await insertRelationParticle(sql, wimpSrc, child.particle, parentParticle, child.edgeSlot, index)
  }
}

const toMaybeArray = (values: string[]): string | string[] => (values.length === 1 ? values[0]! : values)

const particleEdgeSlotOrder: Record<ParticleRow["edge_slot"], number> = {
  root: 0,
  branch: 0,
  child: 0,
  then: 0,
  else: 1,
}

const getParticleBindings = async (sql: SQL, src: string) => {
  const bindingRows = new Map(
    (
      await sql<BindingRow[]>`
        SELECT uuid, binding_kind, literal_kind, literal_text, literal_boolean, expr
        FROM matter_binding
        WHERE wimp = ${src}
      `
    ).map((row) => [row.uuid, row]),
  )

  const bindingDeps = new Map<string, string[]>()
  const depRows = await sql<Array<{binding: string; dep_order: number; path: string}>>`
    SELECT binding, dep_order, path
    FROM matter_binding_dep
    WHERE binding IN (SELECT uuid FROM matter_binding WHERE wimp = ${src})
    ORDER BY dep_order
  `

  for (const row of depRows) {
    const deps = bindingDeps.get(row.binding) ?? []
    deps.push(row.path)
    bindingDeps.set(row.binding, deps)
  }

  const cache = new Map<string, MatterRelationBindingValue | undefined>()
  const getBinding = (bindingId: string | null | undefined): MatterRelationBindingValue | undefined => {
    if (!bindingId) return
    if (cache.has(bindingId)) return cache.get(bindingId)

    const row = bindingRows.get(bindingId)
    if (!row) return

    let value: MatterRelationBindingValue | undefined
    if (row.binding_kind === "static") {
      if (row.literal_kind === "boolean") {
        throw new Error(`Boolean matter binding "${bindingId}" is not supported in particle relation runtime`)
      }
      value = row.literal_text ?? ""
    } else {
      const deps = bindingDeps.get(bindingId) ?? []
      value = row.expr !== null ? {...(deps.length > 0 ? {data: toMaybeArray(deps)} : {}), expr: row.expr} : {data: toMaybeArray(deps)}
    }

    cache.set(bindingId, value)
    return value
  }

  return {getBinding}
}

const buildParticleModel = (
  row: ParticleRow,
  rowsByParent: Map<string | null, ParticleRow[]>,
  wimpRows: Map<string, WimpParticleRow>,
  fuzzyRows: Map<string, FuzzyParticleRow>,
  axionRows: Map<string, AxionParticleRow>,
  machoRows: Map<string, MachoParticleRow>,
  getBinding: (bindingId: string | null | undefined) => MatterRelationBindingValue | undefined,
): MatterRelationParticle => {
  const children = (rowsByParent.get(row.uuid) ?? []).map((child) => ({
    edgeSlot: child.edge_slot === "root" ? "child" : child.edge_slot,
    particle: buildParticleModel(child, rowsByParent, wimpRows, fuzzyRows, axionRows, machoRows, getBinding),
  }))

  if (row.particle_kind === "wimp") {
    const wimpRow = wimpRows.get(row.uuid)
    if (!wimpRow) throw new Error(`Wimp particle row "${row.uuid}" is not found in canonical SQLite projection`)
    const fieldsBinding = wimpRow.fields_binding !== null ? getBinding(wimpRow.fields_binding) : undefined
    const massBinding = wimpRow.mass_binding !== null ? getBinding(wimpRow.mass_binding) : undefined

    return {
      kind: "wimp",
      src: wimpRow.src,
      ...(fieldsBinding !== undefined ? {fieldsBinding} : {}),
      ...(massBinding !== undefined ? {massBinding} : {}),
      ...(children.length > 0 ? {children} : {}),
    }
  }

  if (row.particle_kind === "fuzzy") {
    const fuzzyRow = fuzzyRows.get(row.uuid)
    if (!fuzzyRow) throw new Error(`Fuzzy particle row "${row.uuid}" is not found in canonical SQLite projection`)
    const predicateBinding =
      fuzzyRow.predicate_binding !== null ? getBinding(fuzzyRow.predicate_binding) : undefined

    return {
      kind: "fuzzy",
      fuzzyKind: fuzzyRow.fuzzy_kind,
      ...(predicateBinding !== undefined ? {predicateBinding} : {}),
      ...(children.length > 0 ? {children} : {}),
    }
  }

  if (row.particle_kind === "axion") {
    const axionRow = axionRows.get(row.uuid)
    if (!axionRow) throw new Error(`Axion particle row "${row.uuid}" is not found in canonical SQLite projection`)

    return {
      kind: "axion",
      predicateBinding: getBinding(axionRow.predicate_binding) ?? {data: []},
      ...(children.length > 0 ? {children} : {}),
    }
  }

  const machoRow = machoRows.get(row.uuid)
  if (!machoRow) throw new Error(`Macho particle row "${row.uuid}" is not found in canonical SQLite projection`)

  return {
    kind: "macho",
    collectionBinding: getBinding(machoRow.collection_binding) ?? {data: []},
    ...(children.length > 0 ? {children} : {}),
  }
}

const getMatterParticles = async (sql: SQL, src: string): Promise<MatterRelationParticle[]> => {
  const {getBinding} = await getParticleBindings(sql, src)

  const particleRows = await sql<ParticleRow[]>`
    SELECT uuid, parent_particle, particle_kind, edge_slot, particle_order
    FROM matter_particle
    WHERE wimp = ${src}
    ORDER BY CASE WHEN parent_particle IS NULL THEN 0 ELSE 1 END, particle_order, rowid
  `

  const rowsByParent = new Map<string | null, ParticleRow[]>()
  for (const row of particleRows) {
    const rows = rowsByParent.get(row.parent_particle) ?? []
    rows.push(row)
    rowsByParent.set(row.parent_particle, rows)
  }

  rowsByParent.forEach((rows) => {
    rows.sort(
      (left, right) =>
        particleEdgeSlotOrder[left.edge_slot] - particleEdgeSlotOrder[right.edge_slot] ||
        left.particle_order - right.particle_order,
    )
  })

  const wimpRows = new Map(
    (
      await sql<WimpParticleRow[]>`
        SELECT particle, src, fields_binding, mass_binding
        FROM matter_particle_wimp
        WHERE particle IN (SELECT uuid FROM matter_particle WHERE wimp = ${src})
      `
    ).map((row) => [row.particle, row]),
  )

  const fuzzyRows = new Map(
    (
      await sql<FuzzyParticleRow[]>`
        SELECT particle, fuzzy_kind, predicate_binding
        FROM matter_particle_fuzzy
        WHERE particle IN (SELECT uuid FROM matter_particle WHERE wimp = ${src})
      `
    ).map((row) => [row.particle, row]),
  )

  const axionRows = new Map(
    (
      await sql<AxionParticleRow[]>`
        SELECT particle, predicate_binding
        FROM matter_particle_axion
        WHERE particle IN (SELECT uuid FROM matter_particle WHERE wimp = ${src})
      `
    ).map((row) => [row.particle, row]),
  )

  const machoRows = new Map(
    (
      await sql<MachoParticleRow[]>`
        SELECT particle, collection_binding
        FROM matter_particle_macho
        WHERE particle IN (SELECT uuid FROM matter_particle WHERE wimp = ${src})
      `
    ).map((row) => [row.particle, row]),
  )

  return (rowsByParent.get(null) ?? []).map((row) =>
    buildParticleModel(row, rowsByParent, wimpRows, fuzzyRows, axionRows, machoRows, getBinding),
  )
}

export class Matter {
  constructor(readonly wimp: Wimp) {}

  async create(particles: MatterRelationParticle[]): Promise<void> {
    for (let index = 0; index < particles.length; index++) {
      await insertRelationParticle(this.wimp.sql, this.wimp.src, particles[index]!, null, "root", index)
    }
  }

  async all(): Promise<MatterRelationParticle[]> {
    if (!(await hasMatter(this.wimp.sql, this.wimp.src))) return []
    return getMatterParticles(this.wimp.sql, this.wimp.src)
  }

  async count(): Promise<number> {
    if (!(await hasMatter(this.wimp.sql, this.wimp.src))) return 0
    return (await getMatterParticles(this.wimp.sql, this.wimp.src)).length
  }

  async exists(): Promise<boolean> {
    return hasMatter(this.wimp.sql, this.wimp.src)
  }
}
