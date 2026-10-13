import {expect, test} from "bun:test"
import {createDocument, HTMLButtonElement, HTMLInputElement, HTMLTextAreaElement} from "@zavx0z/immersive"
import {createClientControls} from "./client-controls"
import type {AgentWorkspaceModel} from "./agent-workspace"

function fixture() {
  const document = createDocument()
  const html = document.createElement("html")
  const body = document.createElement("body")
  html.append(body)
  document.append(html)
  let mode: "agents" | "offices" | "network" = "agents"
  let selected: string | null = "office:agent"
  const workspace = {
    getSnapshot: () => ({mode, selected, input: {status: "ready", offices: []}, offices: [], agents: [{key: "office:agent", officeId: "office", id: "assistant", atom: {ref: "atom:6"}}]}),
    select(key: string) {selected = key},
    showAgents() {mode = "agents"},
    showOffices() {mode = "offices"},
    showNetwork() {mode = "network"},
  } as unknown as AgentWorkspaceModel
  let invalidations = 0
  const presentation = {document, invalidate() {invalidations++}}
  return {document, body, workspace, presentation, controls: createClientControls(presentation, workspace), invalidations: () => invalidations}
}

test("client commands use the existing public controls and retain identity across reparenting", () => {
  const f = fixture()
  const button = f.document.createElement("button") as HTMLButtonElement
  button.textContent = "Офисы"
  button.addEventListener("click", () => f.workspace.showOffices())
  const input = f.document.createElement("textarea") as HTMLTextAreaElement
  input.setAttribute("aria-label", "Сообщение агенту")
  let observed = ""
  input.addEventListener("input", () => {observed = input.value})
  f.body.append(button, input)
  const before = f.controls.inspect()
  const buttonId = before.controls.find(control => control.label === "Офисы")!.id
  const inputId = before.controls.find(control => control.label === "Сообщение агенту")!.id
  expect(f.controls.act({type: "control.activate", controlId: buttonId})).toEqual({outcome: "dispatched"})
  expect(f.controls.inspect().mode).toBe("offices")
  f.controls.act({type: "control.input", controlId: inputId, value: "Совместный черновик"})
  expect(observed).toBe("Совместный черновик")
  const otherDisplay = f.document.createElement("section")
  f.body.append(otherDisplay)
  otherDisplay.append(input)
  expect(f.controls.inspect().controls.find(control => control.id === inputId)?.value).toBe("Совместный черновик")
  expect(f.document.querySelectorAll("textarea")).toHaveLength(1)
  expect(f.invalidations()).toBe(2)
})

test("stale, replaced, hidden and disabled controls cannot receive an action", () => {
  const f = fixture()
  const button = f.document.createElement("button") as HTMLButtonElement
  button.id = "same-logical-id"
  f.body.append(button)
  const first = f.controls.inspect().controls[0]!.id
  button.setAttribute("disabled", "")
  expect(() => f.controls.act({type: "control.activate", controlId: first})).toThrow("unavailable")
  button.removeAttribute("disabled")
  f.body.setAttribute("hidden", "")
  expect(() => f.controls.act({type: "control.activate", controlId: first})).toThrow("unavailable")
  f.body.removeAttribute("hidden")
  button.remove()
  const replacement = f.document.createElement("button") as HTMLButtonElement
  replacement.id = "same-logical-id"
  f.body.append(replacement)
  expect(f.controls.inspect().controls[0]!.id).not.toBe(first)
  expect(() => f.controls.act({type: "control.activate", controlId: first})).toThrow("stale")
  const secondAdapter = createClientControls(f.presentation, f.workspace)
  expect(secondAdapter.inspect().controls[0]!.id).not.toBe(f.controls.inspect().controls[0]!.id)
})

test("client inspection does not expose password values or grant arbitrary input", () => {
  const f = fixture()
  const password = f.document.createElement("input") as HTMLInputElement
  password.type = "password"
  password.value = "owner-private-value"
  f.body.append(password)
  const view = f.controls.inspect()
  expect(JSON.stringify(view)).not.toContain("owner-private-value")
  expect(view.controls[0]).toMatchObject({redacted: true, actions: []})
  expect(() => f.controls.act({type: "control.input", controlId: view.controls[0]!.id, value: "new"})).toThrow("does not accept")
  expect(() => f.controls.act({type: "agent.select", officeId: "another", agentRef: "atom:6"})).toThrow("absent")
  f.controls.act({type: "view.change", view: "network"})
  expect(f.controls.inspect().mode).toBe("network")
})
