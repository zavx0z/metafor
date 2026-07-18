import type {SQL} from "bun"
import type {MatrixConditionValue} from "@metafor/types/matrix/condition"
import type {
  MatrixBraneValue,
  MatrixFieldRecord,
  MatrixInputBrane,
} from "@metafor/types/matrix/data"
import {
  STATE_NONE,
  STATE_UNDEFINED,
  type MatrixRuntimeSnapshot,
} from "@metafor/types/matrix/runtime"

type JsonRecord = Record<string, unknown>

type AtomRow = {
  id: number
  wimp: string
}

type AtomFieldRow = {
  atom: number
  field: number
  value: unknown
}

type AtomStateRow = {
  atom: number
  metaState: number | null
}

type DeclarationRecord = {
  src: string
  section: string
  localId: string
  value: JsonRecord
}

type NormalizedState = {
  id: number
  name: string
  declaration: DeclarationRecord
}

const fieldType = {
  F32: 0,
  U32: 1,
  BOOL: 2,
  STRING_PTR: 3,
  ARRAY_PTR: 4,
} as const

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const integer = (value: unknown): number | null =>
  typeof value === "number" && Number.isSafeInteger(value) ? value : null

const text = (value: unknown): string | null =>
  typeof value === "string" ? value : null

const clone = <T>(value: T): T => structuredClone(value)

const group = <T, K extends string | number>(rows: readonly T[], key: (row: T) => K): Map<K, T[]> => {
  const result = new Map<K, T[]>()
  for (const row of rows) {
    const item = key(row)
    const bucket = result.get(item)
    if (bucket) bucket.push(row)
    else result.set(item, [row])
  }
  return result
}

const sortByPosition = <T extends {value: JsonRecord; localId: string}>(items: readonly T[]): T[] =>
  [...items].sort((left, right) => {
    const leftPosition = Number(left.value.position ?? left.localId)
    const rightPosition = Number(right.value.position ?? right.localId)
    return leftPosition - rightPosition
  })

const matrixBraneValue = (value: unknown): MatrixBraneValue => {
  if (value === null || typeof value === "number" || typeof value === "boolean" || typeof value === "string") {
    return value
  }
  if (Array.isArray(value)) {
    if (value.every((item): item is number => typeof item === "number")) return [...value]
    if (value.every((item): item is boolean => typeof item === "boolean")) return [...value]
    if (value.every((item): item is string => typeof item === "string")) return [...value]
  }
  throw new Error(`Boundary value cannot be encoded in Matrix: ${JSON.stringify(value)}`)
}

const inferArrayElementType = (field: JsonRecord): "number" | "string" | "boolean" => {
  const declared = field.elementType
  if (declared === "number" || declared === "string" || declared === "boolean") return declared
  const sample = Array.isArray(field.default) ? field.default[0] : undefined
  if (typeof sample === "number") return "number"
  if (typeof sample === "boolean") return "boolean"
  return "string"
}

const fallbackFieldValue = (field: JsonRecord, enumValues: readonly unknown[]): MatrixBraneValue => {
  if (Object.prototype.hasOwnProperty.call(field, "default")) return matrixBraneValue(clone(field.default))
  if (field.type === "number") return 0
  if (field.type === "boolean") return false
  if (field.type === "array") return []
  if (field.type === "enum") return matrixBraneValue(enumValues[0] ?? null)
  return ""
}

const matrixField = (field: JsonRecord, enumValues: readonly unknown[]): MatrixFieldRecord => {
  if (field.type === "number") return {type: fieldType.F32}
  if (field.type === "boolean") return {type: fieldType.BOOL}
  if (field.type === "array") return {type: fieldType.ARRAY_PTR, elementType: inferArrayElementType(field)}
  if (field.type === "enum") return {type: fieldType.U32, enum: [...enumValues]}
  return {type: fieldType.STRING_PTR}
}

