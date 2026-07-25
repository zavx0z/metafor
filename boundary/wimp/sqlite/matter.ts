import type {SQL} from "bun"
import type { AxionParticleRow, FuzzyParticleRow, MachoParticleRow, MatterBindingRow, MatterParticleRow, WimpParticleRow } from "@metafor/types/boundary/matter"
import type { MatterBindingValue, MatterDirectMassBinding, MatterEdgeSlot, MatterParticle, MatterParticleKind } from "@metafor/types/metafor/matter"
import type {Wimp} from "./wimp.ts"
import {validateRuntimeMatterBinding} from "./create.ts"

const hasMatter = async (sql: SQL, src: string): Promise<boolean> => {
  const rows = await sql`SELECT 1 AS one FROM matter_particle WHERE wimp = ${src} LIMIT 1`
  return rows.length > 0
}

const toBindingPaths = (value: MatterBindingValue): string[] => {
  if (!value || typeof value !== "object" || !("data" in value) || value.data === undefined) return []
  return Array.isArray(value.data) ? value.data : [value.data]
}

const insertBinding = async (sql: SQL, src: string, value: MatterBindingValue | undefined): Promise<number | undefined> => {
  if (value === undefined) return

  if (typeof value === "string") {
    const row = (await sql<Array<{id: number}>>`
      INSERT INTO matter_binding (wimp, binding_kind, literal_kind, literal_text)
      VALUES (${src}, ${"static"}, ${"text"}, ${value})
      RETURNING id
    `)[0]
    if (!row) throw new Error("insertBinding(static): insert did not return id")
    return row.id
  }

  const paths = toBindingPaths(value)
  let id: number
  if (value.expr !== undefined) {
    const row = (await sql<Array<{id: number}>>`
      INSERT INTO matter_binding (wimp, binding_kind, expr)
      VALUES (${src}, ${"dynamic"}, ${value.expr})
      RETURNING id
    `)[0]
    if (!row) throw new Error("insertBinding(dynamic): insert did not return id")
    id = row.id
  } else {
    const row = (await sql<Array<{id: number}>>`
      INSERT INTO matter_binding (wimp, binding_kind)
      VALUES (${src}, ${"variable"})
      RETURNING id
    `)[0]
    if (!row) throw new Error("insertBinding(variable): insert did not return id")
    id = row.id
  }

  for (let index = 0; index < paths.length; index++) {
    const path = paths[index]!
    await sql`INSERT INTO matter_binding_dep (binding, dep_order, path) VALUES (${id}, ${index}, ${path})`
  }
  if (value.directMass !== undefined) {
    await sql`INSERT INTO matter_binding_direct_mass (binding, kind) VALUES (${id}, ${value.directMass.kind})`
    if (value.directMass.kind === "keys") for (const [index, entry] of value.directMass.entries.entries()) {
      await sql`INSERT INTO matter_binding_direct_mass_key (binding, key_order, target_key, source_key) VALUES (${id}, ${index}, ${entry.target}, ${entry.source})`
    }
  }

  return id
}

const insertParticle = async (
  sql: SQL,
  wimpSrc: string,
  particleKind: MatterParticleKind,
  parentParticle: number | null,
  edgeSlot: MatterEdgeSlot,
  particleOrder: number,
): Promise<number> => {
  const row = (await sql<Array<{id: number}>>`
    INSERT INTO matter_particle (wimp, parent_particle, particle_kind, edge_slot, particle_order)
    VALUES (${wimpSrc}, ${parentParticle}, ${particleKind}, ${edgeSlot}, ${particleOrder})
    RETURNING id
  `)[0]
  if (!row) throw new Error("insertParticle: insert did not return id")
  return row.id
}

const requireBinding = (binding: number | undefined, message: string): number => {
  if (!binding) throw new Error(message)
  return binding
}

