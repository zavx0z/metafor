import type { SQL } from "bun"
import type { MetaDSL } from "../../../metafor.t.ts"
import type { MetaMassValueRow, MetaRow } from "./meta.t.ts"
import { Fields } from "./fields.ts"
import { Superposition } from "./superposition.ts"
import { Processes } from "./process.ts"
import { Reactions } from "./reactions.ts"
import { Matter } from "./matter.ts"

const getMetaRow = async (sql: SQL, src: string): Promise<MetaRow | null> => {
  const rows = await sql<MetaRow[]>`
    SELECT src, name, desc, view_css
    FROM meta
    WHERE src = ${src}
  `
  return rows[0] ?? null
}

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

const readMass = async (sql: SQL, src: string): Promise<MetaDSL["mass"] | undefined> => {
  const rows = await sql<MetaMassValueRow[]>`
    SELECT uuid, parent_value, value_kind, entry_key, entry_order, text_value, number_value, boolean_value
    FROM meta_mass_value
    WHERE meta = ${src}
    ORDER BY CASE WHEN parent_value IS NULL THEN 0 ELSE 1 END, entry_order, entry_key, rowid
  `

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

export class Meta {
  readonly fields: Fields
  readonly superposition: Superposition
  readonly processes: Processes
  readonly reactions: Reactions
  readonly matter: Matter

  constructor(
    private readonly sql: SQL,
    readonly src: string,
  ) {
    this.fields = new Fields(sql, src)
    this.superposition = new Superposition(sql, src)
    this.processes = new Processes(sql, src)
    this.reactions = new Reactions(sql, src)
    this.matter = new Matter(sql, src)
  }

    async name(): Promise<string> {
    const row = await getMetaRow(this.sql, this.src)
    return row?.name ?? this.src.split("/").pop() ?? this.src
  }

    async desc(): Promise<string | undefined> {
    const row = await getMetaRow(this.sql, this.src)
    return row?.desc ?? undefined
  }

    async mass(): Promise<MetaDSL["mass"]> {
    return readMass(this.sql, this.src)
  }

    async bulk(): Promise<MetaDSL["bulk"]> {
    const row = await getMetaRow(this.sql, this.src)
    return row?.view_css ? ({ view: row.view_css } as MetaDSL["bulk"]) : undefined
  }

    async delete(): Promise<void> {
    await this.sql`DELETE FROM meta WHERE src = ${this.src}`
  }
}
