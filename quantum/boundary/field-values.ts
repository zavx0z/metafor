import type {ReservedSQL, SQL} from "bun"
import {resolveForceFieldId} from "shared/protocol/force/fields"
import {readBoundaryValue} from "./world"

type Database = SQL | ReservedSQL
export type BoundaryRuntimeField = {
  id: number
  key: string
  type: "string" | "number" | "boolean" | "array" | "enum"
  required: number
}

export function boundaryFieldValueMatches(type: BoundaryRuntimeField["type"], required: boolean, value: unknown, variants: readonly string[]): boolean {
  if (value === null) return !required
  if (type === "string") return typeof value === "string"
  if (type === "number") return typeof value === "number" && Number.isFinite(value)
  if (type === "boolean") return typeof value === "boolean"
  if (type === "array") return Array.isArray(value) && Array.from(value).every(entry => typeof entry === "number" && Number.isFinite(entry))
  return typeof value === "string" && variants.includes(value)
}

/** Полная read-only проверка одного write-set; planner и commit используют одинаковые type/CAS/entanglement правила. */
export async function validateBoundaryFieldValues(sql: Database, atom: number, fields: Record<string, unknown>, expectedFields: Record<string, unknown>): Promise<
  | {ok: true; wimp: string; declarations: BoundaryRuntimeField[]; topology: boolean}
  | {ok: false; reason: "value_mismatch" | "entangled_conflict"; fields: string[]}
> {
  const owner = (await sql<Array<{wimp: string}>>`SELECT wimp FROM atom WHERE id = ${atom}`)[0]
  if (!owner) throw new Error(`Boundary Fields Atom is unavailable: ${atom}`)
  const declarations = await sql<BoundaryRuntimeField[]>`SELECT id, key, type, required FROM field WHERE wimp = ${owner.wimp}`
  const byId = new Map(declarations.map(field => [Number(field.id), field]))
  const proposed = new Map<number, {field: BoundaryRuntimeField; value: unknown; expected: unknown}>()
  for (const [address, value] of Object.entries(fields)) {
    const id = resolveForceFieldId(address)
    const field = id === null ? undefined : byId.get(id)
    if (!field || !Object.hasOwn(expectedFields, address)) throw new Error(`Boundary Fields cannot write undeclared Field: ${address}`)
    const variants = field.type === "enum"
      ? (await sql<Array<{value: string}>>`SELECT item_value AS value FROM field_enum_variant WHERE field = ${field.id}`).map(row => row.value)
      : []
    if (!boundaryFieldValueMatches(field.type, field.required === 1, value, variants)) throw new Error(`Boundary Field value does not match ${field.type} declaration: ${field.key}`)
    proposed.set(Number(field.id), {field, value, expected: expectedFields[address]})
  }
  const topologyCount = [...proposed.values()].filter(update => update.field.type === "enum" || update.field.type === "array").length
  const mismatched: string[] = []
  const entangled: string[] = []
  const values = new Map<number, {field: string; value: unknown}>()
  for (const [id, update] of proposed) {
    const binding = (await sql<Array<{value: number}>>`SELECT value FROM atom_value WHERE atom = ${atom} AND field = ${id}`)[0]
    const current = binding ? await readBoundaryValue(sql, Number(binding.value)) : null
    if (JSON.stringify(current) !== JSON.stringify(update.expected)) mismatched.push(update.field.key)
    if (!binding) continue
    for (const alias of await sql<BoundaryRuntimeField[]>`
      SELECT field.id, field.key, field.type, field.required FROM atom_value
        JOIN field ON field.id = atom_value.field WHERE atom_value.value = ${binding.value}
    `) {
      const variants = alias.type === "enum"
        ? (await sql<Array<{value: string}>>`SELECT item_value AS value FROM field_enum_variant WHERE field = ${alias.id}`).map(row => row.value)
        : []
      if (!boundaryFieldValueMatches(alias.type, alias.required === 1, update.value, variants)) entangled.push(update.field.key)
    }
    const previous = values.get(Number(binding.value))
    if (previous && JSON.stringify(previous.value) !== JSON.stringify(update.value)) entangled.push(previous.field, update.field.key)
    else values.set(Number(binding.value), {field: update.field.key, value: update.value})
  }
  if (mismatched.length) return {ok: false, reason: "value_mismatch", fields: mismatched}
  if (entangled.length) return {ok: false, reason: "entangled_conflict", fields: [...new Set(entangled)]}
  return {ok: true, wimp: owner.wimp, declarations: [...proposed.values()].map(update => update.field),
    topology: topologyCount > 0}
}
