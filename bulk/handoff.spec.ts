import {describe, expect, test} from "bun:test"
import type {SourcedForceMessage} from "shared/protocol/force/message"
import {BulkObserverHandoffs} from "./handoff.ts"

const message = (ts: number): SourcedForceMessage => ({
  parts: [{part: "graviton", op: "add", path: `atom/${ts}`, by: "boundary", ts}],
})

describe("Bulk observer handoff", () => {
  test("delivers only Particle received after the initial cut and consumes the session once", () => {
    const handoffs = new BulkObserverHandoffs()
    handoffs.buffer(message(1))

    const session = handoffs.open()
    handoffs.buffer(message(2))
    handoffs.buffer(message(3))

    expect(handoffs.take(session)).toEqual([message(2), message(3)])
    expect(handoffs.take(session)).toBeNull()
  })

  test("expires an abandoned session instead of retaining an observer world", () => {
    let now = 10
    const handoffs = new BulkObserverHandoffs({ttlMs: 5, now: () => now})
    const session = handoffs.open()
    now = 16

    expect(handoffs.take(session)).toBeNull()
    expect(handoffs.size).toBe(0)
  })
})
