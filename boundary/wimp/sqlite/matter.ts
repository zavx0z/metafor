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
import {normalizeMatterBindingPath} from "./binding.ts"
import {emitGravitonAdd} from "../../force.ts"

const hasMatter = async (sql: SQL, src: string): Promise<boolean> => {
  const rows = await sql`SELECT 1 AS one FROM matter_particle WHERE wimp = ${src} LIMIT 1`
  return rows.length > 0
}

const toBindingPaths = (value: BindingValue): string[] => {
  if (!value || typeof value !== "object" || !("data" in value) || value.data === undefined) return []
  return (Array.isArray(value.data) ? value.data : [value.data]).map(normalizeMatterBindingPath)
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

const countRootParticles = async (sql: SQL, wimpSrc: string): Promise<number> => {
  const rows = await sql<Array<{n: number}>>`
    SELECT COUNT(*) AS n FROM matter_particle
    WHERE wimp = ${wimpSrc} AND parent_particle IS NULL
  `
  return rows[0]?.n ?? 0
}

const countChildParticles = async (sql: SQL, parentUuid: string): Promise<number> => {
  const rows = await sql<Array<{n: number}>>`
    SELECT COUNT(*) AS n FROM matter_particle
    WHERE parent_particle = ${parentUuid}
  `
  return rows[0]?.n ?? 0
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

/**
 * Granular API: insertion helpers for `Matter` and `MatterChildren`.
 *
 * Каждый helper вычисляет `particleOrder` авто (count siblings),
 * вызывает существующие insert*Particle, и возвращает uuid нового particle.
 */
const insertWimpAt = async (
  wimp: Wimp,
  parentParticle: string | null,
  edgeSlot: EdgeSlot,
  src: string,
  fieldsBindingValue: BindingValue | undefined,
  massBindingValue: BindingValue | undefined,
): Promise<string> => {
  const fieldsBinding = await insertBinding(wimp.sql, wimp.src, fieldsBindingValue)
  const massBinding = await insertBinding(wimp.sql, wimp.src, massBindingValue)
  const particleOrder =
    parentParticle === null ? await countRootParticles(wimp.sql, wimp.src) : await countChildParticles(wimp.sql, parentParticle)
  return insertWimpParticle(wimp.sql, wimp.src, parentParticle, edgeSlot, particleOrder, src, fieldsBinding, massBinding)
}

const insertFuzzyAt = async (
  wimp: Wimp,
  parentParticle: string | null,
  edgeSlot: EdgeSlot,
  fuzzyKind: "cond" | "dynamic-meta",
  predicateBindingValue: BindingValue | undefined,
): Promise<string> => {
  const particleOrder =
    parentParticle === null ? await countRootParticles(wimp.sql, wimp.src) : await countChildParticles(wimp.sql, parentParticle)

  if (fuzzyKind === "cond") {
    const predicateBinding = await insertBinding(wimp.sql, wimp.src, predicateBindingValue)
    return insertCondFuzzyParticle(
      wimp.sql,
      wimp.src,
      parentParticle,
      edgeSlot,
      particleOrder,
      requireBinding(predicateBinding, `Condition particle for meta "${wimp.src}" requires predicate binding`),
    )
  }
  return insertDynamicMetaFuzzyParticle(wimp.sql, wimp.src, parentParticle, edgeSlot, particleOrder)
}

const insertAxionAt = async (
  wimp: Wimp,
  parentParticle: string | null,
  edgeSlot: EdgeSlot,
  predicateBindingValue: BindingValue,
): Promise<string> => {
  const predicateBinding = await insertBinding(wimp.sql, wimp.src, predicateBindingValue)
  if (!predicateBinding) throw new Error(`Axion particle for meta "${wimp.src}" requires predicate binding`)

  const particleOrder =
    parentParticle === null ? await countRootParticles(wimp.sql, wimp.src) : await countChildParticles(wimp.sql, parentParticle)
  const particleUuid = await insertParticle(wimp.sql, wimp.src, "axion", parentParticle, edgeSlot, particleOrder)
  await wimp.sql`
    INSERT INTO matter_particle_axion (particle, predicate_binding)
    VALUES (${particleUuid}, ${predicateBinding})
  `
  return particleUuid
}

const insertMachoAt = async (
  wimp: Wimp,
  parentParticle: string | null,
  edgeSlot: EdgeSlot,
  collectionBindingValue: BindingValue,
): Promise<string> => {
  const collectionBinding = await insertBinding(wimp.sql, wimp.src, collectionBindingValue)
  if (!collectionBinding) throw new Error(`Macho particle for meta "${wimp.src}" requires collection binding`)

  const particleOrder =
    parentParticle === null ? await countRootParticles(wimp.sql, wimp.src) : await countChildParticles(wimp.sql, parentParticle)
  const particleUuid = await insertParticle(wimp.sql, wimp.src, "macho", parentParticle, edgeSlot, particleOrder)
  await wimp.sql`
    INSERT INTO matter_particle_macho (particle, collection_binding)
    VALUES (${particleUuid}, ${collectionBinding})
  `
  return particleUuid
}

export abstract class MatterParticle {
  readonly uuid: string
  readonly children: MatterChildren

  constructor(
    readonly matter: Matter,
    uuid: string,
  ) {
    this.uuid = uuid
    this.children = new MatterChildren(this)
  }

  abstract readonly kind: "wimp" | "fuzzy" | "axion" | "macho"
}

export class MatterWimpParticle extends MatterParticle {
  readonly kind = "wimp" as const
  constructor(
    matter: Matter,
    uuid: string,
    readonly src: string,
  ) {
    super(matter, uuid)
  }
}

export class MatterFuzzyParticle extends MatterParticle {
  readonly kind = "fuzzy" as const
  constructor(
    matter: Matter,
    uuid: string,
    readonly fuzzyKind: "cond" | "dynamic-meta",
  ) {
    super(matter, uuid)
  }
}

export class MatterAxionParticle extends MatterParticle {
  readonly kind = "axion" as const
}

export class MatterMachoParticle extends MatterParticle {
  readonly kind = "macho" as const
}

export class MatterChildren {
  constructor(readonly particle: MatterParticle) {}

  async wimp(input: {
    edgeSlot: "child" | "branch"
    src: string
    fieldsBinding?: BindingValue | undefined
    massBinding?: BindingValue | undefined
  }): Promise<MatterWimpParticle> {
    const uuid = await insertWimpAt(
      this.particle.matter.parent,
      this.particle.uuid,
      input.edgeSlot,
      input.src,
      input.fieldsBinding,
      input.massBinding,
    )
    emitGravitonAdd("matter", uuid)
    return new MatterWimpParticle(this.particle.matter, uuid, input.src)
  }

  async fuzzy(input: {
    edgeSlot: "child" | "then" | "else" | "branch"
    fuzzyKind: "cond" | "dynamic-meta"
    predicateBinding?: BindingValue | undefined
  }): Promise<MatterFuzzyParticle> {
    const uuid = await insertFuzzyAt(
      this.particle.matter.parent,
      this.particle.uuid,
      input.edgeSlot,
      input.fuzzyKind,
      input.predicateBinding,
    )
    emitGravitonAdd("matter", uuid)
    return new MatterFuzzyParticle(this.particle.matter, uuid, input.fuzzyKind)
  }

  async axion(input: {
    edgeSlot: "child" | "then" | "else" | "branch"
    predicateBinding: BindingValue
  }): Promise<MatterAxionParticle> {
    const uuid = await insertAxionAt(
      this.particle.matter.parent,
      this.particle.uuid,
      input.edgeSlot,
      input.predicateBinding,
    )
    emitGravitonAdd("matter", uuid)
    return new MatterAxionParticle(this.particle.matter, uuid)
  }

  async macho(input: {
    edgeSlot: "child" | "then" | "else" | "branch"
    collectionBinding: BindingValue
  }): Promise<MatterMachoParticle> {
    const uuid = await insertMachoAt(
      this.particle.matter.parent,
      this.particle.uuid,
      input.edgeSlot,
      input.collectionBinding,
    )
    emitGravitonAdd("matter", uuid)
    return new MatterMachoParticle(this.particle.matter, uuid)
  }

  async count(): Promise<number> {
    return countChildParticles(this.particle.matter.parent.sql, this.particle.uuid)
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
    fieldsBinding?: BindingValue | undefined
    massBinding?: BindingValue | undefined
  }): Promise<MatterWimpParticle> {
    const uuid = await insertWimpAt(this.parent, null, "root", input.src, input.fieldsBinding, input.massBinding)
    emitGravitonAdd("matter", uuid)
    return new MatterWimpParticle(this, uuid, input.src)
  }

  async fuzzy(input: {
    fuzzyKind: "cond" | "dynamic-meta"
    predicateBinding?: BindingValue | undefined
  }): Promise<MatterFuzzyParticle> {
    const uuid = await insertFuzzyAt(this.parent, null, "root", input.fuzzyKind, input.predicateBinding)
    emitGravitonAdd("matter", uuid)
    return new MatterFuzzyParticle(this, uuid, input.fuzzyKind)
  }

  async axion(input: {predicateBinding: BindingValue}): Promise<MatterAxionParticle> {
    const uuid = await insertAxionAt(this.parent, null, "root", input.predicateBinding)
    emitGravitonAdd("matter", uuid)
    return new MatterAxionParticle(this, uuid)
  }

  async macho(input: {collectionBinding: BindingValue}): Promise<MatterMachoParticle> {
    const uuid = await insertMachoAt(this.parent, null, "root", input.collectionBinding)
    emitGravitonAdd("matter", uuid)
    return new MatterMachoParticle(this, uuid)
  }

  async all(): Promise<MatterRelationParticle[]> {
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
