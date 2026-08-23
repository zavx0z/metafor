import type { ParseContext } from "@metafor/template/types/parser"
import { createNodeDataCondition } from "./condition.ts"
import { createNodeDataLogical } from "./logical.ts"
import { createNodeDataMap } from "./map.ts"
import { createNodeDataMeta } from "./meta.ts"
import { parseText } from "./text.ts"
import { createNodeDataElement } from "./element.ts"
import type {NodeType, PartAttr} from "@metafor/template/types/node/index"

/** Создает NodeType из PartAttr. */
export const createNode = (node: PartAttr, context: ParseContext): NodeType => {
  switch (node.type) {
    case "map":
      return createNodeDataMap(node, context)
    case "cond":
      return createNodeDataCondition(node, context)
    case "log":
      return createNodeDataLogical(node, context)
    case "text":
      return parseText(node.text, context)
    case "el":
      return createNodeDataElement(node, context)
    case "meta":
      return createNodeDataMeta(node, context)
    default:
      return node
  }
}
