import {describe, expect, test} from "bun:test"
import {
  BULK_TIME_PAUSE_METHOD,
  BULK_TIME_RESUME_METHOD,
  BULK_TIME_STACK_METHOD,
  bulkTimeControlResponse,
} from "./time-control.ts"

describe("Bulk time-control bridge", () => {
  test("relays only closed bounded intent to Dark over the existing Monad peer", async () => {
    const calls: unknown[][] = []
    const peer = {
      async call<T>(...args: unknown[]): Promise<T> {
        calls.push(args)
        return [{id: 1, frontier: {acceptanceSequence: 4}}] as T
      },
    }

    const response = await bulkTimeControlResponse(peer, BULK_TIME_STACK_METHOD)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual([{id: 1, frontier: {acceptanceSequence: 4}}])
    expect(calls).toEqual([["dark", BULK_TIME_STACK_METHOD, {}, {waitMs: 1_000}]])
    expect([BULK_TIME_PAUSE_METHOD, BULK_TIME_RESUME_METHOD]).toEqual([
      "dark.force.pause",
      "dark.force.resume",
    ])
  })

  test("fails closed when Dark time control is unavailable", async () => {
    const peer = {
      async call<T>(): Promise<T> {
        throw new Error("method unavailable")
      },
    }

    const response = await bulkTimeControlResponse(peer, BULK_TIME_PAUSE_METHOD)

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ok: false, error: "method unavailable"})
  })
})
