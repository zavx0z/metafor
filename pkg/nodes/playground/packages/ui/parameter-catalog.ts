import type {FieldDefinition} from "@ui/components/field"

export const NODE_PARAMETER_FIELD_KINDS = Object.freeze([
  "text",
  "number",
  "integer",
  "boolean",
  "enum",
  "color",
  "vector",
  "rotation",
  "matrix",
  "reference",
  "collection",
  "path",
  "readonly",
] as const satisfies readonly FieldDefinition["kind"][])

export type NodeParameterFieldKind = typeof NODE_PARAMETER_FIELD_KINDS[number]

export const NODE_PARAMETER_FIELD_LABELS = Object.freeze({
  text: "Текст",
  number: "Число",
  integer: "Целое число",
  boolean: "Логическое значение",
  enum: "Выбор",
  color: "Цвет",
  vector: "Вектор",
  rotation: "Вращение",
  matrix: "Матрица",
  reference: "Ссылка",
  collection: "Коллекция",
  path: "Путь",
  readonly: "Только чтение",
} satisfies Readonly<Record<NodeParameterFieldKind, string>>)

export const NODE_PARAMETER_VARIANTS = Object.freeze([
  "field",
  "input",
  "output",
  "both",
  "connected",
] as const)

export type NodeParameterVariant = typeof NODE_PARAMETER_VARIANTS[number]

export const NODE_PARAMETER_VARIANT_LABELS = Object.freeze({
  field: "Только Field",
  input: "Вход",
  output: "Выход",
  both: "Вход и выход",
  connected: "Подключён",
} satisfies Readonly<Record<NodeParameterVariant, string>>)

export type NodeParameterStoryRoute = `parameter/${NodeParameterFieldKind}/${NodeParameterVariant}`

export const NODE_PARAMETER_FALLBACK_ROUTE = "parameter/text/field" as const satisfies NodeParameterStoryRoute

export function nodeParameterStoryRoute(
  kind: NodeParameterFieldKind,
  variant: NodeParameterVariant,
): NodeParameterStoryRoute {
  return `parameter/${kind}/${variant}`
}
