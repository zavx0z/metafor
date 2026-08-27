import {describe, expect, test} from "bun:test"
import {shouldContinueBulkRenderLoop} from "./render-loop.ts"

describe("Bulk render loop gate", () => {
  test("stops after the DOM overlay and scene become idle", () => {
    expect(shouldContinueBulkRenderLoop({
      navigationActive: false,
      pendingMotion: false,
      timestamp: 100,
      wakeUntilMs: 100,
    })).toBe(false)
  })

  test("continues only for declared motion or a bounded wake window", () => {
    expect(shouldContinueBulkRenderLoop({
      navigationActive: false,
      pendingMotion: false,
      timestamp: 99,
      wakeUntilMs: 100,
    })).toBe(true)
    expect(shouldContinueBulkRenderLoop({
      navigationActive: true,
      pendingMotion: false,
      timestamp: 100,
      wakeUntilMs: 100,
    })).toBe(true)
  })
})
