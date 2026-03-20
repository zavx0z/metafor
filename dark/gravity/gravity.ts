import type { FieldsAST } from "@metafor/ast"
import type { NodeMeta } from "@metafor/dsl"

const getFieldType = (path: string, fields?: FieldsAST): string | undefined => {
  if (!fields || !path.startsWith("/value/")) return

  return fields[path.slice("/value/".length)]?.type
}

const getFieldValues = (path: string, fields?: FieldsAST): Array<string | number> => {
  if (!fields || !path.startsWith("/value/")) return []

  return fields[path.slice("/value/".length)]?.values ?? []
}

const isEnumBoundMetaSrc = (node: NodeMeta, fields?: FieldsAST): boolean => {
  if (typeof node.src !== "object") return false

  const paths = Array.isArray(node.src.data) ? node.src.data : [node.src.data]
  return paths.length === 1 && getFieldType(paths[0]!, fields)?.startsWith("enum") === true
}

const createContinuationSrc = (node: NodeMeta, value: string | number): string => {
  if (typeof node.src !== "object") return node.src

  if (!("expr" in node.src) || node.src.expr === undefined) return String(value)

  const expr = node.src.expr.replaceAll("\\", "\\\\").replaceAll("`", "\\`")
  return String(new Function("_", `return \`${expr}\``)([value]))
}

/**
 * Вычисляет continuation `src` для dynamic meta, привязанной к enum field.
 *
 * Gravity здесь остаётся только topology helper-слоем:
 * он умеет развернуть dynamic `src` в конкретные continuation-адреса,
 * но не управляет traversal, frontier или parent wiring.
 */
export const resolveContinuationSources = (node: NodeMeta, fields?: FieldsAST): string[] => {
  if (typeof node.src !== "object") return []

  const paths = Array.isArray(node.src.data) ? node.src.data : [node.src.data]
  const values = getFieldValues(paths[0]!, fields)

  return values.map((value) => createContinuationSrc(node, value))
}
