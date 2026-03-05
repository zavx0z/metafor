import type { ParseContext } from "../parser.t"
import { createNodeDataCondition } from "./condition"
import { createNodeDataLogical } from "./logical"
import { createNodeDataMap } from "./map"
import { createNodeDataMeta } from "./meta"
import { parseText } from "./text"
import { createNodeDataElement } from "./element"
import type { NodeType, PartAttr } from "./index.t"

/** Создает Node из PartAttr. */
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
