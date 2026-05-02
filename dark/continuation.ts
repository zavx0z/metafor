import type {FieldDefinition, FieldKey, MetaDSL} from "../index.ts"
import type {MatterRelationBindingValue} from "../store/wimp/sqlite/matter.t.ts"

/**
 * Описание начальной инициализации поля при материализации child wimp.
 * Если задан `source` — поле share-ит value.uuid с указанным родительским полем (entanglement).
 */
export interface FieldInit {
  key: FieldKey
  /** Резолвленное runtime-значение (применяется когда нет share). */
  value: unknown
  /** Ссылка на родительское поле для разделения value.uuid через actor_value FK. */
  source?: {
    parentActorUuid: string
    parentFieldKey: FieldKey
  }
}

export interface Continuation {
  fieldInits?: FieldInit[]
  mass?: unknown
}

const DIRECT_FIELD_LINK_RE = /(?:^|,)\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*:\s*_\[(\d+)\]\s*(?=,|$)/g

const isOrdinaryFieldType = (type: string): boolean =>
  type !== "enum" && type !== "array" && !type.startsWith("enum<") && !type.startsWith("array<")

const evaluateAstExpression = (expr: string, values: unknown[]): unknown =>
  new Function("_", `return (${expr})`)(values)

const extractFieldKey = (path: string): FieldKey | undefined => {
  if (path.startsWith("/value/")) return path.slice("/value/".length)
  if (path.startsWith("/fields/")) return path.slice("/fields/".length)
  return undefined
}

const toFieldObject = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Meta fields expression must resolve to an object")
  }
  return structuredClone(value as Record<string, unknown>)
}

/**
 * Собирает прямые ссылки `childKey: _[index]` в выражении binding для last-mile entanglement.
 * Возвращает map `childKey -> parentFieldKey`. Только для ordinary полей (enum/array исключены).
 */
const resolveDirectFieldSources = (
  expr: string | undefined,
  paths: string[],
  parentFieldTypes: Map<FieldKey, string>,
): Map<FieldKey, FieldKey> => {
  const directSources = new Map<FieldKey, FieldKey>()
  if (!expr) return directSources

  const normalized = expr.trim()
  if (!normalized.startsWith("{") || !normalized.endsWith("}")) return directSources

  const body = normalized.slice(1, -1)
  for (const match of body.matchAll(DIRECT_FIELD_LINK_RE)) {
    const childKey = match[1]
    const index = Number(match[2])
    const path = paths[index]
    const parentKey = path && extractFieldKey(path)
    if (!childKey || !parentKey) continue
    const parentType = parentFieldTypes.get(parentKey)
    if (!parentType) continue
    if (!isOrdinaryFieldType(parentType)) continue
    directSources.set(childKey, parentKey)
  }
  return directSources
}

/**
 * Превращает `fieldsBinding` дочернего wimp-узла в массив `FieldInit`'ов.
 *
 * @param binding значение `node.fields` из AST: либо string-выражение, либо `{data, expr}`.
 * @param parent контекст ближайшего actor предка: его actor uuid, snapshot значений полей,
 *   и map типов (для решения direct-link entanglement).
 */
export const resolveFieldInits = (
  binding: MatterRelationBindingValue | undefined,
  parent: {
    actorUuid: string
    fieldValues: Map<FieldKey, unknown>
    fieldTypes: Map<FieldKey, string>
  },
): FieldInit[] | undefined => {
  if (binding === undefined) return undefined

  if (typeof binding === "string") {
    return Object.entries(toFieldObject(evaluateAstExpression(binding, []))).map(([key, value]) => ({
      key,
      value,
    }))
  }

  if (typeof binding !== "object" || binding === null) {
    throw new Error("Meta fields binding must be a string or object relation")
  }

  const paths = (Array.isArray(binding.data) ? binding.data : [binding.data]).filter(
    (p): p is string => typeof p === "string",
  )
  const parentValues = paths.map((path) => {
    const key = extractFieldKey(path)
    if (!key) return null
    return structuredClone(parent.fieldValues.get(key) ?? null)
  })

  const resolved =
    binding.expr !== undefined
      ? toFieldObject(evaluateAstExpression(binding.expr, parentValues))
      : toFieldObject(parentValues[0])

  const directSources = resolveDirectFieldSources(binding.expr, paths, parent.fieldTypes)

  return Object.entries(resolved).map(([key, value]) => {
    const sourceParentKey = directSources.get(key)
    if (sourceParentKey) {
      return {key, value, source: {parentActorUuid: parent.actorUuid, parentFieldKey: sourceParentKey}}
    }
    return {key, value}
  })
}

/**
 * Default-значение поля по правилам схемы: `default` побеждает, `required` без `default` падает,
 * optional стартует как `null`.
 */
export const fieldDefaultValue = (key: FieldKey, schema: FieldDefinition): unknown => {
  if (Object.prototype.hasOwnProperty.call(schema, "default")) {
    return structuredClone((schema as {default?: unknown}).default)
  }
  if (schema.required === true) {
    throw new Error(`Field "${key}" is required but has no default`)
  }
  return null
}

/**
 * Финальные значения полей wimp на момент его материализации:
 * объединяет default-значения (по DSL-схеме) и `fieldInits` от родителя.
 */
export const finalizeFieldValues = (
  fieldSchemas: NonNullable<MetaDSL["fields"]>,
  fieldInits: FieldInit[] | undefined,
): Map<FieldKey, FieldInit> => {
  const initMap = new Map<FieldKey, FieldInit>()
  for (const init of fieldInits ?? []) {
    if (!Object.prototype.hasOwnProperty.call(fieldSchemas, init.key)) continue
    initMap.set(init.key, init)
  }

  const finalValues = new Map<FieldKey, FieldInit>()
  for (const [key, schema] of Object.entries(fieldSchemas)) {
    const init = initMap.get(key)
    if (init !== undefined) {
      // Источник применим только для ordinary↔ordinary связи; топологические поля исключены.
      const source =
        init.source && isOrdinaryFieldType(schema.type) ? init.source : undefined
      finalValues.set(key, source ? {key, value: init.value, source} : {key, value: init.value})
    } else {
      finalValues.set(key, {key, value: fieldDefaultValue(key, schema)})
    }
  }
  return finalValues
}
