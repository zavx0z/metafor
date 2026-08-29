import type {
  Document,
  Element,
  HTMLElement,
  Node,
} from "@zavx0z/dom"
import {hudCss} from "@ui/components/hud"
import {resolveWidgetColors, rgba8ToColor} from "@ui/components/theme"
import {
  bulkHudDocumentCss,
  createBulkHudDocument,
  type BulkHudDocumentController,
  type BulkHudDocumentProps,
} from "../../dom/hud.tsx"

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
.bulk-hud-document {
  position: relative;
  left: auto;
  bottom: auto;
  transform: none;
  width: 100%;
}
`

export const bulkHudStoryCss = `${hudCss}\n${bulkHudDocumentCss}\n${bulkHudStoryPlacementCss}`

const bulkOverviewColors = resolveWidgetColors("box")

const bulkHudOverviewLayoutCss = String.raw`
.bulk-hud-overview {
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
  color: ${rgba8ToColor(bulkOverviewColors.text)};
}

.bulk-hud-overview h2 {
  box-sizing: border-box;
  display: block;
  min-height: 24px;
  margin: 0;
  padding: 4px 7px;
  border-bottom: 1px solid rgb(17, 17, 17);
  color: ${rgba8ToColor(bulkOverviewColors.text)};
  font-size: 12px;
}

.bulk-hud-overview__summary {
  display: block;
  margin: 0;
  padding: 0 7px;
  color: rgb(153, 153, 153);
  font-size: 10px;
}
.bulk-hud-overview__item {
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
.bulk-hud-overview__label {
  box-sizing: border-box;
  display: block;
  height: 24px;
  margin: 0;
  padding: 4px 7px;
  border-bottom: 1px solid rgb(17, 17, 17);
  background: rgb(48, 48, 48);
  color: ${rgba8ToColor(bulkOverviewColors.text)};
  font-size: 11px;
}
.bulk-hud-overview__preview {
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

export const bulkHudOverviewCss = `${bulkHudStoryCss}\n${bulkHudOverviewLayoutCss}`

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
): Readonly<{element: HTMLElement; source: BulkHudStorySource; dispose(): void}> {
  const root = document.createElement("section")
  const title = document.createElement("h2")
  const summary = document.createElement("p")
  const owner = document.createElement("article")
  const label = document.createElement("h3")
  const preview = document.createElement("section")
  const child = createBulkHudStory(document)
  let disposed = false

  root.className = "bulk-hud-overview"
  root.setAttribute("data-route", route)
  root.setAttribute("aria-label", route === "" ? "Bulk overview" : "Bulk HUD overview")
  owner.className = "bulk-hud-overview__item"
  owner.setAttribute("data-child-route", route === "" ? "hud" : "hud/default")
  owner.setAttribute("data-representative-route", "hud/default")
  label.className = "bulk-hud-overview__label"
  summary.className = "bulk-hud-overview__summary"
  preview.className = "bulk-hud-overview__preview"
  title.append(route === "" ? "Bulk · Обзор" : "Bulk HUD · Обзор")
  summary.append("Один semantic document показывает fullscreen action и controlled causal timeline snapshot.")
  label.append("HUD · По умолчанию")
  preview.appendChild(child.element)
  owner.append(label, preview)
  root.append(title, summary, owner)
  return Object.freeze({
    element: root,
    get source() {
      return Object.freeze({
        html: serializeElement(root),
        css: bulkHudOverviewCss,
        typescript: [
          "// HUD · По умолчанию",
          child.source.typescript,
        ].join("\n"),
      })
    },
    dispose() {
      if (disposed) return
      disposed = true
      child.dispose()
    },
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
