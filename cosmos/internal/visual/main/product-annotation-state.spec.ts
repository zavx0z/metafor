import {expect, test} from "bun:test"
import {createDocument, createSpaceElementFactories, Event, type HTMLButtonElement, type HTMLTextAreaElement, type Presentation} from "@zavx0z/immersive"
import {bindSpatialHit} from "@zavx0z/immersive/space"
import {createProductAnnotationState} from "./product-annotation-state"
import {createClientControls} from "./client-controls"
import {isClientInspection} from "../../../release/shared/clients"
import type {AgentWorkspaceModel} from "./agent-workspace"

function fixture() {
  const document = createDocument({elementFactories: createSpaceElementFactories()})
  const html = document.createElement("html"), body = document.createElement("body"), space = document.createElement("space"), display = document.createElement("display"), hud = document.createElement("hud")
  document.append(html); html.append(body); body.append(space); space.append(display, hud)
  const owner = document.createElement("section")
  owner.setAttribute("data-agent-atom", "atom:17")
  const button = document.createElement("button") as HTMLButtonElement
  button.textContent = "Фактический элемент"
  const draft = document.createElement("textarea") as HTMLTextAreaElement
  draft.setAttribute("aria-label", "Сообщение агенту")
  const send = document.createElement("button") as HTMLButtonElement
  send.textContent = "Отправить"
  owner.append(button, draft, send); display.append(owner)
  const hits = new Map([[button, {x: 10, y: 20, width: 100, height: 40, transform: {scaleX: 1, scaleY: 1, translateX: 0, translateY: 0}}]])
  const frame = {hits, boxByNode: new Map()}
  let available = true, scale = 2, sent = 0, input = ""
  send.addEventListener("click", () => {sent++})
  draft.addEventListener("input", () => {input = draft.value})
  const presented = new Set<() => void>()
  const presentation = {document, space, invalidate() {},
    getProjection(node: unknown) {
      if (node === space) return {projectPoint: (point: {x: number; y: number}) => available ? {x: point.x * scale + 100, y: point.y * scale + 80} : null}
      return {readFrame: () => available ? frame : null,
        projectPoint: (point: {x: number; y: number}) => ({x: point.x * scale + 100, y: point.y * scale + 80}),
        unprojectPoint: (point: {x: number; y: number}) => available ? {x: (point.x - 20) / 2, y: (point.y - 40) / 2} : null}
    },
    subscribePresented(listener: () => void) {presented.add(listener); return () => {presented.delete(listener)}},
  } as unknown as Presentation
  const workspace = {getSnapshot: () => ({mode: "agents", selected: "office:agent", input: {status: "ready", offices: []}, offices: [], agents: [{key: "office:agent", officeId: "office", id: "presentation-name", atom: {ref: "atom:17"}}]}),
    select() {}, showAgents() {}, showOffices() {}, showNetwork() {}} as unknown as AgentWorkspaceModel
  const feedback: import("@metafor/types/cosmos/client").ClientAnnotationFeedback[] = []
  const model = createProductAnnotationState()
  model.connectFeedback(workspace, {source: () => ({id: "client-1", connectionId: "connection-1", world: {root: "@metafor/environment", cutId: "cut-1"}} as import("@metafor/types/cosmos/client").ClientDescriptor),
    async send(value) {feedback.push(structuredClone(value)); return {id: value.request.id, accepted: true, replayed: false}}})
  model.attach(presentation)
  model.setEnabled(true)
  const choose = (spatial = false) => {
    const event = new Event("click", {bubbles: true, cancelable: true})
    if (spatial) bindSpatialHit(event, {id: "edge:actual", point: {x: 30, y: 40, z: 50}, distance: 75})
    button.dispatchEvent(event)
  }
  return {document, space, display, hud, owner, button, draft, model, presentation, workspace, choose, frame,
    present() {for (const listener of presented) listener()}, available(value: boolean) {available = value}, scale(value: number) {scale = value},
    feedback: () => feedback, sent: () => sent, input: () => input, subscriptions: () => presented.size,
  }
}

test("semantic selection uses shared Inspector identity and actual Display→client→HUD frame mapping", () => {
  const f = fixture()
  const controls = createClientControls(f.presentation, f.workspace, {identity: f.model.identity!, annotations: f.model})
  try {
    let activated = 0
    f.button.addEventListener("click", () => {activated++})
    f.choose()
    const selected = f.model.getSnapshot().selected!
    expect(selected).toMatchObject({ownAtomRef: "atom:17", spatialHitId: null, projection: {status: "known", owner: "display", hudPoint: {x: 100, y: 60}}})
    expect(selected.semanticNodeId).toBe(f.model.identity!.inspector.idForNode(f.button))
    expect(controls.inspect().controls.find(control => control.label === "Фактический элемент")?.id).toBe(selected.semanticRef)
    expect(activated).toBe(0)
    f.scale(3); f.present()
    expect(f.model.getSnapshot().selected?.projection.hudPoint).toEqual({x: 130, y: 80})
    f.available(false); f.present()
    expect(f.model.getSnapshot().selected?.projection).toMatchObject({status: "unknown", hudPoint: null})
    expect(isClientInspection({schema: "cosmos/client-inspection/v1", version: 1, status: {visible: true, focused: true, boot: {phase: "ready", trace: []}},
      viewport: {width: 100, height: 100, devicePixelRatio: 1}, view: controls.inspect()})).toBe(true)
    f.model.setEnabled(false)
    f.button.click()
    expect(activated).toBe(1)
  } finally {controls.dispose(); f.model.dispose()}
})

