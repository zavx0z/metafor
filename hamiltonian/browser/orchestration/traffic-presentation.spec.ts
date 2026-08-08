import {describe, expect, test} from "bun:test"
import {HamiltonianTrafficPresentationGate} from "./traffic-presentation.ts"

type Traffic = Readonly<{id: string; edgeId: string}>

describe("Hamiltonian traffic presentation gate", () => {
  test("starts queued traffic as soon as its first route materializes", () => {
    let now = 1_000
    const presented: Array<{id: string; startedAt: number}> = []
    const gate = new HamiltonianTrafficPresentationGate<Traffic>({now: () => now})
    gate.connect((value, startedAt) => presented.push({id: value.id, startedAt}))

    expect(gate.observe({id: "early", edgeId: "message-port"})).toBe("queued")
    expect(presented).toEqual([])

    now = 1_040
    gate.setMaterializedEdges(["message-port"])
    expect(presented).toEqual([{id: "early", startedAt: 1_040}])
    expect(gate.pendingCount).toBe(0)

    now = 1_041
    expect(gate.observe({id: "live", edgeId: "message-port"})).toBe("presented")
    expect(presented.at(-1)).toEqual({id: "live", startedAt: 1_041})
  })

  test("retains only unmatched routes and keeps the startup queue bounded", () => {
    const presented: string[] = []
    const gate = new HamiltonianTrafficPresentationGate<Traffic>({capacity: 2, now: () => 10})
    gate.connect((value) => presented.push(value.id))

    gate.observe({id: "expired-capacity", edgeId: "later"})
    gate.observe({id: "ready", edgeId: "ready"})
    gate.observe({id: "later", edgeId: "later"})
    expect(gate.pendingCount).toBe(2)

    gate.setMaterializedEdges(["ready"])
    expect(presented).toEqual(["ready"])
    expect(gate.pendingCount).toBe(1)

    gate.setMaterializedEdges(["ready", "later"])
    expect(presented).toEqual(["ready", "later"])
    expect(gate.pendingCount).toBe(0)
  })
})
