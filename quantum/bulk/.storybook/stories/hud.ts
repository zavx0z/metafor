import type {
  Document,
  Element,
  HTMLElement,
  Node,
} from "@zavx0z/dom"
import type {ComponentRoot} from "@zavx0z/react"
import {
  createBulkHudController,
  type BulkFullscreenHost,
  type BulkHudController,
} from "../../dom/hud-controller.ts"
import {
  type BulkHudDocumentProps,
} from "../../dom/hud.tsx"
import {
  buildBulkCausalTimePresentation,
  type BulkCausalTimeTransport,
  readBulkTimeFrames,
} from "../../dom/causal-time.ts"

export type BulkHudStorySource = Readonly<{
  html: string
  typescript: string
}>

export type BulkHudDomStory = Readonly<{
  element: HTMLElement
  componentRoot: Pick<ComponentRoot, "readStyleSheets">
  controller: BulkHudController
  ready: Promise<void>
  props: BulkHudDocumentProps
  source: BulkHudStorySource
  subscribe(listener: () => void): () => void
  dispose(): void
}>

const bulkHudStoryFrames = readBulkTimeFrames([
  {id: 1, frontier: {acceptanceSequence: 4}, resolution: "exact"},
  {id: 2, frontier: {acceptanceSequence: 16}, resolution: "degraded"},
])

export const bulkHudStoryDefaultProps: BulkHudDocumentProps = Object.freeze({
  title: "Bulk Visual",
  subtitle: `Keyframes: ${bulkHudStoryFrames.length}`,
  fullscreen: false,
  fullscreenDisabled: false,
  causalTime: buildBulkCausalTimePresentation(bulkHudStoryFrames, 1, "paused"),
})

export function createBulkHudStory(
  document: Document,
): BulkHudDomStory {
  const listeners = new Set<() => void>()
  const notify = (): void => {
    for (const listener of listeners) listener()
  }
  const transport = createBulkHudStoryTransport()
  const fullscreen = createBulkHudStoryFullscreenHost()
  const presentationHost = document.createElement("div")
  const controller = createBulkHudController({
    document,
    parent: presentationHost,
    transport,
    fullscreen,
  })
  const unsubscribeTime = controller.time.subscribe(notify)
  const unsubscribeFullscreen = fullscreen.subscribe(notify)
  const ready = controller.ready.then(notify)
  let disposed = false

  return Object.freeze({
    element: controller.element,
    componentRoot: controller.presentation.componentRoot,
    controller,
    ready,
    get props() { return controller.presentation.props },
    get source() { return bulkHudSource(controller.element, controller.presentation.props) },
    subscribe(listener) {
      if (disposed) throw new Error("BulkHudStory is disposed")
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    dispose() {
      if (disposed) return
      disposed = true
      unsubscribeTime()
      unsubscribeFullscreen()
      listeners.clear()
      controller.dispose()
    },
  })
}

function createBulkHudStoryTransport(): BulkCausalTimeTransport {
  let frames: readonly unknown[] = bulkHudStoryFrames
  return Object.freeze({
    async stack() { return frames },
    async pause() { frames = bulkHudStoryFrames },
    async resume() { frames = Object.freeze([]) },
  })
}

function createBulkHudStoryFullscreenHost(): BulkFullscreenHost {
  const listeners = new Set<() => void>()
  let fullscreen = false
  return Object.freeze({
    active: () => fullscreen,
    async toggle() {
      fullscreen = !fullscreen
      for (const listener of listeners) listener()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  })
}

function bulkHudSource(root: HTMLElement, props: BulkHudDocumentProps): BulkHudStorySource {
  return Object.freeze({
    html: serializeElement(root),
    typescript: [
      'import {createDocument} from "@zavx0z/dom"',
      'import {createBulkHudController} from "../../dom/hud-controller.ts"',
      "",
      "const document = createDocument()",
      'const presentationHost = document.createElement("div")',
      `const storyFrames = ${JSON.stringify(bulkHudStoryFrames, null, 2)}`,
      "let frames: readonly unknown[] = storyFrames",
      "let fullscreen = false",
      "const fullscreenListeners = new Set<() => void>()",
      "const controller = createBulkHudController({",
      "  document,",
      "  parent: presentationHost,",
      "  transport: {",
      "    async stack() { return frames },",
      "    async pause() { frames = storyFrames },",
      "    async resume() { frames = [] },",
      "  },",
      "  fullscreen: {",
      "    active: () => fullscreen,",
      "    async toggle() {",
      "      fullscreen = !fullscreen",
      "      for (const listener of fullscreenListeners) listener()",
      "    },",
      "    subscribe(listener) {",
      "      fullscreenListeners.add(listener)",
      "      return () => fullscreenListeners.delete(listener)",
      "    },",
      "  },",
      "})",
      "await controller.ready",
      `// Current frame: ${props.causalTime.timeline.frameCurrent}`,
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
