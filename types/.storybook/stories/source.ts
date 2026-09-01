import type {Element, HTMLElement, Node} from "@zavx0z/dom"

export type GraphDomStorySource = Readonly<{
  html: string
  typescript: string
}>

export function graphJsonStorySource(input: Readonly<{
  element: Element
  typescript: string
}>): GraphDomStorySource {
  return Object.freeze({
    html: serializeElement(input.element),
    typescript: input.typescript,
  })
}

export function graphNodeTreeStorySource(input: Readonly<{
  element: Element
  incremented: boolean
  revision: number
  topologyRevision: number
  frames: number
  nodes: number
  links: number
}>): GraphDomStorySource {
  return Object.freeze({
    html: serializeElement(input.element),
    typescript: [
      'import {createGraphNodeTree, reconcileGraphNodeTree} from "@metafor/node-tree/graph"',
      'import {CheckboxField} from "@ui/components/fields/checkbox-field"',
      'import {createRoot, useState} from "@zavx0z/react"',
      "",
      "function Story() {",
      `  const [incremented, setIncremented] = useState(${String(input.incremented)})`,
      "  const tree = createGraphNodeTree(graph)",
      "  const onChange = (next: boolean) => {",
      "    reconcileGraphNodeTree(tree, nextGraph)",
      "    setIncremented(next)",
      "  }",
      `  // revision ${input.revision}; topology ${input.topologyRevision}`,
      `  // ${input.frames} Frames · ${input.nodes} Nodes · ${input.links} Links`,
      "  return <section data-projection=\"graph-live\">",
      "    <Checkbox checked={incremented} onChange={onChange} />",
      "  </section>",
      "}",
      "",
      "createRoot(container).render(<Story />)",
      `// runtime count = ${input.incremented ? 1 : 0}`,
    ].join("\n"),
  })
}

export function serializeElement(element: Element, depth = 0): string {
  const indent = "  ".repeat(depth)
  const attributes = element.getAttributeNames()
    .sort()
    .map((name) => {
      const value = element.getAttribute(name) ?? ""
      if ((name === "disabled" || name === "hidden") && value === "") return ` ${name}`
      return ` ${name}="${escapeHtml(value)}"`
    })
    .join("")
  const children = [...element.childNodes]
    .filter((node) => node.nodeType === 1 || node.nodeType === 3)
  if (children.length === 0) return `${indent}<${element.localName}${attributes}></${element.localName}>`
  if (children.every((node) => node.nodeType === 3)) {
    return `${indent}<${element.localName}${attributes}>${escapeHtml(element.textContent ?? "")}</${element.localName}>`
  }
  const body = children.map((node: Node) => node.nodeType === 3
    ? `${"  ".repeat(depth + 1)}${escapeHtml(node.textContent ?? "")}`
    : serializeElement(node as HTMLElement, depth + 1)).join("\n")
  return `${indent}<${element.localName}${attributes}>\n${body}\n${indent}</${element.localName}>`
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}