const insertWimpParticle = async (
  sql: SQL,
  wimpSrc: string,
  parentParticle: number | null,
  edgeSlot: MatterEdgeSlot,
  particleOrder: number,
  childWimpSrc: string,
  fieldsBinding: number | undefined,
  massBinding: number | undefined,
  energyBinding: number | undefined,
): Promise<number> => {
  const particleId = await insertParticle(sql, wimpSrc, "wimp", parentParticle, edgeSlot, particleOrder)
  await sql`
    INSERT INTO matter_particle_wimp (particle, src, fields_binding, mass_binding, energy_binding)
    VALUES (${particleId}, ${childWimpSrc}, ${fieldsBinding ?? null}, ${massBinding ?? null}, ${energyBinding ?? null})
  `
  return particleId
}

const insertDynamicMetaFuzzyParticle = async (
  sql: SQL,
  wimpSrc: string,
  parentParticle: number | null,
  edgeSlot: MatterEdgeSlot,
  particleOrder: number,
  predicateBinding: number,
): Promise<number> => {
  const particleId = await insertParticle(sql, wimpSrc, "fuzzy", parentParticle, edgeSlot, particleOrder)
  await sql`
    INSERT INTO matter_particle_fuzzy (particle, fuzzy_kind, predicate_binding)
    VALUES (${particleId}, ${"dynamic-meta"}, ${predicateBinding})
  `
  return particleId
}

const countRootParticles = async (sql: SQL, wimpSrc: string): Promise<number> => {
  const rows = await sql<Array<{n: number}>>`
    SELECT COUNT(*) AS n FROM matter_particle
    WHERE wimp = ${wimpSrc} AND parent_particle IS NULL
  `
  return rows[0]?.n ?? 0
}

const countChildParticles = async (sql: SQL, parentId: number): Promise<number> => {
  const rows = await sql<Array<{n: number}>>`
    SELECT COUNT(*) AS n FROM matter_particle
    WHERE parent_particle = ${parentId}
  `
  return rows[0]?.n ?? 0
}

const toMaybeArray = (values: string[]): string | string[] => (values.length === 1 ? values[0]! : values)

const particleEdgeSlotOrder: Record<MatterParticleRow["edge_slot"], number> = {
  root: 0,
  branch: 0,
  child: 0,
  then: 0,
  else: 1,
}

const getParticleBindings = async (sql: SQL, src: string) => {
  const bindingRows = new Map(
    (
      await sql<MatterBindingRow[]>`
        SELECT id, binding_kind, literal_kind, literal_text, literal_boolean, expr
        FROM matter_binding
        WHERE wimp = ${src}
      `
    ).map((row) => [row.id, row]),
  )

  const bindingDeps = new Map<number, string[]>()
  const depRows = await sql<Array<{binding: number; dep_order: number; path: string}>>`
    SELECT binding, dep_order, path
    FROM matter_binding_dep
    WHERE binding IN (SELECT id FROM matter_binding WHERE wimp = ${src})
    ORDER BY dep_order
  `

  for (const row of depRows) {
    const deps = bindingDeps.get(row.binding) ?? []
    deps.push(row.path)
    bindingDeps.set(row.binding, deps)
  }

  const directMass = new Map<number, {kind: MatterDirectMassBinding["kind"]; entries: Array<{target: string; source: string}>}>()
  for (const row of await sql<Array<{binding: number; kind: "whole" | "keys"; target: string | null; source: string | null}>>`
    SELECT direct.binding, direct.kind, entry.target_key AS target, entry.source_key AS source
      FROM matter_binding_direct_mass AS direct
      LEFT JOIN matter_binding_direct_mass_key AS entry ON entry.binding = direct.binding
     WHERE direct.binding IN (SELECT id FROM matter_binding WHERE wimp = ${src})
     ORDER BY direct.binding, entry.key_order
  `) {
    const current = directMass.get(row.binding) ?? {kind: row.kind, entries: []}
    if (row.target !== null && row.source !== null) current.entries.push({target: row.target, source: row.source})
    directMass.set(row.binding, current)
  }

  const cache = new Map<number, MatterBindingValue | undefined>()
  const getBinding = (bindingId: number | null | undefined): MatterBindingValue | undefined => {
    if (!bindingId) return
    if (cache.has(bindingId)) return cache.get(bindingId)

    const row = bindingRows.get(bindingId)
    if (!row) return

    let value: MatterBindingValue | undefined
    if (row.binding_kind === "static") {
      if (row.literal_kind === "boolean") {
        throw new Error(`Boolean matter binding "${bindingId}" is not supported in particle relation runtime`)
      }
      value = row.literal_text ?? ""
    } else {
      const deps = bindingDeps.get(bindingId) ?? []
      const direct = directMass.get(bindingId)
      const directMassValue = direct === undefined ? undefined : direct.kind === "whole"
        ? {kind: "whole" as const}
        : {kind: "keys" as const, entries: direct.entries}
      value = row.expr !== null
        ? {...(deps.length > 0 ? {data: toMaybeArray(deps)} : {}), expr: row.expr, ...(directMassValue === undefined ? {} : {directMass: directMassValue})}
        : {data: toMaybeArray(deps), ...(directMassValue === undefined ? {} : {directMass: directMassValue})}
    }

    cache.set(bindingId, value)
    return value
  }

  return {getBinding}
}