const predicateValue = (condition: JsonRecord): MatrixConditionValue => {
  const raw = condition.predicate ?? condition.predicates ?? condition.value ?? null
  if (
    raw === null ||
    typeof raw === "number" ||
    typeof raw === "boolean" ||
    typeof raw === "string" ||
    isRecord(raw)
  ) return clone(raw) as MatrixConditionValue
  throw new Error(`Unsupported Matrix condition predicate: ${JSON.stringify(raw)}`)
}

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
  if (kind === "enum") return (await sql<Array<{value: string}>>`
    SELECT variant.item_value AS value
      FROM value_enum JOIN field_enum_variant AS variant ON variant.id = value_enum.variant
     WHERE value_enum.value = ${id}
  `)[0]?.value ?? null
  return (await sql<Array<{value: string}>>`
    SELECT item_value AS value FROM value_list_item WHERE value = ${id} ORDER BY position
  `).map((row) => row.value)
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
  if (field.type === "enum") return {exists: true, value: (await sql<Array<{value: string}>>`
    SELECT variant.item_value AS value
      FROM field_enum_default AS default_value
      JOIN field_enum_variant AS variant ON variant.id = default_value.variant
     WHERE default_value.field = ${field.id}
  `)[0]?.value ?? null}
  return {exists: true, value: (await sql<Array<{value: string}>>`
    SELECT item_value AS value FROM field_array_default_item WHERE field = ${field.id} ORDER BY position
  `).map((row) => row.value)}
}

const conditionPredicate = async (sql: SQL, condition: number): Promise<JsonRecord> => {
  const result: JsonRecord = {}
  for (const row of await sql<Array<{
    id: number; operator: string; valueKind: string; valueBoolean: number | null;
    valueNumber: number | null; valueText: string | null; valueVariant: number | null
  }>>`
    SELECT id, operator, value_kind AS valueKind, value_boolean AS valueBoolean,
           value_number AS valueNumber, value_text AS valueText, value_variant AS valueVariant
      FROM condition_predicate WHERE condition = ${condition} ORDER BY predicate_order
  `) {
    const operator = row.operator === "neq" ? "notEq"
      : row.operator === "not_in" ? "notIn"
        : row.operator === "not_include" ? "notInclude"
          : row.operator === "is_empty" ? "isEmpty"
            : row.operator
    let value: unknown = null
    if (row.valueKind === "boolean") value = row.valueBoolean === 1
    else if (row.valueKind === "number") value = row.valueNumber
    else if (row.valueKind === "string") value = row.valueText
    else if (row.valueKind === "enum") value = (await sql<Array<{value: string}>>`
      SELECT item_value AS value FROM field_enum_variant WHERE id = ${row.valueVariant}
    `)[0]?.value ?? null
    else if (row.valueKind === "list") value = (await sql<Array<{valueKind: string; valueBoolean: number | null; valueNumber: number | null; valueText: string | null}>>`
      SELECT value_kind AS valueKind, value_boolean AS valueBoolean, value_number AS valueNumber, value_text AS valueText
        FROM condition_list_item WHERE predicate = ${row.id} ORDER BY item_order
    `).map((item) => item.valueKind === "boolean" ? item.valueBoolean === 1 : item.valueKind === "number" ? item.valueNumber : item.valueKind === "string" ? item.valueText : null)
    result[operator] = value
  }
  return result
}

