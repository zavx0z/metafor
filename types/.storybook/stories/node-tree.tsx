import {
  createGraphNodeTree,
  reconcileGraphNodeTree,
  type GraphNodeTree,
} from "@metafor/node-tree/graph"
import {
  type Document,
  type HTMLElement,
  type HTMLInputElement,
  type Text,
} from "@zavx0z/dom"
import type {GraphDomStory} from "./dom-story.tsx"
import {Checkbox} from "@ui/components/checkbox"
import {listStyles} from "@ui/components/list"
import {paneStyles} from "@ui/components/pane"
import {createRoot} from "@zavx0z/react"
import {createGraphFixture} from "../../../quantum/tests/graph/fixture.ts"
import {graphNodeTreeStorySource} from "./source.ts"

export type GraphNodeTreeStoryArgs = Readonly<{incremented: boolean}>

type FrameRecord = Readonly<{
  element: HTMLElement
  title: Text
  nodes: HTMLElement
}>

type NodeRecord = Readonly<{
  element: HTMLElement
  title: Text
  parameters: HTMLElement
  sockets: HTMLElement
}>

type LinkRecord = Readonly<{
  element: HTMLElement
  text: Text
}>

export type GraphNodeTreeDomRefs = Readonly<{
  root: HTMLElement
  incremented: HTMLInputElement
  stats: HTMLElement
  frames: HTMLElement
  links: HTMLElement
  frameElements: ReadonlyMap<string, HTMLElement>
  nodeElements: ReadonlyMap<string, HTMLElement>
  linkElements: ReadonlyMap<string, HTMLElement>
}>

export type GraphNodeTreeDomStory = GraphDomStory<GraphNodeTreeStoryArgs> & Readonly<{
  tree: GraphNodeTree
  refs: GraphNodeTreeDomRefs
  snapshot(): ReturnType<GraphNodeTree["snapshot"]>
}>

/** Presents the actual derived GraphNodeTree as one stable semantic DOM tree. */
export function createGraphNodeTreeStory(document: Document): GraphNodeTreeDomStory {
  const tree = createGraphNodeTree(graphFixture(false))
  let currentArgs: GraphNodeTreeStoryArgs = Object.freeze({incremented: false})
  let disposed = false
  const root = document.createElement("section")
  const header = document.createElement("header")
  const heading = document.createElement("h2")
  const control = document.createElement("label")
  const controlHost = document.createElement("span")
  const controlRoot = createRoot(controlHost)
  const renderControl = (checked: boolean): HTMLInputElement => {
    controlRoot.render(<Checkbox
      checked={checked}
      title="Изменить runtime count"
      onChange={(nextChecked) => {
      if (disposed) return
      const next = Object.freeze({incremented: nextChecked})
      reconcileGraphNodeTree(tree, graphFixture(next.incremented))
      currentArgs = next
      sync()
      renderControl(next.incremented)
    }}
    />)
    const element = controlHost.querySelector("input") as HTMLInputElement | null
    if (element === null) throw new Error("Graph NodeTree checkbox did not mount")
    element.className = `${element.className} graph-node-tree__control-input`.trim()
    element.setAttribute("data-control-key", "incremented")
    return element
  }
  const incremented = renderControl(false)
  const stats = document.createElement("dl")
  const frames = document.createElement("div")
  const links = document.createElement("ul")
  const frameRecords = new Map<string, FrameRecord>()
  const nodeRecords = new Map<string, NodeRecord>()
  const linkRecords = new Map<string, LinkRecord>()
  const frameElements = new Map<string, HTMLElement>()
  const nodeElements = new Map<string, HTMLElement>()
  const linkElements = new Map<string, HTMLElement>()

  root.className = "graph-node-tree"
  root.setAttribute("data-projection", "graph-live")
  header.className = "graph-node-tree__header"
  heading.append("Graph · NodeTree projection")
  control.className = "graph-node-tree__control"
  control.append(controlHost, "Изменить runtime count")
  header.append(heading, control)
  stats.className = "graph-node-tree__stats"
  frames.className = "graph-node-tree__frames"
  links.className = "graph-node-tree__links"
  links.setAttribute(listStyles.root.attributeName, "")
  root.append(header, stats, frames, links)

  const sync = (): void => {
    const snapshot = tree.snapshot()
    root.setAttribute("data-revision", String(snapshot.revision))
    root.setAttribute("data-topology-revision", String(snapshot.topologyRevision))
    syncStats(document, stats, snapshot)
    syncFrames(document, frames, frameRecords, frameElements, snapshot)
    syncNodes(document, frameRecords, nodeRecords, nodeElements, snapshot)
    syncLinks(document, links, linkRecords, linkElements, snapshot)
  }
  sync()

  const refs: GraphNodeTreeDomRefs = Object.freeze({
    root,
    incremented,
    stats,
    frames,
    links,
    frameElements,
    nodeElements,
    linkElements,
  })
  return Object.freeze({
    element: root,
    tree,
    refs,
    get args() { return currentArgs },
    get source() {
      const snapshot = tree.snapshot()
      return graphNodeTreeStorySource({
        incremented: currentArgs.incremented,
        revision: snapshot.revision,
        topologyRevision: snapshot.topologyRevision,
        frames: snapshot.frames.length,
        nodes: snapshot.nodes.length,
        links: snapshot.links.length,
      })
    },
    snapshot: () => tree.snapshot(),
    dispose() {
      if (disposed) return
      disposed = true
      controlRoot.unmount()
      tree.dispose()
    },
  })
}

