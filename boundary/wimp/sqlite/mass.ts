import type {SQL} from "bun"
import type {MetaDSL} from "@metafor/types/metafor/schema"
import type {Wimp} from "./wimp.ts"
import type { WimpMassValueRow } from "@metafor/types/boundary/wimp"

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const insertMassValue = async (
  sql: SQL,
  src: string,
  value: unknown,
  parentValue: number | null,
  entryKey: string | null,
  entryOrder: number | null,
): Promise<number> => {
  if (Array.isArray(value)) {
    const row = (await sql<Array<{id: number}>>`
      INSERT INTO wimp_mass_value
        (wimp, parent_value, value_kind, entry_key, entry_order, text_value, number_value, boolean_value)
      VALUES (${src}, ${parentValue}, ${"array"}, ${entryKey}, ${entryOrder}, ${null}, ${null}, ${null})
      RETURNING id
    `)[0]
    if (!row) throw new Error("insertMassValue(array): insert did not return id")
    const id = row.id
    for (let index = 0; index < value.length; index++) {
      await insertMassValue(sql, src, value[index], id, null, index)
    }
    return id
  }

  if (isRecord(value)) {
    const row = (await sql<Array<{id: number}>>`
      INSERT INTO wimp_mass_value
        (wimp, parent_value, value_kind, entry_key, entry_order, text_value, number_value, boolean_value)
      VALUES (${src}, ${parentValue}, ${"object"}, ${entryKey}, ${entryOrder}, ${null}, ${null}, ${null})
      RETURNING id
    `)[0]
    if (!row) throw new Error("insertMassValue(object): insert did not return id")
    const id = row.id
    for (const [childKey, childValue] of Object.entries(value)) {
      await insertMassValue(sql, src, childValue, id, childKey, null)
    }
    return id
  }

  if (typeof value === "string") {
    const row = (await sql<Array<{id: number}>>`
      INSERT INTO wimp_mass_value
        (wimp, parent_value, value_kind, entry_key, entry_order, text_value, number_value, boolean_value)
      VALUES (${src}, ${parentValue}, ${"string"}, ${entryKey}, ${entryOrder}, ${value}, ${null}, ${null})
      RETURNING id
    `)[0]
    if (!row) throw new Error("insertMassValue(string): insert did not return id")
    return row.id
  }

  if (typeof value === "number") {
    const row = (await sql<Array<{id: number}>>`
      INSERT INTO wimp_mass_value
        (wimp, parent_value, value_kind, entry_key, entry_order, text_value, number_value, boolean_value)
      VALUES (${src}, ${parentValue}, ${"number"}, ${entryKey}, ${entryOrder}, ${null}, ${value}, ${null})
      RETURNING id
    `)[0]
    if (!row) throw new Error("insertMassValue(number): insert did not return id")
    return row.id
  }

  if (typeof value === "boolean") {
    const row = (await sql<Array<{id: number}>>`
      INSERT INTO wimp_mass_value
        (wimp, parent_value, value_kind, entry_key, entry_order, text_value, number_value, boolean_value)
      VALUES (${src}, ${parentValue}, ${"boolean"}, ${entryKey}, ${entryOrder}, ${null}, ${null}, ${value ? 1 : 0})
      RETURNING id
    `)[0]
    if (!row) throw new Error("insertMassValue(boolean): insert did not return id")
    return row.id
  }

  const row = (await sql<Array<{id: number}>>`
    INSERT INTO wimp_mass_value
      (wimp, parent_value, value_kind, entry_key, entry_order, text_value, number_value, boolean_value)
    VALUES (${src}, ${parentValue}, ${"null"}, ${entryKey}, ${entryOrder}, ${null}, ${null}, ${null})
    RETURNING id
  `)[0]
  if (!row) throw new Error("insertMassValue(null): insert did not return id")
  return row.id
}

const compareMassRows = (left: WimpMassValueRow, right: WimpMassValueRow): number => {
  if (left.entry_order !== null || right.entry_order !== null) {
    return (left.entry_order ?? 0) - (right.entry_order ?? 0)
  }
  return (left.entry_key ?? "").localeCompare(right.entry_key ?? "")
}

const decodeMassValue = (
  row: WimpMassValueRow,
  childrenByParent: Map<number, WimpMassValueRow[]>,
): unknown => {
  if (row.value_kind === "object") {
    return Object.fromEntries(
      (childrenByParent.get(row.id) ?? [])
        .sort(compareMassRows)
        .map((child) => [child.entry_key ?? "", decodeMassValue(child, childrenByParent)]),
    )
  }
  if (row.value_kind === "array") {
    return (childrenByParent.get(row.id) ?? [])
      .sort(compareMassRows)
      .map((child) => decodeMassValue(child, childrenByParent))
  }
  if (row.value_kind === "string") return row.text_value ?? ""
  if (row.value_kind === "number") return row.number_value ?? 0
  if (row.value_kind === "boolean") return row.boolean_value === 1
  return null
}

export class Mass {
  readonly #wimp: Wimp

  constructor(wimp: Wimp) {
    this.#wimp = wimp
  }

  get wimp(): Wimp {
    return this.#wimp
  }

  async value(): Promise<MetaDSL["mass"]> {
    const rows = await this.wimp.sql<WimpMassValueRow[]>`
      SELECT id, parent_value, value_kind, entry_key, entry_order,
             text_value, number_value, boolean_value
      FROM wimp_mass_value
      WHERE wimp = ${this.wimp.src}
      ORDER BY CASE WHEN parent_value IS NULL THEN 0 ELSE 1 END, entry_order, entry_key, rowid
    `
    const root = rows.find((row) => row.parent_value === null)
    if (!root) return

    const childrenByParent = new Map<number, WimpMassValueRow[]>()
    for (const row of rows) {
      if (row.parent_value === null) continue
      const children = childrenByParent.get(row.parent_value) ?? []
      children.push(row)
      childrenByParent.set(row.parent_value, children)
    }
    return decodeMassValue(root, childrenByParent) as MetaDSL["mass"]
  }

  async set(mass: MetaDSL["mass"]): Promise<void> {
    if (mass === undefined) return
    await this.clear()
    await insertMassValue(this.wimp.sql, this.wimp.src, mass, null, null, null)
  }

  async clear(): Promise<void> {
    await this.wimp.sql`DELETE FROM wimp_mass_value WHERE wimp = ${this.wimp.src}`
  }

  async exists(): Promise<boolean> {
    const row = (
      await this.wimp.sql<Array<{ok: number}>>`
        SELECT 1 AS ok FROM wimp_mass_value WHERE wimp = ${this.wimp.src} LIMIT 1
      `
    )[0]
    return row !== undefined
  }
}
