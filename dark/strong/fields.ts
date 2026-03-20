import type { FieldDefinitionJson, FieldKey, FieldsAST } from "@metafor/ast"
import type { NodeMeta } from "@metafor/dsl"
import type { WimpValues } from "@dark/types/part"

export type FieldResolver = () => unknown
export type FieldResolvers = Map<FieldKey, FieldResolver>

const hasOwn = (value: object, key: string): boolean => Object.prototype.hasOwnProperty.call(value, key)

const evaluateAstExpression = (expr: string, values: unknown[]): unknown => new Function("_", `return (${expr})`)(values)

const extractFieldKey = (path: string): FieldKey | undefined => {
  if (path.startsWith("/value/")) return path.slice("/value/".length)
  if (path.startsWith("/fields/")) return path.slice("/fields/".length)
}

const resolveFieldPathValue = (path: string, resolvers: FieldResolvers): unknown => {
  const key = extractFieldKey(path)
  if (!key) return null

  const resolver = resolvers.get(key)
  if (!resolver) throw new Error(`Field resolver is not found for path "${path}"`)
  return resolver()
}

const toFieldObject = (value: unknown): WimpValues => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Meta fields expression must resolve to an object")
  }

  return structuredClone(value as WimpValues)
}

export const createFieldValueResolver = (key: FieldKey, field: FieldDefinitionJson): FieldResolver => {
  if (hasOwn(field, "default")) {
    return () => structuredClone(field.default)
  }

  if (field.required === true) {
    return () => {
      throw new Error(`Field "${key}" is required but has no default`)
    }
  }

  return () => null
}

export const createFieldValueResolvers = (fields: FieldsAST): FieldResolvers =>
  new Map(Object.entries(fields).map(([key, field]) => [key, createFieldValueResolver(key, field)]))

export const resolveFieldValues = (fields: FieldsAST): WimpValues => {
  const resolvers = createFieldValueResolvers(fields)

  return Object.fromEntries(Array.from(resolvers, ([key, resolve]) => [key, resolve()]))
}

export const resolveNodeFieldValues = (
  value: NodeMeta["fields"] | undefined,
  resolvers: FieldResolvers,
): WimpValues | undefined => {
  if (value === undefined) return

  if (typeof value === "string") {
    return toFieldObject(evaluateAstExpression(value, []))
  }

  const paths = Array.isArray(value.data) ? value.data : [value.data]
  const values = paths.map((path) => resolveFieldPathValue(path, resolvers))

  if ("expr" in value) {
    return toFieldObject(evaluateAstExpression(value.expr, values))
  }

  return toFieldObject(values[0])
}