function syncStats(
  document: Document,
  stats: HTMLElement,
  snapshot: ReturnType<GraphNodeTree["snapshot"]>,
): void {
  stats.replaceChildren(
    stat(document, "Revision", snapshot.revision),
    stat(document, "Topology", snapshot.topologyRevision),
    stat(document, "Frames", snapshot.frames.length),
    stat(document, "Nodes", snapshot.nodes.length),
    stat(document, "Links", snapshot.links.length),
  )
}

function stat(document: Document, label: string, value: number): HTMLElement {
  const wrapper = document.createElement("div")
  const term = document.createElement("dt")
  const description = document.createElement("dd")
  wrapper.className = "graph-node-tree__stat"
  term.append(label)
  description.append(String(value))
  wrapper.append(term, description)
  return wrapper
}

function syncFrames(
  document: Document,
  host: HTMLElement,
  records: Map<string, FrameRecord>,
  elements: Map<string, HTMLElement>,
  snapshot: ReturnType<GraphNodeTree["snapshot"]>,
): void {
  const retained = new Set(snapshot.frames.map(({id}) => id))
  removeMissing(records, elements, retained)
  const ordered: HTMLElement[] = []
  for (const frame of snapshot.frames) {
    let record = records.get(frame.id)
    if (record === undefined) {
      const element = document.createElement("section")
      const titleElement = document.createElement("h3")
      const title = document.createTextNode("")
      const nodes = document.createElement("div")
      element.className = "graph-node-tree__frame"
      element.setAttribute(paneStyles.root.attributeName, "")
      element.setAttribute("data-frame-id", frame.id)
      titleElement.appendChild(title)
      nodes.className = "graph-node-tree__nodes"
      element.append(titleElement, nodes)
      record = Object.freeze({element, title, nodes})
      records.set(frame.id, record)
      elements.set(frame.id, element)
    }
    record.element.setAttribute("data-parent-frame-id", frame.parentFrameId ?? "")
    record.title.data = `${frame.metadata?.label ?? frame.id} · ${frame.id}`
    ordered.push(record.element)
  }
  host.replaceChildren(...ordered)
}

