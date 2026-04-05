import type { Database } from "bun:sqlite"
import type { MetaDSL } from "index.ts"
import type { MatterBindingValue, MatterParticlePlan } from "@dark/types/dark"
import { Meta } from "@dark/strong"
import { readFields, readMass, readProcesses, readReactions, readSuperposition } from "../pkg/sqlite/dark.ts"

type BindingRow = {
  uuid: string
  binding_kind: "static" | "variable" | "dynamic"
  literal_kind: "text" | "boolean" | null
  literal_text: string | null
  literal_boolean: number | null
  expr: string | null
}

type ParticleRow = {
  uuid: string
  parent_particle: string | null
  particle_kind: "wimp" | "fuzzy" | "axion" | "macho"
  edge_slot: "root" | "child" | "then" | "else" | "branch"
  particle_order: number
}

type WimpParticleRow = {
  particle: string
  src: string
  fields_binding: string | null
  mass_binding: string | null
}

type FuzzyParticleRow = {
  particle: string
  fuzzy_kind: "dynamic-meta" | "cond"
  predicate_binding: string | null
}

type AxionParticleRow = {
  particle: string
  predicate_binding: string
}

type MachoParticleRow = {
  particle: string
  collection_binding: string
}

type MetaRow = {
  src: string
  name: string | null
  desc: string | null
  view_css: string | null
  has_processes: number
  has_reactions: number
}

const hasKeys = (value: object): boolean => Object.keys(value).length > 0
const toMaybeArray = (values: string[]): string | string[] => (values.length === 1 ? values[0]! : values)
const particleEdgeSlotOrder: Record<ParticleRow["edge_slot"], number> = {
  root: 0,
  branch: 0,
  child: 0,
  then: 0,
  else: 1,
}

const readBindings = (db: Database, src: string) => {
  const bindingRows = new Map(
    (
      db.query(
        `SELECT uuid, binding_kind, literal_kind, literal_text, literal_boolean, expr
         FROM matter_binding
         WHERE meta = ?`,
      ).all(src) as BindingRow[]
    ).map((row) => [row.uuid, row]),
  )

  const bindingDeps = new Map<string, string[]>()
  const depRows = db.query(
    `SELECT binding, dep_order, path
     FROM matter_binding_dep
     WHERE binding IN (SELECT uuid FROM matter_binding WHERE meta = ?)
     ORDER BY dep_order`,
  ).all(src) as Array<{ binding: string; dep_order: number; path: string }>

  for (const row of depRows) {
    const deps = bindingDeps.get(row.binding) ?? []
    deps.push(row.path)
    bindingDeps.set(row.binding, deps)
  }

  const cache = new Map<string, MatterBindingValue | undefined>()
  const readBinding = (bindingId: string | null | undefined): MatterBindingValue | undefined => {
    if (!bindingId) return
    if (cache.has(bindingId)) return cache.get(bindingId)

    const row = bindingRows.get(bindingId)
    if (!row) return

    let value: MatterBindingValue | undefined
    if (row.binding_kind === "static") {
      value = row.literal_kind === "boolean" ? row.literal_boolean === 1 : row.literal_text ?? ""
    } else {
      const deps = bindingDeps.get(bindingId) ?? []
      value = row.expr !== null ? { ...(deps.length > 0 ? { data: toMaybeArray(deps) } : {}), expr: row.expr } : { data: toMaybeArray(deps) }
    }

    cache.set(bindingId, value)
    return value
  }

  return { readBinding }
}

