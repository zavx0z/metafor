import type { FieldDefinitionJson, FieldKey, FieldsAST } from "@metafor/ast"
import type { NodeMeta } from "index.ts"
import type { FieldInit, MetaFields, WimpFields, WimpValues } from "@dark/types/strong"
import type { Wimp } from "./Wimp.ts"
import { InstanceField } from "./Field.ts"

/**
 * Ленивый вычислитель значения поля.
 */
export type FieldResolver = () => unknown

/**
 * Набор вычислителей по локальным ключам схемы полей.
 */
export type FieldResolvers = Map<FieldKey, FieldResolver>

const hasOwn = (value: object, key: string): boolean => Object.prototype.hasOwnProperty.call(value, key)
/**
 * Поддерживает только простой случай `{ childKey: _[index] }`,
 * потому что на этом шаге нам нужна лишь прямая связь поля родителя с полем ребёнка,
 * а не полноценный граф выражений.
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
 * Строит вычислитель начального значения для поля из схемы.
 *
 * Правила здесь повторяют контракт инициализации меты:
 * `default` побеждает, `required` без `default` падает, optional стартует как `null`.
 *
 * @param key Локальный ключ поля в схеме.
 * @param field Описание поля из `MetaAST.fields`.
 * @returns Ленивую функцию, вычисляющую начальное значение поля.
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

/**
 * Собирает набор начальных вычислителей для всей схемы полей.
 *
 * @param fields Полная схема полей конкретной меты.
 * @returns Отображение `ключ поля -> вычислитель`, используемое для начальной инициализации значений.
 */
export const createFieldValueResolvers = (fields: FieldsAST): FieldResolvers =>
  new Map(Object.entries(fields).map(([key, field]) => [key, createFieldValueResolver(key, field)]))

/**
 * Строит вычислители поверх уже собранных объектных полей конкретного `Wimp`.
 *
 * @param fields Уже собранные локальные объектные поля `Wimp`.
 * @returns Отображение `ключ поля -> вычислитель`, читающее текущие значения из `Field.value`.
 */
export const createRuntimeFieldResolvers = (fields?: WimpFields): FieldResolvers =>
  new Map(Object.entries(fields ?? {}).map(([key, field]) => [key, () => structuredClone(field.value)]))

/**
 * Вычисляет начальные значения из схемы полей без создания `Field`.
 *
 * Нужен как вспомогательная форма чтения и для тестов контрактов инициализации.
 *
 * @param fields Полная схема полей конкретной меты.
 * @returns Уплощённый объект со значениями по правилам инициализации схемы.
 */
export const resolveFieldValues = (fields: FieldsAST): WimpValues => {
  const resolvers = createFieldValueResolvers(fields)

  return Object.fromEntries(Array.from(resolvers, ([key, resolve]) => [key, resolve()]))
}

/**
 * Преобразует `node.fields` из AST в плоский набор значений.
 *
 * @param value AST-описание `fields` у дочернего мета-узла.
 * @param resolvers Источники значений, доступных в выражении `node.fields`.
 * @returns Плоский набор значений для следующего шага подготовки полей.
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
 * Обычные поля могут участвовать в прямой связи по источнику.
 * Топологические поля (`enum`, `array`) на этом шаге исключаются.
 *
 * @param field Схема конкретного поля.
 * @returns `true`, если поле допустимо для прямой связи по источнику.
 */
export const isOrdinaryFieldSchema = (field: FieldDefinitionJson): boolean =>
  !field.type.startsWith("enum<") && !field.type.startsWith("array<")

const resolveDirectFieldSources = (
  expr: string | undefined,
  paths: string[],
  parentFields?: WimpFields,
): Map<FieldKey, InstanceField> => {
  const directSources = new Map<FieldKey, InstanceField>()
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

    // Привязываем только прямую передачу поля родителя в поле ребёнка.
    // Любая более сложная семантика выражений остаётся за пределами этого шага ORM.
    if (key && sourceField && isOrdinaryFieldSchema(sourceField.schema)) {
      directSources.set(key, sourceField)
    }
  }

  return directSources
}

const normalizeFieldInits = (fieldInits: FieldInit[] | undefined, fields: MetaFields): Map<FieldKey, FieldInit> => {
  const initMap = new Map<FieldKey, FieldInit>()

  for (const fieldInit of fieldInits ?? []) {
    // Родительская мета может передать описание поля, которого нет в схеме дочернего `Wimp`.
    // На этапе сборки такие описания просто игнорируются и не попадают в итоговое состояние.
    if (!hasOwn(fields, fieldInit.key)) continue

    initMap.set(fieldInit.key, fieldInit)
  }

  return initMap
}

const resolveFieldSource = (
  schema: FieldDefinitionJson,
  source: InstanceField | null | undefined,
): InstanceField | null => {
  if (!source) return null
  if (!isOrdinaryFieldSchema(schema)) return null
  if (!isOrdinaryFieldSchema(source.schema)) return null
  return source
}

/**
 * Собирает локальные ORM-поля `Wimp` из схемы и временного набора описаний `FieldInit`.
 *
 * @param owner `Wimp`, которому будут принадлежать создаваемые `Field`.
 * @param fields Канонический набор `MetaField` собираемой меты.
 * @param fieldInits Временный набор описаний полей, пришедший от родительского шага обхода.
 * @returns Канонический локальный объектный граф полей конкретного `Wimp`.
 */
export const materializeFields = (owner: Wimp, fields: MetaFields, fieldInits?: FieldInit[]): WimpFields => {
  const initMap = normalizeFieldInits(fieldInits, fields)

  return Object.fromEntries(
    Object.entries(fields).map(([key, metaField]) => {
      const schema = metaField.schema
      const fieldInit = initMap.get(key)
      const value = fieldInit ? fieldInit.value : createFieldValueResolver(key, schema)()
      const source = resolveFieldSource(schema, fieldInit?.source)

      return [key, new InstanceField({ key, owner, metaField, value, source })]
    }),
  )
}

/**
 * Читает объектные поля как плоский набор текущих значений.
 *
 * @param fields Локальный объектный граф полей `Wimp`.
 * @returns Уплощённый объект со значениями `Field.value`.
 */
export const readFieldValues = (fields?: WimpFields): WimpValues | undefined => {
  if (!fields) return

  return Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, structuredClone(field.value)]))
}

/**
 * Строит временный `FieldInit[]` из `node.fields` AST и полей родительского `Wimp`.
 *
 * @param value AST-описание `fields` у дочернего мета-узла.
 * @param parentFields Уже собранные объектные поля родительского `Wimp`.
 * @returns Временный набор описаний, который позже будет превращён в `childWimp.fields`.
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

  // Значение всегда вычисляется как обычный набор данных, а `source` добавляется
  // только там, где удалось доказать прямую связь без дополнительной семантики графа.
  return Object.entries(resolvedObject ?? {}).map(([key, fieldValue]) => {
    const source = directSources.get(key)
    return source ? { key, value: fieldValue, source } : { key, value: fieldValue }
  })
}
