import {describe, expect, test} from "bun:test"
import {planHudNodeView, type HudNodeViewDocument} from "./node-view.ts"

const document: HudNodeViewDocument = {
  atoms: [
    {id: "auth", title: "Auth", x: 0, y: 0, fields: [{id: "auth.session", label: "Session"}], states: [{id: "auth.ready", label: "Ready", active: true}]},
    {id: "chat", title: "Chat", x: 380, y: 0, fields: [{id: "chat.connected", label: "Connected"}], states: [{id: "chat.waiting", label: "Waiting"}]},
  ],
  wires: [{id: "session-ready", kind: "field-state", from: {atomId: "auth", itemId: "auth.session"}, to: {atomId: "auth", itemId: "auth.ready"}}],
  transitions: [{id: "wait-connect", from: {atomId: "chat", itemId: "chat.waiting"}, to: {atomId: "chat", itemId: "chat.waiting"}, label: "transition · active"}],
}

describe("HUD node-view plan", () => {
  test("keeps fields, states, transition nodes, and sampled transition wires explicit", () => {
    const plan = planHudNodeView(document, {x: 20, y: 30, w: 1200, h: 900})
    expect(plan.atoms).toHaveLength(2)
    expect(plan.atoms[0]?.fields.get("auth.session")).toBeDefined()
    expect(plan.atoms[0]?.states.get("auth.ready")).toBeDefined()
    expect(plan.transitions).toHaveLength(1)
    expect(plan.wires.map((wire) => wire.kind)).toEqual(["field-state", "transition-in", "transition-out"])
  })

  test("rejects dangling endpoints instead of silently dropping a relation", () => {
    expect(() => planHudNodeView({...document, wires: [{id: "bad", from: {atomId: "auth", itemId: "missing"}, to: {atomId: "chat", itemId: "chat.waiting"}}]}, {x: 0, y: 0, w: 1, h: 1})).toThrow("Unknown endpoint")
  })
})
