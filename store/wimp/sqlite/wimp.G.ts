import type { SQL } from "bun"
import type { MetaDSL } from "../../.."
import type { WimpMassValueRow, WimpRow } from "./wimp.t.ts"

export const getWimpRow = async (sql: SQL, src: string): Promise<WimpRow | null> => {
  const rows = await sql<WimpRow[]>`
    SELECT src, name, desc, view_css
    FROM wimp
    WHERE src = ${src}
  `
  return rows[0] ?? null
}

export const hasProcesses = async (sql: SQL, src: string): Promise<boolean> => {
  const rows = await sql`SELECT 1 AS one FROM process WHERE wimp = ${src} LIMIT 1`
  return rows.length > 0
}

export const hasReactions = async (sql: SQL, src: string): Promise<boolean> => {
  const rows = await sql`SELECT 1 AS one FROM reaction WHERE wimp = ${src} LIMIT 1`
  return rows.length > 0
}

export const hasMatter = async (sql: SQL, src: string): Promise<boolean> => {
  const rows = await sql`SELECT 1 AS one FROM matter_particle WHERE wimp = ${src} LIMIT 1`
  return rows.length > 0
}

const compareMassRows = (left: WimpMassValueRow, right: WimpMassValueRow): number => {
  if (left.entry_order !== null || right.entry_order !== null) {
    return (left.entry_order ?? 0) - (right.entry_order ?? 0)
  }

  return (left.entry_key ?? "").localeCompare(right.entry_key ?? "")
}

const decodeMassValue = (
  row: WimpMassValueRow,
  childrenByParent: Map<string, WimpMassValueRow[]>,
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

export const getMass = async (sql: SQL, src: string): Promise<MetaDSL["mass"] | undefined> => {
  const rows = await sql<WimpMassValueRow[]>`
    SELECT uuid, parent_value, value_kind, entry_key, entry_order, text_value, number_value, boolean_value
    FROM wimp_mass_value
    WHERE wimp = ${src}
    ORDER BY CASE WHEN parent_value IS NULL THEN 0 ELSE 1 END, entry_order, entry_key, rowid
  `

  const root = rows.find((row) => row.parent_value === null)
  if (!root) return

  const childrenByParent = new Map<string, WimpMassValueRow[]>()
  for (const row of rows) {
    if (row.parent_value === null) continue

    const children = childrenByParent.get(row.parent_value) ?? []
    children.push(row)
    childrenByParent.set(row.parent_value, children)
  }

  return decodeMassValue(root, childrenByParent) as MetaDSL["mass"]
}