const buildParticleModel = (
  row: MatterParticleRow,
  rowsByParent: Map<number | null, MatterParticleRow[]>,
  wimpRows: Map<number, WimpParticleRow>,
  fuzzyRows: Map<number, FuzzyParticleRow>,
  axionRows: Map<number, AxionParticleRow>,
  machoRows: Map<number, MachoParticleRow>,
  getBinding: (bindingId: number | null | undefined) => MatterBindingValue | undefined,
): MatterParticle => {
  const children = (rowsByParent.get(row.id) ?? []).map((child) => ({
    edgeSlot: child.edge_slot === "root" ? "child" : child.edge_slot,
    particle: buildParticleModel(child, rowsByParent, wimpRows, fuzzyRows, axionRows, machoRows, getBinding),
  }))

  if (row.particle_kind === "wimp") {
    const wimpRow = wimpRows.get(row.id)
    if (!wimpRow) throw new Error(`Wimp particle row "${row.id}" is not found in canonical SQLite projection`)
    const fieldsBinding = wimpRow.fields_binding !== null ? getBinding(wimpRow.fields_binding) : undefined
    const massBinding = wimpRow.mass_binding !== null ? getBinding(wimpRow.mass_binding) : undefined
    const energyBinding = wimpRow.energy_binding !== null ? getBinding(wimpRow.energy_binding) : undefined

    return {
      kind: "wimp",
      src: wimpRow.src,
      ...(fieldsBinding !== undefined ? {fieldsBinding} : {}),
      ...(massBinding !== undefined ? {massBinding} : {}),
      ...(energyBinding !== undefined ? {energyBinding} : {}),
      ...(children.length > 0 ? {children} : {}),
    }
  }

  if (row.particle_kind === "fuzzy") {
    const fuzzyRow = fuzzyRows.get(row.id)
    if (!fuzzyRow) throw new Error(`Fuzzy particle row "${row.id}" is not found in canonical SQLite projection`)
    return {
      kind: "fuzzy",
      fuzzyKind: fuzzyRow.fuzzy_kind,
      predicateBinding: getBinding(fuzzyRow.predicate_binding) ?? {data: []},
      ...(children.length > 0 ? {children} : {}),
    }
  }

  if (row.particle_kind === "axion") {
    const axionRow = axionRows.get(row.id)
    if (!axionRow) throw new Error(`Axion particle row "${row.id}" is not found in canonical SQLite projection`)

    return {
      kind: "axion",
      predicateBinding: getBinding(axionRow.predicate_binding) ?? {data: []},
      ...(children.length > 0 ? {children} : {}),
    }
  }

  const machoRow = machoRows.get(row.id)
  if (!machoRow) throw new Error(`Macho particle row "${row.id}" is not found in canonical SQLite projection`)

  return {
    kind: "macho",
    collectionBinding: getBinding(machoRow.collection_binding) ?? {data: []},
    ...(children.length > 0 ? {children} : {}),
  }
}

