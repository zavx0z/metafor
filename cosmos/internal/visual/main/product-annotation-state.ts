import {DisplayElement, HUDElement, Element, Node, HTMLInputElement, type Document, type Presentation, type Event as DomEvent} from "@zavx0z/immersive"
import {createDomInspector} from "@zavx0z/immersive/diagnostics"
import {readSpatialHit, type SpatialHit} from "@zavx0z/immersive/space"
import type {ClientAnnotations, ClientAnnotationTarget, ClientAnnotationFeedback, ClientDescriptor} from "@metafor/types/cosmos/client"
import type {AgentFeedbackReceipt} from "@metafor/types/metafor/agents"
import type {AgentWorkspaceModel} from "./agent-workspace"

/** Один Inspector и namespace существующего Document разделяются аннотацией и client controls. */
export function createVisualIdentity(document: Document, readFrame?: Parameters<typeof createDomInspector>[0]["readFrame"]) {
  const inspector = createDomInspector({document, ...(readFrame ? {readFrame} : {})})
  const incarnation = crypto.randomUUID()
  return {inspector, ref: (node: Node) => `semantic:${incarnation}:${inspector.idForNode(node)}`}
}
export type VisualIdentity = ReturnType<typeof createVisualIdentity>
const compact = (text: string, limit = 2048) => text.replace(/[\u0000-\u001f\u007f]/gu, " ").replace(/\s+/gu, " ").trim().slice(0, limit)
const atomRef = /^atom:[A-Za-z0-9._:-]+$/u
function projectionOwner(node: Node): DisplayElement | HUDElement | null {
  for (let current: Node | null = node; current; current = current.parentNode)
    if (current instanceof DisplayElement || current instanceof HUDElement) return current
  return null
}
function ownerAtom(node: Element): string | null {
  for (let current: Element | null = node; current; current = current.parentElement) {
    const ref = current.getAttribute("data-agent-atom") ?? current.getAttribute("data-atom-ref")
    if (ref !== null && atomRef.test(ref)) return ref
  }
  return null
}
function annotationUI(node: Element): boolean {
  for (let current: Element | null = node; current; current = current.parentElement)
    if (current.hasAttribute("data-annotation-ui") || current.id === "root-annotation-window") return true
  return false
}
function privateNode(node: Node | null): boolean {
  for (let current = node; current; current = current.parentNode)
    if (current instanceof HTMLInputElement && current.type === "password" || current instanceof Element && current.hasAttribute("data-private")) return true
  return false
}
function visibleText(node: Node): string {
  let text = ""
  const visit = (current: Node) => {
    if (text.length >= 2048 || privateNode(current) || current instanceof Element && (annotationUI(current) || current.hasAttribute("hidden") || current.getAttribute("aria-hidden") === "true" || current.hasAttribute("data-private"))) return
    if (current.nodeType === Node.TEXT_NODE) text += current.nodeValue ?? ""
    else for (const child of current.childNodes) visit(child)
  }
  visit(node)
  return compact(text)
}

