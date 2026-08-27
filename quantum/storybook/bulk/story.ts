import type {
  Document,
  Element,
  HTMLElement,
  Node,
} from "@zavx0z/dom"
import {hudCss} from "@ui/components/hud"
import {
  bulkHudDocumentCss,
  createBulkHudDocument,
  type BulkHudDocumentController,
  type BulkHudDocumentProps,
} from "../../bulk/dom/hud.ts"

export type BulkHudStorySource = Readonly<{
  html: string
  css: string
  typescript: string
}>

export type BulkHudDomStory = Readonly<{
  element: HTMLElement
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
  causalTimeline: Object.freeze({
    title: "Время · causal stack",
    min: 0,
    max: 24,
    current: 16,
    playing: false,
    tracks: Object.freeze([
      causalTrack("force", "Force"),
      causalTrack("mass", "Mass"),
      causalTrack("boundary", "Boundary"),
    ]),
  }),
})

const bulkHudStoryPlacementCss = String.raw`
.storybook-dom-workbench__preview-host .bulk-hud-document {
  position: relative;
  left: auto;
  bottom: auto;
  transform: none;
  width: 100%;
}
`

export const bulkHudStoryCss = `${hudCss}\n${bulkHudDocumentCss}\n${bulkHudStoryPlacementCss}`

export const bulkHudOverviewCss = String.raw`
.bulk-hud-overview {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  width: 620px;
  min-height: 260px;
  gap: 12px;
  padding: 18px;
  border: 1px solid #484848;
  border-radius: 6px;
  background: #181c22;
  color: #e0e0e0;
}

.bulk-hud-overview h2 {
  display: block;
  color: #7edcec;
  font-size: 16px;
}

.bulk-hud-overview p,
.bulk-hud-overview li {
  display: block;
  color: #b0b0b0;
  font-size: 12px;
}
`

export function createBulkHudStory(
  document: Document,
  initialProps: BulkHudDocumentProps = bulkHudStoryDefaultProps,
): BulkHudDomStory {
  const controller = createBulkHudDocument(document, initialProps)
  let currentProps = controller.props
  let disposed = false

  const story: BulkHudDomStory = Object.freeze({
    element: controller.element,
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
  return story
}

export function createBulkHudOverview(
  document: Document,
  route: "" | "hud",
): Readonly<{element: HTMLElement; source: BulkHudStorySource}> {
  const root = document.createElement("section")
  const title = document.createElement("h2")
  const summary = document.createElement("p")
  const list = document.createElement("ul")
  const item = document.createElement("li")
  root.className = "bulk-hud-overview"
  root.setAttribute("data-route", route)
  title.append(route === "" ? "Bulk · Обзор" : "Bulk HUD · Обзор")
  summary.append("Один semantic document показывает fullscreen action и controlled causal timeline snapshot.")
  item.append("HUD · По умолчанию")
  list.appendChild(item)
  root.append(title, summary, list)
  return Object.freeze({
    element: root,
    source: Object.freeze({
      html: serializeElement(root),
      css: bulkHudOverviewCss,
      typescript: [
        'import {createDocument} from "@zavx0z/dom"',
        "",
        "const document = createDocument()",
        'const root = document.createElement("section")',
        'root.className = "bulk-hud-overview"',
        `root.setAttribute("data-route", ${JSON.stringify(route)})`,
        "document.appendChild(root)",
      ].join("\n"),
    }),
  })
}

function causalTrack(key: string, label: string) {
  return Object.freeze({
    key,
    label,
    markers: Object.freeze([
      Object.freeze({key: "frame-1", tick: 4, label: "frame 1", selected: false}),
      Object.freeze({key: "frame-2", tick: 16, label: "frame 2", selected: true}),
    ]),
  })
}

function bulkHudSource(root: HTMLElement, props: BulkHudDocumentProps): BulkHudStorySource {
  return Object.freeze({
    html: serializeElement(root),
    css: bulkHudStoryCss,
    typescript: [
      'import {createDocument} from "@zavx0z/dom"',
      'import {createBulkHudDocument} from "../../bulk/dom/hud.ts"',
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
