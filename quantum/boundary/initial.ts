import type {SQL} from "bun"
import type {
  BoundaryInitialDeclaration,
  BoundaryInitialState,
  BoundaryInitialVariantRef,
} from "@metafor/types/boundary/initial"
type JsonRecord = Record<string, unknown>

type AtomRow = {
  id: number
  wimp: string
}

type AtomFieldRow = {
  atom: number
  field: number
  valueId: number
  value: unknown
}

type AtomStateRow = {
  atom: number
  metaState: number | null
}

const variantRef = (variant: number): BoundaryInitialVariantRef => ({kind: "enum", variant})

const readValue = async (sql: SQL, id: number): Promise<unknown> => {
  const kind = (await sql<Array<{kind: string}>>`SELECT kind FROM value WHERE id = ${id}`)[0]?.kind
  if (kind === undefined || kind === "null") return null
  if (kind === "boolean") return (await sql<Array<{value: number}>>`
    SELECT boolean AS value FROM value_boolean WHERE value = ${id}
  `)[0]?.value === 1
  if (kind === "number") return Number((await sql<Array<{value: number}>>`
    SELECT number AS value FROM value_number WHERE value = ${id}
  `)[0]?.value ?? 0)
  if (kind === "string") return (await sql<Array<{value: string}>>`
    SELECT text AS value FROM value_string WHERE value = ${id}
  `)[0]?.value ?? ""
  if (kind === "enum") {
    const variant = (await sql<Array<{variant: number}>>`
      SELECT variant FROM value_enum WHERE value = ${id}
    `)[0]?.variant
    return variant === undefined ? null : variantRef(Number(variant))
  }
  return (await sql<Array<{value: string}>>`
    SELECT item_value AS value FROM value_list_item WHERE value = ${id} ORDER BY position
  `).map((row) => Number(row.value))
}

const fieldDefaultValue = async (sql: SQL, field: {id: number; type: string}): Promise<{exists: boolean; value?: unknown}> => {
  const exists = (await sql<Array<{ok: number}>>`SELECT 1 AS ok FROM field_default WHERE field = ${field.id}`)[0]
  if (!exists) return {exists: false}
  if (field.type === "string") return {exists: true, value: (await sql<Array<{value: string}>>`
    SELECT default_value AS value FROM field_string_default WHERE field = ${field.id}
  `)[0]?.value ?? ""}
  if (field.type === "number") return {exists: true, value: Number((await sql<Array<{value: number}>>`
    SELECT default_value AS value FROM field_number_default WHERE field = ${field.id}
  `)[0]?.value ?? 0)}
  if (field.type === "boolean") return {exists: true, value: (await sql<Array<{value: number}>>`
    SELECT default_value AS value FROM field_boolean_default WHERE field = ${field.id}
  `)[0]?.value === 1}
  if (field.type === "enum") {
    const variant = (await sql<Array<{variant: number}>>`
      SELECT variant FROM field_enum_default WHERE field = ${field.id}
    `)[0]?.variant
    return {exists: true, value: variant === undefined ? null : variantRef(Number(variant))}
  }
  return {exists: true, value: (await sql<Array<{value: string}>>`
    SELECT item_value AS value FROM field_array_default_item WHERE field = ${field.id} ORDER BY position
  `).map((row) => Number(row.value))}
}

const conditionPredicate = async (sql: SQL, condition: number): Promise<JsonRecord> => {
  const result: JsonRecord = {}
  for (const row of await sql<Array<{
    id: number; operator: string; valueKind: string; valueBoolean: number | null;
    valueNumber: number | null; valueText: string | null; valueVariant: number | null;
    valueJson: string | null
  }>>`
    SELECT id, operator, value_kind AS valueKind, value_boolean AS valueBoolean,
           value_number AS valueNumber, value_text AS valueText, value_variant AS valueVariant,
           value_json AS valueJson
      FROM condition_predicate WHERE condition = ${condition} ORDER BY predicate_order
  `) {
    const operator = row.valueKind === "null" && (row.operator === "eq" || row.operator === "neq")
      ? "null"
      : row.operator === "neq" ? "notEq"
      : row.operator === "not_in" ? "notIn"
        : row.operator === "not_include" ? "notInclude"
          : row.operator === "is_empty" ? "isEmpty"
            : row.operator === "starts_with" ? "startsWith"
              : row.operator === "ends_with" ? "endsWith"
                : row.operator === "not_starts_with" ? "notStartsWith"
                  : row.operator === "not_ends_with" ? "notEndsWith"
                    : row.operator
    let value: unknown = row.valueKind === "null" ? row.operator === "eq" : null
    if (row.valueKind === "boolean") value = row.valueBoolean === 1
    else if (row.valueKind === "number") value = row.valueNumber
    else if (row.valueKind === "string") value = row.valueText
    else if (row.valueKind === "json") value = JSON.parse(row.valueJson ?? "null")
    else if (row.valueKind === "enum") value = row.valueVariant === null ? null : variantRef(Number(row.valueVariant))
    else if (row.valueKind === "list") value = (await sql<Array<{
      valueKind: string; valueBoolean: number | null; valueNumber: number | null;
      valueText: string | null; valueVariant: number | null
    }>>`
      SELECT value_kind AS valueKind, value_boolean AS valueBoolean, value_number AS valueNumber,
             value_text AS valueText, value_variant AS valueVariant
        FROM condition_list_item WHERE predicate = ${row.id} ORDER BY item_order
    `).map((item) => item.valueKind === "boolean"
      ? item.valueBoolean === 1
      : item.valueKind === "number"
        ? item.valueNumber
        : item.valueKind === "string"
          ? item.valueText
          : item.valueKind === "enum" && item.valueVariant !== null
            ? variantRef(Number(item.valueVariant))
            : null)
    result[operator] = value
  }
  return result
}