const buildParticlePlan = (
  row: ParticleRow,
  rowsByParent: Map<string | null, ParticleRow[]>,
  wimpRows: Map<string, WimpParticleRow>,
  fuzzyRows: Map<string, FuzzyParticleRow>,
  axionRows: Map<string, AxionParticleRow>,
  machoRows: Map<string, MachoParticleRow>,
  readBinding: (bindingId: string | null | undefined) => MatterBindingValue | undefined,
): MatterParticlePlan => {
  const children = (rowsByParent.get(row.uuid) ?? []).map((child) =>
    buildParticlePlan(child, rowsByParent, wimpRows, fuzzyRows, axionRows, machoRows, readBinding),
  )

  if (row.particle_kind === "wimp") {
    const wimpRow = wimpRows.get(row.uuid)
    if (!wimpRow) throw new Error(`Wimp particle row "${row.uuid}" is not found in canonical SQLite projection`)

    return {
      kind: "wimp",
      src: wimpRow.src,
      ...(wimpRow.fields_binding !== null ? { fieldsBinding: readBinding(wimpRow.fields_binding) } : {}),
      ...(wimpRow.mass_binding !== null ? { massBinding: readBinding(wimpRow.mass_binding) } : {}),
      ...(children.length > 0 ? { children } : {}),
    }
  }

  if (row.particle_kind === "fuzzy") {
    const fuzzyRow = fuzzyRows.get(row.uuid)
    if (!fuzzyRow) throw new Error(`Fuzzy particle row "${row.uuid}" is not found in canonical SQLite projection`)

    return {
      kind: "fuzzy",
      fuzzyKind: fuzzyRow.fuzzy_kind,
      ...(fuzzyRow.predicate_binding !== null ? { predicateBinding: readBinding(fuzzyRow.predicate_binding) } : {}),
      ...(children.length > 0 ? { children } : {}),
    }
  }

  if (row.particle_kind === "axion") {
    const axionRow = axionRows.get(row.uuid)
    if (!axionRow) throw new Error(`Axion particle row "${row.uuid}" is not found in canonical SQLite projection`)

    return {
      kind: "axion",
      predicateBinding: readBinding(axionRow.predicate_binding) ?? { data: [] },
      ...(children.length > 0 ? { children } : {}),
    }
  }

  const machoRow = machoRows.get(row.uuid)
  if (!machoRow) throw new Error(`Macho particle row "${row.uuid}" is not found in canonical SQLite projection`)

  return {
    kind: "macho",
    collectionBinding: readBinding(machoRow.collection_binding) ?? { data: [] },
    ...(children.length > 0 ? { children } : {}),
  }
}

export function readDarkMetaParticles(db: Database, src: string): { meta: Meta; particles: MatterParticlePlan[] } {
  const metaRow = db.query(
    `SELECT src, name, desc, view_css, has_processes, has_reactions
     FROM meta
     WHERE src = ?`,
  ).get(src) as MetaRow | null

  if (!metaRow) {
    throw new Error(`Canonical meta "${src}" is not found in SQLite`)
  }

  const { fields, fieldKeys, enumVariants } = readFields(db, src)
  const metaMass = readMass(db, src)
  const superposition = readSuperposition(db, src, enumVariants)
  const processes = readProcesses(db, src, fieldKeys)
  const reactions = readReactions(db, src, fieldKeys)

  const meta = new Meta({
    src,
    name: metaRow.name ?? src.split("/").pop() ?? src,
    fieldSchemas: fields,
    superposition: superposition ?? {},
    ...(metaRow.has_processes === 1 || processes !== undefined ? { processes: processes ?? {} } : {}),
    ...(metaRow.has_reactions === 1 || (reactions !== undefined && (hasKeys(reactions.reactions) || hasKeys(reactions.superposition)))
      ? { reactions: reactions ?? { reactions: {}, superposition: {} } }
      : {}),
    ...(metaRow.view_css !== null ? { bulk: { view: metaRow.view_css } as MetaDSL["bulk"] } : {}),
    ...(metaMass !== undefined && hasKeys(metaMass) ? { mass: metaMass } : {}),
  })

  const { readBinding } = readBindings(db, src)

  const particleRows = db.query(
    `SELECT uuid, parent_particle, particle_kind, edge_slot, particle_order
     FROM matter_particle
     WHERE meta = ?
     ORDER BY CASE WHEN parent_particle IS NULL THEN 0 ELSE 1 END, particle_order, rowid`,
  ).all(src) as ParticleRow[]

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
      db.query(
        `SELECT particle, src, fields_binding, mass_binding
         FROM matter_particle_wimp
         WHERE particle IN (SELECT uuid FROM matter_particle WHERE meta = ?)`,
      ).all(src) as WimpParticleRow[]
    ).map((row) => [row.particle, row]),
  )

  const fuzzyRows = new Map(
    (
      db.query(
        `SELECT particle, fuzzy_kind, predicate_binding
         FROM matter_particle_fuzzy
         WHERE particle IN (SELECT uuid FROM matter_particle WHERE meta = ?)`,
      ).all(src) as FuzzyParticleRow[]
    ).map((row) => [row.particle, row]),
  )

  const axionRows = new Map(
    (
      db.query(
        `SELECT particle, predicate_binding
         FROM matter_particle_axion
         WHERE particle IN (SELECT uuid FROM matter_particle WHERE meta = ?)`,
      ).all(src) as AxionParticleRow[]
    ).map((row) => [row.particle, row]),
  )

  const machoRows = new Map(
    (
      db.query(
        `SELECT particle, collection_binding
         FROM matter_particle_macho
         WHERE particle IN (SELECT uuid FROM matter_particle WHERE meta = ?)`,
      ).all(src) as MachoParticleRow[]
    ).map((row) => [row.particle, row]),
  )

  const particles = (rowsByParent.get(null) ?? []).map((row) =>
    buildParticlePlan(row, rowsByParent, wimpRows, fuzzyRows, axionRows, machoRows, readBinding),
  )

  return { meta, particles }
}