function syncNodes(
  document: Document,
  frames: ReadonlyMap<string, FrameRecord>,
  records: Map<string, NodeRecord>,
  elements: Map<string, HTMLElement>,
  snapshot: ReturnType<GraphNodeTree["snapshot"]>,
): void {
  const retained = new Set(snapshot.nodes.map(({id}) => id))
  removeMissing(records, elements, retained)
  const byFrame = new Map<string, HTMLElement[]>()
  for (const node of snapshot.nodes) {
    let record = records.get(node.id)
    if (record === undefined) {
      const element = document.createElement("article")
      const titleElement = document.createElement("h4")
      const title = document.createTextNode("")
      const parameters = document.createElement("ul")
      const sockets = document.createElement("ul")
      element.className = "graph-node-tree__node"
      element.setAttribute(paneStyles.root.attributeName, "")
      element.setAttribute("data-node-id", node.id)
      titleElement.appendChild(title)
      parameters.className = "graph-node-tree__parameters"
      parameters.setAttribute(listStyles.root.attributeName, "")
      sockets.className = "graph-node-tree__sockets"
      sockets.setAttribute(listStyles.root.attributeName, "")
      element.append(titleElement, parameters, sockets)
      record = Object.freeze({element, title, parameters, sockets})
      records.set(node.id, record)
      elements.set(node.id, element)
    }
    record.title.data = `${node.metadata?.title ?? node.id} · ${node.id}`
    record.parameters.replaceChildren(...node.parameters.map((parameter) => {
      const item = document.createElement("li")
      item.className = "graph-node-tree__parameter"
      item.setAttribute(listStyles.item.attributeName, "")
      item.setAttribute("role", "option")
      item.setAttribute("data-parameter-id", parameter.id)
      item.append(`${parameter.presentation.label}: ${displayValue(parameter.value)}`)
      return item
    }))
    record.sockets.replaceChildren(...node.sockets.map((socket) => {
      const item = document.createElement("li")
      item.className = "graph-node-tree__socket"
      item.setAttribute(listStyles.item.attributeName, "")
      item.setAttribute("role", "option")
      item.setAttribute("data-socket-id", socket.id)
      item.append(`${socket.direction} · ${socket.metadata?.label ?? socket.id}`)
      return item
    }))
    const frameId = node.frameId ?? ""
    const collection = byFrame.get(frameId) ?? []
    collection.push(record.element)
    byFrame.set(frameId, collection)
  }
  for (const [frameId, record] of frames) record.nodes.replaceChildren(...(byFrame.get(frameId) ?? []))
}

function syncLinks(
  document: Document,
  host: HTMLElement,
  records: Map<string, LinkRecord>,
  elements: Map<string, HTMLElement>,
  snapshot: ReturnType<GraphNodeTree["snapshot"]>,
): void {
  const retained = new Set(snapshot.links.map(({id}) => id))
  removeMissing(records, elements, retained)
  const ordered: HTMLElement[] = []
  for (const link of snapshot.links) {
    let record = records.get(link.id)
    if (record === undefined) {
      const element = document.createElement("li")
      const text = document.createTextNode("")
      element.className = "graph-node-tree__link"
      element.setAttribute(listStyles.item.attributeName, "")
      element.setAttribute("role", "option")
      element.setAttribute("data-link-id", link.id)
      element.appendChild(text)
      record = Object.freeze({element, text})
      records.set(link.id, record)
      elements.set(link.id, element)
    }
    record.text.data = `${link.metadata?.label ?? link.id}: ${link.from.nodeId}/${link.from.socketId} → ${link.to.nodeId}/${link.to.socketId}`
    ordered.push(record.element)
  }
  host.replaceChildren(...ordered)
}

function removeMissing<RecordValue extends Readonly<{element: HTMLElement}>>(
  records: Map<string, RecordValue>,
  elements: Map<string, HTMLElement>,
  retained: ReadonlySet<string>,
): void {
  for (const [id, record] of records) {
    if (retained.has(id)) continue
    record.element.remove()
    records.delete(id)
    elements.delete(id)
  }
}

function displayValue(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value)
}

function graphFixture(incremented: boolean) {
  const graph = createGraphFixture()
  const root = graph.runtime.roots[0]
  if (root?.kind !== "atom") throw new Error("Graph NodeTree fixture root Atom is absent")
  root.values.count = incremented ? 1 : 0
  return graph
}