const relationalDeclarations = async (sql: SQL): Promise<BoundaryInitialDeclaration[]> => {
  const declarations: BoundaryInitialDeclaration[] = []
  for (const row of await sql<Array<{
    id: number; src: string; localId: number; key: string; type: string; required: number; label: string | null
  }>>`
    SELECT id, wimp AS src, local_id AS localId, key, type, required, label
      FROM field ORDER BY wimp, local_id
  `) {
    const fallback = await fieldDefaultValue(sql, row)
    declarations.push({
      src: row.src, section: "fields", localId: String(row.localId),
      value: {
        id: Number(row.id), wimp: row.src, localId: Number(row.localId), key: row.key,
        type: row.type, required: row.required === 1, label: row.label,
        ...(fallback.exists ? {default: fallback.value} : {}),
      },
    })
  }
  for (const row of await sql<Array<{id: number; src: string; localId: number; field: number; position: number; itemValue: string}>>`
    SELECT id, wimp AS src, local_id AS localId, field, position, item_value AS itemValue
      FROM field_enum_variant ORDER BY wimp, local_id
  `) declarations.push({src: row.src, section: "variants", localId: String(row.localId), value: {...row}})
  for (const row of await sql<Array<{id: number; src: string; localId: number; name: string; position: number}>>`
    SELECT id, wimp AS src, local_id AS localId, name, position FROM state ORDER BY wimp, local_id
  `) declarations.push({src: row.src, section: "states", localId: String(row.localId), value: {...row}})
  for (const row of await sql<Array<{id: number; src: string; localId: number; fromState: number; toState: number; position: number}>>`
    SELECT id, wimp AS src, local_id AS localId, from_state AS fromState, to_state AS toState, position
      FROM transition ORDER BY wimp, local_id
  `) declarations.push({src: row.src, section: "transitions", localId: String(row.localId), value: {...row}})
  for (const row of await sql<Array<{id: number; src: string; localId: number; transition: number; field: number; position: number}>>`
    SELECT id, wimp AS src, local_id AS localId, transition, field, position
      FROM condition ORDER BY wimp, local_id
  `) declarations.push({
    src: row.src, section: "conditions", localId: String(row.localId),
    value: {...row, predicate: await conditionPredicate(sql, Number(row.id))},
  })
  for (const row of await sql<Array<{id: number; src: string; localId: number; key: string}>>`
    SELECT id, wimp AS src, local_id AS localId, key FROM process ORDER BY wimp, local_id
  `) declarations.push({src: row.src, section: "processes", localId: String(row.localId), value: {...row, state: row.key}})
  return declarations
}

/** Reads canonical Boundary rows without preparing another domain's Store. */
export async function readBoundaryInitialState(sql: SQL): Promise<BoundaryInitialState> {
  const atoms = await sql<AtomRow[]>`
    SELECT id, wimp FROM atom ORDER BY id
  `
  const atomFields: AtomFieldRow[] = []
  for (const row of await sql<Array<{atom: number; field: number; valueId: number}>>`
    SELECT atom, field, value AS valueId FROM atom_value ORDER BY atom, field
  `) atomFields.push({
    atom: Number(row.atom),
    field: Number(row.field),
    valueId: Number(row.valueId),
    value: await readValue(sql, Number(row.valueId)),
  })
  const atomStates = await sql<AtomStateRow[]>`
    SELECT atom, metaState FROM atom_state ORDER BY atom
  `
  const pendingProcessExecutions = await sql<Array<{
    executionId: string
    atom: number
    process: number
    state: string
  }>>`
    SELECT execution_id AS executionId, atom, process, state
      FROM boundary_process_execution
     WHERE status = ${"pending"}
     ORDER BY atom, created_at, execution_id
  `

  const valuesByAtom = new Map<number, Array<{field: number; valueId: number; value: unknown}>>()
  for (const row of atomFields) {
    const values = valuesByAtom.get(row.atom)
    const value = {field: row.field, valueId: row.valueId, value: structuredClone(row.value)}
    if (values) values.push(value)
    else valuesByAtom.set(row.atom, [value])
  }
  const stateByAtom = new Map(atomStates.map((row) => [Number(row.atom), row.metaState] as const))
  return {
    version: 1,
    atoms: atoms.map((atom) => ({
      id: Number(atom.id),
      wimp: atom.wimp,
      values: valuesByAtom.get(Number(atom.id)) ?? [],
      state: stateByAtom.get(Number(atom.id)) ?? null,
    })),
    declarations: await relationalDeclarations(sql),
    pendingProcessExecutions: pendingProcessExecutions.map((execution) => ({
      executionId: execution.executionId,
      atom: Number(execution.atom),
      process: Number(execution.process),
      state: execution.state,
    })),
  }
}
