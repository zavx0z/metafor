import type { Condition } from "./condition.ts"
import type { PredicateRow } from "@boundary/types/wimp"

const decodeOperatorKey = (operator: string): string => {
  switch (operator) {
    case "neq":
      return "notEq"
    case "not_in":
      return "notIn"
    case "not_include":
      return "notInclude"
    case "is_empty":
      return "isEmpty"
    case "starts_with":
      return "startsWith"
    case "ends_with":
      return "endsWith"
    case "not_starts_with":
      return "notStartsWith"
    case "not_ends_with":
      return "notEndsWith"
    default:
      return operator
  }
}

const decodeStoredScalar = (
  valueKind: PredicateRow["value_kind"],
  row: Pick<PredicateRow, "value_boolean" | "value_number" | "value_text" | "value_variant">,
  enumVariants: Map<number, string>,
): string | number | boolean | null => {
  switch (valueKind) {
    case "null":
      return null
    case "boolean":
      return row.value_boolean === 1
    case "number":
      return row.value_number ?? 0
    case "string":
      return row.value_text ?? ""
    case "enum":
      return row.value_variant ? (enumVariants.get(row.value_variant) ?? "") : ""
    default:
      return null
  }
}

export class Predicate {
  constructor(
    readonly condition: Condition,
    readonly id: number,
  ) {}

  async order(): Promise<number> {
    const sql = this.condition.transition.state.states.wimp.sql
    const row = (
      await sql<Array<{ predicate_order: number }>>`
        SELECT predicate_order FROM condition_predicate WHERE id = ${this.id} LIMIT 1
      `
    )[0]
    if (!row) throw new Error(`predicate ${this.id} not found`)
    return row.predicate_order
  }

  async operator(): Promise<string> {
    const sql = this.condition.transition.state.states.wimp.sql
    const row = (
      await sql<Array<{ operator: string; value_kind: PredicateRow["value_kind"] }>>`
        SELECT operator, value_kind FROM condition_predicate WHERE id = ${this.id} LIMIT 1
      `
    )[0]
    if (!row) throw new Error(`predicate ${this.id} not found`)
    // null + eq/neq → "null" pseudo-operator (как в DSL).
    if (row.value_kind === "null" && (row.operator === "eq" || row.operator === "neq")) {
      return "null"
    }
    return decodeOperatorKey(row.operator)
  }

  /** Decoded scalar/list value. Для `null`-operator возвращает true/false. */
  async value(): Promise<unknown> {
    const sql = this.condition.transition.state.states.wimp.sql
    const row = (
      await sql<Array<PredicateRow>>`
        SELECT id, condition, predicate_order, operator, value_kind,
               value_boolean, value_number, value_text, value_variant, value_json
        FROM condition_predicate WHERE id = ${this.id} LIMIT 1
      `
    )[0]
    if (!row) throw new Error(`predicate ${this.id} not found`)

    if (row.value_kind === "null" && (row.operator === "eq" || row.operator === "neq")) {
      return row.operator === "eq"
    }

    if (row.value_kind === "list") {
      const items = await sql<Array<{
        value_kind: PredicateRow["value_kind"]
        value_boolean: number | null
        value_number: number | null
        value_text: string | null
        value_variant: number | null
        variant_text: string | null
      }>>`
        SELECT item.value_kind, item.value_boolean, item.value_number,
               item.value_text, item.value_variant,
               variant.item_value AS variant_text
        FROM condition_list_item AS item
        LEFT JOIN field_enum_variant AS variant ON variant.id = item.value_variant
        WHERE item.predicate = ${this.id}
        ORDER BY item.item_order
      `
      return items.map((item) => {
        if (item.value_kind === "enum") return item.variant_text ?? ""
        return decodeStoredScalar(item.value_kind, item, new Map())
      })
    }
    if (row.value_kind === "json") return JSON.parse(row.value_json ?? "null")

    // enum-вариант → его item_value.
    const enumVariants = new Map<number, string>()
    if (row.value_variant) {
      const variantRow = (
        await sql<Array<{ item_value: string }>>`
          SELECT item_value FROM field_enum_variant WHERE id = ${row.value_variant} LIMIT 1
        `
      )[0]
      if (variantRow) enumVariants.set(row.value_variant, variantRow.item_value)
    }
    return decodeStoredScalar(row.value_kind, row, enumVariants)
  }
}
