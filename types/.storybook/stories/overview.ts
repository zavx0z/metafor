import type {
  Document,
  Element,
  HTMLElement,
  Node,
} from "@zavx0z/dom"
import {resolveWidgetColors, rgba8ToColor} from "@ui/components/theme"
import type {GraphDomStory} from "./dom-story.ts"
import type {GraphDomStorySource} from "./source.ts"

export type GraphOverviewItem = Readonly<{
  route: string
  label: string
  detail: string
  representativeRoute: string
}>

export type GraphOverviewInput = Readonly<{
  route: string
  title: string
  summary: string
  items: readonly GraphOverviewItem[]
}>

export type GraphOverviewStory = GraphDomStory & Readonly<{
  children: readonly GraphDomStory[]
  ready: Promise<void>
}>

type GraphOverviewLoader = (
  document: Document,
  route: string,
) => Promise<GraphDomStory>

/** Mounts one real production story for every immediate child of an overview. */
export function createGraphOverview(
  document: Document,
  input: GraphOverviewInput,
  load: GraphOverviewLoader,
): GraphOverviewStory {
  const root = document.createElement("section")
  const heading = document.createElement("h2")
  const summary = document.createElement("p")
  const items = document.createElement("div")
  const children: GraphDomStory[] = []
  let disposed = false

  root.className = "graph-overview"
  root.setAttribute("data-route", input.route)
  root.setAttribute("aria-label", `Graph overview: ${input.title}`)
  heading.className = "graph-overview__title"
  summary.className = "graph-overview__summary"
  items.className = "graph-overview__items"
  heading.append(input.title)
  summary.append(input.summary)
  root.append(heading, summary, items)

  const ready = (async (): Promise<void> => {
    try {
      for (const item of input.items) {
        const child = await load(document, item.representativeRoute)
        if (disposed) {
          child.dispose()
          break
        }
        const owner = document.createElement("article")
        const label = document.createElement("h3")
        const detail = document.createElement("p")
        const preview = document.createElement("section")
        owner.className = "graph-overview__item"
        owner.setAttribute("data-child-route", item.route)
        owner.setAttribute("data-representative-route", item.representativeRoute)
        label.className = "graph-overview__label"
        detail.className = "graph-overview__detail"
        preview.className = "graph-overview__preview"
        label.append(item.label)
        detail.append(item.detail)
        preview.appendChild(child.element)
        owner.append(label, detail, preview)
        items.appendChild(owner)
        children.push(child)
      }
    } catch (error) {
      for (const child of children.splice(0)) child.dispose()
      throw error
    }
  })()

  return Object.freeze({
    element: root,
    args: Object.freeze({}),
    get source(): GraphDomStorySource {
      return Object.freeze({
        html: serializeElement(root),
        css: [graphOverviewCss, ...children.map((child) => child.source.css)].join("\n"),
        typescript: children.map((child, index) => [
          `// ${input.items[index]?.label ?? "Preview"}`,
          child.source.typescript,
        ].join("\n")).join("\n\n"),
      })
    },
    children,
    ready,
    dispose() {
      if (disposed) return
      disposed = true
      for (const child of children.splice(0)) child.dispose()
    },
  })
}

const graphOverviewColors = resolveWidgetColors("box")

export const graphOverviewCss = String.raw`
.graph-overview {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  width: 100%;
  min-height: 0;
  flex-grow: 1;
  gap: 4px;
  padding: 4px;
  overflow: auto;
  background: rgb(29, 29, 29);
  color: ${rgba8ToColor(graphOverviewColors.text)};
}
.graph-overview__title {
  box-sizing: border-box;
  display: block;
  min-height: 24px;
  margin: 0;
  padding: 4px 7px;
  border-bottom: 1px solid rgb(17, 17, 17);
  color: ${rgba8ToColor(graphOverviewColors.text)};
  font-size: 12px;
}
.graph-overview__summary {
  display: block;
  margin: 0;
  padding: 0 7px;
  color: rgb(153, 153, 153);
  font-size: 10px;
}
.graph-overview__items {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  width: 100%;
  gap: 4px;
}
.graph-overview__item {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  width: 100%;
  min-height: 180px;
  overflow: hidden;
  border: 1px solid rgb(17, 17, 17);
  border-radius: 4px;
  background: rgb(36, 36, 36);
}
.graph-overview__label {
  box-sizing: border-box;
  display: block;
  height: 24px;
  margin: 0;
  padding: 4px 7px;
  border-bottom: 1px solid rgb(17, 17, 17);
  background: rgb(48, 48, 48);
  color: ${rgba8ToColor(graphOverviewColors.text)};
  font-size: 11px;
}
.graph-overview__detail {
  display: block;
  margin: 0;
  padding: 3px 7px;
  color: rgb(153, 153, 153);
  font-size: 10px;
}
.graph-overview__preview {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  min-height: 0;
  flex-grow: 1;
  overflow: hidden;
  padding: 4px;
}
`

function serializeElement(element: Element, depth = 0): string {
  const indent = "  ".repeat(depth)
  const attributes = element.getAttributeNames()
    .sort()
    .map((name) => ` ${name}="${escapeHtml(element.getAttribute(name) ?? "")}"`)
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
