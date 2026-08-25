import type {Fields} from "@metafor/types/metafor/fields"
import type {Node} from "@zavx0z/template"

type NodeMeta = Extract<Node, {type: "meta"}>

const getFieldValues = (path: string, fields?: Fields): Array<string | number> => {
  if (!fields) return []

  return [...(fields[path]?.values ?? [])]
}

type DynamicMetaSource = Exclude<NonNullable<NodeMeta["src"]>, string>

const createContinuationSrc = (src: DynamicMetaSource, value: string | number): string => {
  if (!("expr" in src) || src.expr === undefined) return String(value)

  const expr = src.expr.replaceAll("\\", "\\\\").replaceAll("`", "\\`")
  return String(new Function("_", `return \`${expr}\``)([value]))
}

/**
 * Вычисляет continuation `src` для dynamic meta, привязанной к enum field.
 *
 * Gravity здесь остаётся только topology helper-слоем:
 * он умеет развернуть dynamic `src` в конкретные continuation-адреса,
 * но не управляет traversal, frontier или parent wiring.
 */
export const resolveContinuationSources = (node: NodeMeta, fields?: Fields): string[] => {
  const src = node.src
  if (typeof src !== "object") return []

  const paths = Array.isArray(src.data) ? src.data : [src.data]
  const values = getFieldValues(paths[0]!, fields)

  return values.map((value) => createContinuationSrc(src, value))
}
