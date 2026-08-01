import {describe, expect, test} from "bun:test"
import {BulkObserverHandoffs} from "./handoff.ts"

const message = (sequence: number) => ({
  control: "bulk.graph.update" as const,
  sequence,
})

describe("Bulk observer handoff", () => {
  test("delivers only Graph replacements received after the initial cut and consumes the session once", () => {
    const handoffs = new BulkObserverHandoffs<ReturnType<typeof message>>()
    handoffs.buffer(message(1))

    const session = handoffs.open()
    handoffs.buffer(message(2))
    handoffs.buffer(message(3))

    expect(handoffs.take(session)).toEqual([message(2), message(3)])
    expect(handoffs.take(session)).toBeNull()
  })

  test("expires an abandoned session instead of retaining an observer manifestation", () => {
    let now = 10
    const handoffs = new BulkObserverHandoffs({ttlMs: 5, now: () => now})
    const session = handoffs.open()
    now = 16

    expect(handoffs.take(session)).toBeNull()
    expect(handoffs.size).toBe(0)
  })
})
