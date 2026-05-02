import {Field} from "./field.ts"

export class ArrayField extends Field {
  readonly type = "array" as const

  async default(): Promise<number[] | undefined> {
    const rows = await this.fields.wimp.sql<Array<{ item_value: string }>>`
        SELECT item.item_value AS item_value
        FROM field f
                 INNER JOIN field_array_default_item item ON item.field = f.uuid
        WHERE f.wimp = ${this.fields.wimp.src}
          AND f.key = ${this.key}
        ORDER BY item.position
    `
    if (rows.length === 0) return undefined
    return rows.map((row) => Number(row.item_value))
  }

  async setDefault(values: number[]): Promise<void> {
    if (!Array.isArray(values)) {
      throw new Error(`ArrayField.setDefault: expected number[], got ${typeof values}`)
    }
    const uuid = await this.uuid()
    await this.ensureDefaultRow(uuid)
    const sql = this.fields.wimp.sql
    await sql`DELETE FROM field_array_default_item WHERE field = ${uuid}`
    for (let i = 0; i < values.length; i++) {
      const item = values[i]
      const itemUuid = crypto.randomUUID()
      await sql`
          INSERT INTO field_array_default_item (uuid, field, position, item_value)
          VALUES (${itemUuid}, ${uuid}, ${i}, ${String(item)})
      `
    }
  }
}
