import {describe, expect, test} from "bun:test"
import {HamiltonianTrafficPresentationGate} from "./traffic-presentation.ts"

type Traffic = Readonly<{id: string; edgeId: string; at: number}>

describe("Hamiltonian traffic presentation gate", () => {
  test("starts queued traffic as soon as its first route materializes", () => {
    let now = 1_000
    const presented: Array<{id: string; startedAt: number}> = []
    const gate = new HamiltonianTrafficPresentationGate<Traffic>({now: () => now})
    gate.connect((value, startedAt) => presented.push({id: value.id, startedAt}))

    expect(gate.observe({id: "early", edgeId: "message-port", at: 1_000})).toBe("queued")
    expect(presented).toEqual([])

    now = 1_040
    gate.setMaterializedEdges(["message-port"])
    expect(presented).toEqual([{id: "early", startedAt: 1_000}])
    expect(gate.pendingCount).toBe(0)

    now = 1_041
    expect(gate.observe({id: "live", edgeId: "message-port", at: 1_041})).toBe("presented")
    expect(presented.at(-1)).toEqual({id: "live", startedAt: 1_041})
  })

  test("retains only unmatched routes and keeps the startup queue bounded", () => {
    const presented: string[] = []
    const gate = new HamiltonianTrafficPresentationGate<Traffic>({capacity: 2, now: () => 10})
    gate.connect((value) => presented.push(value.id))

    gate.observe({id: "expired-capacity", edgeId: "later", at: 10})
    gate.observe({id: "ready", edgeId: "ready", at: 10})
    gate.observe({id: "later", edgeId: "later", at: 10})
    expect(gate.pendingCount).toBe(2)

    gate.setMaterializedEdges(["ready"])
    expect(presented).toEqual(["ready"])
    expect(gate.pendingCount).toBe(1)

    gate.setMaterializedEdges(["ready", "later"])
    expect(presented).toEqual(["ready", "later"])
    expect(gate.pendingCount).toBe(0)
  })

  test("coalesces a pre-layout burst to the latest message on each edge", () => {
    const presented: string[] = []
    const gate = new HamiltonianTrafficPresentationGate<Traffic>({now: () => 30})
    gate.connect((value) => presented.push(value.id))

    gate.observe({id: "first", edgeId: "message-port", at: 10})
    gate.observe({id: "second", edgeId: "message-port", at: 20})
    gate.observe({id: "latest", edgeId: "message-port", at: 30})
    expect(gate.pendingCount).toBe(1)

    gate.setMaterializedEdges(["message-port"])
    expect(presented).toEqual(["latest"])
    expect(gate.pendingCount).toBe(0)
  })

  test("forgets queued signals when their exact transport incarnation closes", () => {
    const gate = new HamiltonianTrafficPresentationGate<Traffic>()
    gate.observe({id: "closed", edgeId: "message-port:old", at: Date.now()})
    gate.observe({id: "live", edgeId: "message-port:new", at: Date.now()})

    expect(gate.forgetEdge("message-port:old")).toBe(1)
    expect(gate.pendingCount).toBe(1)
    expect(gate.forgetEdge("message-port:old")).toBe(0)
  })

  test("discards traffic that cannot belong to the final current layout", () => {
    const gate = new HamiltonianTrafficPresentationGate<Traffic>({now: () => 15})
    gate.observe({id: "current", edgeId: "current", at: 15})
    gate.observe({id: "old", edgeId: "old-incarnation", at: 15})

    expect(gate.discardPendingOutside(["current"])).toBe(1)
    expect(gate.pendingCount).toBe(1)

    const presented: string[] = []
    gate.connect((value) => presented.push(value.id))
    gate.setMaterializedEdges(["current"])
    expect(presented).toEqual(["current"])
  })

  test("does not restart an expired queued signal when its edge appears", () => {
    let now = 100
    const presented: Array<{id: string; startedAt: number}> = []
    const gate = new HamiltonianTrafficPresentationGate<Traffic>({maxAgeMs: 50, now: () => now})
    gate.connect((value, startedAt) => presented.push({id: value.id, startedAt}))
    expect(gate.observe({id: "early", edgeId: "late", at: 100})).toBe("queued")
    now = 151
    gate.setMaterializedEdges(["late"])
    expect(presented).toEqual([])
    expect(gate.pendingCount).toBe(0)
    expect(gate.observe({id: "already-old", edgeId: "late", at: 100})).toBe("expired")
  })
})
