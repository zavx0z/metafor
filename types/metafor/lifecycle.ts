/**
 * Declarative native lifecycle inputs owned by Meta, persisted by Boundary.
 * Native adapters provide events; ordinary Fields and Processes retain policy.
 * See [Meta lifecycle](../../create-metafor/rules/metafor.md#lifecycle-вход-meta).
 * @packageDocumentation
 */
import type {Fields, Values} from "./fields"

export type MetaLifecycleEvent = "started" | "stopping"
export type MetaLifecycleValue = string | number | boolean | null
export type MetaLifecycleBinding = {field: string; value: MetaLifecycleValue}
export type MetaLifecycle = Partial<Record<MetaLifecycleEvent, MetaLifecycleBinding>>

type OrdinaryFieldKey<Schema extends Fields> = {
  [Key in keyof Schema]: Schema[Key]["type"] extends "string" | "number" | "boolean" ? Key : never
}[keyof Schema]

type FieldBinding<Schema extends Fields> = {
  [Key in OrdinaryFieldKey<Schema>]: {field: Key & string; value: Values<Schema>[Key]}
}[OrdinaryFieldKey<Schema>]

/** Field key and scalar value remain correlated with the preceding .fields declaration. */
export type MetaLifecycleInput<Schema extends Fields> = Partial<Record<MetaLifecycleEvent, FieldBinding<Schema>>>

export type MetaLifecycleField = {key: string; type: string; required?: boolean}

const record = (value: unknown): value is Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) return false
  return Reflect.ownKeys(value).every(key => {
    const property = Object.getOwnPropertyDescriptor(value, key)
    return typeof key === "string" && property?.enumerable && "value" in property
  })
}

/**
 * Validates detached serializable bindings. Supplying Fields also checks the
 * declared ordinary key, matching scalar type and nullable/required boundary.
 * Boundary may validate shape before a streamed Field declaration arrives;
 * complete Meta and Graph validation always supplies the full Field set.
 */
export function normalizeMetaLifecycle(value: unknown, fields?: readonly MetaLifecycleField[]): MetaLifecycle | undefined {
  if (value === undefined) return
  if (!record(value) || Object.keys(value).some(key => key !== "started" && key !== "stopping")) throw new Error("Meta lifecycle must contain only started/stopping bindings")
  const result: MetaLifecycle = {}
  for (const event of ["started", "stopping"] as const) {
    if (!Object.hasOwn(value, event)) continue
    const binding = value[event]
    if (!record(binding) || Object.keys(binding).length !== 2 || !Object.hasOwn(binding, "field") || !Object.hasOwn(binding, "value") ||
        typeof binding.field !== "string" || !binding.field.trim()) throw new Error(`Meta lifecycle ${event} requires field and value`)
    const scalar = binding.value
    if (!(scalar === null || typeof scalar === "string" || typeof scalar === "boolean" || typeof scalar === "number" && Number.isFinite(scalar))) throw new Error(`Meta lifecycle ${event} value must be an ordinary scalar`)
    if (fields) {
      const matches = fields.filter(field => field.key === binding.field)
      const field = matches[0]
      if (matches.length !== 1 || !field || !["string", "number", "boolean"].includes(field.type)) throw new Error(`Meta lifecycle ${event} Field must be one declared ordinary Field: ${binding.field}`)
      if (scalar === null ? field.required === true : typeof scalar !== field.type) throw new Error(`Meta lifecycle ${event} value does not match Field ${binding.field}`)
    }
    result[event] = {field: binding.field, value: scalar}
  }
  return result
}
