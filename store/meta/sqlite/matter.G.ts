import type { Database } from "bun:sqlite"
import type { MatterParticlePlan, MatterRelationBindingValue } from "@dark/types/dark"
import type {
  AxionParticleRow,
  BindingRow,
  FuzzyParticleRow,
  MachoParticleRow,
  ParticleRow,
  WimpParticleRow,
} from "./matter.t.ts"

const toMaybeArray = (values: string[]): string | string[] => (values.length === 1 ? values[0]! : values)
const particleEdgeSlotOrder: Record<ParticleRow["edge_slot"], number> = {
  root: 0,
  branch: 0,
  child: 0,
  then: 0,
  else: 1,
}

const getParticleBindings = (db: Database, src: string) => {
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
      value = row.expr !== null ? { ...(deps.length > 0 ? { data: toMaybeArray(deps) } : {}), expr: row.expr } : { data: toMaybeArray(deps) }
    }

    cache.set(bindingId, value)
    return value
  }

  return { getBinding }
}

const buildParticleModel = (
  row: ParticleRow,
  rowsByParent: Map<string | null, ParticleRow[]>,
  wimpRows: Map<string, WimpParticleRow>,
  fuzzyRows: Map<string, FuzzyParticleRow>,
  axionRows: Map<string, AxionParticleRow>,
  machoRows: Map<string, MachoParticleRow>,
  getBinding: (bindingId: string | null | undefined) => MatterRelationBindingValue | undefined,
): MatterParticlePlan => {
  const children = (rowsByParent.get(row.uuid) ?? []).map((child) =>
    buildParticleModel(child, rowsByParent, wimpRows, fuzzyRows, axionRows, machoRows, getBinding),
  )

  if (row.particle_kind === "wimp") {
    const wimpRow = wimpRows.get(row.uuid)
    if (!wimpRow) throw new Error(`Wimp particle row "${row.uuid}" is not found in canonical SQLite projection`)
    const fieldsBinding = wimpRow.fields_binding !== null ? getBinding(wimpRow.fields_binding) : undefined
    const massBinding = wimpRow.mass_binding !== null ? getBinding(wimpRow.mass_binding) : undefined

    return {
      kind: "wimp",
      src: wimpRow.src,
      ...(fieldsBinding !== undefined ? { fieldsBinding } : {}),
      ...(massBinding !== undefined ? { massBinding } : {}),
      ...(children.length > 0 ? { children } : {}),
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
      ...(predicateBinding !== undefined ? { predicateBinding } : {}),
      ...(children.length > 0 ? { children } : {}),
    }
  }

  if (row.particle_kind === "axion") {
    const axionRow = axionRows.get(row.uuid)
    if (!axionRow) throw new Error(`Axion particle row "${row.uuid}" is not found in canonical SQLite projection`)

    return {
      kind: "axion",
      predicateBinding: getBinding(axionRow.predicate_binding) ?? { data: [] },
      ...(children.length > 0 ? { children } : {}),
    }
  }

  const machoRow = machoRows.get(row.uuid)
  if (!machoRow) throw new Error(`Macho particle row "${row.uuid}" is not found in canonical SQLite projection`)

  return {
    kind: "macho",
    collectionBinding: getBinding(machoRow.collection_binding) ?? { data: [] },
    ...(children.length > 0 ? { children } : {}),
  }
}

export const getMatterParticles = (db: Database, src: string): MatterParticlePlan[] => {
  const { getBinding } = getParticleBindings(db, src)

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

  return (rowsByParent.get(null) ?? []).map((row) =>
    buildParticleModel(row, rowsByParent, wimpRows, fuzzyRows, axionRows, machoRows, getBinding),
  )
}
