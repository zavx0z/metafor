import type { Database } from "bun:sqlite"
import type { MetaDSL } from "../../.."
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

export const getSuperposition = (
  db: Database,
  src: string,
  enumVariants: Map<string, string>,
): NonNullable<MetaDSL["superposition"]> | undefined => {
  const stateRows = db.query(`SELECT uuid, name FROM superposition WHERE meta = ? ORDER BY position`).all(src) as Array<{
    uuid: string
    name: string
  }>
  if (stateRows.length === 0) return

  const superposition: NonNullable<MetaDSL["superposition"]> = {}
  const stateNames = new Map<string, string>()
  for (const row of stateRows) {
    stateNames.set(row.uuid, row.name)
    superposition[row.name] = {}
  }

  const transitionRows = db.query(
    `SELECT uuid, from_superposition, to_superposition
     FROM transition
     WHERE from_superposition IN (SELECT uuid FROM superposition WHERE meta = ?)
     ORDER BY position`,
  ).all(src) as Array<{ uuid: string; from_superposition: string; to_superposition: string }>

  const transitions = new Map<string, Record<string, unknown>>()
  for (const row of transitionRows) {
    const fromName = stateNames.get(row.from_superposition)
    const toName = stateNames.get(row.to_superposition)
    if (!fromName || !toName) continue

    const conditionSet: Record<string, unknown> = {}
    ;(superposition[fromName] as Record<string, unknown>)[toName] = conditionSet
    transitions.set(row.uuid, conditionSet)
  }

  const conditionRows = db.query(
    `SELECT condition.uuid AS uuid, condition.transition AS transition, field.key AS field_key
     FROM condition
     INNER JOIN field ON field.uuid = condition.field
     WHERE condition.transition IN (
       SELECT transition.uuid
       FROM transition
       INNER JOIN superposition ON superposition.uuid = transition.from_superposition
       WHERE superposition.meta = ?
     )
     ORDER BY condition.position`,
  ).all(src) as Array<{ uuid: string; transition: string; field_key: string }>

  const predicateRows = db.query(
    `SELECT uuid, condition, predicate_order, operator, value_kind, value_boolean, value_number, value_text, value_variant
     FROM condition_predicate
     WHERE condition IN (
       SELECT condition.uuid
       FROM condition
       INNER JOIN transition ON transition.uuid = condition.transition
       INNER JOIN superposition ON superposition.uuid = transition.from_superposition
       WHERE superposition.meta = ?
     )
     ORDER BY predicate_order`,
  ).all(src) as PredicateRow[]

  const listItemRows = db.query(
    `SELECT condition_list_item.predicate AS predicate,
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
       INNER JOIN superposition ON superposition.uuid = transition.from_superposition
       WHERE superposition.meta = ?
     )
     ORDER BY condition_list_item.item_order`,
  ).all(src) as ConditionListItemRow[]

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
    const transition = transitions.get(row.transition)
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

  return superposition
}
