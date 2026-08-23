import {Field} from "./field.ts"

export class NumberField extends Field {
  readonly type = "number" as const

  async default(): Promise<number | undefined> {
    const row = (
      await this.fields.wimp.sql<Array<{ default_value: number }>>`
          SELECT nd.default_value
          FROM field f
                   INNER JOIN field_number_default nd ON nd.field = f.id
          WHERE f.wimp = ${this.fields.wimp.src}
            AND f.key = ${this.key}
      `
    )[0]
    return row?.default_value
  }

  async setDefault(value: number): Promise<void> {
    if (typeof value !== "number" || Number.isNaN(value)) {
      throw new Error(`NumberField.setDefault: expected finite number, got ${String(value)}`)
    }
    const id = await this.id()
    await this.ensureDefaultRow(id)
    const sql = this.fields.wimp.sql
    await sql`DELETE FROM field_number_default WHERE field = ${id}`
    await sql`INSERT INTO field_number_default (field, default_value) VALUES (${id}, ${value})`
  }
}