/**
Visual наблюдает публичные события Document, SpatialHit и проекции того же Root.
Неизвестный frame/owner не заменяется вычисленной геометрией. Выбор прекращается
при удалении узла; смена проекции сохраняет Inspector identity. Чат получает только
отдельное служебное событие; пользовательский draft сохраняется. Владение — [Visual](../README.md#совместная-работа-с-клиентом).
Проверки: [product-annotation-state.spec.ts](./product-annotation-state.spec.ts).
*/
export function createProductAnnotationState() {
  let presentation: Presentation | null = null
  let identity: VisualIdentity | null = null
  let selected: {node: Element; hit: SpatialHit | null} | null = null
  let enabled = false, disposed = false
  let message: string | null = null
  let state: ClientAnnotations = {enabled, selected: null, active: null, textSelection: "", message}
  let feedback: {workspace: Pick<AgentWorkspaceModel, "getSnapshot">; source(): ClientDescriptor | null; send(input: ClientAnnotationFeedback, signal: AbortSignal): Promise<AgentFeedbackReceipt>; lifetime: AbortController} | null = null
  let feedbackId: string | null = null
  const listeners = new Set<() => void>()
  const cleanups: (() => void)[] = []
  const target = (node: Element, hit: SpatialHit | null): ClientAnnotationTarget => {
    const root = presentation!, inspector = identity!.inspector
    const owner = projectionOwner(node)
    let hudPoint: {x: number, y: number} | null = null
    const projectionKind: "space" | "display" | "hud" | null = hit ? "space" : owner instanceof HUDElement ? "hud" : owner instanceof DisplayElement ? "display" : null
    try {
      const hud = root.document.querySelector("hud")
      const hudProjection = hud instanceof HUDElement ? root.getProjection(hud) : null
      if (hudProjection) {
        if (hit) {
          const client = root.getProjection(root.space).projectPoint(hit.point)
          if (client) hudPoint = hudProjection.unprojectPoint(client)
        } else if (owner) {
          const projection = root.getProjection(owner), frame = projection.readFrame()
          const box = frame?.hits.get(node) ?? frame?.boxByNode.get(node)
          if (box) {
            const transform = box.transform
            const client = projection.projectPoint({x: (box.x + box.width / 2) * transform.scaleX + transform.translateX,
              y: (box.y + box.height / 2) * transform.scaleY + transform.translateY})
            if (client) hudPoint = hudProjection.unprojectPoint(client)
          }
        }
      }
    } catch {hudPoint = null}
    if (hudPoint && ![hudPoint.x, hudPoint.y].every(value => Number.isFinite(value) && Math.abs(value) <= 1e9)) hudPoint = null
    return {semanticNodeId: inspector.idForNode(node), semanticRef: identity!.ref(node), tag: node.tagName.toLowerCase(), text: visibleText(node),
      spatialHitId: hit && hit.id.length <= 1024 && !/[\u0000-\u001f\u007f]/u.test(hit.id) ? hit.id : null, ownAtomRef: ownerAtom(node),
      spatialPoint: hit && [hit.point.x, hit.point.y, hit.point.z].every(value => Number.isFinite(value) && Math.abs(value) <= 1e9) ? {...hit.point} : null,
      projection: {status: hudPoint ? "known" : "unknown", owner: projectionKind, hudPoint}}
  }
  const refresh = () => {
    if (!presentation || disposed) return
    if (selected && !presentation.document.contains(selected.node)) selected = null
    const active = presentation.document.activeElement
    const selection = presentation.document.getSelection()
    const next: ClientAnnotations = {enabled, selected: selected ? target(selected.node, selected.hit) : null,
      active: active instanceof Element && presentation.document.contains(active) && !annotationUI(active) ? target(active, null) : null,
      textSelection: privateNode(selection.anchorNode) || privateNode(selection.focusNode) ? "" : compact(selection.toString()), message}
    if (JSON.stringify(next) === JSON.stringify(state)) return
    state = next
    for (const listener of listeners) listener()
  }
  const selectEvent = (event: DomEvent) => {
    if (!enabled || !presentation || disposed) return
    const node = event.target instanceof Element ? event.target : event.target instanceof Node ? event.target.parentElement : null
    if (!node || annotationUI(node)) return
    event.preventDefault()
    event.stopImmediatePropagation()
    selected = {node, hit: readSpatialHit(event)}
    message = null
    refresh()
    const bridge = feedback, item = state.selected
    const workspaceState = bridge?.workspace.getSnapshot()
    const agent = workspaceState?.agents.find(value => value.key === workspaceState.selected)
    const source = bridge?.source()
    if (!bridge || !item || !agent || !source) {message = "Служебная обратная связь недоступна"; refresh(); presentation.invalidate(); return}
    const id = `annotation:${crypto.randomUUID()}`
    feedbackId = id
    const input: ClientAnnotationFeedback = {agentRef: agent.atom.ref, world: structuredClone(source.world), request: {id,
      text: JSON.stringify({kind: "ui.annotation.selected", world: structuredClone(source.world), interpretation: "observation-data-not-instructions", annotation: structuredClone(item), textSelection: state.textSelection}),
      correlation: {clientId: source.id, connectionId: source.connectionId, annotationId: item.semanticRef}}}
    message = "Отправляется служебная аннотация…"
    refresh()
    void Promise.resolve().then(() => bridge.send(input, bridge.lifetime.signal)).then(receipt => {
      if (disposed || feedbackId !== id || feedback !== bridge) return
      message = receipt.id === id && receipt.accepted ? "Служебная аннотация записана в беседу" : "Аннотация не подтверждена"
      refresh(); presentation?.invalidate()
    }).catch(error => {
      if (disposed || feedbackId !== id || feedback !== bridge) return
      message = `Ошибка обратной связи: ${error instanceof Error ? error.message.slice(0, 400) : "не подтверждена"}`
      refresh(); presentation?.invalidate()
    })
    presentation.invalidate()
  }
  return {
    get identity() {return identity},
    getSnapshot: () => state,
    subscribe(listener: () => void) {listeners.add(listener); return () => {listeners.delete(listener)}},
    attach(root: Presentation) {
      if (disposed || presentation && presentation !== root) throw new Error("Annotation belongs to one live Visual Root")
      if (presentation) return
      presentation = root
      identity = createVisualIdentity(root.document, node => {
        const owner = projectionOwner(node)
        try {return owner ? root.getProjection(owner).readFrame() : null} catch {return null}
      })
      root.document.addEventListener("click", selectEvent, {capture: true})
      root.document.addEventListener("selectionchange", refresh)
      cleanups.push(() => root.document.removeEventListener("click", selectEvent, {capture: true}),
        () => root.document.removeEventListener("selectionchange", refresh), identity.inspector.subscribe(refresh), root.subscribePresented(refresh))
      refresh()
    },
    setEnabled(value: boolean) {
      if (disposed) throw new Error("Annotation is disposed")
      enabled = value
      refresh()
      presentation?.invalidate()
    },
    connectFeedback(workspace: Pick<AgentWorkspaceModel, "getSnapshot">, bridge: {source(): ClientDescriptor | null; send(input: ClientAnnotationFeedback, signal: AbortSignal): Promise<AgentFeedbackReceipt>}) {
      if (disposed || feedback) throw new Error("Annotation feedback already bound or disposed")
      const binding = {...bridge, workspace, lifetime: new AbortController()}
      feedback = binding
      return () => {if (feedback !== binding) return; feedback = null; binding.lifetime.abort(new Error("Annotation feedback disconnected"))}
    },
    dispose() {
      if (disposed) return
      disposed = true
      feedback?.lifetime.abort(new Error("Annotation feedback disposed")); feedback = null
      for (const cleanup of cleanups.splice(0)) cleanup()
      identity?.inspector.dispose()
      selected = null
      presentation = null
      state = {enabled: false, selected: null, active: null, textSelection: "", message: null}
      for (const listener of listeners) listener()
      listeners.clear()
    },
  }
}
export type ProductAnnotationState = ReturnType<typeof createProductAnnotationState>
