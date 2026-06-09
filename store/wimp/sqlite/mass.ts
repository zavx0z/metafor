import type {SQL} from "bun"
import type {MetaDSL} from "../../../metafor.t.ts"
import type {Wimp} from "./wimp.ts"
import type {WimpMassValueRow} from "./mass.t.ts"

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const insertMassValue = async (
  sql: SQL,
  src: string,
  value: unknown,
  parentValue: string | null,
  entryKey: string | null,
  entryOrder: number | null,
): Promise<string> => {
  const uuid = crypto.randomUUID()

  if (Array.isArray(value)) {
    await sql`
      INSERT INTO wimp_mass_value
        (uuid, wimp, parent_value, value_kind, entry_key, entry_order, text_value, number_value, boolean_value)
      VALUES (${uuid}, ${src}, ${parentValue}, ${"array"}, ${entryKey}, ${entryOrder}, ${null}, ${null}, ${null})
    `
    for (let index = 0; index < value.length; index++) {
      await insertMassValue(sql, src, value[index], uuid, null, index)
    }
    return uuid
  }

  if (isRecord(value)) {
    await sql`
      INSERT INTO wimp_mass_value
        (uuid, wimp, parent_value, value_kind, entry_key, entry_order, text_value, number_value, boolean_value)
      VALUES (${uuid}, ${src}, ${parentValue}, ${"object"}, ${entryKey}, ${entryOrder}, ${null}, ${null}, ${null})
    `
    for (const [childKey, childValue] of Object.entries(value)) {
      await insertMassValue(sql, src, childValue, uuid, childKey, null)
    }
    return uuid
  }

  if (typeof value === "string") {
    await sql`
      INSERT INTO wimp_mass_value
        (uuid, wimp, parent_value, value_kind, entry_key, entry_order, text_value, number_value, boolean_value)
      VALUES (${uuid}, ${src}, ${parentValue}, ${"string"}, ${entryKey}, ${entryOrder}, ${value}, ${null}, ${null})
    `
    return uuid
  }

  if (typeof value === "number") {
    await sql`
      INSERT INTO wimp_mass_value
        (uuid, wimp, parent_value, value_kind, entry_key, entry_order, text_value, number_value, boolean_value)
      VALUES (${uuid}, ${src}, ${parentValue}, ${"number"}, ${entryKey}, ${entryOrder}, ${null}, ${value}, ${null})
    `
    return uuid
  }

  if (typeof value === "boolean") {
    await sql`
      INSERT INTO wimp_mass_value
        (uuid, wimp, parent_value, value_kind, entry_key, entry_order, text_value, number_value, boolean_value)
      VALUES (${uuid}, ${src}, ${parentValue}, ${"boolean"}, ${entryKey}, ${entryOrder}, ${null}, ${null}, ${value ? 1 : 0})
    `
    return uuid
  }

  await sql`
    INSERT INTO wimp_mass_value
      (uuid, wimp, parent_value, value_kind, entry_key, entry_order, text_value, number_value, boolean_value)
    VALUES (${uuid}, ${src}, ${parentValue}, ${"null"}, ${entryKey}, ${entryOrder}, ${null}, ${null}, ${null})
  `
  return uuid
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
    return (childrenByParent.get(row.uuid) ?? [])
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
      SELECT uuid, parent_value, value_kind, entry_key, entry_order,
             text_value, number_value, boolean_value
      FROM wimp_mass_value
      WHERE wimp = ${this.wimp.src}
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