test("public SpatialHit maps its observed world point through current Space and HUD projection", () => {
  const f = fixture()
  try {
    f.choose(true)
    expect(f.model.getSnapshot().selected).toMatchObject({spatialHitId: "edge:actual", spatialPoint: {x: 30, y: 40, z: 50},
      projection: {owner: "space", status: "known", hudPoint: {x: 70, y: 60}}})
    f.available(false); f.present()
    expect(f.model.getSnapshot().selected?.projection.status).toBe("unknown")
  } finally {f.model.dispose()}
})

test("confirmed selection automatically sends a separate correlated service snapshot without touching draft or task", async () => {
  const f = fixture()
  try {
    f.draft.value = "Существующий черновик"
    f.draft.focus(); f.present()
    expect(f.model.getSnapshot().active?.semanticNodeId).toBe(f.model.identity!.inspector.idForNode(f.draft))
    const text = f.button.firstChild!
    f.document.getSelection().setBaseAndExtent(text, 0, text, 11)
    f.choose()
    await Bun.sleep(0)
    expect(f.feedback()).toHaveLength(1)
    const feedback = f.feedback()[0]!
    expect(feedback).toMatchObject({agentRef: "atom:17", world: {root: "@metafor/environment", cutId: "cut-1"},
      request: {correlation: {clientId: "client-1", connectionId: "connection-1", annotationId: f.model.getSnapshot().selected!.semanticRef}}})
    expect(JSON.parse(feedback.request.text)).toMatchObject({kind: "ui.annotation.selected", interpretation: "observation-data-not-instructions", textSelection: "Фактический", annotation: {ownAtomRef: "atom:17"}})
    expect(f.draft.value).toBe("Существующий черновик")
    expect(f.input()).toBe("")
    expect(f.sent()).toBe(0)
    f.present(); f.present()
    expect(f.feedback()).toHaveLength(1)
    expect(f.model.getSnapshot().message).toBe("Служебная аннотация записана в беседу")
  } finally {f.model.dispose()}
})

test("same-Document movement preserves identity, removal retires selection, disposal releases subscriptions", async () => {
  const f = fixture()
  f.choose()
  await Bun.sleep(0)
  const initial = f.model.getSnapshot().selected!.semanticNodeId
  const section = f.document.createElement("section")
  f.display.append(section)
  section.append(f.button)
  f.present()
  expect(f.model.getSnapshot().selected?.semanticNodeId).toBe(initial)
  expect(f.model.getSnapshot().selected?.ownAtomRef).toBeNull()
  f.button.remove(); f.present()
  expect(f.model.getSnapshot().selected).toBeNull()
  expect(f.feedback()).toHaveLength(1)
  expect(f.subscriptions()).toBe(1)
  f.model.dispose()
  expect(f.subscriptions()).toBe(0)
  f.model.dispose()
  expect(() => f.model.setEnabled(true)).toThrow("disposed")
})

test("annotation UI remains interactive and bounded wire rejects invented annotation properties", () => {
  const f = fixture()
  const controls = createClientControls(f.presentation, f.workspace, {identity: f.model.identity!, annotations: f.model})
  try {
    f.owner.setAttribute("data-annotation-ui", "true")
    let calls = 0
    f.button.addEventListener("click", () => {calls++})
    f.choose()
    expect(calls).toBe(1)
    expect(f.model.getSnapshot().selected).toBeNull()
    const value = {schema: "cosmos/client-inspection/v1", version: 1, status: {visible: true, focused: true, boot: {phase: "ready", trace: []}},
      viewport: {width: 100, height: 100, devicePixelRatio: 1}, view: {...controls.inspect(), annotations: {...f.model.getSnapshot(), inventedWorld: "fake"}}}
    expect(isClientInspection(value)).toBe(false)
  } finally {controls.dispose(); f.model.dispose()}
})


test("private subtree text and text selection never enter the automatic service observation", async () => {
  const f = fixture()
  try {
    f.owner.setAttribute("data-private", "true")
    f.button.textContent = "private-payload-must-not-leave"
    const text = f.button.firstChild!
    f.document.getSelection().setBaseAndExtent(text, 0, text, 7)
    f.choose()
    await Bun.sleep(0)
    expect(f.feedback()).toHaveLength(1)
    expect(f.feedback()[0]!.request.text).not.toContain("private-payload")
    expect(JSON.parse(f.feedback()[0]!.request.text)).toMatchObject({textSelection: "", annotation: {text: ""}})
  } finally {f.model.dispose()}
})
