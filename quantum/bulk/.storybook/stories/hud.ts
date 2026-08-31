import type {
  Document,
  Element,
  HTMLElement,
  Node,
} from "@zavx0z/dom"
import type {ComponentRoot} from "@zavx0z/react"
import {
  createBulkHudDocument,
  type BulkHudDocumentController,
  type BulkHudDocumentProps,
} from "../../dom/hud.tsx"
import {
  buildBulkCausalTimePresentation,
  readBulkTimeFrames,
} from "../../dom/causal-time.ts"

export type BulkHudStorySource = Readonly<{
  html: string
  typescript: string
}>

export type BulkHudDomStory = Readonly<{
  element: HTMLElement
  componentRoot: Pick<ComponentRoot, "readStyleSheets">
  controller: BulkHudDocumentController
  props: BulkHudDocumentProps
  source: BulkHudStorySource
  update(props: BulkHudDocumentProps): void
  dispose(): void
}>

export const bulkHudStoryDefaultProps: BulkHudDocumentProps = Object.freeze({
  title: "Bulk Visual",
  subtitle: "Causal projection",
  fullscreen: false,
  fullscreenDisabled: false,
  causalTime: buildBulkCausalTimePresentation(readBulkTimeFrames([
    {id: 1, frontier: {acceptanceSequence: 4}, resolution: "exact"},
    {id: 2, frontier: {acceptanceSequence: 16}, resolution: "degraded"},
  ]), 1, "paused"),
})

export function createBulkHudStory(
  document: Document,
  initialProps: BulkHudDocumentProps = bulkHudStoryDefaultProps,
): BulkHudDomStory {
  const controller = createBulkHudDocument(document, initialProps)
  let currentProps = controller.props
  let disposed = false

  return Object.freeze({
    element: controller.element,
    componentRoot: controller.componentRoot,
    controller,
    get props() { return currentProps },
    get source() { return bulkHudSource(controller.element, currentProps) },
    update(props) {
      if (disposed) throw new Error("BulkHudStory is disposed")
      controller.update(props)
      currentProps = controller.props
    },
    dispose() {
      if (disposed) return
      disposed = true
      controller.dispose()
    },
  })
}

function bulkHudSource(root: HTMLElement, props: BulkHudDocumentProps): BulkHudStorySource {
  return Object.freeze({
    html: serializeElement(root),
    typescript: [
      'import {createDocument} from "@zavx0z/dom"',
      'import {createBulkHudDocument} from "../../dom/hud.tsx"',
      "",
      "const document = createDocument()",
      `const props = ${JSON.stringify(props, null, 2)}`,
      "const controller = createBulkHudDocument(document, props)",
      "document.appendChild(controller.element)",
    ].join("\n"),
  })
}

function serializeElement(element: Element, depth = 0): string {
  const indent = "  ".repeat(depth)
  const attributes = element.getAttributeNames()
    .sort()
    .map((name) => {
      const value = element.getAttribute(name) ?? ""
      if ((name === "disabled" || name === "hidden") && value === "") return ` ${name}`
      return ` ${name}="${escapeAttribute(value)}"`
    })
    .join("")
  const children = [...element.childNodes]
    .filter((node) => node.nodeType === 1 || node.nodeType === 3)
  if (children.length === 0) return `${indent}<${element.localName}${attributes}></${element.localName}>`
  if (children.every((node) => node.nodeType === 3)) {
    return `${indent}<${element.localName}${attributes}>${escapeText(element.textContent ?? "")}</${element.localName}>`
  }
  const content = children.map((node) => serializeNode(node, depth + 1)).join("\n")
  return `${indent}<${element.localName}${attributes}>\n${content}\n${indent}</${element.localName}>`
}

function serializeNode(node: Node, depth: number): string {
  if (node.nodeType === 3) return `${"  ".repeat(depth)}${escapeText(node.textContent ?? "")}`
  return serializeElement(node as Element, depth)
}

function escapeText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
}

function escapeAttribute(value: string): string {
  return escapeText(value).replaceAll('"', "&quot;")
}
