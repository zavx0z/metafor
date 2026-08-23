import {describe, expect, test} from "bun:test"
import type {ForceMessage} from "shared/protocol/force/message"
import {routeBulkBrowserPayload} from "./browser-protocol.ts"

describe("Bulk browser WebSocket protocol", () => {
  test("consumes capture control before Force even when a spoofed frame also contains parts", () => {
    const impulses: ForceMessage[] = []
    const controls: unknown[] = []
    const payload = {
      control: "bulk.viewport.capture.response",
      version: 1,
      id: "capture-1",
      result: {ok: false, error: {code: "capture_unavailable", message: "unsupported"}},
      parts: [{part: "inflaton", op: "add", by: "dark", ts: 1}],
    }

    expect(routeBulkBrowserPayload(payload, {
      consumeControl(value) {
        controls.push(value)
        return true
      },
      onImpulse(message) {
        impulses.push(message)
      },
    })).toBe("control")
    expect(controls).toEqual([payload])
    expect(impulses).toEqual([])
  })

  test("routes one valid ordinary Force message and rejects other JSON", () => {
    const impulses: ForceMessage[] = []
    const force: ForceMessage = {
      parts: [{part: "photon", op: "replace", path: 1, by: "bulk", ts: 42}],
    }
    const handlers = {
      consumeControl: () => false,
      onImpulse: (message: ForceMessage) => impulses.push(message),
    }

    expect(routeBulkBrowserPayload(force, handlers)).toBe("force")
    expect(routeBulkBrowserPayload({control: "unknown"}, handlers)).toBe("invalid")
    expect(routeBulkBrowserPayload({parts: []}, handlers)).toBe("invalid")
    expect(impulses).toEqual([force])
  })
})
