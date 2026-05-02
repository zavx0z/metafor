import type { SQL } from "bun"
import type { MetaDSL } from "../../../metafor.t.ts"
import type { WimpIdentifiers, WimpMassValueRow, WimpRow } from "./wimp.t.ts"
import { Fields } from "./fields.ts"
import { Superposition } from "./superposition.ts"
import { Processes } from "./process.ts"
import { Reactions } from "./reactions.ts"
import { Matter } from "./matter.ts"

const getWimpRow = async (sql: SQL, src: string): Promise<WimpRow | null> => {
  const rows = await sql<WimpRow[]>`
    SELECT src, name, desc, view_css
    FROM wimp
    WHERE src = ${src}
  `
  return rows[0] ?? null
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

const readMass = async (sql: SQL, src: string): Promise<MetaDSL["mass"] | undefined> => {
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

export class Wimp {
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
    const row = await getWimpRow(this.sql, this.src)
    return row?.name ?? this.src.split("/").pop() ?? this.src
  }

    async desc(): Promise<string | undefined> {
    const row = await getWimpRow(this.sql, this.src)
    return row?.desc ?? undefined
  }

    async mass(): Promise<MetaDSL["mass"]> {
    return readMass(this.sql, this.src)
  }

    async bulk(): Promise<MetaDSL["bulk"]> {
    const row = await getWimpRow(this.sql, this.src)
    return row?.view_css ? ({ view: row.view_css } as MetaDSL["bulk"]) : undefined
  }

  /**
   * Снимок UUID-маппингов для канонизированной меты. Требует чтобы мета была в БД.
   * Без кеша — каждый вызов делает SQL.
   */
  async identifiers(): Promise<WimpIdentifiers> {
    const fieldRows = await this.sql<Array<{uuid: string; key: string}>>`
      SELECT uuid, key FROM field WHERE wimp = ${this.src}
    `
    const fieldUuids = new Map<string, string>()
    for (const row of fieldRows) fieldUuids.set(row.key, row.uuid)

    const variantUuids = new Map<string, Map<string, string>>()
    if (fieldRows.length > 0) {
      const variantRows = await this.sql<Array<{field: string; uuid: string; item_value: string}>>`
        SELECT field, uuid, item_value
        FROM field_enum_variant
        WHERE field IN ${this.sql(fieldRows.map((r) => r.uuid))}
        ORDER BY position
      `
      const fieldKeyByUuid = new Map<string, string>()
      for (const row of fieldRows) fieldKeyByUuid.set(row.uuid, row.key)
      for (const row of variantRows) {
        const fieldKey = fieldKeyByUuid.get(row.field)
        if (!fieldKey) continue
        const sub = variantUuids.get(fieldKey) ?? new Map<string, string>()
        sub.set(row.item_value, row.uuid)
        variantUuids.set(fieldKey, sub)
      }
    }

    const stateRows = await this.sql<Array<{uuid: string; name: string; position: number}>>`
      SELECT uuid, name, position FROM superposition WHERE wimp = ${this.src} ORDER BY position
    `
    const superpositionUuids = new Map<string, string>()
    let initialState: string | null = null
    for (const row of stateRows) {
      superpositionUuids.set(row.name, row.uuid)
      if (row.position === 0) initialState = row.uuid
    }
    if (initialState === null && stateRows.length > 0) initialState = stateRows[0]!.uuid

    return {src: this.src, fieldUuids, variantUuids, superpositionUuids, initialState}
  }
}
