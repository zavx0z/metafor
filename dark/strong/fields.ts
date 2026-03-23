import type { FieldDefinitionJson, FieldKey, FieldsAST } from "@metafor/ast"
import type { NodeMeta } from "@metafor/dsl"
import type { FieldInit, WimpFields, WimpValues } from "@dark/types/strong"
import type { Wimp } from "./Wimp.ts"
import { Field } from "./Field.ts"

/**
 * Ленивый resolver значения поля.
 */
export type FieldResolver = () => unknown

/**
 * Набор resolvers по локальным ключам field schema.
 */
export type FieldResolvers = Map<FieldKey, FieldResolver>

const hasOwn = (value: object, key: string): boolean => Object.prototype.hasOwnProperty.call(value, key)
/**
 * Поддерживает только простой случай `{ childKey: _[index] }`,
 * потому что на этом шаге нам нужен лишь прямой ordinary field-link,
 * а не полноценный expression graph.
 */
const DIRECT_FIELD_LINK_RE = /(?:^|,)\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*:\s*_\[(\d+)\]\s*(?=,|$)/g

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

/**
 * Строит resolver стартового runtime значения для schema field.
 *
 * Правила здесь повторяют initialization-контракт meta:
 * `default` побеждает, `required` без `default` падает, optional стартует как `null`.
 */
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

/**
 * Строит resolvers поверх уже materialized object fields конкретного `Wimp`.
 */
export const createRuntimeFieldResolvers = (fields?: WimpFields): FieldResolvers =>
  new Map(Object.entries(fields ?? {}).map(([key, field]) => [key, () => structuredClone(field.value)]))

/**
 * Вычисляет стартовые runtime values из schema fields без materialization `Field`.
 *
 * Нужен как вспомогательный read-model helper и для тестов контрактов инициализации.
 */
export const resolveFieldValues = (fields: FieldsAST): WimpValues => {
  const resolvers = createFieldValueResolvers(fields)

  return Object.fromEntries(Array.from(resolvers, ([key, resolve]) => [key, resolve()]))
}

/**
 * Вычисляет `node.fields` AST в плоский object payload.
 */
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

/**
 * Ordinary fields могут участвовать в прямом `source`-linking.
 * Topology fields (`enum`, `array`) на этом шаге исключаются.
 */
export const isOrdinaryFieldSchema = (field: FieldDefinitionJson): boolean =>
  !field.type.startsWith("enum<") && !field.type.startsWith("array<")

const resolveDirectFieldSources = (
  expr: string | undefined,
  paths: string[],
  parentFields?: WimpFields,
): Map<FieldKey, Field> => {
  const directSources = new Map<FieldKey, Field>()
  if (!expr || !parentFields) return directSources

  const normalized = expr.trim()
  if (!normalized.startsWith("{") || !normalized.endsWith("}")) return directSources

  const body = normalized.slice(1, -1)
  for (const match of body.matchAll(DIRECT_FIELD_LINK_RE)) {
    const key = match[1]
    const index = Number(match[2])
    const path = paths[index]
    const sourceKey = path && extractFieldKey(path)
    const sourceField = sourceKey ? parentFields[sourceKey] : undefined

    // Привязываем только прямую передачу parent field -> child field.
    // Любая более сложная expression-семантика остаётся за пределами этого шага ORM.
    if (key && sourceField && isOrdinaryFieldSchema(sourceField.schema)) {
      directSources.set(key, sourceField)
    }
  }

  return directSources
}

const normalizeFieldInits = (fieldInits: FieldInit[] | undefined, fields: FieldsAST): Map<FieldKey, FieldInit> => {
  const initMap = new Map<FieldKey, FieldInit>()

  for (const fieldInit of fieldInits ?? []) {
    // Parent meta может передать build-поле, которого нет в schema дочернего `Wimp`.
    // На этапе materialization такие init просто игнорируются, не превращаясь в runtime state.
    if (!hasOwn(fields, fieldInit.key)) continue

    initMap.set(fieldInit.key, fieldInit)
  }

  return initMap
}

const resolveFieldSource = (schema: FieldDefinitionJson, source: Field | null | undefined): Field | null => {
  if (!source) return null
  if (!isOrdinaryFieldSchema(schema)) return null
  if (!isOrdinaryFieldSchema(source.schema)) return null
  return source
}

/**
 * Materialize-ит локальные ORM-поля `Wimp` из schema и временного build-пакета `FieldInit`.
 */
export const materializeFields = (owner: Wimp, fields: FieldsAST, fieldInits?: FieldInit[]): WimpFields => {
  const initMap = normalizeFieldInits(fieldInits, fields)

  return Object.fromEntries(
    Object.entries(fields).map(([key, schema]) => {
      const fieldInit = initMap.get(key)
      const value = fieldInit ? fieldInit.value : createFieldValueResolver(key, schema)()
      const source = resolveFieldSource(schema, fieldInit?.source)

      return [key, new Field({ key, owner, schema, value, source })]
    }),
  )
}

/**
 * Читает object fields как плоский runtime values object.
 */
export const readFieldValues = (fields?: WimpFields): WimpValues | undefined => {
  if (!fields) return

  return Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, structuredClone(field.value)]))
}

/**
 * Строит временный `FieldInit[]` из `node.fields` AST и parent object fields.
 */
export const resolveNodeFieldInits = (
  value: NodeMeta["fields"] | undefined,
  parentFields?: WimpFields,
): FieldInit[] | undefined => {
  if (value === undefined) return

  if (typeof value === "string") {
    return Object.entries(toFieldObject(evaluateAstExpression(value, []))).map(([key, fieldValue]) => ({
      key,
      value: fieldValue,
    }))
  }

  const resolvedObject = resolveNodeFieldValues(value, createRuntimeFieldResolvers(parentFields))
  const paths = Array.isArray(value.data) ? value.data : [value.data]
  const directSources = resolveDirectFieldSources("expr" in value ? value.expr : undefined, paths, parentFields)

  // Значение всегда вычисляется как обычный object payload, а `source` добавляется
  // только там, где удалось доказать прямой ordinary-link без дополнительной graph-семантики.
  return Object.entries(resolvedObject ?? {}).map(([key, fieldValue]) => {
    const source = directSources.get(key)
    return source ? { key, value: fieldValue, source } : { key, value: fieldValue }
  })
}