const getMatterParticles = async (sql: SQL, src: string): Promise<MatterParticle[]> => {
  const {getBinding} = await getParticleBindings(sql, src)

  const particleRows = await sql<MatterParticleRow[]>`
    SELECT id, parent_particle, particle_kind, edge_slot, particle_order
    FROM matter_particle
    WHERE wimp = ${src}
    ORDER BY CASE WHEN parent_particle IS NULL THEN 0 ELSE 1 END, particle_order, rowid
  `

  const rowsByParent = new Map<number | null, MatterParticleRow[]>()
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
        SELECT particle, src, fields_binding, mass_binding, energy_binding
        FROM matter_particle_wimp
        WHERE particle IN (SELECT id FROM matter_particle WHERE wimp = ${src})
      `
    ).map((row) => [row.particle, row]),
  )

  const fuzzyRows = new Map(
    (
      await sql<FuzzyParticleRow[]>`
        SELECT particle, fuzzy_kind, predicate_binding
        FROM matter_particle_fuzzy
        WHERE particle IN (SELECT id FROM matter_particle WHERE wimp = ${src})
      `
    ).map((row) => [row.particle, row]),
  )

  const axionRows = new Map(
    (
      await sql<AxionParticleRow[]>`
        SELECT particle, predicate_binding
        FROM matter_particle_axion
        WHERE particle IN (SELECT id FROM matter_particle WHERE wimp = ${src})
      `
    ).map((row) => [row.particle, row]),
  )

  const machoRows = new Map(
    (
      await sql<MachoParticleRow[]>`
        SELECT particle, collection_binding
        FROM matter_particle_macho
        WHERE particle IN (SELECT id FROM matter_particle WHERE wimp = ${src})
      `
    ).map((row) => [row.particle, row]),
  )

  return (rowsByParent.get(null) ?? []).map((row) =>
    buildParticleModel(row, rowsByParent, wimpRows, fuzzyRows, axionRows, machoRows, getBinding),
  )
}

/**
 * Granular API: insertion helpers for `Matter` and `MatterChildren`.
 *
 * Каждый helper вычисляет `particleOrder` авто (count siblings),
 * вызывает существующие insert*Particle, и возвращает id нового particle.
 */
const insertWimpAt = async (
  wimp: Wimp,
  parentParticle: number | null,
  edgeSlot: MatterEdgeSlot,
  src: string,
  fieldsBindingValue: MatterBindingValue | undefined,
  massBindingValue: MatterBindingValue | undefined,
  energyBindingValue: MatterBindingValue | undefined,
): Promise<number> => {
  validateRuntimeMatterBinding(massBindingValue, "mass", "Matter massBinding")
  validateRuntimeMatterBinding(energyBindingValue, "energy", "Matter energyBinding")
  const fieldsBinding = await insertBinding(wimp.sql, wimp.src, fieldsBindingValue)
  const massBinding = await insertBinding(wimp.sql, wimp.src, massBindingValue)
  const energyBinding = await insertBinding(wimp.sql, wimp.src, energyBindingValue)
  const particleOrder =
    parentParticle === null ? await countRootParticles(wimp.sql, wimp.src) : await countChildParticles(wimp.sql, parentParticle)
  return insertWimpParticle(
    wimp.sql,
    wimp.src,
    parentParticle,
    edgeSlot,
    particleOrder,
    src,
    fieldsBinding,
    massBinding,
    energyBinding,
  )
}

const insertFuzzyAt = async (
  wimp: Wimp,
  parentParticle: number | null,
  edgeSlot: MatterEdgeSlot,
  fuzzyKind: "dynamic-meta",
  predicateBindingValue: MatterBindingValue,
): Promise<number> => {
  const particleOrder =
    parentParticle === null ? await countRootParticles(wimp.sql, wimp.src) : await countChildParticles(wimp.sql, parentParticle)

  const predicateBinding = await insertBinding(wimp.sql, wimp.src, predicateBindingValue)
  return insertDynamicMetaFuzzyParticle(
    wimp.sql,
    wimp.src,
    parentParticle,
    edgeSlot,
    particleOrder,
    requireBinding(predicateBinding, `Fuzzy particle for meta "${wimp.src}" requires enum predicate binding`),
  )
}

const insertAxionAt = async (
  wimp: Wimp,
  parentParticle: number | null,
  edgeSlot: MatterEdgeSlot,
  predicateBindingValue: MatterBindingValue,
): Promise<number> => {
  const predicateBinding = await insertBinding(wimp.sql, wimp.src, predicateBindingValue)
  if (!predicateBinding) throw new Error(`Axion particle for meta "${wimp.src}" requires predicate binding`)

  const particleOrder =
    parentParticle === null ? await countRootParticles(wimp.sql, wimp.src) : await countChildParticles(wimp.sql, parentParticle)
  const particleId = await insertParticle(wimp.sql, wimp.src, "axion", parentParticle, edgeSlot, particleOrder)
  await wimp.sql`
    INSERT INTO matter_particle_axion (particle, predicate_binding)
    VALUES (${particleId}, ${predicateBinding})
  `
  return particleId
}

const insertMachoAt = async (
  wimp: Wimp,
  parentParticle: number | null,
  edgeSlot: MatterEdgeSlot,
  collectionBindingValue: MatterBindingValue,
): Promise<number> => {
  const collectionBinding = await insertBinding(wimp.sql, wimp.src, collectionBindingValue)
  if (!collectionBinding) throw new Error(`Macho particle for meta "${wimp.src}" requires collection binding`)

  const particleOrder =
    parentParticle === null ? await countRootParticles(wimp.sql, wimp.src) : await countChildParticles(wimp.sql, parentParticle)
  const particleId = await insertParticle(wimp.sql, wimp.src, "macho", parentParticle, edgeSlot, particleOrder)
  await wimp.sql`
    INSERT INTO matter_particle_macho (particle, collection_binding)
    VALUES (${particleId}, ${collectionBinding})
  `
  return particleId
}

export abstract class MatterOrmParticle {
  readonly id: number
  readonly children: MatterChildren

  constructor(
    readonly matter: Matter,
    id: number,
  ) {
    this.id = id
    this.children = new MatterChildren(this)
  }

  abstract readonly kind: "wimp" | "fuzzy" | "axion" | "macho"
}

export class MatterWimpParticle extends MatterOrmParticle {
  readonly kind = "wimp" as const
  constructor(
    matter: Matter,
    id: number,
    readonly src: string,
  ) {
    super(matter, id)
  }
}

export class MatterFuzzyParticle extends MatterOrmParticle {
  readonly kind = "fuzzy" as const
  constructor(
    matter: Matter,
    id: number,
    readonly fuzzyKind: "dynamic-meta",
  ) {
    super(matter, id)
  }
}

export class MatterAxionParticle extends MatterOrmParticle {
  readonly kind = "axion" as const
}

export class MatterMachoParticle extends MatterOrmParticle {
  readonly kind = "macho" as const
}

export class MatterChildren {
  constructor(readonly particle: MatterOrmParticle) {}

  async wimp(input: {
    edgeSlot: "child" | "branch"
    src: string
    fieldsBinding?: MatterBindingValue | undefined
    massBinding?: MatterBindingValue | undefined
    energyBinding?: MatterBindingValue | undefined
  }): Promise<MatterWimpParticle> {
    const id = await insertWimpAt(
      this.particle.matter.parent,
      this.particle.id,
      input.edgeSlot,
      input.src,
      input.fieldsBinding,
      input.massBinding,
      input.energyBinding,
    )
    return new MatterWimpParticle(this.particle.matter, id, input.src)
  }

  async fuzzy(input: {
    edgeSlot: "child" | "then" | "else" | "branch"
    fuzzyKind: "dynamic-meta"
    predicateBinding: MatterBindingValue
  }): Promise<MatterFuzzyParticle> {
    const id = await insertFuzzyAt(
      this.particle.matter.parent,
      this.particle.id,
      input.edgeSlot,
      input.fuzzyKind,
      input.predicateBinding,
    )
    return new MatterFuzzyParticle(this.particle.matter, id, input.fuzzyKind)
  }

  async axion(input: {
    edgeSlot: "child" | "then" | "else" | "branch"
    predicateBinding: MatterBindingValue
  }): Promise<MatterAxionParticle> {
    const id = await insertAxionAt(
      this.particle.matter.parent,
      this.particle.id,
      input.edgeSlot,
      input.predicateBinding,
    )
    return new MatterAxionParticle(this.particle.matter, id)
  }

  async macho(input: {
    edgeSlot: "child" | "then" | "else" | "branch"
    collectionBinding: MatterBindingValue
  }): Promise<MatterMachoParticle> {
    const id = await insertMachoAt(
      this.particle.matter.parent,
      this.particle.id,
      input.edgeSlot,
      input.collectionBinding,
    )
    return new MatterMachoParticle(this.particle.matter, id)
  }

  async count(): Promise<number> {
    return countChildParticles(this.particle.matter.parent.sql, this.particle.id)
  }
}

export class Matter {
  readonly #parent: Wimp

  /**
   * Родительский `Wimp` ORM. Назван `parent` (не `wimp`), чтобы не конфликтовать
   * с одноимённым методом `Matter.wimp(...)` для создания root wimp-particle.
   */
  constructor(parent: Wimp) {
    this.#parent = parent
  }

  get parent(): Wimp {
    return this.#parent
  }

  async wimp(input: {
    src: string
    fieldsBinding?: MatterBindingValue | undefined
    massBinding?: MatterBindingValue | undefined
    energyBinding?: MatterBindingValue | undefined
  }): Promise<MatterWimpParticle> {
    const id = await insertWimpAt(
      this.parent,
      null,
      "root",
      input.src,
      input.fieldsBinding,
      input.massBinding,
      input.energyBinding,
    )
    return new MatterWimpParticle(this, id, input.src)
  }

  async fuzzy(input: {
    fuzzyKind: "dynamic-meta"
    predicateBinding: MatterBindingValue
  }): Promise<MatterFuzzyParticle> {
    const id = await insertFuzzyAt(this.parent, null, "root", input.fuzzyKind, input.predicateBinding)
    return new MatterFuzzyParticle(this, id, input.fuzzyKind)
  }

  async axion(input: {predicateBinding: MatterBindingValue}): Promise<MatterAxionParticle> {
    const id = await insertAxionAt(this.parent, null, "root", input.predicateBinding)
    return new MatterAxionParticle(this, id)
  }

  async macho(input: {collectionBinding: MatterBindingValue}): Promise<MatterMachoParticle> {
    const id = await insertMachoAt(this.parent, null, "root", input.collectionBinding)
    return new MatterMachoParticle(this, id)
  }

  async all(): Promise<MatterParticle[]> {
    if (!(await hasMatter(this.parent.sql, this.parent.src))) return []
    return getMatterParticles(this.parent.sql, this.parent.src)
  }

  async count(): Promise<number> {
    if (!(await hasMatter(this.parent.sql, this.parent.src))) return 0
    return (await getMatterParticles(this.parent.sql, this.parent.src)).length
  }

  async exists(): Promise<boolean> {
    return hasMatter(this.parent.sql, this.parent.src)
  }
}
