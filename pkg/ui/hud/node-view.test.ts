import {describe, expect, test} from "bun:test"
import {planHudNodeView, transformHudNodeViewPlan, type HudNodeViewDocument} from "./node-view.ts"

const document: HudNodeViewDocument = {
  atoms: [
    {id: "auth", title: "Auth", x: 0, y: 0, fields: [{id: "auth.session", label: "Session"}], states: [{id: "auth.ready", label: "Ready", active: true}]},
    {id: "chat", title: "Chat", x: 380, y: 0, fields: [{id: "chat.connected", label: "Connected"}], states: [{id: "chat.waiting", label: "Waiting"}]},
  ],
  wires: [{id: "session-ready", kind: "field-state", from: {atomId: "auth", itemId: "auth.session"}, to: {atomId: "auth", itemId: "auth.ready"}}],
  transitions: [{id: "wait-connect", from: {atomId: "chat", itemId: "chat.waiting"}, to: {atomId: "chat", itemId: "chat.waiting"}, label: "transition · active"}],
}

describe("HUD node-view plan", () => {
  test("preserves Oracle-supplied atom coordinates and keeps panel relations explicit", () => {
    const plan = planHudNodeView(document, {x: 20, y: 30, w: 1200, h: 900})
    expect(plan.atoms).toHaveLength(2)
    expect(plan.atoms.map(({rect}) => ({x: rect.x, y: rect.y}))).toEqual([
      {x: 20, y: 30},
      {x: 400, y: 30},
    ])
    expect(plan.atoms[0]?.fields.get("auth.session")).toBeDefined()
    expect(plan.atoms[0]?.states.get("auth.ready")).toBeDefined()
    expect(plan.transitions).toHaveLength(1)
    expect(plan.wires.map((wire) => wire.kind)).toEqual(["field-state", "transition-in", "transition-out"])
  })

  test("rejects dangling endpoints instead of silently dropping a relation", () => {
    expect(() => planHudNodeView({...document, wires: [{id: "bad", from: {atomId: "auth", itemId: "missing"}, to: {atomId: "chat", itemId: "chat.waiting"}}]}, {x: 0, y: 0, w: 1, h: 1})).toThrow("Unknown endpoint")
  })

  test("applies one camera transform to every node, port, transition, and wire", () => {
    const plan = planHudNodeView(document, {x: 0, y: 0, w: 1200, h: 900})
    const transformed = transformHudNodeViewPlan(plan, {x: 40, y: 60, scale: 0.5})
    const source = plan.atoms[0]!
    const target = transformed.atoms[0]!
    expect(target.rect).toEqual({x: 40 + source.rect.x * 0.5, y: 60 + source.rect.y * 0.5, w: source.rect.w * 0.5, h: source.rect.h * 0.5})
    const sourcePort = source.fields.get("auth.session")!
    expect(target.fields.get("auth.session")).toEqual({x: 40 + sourcePort.x * 0.5, y: 60 + sourcePort.y * 0.5, w: sourcePort.w * 0.5, h: sourcePort.h * 0.5})
    expect(transformed.transitions[0]!.rect.w).toBe(plan.transitions[0]!.rect.w * 0.5)
    expect(transformed.wires[0]!.from).toEqual({x: 40 + plan.wires[0]!.from.x * 0.5, y: 60 + plan.wires[0]!.from.y * 0.5})
  })
})
