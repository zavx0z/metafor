import { createNode } from "./index.ts"
import { processBasicAttributes } from "../parser.ts"
import type { ParseContext } from "../parser.t.ts"
import type { NodeElement, PartAttrElement } from "./element.t.ts"

export const createNodeDataElement = (
  node: PartAttrElement,
  context: ParseContext = { pathStack: [], level: 0 }
): NodeElement => ({
  tag: node.tag,
  type: "el",
  ...(node.child && { child: node.child.map((child) => createNode(child, context)) }),
  ...processBasicAttributes(node, context),
})

export const VOID_TAGS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
])
