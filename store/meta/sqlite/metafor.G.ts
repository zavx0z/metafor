import type { Database } from "bun:sqlite"
import type { MetaDSL } from "../../.."
import type { MetaMassValueRow, MetaRow } from "./metafor.t.ts"

export const getMetaRow = (db: Database, src: string): MetaRow | null =>
  db.query(
    `SELECT src, name, desc, view_css
     FROM meta
     WHERE src = ?`,
  ).get(src) as MetaRow | null

/**
 * Производные методы для проверки наличия секций. Не хранятся как колонки —
 * вычисляются через EXISTS, чтобы исключить рассинхронизацию между флагом и реальностью.
 */
export const hasProcesses = (db: Database, src: string): boolean =>
  (db.query(`SELECT 1 FROM process WHERE meta = ? LIMIT 1`).get(src) as unknown) !== null

export const hasReactions = (db: Database, src: string): boolean =>
  (db.query(`SELECT 1 FROM reaction WHERE meta = ? LIMIT 1`).get(src) as unknown) !== null

export const hasMatter = (db: Database, src: string): boolean =>
  (db.query(`SELECT 1 FROM matter_particle WHERE meta = ? LIMIT 1`).get(src) as unknown) !== null

const compareMassRows = (left: MetaMassValueRow, right: MetaMassValueRow): number => {
  if (left.entry_order !== null || right.entry_order !== null) {
    return (left.entry_order ?? 0) - (right.entry_order ?? 0)
  }

  return (left.entry_key ?? "").localeCompare(right.entry_key ?? "")
}

const decodeMassValue = (
  row: MetaMassValueRow,
  childrenByParent: Map<string, MetaMassValueRow[]>,
): unknown => {
  if (row.value_kind === "object") {
    return Object.fromEntries(
      (childrenByParent.get(row.uuid) ?? [])
        .sort(compareMassRows)
        .map((child) => [child.entry_key ?? "", decodeMassValue(child, childrenByParent)]),
    )
  }

  if (row.value_kind === "array") {
    return (childrenByParent.get(row.uuid) ?? []).sort(compareMassRows).map((child) => decodeMassValue(child, childrenByParent))
  }

  if (row.value_kind === "string") return row.text_value ?? ""
  if (row.value_kind === "number") return row.number_value ?? 0
  if (row.value_kind === "boolean") return row.boolean_value === 1
  return null
}

export const getMass = (db: Database, src: string): MetaDSL["mass"] | undefined => {
  const rows = db.query(
    `SELECT uuid, parent_value, value_kind, entry_key, entry_order, text_value, number_value, boolean_value
     FROM meta_mass_value
     WHERE meta = ?
     ORDER BY CASE WHEN parent_value IS NULL THEN 0 ELSE 1 END, entry_order, entry_key, rowid`,
  ).all(src) as MetaMassValueRow[]

  const root = rows.find((row) => row.parent_value === null)
  if (!root) return

  const childrenByParent = new Map<string, MetaMassValueRow[]>()
  for (const row of rows) {
    if (row.parent_value === null) continue

    const children = childrenByParent.get(row.parent_value) ?? []
    children.push(row)
    childrenByParent.set(row.parent_value, children)
  }

  return decodeMassValue(root, childrenByParent) as MetaDSL["mass"]
}
