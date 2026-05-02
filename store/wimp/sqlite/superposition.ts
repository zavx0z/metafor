
import type { SQL } from "bun"
import type { ConditionListItemRow, PredicateRow } from "./superposition.t.ts"

const decodeStoredScalar = (
  valueKind: PredicateRow["value_kind"],
  row: Pick<PredicateRow, "value_boolean" | "value_number" | "value_text" | "value_variant">,
  enumVariants: Map<string, string>,
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
    default:
      return operator
  }
}

export class State {
  constructor(
    private readonly sql: SQL,
    private readonly src: string,
    readonly name: string,
  ) {}

    async transitions(): Promise<Record<string, unknown>> {
    const stateRow = (
      await this.sql<Array<{ uuid: string }>>`
        SELECT uuid FROM superposition
        WHERE wimp = ${this.src} AND name = ${this.name}
        LIMIT 1
      `
    )[0]
    if (!stateRow) return {}

    const transitionRows = await this.sql<Array<{ uuid: string; to_name: string }>>`
      SELECT transition.uuid AS uuid, target.name AS to_name
      FROM transition
      INNER JOIN superposition AS target ON target.uuid = transition.to_superposition
      WHERE transition.from_superposition = ${stateRow.uuid}
      ORDER BY transition.position
    `
    if (transitionRows.length === 0) return {}

    const result: Record<string, Record<string, unknown>> = {}
    const transitionToTarget = new Map<string, Record<string, unknown>>()
    for (const row of transitionRows) {
      const conditionSet: Record<string, unknown> = {}
      result[row.to_name] = conditionSet
      transitionToTarget.set(row.uuid, conditionSet)
    }

    const conditionRows = await this.sql<Array<{ uuid: string; transition: string; field_key: string }>>`
      SELECT condition.uuid AS uuid, condition.transition AS transition, field.key AS field_key
      FROM condition
      INNER JOIN field ON field.uuid = condition.field
      WHERE condition.transition IN (
        SELECT uuid FROM transition WHERE from_superposition = ${stateRow.uuid}
      )
      ORDER BY condition.position
    `

    const predicateRows = await this.sql<PredicateRow[]>`
      SELECT uuid, condition, predicate_order, operator, value_kind,
             value_boolean, value_number, value_text, value_variant
      FROM condition_predicate
      WHERE condition IN (
        SELECT condition.uuid
        FROM condition
        INNER JOIN transition ON transition.uuid = condition.transition
        WHERE transition.from_superposition = ${stateRow.uuid}
      )
      ORDER BY predicate_order
    `

    const listItemRows = await this.sql<ConditionListItemRow[]>`
      SELECT condition_list_item.predicate AS predicate,
             condition_list_item.item_order AS item_order,
             condition_list_item.value_kind AS value_kind,
             condition_list_item.value_boolean AS value_boolean,
             condition_list_item.value_number AS value_number,
             condition_list_item.value_text AS value_text,
             condition_list_item.value_variant AS value_variant
      FROM condition_list_item
      WHERE condition_list_item.predicate IN (
        SELECT condition_predicate.uuid
        FROM condition_predicate
        INNER JOIN condition ON condition.uuid = condition_predicate.condition
        INNER JOIN transition ON transition.uuid = condition.transition
        WHERE transition.from_superposition = ${stateRow.uuid}
      )
      ORDER BY condition_list_item.item_order
    `

    // Подгружаем enum-variants только те, которые реально упомянуты в predicate/list_item
    // данного state (через UNION двух подзапросов — без bulk-загрузки всех variants меты).
    const enumVariants = new Map<string, string>()
    const variantRows = await this.sql<Array<{ uuid: string; item_value: string }>>`
      SELECT uuid, item_value FROM field_enum_variant
      WHERE uuid IN (
        SELECT condition_predicate.value_variant
        FROM condition_predicate
        INNER JOIN condition ON condition.uuid = condition_predicate.condition
        INNER JOIN transition ON transition.uuid = condition.transition
        WHERE transition.from_superposition = ${stateRow.uuid}
          AND condition_predicate.value_variant IS NOT NULL
        UNION
        SELECT condition_list_item.value_variant
        FROM condition_list_item
        INNER JOIN condition_predicate ON condition_predicate.uuid = condition_list_item.predicate
        INNER JOIN condition ON condition.uuid = condition_predicate.condition
        INNER JOIN transition ON transition.uuid = condition.transition
        WHERE transition.from_superposition = ${stateRow.uuid}
          AND condition_list_item.value_variant IS NOT NULL
      )
    `
    for (const row of variantRows) enumVariants.set(row.uuid, row.item_value)

    const listItems = new Map<string, Array<string | number | boolean | null>>()
    for (const row of listItemRows) {
      const items = listItems.get(row.predicate) ?? []
      items.push(decodeStoredScalar(row.value_kind, row, enumVariants))
      listItems.set(row.predicate, items)
    }

    const predicatesByCondition = new Map<string, PredicateRow[]>()
    for (const row of predicateRows) {
      const rows = predicatesByCondition.get(row.condition) ?? []
      rows.push(row)
      predicatesByCondition.set(row.condition, rows)
    }

    for (const row of conditionRows) {
      const transition = transitionToTarget.get(row.transition)
      if (!transition) continue

      const predicateObject: Record<string, unknown> = {}
      for (const predicate of predicatesByCondition.get(row.uuid) ?? []) {
        if (predicate.value_kind === "null" && (predicate.operator === "eq" || predicate.operator === "neq")) {
          predicateObject.null = predicate.operator === "eq"
          continue
        }

        const value =
          predicate.value_kind === "list"
            ? listItems.get(predicate.uuid) ?? []
            : decodeStoredScalar(predicate.value_kind, predicate, enumVariants)

        predicateObject[decodeOperatorKey(predicate.operator)] = value
      }

      transition[row.field_key] =
        Object.keys(predicateObject).length === 1 && predicateObject.null === true ? null : predicateObject
    }

    return result
  }
}

export class Superposition {
  constructor(
    private readonly sql: SQL,
    private readonly src: string,
  ) {}

  async all(): Promise<State[]> {
    const rows = await this.sql<Array<{ name: string }>>`
      SELECT name FROM superposition WHERE wimp = ${this.src} ORDER BY position
    `
    return rows.map((row) => new State(this.sql, this.src, row.name))
  }

  async get(filter: { name: string }): Promise<State | null> {
    const row = (
      await this.sql<Array<{ ok: number }>>`
        SELECT 1 AS ok FROM superposition
        WHERE wimp = ${this.src} AND name = ${filter.name}
        LIMIT 1
      `
    )[0]
    return row ? new State(this.sql, this.src, filter.name) : null
  }

  async count(): Promise<number> {
    const row = (
      await this.sql<Array<{ count: number }>>`
        SELECT COUNT(*) AS count FROM superposition WHERE wimp = ${this.src}
      `
    )[0]
    return row?.count ?? 0
  }

  async exists(): Promise<boolean> {
    const row = (
      await this.sql<Array<{ ok: number }>>`
        SELECT 1 AS ok FROM superposition WHERE wimp = ${this.src} LIMIT 1
      `
    )[0]
    return row !== undefined
  }
}
