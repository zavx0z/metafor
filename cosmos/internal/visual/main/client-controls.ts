import {HTMLButtonElement, HTMLInputElement, HTMLTextAreaElement, InputEvent, type Element, type HTMLElement, type Presentation} from "@zavx0z/immersive"
import type {ClientViewAction, ClientViewInspection, ClientViewControl} from "@metafor/types/cosmos/client"
import {createVisualIdentity, type VisualIdentity, type ProductAnnotationState} from "./product-annotation-state"
import type {AgentWorkspaceModel} from "./agent-workspace"

const MAX_CONTROLS = 256
const MAX_TEXT = 16_384
const MAX_VALUE = 65_536
const compact = (value: string | null, limit = 512) => (value ?? "").replace(/\s+/gu, " ").trim().slice(0, limit)

/**
Показывает существующий Visual Document подключённому Window. Один Inspector
разделяет identity с аннотациями; перенос узла между проекциями сохраняет её.
Действия вызывают публичные controls и input events. Client Oracle заранее
закрепляет Window. Собственный Inspector освобождается dispose; переданным
Inspector продолжает владеть annotation model. Владение —
[Visual](../README.md#совместная-работа-с-клиентом).
*/
export function createClientControls(
  presentation: Pick<Presentation, "document" | "invalidate">,
  workspace: Pick<AgentWorkspaceModel, "getSnapshot" | "select" | "showAgents" | "showOffices" | "showNetwork">,
  options: {identity?: VisualIdentity; annotations?: Pick<ProductAnnotationState, "getSnapshot">; textRoot?: () => HTMLElement | null} = {},
) {
  const identity = options.identity ?? createVisualIdentity(presentation.document)
  const elements = new Map<string, HTMLElement>()
  const connected = (element: HTMLElement) => presentation.document.contains(element)
  const hidden = (element: HTMLElement): boolean => {
    for (let parent: Element | null = element; parent; parent = parent.parentElement)
      if (parent.hasAttribute("hidden") || parent.getAttribute("aria-hidden") === "true") return true
    return false
  }
  const disabled = (element: HTMLElement) => element.hasAttribute("disabled") || element.getAttribute("aria-disabled") === "true"
  const secret = (element: HTMLElement) => element instanceof HTMLInputElement && element.type === "password"
  const editable = (element: HTMLElement): element is HTMLInputElement | HTMLTextAreaElement =>
    element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement && ["text", "search", "email", "url", "tel"].includes(element.type)
  const describe = (element: HTMLElement): ClientViewControl => {
    const id = identity.ref(element)
    elements.set(id, element)
    const redacted = secret(element)
    const actions: ClientViewControl["actions"] = []
    if (element instanceof HTMLButtonElement) actions.push("activate")
    if (editable(element) && !element.hasAttribute("readonly") && !redacted) actions.push("input")
    return {id, tag: element.tagName.toLowerCase(), role: element.getAttribute("role") ?? null,
      label: compact(element.getAttribute("aria-label") || element.getAttribute("title") || element.textContent),
      disabled: disabled(element), hidden: hidden(element), redacted, actions,
      ...(!redacted && editable(element) ? {value: element.value.slice(0, MAX_VALUE)} : {})}
  }
  const inspect = (): ClientViewInspection => {
    for (const [id, element] of elements) if (!connected(element)) elements.delete(id)
    const state = workspace.getSnapshot()
    const selected = state.agents.find(agent => agent.key === state.selected)
    const controls = ["button", "input", "textarea"].flatMap(tag => [...presentation.document.querySelectorAll(tag)])
      .slice(0, MAX_CONTROLS).map(element => describe(element as HTMLElement))
    const text = (options.textRoot?.() ?? presentation.document.getElementById("agent-control-display"))?.textContent ?? ""
    return {mode: state.mode, status: state.input.status, error: state.input.error ?? null,
      selected: selected ? {officeId: selected.officeId, agentRef: selected.atom.ref} : null,
      offices: state.offices.map(({office}) => ({id: office.id, label: office.label, agents: office.agents.map(agent => agent.id)})),
      text: text.slice(0, MAX_TEXT), controls, ...(options.annotations ? {annotations: options.annotations.getSnapshot()} : {})}
  }
  const act = (action: ClientViewAction): {outcome: "dispatched"} => {
    if (action.type === "view.change") {
      if (action.view === "agents") workspace.showAgents()
      else if (action.view === "offices") workspace.showOffices()
      else if (action.view === "network") workspace.showNetwork()
      else throw new Error("Unsupported client view")
    } else if (action.type === "agent.select") {
      const agent = workspace.getSnapshot().agents.find(agent => agent.officeId === action.officeId && agent.atom.ref === action.agentRef)
      if (!agent) throw new Error("Agent is absent from this client view")
      workspace.select(agent.key)
    } else if (action.type === "atom.select") {
      throw Object.assign(new Error("Atom navigation is not connected"), {code: "unsupported"})
    } else if (action.type === "control.activate" || action.type === "control.input") {
      const element = elements.get(action.controlId)
      if (!element || !connected(element)) throw Object.assign(new Error("Client control is stale; inspect the current view"), {code: "stale_control"})
      if (disabled(element) || hidden(element)) throw new Error("Client control is unavailable")
      if (action.type === "control.activate") {
        if (!(element instanceof HTMLButtonElement)) throw new Error("Client control cannot be activated")
        element.click()
      } else {
        if (!editable(element) || secret(element) || element.hasAttribute("readonly") || typeof action.value !== "string" || action.value.length > MAX_VALUE)
          throw new Error("Client control does not accept this input")
        const maximum = element.getAttribute("maxlength")
        if (maximum !== null && /^\d+$/u.test(maximum) && action.value.length > Number(maximum)) throw new Error("Client input exceeds its declared length")
        element.value = action.value
        element.dispatchEvent(new InputEvent("input", {bubbles: true}))
      }
    } else throw new Error("Unsupported client action")
    presentation.invalidate()
    return {outcome: "dispatched"}
  }
  return {inspect, act, dispose() {if (!options.identity) identity.inspector.dispose(); elements.clear()}}
}