const relationalDeclarations = async (sql: SQL): Promise<DeclarationRecord[]> => {
  const declarations: DeclarationRecord[] = []
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

/**
 * Builds a target-specific, fully derived bootstrap projection for Matrix.
 * Boundary remains the canonical materialized world; Matrix may discard and
 * rebuild this value at any time.
 */
export async function matrixRuntime(sql: SQL): Promise<MatrixRuntimeSnapshot> {
  const atoms = await sql<AtomRow[]>`
    SELECT id, wimp FROM atom ORDER BY id
  `
  const atomFields: AtomFieldRow[] = []
  for (const row of await sql<Array<{atom: number; field: number; valueId: number}>>`
    SELECT atom, field, value AS valueId FROM atom_value ORDER BY atom, field
  `) atomFields.push({atom: Number(row.atom), field: Number(row.field), value: await readValue(sql, Number(row.valueId))})
  const atomStates = await sql<AtomStateRow[]>`
    SELECT atom, metaState FROM atom_state ORDER BY atom
  `

  const declarations = await relationalDeclarations(sql)

  const declarationsByWimpSection = group(declarations, (item) => `${item.src}\0${item.section}`)
  const valuesByAtomField = new Map(
    atomFields.map((row) => [`${Number(row.atom)}\0${Number(row.field)}`, row.value] as const),
  )
  const selectedStateByAtom = new Map(atomStates.map((row) => [Number(row.atom), row.metaState] as const))

  const enumVariantRecordsByField = new Map<number, DeclarationRecord[]>()
  for (const variant of declarations.filter((item) => item.section === "variants")) {
    const fieldId = integer(variant.value.field)
    if (fieldId === null) continue
    const bucket = enumVariantRecordsByField.get(fieldId)
    if (bucket) bucket.push(variant)
    else enumVariantRecordsByField.set(fieldId, [variant])
  }
  const enumValuesByField = new Map<number, unknown[]>()
  for (const [fieldId, variants] of enumVariantRecordsByField) {
    enumValuesByField.set(
      fieldId,
      sortByPosition(variants).map((variant) => clone(variant.value.itemValue)),
    )
  }

  const dataFields: MatrixFieldRecord[] = []
  const branes: MatrixInputBrane[] = []
  const stateNames: string[][] = []
  const atomIdByBraneIndex: number[] = []
  const braneIndexByAtomId: Array<[number, number]> = []
  const wimpSrcByAtomId: Array<[number, string]> = []
  const atomIdsByWimpSrc = new Map<string, number[]>()
  const runtimeFieldIndexByAtomFieldId: Array<[number, number, number]> = []
  const runtimeFieldIndexByWimpFieldId: Array<[number, number]> = []
  const wimpFieldIdsByRuntimeFieldIndex: number[][] = []
  const braneIndexByWimpFieldId: Array<[number, number]> = []
  const topologyWimpFieldIds: number[] = []
  const topologyAtomFieldIds: Array<[number, number]> = []
  const stateMetaStateIdsByBraneIndex: number[][] = []
  const stateHasProcessByBraneIndex: boolean[][] = []
  const runtimeFieldIndexByAtomField = new Map<string, number>()
  let nextProjectionFieldId = 1

  for (let braneIndex = 0; braneIndex < atoms.length; braneIndex++) {
    const atom = atoms[braneIndex]!
    const fieldRecords = sortByPosition(
      declarationsByWimpSection.get(`${atom.wimp}\0fields`) ?? [],
    )
    const stateRecords = sortByPosition(
      declarationsByWimpSection.get(`${atom.wimp}\0states`) ?? [],
    )
    const transitionRecords = sortByPosition(
      declarationsByWimpSection.get(`${atom.wimp}\0transitions`) ?? [],
    )
    const conditionRecords = sortByPosition(
      declarationsByWimpSection.get(`${atom.wimp}\0conditions`) ?? [],
    )
    const processRecords = declarationsByWimpSection.get(`${atom.wimp}\0processes`) ?? []

    atomIdByBraneIndex.push(Number(atom.id))
    braneIndexByAtomId.push([Number(atom.id), braneIndex])
    wimpSrcByAtomId.push([Number(atom.id), atom.wimp])
    const atomIds = atomIdsByWimpSrc.get(atom.wimp)
    if (atomIds) atomIds.push(Number(atom.id))
    else atomIdsByWimpSrc.set(atom.wimp, [Number(atom.id)])

    const values: MatrixInputBrane["values"] = []
    for (const fieldRecord of fieldRecords) {
      const fieldId = integer(fieldRecord.value.id)
      if (fieldId === null) continue
      const runtimeFieldIndex = dataFields.length
      const variants = enumValuesByField.get(fieldId) ?? []
      const storedValue = valuesByAtomField.get(`${atom.id}\0${fieldId}`)
      const value = storedValue === undefined
        ? fallbackFieldValue(fieldRecord.value, variants)
        : matrixBraneValue(clone(storedValue))
      // This compact address exists only inside one derived Matrix snapshot.
      // Canonical identity remains the explicit (atomId, fieldId) pair below.
      const wimpFieldId = nextProjectionFieldId++

      dataFields.push(matrixField(fieldRecord.value, variants))
      values.push([runtimeFieldIndex, value])
      runtimeFieldIndexByAtomField.set(`${atom.id}\0${fieldId}`, runtimeFieldIndex)
      runtimeFieldIndexByAtomFieldId.push([Number(atom.id), fieldId, runtimeFieldIndex])
      runtimeFieldIndexByWimpFieldId.push([wimpFieldId, runtimeFieldIndex])
      wimpFieldIdsByRuntimeFieldIndex[runtimeFieldIndex] = [wimpFieldId]
      braneIndexByWimpFieldId.push([wimpFieldId, braneIndex])

      if (fieldRecord.value.type === "enum" || fieldRecord.value.type === "array") {
        topologyWimpFieldIds.push(wimpFieldId)
        topologyAtomFieldIds.push([Number(atom.id), fieldId])
      }
    }

    const normalizedStates: NormalizedState[] = stateRecords.flatMap((state) => {
      const id = integer(state.value.id)
      const name = text(state.value.name) ?? text(state.value.key)
      return id === null || name === null ? [] : [{id, name, declaration: state}]
    })
    const stateIndexById = new Map(normalizedStates.map((state, index) => [state.id, index] as const))
    const stateNamesForAtom = normalizedStates.map((state) => state.name)
    const stateIdsForAtom = normalizedStates.map((state) => state.id)

    const selectedStateId = selectedStateByAtom.get(Number(atom.id))
    const selectedState = normalizedStates.length === 0
      ? STATE_NONE
      : selectedStateId === null || selectedStateId === undefined
        ? STATE_UNDEFINED
        : (stateIndexById.get(Number(selectedStateId)) ?? STATE_UNDEFINED)

    const processStateNames = new Set(
      processRecords
        .map((process) => text(process.value.state) ?? text(process.value.key) ?? process.localId)
        .filter((name) => name.length > 0),
    )

    const conditionsByTransition = group(conditionRecords, (condition) => integer(condition.value.transition) ?? -1)
    const transitionsByState = group(transitionRecords, (transition) => integer(transition.value.fromState) ?? -1)
    const collapses: MatrixInputBrane["collapses"] = normalizedStates.map((state) =>
      (transitionsByState.get(state.id) ?? []).map((transition) => {
        const transitionId = integer(transition.value.id)
        const targetId = integer(transition.value.toState)
        if (transitionId === null || targetId === null) return null
        const targetState = stateIndexById.get(targetId)
        if (targetState === undefined) return null
        const transitionConditions: Record<number, MatrixConditionValue> = {}
        for (const condition of conditionsByTransition.get(transitionId) ?? []) {
          const fieldId = integer(condition.value.field)
          if (fieldId === null) continue
          const runtimeFieldIndex = runtimeFieldIndexByAtomField.get(`${atom.id}\0${fieldId}`)
          if (runtimeFieldIndex === undefined) continue
          transitionConditions[runtimeFieldIndex] = predicateValue(condition.value)
        }
        return [targetState, transitionConditions]
      }),
    )

    stateNames[braneIndex] = stateNamesForAtom
    stateMetaStateIdsByBraneIndex[braneIndex] = stateIdsForAtom
    stateHasProcessByBraneIndex[braneIndex] = stateNamesForAtom.map((name) => processStateNames.has(name))
    branes.push({values, state: selectedState, collapses})
  }

  return {
    ok: true,
    version: 1,
    runtime: {
      atomIdByBraneIndex,
      braneIndexByAtomId,
      wimpSrcByAtomId,
      atomIdsByWimpSrc: [...atomIdsByWimpSrc.entries()].map(([src, atomIds]) => [src, [...atomIds]]),
      runtimeFieldIndexByAtomFieldId,
    },
    data: {fields: dataFields, branes, stateNames},
    strong: {
      runtimeFieldIndexByWimpFieldId,
      wimpFieldIdsByRuntimeFieldIndex,
      braneIndexByWimpFieldId,
      topologyWimpFieldIds,
      topologyAtomFieldIds,
    },
    weak: {
      stateMetaStateIdsByBraneIndex,
      stateHasProcessByBraneIndex,
    },
  }
}
