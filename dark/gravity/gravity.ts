import type { FieldsAST } from "@metafor/ast"
import type { NodeMeta, NodeType } from "@metafor/dsl"
import type { FuzzySeed, ParticleSeed, SeedParent, WimpSeed } from "@dark/types/gravity"

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

// Gravity здесь остаётся только набором topology helpers: он переводит AST-узел в seed, но не владеет обходом.
export const createParticleSeed = (node: NodeType, parent: SeedParent, fields?: FieldsAST): ParticleSeed | undefined => {
  switch (node.type) {
    case "meta":
      if (typeof node.src === "string") {
        return {
          kind: "wimp",
          src: node.src,
          node,
          parent,
          meta: {},
        }
      }

      if (!isEnumBoundMetaSrc(node, fields)) {
        throw new Error("Dynamic meta src must be bound to a single enum field")
      }

      return { kind: "fuzzy", node, parent, meta: {} }
    case "cond":
      return { kind: "fuzzy", node, parent, meta: {} }
    case "log":
      return {
        kind: "axion",
        node,
        parent,
        meta: {},
      }
    case "map":
      return {
        kind: "macho",
        node,
        parent,
        meta: {},
      }
    default:
      return
  }
}

// Continuation для enum-bound meta строятся отдельно, чтобы dark мог сам решать порядок следующего frontier.
export const createContinuationSeeds = (node: NodeMeta, parent: FuzzySeed, fields?: FieldsAST): WimpSeed[] => {
  if (typeof node.src !== "object") return []

  const paths = Array.isArray(node.src.data) ? node.src.data : [node.src.data]
  const values = getFieldValues(paths[0]!, fields)

  return values.map((value) => ({
    kind: "wimp",
    src: createContinuationSrc(node, value),
    node,
    parent,
    meta: {},
  }))
}
