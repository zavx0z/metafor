import { createNode } from "."
import { processBasicAttributes } from "../parser"
import type { ParseContext } from "../parser.t"
import type { NodeElement, PartAttrElement } from "./element.t"

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
